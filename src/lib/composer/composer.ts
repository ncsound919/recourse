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

import type { Chord, ComposeBrief, NoteEvent, StyleId, Track } from './types.js';
import { createRng, pickWeighted } from './types.js';
import { getLexicon, GROOVES, type StyleLexicon } from './lexicons.js';
import { PPQ, voiceChord, voiceMuChord, voiceRootless, DOMINANT_QUALITIES, bassMidi, chordTonesMidi } from './theory.js';

const VALID_BARS = [4, 8, 16];

function resolveBrief(brief: ComposeBrief): Required<Pick<ComposeBrief, 'seed' | 'bars' | 'key' | 'major' | 'bpm'>> {
  const lx = getLexicon(brief.style);
  const seed = brief.seed ?? Math.floor(Math.random() * 0x7fffffff);
  const rng = createRng(seed);
  let key = brief.key;
  let major = brief.major;
  if (typeof key !== 'number' || typeof major !== 'boolean') {
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

/** Generate `bars` chords following the style's harmony DNA, loop-closed. */
function generateChords(lx: StyleLexicon, rng: () => number, tonicPc: number, bars: number): Chord[] {
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
    chords[bars - 1] = { rootPc: tonicPc, quality: q };
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
      const rootPc = nextRoot(lx, rng, prevPc);
      chords.push({ rootPc, quality: pickQuality(lx, rng) });
      prevPc = rootPc;
    }
  }
  // Loop closure: final bar resolves back to the tonic to make the loop repeat.
  chords[bars - 1] = { rootPc: tonicPc, quality: pickQuality(lx, rng) };
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

/** Choose the voicing engine for a chord based on the style's voicer. Steely
 *  uses the mu-adjacency rule and rootless dominants; other styles use spread. */
function voiceKeys(ch: Chord, lo: number, hi: number, n: number, voicer?: string): number[] {
  if (voicer === 'steely') {
    if (ch.quality === 'mu') return voiceMuChord(ch.rootPc, lo, hi);
    if (DOMINANT_QUALITIES.has(ch.quality)) return voiceRootless(ch.rootPc, ch.quality, lo, hi);
  }
  return voiceChord(ch.rootPc, ch.quality, lo, hi, n);
}

function realize(brief: ComposeBrief, res: { seed: number; bars: number; key: number; major: boolean; bpm: number }, chords: Chord[]): Track {
  const lx = getLexicon(brief.style);
  const rng = createRng(res.seed ^ 0x9e3779b9);
  const ctx: RealizeCtx = { lx, rng, bpm: res.bpm, bars: res.bars, events: [] };
  const voic = lx.voicing;
  const groove = GROOVES[brief.style];

  for (let i = 0; i < res.bars; i++) {
    const ch = chords[i];
    const start = i * BAR_TICKS;
    const barLen = BAR_TICKS;

    // --- Keys: spread voicing held ~90% of the bar; a lighter re-voice on beat
    // 3 gives inner motion without a new chord (a Steely-Dan trait).
    const voicingNotes = voiceKeys(ch, voic.lo, voic.hi, voic.n, lx.voicer);
    for (const midi of voicingNotes) {
      ctx.events.push({ tick: start, dur: Math.round(barLen * 0.92), pitch: midi, velocity: 74, part: 'keys' });
    }
    if (ctx.rng() < 0.45 && voicingNotes.length) {
      const re = voiceKeys(ch, voic.lo - 6, voic.hi + 3, voic.n, lx.voicer);
      for (const midi of re) {
        ctx.events.push({ tick: start + Math.round(barLen / 2), dur: Math.round(barLen * 0.4), pitch: midi, velocity: 60, part: 'keys' });
      }
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
