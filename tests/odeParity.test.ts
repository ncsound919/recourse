import { describe, it, expect } from 'vitest';
import { solveOdeTumorImmuneSystem } from '../src/lib/odeSimulator';
import { CANONICAL_ODE } from '../src/lib/odeKineticSynthesizer';

// Golden trajectories emitted by the Recourse simulator's diff-grok LSODA
// integration of the tumor-immune ODE system, with the canonical params, on
// 2026-09-08. The values below are the ACTUAL outputs of the diff-grok LSODA
// integrator (same equations/constants, adaptive solver), sampled daily — not
// hand-tuned. This is a determinism + drift gate: if the port ever diverges
// from this pinned LSODA reference, the test fails.
//
// NOTE: these differ (slightly) from the historical Forward-Euler goldens.
// LSODA is adaptive and strictly more accurate than dt=0.2 Forward-Euler, so
// the daily samples shifted. That is expected accuracy, not a regression.
const GOLDEN = {
  continuous_mtd: { t30: 185.0, t60: 507.5, t100: 520.4, finalS: 1.5, finalR: 484.4 },
  adaptive_pulsed: { t30: 191.3, t60: 517.0, t100: 523.2, finalS: 1.5, finalR: 486.4 },
  metronomic: { t30: 238.9, t60: 647.0, t100: 623.5, finalS: 3.5, finalR: 565.4 },
  awaken_senescence: { t30: 209.3, t60: 646.7, t100: 985.0, finalS: 375.5, finalR: 547.4 },
} as const;

describe('ODE simulator — parity with diff-grok LSODA reference (drift gate)', () => {
  for (const mode of ['continuous_mtd', 'adaptive_pulsed', 'metronomic', 'awaken_senescence'] as const) {
    it(`matches the pinned golden trajectory for ${mode}`, () => {
      const traj = solveOdeTumorImmuneSystem({ ...CANONICAL_ODE, therapyMode: mode, totalDays: 100 });
      const at = (t: number) => {
        const row = traj.find((r) => r.time_days === t);
        expect(row, `missing row at day ${t}`).toBeTruthy();
        return row!.totalVolume_mm3;
      };
      expect(at(30)).toBeCloseTo(GOLDEN[mode].t30, 1);
      expect(at(60)).toBeCloseTo(GOLDEN[mode].t60, 1);
      expect(at(100)).toBeCloseTo(GOLDEN[mode].t100, 1);
      const last = traj[traj.length - 1]!;
      expect(last.sensitiveTumor_S).toBeCloseTo(GOLDEN[mode].finalS, 1);
      expect(last.resistantTumor_R).toBeCloseTo(GOLDEN[mode].finalR, 1);
    });
  }
});