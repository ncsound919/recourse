# Synergy Plan 3 — Corrected Statistical Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the naive cross-domain significance rule (`|r| >= 0.5`, no sample size, no multiple-testing correction) with a defensible deterministic statistics layer: Fisher-z significance, Benjamini–Hochberg FDR, a stationarity/differencing utility, information-theoretic surprise, KL divergence, and a seeded surrogate-null p-value. Fix `trendEngine` to use it.

**Architecture:** A pure, dependency-free `src/lib/synergy/stats.ts`. `trendEngine.laggedCorrelation` gains `pValue`/`n` and derives `significant` from Fisher-z; `runTrendScan` applies BH-FDR across all cross-domain pair tests and marks `significant` from the corrected decision. All constants are calibration.

**Tech Stack:** TypeScript ESM (`.js`), vitest, no new deps.

**Spec:** design §8.7–8.8. **Depends on:** Plan 1.

**Deferred (documented, not implemented here):** Granger causality / transfer entropy (need their own validated implementations), and forcing stationarity differencing into the live trend pipeline.

---

## File Structure

**Create:** `src/lib/synergy/stats.ts`, `tests/synergy/stats.test.ts`
**Modify:** `src/lib/synergy/types.ts` (add optional `pValue`/`n` to `LaggedCorrelation`), `src/lib/trendEngine.ts`, `tests/trendEngine.test.ts` (add significance tests), `README.md`

---

### Task 1: Statistics core

**Files:** Create `src/lib/synergy/stats.ts`; Test `tests/synergy/stats.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/synergy/stats.test.ts
import { describe, it, expect } from 'vitest';
import {
  pearson, fisherZ, normalCdf, pearsonSignificance, benjaminiHochberg,
  lag1Autocorr, needsDifferencing, difference, surpriseBits, klDivergence, surrogatePValue,
} from '../../src/lib/synergy/stats.js';

describe('statistics', () => {
  it('pearson + fisher-z significance requires n>3', () => {
    const xs = Array.from({ length: 30 }, (_, i) => i);
    const ys = xs.map((x) => 2 * x + 1);
    const sig = pearsonSignificance(pearson(xs, ys).r, 30);
    expect(sig.p).toBeLessThan(0.001);
    expect(sig.significant).toBe(true);
    expect(pearsonSignificance(0.9, 3).significant).toBe(false); // n<=3 rejected
  });

  it('normalCdf is a valid CDF', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 3);
    expect(normalCdf(-3)).toBeLessThan(0.01);
    expect(normalCdf(3)).toBeGreaterThan(0.99);
  });

  it('benjaminiHochberg rejects the clear signals and reports q-values', () => {
    const { rejected, qvalues } = benjaminiHochberg([0.001, 0.008, 0.039, 0.041, 0.9], 0.05);
    expect(rejected[0]).toBe(true);
    expect(rejected[4]).toBe(false);
    expect(qvalues.every((q) => q >= 0 && q <= 1)).toBe(true);
  });

  it('lag-1 autocorrelation flags a random walk and not white noise', () => {
    let s = 12345 >>> 0;
    const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const walk: number[] = []; let v = 0;
    for (let i = 0; i < 200; i++) { v += rnd() - 0.5; walk.push(v); }
    expect(needsDifferencing(walk)).toBe(true);
    const white = Array.from({ length: 200 }, () => rnd() - 0.5);
    expect(needsDifferencing(white)).toBe(false);
    expect(difference(walk).length).toBe(walk.length - 1);
  });

  it('surprise and KL are well-defined', () => {
    expect(surpriseBits(0.5)).toBe(1);
    expect(surpriseBits(0)).toBe(Infinity);
    expect(klDivergence([0.5, 0.5], [0.5, 0.5])).toBe(0);
    expect(klDivergence([0.9, 0.1], [0.5, 0.5])).toBeGreaterThan(0);
  });

  it('surrogatePValue is deterministic and rejects an obvious association', () => {
    const xs = Array.from({ length: 40 }, (_, i) => i);
    const ys = xs.map((x) => x + 1);
    const stat = (a: number[], b: number[]) => pearson(a, b).r;
    const p1 = surrogatePValue(xs, ys, stat, { seed: 7, iterations: 200 });
    const p2 = surrogatePValue(xs, ys, stat, { seed: 7, iterations: 200 });
    expect(p1).toBe(p2);
    expect(p1).toBeLessThan(0.05);
  });
});
```

- [ ] **Step 2: Run to fail** → `npx vitest run tests/synergy/stats.test.ts` (module not found).

- [ ] **Step 3: Implement**

```ts
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
```

- [ ] **Step 4: Run to pass** → PASS (6 tests).
- [ ] **Step 5: Commit** `feat(synergy): add corrected statistics core`

---

### Task 2: Fix trendEngine significance

**Files:** Modify `src/lib/synergy/types.ts`, `src/lib/trendEngine.ts`; Test `tests/trendEngine.test.ts`

- [ ] **Step 1: Add failing test** to `tests/trendEngine.test.ts`:

```ts
  it('cross-correlation reports a Fisher-z p-value and requires enough points', () => {
    const a = flatSeries([1, 2, 3, 4, 5, 6, 7, 8], 'a', 'A');
    const b = flatSeries([1, 2, 3, 4, 5, 6, 7, 8], 'b', 'B');
    const lc = laggedCorrelation(a, b, 2);
    expect(lc.pValue ?? 1).toBeLessThan(0.05);
    // Tiny series: n<=3 cannot be significant.
    const tiny = laggedCorrelation(flatSeries([1, 2, 3], 'x', 'X'), flatSeries([3, 2, 1], 'y', 'Y'), 1);
    expect(tiny.significant).toBe(false);
  });
```

- [ ] **Step 2: Run to fail** → `npx vitest run tests/trendEngine.test.ts`.

- [ ] **Step 3: Implement**
  - `src/lib/synergy/types.ts` is NOT where `LaggedCorrelation` lives — it is defined in `src/lib/trendEngine.ts`. Add to `LaggedCorrelation`:
    ```ts
    import { pearson, pearsonSignificance } from './synergy/stats.js';
    // interface LaggedCorrelation { a; b; bestLag; correlation; significant; pValue?: number; n?: number; }
    ```
  - In `laggedCorrelation`, replace the significance rule. After computing the best `{lag, corr}` and the pair count for that best lag (track `bestN`), compute `sig = pearsonSignificance(best.corr, bestN)` and return `{ ..., pValue: sig.p, n: bestN, significant: sig.significant }`. Keep `correlation` rounding. If no pairs, return `{ ..., pValue: 1, n: 0, significant: false }`.
  - Do NOT use `pearson` for the scan (keep existing per-lag loop), but use `pearsonSignificance` for significance. (The `pearson` import is optional; drop if unused.)
  - In `runTrendScan`, after collecting `crossDomain`, apply BH-FDR over their `pValue`s and set `significant` to the corrected rejection:
    ```ts
    import { benjaminiHochberg } from './synergy/stats.js';
    const { rejected } = benjaminiHochberg(crossDomain.map((c) => c.pValue ?? 1));
    crossDomain.forEach((c, i) => { c.significant = rejected[i]; });
    ```
    Place this BEFORE building hypotheses/manifest so the manifest reflects corrected significance.
  - Update the crossDomain filter: currently `if (lc.significant) crossDomain.push(lc)` — keep pushing only uncorrected-significant pairs, then correct. (Or push all pairs then correct and filter; choose one and keep deterministic. Recommended: push all pairs with pValue, then after FDR keep only `rejected` ones via `crossDomain = crossDomain.filter((c) => c.significant)`.)

- [ ] **Step 4: Run to pass** → `npx vitest run tests/trendEngine.test.ts` all pass; run `tests/synergy` too.

- [ ] **Step 5: Commit** `fix(trend): Fisher-z significance and BH-FDR for cross-domain links`

---

### Task 3: README update

- [ ] Append to the synergy README section: "Cross-domain significance now uses the Fisher-z test (requires n>3) with Benjamini–Hochberg FDR across the scan; the old `|r|>=0.5` rule is removed. Granger causality, transfer entropy, and forced stationarity differencing are not yet wired (utilities exist in `stats.ts`)."
- [ ] `npx vitest run tests/synergy tests/trendEngine.test.ts` pass; `npx tsc --noEmit` 0.
- [ ] Commit `docs(synergy): note corrected cross-domain significance`

---

## Self-Review
Spec §8.7 (Fisher-z, BH-FDR, stationarity utility, surprise/KL, surrogate) → Tasks 1–3. Granger/TE deferred and documented. Determinism: seeded shuffle, sorted BH, no wall clock. `trendEngine` golden (none exists) unaffected; crossDomain composition may change but no fixed expectation.
