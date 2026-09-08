import { describe, it, expect } from 'vitest';
import {
  poolMetaAnalysis,
  calibratePriors,
  seFromCi,
  seFromGroups,
  parseAbstractForEffect,
  type TrialEvidence,
} from '../src/lib/musicTherapyEvidence';

const ANCHORS = {
  anxietySai: { mean: -7.7, sd: 2.0, source: 'Cochrane 2021 (CD006911), n=5576' },
  hr: { mean: -5.0, sd: 2.5, source: 'Cochrane 2021 meta-analysis' },
  bpSystolic: { mean: -6.0, sd: 3.0, source: 'Cochrane 2021 meta-analysis' },
  cortisol: { mean: -0.25, sd: 0.12, source: 'neuroendocrine studies' },
  iga: { mean: 0.3, sd: 0.15, source: 'salivary IgA studies' },
  hrv: { mean: 0.2, sd: 0.1, source: 'Tibetan singing bowl pilot' },
};

describe('music therapy evidence meta-analysis', () => {
  it('pools identical studies to the same effect with zero heterogeneity', () => {
    const recs: TrialEvidence[] = [
      { biomarker: 'anxietySai', effect: -5, se: 1.5, n: 60, year: 2019, source: 's1', pmid: null },
      { biomarker: 'anxietySai', effect: -5, se: 1.5, n: 60, year: 2020, source: 's2', pmid: null },
    ];
    const p = poolMetaAnalysis(recs)!;
    expect(p.pooledEffect).toBe(-5);
    expect(p.iSquared).toBe(0);
    expect(p.k).toBe(2);
    expect(p.totalN).toBe(120);
  });

  it('weighted pooling favors low-SE studies', () => {
    const recs: TrialEvidence[] = [
      { biomarker: 'anxietySai', effect: -2, se: 10, n: 10, year: 2019, source: 'low-weight', pmid: null },
      { biomarker: 'anxietySai', effect: -8, se: 1, n: 200, year: 2020, source: 'high-weight', pmid: null },
    ];
    const p = poolMetaAnalysis(recs)!;
    // The -8 study has 100x the weight -> pooled should be near -8.
    expect(p.pooledEffect).toBeLessThan(-7);
    expect(p.se).toBeLessThan(1.5); // precision driven by the high-weight study
  });

  it('random-effects SD includes between-study variance (sd > se when heterogeneous)', () => {
    const recs: TrialEvidence[] = [
      { biomarker: 'anxietySai', effect: -1, se: 1, n: 100, year: 2019, source: 'a', pmid: null },
      { biomarker: 'anxietySai', effect: -9, se: 1, n: 100, year: 2020, source: 'b', pmid: null },
      { biomarker: 'anxietySai', effect: -5, se: 1, n: 100, year: 2021, source: 'c', pmid: null },
    ];
    const p = poolMetaAnalysis(recs)!;
    expect(p.sd).toBeGreaterThan(p.se); // tau² > 0 pulls sd up
    expect(p.iSquared).toBeGreaterThan(50); // highly heterogeneous
  });

  it('returns null when no study has a SE (nothing to pool)', () => {
    const recs: TrialEvidence[] = [
      { biomarker: 'anxietySai', effect: -5, se: null, n: 50, year: 2019, source: 'qual', pmid: null, qualitative: true },
    ];
    expect(poolMetaAnalysis(recs)).toBeNull();
  });

  it('calibratePriors uses pooled estimates when evidence exists, anchor otherwise', () => {
    const recs: TrialEvidence[] = [
      { biomarker: 'anxietySai', effect: -6, se: 1.2, n: 80, year: 2021, source: 'real trial', pmid: null },
      { biomarker: 'anxietySai', effect: -7, se: 2.0, n: 60, year: 2020, source: 'real trial 2', pmid: null },
    ];
    const priors = calibratePriors(recs, ANCHORS);
    const anx = priors.find((p) => p.biomarker === 'anxietySai')!;
    expect(anx.calibrated).toBe(true);
    expect(anx.pooled).not.toBeNull();
    expect(anx.mean).toBeCloseTo(-6.277, 1);
    expect(anx.source).toContain('pooled meta-analysis');
    // hrv has no evidence -> stays anchor, uncalibrated.
    const hrv = priors.find((p) => p.biomarker === 'hrv')!;
    expect(hrv.calibrated).toBe(false);
    expect(hrv.mean).toBe(ANCHORS.hrv.mean);
  });

  it('refuses to calibrate on a single study (k=1 below MIN_POOLABLE_STUDIES)', () => {
    const recs: TrialEvidence[] = [
      { biomarker: 'anxietySai', effect: -1.05, se: 0.29, n: 40, year: 2023, source: 'single outlier', pmid: null },
    ];
    const priors = calibratePriors(recs, ANCHORS);
    const anx = priors.find((p) => p.biomarker === 'anxietySai')!;
    expect(anx.calibrated).toBe(false); // anchor kept
    expect(anx.mean).toBe(ANCHORS.anxietySai.mean); // -7.7, not the single -1.05
    expect(anx.source).toContain('MIN_POOLABLE_STUDIES=2'); // discrepancy is visible
    expect(anx.unpoolableCount).toBe(1); // the candidate is counted, not hidden
  });

  it('seFromCi recovers the SE from a 95% CI', () => {
    // 95% CI -10.7 to -4.6 -> SE = (10.7-4.6)/3.92 ≈ 1.56
    expect(seFromCi(-10.7, -4.6)).toBeCloseTo(1.556, 2);
  });

  it('seFromGroups uses pooled SD across arms', () => {
    // arm1 sd=2 n=10, arm2 sd=2 n=10 -> sp=2 -> SE = 2*sqrt(2/10) ≈ 0.894
    expect(seFromGroups(2, 10, 2, 10)).toBeCloseTo(0.8944, 3);
  });

  it('parseAbstractForEffect extracts MD + CI from a real-style abstract', () => {
    const abs = 'Music reduced anxiety (MD = -7.7, 95% CI -10.7 to -4.6) in chemotherapy patients.';
    const r = parseAbstractForEffect(abs, 'anxietySai');
    expect(r.matched).toBe(true);
    expect(r.effect).toBeCloseTo(-7.7);
    expect(r.se).toBeCloseTo(1.556, 2);
  });

  it('parseAbstractForEffect returns null for qualitative-only abstracts (honest)', () => {
    const abs = 'Music therapy was associated with significantly lower anxiety (p<0.05). No effect size reported.';
    const r = parseAbstractForEffect(abs, 'anxietySai');
    expect(r.matched).toBe(false);
    expect(r.effect).toBeNull();
  });

  it('qualitative studies are counted but never pooled into numbers', () => {
    const recs: TrialEvidence[] = [
      { biomarker: 'anxietySai', effect: -6, se: 1.0, n: 40, year: 2021, source: 'poolable', pmid: null },
      { biomarker: 'anxietySai', effect: -6.5, se: 1.2, n: 55, year: 2020, source: 'poolable 2', pmid: null },
    ];
    const all: TrialEvidence[] = [
      ...recs,
      {
        biomarker: 'anxietySai', effect: 0, se: null, n: null,
        year: 2022, source: 'qual study', pmid: null, qualitative: true,
        detail: 'significant reduction (p<0.05)',
      },
    ];
    const priors = calibratePriors(all, ANCHORS);
    const anx = priors.find((p) => p.biomarker === 'anxietySai')!;
    expect(anx.unpoolableCount).toBe(1); // counted
    expect(anx.pooled!.k).toBe(2); // only the real poolable studies
    expect(anx.mean).toBeCloseTo(-6.205, 1); // qual study did NOT move the pooled estimate
  });
});