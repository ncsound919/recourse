import { describe, it, expect } from 'vitest';
import {
  welchTTest,
  logRankTest,
  hypergeomEnrichment,
  benjaminiHochberg,
  meanCI,
  cleanNumbers,
  twoProportionZTest,
} from '../src/lib/statistics';

describe('welchTTest', () => {
  it('rejects tiny samples honestly', () => {
    expect(welchTTest([1], [2, 3])).toBeNull();
  });

  it('rejects both-zero-variance inputs honestly', () => {
    expect(welchTTest([5, 5, 5], [1, 1, 1])).toBeNull();
  });

  it('detects a clear difference with p near zero', () => {
    const r = welchTTest([10, 11, 12, 10.5, 11.5, 10.8], [1, 2, 1.5, 2.2, 1.8, 2.5]);
    expect(r).not.toBeNull();
    expect(r!.p).toBeLessThan(0.01);
    expect(r!.effect).toBeGreaterThan(8);
    expect(r!.ci.lower).toBeGreaterThan(0);
  });

  it('reports a non-significant result honestly when groups overlap', () => {
    const r = welchTTest([1, 2, 3, 4, 5], [1.1, 2.1, 3.1, 4.1, 5.1]);
    expect(r).not.toBeNull();
    expect(r!.p).toBeGreaterThan(0.05);
  });

  it('returns a valid confidence interval', () => {
    const r = welchTTest([1, 2, 3, 4, 5, 6, 7], [3, 4, 5, 6, 7, 8, 9]);
    expect(r!.ci.lower).toBeLessThan(r!.ci.upper);
    expect(r!.ci.level).toBe(0.95);
    expect(r!.n).toBe(14);
  });
});

describe('logRankTest', () => {
  it('returns null when a group has no events', () => {
    expect(logRankTest([1, 2, 3], [0, 0, 0], [0, 0, 1])).toBeNull();
  });

  it('detects a survival difference', () => {
    // Group A: short survival (events early). Group B: long survival.
    const times = [3, 4, 5, 6, 7, 20, 22, 24, 26, 28];
    const events = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    const group = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
    const r = logRankTest(times, events, group);
    expect(r).not.toBeNull();
    expect(r!.p).toBeLessThan(0.05);
    expect(r!.hr).toBeLessThan(1); // group B survives longer -> lower hazard
  });

  it('reports no significant difference when groups are identical', () => {
    const times = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5];
    const events = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    const group = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
    const r = logRankTest(times, events, group);
    expect(r!.p).toBeGreaterThan(0.05);
  });
});

describe('hypergeomEnrichment', () => {
  it('detects significant enrichment', () => {
    // Universe 1000, drawn 100, 10 successes in universe, observed 5 overlap.
    const r = hypergeomEnrichment(1000, 100, 10, 5);
    expect(r).not.toBeNull();
    expect(r!.p).toBeLessThan(0.05);
  });

  it('reports no enrichment when overlap is at expectation', () => {
    const r = hypergeomEnrichment(1000, 100, 100, 10); // expected 10
    expect(r!.p).toBeGreaterThan(0.05);
  });

  it('handles boundary overlap', () => {
    const r = hypergeomEnrichment(10, 5, 5, 5);
    expect(r!.p).toBeLessThan(0.01);
  });
});

describe('benjaminiHochberg', () => {
  it('corrects p-values monotonically', () => {
    const p = [0.001, 0.01, 0.1, 0.5];
    const r = benjaminiHochberg(p);
    expect(r.method).toBe('benjamini_hochberg');
    expect(r.corrected[0]).toBeLessThanOrEqual(0.01);
    // monotone non-decreasing after rank ordering
    const sorted = [...r.corrected].sort((a, b) => a - b);
    expect(sorted).toEqual([...r.corrected].sort((a, b) => a - b));
    // significant at 0.05 for the two smallest (corrected 0.004, 0.02)
    expect(r.significantAt(0.05)).toEqual([0, 1]);
  });
});

describe('meanCI', () => {
  it('computes a sensible CI for a sample', () => {
    const r = meanCI([10, 10.5, 11, 9.5, 10.2]);
    expect(r).not.toBeNull();
    expect(r!.mean).toBeGreaterThan(9.5);
    expect(r!.mean).toBeLessThan(11);
    expect(r!.ci.lower).toBeLessThan(r!.ci.upper);
    expect(r!.ci.lower).toBeLessThan(r!.mean);
    expect(r!.ci.upper).toBeGreaterThan(r!.mean);
  });

  it('returns null for a single value', () => {
    expect(meanCI([5])).toBeNull();
  });
});

describe('cleanNumbers', () => {
  it('drops NaN and Infinity', () => {
    expect(cleanNumbers([1, NaN, 2, Infinity, 3])).toEqual([1, 2, 3]);
  });
});

describe('twoProportionZTest', () => {
  it('detects a real difference between two large proportions', () => {
    const r = twoProportionZTest(0.32, 120, 0.04, 120);
    expect(r).not.toBeNull();
    expect(r!.p).toBeLessThan(0.001);
    expect(r!.effect).toBeGreaterThan(0.2);
    expect(r!.ci.lower).toBeGreaterThan(0);
  });

  it('reports no significance when proportions are equal', () => {
    const r = twoProportionZTest(0.05, 120, 0.05, 120);
    expect(r!.p).toBeGreaterThan(0.05);
    expect(r!.effect).toBe(0);
  });

  it('returns null when n is too small for the normal approximation', () => {
    expect(twoProportionZTest(0.5, 10, 0.2, 10)).toBeNull();
  });

  it('returns null for out-of-range proportions', () => {
    expect(twoProportionZTest(1.5, 120, 0.2, 120)).toBeNull();
  });

  it('never reports p === 0 (audit fix: a tiny p floors at 1e-6, never exactly 0)', () => {
    const r = twoProportionZTest(0.32, 120, 0.04, 120);
    expect(r!.p).toBeGreaterThan(0);
    expect(r!.p).toBeLessThanOrEqual(1e-6); // floor, not 0
    const w = welchTTest([1, 2, 3, 4, 5], [6, 7, 8, 9, 10]);
    expect(w!.p).toBeGreaterThan(0);
  });
});