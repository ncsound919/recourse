// src/lib/synergy/stats.ts
/**
 * Deterministic statistical evidence for the synergy engine. No deps, no wall
 * clock. Constants are calibration. Fisher-z significance, BH-FDR, lag-1
 * stationarity heuristic, self-information, KL divergence, seeded surrogate null.
 */
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
  return Math.abs(lag1Autocorr(v)) > threshold;
}

export function difference(v: number[]): number[] {
  return v.slice(1).map((x, i) => x - v[i]);
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
