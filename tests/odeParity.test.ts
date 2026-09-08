import { describe, it, expect } from 'vitest';
import { solveOdeTumorImmuneSystem } from '../src/lib/odeSimulator';
import { CANONICAL_ODE } from '../src/lib/odeKineticSynthesizer';

// Golden trajectories emitted from Overlay Oncology's solveOdeTumorImmuneSystem
// (lib/oncology-math-engine.ts) with the SAME canonical params, on 2026-09-07.
// Verified bit-identical against the Recourse port across all four therapy
// modes. This is a drift gate: if the Recourse port ever diverges from the
// authoritative Overlay engine, this test fails.
const GOLDEN = {
  continuous_mtd: { t30: 157.7, t60: 479.6, t100: 517.8, finalS: 1.3, finalR: 484.8 },
  adaptive_pulsed: { t30: 174.0, t60: 498.4, t100: 521.3, finalS: 1.4, finalR: 486.3 },
  metronomic: { t30: 199.8, t60: 592.8, t100: 598.5, finalS: 3.2, finalR: 545.2 },
  awaken_senescence: { t30: 172.2, t60: 503.7, t100: 972.9, finalS: 220.1, finalR: 685.8 },
} as const;

describe('ODE simulator — parity with Overlay Oncology engine (drift gate)', () => {
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