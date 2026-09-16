// src/lib/synergy/stats.ts
/**
 * Deterministic statistical evidence for the synergy engine. No wall clock.
 * Constants are calibration. Fisher-z significance, BH-FDR, lag-1 stationarity
 * heuristic + differencing, self-information, KL divergence, seeded surrogate
 * null, linear Granger causality (F-test) and histogram transfer entropy.
 * `jstat` provides the F-distribution CDF (already a project dependency).
 */
import jStat from 'jstat';
export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function pearson(xs: number[], ys: number[]): { r: number; n: number } {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return { r: 0, n };
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let cov = 0; let vx = 0; let vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx; const dy = ys[i] - my;
    cov += dx * dy; vx += dx * dx; vy += dy * dy;
  }
  const denom = Math.sqrt(vx * vy);
  return { r: denom === 0 ? 0 : cov / denom, n };
}

export function fisherZ(r: number): number {
  const c = Math.max(-0.999999, Math.min(0.999999, r));
  return 0.5 * Math.log((1 + c) / (1 - c));
}

function erf(x: number): number {
  const s = Math.sign(x); const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-a * a);
  return s * y;
}

export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** Two-sided Fisher-z test for a Pearson correlation. Requires n > 3. */
export function pearsonSignificance(r: number, n: number): { z: number; p: number; significant: boolean } {
  if (n <= 3) return { z: 0, p: 1, significant: false };
  const z = fisherZ(r) * Math.sqrt(n - 3);
  const p = 2 * (1 - normalCdf(Math.abs(z)));
  return { z: Math.round(z * 1000) / 1000, p: Math.round(p * 1e6) / 1e6, significant: p < 0.05 };
}

/** Benjamini-Hochberg FDR. Returns per-input rejections and monotone q-values. */
export function benjaminiHochberg(pValues: number[], q = 0.05): { rejected: boolean[]; qvalues: number[] } {
  const m = pValues.length;
  const rejected = new Array(m).fill(false);
  const qvalues = new Array(m).fill(1);
  if (m === 0) return { rejected, qvalues };
  const order = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p || a.i - b.i);
  let k = 0;
  for (let i = 0; i < m; i++) if (order[i].p <= ((i + 1) / m) * q) k = i + 1;
  for (let i = 0; i < k; i++) rejected[order[i].i] = true;
  let running = 1;
  for (let i = m - 1; i >= 0; i--) {
    const raw = (order[i].p * m) / (i + 1);
    running = Math.min(running, raw);
    qvalues[order[i].i] = Math.round(Math.min(1, running) * 1e6) / 1e6;
  }
  return { rejected, qvalues };
}

export function lag1Autocorr(v: number[]): number {
  if (v.length < 3) return 0;
  const m = mean(v);
  let num = 0; let den = 0;
  for (let i = 1; i < v.length; i++) num += (v[i] - m) * (v[i - 1] - m);
  for (let i = 0; i < v.length; i++) den += (v[i] - m) * (v[i] - m);
  return den === 0 ? 0 : num / den;
}

/** Labeled heuristic: near-unit-root lag-1 autocorrelation. */
export function needsDifferencing(v: number[], threshold = 0.8): boolean {
  return lag1Autocorr(v) > threshold;
}

export function difference(v: number[]): number[] {
  return v.slice(1).map((x, i) => x - v[i]);
}

/**
 * Difference a series until its lag-1 autocorrelation falls below `threshold`,
 * returning the transform chain. Random walks become stationary; white noise is
 * returned unchanged (empty chain). Iterations are capped so a pathological
 * series cannot loop forever.
 */
export function stationarize(
  v: number[],
  opts: { threshold?: number; maxIterations?: number } = {},
): { series: number[]; transforms: string[] } {
  const threshold = opts.threshold ?? 0.8;
  const maxIterations = Math.max(0, opts.maxIterations ?? 3);
  let series = [...v];
  const transforms: string[] = [];
  for (let i = 0; i < maxIterations; i++) {
    if (series.length < 3 || !needsDifferencing(series, threshold)) break;
    series = difference(series);
    transforms.push('difference');
  }
  return { series, transforms };
}

// ---------------------------------------------------------------------------
// Directional lead-lag: Granger causality (linear) + transfer entropy (nonlinear)
// ---------------------------------------------------------------------------

export interface GrangerResult {
  ok: boolean;
  bestLag: number;
  fStat: number;
  p: number;
  significant: boolean;
  n: number;
  reason?: string;
}

/** Solve the normal equations (X'X)b = X'y via Gaussian elimination. */
function olsResiduals(y: number[], X: number[][]): number {
  const k = X[0].length;
  const xtx: number[][] = Array.from({ length: k }, () => Array.from({ length: k }, () => 0));
  const xty: number[] = Array.from({ length: k }, () => 0);
  for (let i = 0; i < y.length; i++) {
    for (let a = 0; a < k; a++) {
      xty[a] += X[i][a] * y[i];
      for (let b = 0; b < k; b++) xtx[a][b] += X[i][a] * X[i][b];
    }
  }
  // Augment and reduce.
  const M = xtx.map((row, i) => [...row, xty[i]]);
  for (let col = 0; col < k; col++) {
    let piv = col;
    for (let r = col + 1; r < k; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) return Infinity;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col];
    for (let c = col; c <= k; c++) M[col][c] /= d;
    for (let r = 0; r < k; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let c = col; c <= k; c++) M[r][c] -= f * M[col][c];
    }
  }
  const beta = M.map((row) => row[k]);
  let rss = 0;
  for (let i = 0; i < y.length; i++) {
    let pred = 0;
    for (let a = 0; a < k; a++) pred += beta[a] * X[i][a];
    const e = y[i] - pred;
    rss += e * e;
  }
  return rss;
}

/**
 * Linear Granger causality: does X help predict Y beyond Y's own lags?
 * OLS + F-test over lags 1..maxLag; returns the strongest lag. Linear only —
 * a nonlinear dependence may be invisible here (use transferEntropy for that).
 * Honest: `ok:false` when there are too few samples for a stable fit.
 */
export function grangerCausality(xs: number[], ys: number[], maxLag = 3): GrangerResult {
  const n = Math.min(xs.length, ys.length);
  let best: GrangerResult | null = null;
  for (let lag = 1; lag <= Math.max(1, maxLag); lag++) {
    const start = lag;
    const N = n - start;
    if (N < 3 * lag + 2 || N <= 2 * lag + 1) continue;
    const Xr: number[][] = [];
    const Xu: number[][] = [];
    const Y: number[] = [];
    for (let t = start; t < n; t++) {
      const yr = [1];
      for (let l = 1; l <= lag; l++) yr.push(ys[t - l]);
      const xu = [...yr];
      for (let l = 1; l <= lag; l++) xu.push(xs[t - l]);
      Xr.push(yr);
      Xu.push(xu);
      Y.push(ys[t]);
    }
    const rssR = olsResiduals(Y, Xr);
    const rssU = olsResiduals(Y, Xu);
    const df2 = N - (2 * lag + 1);
    if (!Number.isFinite(rssR) || !Number.isFinite(rssU) || df2 <= 0 || rssU <= 0) continue;
    const fStat = ((rssR - rssU) / lag) / (rssU / df2);
    const p = Math.max(0, 1 - jStat.centralF.cdf(Math.max(0, fStat), lag, df2));
    const round = (x: number) => Math.round(x * 1e6) / 1e6;
    const candidate: GrangerResult = {
      ok: true,
      bestLag: lag,
      fStat: round(fStat),
      p: round(p),
      significant: p < 0.05,
      n: N,
    };
    if (!best || candidate.p < best.p) best = candidate;
  }
  if (!best) {
    return { ok: false, bestLag: maxLag, fStat: 0, p: 1, significant: false, n, reason: 'too few samples for a stable fit' };
  }
  return best;
}

export interface TransferEntropyResult {
  ok: boolean;
  bits: number;
  n: number;
  bins: number;
  history: number;
  reason?: string;
}

/** Bin a series into `bins` equal-width buckets over [min,max] (deterministic). */
function binned(v: number[], bins: number): number[] {
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const span = hi - lo || 1;
  return v.map((x) => Math.min(bins - 1, Math.max(0, Math.floor(((x - lo) / span) * bins))));
}

/**
 * Histogram transfer entropy TE(X -> Y) with `history`-deep embedding. Reports
 * `ok:false` below `minSamples` — TE is sample-hungry and bin-sensitive, so a
 * low-sample estimate is withheld rather than returned as noise.
 */
export function transferEntropy(
  xs: number[],
  ys: number[],
  opts: { bins?: number; history?: number; minSamples?: number } = {},
): TransferEntropyResult {
  const bins = Math.max(2, opts.bins ?? 4);
  const history = Math.max(1, opts.history ?? 1);
  const minSamples = Math.max(16, opts.minSamples ?? 64);
  const n = Math.min(xs.length, ys.length);
  const bx = binned(xs.slice(0, n), bins);
  const by = binned(ys.slice(0, n), bins);
  const usable = n - history;
  if (usable < minSamples) {
    return { ok: false, bits: 0, n: usable, bins, history, reason: `need >= ${minSamples} usable samples` };
  }
  const joint = new Map<string, number>(); // (y', yhist, xhist)
  const yHistXHist = new Map<string, number>();
  const yNextYHist = new Map<string, number>();
  const yHist = new Map<string, number>();
  let total = 0;
  const key = (arr: Array<number | string>) => arr.join(',');
  for (let t = history; t < n; t++) {
    const yNext = by[t];
    const yh: number[] = [];
    const xh: number[] = [];
    for (let l = 1; l <= history; l++) {
      yh.push(by[t - l]);
      xh.push(bx[t - l]);
    }
    const k3 = key([yNext, ...yh, ...xh]);
    const k2a = key([...yh, ...xh]);
    const k2b = key([yNext, ...yh]);
    const k1 = key(yh);
    joint.set(k3, (joint.get(k3) ?? 0) + 1);
    yHistXHist.set(k2a, (yHistXHist.get(k2a) ?? 0) + 1);
    yNextYHist.set(k2b, (yNextYHist.get(k2b) ?? 0) + 1);
    yHist.set(k1, (yHist.get(k1) ?? 0) + 1);
    total++;
  }
  let bits = 0;
  for (const [k3, c3] of joint) {
    const parts = k3.split(',');
    const yNext = parts[0];
    const yh = parts.slice(1, 1 + history);
    const xh = parts.slice(1 + history);
    const k2a = key([...yh, ...xh]);
    const k2b = key([Number(yNext), ...yh]);
    const k1 = key(yh);
    const p3 = c3 / total;
    const pCond = c3 / (yHistXHist.get(k2a) ?? c3);
    const pCondY = (yNextYHist.get(k2b) ?? 0) / (yHist.get(k1) ?? 1);
    if (pCond > 0 && pCondY > 0) bits += p3 * Math.log2(pCond / pCondY);
  }
  return { ok: true, bits: Math.round(bits * 1e6) / 1e6, n: usable, bins, history };
}

export function surpriseBits(p: number): number {
  return p <= 0 ? Infinity : -Math.log2(Math.min(1, p));
}

export function klDivergence(pObs: number[], qNull: number[]): number {
  const n = Math.min(pObs.length, qNull.length);
  let kl = 0;
  for (let i = 0; i < n; i++) {
    const p = pObs[i]; const q = qNull[i];
    if (p > 0 && q > 0) kl += p * Math.log2(p / q);
  }
  return Math.round(kl * 1e6) / 1e6;
}

/** Deterministic seeded shuffle (mulberry32) then Fisher-Yates. */
function shuffled<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Two-sided-ish surrogate p-value: shuffles `b` and counts |stat| >= |observed|. */
export function surrogatePValue(
  a: number[], b: number[],
  stat: (x: number[], y: number[]) => number,
  opts: { seed?: number; iterations?: number } = {},
): number {
  const iterations = Math.max(1, opts.iterations ?? 200);
  const seed = opts.seed ?? 1;
  const observed = Math.abs(stat(a, b));
  let count = 0;
  for (let i = 0; i < iterations; i++) {
    if (Math.abs(stat(a, shuffled(b, seed + i))) >= observed) count += 1;
  }
  return Math.round(((1 + count) / (1 + iterations)) * 1e6) / 1e6;
}
