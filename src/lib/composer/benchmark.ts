/**
 * Recourse Composer benchmark — an OBJECTIVE, reproducible grade of the
 * composer's output on computed musical/structural criteria.
 *
 * METHODOLOGY & HONESTY (read before trusting the number):
 *  - Every metric below is REAL MATH on REAL output (MIDI events + chord model),
 *    deterministic per (style, seed). Nothing here requires hearing audio.
 *  - This benchmark does NOT and cannot grade TASTE or timbre. It grades
 *    correctness, structure, style-DNA adherence, voice-leading smoothness,
 *    loop closure, richness and nuance presence. The aesthetic grade is still
 *    the operator's human rating (the learner). Benchmark auto-ratings feed the
 *    learner as `source: benchmark` so recursion starts even before human ears;
 *    human ratings for the same (style,seed) take precedence.
 *  - Scores are 0..1; the aggregate is a mean, not a "Steely Dan authenticity"
 *    claim.
 */

import { compose } from './composer.js';
import { getLexicon, type StyleLexicon } from './lexicons.js';
import { CHORD_TONES } from './theory.js';
import type { Chord, NoteEvent, StyleId, Track } from './types.js';

const BAR = 4 * 480;

export interface BenchmarkConfig {
  styles?: StyleId[];
  /** Seeds to run per style. Fixed defaults keep the benchmark reproducible. */
  seeds?: number[];
  bars?: 4 | 8 | 16;
}

export interface MetricCheck {
  key: string;
  label: string;
  value: number; // 0..1
  detail: string;
}

export interface TrackScore {
  style: StyleId;
  seed: number;
  bars: number;
  total: number; // 0..1
  metrics: MetricCheck[];
}

export interface StyleScore {
  style: StyleId;
  count: number;
  avg: number;
  min: number;
  max: number;
  scores: TrackScore[];
}

export interface BenchmarkReport {
  generatedAt: number;
  method: string;
  styles: StyleScore[];
  aggregate: number; // 0..1 across everything
  grade: string; // letter-ish summary
}

const WEIGHTS: Record<string, number> = {
  integrity: 0.2,
  harmony: 0.1,
  closure: 0.15,
  styleAdherence: 0.2,
  voiceLeading: 0.15,
  richness: 0.1,
  nuance: 0.1,
};

// ---------------------------------------------------------------------------
// metric primitives
// ---------------------------------------------------------------------------

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function uniquePitchesIn(events: NoteEvent[], start: number, end: number): number[] {
  const s = new Set<number>();
  for (const e of events) {
    if (e.tick >= start && e.tick < end && (e.part === 'keys' || e.part === 'strings')) s.add(e.pitch);
  }
  return [...s].sort((a, b) => a - b);
}

/** Greedy sorted-pair mean voice-leading distance between two voicing sets. */
function voiceLeadingDist(a: number[], b: number[]): number | null {
  if (!a.length || !b.length) return null;
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(a[i] - b[i]);
  return sum / n;
}

function rootMoves(chords: Chord[]): number[] {
  const moves: number[] = [];
  for (let i = 1; i < chords.length; i++) {
    let d = (chords[i].rootPc - chords[i - 1].rootPc) % 12;
    if (d > 6) d -= 12;
    if (d < -6) d += 12;
    moves.push(d);
  }
  return moves;
}

// ---------------------------------------------------------------------------
// scoring one track
// ---------------------------------------------------------------------------

export function scoreTrack(track: Track): TrackScore {
  const lx = getLexicon(track.style);
  const loopMode = track.mode !== 'arr';
  const totalTicks = track.bars * BAR;
  const metrics: MetricCheck[] = [];

  // integrity: events well-formed, in range, on-timeline.
  const bad = track.events.filter(
    (e) => e.tick < 0 || e.tick + e.dur > totalTicks + 2 || e.pitch < 0 || e.pitch > 127 || e.velocity < 1 || e.velocity > 127 || e.dur <= 0,
  ).length;
  const integrity = clamp01(1 - bad / Math.max(1, track.events.length));
  metrics.push({ key: 'integrity', label: 'Event integrity (range/timeline/vel)', value: integrity, detail: `${track.events.length - bad}/${track.events.length} events valid` });

  // harmony: every emitted chord quality must resolve to a real tone set.
  const invalid = track.chords.filter((c) => !(c.quality in CHORD_TONES)).length;
  const harmony = clamp01(1 - invalid / Math.max(1, track.chords.length));
  metrics.push({ key: 'harmony', label: 'Harmonic model valid', value: harmony, detail: `${track.chords.length - invalid}/${track.chords.length} chords in quality table` });

  // closure: loop mode must resolve to the tonic; arrangement mode is exempt.
  const closure = loopMode ? (track.chords[track.chords.length - 1]?.rootPc === track.key ? 1 : 0) : 1;
  metrics.push({ key: 'closure', label: loopMode ? 'Loop closure (resolves to tonic)' : 'Arrangement (no closure required)', value: closure, detail: loopMode ? `final=${track.chords[track.chords.length - 1]?.rootPc} tonic=${track.key}` : 'exempt' });

  // style adherence: root moves fall within the lexicon's motion vocabulary.
  const allowed = new Set(lx.rootSteps.map((s) => s.step));
  const moves = rootMoves(track.chords);
  const within = moves.filter((m) => allowed.has(m)).length;
  let adherence = moves.length ? within / moves.length : 1;
  // Steely-Dan complexity trait: chromatic half-step motion present.
  if (track.style === 'steely-dan') {
    const chromatic = moves.some((m) => Math.abs(m) === 1);
    adherence = clamp01(adherence * 0.8 + (chromatic ? 0.2 : 0));
  }
  metrics.push({ key: 'styleAdherence', label: 'Style root-motion adherence', value: clamp01(adherence), detail: `${within}/${moves.length} moves in lexicon vocab` });

  // voice leading: smoothness between consecutive bars' rendered voicings.
  let vSum = 0;
  let vN = 0;
  for (let b = 1; b < track.bars; b++) {
    const prev = uniquePitchesIn(track.events, (b - 1) * BAR, b * BAR);
    const cur = uniquePitchesIn(track.events, b * BAR, (b + 1) * BAR);
    const d = voiceLeadingDist(prev, cur);
    if (d != null) {
      vSum += d;
      vN++;
    }
  }
  const avgLead = vN ? vSum / vN : 0;
  const voiceLeading = clamp01(1 - avgLead / 7); // ~0 distance ideal; 7+ semitones poor
  metrics.push({ key: 'voiceLeading', label: 'Voice-leading smoothness', value: voiceLeading, detail: `avg ${avgLead.toFixed(2)} semitones between bars` });

  // richness: harmonic variety and event density appropriate to a real track.
  const distinct = new Set(track.chords.map((c) => `${c.rootPc}${c.quality}`)).size;
  const richness = clamp01(distinct / Math.min(6, track.bars));
  metrics.push({ key: 'richness', label: 'Harmonic richness', value: richness, detail: `${distinct} distinct chords over ${track.bars} bars` });

  // nuance: expected signature parts are actually present.
  const parts = new Set(track.events.map((e) => e.part));
  const expected: string[] = [];
  const nu = lx.nuance;
  if (nu?.horns) expected.push('horns');
  if (nu?.strings) expected.push('strings');
  if (nu?.bgvox) expected.push('bgvox');
  const present = expected.filter((p) => parts.has(p as any)).length;
  const nuance = expected.length ? present / expected.length : 1;
  metrics.push({ key: 'nuance', label: 'Signature nuance parts present', value: nuance, detail: `${present}/${expected.length} of [${expected.join(',')}]` });

  let total = 0;
  for (const m of metrics) total += (WEIGHTS[m.key] ?? 0) * m.value;
  return { style: track.style, seed: track.seed, bars: track.bars, total: clamp01(total), metrics };
}

function gradeLetter(total: number): string {
  if (total >= 0.85) return 'A';
  if (total >= 0.7) return 'B';
  if (total >= 0.5) return 'C';
  return 'D';
}

/** Run the objective benchmark across styles × seeds (loop mode by default). */
export function runBenchmark(cfg: BenchmarkConfig = {}): BenchmarkReport {
  const styles: StyleId[] = cfg.styles ?? (['steely-dan', 'jasper-ballad', 'dangelo-glasper', 'airplane'] as StyleId[]);
  const seeds = cfg.seeds ?? [1, 2, 3, 4, 5, 6, 7, 8];
  const bars = cfg.bars ?? 8;
  const out: StyleScore[] = [];
  const allTotals: number[] = [];
  for (const style of styles) {
    const scores: TrackScore[] = [];
    for (const seed of seeds) {
      const track = compose({ style, seed, bars });
      scores.push(scoreTrack(track));
      allTotals.push(scores[scores.length - 1].total);
    }
    const avg = scores.reduce((s, x) => s + x.total, 0) / scores.length;
    out.push({
      style,
      count: scores.length,
      avg,
      min: Math.min(...scores.map((s) => s.total)),
      max: Math.max(...scores.map((s) => s.total)),
      scores,
    });
  }
  const aggregate = allTotals.length ? allTotals.reduce((a, b) => a + b, 0) / allTotals.length : 0;
  return {
    generatedAt: Date.now(),
    method:
      'objective computed metrics (integrity/harmony/closure/style-adherence/voice-leading/richness/nuance); does NOT grade taste or timbre — human ratings remain the aesthetic arbiter',
    styles: out,
    aggregate,
    grade: gradeLetter(aggregate),
  };
}

/** Map an objective benchmark score to a 1..5 rating for learner intake. */
export function ratingFromScore(score: number): number {
  if (score >= 0.85) return 5;
  if (score >= 0.7) return 4;
  if (score >= 0.55) return 3;
  if (score >= 0.4) return 2;
  return 1;
}

/** Push benchmark winners into the learner as `source: benchmark` episodes so
 *  recursion can begin before human ears have rated anything. Returns the number
 *  of episodes recorded. Human ratings for the same (style,seed) still win. */
export function autoRateBenchmark(
  learner: import('./learner.js').ComposerLearner,
  report: BenchmarkReport,
  minTotal = 0.7,
): { pushed: number; details: Array<{ style: StyleId; seed: number; rating: number }> } {
  const details: Array<{ style: StyleId; seed: number; rating: number }> = [];
  for (const style of report.styles) {
    for (const ts of style.scores) {
      if (ts.total >= minTotal) {
        const rating = ratingFromScore(ts.total);
        learner.rate({ style: ts.style, seed: ts.seed, bars: ts.bars }, rating, ['benchmark']);
        details.push({ style: ts.style, seed: ts.seed, rating });
      }
    }
  }
  return { pushed: details.length, details };
}

/** Render the report as a concise markdown summary. */
export function renderBenchmark(report: BenchmarkReport): string {
  const L: string[] = [];
  L.push('## Composer benchmark (objective)');
  L.push('');
  L.push(`Overall: **${(report.aggregate * 100).toFixed(1)}/100 (${report.grade})**`);
  L.push('');
  L.push('| Style | avg | min | max |');
  L.push('|---|---|---|---|');
  for (const s of report.styles) {
    L.push(`| ${s.style} | ${(s.avg * 100).toFixed(1)} | ${(s.min * 100).toFixed(1)} | ${(s.max * 100).toFixed(1)} |`);
  }
  L.push('');
  L.push(`> ${report.method}`);
  return L.join('\n') + '\n';
}
