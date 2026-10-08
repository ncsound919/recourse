/**
 * theoryComparison.ts — a UNIFIED, engine-agnostic theory grader for a
 * progression "run", with a real statistical comparison to a random baseline and
 * to the previous run.
 *
 * Two engines feed it through one normalised shape:
 *   - ChordStudio's C++ engine (via `.progression` exports) — adaptor
 *     `fromChordStudioProgression`.
 *   - Recourse's in-repo TS composer (`compose()`) — adaptor `fromComposerTrack`.
 *
 * WHAT IT GRADES (theory only, all computed from chord roots + voicings):
 *   voiceLeading, functionalMotion, closure, variety, register. It does NOT
 *   grade taste or timbre. Every number is real math on the input, deterministic
 *   (seeded RNG, no Math.random).
 *
 * THE COMPARISON IS THE POINT. A run's raw grade is meaningless alone; the
 * `gradeRun` result carries the mean difference vs a uniform-random baseline
 * with a bootstrap 95% CI and a one-sided p-value, so "better" is a claim you
 * can defend — plus the delta vs the previous run of the same source.
 */
import { CHORD_TONES } from './composer/theory.js';
import type { ChordQuality } from './composer/types.js';
import type { ChordStudioProgression } from './chordStudioSource.js';

export type ProgressionSource = 'chordstudio' | 'composer' | 'random';

export interface TheoryChord {
  rootPc: number;
  quality: string;
  notes: number[];
  bass?: number;
  /** Original chord symbol, when the source has one (used to bucket quality). */
  name?: string;
}

export interface TheoryProgression {
  id: string;
  source: ProgressionSource;
  chords: TheoryChord[];
  keyPc?: number;
  bars?: number;
}

export interface TheoryMetric {
  key: string;
  label: string;
  value: number; // 0..1
  detail: string;
}

/** Metric weights (sum to 1). Theory only; certificates are not included. */
export const THEORY_WEIGHTS: Record<string, number> = {
  voiceLeading: 0.3,
  functionalMotion: 0.25,
  closure: 0.15,
  variety: 0.15,
  register: 0.15,
};

/** Root moves considered core functional motion (fifths + steps). Tritones and
 *  chromatic thirds are NOT counted, which is what separates a real progression
 *  from a random walk. */
const COMMON_FUNCTIONAL = new Set([-5, 5, -2, 2, -1, 1]);

const NOTE_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Parse "C", "C#", "Db", "G" -> pitch class. Returns undefined when unknown. */
export function pcFromNoteName(name: string | undefined): number | undefined {
  if (!name) return undefined;
  const m = /^([A-Ga-g])([#b]?)/.exec(name.trim());
  if (!m) return undefined;
  let pc = NOTE_PC[m[1].toUpperCase()];
  if (m[2] === '#') pc = (pc + 1) % 12;
  if (m[2] === 'b') pc = (pc + 11) % 12;
  return pc;
}

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function normMove(d: number): number {
  let x = ((d % 12) + 12) % 12;
  if (x > 6) x -= 12;
  return x;
}

// ---------------------------------------------------------------------------
// metrics
// ---------------------------------------------------------------------------

export function theoryMetrics(p: TheoryProgression): TheoryMetric[] {
  const chords = p.chords;
  const n = chords.length;

  // Voice leading: mean, over consecutive chords, of the sorted-voice distance.
  let leapSum = 0;
  let leapN = 0;
  for (let i = 1; i < n; i++) {
    const a = [...(chords[i - 1].notes ?? [])].sort((x, y) => x - y);
    const b = [...(chords[i].notes ?? [])].sort((x, y) => x - y);
    const len = Math.min(a.length, b.length);
    if (len === 0) continue;
    let s = 0;
    for (let v = 0; v < len; v++) s += Math.abs(a[v] - b[v]);
    leapSum += s / len;
    leapN++;
  }
  const avgLeap = leapN ? leapSum / leapN : 0;
  const voiceLeading = clamp01(1 - avgLeap / 7);

  // Functional motion: share of root moves in the core functional vocabulary.
  const moves: number[] = [];
  for (let i = 1; i < n; i++) moves.push(normMove(chords[i].rootPc - chords[i - 1].rootPc));
  const funcShare = moves.length ? moves.filter((m) => COMMON_FUNCTIONAL.has(m)).length / moves.length : 1;

  // Closure: resolves to the tonic (only when a key is known).
  const lastPc = n ? chords[n - 1].rootPc : undefined;
  const closure = p.keyPc === undefined || lastPc === undefined ? 1 : lastPc === p.keyPc ? 1 : 0;

  // Variety: distinct chord identities, bounded so a 2-chord vamp doesn't score
  // as rich as an 8-chord progression.
  const distinct = new Set(chords.map((c) => `${c.rootPc}:${c.quality}`)).size;
  const variety = n ? clamp01(distinct / Math.min(5, n)) : 0;

  // Register: chords sit in a playable band with no excessive internal gap.
  let ok = 0;
  let counted = 0;
  for (const c of chords) {
    if (!c.notes.length) continue;
    counted++;
    const lo = Math.min(...c.notes);
    const hi = Math.max(...c.notes);
    if (lo >= 41 && hi <= 88 && hi - lo <= 24) ok++;
  }
  const register = counted ? ok / counted : 1;

  return [
    { key: 'voiceLeading', label: 'Voice-leading smoothness', value: clamp01(voiceLeading), detail: `avg ${avgLeap.toFixed(2)} semitones between chords` },
    { key: 'functionalMotion', label: 'Functional root motion', value: clamp01(funcShare), detail: `${(funcShare * 100).toFixed(0)}% of root moves in the fifths/step vocabulary` },
    { key: 'closure', label: 'Loop closure (resolves to tonic)', value: closure, detail: p.keyPc === undefined ? 'no key given' : `final rootPc=${lastPc} tonic=${p.keyPc}` },
    { key: 'variety', label: 'Harmonic variety', value: clamp01(variety), detail: `${distinct} distinct chords / ${n}` },
    { key: 'register', label: 'Register & spacing', value: clamp01(register), detail: `${ok}/${counted} chords in [41,88] with ≤24st span` },
  ];
}

export function theoryScore(p: TheoryProgression): number {
  const m = theoryMetrics(p);
  let s = 0;
  for (const x of m) s += (THEORY_WEIGHTS[x.key] ?? 0) * x.value;
  return clamp01(s);
}

export function gradeLetter(score: number): string {
  if (score >= 0.85) return 'A';
  if (score >= 0.7) return 'B';
  if (score >= 0.55) return 'C';
  if (score >= 0.4) return 'D';
  return 'F';
}

// ---------------------------------------------------------------------------
// random baseline
// ---------------------------------------------------------------------------

const QUALITY_POOL: ChordQuality[] = ['maj', 'min', 'maj7', 'm7', '7', 'dim7', 'sus'];

/** A uniform-random progression: random roots and qualities, voiced in a random
 *  octave. This is the null the run must beat. */
export function randomTheoryProgression(rng: () => number, bars: number): TheoryProgression {
  const chords: TheoryChord[] = [];
  for (let i = 0; i < Math.max(1, bars); i++) {
    const rootPc = Math.floor(rng() * 12);
    const quality = QUALITY_POOL[Math.floor(rng() * QUALITY_POOL.length)];
    const octave = 48 + Math.floor(rng() * 24);
    const tones = CHORD_TONES[quality] ?? [0, 4, 7];
    const notes = tones.map((t) => octave + rootPc + t).filter((x) => x >= 0 && x <= 127);
    chords.push({ rootPc, quality, notes });
  }
  return { id: `rand-${Math.floor(rng() * 1e9)}`, source: 'random', chords, bars };
}

// ---------------------------------------------------------------------------
// exploration: novelty vs a reference corpus, and emergent "feels"
// ---------------------------------------------------------------------------

/**
 * How much a coherent-but-novel progression may out-score a conventional one.
 * grade = conformance * (1 + EXPLORATION_WEIGHT * novelty). Novelty is GATED by
 * conformance, so incoherent noise (which is maximally novel) cannot win — but a
 * coherent progression that leaves the known styles gets credited for it. This is
 * what keeps exploration on the table instead of converging on safe convention.
 */
export const EXPLORATION_WEIGHT = 0.35;

const QUALITY_VOCAB = ['maj', 'min', 'maj7', 'm7', '7', 'dim7', 'sus', 'aug', 'm9', '9', '13', 'other'];

/** Coarse quality bucket: the composer's declared quality, else derived from the
 *  chord symbol (ChordStudio exports names, not qualities). */
export function chordQualityKey(c: TheoryChord): string {
  if (c.quality && QUALITY_VOCAB.includes(c.quality)) return c.quality;
  const n = c.name ?? '';
  if (/dim|ø/.test(n)) return 'dim7';
  if (/m7b5|ø/.test(n)) return 'm7';
  if (/maj7/.test(n)) return 'maj7';
  if (/m7/.test(n)) return 'm7';
  if (/m(?!aj)/.test(n.slice(1))) return 'min';
  if (/7/.test(n)) return '7';
  if (/maj|M/.test(n)) return 'maj';
  if (/sus/.test(n)) return 'sus';
  return 'other';
}

/** Fixed-length style signature: root-motion histogram (12) + quality histogram
 *  (|QUALITY_VOCAB|) + mean register + mean span. Deterministic. */
export function styleSignature(p: TheoryProgression): number[] {
  const motion = new Array(12).fill(0);
  for (let i = 1; i < p.chords.length; i++) {
    motion[((normMove(p.chords[i].rootPc - p.chords[i - 1].rootPc) % 12) + 12) % 12] += 1;
  }
  const mSum = motion.reduce((a, b) => a + b, 0) || 1;
  const q = new Array(QUALITY_VOCAB.length).fill(0);
  for (const c of p.chords) {
    const idx = QUALITY_VOCAB.indexOf(chordQualityKey(c));
    if (idx >= 0) q[idx] += 1;
  }
  const qSum = q.reduce((a, b) => a + b, 0) || 1;
  const all = p.chords.flatMap((c) => c.notes);
  const reg = all.length ? mean(all) / 127 : 0;
  const spans = p.chords.filter((c) => c.notes.length).map((c) => Math.max(...c.notes) - Math.min(...c.notes));
  return [...motion.map((x) => x / mSum), ...q.map((x) => x / qSum), reg, Math.min(1, mean(spans) / 24)];
}

function cosine(a: number[], b: number[]): number {
  let d = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    d += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}

/** 1 - best cosine similarity to any reference progression. 0 with no reference. */
export function novelty(p: TheoryProgression, reference: TheoryProgression[]): number {
  if (!reference.length) return 0;
  const s = styleSignature(p);
  let best = 0;
  for (const r of reference) best = Math.max(best, cosine(s, styleSignature(r)));
  return clamp01(1 - best);
}

export interface EmergentStyle {
  label: string;
  size: number;
  novelty: number;
  examples: string[];
}

function motionWord(p: TheoryProgression): string {
  const moves: number[] = [];
  for (let i = 1; i < p.chords.length; i++) moves.push(Math.abs(normMove(p.chords[i].rootPc - p.chords[i - 1].rootPc)));
  const m = mean(moves);
  if (m >= 5.5) return 'tritone';
  if (m >= 4.5) return 'fifth';
  if (m >= 2.5) return 'third';
  return 'step';
}

function registerWord(p: TheoryProgression): string {
  const all = p.chords.flatMap((c) => c.notes);
  const r = all.length ? mean(all) : 60;
  return r < 55 ? 'low' : r < 67 ? 'mid' : 'high';
}

/** A readable "feel" label for a cluster: dominant quality + motion + register. */
export function describeFeel(cluster: TheoryProgression[]): string {
  const counts: Record<string, number> = {};
  for (const p of cluster) for (const c of p.chords) counts[chordQualityKey(c)] = (counts[chordQualityKey(c)] ?? 0) + 1;
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'mixed';
  return `${dominant} · ${motionWord(cluster[0])}-moving · ${registerWord(cluster[0])} register`;
}

/** Coherent clusters in `run` whose style signature is far from the reference —
 *  candidate NEW styles/feels. Greedy single-link clustering; deterministic. */
export function emergentStyles(
  run: TheoryProgression[],
  reference: TheoryProgression[],
  opts: { similarity?: number; minSize?: number; noveltyFloor?: number } = {},
): EmergentStyle[] {
  const simThreshold = opts.similarity ?? 0.92;
  const minSize = opts.minSize ?? 2;
  const noveltyFloor = opts.noveltyFloor ?? 0.35;
  const sigs = run.map(styleSignature);
  const used = new Array(run.length).fill(false);
  const clusters: number[][] = [];
  for (let i = 0; i < run.length; i++) {
    if (used[i]) continue;
    const cluster = [i];
    used[i] = true;
    for (let j = i + 1; j < run.length; j++) {
      if (used[j]) continue;
      if (cosine(sigs[i], sigs[j]) >= simThreshold) {
        cluster.push(j);
        used[j] = true;
      }
    }
    clusters.push(cluster);
  }
  const out: EmergentStyle[] = [];
  for (const idxs of clusters) {
    if (idxs.length < minSize) continue;
    const members = idxs.map((k) => run[k]);
    const nov = mean(members.map((p) => novelty(p, reference)));
    if (nov < noveltyFloor) continue;
    out.push({ label: describeFeel(members), size: members.length, novelty: nov, examples: members.slice(0, 3).map((p) => p.id) });
  }
  // Merge clusters that share a feel label — the point is distinct feels, not
  // one row per greedy cluster.
  const byLabel = new Map<string, EmergentStyle>();
  for (const e of out) {
    const prev = byLabel.get(e.label);
    if (prev) {
      prev.size += e.size;
      prev.novelty = Math.max(prev.novelty, e.novelty);
      prev.examples = [...new Set([...prev.examples, ...e.examples])].slice(0, 3);
    } else {
      byLabel.set(e.label, { ...e, examples: [...e.examples] });
    }
  }
  return [...byLabel.values()].sort((a, b) => b.size - a.size || b.novelty - a.novelty);
}

/** A fixed, deterministic corpus of CONVENTIONAL progressions across all 12
 *  keys — the "known harmonic grammar" a run's novelty is measured against. */
export function conventionalReference(): TheoryProgression[] {
  const VOICING = [48, 52, 55, 59];
  const patterns: Array<{ roots: number[]; quals: ChordQuality[] }> = [
    { roots: [2, 7, 0, 0], quals: ['min', '7', 'maj7', 'maj7'] }, // ii-V-I
    { roots: [0, 9, 5, 7], quals: ['maj7', 'm7', 'maj7', '7'] }, // I-vi-IV-V
    { roots: [0, 7, 9, 5], quals: ['maj7', '7', 'm7', 'maj7'] }, // I-V-vi-IV
    { roots: [0, 5, 9, 7], quals: ['maj7', 'maj7', 'm7', '7'] }, // I-IV-vi-V
    { roots: [9, 2, 7, 0], quals: ['m7', 'min', '7', 'maj7'] }, // vi-ii-V-I
  ];
  const out: TheoryProgression[] = [];
  for (let key = 0; key < 12; key++) {
    for (const pat of patterns) {
      const chords: TheoryChord[] = pat.roots.map((r, i) => ({
        rootPc: (key + r) % 12,
        quality: pat.quals[i],
        notes: VOICING.map((v) => ((v + key + r) % 12) + 48),
      }));
      out.push({ id: `conv-${key}-${pat.roots.join('_')}`, source: 'random', chords, keyPc: key, bars: chords.length });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// run grading
// ---------------------------------------------------------------------------

export interface RunGrade {
  id: string;
  at: number;
  source: ProgressionSource | 'mixed';
  n: number;
  /** Blended grade = conformance boosted by coherence-gated novelty. */
  grade: number;
  letter: string;
  /** Pure theory conformance (the pre-exploration score). */
  conformance: number;
  /** Mean novelty vs the reference corpus (null when no reference was given). */
  novelty: number | null;
  /** Mean of novelty * conformance — novelty that is still musically coherent. */
  exploration: number | null;
  /** New styles/feels present in the run but not in the reference. */
  emergentStyles: EmergentStyle[];
  metrics: Record<string, number>; // mean per conformance metric
  baselineMean: number;
  deltaVsBaseline: number;
  effectSize: number; // Cohen's d (run vs baseline)
  ciLow: number; // 95% bootstrap CI on (run - baseline)
  ciHigh: number;
  pValue: number; // one-sided P(run <= baseline); small = the run is better
  verdict: 'improved' | 'no_change' | 'regressed';
  deltaVsPrev: number | null;
  prevId: string | null;
}

export interface GradeRunOptions {
  source?: ProgressionSource | 'mixed';
  /** Known corpus to measure novelty against. Absent => exploration is not scored. */
  reference?: TheoryProgression[];
  baselineCount?: number;
  bootstrapCount?: number;
  seed?: number;
  prev?: RunGrade | null;
  at?: number;
}

function bootstrapDiff(runVals: number[], baseVals: number[], iterations: number, rng: () => number): { ciLow: number; ciHigh: number; pValue: number; delta: number } {
  const diff = mean(runVals) - mean(baseVals);
  const draws: number[] = [];
  let leZero = 0;
  for (let b = 0; b < iterations; b++) {
    const r = mean(Array.from({ length: runVals.length }, () => runVals[Math.floor(rng() * runVals.length)]));
    const s = mean(Array.from({ length: baseVals.length }, () => baseVals[Math.floor(rng() * baseVals.length)]));
    const d = r - s;
    draws.push(d);
    if (d <= 0) leZero++;
  }
  draws.sort((a, b) => a - b);
  const lo = draws[Math.floor(0.025 * draws.length)] ?? diff;
  const hi = draws[Math.min(draws.length - 1, Math.floor(0.975 * draws.length))] ?? diff;
  return { ciLow: lo, ciHigh: hi, pValue: leZero / Math.max(1, iterations), delta: diff };
}

export function gradeRun(progressions: TheoryProgression[], opts: GradeRunOptions = {}): RunGrade {
  const baselineCount = opts.baselineCount ?? 200;
  const bootstrapCount = opts.bootstrapCount ?? 2000;
  const seed = opts.seed ?? 1701;
  const rng = lcg(seed);
  const reference = opts.reference ?? [];

  // Coherence-gated novelty: novelty only credits a progression that is itself
  // coherent, so random noise cannot win by being maximally "new".
  const adjusted = (p: TheoryProgression): number => {
    const conf = theoryScore(p);
    const nov = reference.length ? novelty(p, reference) : 0;
    return clamp01(conf * (1 + EXPLORATION_WEIGHT * nov));
  };

  const bars = Math.round(mean(progressions.map((p) => p.bars ?? p.chords.length))) || 8;
  const runVals = progressions.map(adjusted);
  const baseVals = Array.from({ length: baselineCount }, () => adjusted(randomTheoryProgression(rng, bars)));

  const runMean = mean(runVals);
  const baseMean = mean(baseVals);
  const conformance = mean(progressions.map(theoryScore));
  const noveltyMean = reference.length ? mean(progressions.map((p) => novelty(p, reference))) : null;
  const exploration = reference.length ? mean(progressions.map((p) => novelty(p, reference) * theoryScore(p))) : null;
  const emergent = reference.length ? emergentStyles(progressions, reference) : [];

  const pooled = Math.sqrt((std(runVals) ** 2 + std(baseVals) ** 2) / 2) || 1;
  const effectSize = (runMean - baseMean) / pooled;
  const { ciLow, ciHigh, pValue, delta } = bootstrapDiff(runVals, baseVals, bootstrapCount, rng);
  const verdict: RunGrade['verdict'] = ciLow > 0 ? 'improved' : ciHigh < 0 ? 'regressed' : 'no_change';

  // Mean per conformance metric across the run (the "which axis is weak" signal).
  const metricKeys = theoryMetrics(progressions[0] ?? { id: '', source: 'random', chords: [] }).map((m) => m.key);
  const metrics: Record<string, number> = {};
  for (const k of metricKeys) {
    metrics[k] = mean(progressions.map((p) => theoryMetrics(p).find((m) => m.key === k)?.value ?? 0));
  }

  const prev = opts.prev ?? null;
  return {
    id: `rungrade_${progressions.length}_${seed}`,
    at: opts.at ?? Date.now(),
    source: opts.source ?? (progressions.every((p) => p.source === progressions[0]?.source) ? progressions[0]?.source ?? 'mixed' : 'mixed'),
    n: progressions.length,
    grade: runMean,
    letter: gradeLetter(runMean),
    conformance,
    novelty: noveltyMean,
    exploration,
    emergentStyles: emergent,
    metrics,
    baselineMean: baseMean,
    deltaVsBaseline: delta,
    effectSize,
    ciLow,
    ciHigh,
    pValue,
    verdict,
    deltaVsPrev: prev ? runMean - prev.grade : null,
    prevId: prev?.id ?? null,
  };
}

/** The weakest metric of a run — what the next run should attack. */
export function weakestMetric(g: RunGrade): { key: string; value: number } {
  const entries = Object.entries(g.metrics);
  if (!entries.length) return { key: 'none', value: 0 };
  return entries.sort((a, b) => a[1] - b[1]).map(([key, value]) => ({ key, value }))[0];
}

// ---------------------------------------------------------------------------
// adaptors
// ---------------------------------------------------------------------------

export function fromChordStudioProgression(p: ChordStudioProgression, id?: string): TheoryProgression {
  const chords: TheoryChord[] = p.chords
    .filter((c) => Array.isArray(c.notes) && c.notes.length > 0)
    .map((c) => ({
      rootPc: ((Math.min(...(c.notes as number[])) % 12) + 12) % 12,
      quality: '', // ChordStudio names encode quality; the name is kept for bucketing
      notes: c.notes as number[],
      name: c.name,
      ...(typeof c.bass === 'number' ? { bass: c.bass } : {}),
    }));
  return { id: id ?? p.name, source: 'chordstudio', chords, keyPc: pcFromNoteName(p.rootNote), bars: chords.length };
}

export function fromComposerTrack(track: {
  style: string;
  seed: number;
  bars: number;
  key: number;
  chords: Array<{ rootPc: number; quality: string }>;
  events: Array<{ tick: number; pitch: number; part: string }>;
}): TheoryProgression {
  const BAR = 4 * 480;
  const VOICING_PARTS = new Set(['keys', 'piano', 'rhodes', 'strings']);
  const chords: TheoryChord[] = track.chords.map((c, i) => {
    const lo = i * BAR;
    const hi = (i + 1) * BAR;
    const notes = track.events
      .filter((e) => VOICING_PARTS.has(e.part) && e.tick >= lo && e.tick < hi)
      .map((e) => e.pitch);
    return { rootPc: c.rootPc, quality: c.quality, notes };
  });
  return { id: `${track.style}-${track.seed}`, source: 'composer', chords, keyPc: track.key, bars: track.bars };
}
