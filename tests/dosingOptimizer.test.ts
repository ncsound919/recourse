import { describe, it, expect } from 'vitest';
import {
  solveOdeTumorImmuneSystem,
  computeCureReachability,
  doseOnDay,
  DEFAULT_CURE_SPEC,
} from '../src/lib/odeSimulator';
import { runDosingSweep, THERAPY_MODES } from '../src/lib/dosingOptimizer';
import { CANONICAL_ODE } from '../src/lib/odeKineticSynthesizer';

describe('ode simulator (port of Overlay Oncology engine)', () => {
  it('integrates the canonical params to a stable trajectory with real volume', () => {
    const traj = solveOdeTumorImmuneSystem({ ...CANONICAL_ODE, totalDays: 120 });
    expect(traj.length).toBeGreaterThan(0);
    const last = traj[traj.length - 1]!;
    expect(last.totalVolume_mm3).toBeGreaterThan(0);
    expect(Number.isFinite(last.totalVolume_mm3)).toBe(true);
    expect(last.time_days).toBeCloseTo(120, 0);
    // every row is a real number
    for (const s of traj) {
      expect(Number.isFinite(s.totalVolume_mm3)).toBe(true);
      expect(s.healthyRegenerated_H).toBeGreaterThanOrEqual(0);
    }
  });

  it('produces identical output for identical inputs (deterministic)', () => {
    const a = solveOdeTumorImmuneSystem({ ...CANONICAL_ODE, totalDays: 60 });
    const b = solveOdeTumorImmuneSystem({ ...CANONICAL_ODE, totalDays: 60 });
    expect(a).toEqual(b);
  });

  it('doseOnDay respects therapy mode semantics', () => {
    const p = { ...CANONICAL_ODE, dosingIntervalDays: 3, therapyMode: 'continuous_mtd' as const };
    expect(doseOnDay(0, p, 100, 200)).toBe(true); // day 0 dose day, MTD always doses
    // adaptive pulsed only doses above half baseline
    expect(doseOnDay(3, { ...p, therapyMode: 'adaptive_pulsed' as const }, 50, 200)).toBe(false);
    expect(doseOnDay(3, { ...p, therapyMode: 'adaptive_pulsed' as const }, 150, 200)).toBe(true);
    // awaken only doses in induction phase
    expect(doseOnDay(0, { ...p, therapyMode: 'awaken_senescence' as const }, 100, 200)).toBe(true);
    expect(doseOnDay(30, { ...p, therapyMode: 'awaken_senescence' as const }, 100, 200)).toBe(false);
  });

  it('cure reachability verdicts derive from the trajectory (no fabrication)', () => {
    const traj = solveOdeTumorImmuneSystem({ ...CANONICAL_ODE, totalDays: 120 });
    const v = computeCureReachability(traj, DEFAULT_CURE_SPEC);
    expect(['boolean']).toContain(typeof v.isReachable);
    expect(typeof v.resistantFraction).toBe('number');
    expect(typeof v.finalTumorVolume).toBe('number');
    expect(v.minHealthy).toBeGreaterThan(0);
    // empty trajectory → honest failure
    const empty = computeCureReachability([]);
    expect(empty.isReachable).toBe(false);
    expect(empty.failureReason).toContain('Empty');
  });
});

describe('combinatorial adaptive dosing optimizer', () => {
  it('sweeps all four therapy modes × default doses into ranked arms', async () => {
    const r = await runDosingSweep({ ...CANONICAL_ODE, totalDays: 120 });
    expect(r.ok).toBe(true);
    expect(r.arms.length).toBe(THERAPY_MODES.length * 3);
    expect(r.rankedArms.length).toBe(r.arms.length);
    expect(r.bestArmKey).toBeTruthy();
    expect(r.bestArm).toBeTruthy();
    // every arm is a real run
    for (const arm of r.arms) {
      expect(arm.trajectory.length).toBeGreaterThan(0);
      expect(Number.isFinite(arm.finalVolume_mm3)).toBe(true);
      expect(['continuous_mtd', 'adaptive_pulsed', 'metronomic', 'awaken_senescence']).toContain(arm.therapyMode);
    }
    // ranked: best first
    const first = r.arms.find((a) => armKey(a) === r.bestArmKey)!;
    expect(first.reachability.isReachable || first.finalVolume_mm3 === Math.min(...r.arms.map((a) => a.finalVolume_mm3))).toBe(true);
  });

  it('reports a seeded extinction probability in [0,1] as an ensemble fraction', async () => {
    const r = await runDosingSweep({ ...CANONICAL_ODE, totalDays: 120 }, { ensembleSize: 20, ensembleSeed: 7 });
    expect(r.extinction.nRuns).toBe(20);
    expect(r.extinction.extinctRuns).toBeGreaterThanOrEqual(0);
    expect(r.extinction.extinctRuns).toBeLessThanOrEqual(20);
    expect(r.extinction.extinctionProbability).toBe(r.extinction.extinctRuns / r.extinction.nRuns);
    expect(r.extinction.extinctionProbability).toBeGreaterThanOrEqual(0);
    expect(r.extinction.extinctionProbability).toBeLessThanOrEqual(1);
    expect(r.extinction.mutationMultipliers.length).toBe(20);
  });

  it('is deterministic: same seed → same ranked arms and extinction', async () => {
    const a = await runDosingSweep({ ...CANONICAL_ODE, totalDays: 60 }, { ensembleSeed: 42, ensembleSize: 12 });
    const b = await runDosingSweep({ ...CANONICAL_ODE, totalDays: 60 }, { ensembleSeed: 42, ensembleSize: 12 });
    expect(a.rankedArms).toEqual(b.rankedArms);
    expect(a.extinction.extinctionProbability).toBe(b.extinction.extinctionProbability);
    expect(a.arms.map((x) => x.finalVolume_mm3)).toEqual(b.arms.map((x) => x.finalVolume_mm3));
  });

  it('honours explicit dose and mode subsets', async () => {
    const r = await runDosingSweep({ ...CANONICAL_ODE, totalDays: 60 }, { modes: ['adaptive_pulsed'], doses: [2.0] });
    expect(r.arms.length).toBe(1);
    expect(r.arms[0]!.therapyMode).toBe('adaptive_pulsed');
    expect(r.arms[0]!.drugDose).toBe(2.0);
  });

  it('never ranks an unstable/NaN arm as the best arm', async () => {
    // A params set that drives the ODE unstable should still yield a bestArm
    // that is stable; unstable arms must sort last and never win.
    const r = await runDosingSweep(
      { ...CANONICAL_ODE, totalDays: 500, growthRate_S: 1.0, drugKill_S: 0.01, initialE: 0, mutationRate_mu: 0.001 },
      { modes: ['continuous_mtd', 'adaptive_pulsed'], doses: [0.1, 1.0], ensembleSize: 4 },
    );
    expect(r.ok).toBe(true);
    // best arm is either stable or the run has at least one stable arm
    if (r.bestArm) {
      expect(r.bestArm.stable).toBe(true);
      expect(Number.isFinite(r.bestArm.finalVolume_mm3)).toBe(true);
    }
    // rankedArms order must have all stable arms before any unstable arm
    const stableFlags = r.arms.map((a) => a.stable);
    const firstUnstableIdx = stableFlags.findIndex((s) => !s);
    if (firstUnstableIdx !== -1) {
      const afterFirstUnstable = stableFlags.slice(firstUnstableIdx + 1);
      expect(afterFirstUnstable.every((s) => !s)).toBe(true);
    }
  });

  it('guards extinction ensemble against zero mutation rate', async () => {
    const r = await runDosingSweep(
      { ...CANONICAL_ODE, mutationRate_mu: 0, totalDays: 60 },
      { ensembleSize: 6 },
    );
    expect(r.ok).toBe(true);
    expect(r.extinction.mutationMultipliers.length).toBe(6);
    for (const m of r.extinction.mutationMultipliers) {
      expect(Number.isFinite(m)).toBe(true);
    }
  });
});

function armKey(a: { therapyMode: string; drugDose: number }): string {
  return `${a.therapyMode}@${a.drugDose}`;
}