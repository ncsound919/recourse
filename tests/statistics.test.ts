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

  it('detects a clear difference with p at the 1e-6 floor', () => {
    const r = welchTTest([10, 11, 12, 10.5, 11.5, 10.8], [1, 2, 1.5, 2.2, 1.8, 2.5]);
    expect(r).not.toBeNull();
    expect(r!.t).toBe(25.1811);
    expect(r!.df).toBe(9.25);
    expect(r!.p).toBe(0.000001);
    expect(r!.meanA).toBe(10.9667);
    expect(r!.meanB).toBe(1.8333);
    expect(r!.effect).toBe(9.1333);
    expect(r!.ci.lower).toBe(8.3163);
    expect(r!.ci.upper).toBe(9.9504);
  });

  it('reports a non-significant result honestly when groups overlap', () => {
    const r = welchTTest([1, 2, 3, 4, 5], [1.1, 2.1, 3.1, 4.1, 5.1]);
    expect(r).not.toBeNull();
    expect(r!.t).toBe(-0.1);
    expect(r!.df).toBe(8);
    expect(r!.p).toBe(0.922805);
    expect(r!.effect).toBe(-0.1);
  });

  it('returns a valid confidence interval', () => {
    const r = welchTTest([1, 2, 3, 4, 5, 6, 7], [3, 4, 5, 6, 7, 8, 9]);
    expect(r!.t).toBe(-1.7321);
    expect(r!.df).toBe(12);
    expect(r!.p).toBe(0.108864);
    expect(r!.effect).toBe(-2);
    expect(r!.ci.lower).toBe(-4.5159);
    expect(r!.ci.upper).toBe(0.5159);
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
    expect(r!.chi2).toBe(9.7007);
    expect(r!.p).toBe(0.001842);
    expect(r!.hr).toBe(0.2153); // group B survives longer -> lower hazard
    expect(r!.nA).toBe(5);
    expect(r!.nB).toBe(5);
  });

  it('reports no significant difference when groups are identical', () => {
    const times = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5];
    const events = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    const group = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
    const r = logRankTest(times, events, group);
    expect(r!.chi2).toBe(0);
    expect(r!.p).toBe(1);
    expect(r!.hr).toBe(1);
  });
});

describe('hypergeomEnrichment', () => {
  it('detects significant enrichment', () => {
    // Universe 1000, drawn 100, 10 successes in universe, observed 5 overlap.
    const r = hypergeomEnrichment(1000, 100, 10, 5);
    expect(r).not.toBeNull();
    expect(r!.p).toBe(0.001521);
  });

  it('reports no enrichment when overlap is at expectation', () => {
    const r = hypergeomEnrichment(1000, 100, 100, 10); // expected 10
    expect(r!.p).toBe(0.555019);
  });

  it('handles boundary overlap', () => {
    const r = hypergeomEnrichment(10, 5, 5, 5);
    expect(r!.p).toBe(0.003968);
  });
});

describe('benjaminiHochberg', () => {
  it('corrects p-values via the standard BH step-up procedure', () => {
    const p = [0.001, 0.01, 0.1, 0.5];
    const r = benjaminiHochberg(p);
    expect(r.method).toBe('benjamini_hochberg');
    expect(r.corrected).toEqual([0.004, 0.02, 0.133333, 0.5]);
    // significant at 0.05 for the two smallest (corrected 0.004, 0.02)
    expect(r.significantAt(0.05)).toEqual([0, 1]);
  });
});

describe('meanCI', () => {
  it('computes the exact normal-approx CI for a sample', () => {
    const r = meanCI([10, 10.5, 11, 9.5, 10.2]);
    expect(r).not.toBeNull();
    expect(r!.mean).toBe(10.24);
    expect(r!.sd).toBe(0.5595);
    expect(r!.n).toBe(5);
    expect(r!.ci.lower).toBe(9.7496);
    expect(r!.ci.upper).toBe(10.7304);
    expect(r!.ci.level).toBe(0.95);
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
    expect(r!.z).toBe(5.6453);
    expect(r!.p).toBe(0.000001);
    expect(r!.effect).toBe(0.28);
    expect(r!.ci.lower).toBe(0.1895);
    expect(r!.ci.upper).toBe(0.3705);
  });

  it('reports no significance when proportions are equal', () => {
    const r = twoProportionZTest(0.05, 120, 0.05, 120);
    expect(r!.z).toBe(0);
    expect(r!.p).toBe(1);
    expect(r!.effect).toBe(0);
    expect(r!.ci.lower).toBe(-0.0551);
    expect(r!.ci.upper).toBe(0.0551);
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
    expect(w!.p).toBe(0.001053);
  });
});