/**
 * Open-Ended Capability Engine — admission gates.
 *
 * Four deterministic gates that the open-ended loop runs BEFORE it pays for a
 * model call or a sandbox slot, plus the behavioral canon that stops Recourse's
 * gene ledger from filling with the same capability under new hex suffixes:
 *
 *   1. `canonicalToolKey` — collapse `real:MATH_LAGRANGE_4776` / `_b76a` /
 *      `MATH_LAGRANGE` to one behavioral identity.
 *   2. `noveltyVerdict` — reject near-duplicate candidates (ShinkaEvolve's
 *      sample-efficiency win) using the pure token-Jaccard in `novelty.ts`.
 *   3. `pruneLearnerBeliefs` — merge duplicate gene beliefs and, optionally,
 *      retire long-dead noise. Pure: it never reads a clock or random source.
 *   4. `propertyGate` — the adversarial gate that `chunkArray(size=0)` would
 *      have tripped: a candidate must survive fast-check Totality /
 *      Determinism / Purity / FiniteOutputs, not just its happy-path suite.
 *
 * Honesty: nothing here invents a result. A gate that cannot run (fast-check
 * absent) reports `available:false`; the caller decides whether an unavailable
 * gate blocks. `pruneLearnerBeliefs` only ever drops beliefs it can prove are
 * behavioral duplicates of a kept belief (or below an explicitly supplied
 * noise floor) and reports every drop.
 */

import { isNovel, jaccard, type SimilarityFn } from '../novelty.js';
import { propertyScore, type PropertyReport } from '../../dream/property-harness.js';

// ---------------------------------------------------------------------------
// 1. Behavioral canon
// ---------------------------------------------------------------------------

const SCAFFOLD_PREFIX = /^(real|dream|backfill|forge|gene)[:_]/i;

/**
 * Canonicalize a tool/gene name to its behavioral identity:
 *   - drop a scaffold prefix (`real:`, `dream:`, `backfill_`, `forge_`, ...)
 *   - drop a trailing hex/numeric disambiguator (`_4776`, `_a1b2c3`, `:d31f`)
 *   - lowercase
 * so name-variants of one capability collapse to a single key. Pure.
 */
export function canonicalToolKey(name: string): string {
  let s = String(name ?? '').trim();
  s = s.replace(SCAFFOLD_PREFIX, '');
  // trailing separator + hex run (>=3) e.g. `_a1b2c3`, `-d31f`, `:89ab`
  s = s.replace(/[:_-][0-9a-f]{3,16}$/i, '');
  // trailing separator + pure digits e.g. `_4776`, `-2332`
  s = s.replace(/[:_-]\d{2,}$/, '');
  // collapse whitespace/underscores used as word separators
  return s.replace(/[\s_]+/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

// ---------------------------------------------------------------------------
// 2. Novelty gate
// ---------------------------------------------------------------------------

export interface NoveltyVerdict {
  novel: boolean;
  bestScore: number;
  mostSimilar: string | null;
}

/** A candidate is admitted only when its best similarity to the known pool is
 *  strictly below `threshold`. Pool entries are compared by the supplied
 *  similarity (default token-Jaccard). */
export function noveltyVerdict(
  candidate: string,
  pool: string[],
  threshold = 0.85,
  sim: SimilarityFn = jaccard,
): NoveltyVerdict {
  if (pool.length === 0) return { novel: true, bestScore: 0, mostSimilar: null };
  const v = isNovel(candidate, pool, threshold, sim);
  return { novel: v.novel, bestScore: v.bestScore, mostSimilar: v.mostSimilar };
}

/** Keep only pool-admissible candidates, preserving order. Returns the kept
 *  survivors and the rejected ones with their similarity score. */
export function filterNovel<T>(
  items: T[],
  render: (item: T) => string,
  pool: string[],
  threshold = 0.85,
  sim: SimilarityFn = jaccard,
): { kept: T[]; rejected: Array<{ item: T; bestScore: number; mostSimilar: string | null }> } {
  const known = [...pool];
  const kept: T[] = [];
  const rejected: Array<{ item: T; bestScore: number; mostSimilar: string | null }> = [];
  for (const item of items) {
    const text = render(item);
    const v = noveltyVerdict(text, known, threshold, sim);
    if (v.novel) {
      kept.push(item);
      known.push(text);
    } else {
      rejected.push({ item, bestScore: v.bestScore, mostSimilar: v.mostSimilar });
    }
  }
  return { kept, rejected };
}

// ---------------------------------------------------------------------------
// 3. Gene-belief hygiene
// ---------------------------------------------------------------------------

export interface BeliefLike {
  geneId: string;
  geneName: string;
  domain: string;
  alpha: number;
  beta: number;
  attempts: number;
  meanReward: number;
  weight: number;
  lastEpisode: number;
}

export interface LearnerLike {
  geneBeliefs: Record<string, BeliefLike>;
  episode?: number;
  [k: string]: unknown;
}

export interface BeliefPruneReport {
  before: number;
  after: number;
  mergedGroups: number;
  mergedKeys: string[];
  droppedNoise: string[];
  /** Number of duplicate keys removed (merged into a kept representative). */
  duplicatesRemoved: number;
}

export interface PruneOptions {
  /** Drop a belief with `attempts>0` when `weight <= minWeight` AND
   *  `meanReward <= minMeanReward`. Default 0 (never drop on weight alone). */
  minWeight?: number;
  minMeanReward?: number;
  /** A belief must have been seen within this many episodes of the current one
   *  to survive the noise floor. Requires `state.episode`. Default: no staleness. */
  maxAgeEpisodes?: number;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Behavioral group key: canonical name + domain + posterior + attempt count. */
function behaviorGroupKey(b: BeliefLike): string {
  return [
    canonicalToolKey(b.geneName || b.geneId),
    b.domain,
    round4(b.alpha),
    round4(b.beta),
    b.attempts,
    round4(b.meanReward),
  ].join('|');
}

/**
 * Merge behavioral-duplicate beliefs and optionally retire dead noise. Pure:
 * returns a NEW state object; the input is not mutated. The kept representative
 * for a group is the one with the most attempts, then the highest weight, then
 * the lexicographically smallest geneId (deterministic).
 */
export function pruneLearnerBeliefs(
  state: LearnerLike,
  opts: PruneOptions = {},
): { state: LearnerLike; report: BeliefPruneReport } {
  const beliefs = Object.values(state.geneBeliefs ?? {});
  const before = beliefs.length;

  const groups = new Map<string, BeliefLike[]>();
  for (const b of beliefs) {
    const key = behaviorGroupKey(b);
    const list = groups.get(key) ?? [];
    list.push(b);
    groups.set(key, list);
  }

  const kept: BeliefLike[] = [];
  const mergedKeys: string[] = [];
  let mergedGroups = 0;
  for (const members of groups.values()) {
    const sorted = [...members].sort(
      (a, b) =>
        b.attempts - a.attempts ||
        b.weight - a.weight ||
        (a.geneId < b.geneId ? -1 : a.geneId > b.geneId ? 1 : 0),
    );
    const rep = sorted[0];
    if (sorted.length > 1) {
      mergedGroups += 1;
      for (const dup of sorted.slice(1)) mergedKeys.push(dup.geneId);
    }
    kept.push(rep);
  }

  const minWeight = opts.minWeight ?? 0;
  const minMeanReward = opts.minMeanReward ?? 0;
  const currentEpisode = state.episode ?? 0;
  const maxAge = opts.maxAgeEpisodes;
  const survivors: BeliefLike[] = [];
  const droppedNoise: string[] = [];
  for (const b of kept) {
    const isNoise =
      (minWeight > 0 || minMeanReward > 0) &&
      b.attempts > 0 &&
      b.weight <= minWeight &&
      b.meanReward <= minMeanReward &&
      (maxAge === undefined || currentEpisode - (b.lastEpisode ?? 0) > maxAge);
    if (isNoise) droppedNoise.push(b.geneId);
    else survivors.push(b);
  }

  const nextBeliefs: Record<string, BeliefLike> = {};
  for (const b of survivors) nextBeliefs[b.geneId] = b;

  return {
    state: { ...state, geneBeliefs: nextBeliefs },
    report: {
      before,
      after: survivors.length,
      mergedGroups,
      mergedKeys,
      droppedNoise,
      duplicatesRemoved: mergedKeys.length,
    },
  };
}

// ---------------------------------------------------------------------------
// 4. Property gate
// ---------------------------------------------------------------------------

export interface PropertyGateResult {
  /** True only when the property harness ran AND every property passed. */
  passed: boolean;
  /** False when fast-check is unavailable; the caller decides if that blocks. */
  available: boolean;
  score: number;
  report: PropertyReport;
}

/**
 * Adversarial property gate. Runs the four generic invariants (Totality,
 * DeterminismUnderReplay, InputPurity, FiniteOutputs) over the candidate's
 * inferred input shapes. A candidate passes only when all four hold. This is
 * the gate that catches an infinite loop / mutation / NaN that a happy-path
 * `assert` suite misses.
 *
 * When `functionName` is supplied the source is wrapped so the harness tests
 * THAT named function (candidate sources are `export function name(...)`, which
 * is not a bare function expression the harness could otherwise evaluate).
 * `vectors` are argument lists — one sample call's arguments per entry — so the
 * inferred shapes match the real parameter arity and types.
 */
export function propertyGate(
  code: string,
  vectors: unknown[],
  seed = 0xace5eed,
  runsPerProperty = 50,
  functionName?: string,
): PropertyGateResult {
  let testable = code;
  if (functionName) {
    // Strip module syntax, then expose the named function as a spread-callable
    // single-argument function so multi-argument signatures are exercised too.
    const clean = code.replace(/\bexport\s+default\s+/g, '').replace(/\bexport\s+/g, '');
    testable =
      `(function(){ ${clean}\n; const __fn = typeof ${functionName} === 'function' ? ${functionName} : null; ` +
      `return (__args) => { if (!__fn) throw new Error('missing ${functionName}'); return __fn(...(Array.isArray(__args) ? __args : [__args])); }; })()`;
  }
  const report = propertyScore(testable, vectors, seed, runsPerProperty);
  return {
    passed: report.available && report.properties.length > 0 && report.properties.every((p) => p.passed),
    available: report.available,
    score: report.score,
    report,
  };
}
