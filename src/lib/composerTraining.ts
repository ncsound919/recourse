/**
 * composerTraining.ts — turn the composer learner's rated episodes into a
 * supervised training set for the remote (Kaggle) small-model job.
 *
 * The composer learner is one honest source of a chord-progression quality
 * signal: an episode exists because a human rated a reproducible track 1..5.
 * (ChordStudio's Critic-scored exports are the other — see chordStudioSource.ts;
 * the retrain job prefers ChordStudio and falls back to this.)
 * This module is the bridge from that signal to `train_small_model`: a fixed,
 * deterministic feature vector per episode, target = rating.
 *
 * It is deliberately strict. A training set is returned ONLY when the episodes
 * carry real target variance (>= 2 distinct ratings) and enough rows (>= 4, the
 * notebook's own minimum). Otherwise it returns a refusal object with a reason
 * rather than shipping a degenerate set whose metric would be a lie — the same
 * failure the testbiz scorecards would have produced (118 identical rows).
 */

import type { Episode } from './composer/learner.js';

export const COMPOSER_FEATURE_NAMES = [
  'bars',
  'bpm',
  'chordCount',
  'meanRootMove',
  'meanAbsRootMove',
  'stdRootMove',
  'distinctQualities',
  'accidentalQualities',
] as const;

export interface ComposerTrainingSet {
  rows: number[][];
  target: number[];
  featureNames: string[];
  distinctRatings: number;
  ratingHistogram: Record<string, number>;
}

export interface ComposerTrainingRefusal {
  ok: false;
  reason: string;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/** One deterministic feature vector per episode. */
export function composerEpisodeFeatures(e: Episode): number[] {
  const rootMoves = Array.isArray(e.rootMoves) ? e.rootMoves : [];
  const qualities = Array.isArray(e.qualities) ? e.qualities : [];
  const accidental = qualities.filter((q) => typeof q === 'string' && /[#b]/.test(q)).length;
  return [
    Number(e.brief?.bars ?? e.chords?.length ?? 0),
    Number(e.brief?.bpm ?? 0),
    Array.isArray(e.chords) ? e.chords.length : 0,
    mean(rootMoves),
    mean(rootMoves.map((x) => Math.abs(x))),
    std(rootMoves),
    new Set(qualities).size,
    accidental,
  ];
}

/**
 * Build the training set, or refuse honestly. `minRows` defaults to 4 (the
 * remote notebook's minimum); `minDistinctRatings` to 2 (below that, the
 * "model" would learn a constant and every metric would be meaningless).
 */
export function buildComposerTrainingRows(
  episodes: Episode[],
  opts: { minRows?: number; minDistinctRatings?: number } = {},
): ComposerTrainingSet | ComposerTrainingRefusal {
  const minRows = opts.minRows ?? 4;
  const minDistinct = opts.minDistinctRatings ?? 2;

  const usable = episodes.filter(
    (e) => e && typeof e.rating === 'number' && Number.isFinite(e.rating) && Array.isArray(e.chords) && e.chords.length > 0,
  );

  if (usable.length < minRows) {
    return { ok: false, reason: `only ${usable.length} rated episodes (need >= ${minRows})` };
  }

  const histogram: Record<string, number> = {};
  for (const e of usable) histogram[String(e.rating)] = (histogram[String(e.rating)] ?? 0) + 1;
  const distinctRatings = Object.keys(histogram).length;
  if (distinctRatings < minDistinct) {
    return {
      ok: false,
      reason: `all ${usable.length} episodes share ${distinctRatings} rating value(s) (need >= ${minDistinct}); no signal to learn`,
    };
  }

  return {
    rows: usable.map(composerEpisodeFeatures),
    target: usable.map((e) => e.rating),
    featureNames: [...COMPOSER_FEATURE_NAMES],
    distinctRatings,
    ratingHistogram: histogram,
  };
}

export function isComposerTrainingSet(
  v: ComposerTrainingSet | ComposerTrainingRefusal,
): v is ComposerTrainingSet {
  return (v as ComposerTrainingSet).rows !== undefined;
}
