import { describe, it, expect } from 'vitest';
import {
  grangerCausality,
  transferEntropy,
  stationarize,
  lag1Autocorr,
} from '../../src/lib/synergy/stats';

/** Deterministic pseudo-random noise (no Math.random). */
function noise(n: number, seed = 1): number[] {
  let s = seed >>> 0;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out.push(s / 4294967296);
  }
  return out;
}

describe('grangerCausality', () => {
  it('detects a one-lag leading indicator', () => {
    // x drives y with a lag: y[t] = x[t-1] + small deterministic noise.
    const n = 120;
    const e = noise(n, 7).map((v) => (v - 0.5) * 0.1);
    const x: number[] = [];
    const y: number[] = [];
    for (let t = 0; t < n; t++) {
      x.push(Math.sin(t / 5) + e[t]);
      y.push((t > 0 ? x[t - 1] : 0) + e[t] * 0.2);
    }
    const r = grangerCausality(x, y, 3);
    expect(r.ok).toBe(true);
    expect(r.bestLag).toBe(1);
    expect(r.significant).toBe(true);
  });

  it('does not flag independent series as causal', () => {
    const n = 120;
    const e1 = noise(n, 11);
    const e2 = noise(n, 29);
    const r = grangerCausality(e1, e2, 3);
    expect(r.ok).toBe(true);
    expect(r.significant).toBe(false);
  });

  it('reports ok:false for a short series', () => {
    const r = grangerCausality([1, 2, 3, 4], [1, 2, 3, 4], 3);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/samples/);
  });
});

describe('transferEntropy', () => {
  it('is deterministic for identical input', () => {
    const n = 200;
    const x = noise(n, 3);
    const y = x.map((v, i) => (i > 0 ? x[i - 1] : 0));
    const a = transferEntropy(x, y, { bins: 4, history: 1 });
    const b = transferEntropy(x, y, { bins: 4, history: 1 });
    expect(a).toEqual(b);
    expect(a.ok).toBe(true);
  });

  it('reports ok:false below the sample minimum', () => {
    const r = transferEntropy([1, 2, 3, 4, 5], [2, 1, 3, 5, 4], { minSamples: 64 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/samples/);
  });

  it('scores a coupled pair higher than a shuffled surrogate', () => {
    const n = 400;
    const x = noise(n, 5);
    // y is a deterministic function of x's recent value -> strong coupling.
    const y = x.map((v, i) => (i >= 2 ? (x[i - 1] > 0.5 ? x[i - 2] : 1 - x[i - 2]) : v));
    const coupled = transferEntropy(x, y, { bins: 4, history: 2, minSamples: 64 });
    // A surrogate: rotate x so the temporal coupling is destroyed.
    const shifted = x.map((_, i) => x[(i + 137) % n]);
    const surrogate = transferEntropy(shifted, y, { bins: 4, history: 2, minSamples: 64 });
    expect(coupled.ok).toBe(true);
    expect(surrogate.ok).toBe(true);
    expect(coupled.bits).toBeGreaterThan(0);
    expect(coupled.bits).toBeGreaterThan(surrogate.bits);
  });
});

describe('stationarize', () => {
  it('differences a random walk into stationarity', () => {
    // Accumulated noise = random walk with strong lag-1 autocorrelation.
    const steps = noise(200, 13).map((v) => v - 0.5);
    const walk: number[] = [];
    let acc = 0;
    for (const s of steps) {
      acc += s;
      walk.push(acc);
    }
    expect(Math.abs(lag1Autocorr(walk))).toBeGreaterThan(0.8);
    const r = stationarize(walk);
    expect(r.transforms.length).toBeGreaterThan(0);
    expect(r.series.length).toBeLessThan(walk.length);
    expect(Math.abs(lag1Autocorr(r.series))).toBeLessThan(0.8);
  });

  it('leaves white noise unchanged', () => {
    const white = noise(200, 17).map((v) => v - 0.5);
    const r = stationarize(white);
    expect(r.transforms).toEqual([]);
    expect(r.series).toEqual(white);
  });
});
