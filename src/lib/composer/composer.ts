/**
 * Composer core — turn a creative brief into an original, realized Track.
 *
 * Pipeline (all deterministic on `brief.seed`):
 *   1. Resolve style lexicon, key (pc+major), tempo, loop length (bars).
 *   2. Generate a chord sequence (one chord per bar) using the lexicon's
 *      root-motion + quality vocabulary (style DNA) — biased toward the tonic
 *      at the loop head and resolving to the tonic at the loop tail so the
 *      loop closes musically.
 *   3. Realize sounding notes: chord voicings (keys), bass line, a 16-step
 *      groove (drums), and a sparse top hook (lead) — all as NoteEvents on a
 *      shared PPQ=480 timeline.
 *
 * The realized Track is the single source both encoders (.mid, SoundLab .seq)
 * consume, so MIDI and grid stay consistent. Nothing here reads the network.
 */

import type { ArrSection, Chord, ComposeBrief, NoteEvent, StyleId, Track } from './types.js';
import { createRng, pickWeighted } from './types.js';
import { getLexicon, GROOVES, type StyleLexicon } from './lexicons.js';
import { PPQ, CHORD_TONES, voiceMuChord, voiceRootless, DOMINANT_QUALITIES, bassMidi, chordTonesMidi } from './theory.js';

const VALID_BARS = [4, 8, 16];

function resolveBrief(brief: ComposeBrief): Required<Pick<ComposeBrief, 'seed' | 'bars' | 'key' | 'major' | 'bpm'>> {
  const lx = getLexicon(brief.style);
  const seed = brief.seed ?? Math.floor(Math.random() * 0x7fffffff);
  const rng = createRng(seed);
  let key: number;
  let major: boolean;
  if (typeof brief.key === 'number') {
    // Key given: honor it. Color comes from the style's entry for that tonic
    // (or major) — do NOT discard the requested key.
    key = brief.key;
    major = typeof brief.major === 'boolean' ? brief.major : lx.keys.find((k) => k.pc === key)?.major ?? true;
  } else if (typeof brief.major === 'boolean') {
    // Color given, key not: pick a weighted tonic of that color.
    major = brief.major;
    const pool = lx.keys.filter((k) => k.major === major);
    key = (pool.length ? pickWeighted(rng, pool) : pickWeighted(rng, lx.keys)).pc;
  } else {
    const pick = pickWeighted(rng, lx.keys);
    key = pick.pc;
    major = pick.major;
  }
  const bars = VALID_BARS.includes(brief.bars as number) ? (brief.bars as number) : 8;
  const bpm = brief.bpm && brief.bpm > 0 ? Math.round(brief.bpm) : Math.round(lx.bpm[0] + rng() * (lx.bpm[1] - lx.bpm[0]));
  return { seed, bars, key, major, bpm };
}

/** Pick the next root pc given the current root and lexicon root-motion. */
function nextRoot(lx: StyleLexicon, rng: () => number, prevPc: number): number {
  const step = pickWeighted(rng, lx.rootSteps).step;
  return (((prevPc + step) % 12) + 12) % 12;
}

function pickQuality(lx: StyleLexicon, rng: () => number): import('./types.js').ChordQuality {
  return pickWeighted(rng, lx.qualityWeights).q;
}

/** Generate `bars` chords following the style's harmony DNA. When `close` is
 *  true (looping mode) the final bar resolves back to the tonic so the loop
 *  repeats; `close:false` (open bridge / arrangement sections) keeps the arc. */
function generateChords(lx: StyleLexicon, rng: () => number, tonicPc: number, bars: number, close = true): Chord[] {
  // Static-vamp styles hold the tonic color most of the loop (D'Angelo/psych).
  const staticChance = lx.signature.staticVampChance ?? 0;
  const chords: Chord[] = [];
  if (rng() < staticChance) {
    const q = pickQuality(lx, rng);
    const qBias = lx.rootSteps.find((s) => s.step === 0)?.w ?? 0;
    for (let i = 0; i < bars; i++) {
      // Mostly static tonic with an occasional modal neighbor return.
      const drift = rng() < qBias / (qBias + 2) ? 0 : -2;
      chords.push({ rootPc: (((tonicPc + drift) % 12) + 12) % 12, quality: i === bars - 1 ? q : pickQuality(lx, rng) });
    }
    if (close) chords[bars - 1] = { rootPc: tonicPc, quality: q };
    return chords;
  }

  // Prefer a style archetype as the head of the loop, then free root-motion.
  const archetype = lx.archetypes.length ? lx.archetypes[Math.floor(rng() * lx.archetypes.length)] : null;
  let prevPc = tonicPc;
  for (let i = 0; i < bars; i++) {
    if (archetype && i < archetype.length && rng() < 0.7) {
      const step = archetype[i];
      const rootPc = (((tonicPc + step.off) % 12) + 12) % 12;
      chords.push({ rootPc, quality: step.q });
      prevPc = rootPc;
    } else {
      // holdBarChance: prolong the previous chord instead of moving (the style
      // DNA declares how often a bar holds). Never holds the closing bar so the
      // loop still resolves to the tonic.
      const holdChance = lx.signature.holdBarChance ?? 0;
      if (i > 0 && i < bars - 1 && holdChance > 0 && rng() < holdChance) {
        chords.push({ rootPc: chords[i - 1].rootPc, quality: chords[i - 1].quality });
        prevPc = chords[i - 1].rootPc;
      } else {
        const rootPc = nextRoot(lx, rng, prevPc);
        chords.push({ rootPc, quality: pickQuality(lx, rng) });
        prevPc = rootPc;
      }
    }
  }
  // Loop closure: final bar resolves back to the tonic to make the loop repeat.
  if (close) chords[bars - 1] = { rootPc: tonicPc, quality: pickQuality(lx, rng) };
  return chords;
}

interface RealizeCtx {
  lx: StyleLexicon;
  rng: () => number;
  bpm: number;
  bars: number;
  events: NoteEvent[];
}

const BAR_TICKS = 4 * PPQ; // 4/4
const STEP = PPQ / 4; // 16th

function clampVel(v: number): number {
  return Math.max(1, Math.min(127, Math.round(v)));
}

// ---------------------------------------------------------------------------
// VOICE-LEADING (DP) — choose one voicing per bar so the WHOLE progression moves
// smoothly. This is the method the field uses (music21 VoiceLeadingQuartet; cf.
// soundlab's voicingCost): enumerate candidate voicings per chord, then run a
// Viterbi shortest-path over them scored by minimal-assignment voice motion plus
// a small central-register penalty. Common tones are retained automatically
// (assignment distance 0), which is exactly what a nearest-note replacer cannot
// do. Style-aware: rootless dominants (Steely) keep the root out of the keys.
// ---------------------------------------------------------------------------

const VL_VOICES = 4;

/** Absolute pitch-class set for a chord's keys voicing (root-transposed;
 *  rootless for steely dominants so the root stays in the bass). */
function voiceTonePcs(ch: Chord, lx: StyleLexicon): number[] {
  let tones = CHORD_TONES[ch.quality];
  if (lx.voicer === 'steely' && DOMINANT_QUALITIES.has(ch.quality)) tones = tones.filter((t) => t % 12 !== 0);
  return [...new Set(tones.map((t) => (((ch.rootPc + t) % 12) + 12) % 12))];
}

/** Smallest pitch in [lo,hi] of a pc nearest an anchor (octave-aligned). */
function nearestPitch(pc: number, anchor: number, lo: number, hi: number): number {
  const pcMod = ((pc % 12) + 12) % 12;
  const oct = Math.round((anchor - pcMod) / 12);
  let best = pcMod + oct * 12;
  if (best < lo) best += 12;
  if (best > hi) best -= 12;
  return Math.max(lo, Math.min(hi, best));
}

/** All distinct octave-raised variants of a voicing that stay within [lo,hi].
 *  V ≤ 4 notes, so this is bounded (≤ 2^V candidates). */
function octaveVariants(base: number[], lo: number, hi: number): number[][] {
  const seen = new Set<string>();
  const work: number[][] = [];
  const push = (arr: number[]) => {
    const key = arr.join(',');
    if (!seen.has(key)) {
      seen.add(key);
      work.push(arr);
    }
  };
  push([...base].sort((a, b) => a - b));
  for (let i = 0; i < work.length; i++) {
    const v = work[i];
    for (let k = 0; k < v.length; k++) {
      if (v[k] + 12 <= hi) {
        const raised = v.slice();
        raised[k] += 12;
        raised.sort((a, b) => a - b);
        push(raised);
      }
    }
  }
  return work;
}

/** Deterministic candidate voicings for one chord (state-independent, so DP is
 *  a clean shortest path). V notes near a central register, plus octave variants. */
function voicingCandidates(ch: Chord, lx: StyleLexicon): number[][] {
  const lo = lx.voicing.lo;
  const hi = lx.voicing.hi;
  const center = (lo + hi) / 2;

  // Steely Dan DNA: the mu(add2) adjacency rule and rootless altered dominants
  // are the style's identifying voicings. Apply them directly (the DP then picks
  // among real mu/rootless candidates) instead of a generic spread.
  if (lx.voicer === 'steely') {
    if (ch.quality === 'mu') {
      const mu = voiceMuChord(ch.rootPc, lo, hi);
      if (mu.length >= 3) return [mu];
    } else if (DOMINANT_QUALITIES.has(ch.quality)) {
      const rootless = voiceRootless(ch.rootPc, ch.quality, lo, hi);
      if (rootless.length >= 3) return octaveVariants(rootless, lo, hi);
    }
  }

  const pcs = voiceTonePcs(ch, lx);
  // Keep at most VL_VOICES pcs, dropping extremes if the chord is very dense.
  let usePcs = pcs;
  if (pcs.length > VL_VOICES) {
    usePcs = [...pcs].sort((a, b) => Math.abs(nearestPitch(a, center, lo, hi) - center) - Math.abs(nearestPitch(b, center, lo, hi) - center)).slice(0, VL_VOICES);
    usePcs.sort((a, b) => a - b);
  }
  const voices = Math.max(3, Math.min(usePcs.length, VL_VOICES));
  const basePcs = usePcs.slice(0, voices).sort((a, b) => a - b);
  const baseNotes = basePcs.map((pc) => nearestPitch(pc, center, lo, hi));
  return octaveVariants(baseNotes, lo, hi);
}

/** Minimal-assignment distance between two sorted voicings (voice motion). */
function assignCost(a: number[], b: number[]): number {
  if (a.length !== b.length) return Math.abs(a.length - b.length) * 12;
  // V <= 4: exact assignment via permutation search is fine.
  const idx = a.map((_, i) => i);
  let best = Infinity;
  const perm = (chosen: number[], used: boolean[]) => {
    if (chosen.length === b.length) {
      let s = 0;
      for (let i = 0; i < chosen.length; i++) s += Math.abs(a[i] - b[chosen[i]]);
      best = Math.min(best, s);
      return;
    }
    for (let j = 0; j < b.length; j++) {
      if (used[j]) continue;
      used[j] = true;
      chosen.push(j);
      perm(chosen, used);
      chosen.pop();
      used[j] = false;
    }
  };
  void idx;
  perm([], Array.from({ length: b.length }, () => false));
  return best;
}

/** Register penalty: keep a voicing's mean near the band center. */
function regCost(v: number[], lx: StyleLexicon): number {
  const center = (lx.voicing.lo + lx.voicing.hi) / 2;
  const mean = v.reduce((s, n) => s + n, 0) / v.length;
  return Math.abs(mean - center) * 0.4;
}

/** Pick a smooth voicing per bar via Viterbi over candidate voicings. */
function chooseVoicings(chords: Chord[], lx: StyleLexicon): number[][] {
  const nodes = chords.map((c) => voicingCandidates(c, lx));
  const nBars = chords.length;
  const cost: number[][] = [];
  const prev: number[][] = [];
  for (let i = 0; i < nBars; i++) {
    cost.push(Array.from({ length: nodes[i].length }, () => Infinity));
    prev.push(Array.from({ length: nodes[i].length }, () => -1));
  }
  nodes[0].forEach((v, j) => { cost[0][j] = regCost(v, lx); });
  for (let i = 1; i < nBars; i++) {
    for (let k = 0; k < nodes[i].length; k++) {
      const node = nodes[i][k];
      const enter = regCost(node, lx);
      let bestJ = 0;
      let bestC = Infinity;
      for (let j = 0; j < nodes[i - 1].length; j++) {
        const c = cost[i - 1][j] + assignCost(nodes[i - 1][j], node);
        if (c < bestC) { bestC = c; bestJ = j; }
      }
      cost[i][k] = bestC + enter;
      prev[i][k] = bestJ;
    }
  }
  // Backtrack from cheapest final node.
  let bestK = 0;
  let bestEnd = Infinity;
  cost[nBars - 1].forEach((c, k) => { if (c < bestEnd) { bestEnd = c; bestK = k; } });
  const path: number[] = Array.from({ length: nBars }, () => 0);
  path[nBars - 1] = bestK;
  for (let i = nBars - 1; i > 0; i--) path[i - 1] = prev[i][path[i]];
  return path.map((k, i) => nodes[i][k]);
}

function realize(brief: ComposeBrief, res: { seed: number; bars: number; key: number; major: boolean; bpm: number }, chords: Chord[]): Track {
  const lx = getLexicon(brief.style);
  const rng = createRng(res.seed ^ 0x9e3779b9);
  const ctx: RealizeCtx = { lx, rng, bpm: res.bpm, bars: res.bars, events: [] };
  const voic = lx.voicing;
  const groove = GROOVES[brief.style];
  const barVoicings = chooseVoicings(chords, lx);

  for (let i = 0; i < res.bars; i++) {
    const ch = chords[i];
    const start = i * BAR_TICKS;
    const barLen = BAR_TICKS;

    // --- Keys: the DP-chosen voicing for this bar, held ~90% of the bar. The
    // voicing is a global smooth path over the whole progression (voice-leading).
    const voicingNotes = barVoicings[i];
    for (const midi of voicingNotes) {
      ctx.events.push({ tick: start, dur: Math.round(barLen * 0.92), pitch: midi, velocity: 74, part: 'keys' });
    }

    // --- Bass: root on beat 1 (whole) plus a syncopated root/fifth eighth pulse
    // for the driving styles.
    const bRoot = bassMidi(ch.rootPc, lx.bassOctave);
    ctx.events.push({ tick: start, dur: Math.round(barLen * 0.9), pitch: bRoot, velocity: 88, part: 'bass' });
    const pulses = [2, 6, 10, 14]; // 16th pulses at eighth/off-eighth feel
    for (const p of pulses) {
      if (ctx.rng() < 0.5) {
        const fifth = p % 4 === 0 ? 7 : 0;
        ctx.events.push({ tick: start + p * STEP, dur: Math.round(STEP * 1.5), pitch: bRoot + fifth, velocity: 72, part: 'bass' });
      }
    }

    // --- Drums: 16-step groove per bar (GM notes).
    const gm = { kick: 36, snare: 38, hat: 42 };
    const density = lx.signature.drumDensity ?? 0.5;
    groove.kick.forEach((on, s) => { if (on && ctx.rng() < density + 0.3) ctx.events.push({ tick: start + s * STEP, dur: STEP, pitch: gm.kick, velocity: 96, part: 'drums', drum: gm.kick }); });
    groove.snare.forEach((on, s) => { if (on && ctx.rng() < density + 0.3) ctx.events.push({ tick: start + s * STEP, dur: STEP, pitch: gm.snare, velocity: 92, part: 'drums', drum: gm.snare }); });
    groove.hat.forEach((on, s) => { if (on && ctx.rng() < density + 0.2) ctx.events.push({ tick: start + s * STEP, dur: Math.round(STEP * 0.9), pitch: s % 4 === 2 ? 46 : gm.hat, velocity: 60, part: 'drums', drum: gm.hat }); });

    // --- Lead hook: a light motif drawn from the chord tones, sparse.
    if (i % 2 === 0 && ctx.rng() < 0.7) {
      const tones = chordTonesMidi(ch.rootPc, ch.quality, 5);
      const note = tones[Math.floor(ctx.rng() * tones.length)] + (ctx.rng() < 0.2 ? 12 : 0);
      ctx.events.push({ tick: start + Math.round(ctx.rng() * 3) * STEP, dur: Math.round(STEP * (3 + ctx.rng() * 6)), pitch: note, velocity: 86, part: 'lead' });
    }

    // --- Style signature color parts (loop nuances).
    const nu = lx.nuance;
    // Steely-Dan written-chart horn stabs on the chord color.
    if (nu?.horns) {
      const tones = chordTonesMidi(ch.rootPc, ch.quality, Math.max(4, Math.floor(voic.hi / 12)));
      const hiTones = tones.filter((t) => t >= voic.hi - 6 && t <= voic.hi + 12);
      const pool = hiTones.length ? hiTones : tones.slice(-2);
      if (pool.length && ctx.rng() < 0.6) {
        const stabStep = ctx.rng() < 0.5 ? 6 : 14;
        const n = 1 + Math.floor(ctx.rng() * 2);
        for (let k = 0; k < n; k++) {
          const p = pool[Math.floor(ctx.rng() * pool.length)];
          ctx.events.push({ tick: start + stabStep * STEP, dur: Math.round(STEP * (1 + ctx.rng() * 1.5)), pitch: p, velocity: 64, part: 'horns' });
        }
      }
    }
    // Stacked background-vocal accent in chorus-y bars.
    if (nu?.bgvox && i % 4 >= 2 && ctx.rng() < 0.6) {
      const t5 = chordTonesMidi(ch.rootPc, ch.quality, 5);
      const picks = [0, t5.length > 1 ? 2 : 0];
      const acc = ctx.rng() < 0.5 ? 0 : 8;
      for (const idx of picks.slice(0, 2)) {
        const p = t5[idx] ?? t5[0];
        ctx.events.push({ tick: start + acc * STEP, dur: Math.round(STEP * 2), pitch: p, velocity: 52, part: 'bgvox' });
      }
    }
    // Sustained string/pad wash doubling the harmony (Jasper/lush).
    if (nu?.strings && voicingNotes.length) {
      for (const m of voicingNotes.map((n) => n + 12).filter((n) => n <= 110)) {
        ctx.events.push({ tick: start, dur: Math.round(barLen * 0.95), pitch: m, velocity: 44, part: 'strings' });
      }
    }
  }

  // --- Laid-back timing ("behind-the-beat" pocket) + dynamic swell (post-pass).
  // Instruments sit behind the grid (D'Angelo); drums stay tight; velocities
  // crescendo across the loop (D'Angelo climax / Airplane build-and-release).
  const nu2 = lx.nuance;
  const total = ctx.bars * BAR_TICKS;
  if (nu2?.behindBeat) {
    const nudge = Math.round(nu2.behindBeat * STEP);
    for (const ev of ctx.events) {
      if (ev.part === 'drums') continue;
      if (ev.tick + nudge + ev.dur <= total && ev.tick + nudge >= 0) ev.tick += nudge;
    }
  }
  if (nu2?.dynamics) {
    const denom = Math.max(1, ctx.bars - 1);
    for (const ev of ctx.events) {
      if (ev.part === 'drums') continue;
      const barNo = Math.min(ctx.bars - 1, Math.floor(ev.tick / BAR_TICKS));
      const ramp = 0.62 + nu2.dynamics * 0.5 * (barNo / denom);
      const boost = barNo === ctx.bars - 1 ? 0.08 : 0; // final-bar swell
      ev.velocity = clampVel(ev.velocity * (ramp + boost));
    }
  }

  ctx.events.sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
  return {
    style: brief.style,
    key: res.key,
    major: res.major,
    bpm: res.bpm,
    bars: res.bars,
    seed: res.seed,
    title: brief.title || `${brief.style} ${res.bars}bar`,
    chords,
    events: ctx.events,
    brief,
  };
}

/** Compose a track deterministically from a brief. `opts.lexicon` lets a learner
 *  overlay an adjusted lexicon (learned biases) on the base style for the harmony
 *  pass. */
export function compose(brief: ComposeBrief, opts: { lexicon?: import('./lexicons.js').StyleLexicon } = {}): Track {
  const res = resolveBrief(brief);
  const lx = opts.lexicon ?? getLexicon(brief.style);
  const chords = generateChords(lx, createRng(res.seed ^ 0x51ed), res.key, res.bars);
  return realize(brief, res, chords);
}

export function listStyles(): StyleId[] {
  return Object.keys(GROOVES) as StyleId[];
}

// ---------------------------------------------------------------------------
// ARRANGEMENT MODE (`arr:`) — a non-looping, written-out arc.
// Realizes the signature devices that CANNOT live in a self-closing loop:
//   intro vamp -> A -> bridge (with NEW changes for the SD "written charts"
//   trait) -> final chorus (with the jasper whole-step key lift) -> outro vamp.
// Output is a linear Track (mode:'arr', sections recorded). Encoded as .mid;
// SoundLab's .seq cannot hold a multi-bar progression, so arr mode is .mid-only.
// ---------------------------------------------------------------------------

function staticChords(lx: StyleLexicon, rng: () => number, tonicPc: number, bars: number): Chord[] {
  const q = pickQuality(lx, rng);
  const out: Chord[] = [];
  for (let i = 0; i < bars; i++) out.push({ rootPc: tonicPc, quality: q });
  return out;
}

type SectionKind = 'vamp' | 'closed' | 'open';
interface LayoutSection { name: string; kind: SectionKind; bars: number }

/** Written-out arc for each supported length. `brief.bars` is honored; when it
 *  isn't a supported value the full 16-bar arrangement is used. */
const ARRANGEMENT_LAYOUTS: Record<number, LayoutSection[]> = {
  4: [
    { name: 'intro', kind: 'vamp', bars: 1 },
    { name: 'A', kind: 'closed', bars: 1 },
    { name: 'bridge', kind: 'open', bars: 1 },
    { name: 'final', kind: 'closed', bars: 1 },
  ],
  8: [
    { name: 'intro', kind: 'vamp', bars: 1 },
    { name: 'A', kind: 'closed', bars: 2 },
    { name: 'bridge', kind: 'open', bars: 2 },
    { name: 'final', kind: 'closed', bars: 2 },
    { name: 'outro', kind: 'vamp', bars: 1 },
  ],
  16: [
    { name: 'intro', kind: 'vamp', bars: 2 },
    { name: 'A', kind: 'closed', bars: 4 },
    { name: 'bridge', kind: 'open', bars: 4 }, // open => new changes, no tonic close
    { name: 'final', kind: 'closed', bars: 4 },
    { name: 'outro', kind: 'vamp', bars: 2 },
  ],
};

export function composeArrangement(brief: ComposeBrief): Track {
  const res = resolveBrief(brief);
  const lx = getLexicon(brief.style);
  const tonic = res.key;
  const total = VALID_BARS.includes(brief.bars as number) ? (brief.bars as number) : 16;
  const layout = ARRANGEMENT_LAYOUTS[total];
  const chords: Chord[] = [];
  const sections: ArrSection[] = [];
  let at = 0;
  layout.forEach((sec, idx) => {
    const rng = createRng(res.seed ^ (0x51ed + idx * 0x2c1));
    const ch = sec.kind === 'vamp'
      ? staticChords(lx, rng, tonic, sec.bars)
      : generateChords(lx, rng, tonic, sec.bars, sec.kind === 'closed');
    sections.push({ name: sec.name, startBar: at, bars: sec.bars });
    chords.push(...ch);
    at += sec.bars;
  });

  // Signature device: jasper final-chorus whole-step key lift.
  const lift = lx.signature.finalKeyLift;
  if (lift) {
    const finalSec = sections.find((s) => s.name === 'final');
    if (finalSec) {
      for (let i = finalSec.startBar; i < finalSec.startBar + finalSec.bars; i++) {
        chords[i] = { ...chords[i], rootPc: (chords[i].rootPc + lift) % 12 };
      }
      finalSec.lift = lift;
    }
  }

  const realizedBars = chords.length;
  const track = realize(
    { style: brief.style, seed: res.seed, bars: realizedBars, key: res.key, major: res.major, bpm: res.bpm, title: brief.title || `${brief.style} arrangement` } as ComposeBrief,
    { ...res, bars: realizedBars },
    chords,
  );
  track.sections = sections;
  track.mode = 'arr';
  return track;
}
