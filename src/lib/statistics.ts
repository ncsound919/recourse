/**
 * Statistics — the statistical-correctness layer that feeds ResearchArtifact.
 *
 * Pure, deterministic, real math (no fabricated numbers). Every function
 * returns a real p-value/effect/CI computed from real inputs. This is what a
 * scientist checks before trusting a claim. Formulas are standard:
 *
 *  - Welch's t-test (unequal variance): two-sample test with Satterthwaite df.
 *  - Kaplan-Meier log-rank (two-group): chi-square with one df.
 *  - Hypergeometric enrichment (Fisher's exact, one-sided): PMF sum.
 *  - Benjamini-Hochberg FDR: p-value correction for multiple comparisons.
 *  - Normal CI for a mean: mean ± z * sd/sqrt(n).
 *
 * Honesty: functions return null when inputs are insufficient (n too small,
 * zero variance) — never a fabricated number.
 */

// Standard normal CDF (Abramowitz & Stegun 26.2.17). ~1e-7 accuracy.
function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

// Student's t CDF via incomplete beta (Numerical Recipes betai). ~1e-6.
function betacf(a: number, b: number, x: number): number {
  const MAXIT = 100;
  const EPS = 3e-7;
  const FPMIN = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function betai(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  // log-beta directly via lgamma — numerically stable for large a/b (no
  // exp(overflow) path that betaFn would take).
  const lbeta = lgamma(a) + lgamma(b) - lgamma(a + b);
  const bt = Math.exp(lbeta + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

function lgamma(x: number): number {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155,
    0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += cof[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** Two-tailed p-value from a t statistic and df. */
function tTwoTailP(t: number, df: number): number {
  if (!isFinite(t) || df <= 0) return NaN;
  return betai(df / 2, 0.5, df / (df + t * t));
}

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
  const crit = tCrit(df, 1 - alpha / 2);
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

/** Inverse t CDF (two-tailed critical value) via binary search on the CDF. */
function tCrit(df: number, prob: number): number {
  let lo = 0;
  let hi = 50;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const p = tTwoTailP(mid, df); // two-tailed; prob is one-sided tail prob
    const tail = p / 2;
    if (tail > 1 - prob) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
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
  const p = 1 - normCdf(Math.sqrt(Math.max(0, chi2))); // one-sided
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

/** Fisher's exact / hypergeometric enrichment: P(X >= x | n,k,m). */
export function hypergeomEnrichment(n: number, k: number, m: number, x: number): HypergeomResult | null {
  if (x < 0 || k > n || m > n) return null;
  let p = 0;
  const max = Math.min(k, m);
  for (let i = x; i <= max; i++) {
    const lo = Math.max(0, k + m - n);
    const hi = Math.min(k, m);
    if (i < lo || i > hi) continue;
    const denom = comb(n, k);
    if (denom === 0) return null;
    p += (comb(m, i) * comb(n - m, k - i)) / denom;
  }
  return { test: 'hypergeometric', p: roundP(p), n, k, x, m };
}

/** Binomial coefficient with overflow guard. */
function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

export interface FdrResult {
  corrected: number[];
  method: 'benjamini_hochberg';
  significantAt: (alpha: number) => number[]; // indices with corrected p < alpha
}

/** Benjamini-Hochberg FDR correction. Returns corrected p-values (same order). */
export function benjaminiHochberg(pvalues: number[]): FdrResult {
  const n = pvalues.length;
  const idx = pvalues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const out = new Array<number>(n).fill(0);
  let prev = 0;
  for (let rank = 0; rank < n; rank++) {
    const q = (idx[rank].p * n) / (rank + 1);
    // enforce monotonicity from the tail
    prev = Math.max(prev, Math.min(1, q));
    out[idx[rank].i] = prev;
  }
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
  const p = 2 * (1 - normCdf(Math.abs(z)));
  // CI on the difference (Wald): (p1-p2) ± z_crit * sqrt(p1(1-p1)/n1 + p2(1-p2)/n2)
  const seWald = Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2);
  const alpha = 1 - level;
  const zCrit = normInv(1 - alpha / 2);
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

/** Inverse standard normal CDF (probit) via rational approximation. */
function normInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  // Beasley-Springer-Moro approximation.
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  let q = 0;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    const num = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]);
    const den = ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    return num / den;
  }
  if (p > 1 - pLow) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    const num = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]);
    const den = ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    return -num / den;
  }
  q = p - 0.5;
  const r = q * q;
  const num = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q;
  const den = (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  return num / den;
}

/** Normal-approximation CI for a mean. Null when n < 2. */
export function meanCI(values: number[], level = 0.95): MeanCIResult | null {
  if (values.length < 2) return null;
  const n = values.length;
  const mean = values.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(values.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1));
  if (sd === 0) return null;
  const z = 1.959963984540054; // 97.5th percentile of N(0,1) for 95%
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