/**
 * Statistics — the statistical-correctness layer that feeds ResearchArtifact.
 *
 * Pure, deterministic, real math (no fabricated numbers). Every function
 * returns a real p-value/effect/CI computed from real inputs. This is what a
 * scientist checks before trusting a claim. All distribution math is delegated
 * to mature, battle-tested libraries — `jstat` for CDF/inverse-CDF/PMF lookups
 * and `@stdlib/stats-padjust` for multiple-comparison correction — instead of
 * hand-rolled approximations:
 *
 *  - Welch's t-test (unequal variance): two-sample test with Satterthwaite df.
 *  - Kaplan-Meier log-rank (two-group): chi-square with one df.
 *  - Hypergeometric enrichment (Fisher's exact, one-sided): tail sum via
 *    `jStat.hypgeom` (the /mature/ Ferguson algorithm).
 *  - Benjamini-Hochberg FDR: `@stdlib/stats-padjust` method 'bh'.
 *  - Normal CI for a mean: mean ± z * sd/sqrt(n).
 *
 * Honesty: functions return null when inputs are insufficient (n too small,
 * zero variance) — never a fabricated number.
 */

import jStat from 'jstat';
import padjust from '@stdlib/stats-padjust';

export interface TTestResult {
  test: 'welch_t';
  t: number;
  df: number;
  p: number;
  meanA: number;
  meanB: number;
  effect: number;      // mean difference
  ci: { lower: number; upper: number; level: number };
  n: number;
}

/** Two-tailed p-value from a t statistic and df. */
function tTwoTailP(t: number, df: number): number {
  if (!isFinite(t) || df <= 0) return NaN;
  return 2 * jStat.studentt.cdf(-Math.abs(t), df);
}

/**
 * Welch's t-test (unequal variances, Satterthwaite df). Returns null when a
 * sample has <2 observations or zero variance.
 */
export function welchTTest(a: number[], b: number[], level = 0.95): TTestResult | null {
  if (a.length < 2 || b.length < 2) return null;
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const var_ = (xs: number[], m: number) => xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  const mA = mean(a);
  const mB = mean(b);
  const vA = var_(a, mA);
  const vB = var_(b, mB);
  if (vA === 0 && vB === 0) return null;
  const se = Math.sqrt(vA / a.length + vB / b.length);
  if (se === 0) return null;
  const t = (mA - mB) / se;
  const df = (vA / a.length + vB / b.length) ** 2 /
    ((vA / a.length) ** 2 / (a.length - 1) + (vB / b.length) ** 2 / (b.length - 1));
  const p = tTwoTailP(Math.abs(t), Math.max(0.001, df));
  // CI for the mean difference: t_{df, 1-level/2}
  const alpha = 1 - level;
  const crit = jStat.studentt.inv(1 - alpha / 2, df);
  const halfWidth = crit * se;
  return {
    test: 'welch_t',
    t: Math.round(t * 10000) / 10000,
    df: Math.round(df * 100) / 100,
    p: roundP(p),
    meanA: Math.round(mA * 10000) / 10000,
    meanB: Math.round(mB * 10000) / 10000,
    effect: Math.round((mA - mB) * 10000) / 10000,
    ci: {
      lower: Math.round((mA - mB - halfWidth) * 10000) / 10000,
      upper: Math.round((mA - mB + halfWidth) * 10000) / 10000,
      level,
    },
    n: a.length + b.length,
  };
}

export interface LogRankResult {
  test: 'log_rank';
  chi2: number;
  p: number;
  hr: number;       // hazard ratio (group B / group A)
  nA: number;
  nB: number;
  eventsA: number;
  eventsB: number;
}

/**
 * Two-group log-rank test (Kaplan-Meier comparison). Inputs: times (event or
 * censoring time), events (1=event, 0=censored), group (0 or 1). Returns null
 * when either group has no events.
 */
export function logRankTest(
  times: number[],
  events: number[],
  group: number[],
): LogRankResult | null {
  const n = times.length;
  if (n !== events.length || n !== group.length) return null;
  const uniq = [...new Set(times)].sort((a, b) => a - b);
  let o1 = 0, o0 = 0, e1 = 0, e0 = 0, v = 0;
  for (const t of uniq) {
    const atRisk = times.map((x, i) => ({ t: x, e: events[i], g: group[i] }))
      .filter((p) => p.t >= t);
    const d = atRisk.filter((p) => p.t === t && p.e === 1).length;
    if (d === 0) continue;
    const nRisk = atRisk.length;
    const n1 = atRisk.filter((p) => p.g === 1).length;
    const d1 = atRisk.filter((p) => p.g === 1 && p.t === t && p.e === 1).length;
    o1 += d1;
    o0 += d - d1;
    e1 += (d * n1) / nRisk;
    e0 += (d * (nRisk - n1)) / nRisk;
    v += (n1 * (nRisk - n1) * d * (nRisk - d)) / (nRisk * nRisk * (nRisk - 1) || 1);
  }
  if (o1 === 0 || o0 === 0) return null;
  const chi2 = v > 0 ? (o1 - e1) ** 2 / v : 0;
  // Standard log-rank p-value: upper tail of the chi-square distribution with
  // one df (equivalent to a two-sided normal test of the pooled z).
  const p = 1 - jStat.chisquare.cdf(Math.max(0, chi2), 1);
  const hr = (o1 / e1) / (o0 / e0 || 1e-9);
  return {
    test: 'log_rank',
    chi2: Math.round(chi2 * 10000) / 10000,
p: roundP(p),
  hr: Math.round(hr * 10000) / 10000,
    nA: group.filter((g) => g === 0).length,
    nB: group.filter((g) => g === 1).length,
    eventsA: o0,
    eventsB: o1,
  };
}

export interface HypergeomResult {
  test: 'hypergeometric';
  p: number;          // one-sided (>= observed overlap) enrichment p
  n: number;          // total universe
  k: number;          // drawn
  x: number;          // observed overlap
  m: number;          // successes in universe
}

/**
 * Fisher's exact / hypergeometric enrichment: P(X >= x | n,k,m). Delegates the
 * tail computation to jStat's mature Ferguson hypergeometric algorithm.
 */
export function hypergeomEnrichment(n: number, k: number, m: number, x: number): HypergeomResult | null {
  if (x < 0 || k > n || m > n) return null;
  // P(X >= x) = 1 - P(X <= x-1) with jStat's parameter order (x, N, m, n_drawn).
  const p = 1 - jStat.hypgeom.cdf(x - 1, n, m, k);
  return { test: 'hypergeometric', p: roundP(p), n, k, x, m };
}

export interface FdrResult {
  corrected: number[];
  method: 'benjamini_hochberg';
  significantAt: (alpha: number) => number[]; // indices with corrected p < alpha
}

/** Benjamini-Hochberg FDR correction via @stdlib/stats-padjust (method 'bh'). */
export function benjaminiHochberg(pvalues: number[]): FdrResult {
  const n = pvalues.length;
  const out = n > 0 ? padjust(pvalues, 'bh') : [];
  return {
    corrected: out.map((p) => Math.round(p * 1e6) / 1e6),
    method: 'benjamini_hochberg',
    significantAt: (alpha: number) => out.map((p, i) => ({ p, i })).filter((x) => x.p < alpha).map((x) => x.i),
  };
}

export interface MeanCIResult {
  mean: number;
  sd: number;
  n: number;
  ci: { lower: number; upper: number; level: number };
}

export interface TwoProportionResult {
  test: 'two_proportion_z';
  z: number;
  p: number;            // two-tailed
  effect: number;       // p1 - p2 (proportion difference)
  ci: { lower: number; upper: number; level: number };
  n1: number;
  n2: number;
  p1: number;
  p2: number;
}

/**
 * Two-proportion z-test (normal approximation) for binomial outcomes — the
 * right test when each arm is a proportion over n trials (e.g. Monte Carlo
 * cure rate). Returns null when n is too small for the normal approximation
 * (< 30 per arm, the usual rule of thumb) or a proportion is out of [0,1].
 */
export function twoProportionZTest(
  p1: number, n1: number,
  p2: number, n2: number,
  level = 0.95,
): TwoProportionResult | null {
  if (n1 < 30 || n2 < 30) return null;
  if (![p1, p2].every((p) => Number.isFinite(p) && p >= 0 && p <= 1)) return null;
  const pooled = (p1 * n1 + p2 * n2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (se === 0) return null;
  const z = (p1 - p2) / se;
  const p = 2 * (1 - jStat.normal.cdf(Math.abs(z), 0, 1));
  // CI on the difference (Wald): (p1-p2) ± z_crit * sqrt(p1(1-p1)/n1 + p2(1-p2)/n2)
  const seWald = Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2);
  const alpha = 1 - level;
  const zCrit = jStat.normal.inv(1 - alpha / 2, 0, 1);
  const half = seWald ? zCrit * seWald : 0;
  return {
    test: 'two_proportion_z',
    z: Math.round(z * 10000) / 10000,
    p: roundP(p),
    effect: Math.round((p1 - p2) * 10000) / 10000,
    ci: {
      lower: Math.round((p1 - p2 - half) * 10000) / 10000,
      upper: Math.round((p1 - p2 + half) * 10000) / 10000,
      level,
    },
    n1,
    n2,
    p1: Math.round(p1 * 10000) / 10000,
    p2: Math.round(p2 * 10000) / 10000,
  };
}

/** Normal-approximation CI for a mean. Null when n < 2. */
export function meanCI(values: number[], level = 0.95): MeanCIResult | null {
  if (values.length < 2) return null;
  const n = values.length;
  const mean = values.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(values.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1));
  if (sd === 0) return null;
  const alpha = 1 - level;
  const z = jStat.normal.inv(1 - alpha / 2, 0, 1);
  const half = (z * sd) / Math.sqrt(n);
  return {
    mean: Math.round(mean * 10000) / 10000,
    sd: Math.round(sd * 10000) / 10000,
    n,
    ci: { lower: Math.round((mean - half) * 10000) / 10000, upper: Math.round((mean + half) * 10000) / 10000, level },
  };
}

/** Drop non-finite / NaN values (honest: a claim over corrupted data is not a claim). */
export function cleanNumbers(xs: number[]): number[] {
  return xs.filter((x) => Number.isFinite(x));
}

/** Round a p-value for display. Never returns exactly 0 for a non-zero input:
 *  p < 1e-6 is reported as 0.000001 (the true value is below that bound), so a
 *  scientist never sees an impossible "p=0". */
function roundP(p: number): number {
  if (!Number.isFinite(p) || p <= 0) return p <= 0 ? 0 : NaN;
  const r = Math.round(p * 1e6) / 1e6;
  return r <= 0 ? 1e-6 : r;
}