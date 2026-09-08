import { describe, it, expect } from 'vitest';
import {
  TUNING_RECORDS,
  TUNING_CAVEATS,
  musicVsControlBenchmark,
  renderTuningSummary,
} from '../src/lib/musicTherapyTuning';

describe('music therapy tuning-contrast evidence (seeded, real records)', () => {
  it('seeds the head-to-head records with real attribution', () => {
    expect(TUNING_RECORDS.length).toBeGreaterThanOrEqual(15);
    const hr = TUNING_RECORDS.find((r) => r.parameter === 'hr' && r.population.includes('oncology'));
    expect(hr).toBeDefined();
    expect(hr!.effect432).toBe(-3);       // Hohneck 2025: 432-arm HR change
    expect(hr!.effectComparator).toBe(-1); // 443-arm
    expect(hr!.between).toBe(-2);
    expect(hr!.betweenP).toBe(0.04);
    expect(hr!.significant).toBe(true);
    expect(hr!.doi).toBe('10.1186/s12906-025-04758-5');
    const pwv = TUNING_RECORDS.find((r) => r.parameter === 'pwv');
    expect(pwv!.significant).toBe(true);
    expect(pwv!.caveats!.length).toBeGreaterThan(0); // baseline asymmetry surfaced
    // Psych distress is NOT significant between frequencies.
    const anx = TUNING_RECORDS.find((r) => r.parameter === 'anxiety');
    expect(anx!.significant).toBe(false);
  });

  it('does not fabricate between-frequency p-values', () => {
    for (const r of TUNING_RECORDS) {
      if (r.betweenP != null) {
        expect(r.significant).toBe(r.betweenP < 0.05);
      } else {
        expect(r.significant).toBe(false);
      }
    }
  });

  it('benchmark matches the Cochrane music-vs-control anchors', () => {
    const b = musicVsControlBenchmark();
    const anx = b.find((x) => x.parameter === 'anxietySai')!;
    expect(anx.effect).toBe(-7.73);
    const hr = b.find((x) => x.parameter === 'hr')!;
    expect(hr.effect).toBe(-3.4);
    expect(hr.ci).toEqual([-5.58, -1.23]);
  });

  it('renders an honest text summary', () => {
    const s = renderTuningSummary(TUNING_RECORDS, [], musicVsControlBenchmark());
    expect(s).toContain('432');
    expect(s).toContain('significant');
    expect(s.toLowerCase()).not.toContain('cure');
  });

  it('lists the trial-design caveats (PWV asymmetry, floor effect, confounds)', () => {
    expect(TUNING_CAVEATS.some((c) => /baseline/i.test(c))).toBe(true);
    expect(TUNING_CAVEATS.some((c) => /floor/i.test(c))).toBe(true);
    expect(TUNING_CAVEATS.some((c) => /blinding|expectancy/i.test(c))).toBe(true);
    expect(TUNING_CAVEATS.some((c) => /control/i.test(c))).toBe(true);
  });
});

import {
  tuningContrastDetailed,
  CONTRAST_PARAMETERS,
} from '../src/lib/musicTherapyTuning';

describe('tuning contrast model (mostly null — reflects the literature)', () => {
  it('flags only HR and PWV as significant at 432 Hz', () => {
    const c = tuningContrastDetailed(432);
    const sig = c.filter((x) => x.significant).map((x) => x.parameter);
    expect(sig).toEqual(['hr', 'pwv']);
    const hr = c.find((x) => x.parameter === 'hr')!;
    expect(hr.effect).toBe(-2);
    expect(hr.p).toBe(0.04);
    const pwv = c.find((x) => x.parameter === 'pwv')!;
    expect(pwv.effect).toBe(-0.5);
    expect(pwv.caveats.length).toBeGreaterThan(0);
  });

  it('keeps psych distress tuning-invariant (null effect, not significant)', () => {
    const c = tuningContrastDetailed(432);
    for (const p of ['anxiety', 'stress', 'fatigue', 'wellbeing'] as const) {
      const r = c.find((x) => x.parameter === p)!;
      expect(r.effect).toBeNull();
      expect(r.significant).toBe(false);
      expect(r.note.toLowerCase()).toContain('invariant');
    }
  });

  it('returns an untested, null contrast for the 415 Hz baroque-pitch comparator', () => {
    const c = tuningContrastDetailed(415);
    expect(c.length).toBe(CONTRAST_PARAMETERS.length);
    for (const r of c) {
      expect(r.untested).toBe(true);
      expect(r.effect).toBeNull();
      expect(r.significant).toBe(false);
    }
  });

  it('returns a null comparator-side contrast for 440/443 Hz', () => {
    for (const hz of [440, 443]) {
      const c = tuningContrastDetailed(hz);
      for (const r of c) {
        expect(r.effect).toBeNull();
        expect(r.significant).toBe(false);
        expect(r.untested).toBe(false);
      }
    }
  });
});
