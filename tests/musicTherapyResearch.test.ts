import { describe, it, expect } from 'vitest';
import {
  designMusicTherapyTrial,
  designMusicTherapyBatch,
  renderTrialBatch,
  BIOMARKER_PRIORS,
} from '../src/lib/musicTherapyResearch';

describe('music therapy research', () => {
  const base = { bpm: 60, key: 0, major: false, style: 'jasper-ballad' as const, seed: 42, intensity: 'sedative' as const };

  it('designs a reproducible trial (same params -> same artifact hash)', () => {
    const a = designMusicTherapyTrial(base);
    const b = designMusicTherapyTrial(base);
    expect(a.id).toBe(b.id);
    expect(a.artifact.artifactHash).toBe(b.artifact.artifactHash);
    expect(a.track.events.length).toBeGreaterThan(0); // real composed stimulus
  });

  it('produces honest biomarker estimates with uncertainty (never fabricated measurements)', () => {
    const t = designMusicTherapyTrial(base);
    const anxiety = t.biomarkers.find((b) => b.biomarker === 'anxietySai')!;
    expect(anxiety.effect).toBeLessThan(0); // anxiety reduces
    expect(anxiety.sd).toBeGreaterThan(0);  // uncertainty always present
    expect(anxiety.effectSize).toBeCloseTo(anxiety.effect / anxiety.sd, 1);
    // The prior matches the Cochrane anchor (~7.7 SAI at high potency).
    const highPotency = designMusicTherapyTrial({ ...base, bpm: 60 }); // sedative, slow
    const hiAnx = highPotency.biomarkers.find((b) => b.biomarker === 'anxietySai')!;
    expect(Math.abs(hiAnx.effect)).toBeGreaterThan(5); // large reduction
  });

  it('sedative+slow stimulus models stronger stress reduction than stimulative+fast', () => {
    const sedative = designMusicTherapyTrial({ ...base, intensity: 'sedative', bpm: 60 });
    const stim = designMusicTherapyTrial({ ...base, intensity: 'stimulative', bpm: 96, major: true });
    const sA = sedative.biomarkers.find((b) => b.biomarker === 'anxietySai')!;
    const tA = stim.biomarkers.find((b) => b.biomarker === 'anxietySai')!;
    expect(Math.abs(sA.effect)).toBeGreaterThan(Math.abs(tA.effect));
  });

  it('marks the artifact as evidence tier E3 (real computation, uncalibrated model)', () => {
    const t = designMusicTherapyTrial(base);
    expect(t.artifact.evidenceTier).toBe('E3');
    expect(t.artifact.stats).toBeNull(); // no real trial data -> no fabricated stats
    expect(t.calibratedCount).toBe(0);
  });

  it('uses calibrated priors when pooled trial evidence is supplied (E2 tier)', () => {
    const calibratedPriors = {
      anxietySai: { mean: -6.28, sd: 1.2, calibrated: true, source: 'pooled meta-analysis of 2 studies' },
      hr: { mean: -5.0, sd: 2.5, calibrated: false, source: 'Cochrane anchor' },
    };
    const t = designMusicTherapyTrial(base, calibratedPriors);
    expect(t.calibratedCount).toBe(1); // only anxiety is calibrated
    expect(t.artifact.evidenceTier).toBe('E2'); // pooled evidence lifts the tier
    const anx = t.biomarkers.find((b) => b.biomarker === 'anxietySai')!;
    expect(anx.calibrated).toBe(true);
    expect(anx.effect).toBeCloseTo(-6.28, 1); // uses pooled mean, not -7.7 anchor
    const hr = t.biomarkers.find((b) => b.biomarker === 'hr')!;
    expect(hr.calibrated).toBe(false); // still anchor
  });

  it('batch generates deterministic variants across the parameter grid', () => {
    const batch = designMusicTherapyBatch(base, 4);
    expect(batch.length).toBe(4);
    // All reproducible
    const again = designMusicTherapyBatch(base, 4);
    expect(batch.map((t) => t.id)).toEqual(again.map((t) => t.id));
    // Vary in tempo/mode/tuning
    const bpms = new Set(batch.map((t) => t.stimulus.bpm));
    expect(bpms.size).toBeGreaterThan(1);
    const tunings = new Set(batch.map((t) => t.stimulus.tuningHz));
    expect(tunings.size).toBeGreaterThan(1);
  });

  it('renderTrialBatch produces a readable report with honest framing', () => {
    const batch = designMusicTherapyBatch(base, 2);
    const report = renderTrialBatch(batch);
    expect(report).toContain('anxiety Δ');
    expect(report).toContain('HRV Δ');
    expect(report).toContain('tier E3');
    // Does NOT claim to treat cancer.
    expect(report.toLowerCase()).not.toContain('cure');
  });

  it('biomarker priors reflect the Cochrane anchor', () => {
    expect(BIOMARKER_PRIORS.anxietySai.mean).toBe(-7.7);
    expect(BIOMARKER_PRIORS.anxietySai.source).toContain('Cochrane');
  });
});

import { tuningContrastDetailed } from '../src/lib/musicTherapyTuning';

describe('tuning contrast on designed trials', () => {
  const base = { bpm: 60, key: 0, major: false, style: 'jasper-ballad' as const, seed: 42, intensity: 'sedative' as const };

  it('attaches a tuning contrast that is significant only for HR/PWV at 432', () => {
    const t432 = designMusicTherapyTrial({ ...base, tuningHz: 432 });
    expect(t432.tuningContrast.length).toBeGreaterThan(0);
    const sig = t432.tuningContrast.filter((c) => c.significant).map((c) => c.parameter);
    expect(sig).toEqual(['hr', 'pwv']);
    expect(t432.tuningNote).toContain('invariant');
    expect(t432.tuningContrast).toEqual(tuningContrastDetailed(432));
  });

  it('does NOT change the anxiety biomarker with tuning (psych distress is tuning-invariant)', () => {
    const a = designMusicTherapyTrial({ ...base, tuningHz: 432 });
    const b = designMusicTherapyTrial({ ...base, tuningHz: 443 });
    const anxA = a.biomarkers.find((x) => x.biomarker === 'anxietySai')!;
    const anxB = b.biomarkers.find((x) => x.biomarker === 'anxietySai')!;
    expect(anxA.effect).toBe(anxB.effect);
  });

  it('preserves determinism with tuning in the hash', () => {
    const a = designMusicTherapyTrial({ ...base, tuningHz: 432 });
    const b = designMusicTherapyTrial({ ...base, tuningHz: 432 });
    expect(a.id).toBe(b.id);
    expect(a.artifact.artifactHash).toBe(b.artifact.artifactHash);
  });

  it('flags 415 Hz as untested', () => {
    const t = designMusicTherapyTrial({ ...base, tuningHz: 415 });
    expect(t.tuningContrast.every((c) => c.untested)).toBe(true);
  });
});