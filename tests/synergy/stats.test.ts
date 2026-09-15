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
