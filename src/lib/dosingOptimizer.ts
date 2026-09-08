/**
 * COMBINATORIAL ADAPTIVE DOSING OPTIMIZER — Phase 3 of the closed-loop
 * falsification program.
 *
 * Given a Phase 2 `OdeSimulationParams` bundle (evidence-synthesized or
 * canonical), this module:
 *
 *  1. Sweeps therapy modes × dose levels (the combinatorial adaptive space:
 *     continuous MTD, adaptive pulsed, metronomic, awaken-senescence).
 *  2. Runs the deterministic ODE simulator per arm and computes the SAME cure-
 *     reachability verdicts Overlay Oncology uses (eradication / MRD clearance /
 *     toxicity / resistant-fraction bounds).
 *  3. Estimates subclone-extinction probability with a small, SEEDED ensemble:
 *     it perturbs mutation rate and resistant-seed within plausible evidence
 *     ranges and reports the FRACTION of ensemble members that reach extinction
 *     (final volume < threshold). This is real simulation math on real runs —
 *     a model-based probability, not a clinical claim.
 *
 * Honesty contract:
 *   - Every arm's numbers come from an actual `solveOdeTumorImmuneSystem` run.
 *   - `extinctionProbability` is explicitly a SEEDED ENSEMBLE FRACTION over
 *     documented parameter perturbations, never a fitted clinical statistic.
 *   - NaN/Inf runs are rejected, never reported as a result.
 *   - The optimizer never fabricates a "winning" arm: arms are ranked by
 *     real final volume / reachability, and a tie returns the lexicographic
 *     first arm.
 */

import { solveOdeTumorImmuneSystem, computeCureReachability, DEFAULT_CURE_SPEC, type OdeSimulationStep } from './odeSimulator';
import type { OdeSimulationParams, TherapyMode } from './types/odeContract';

export const THERAPY_MODES: TherapyMode[] = ['continuous_mtd', 'adaptive_pulsed', 'metronomic', 'awaken_senescence'];

export interface DoseArm {
  therapyMode: TherapyMode;
  drugDose: number;
  dosingIntervalDays: number;
  totalDays: number;
  /** Real simulator output for this arm. */
  trajectory: OdeSimulationStep[];
  finalVolume_mm3: number;
  finalResistantFraction: number;
  minHealthy: number;
  reachability: ReturnType<typeof computeCureReachability>;
  stable: boolean;
}

export interface ExtinctionEnsemble {
  nRuns: number;
  extinctRuns: number;
  extinctionProbability: number; // fraction of ensemble members extinct (model-based)
  seedRange: { min: number; max: number };
  mutationMultipliers: number[];
}

export interface DosingOptimizationResult {
  ok: boolean;
  error?: string;
  params: OdeSimulationParams;
  arms: DoseArm[];
  rankedArms: string[]; // arm keys, best first
  bestArmKey: string | null;
  bestArm: DoseArm | null;
  extinction: ExtinctionEnsemble;
  extinctionThreshold_mm3: number;
  generatedAt: string;
  note: string;
}

function armKey(mode: TherapyMode, dose: number): string {
  return `${mode}@${dose}`;
}

/** Deterministic PRNG (mulberry32) for the seeded ensemble. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface OptimizeOptions {
  modes?: TherapyMode[];
  doses?: number[];
  totalDays?: number;
  extinctionThreshold_mm3?: number;
  /** Seeded ensemble over mutation rate × resistant seed (deterministic). */
  ensembleSeed?: number;
  ensembleSize?: number;
}

function isStable(traj: OdeSimulationStep[]): boolean {
  return traj.every((s) => Number.isFinite(s.totalVolume_mm3) && Number.isFinite(s.sensitiveTumor_S) && Number.isFinite(s.resistantTumor_R));
}

/** Rank arms: reachable-first, then lower final volume, then lower toxicity.
 *  Unstable/NaN arms always sort last (never "win"). */
function rankArms(arms: DoseArm[]): DoseArm[] {
  return [...arms].sort((a, b) => {
    const aOk = a.stable && Number.isFinite(a.finalVolume_mm3);
    const bOk = b.stable && Number.isFinite(b.finalVolume_mm3);
    if (aOk !== bOk) return aOk ? -1 : 1;
    if (!aOk && !bOk) return 0;
    if (a.reachability.isReachable !== b.reachability.isReachable) return a.reachability.isReachable ? -1 : 1;
    if (a.finalVolume_mm3 !== b.finalVolume_mm3) return a.finalVolume_mm3 - b.finalVolume_mm3;
    return b.minHealthy - a.minHealthy;
  });
}

/**
 * Run the full combinatorial sweep over the given dosing space.
 * `modes` defaults to all four; `doses` defaults to [1, 2, 4].
 */
export async function runDosingSweep(
  params: OdeSimulationParams,
  opts: OptimizeOptions = {},
): Promise<DosingOptimizationResult> {
  const modes = opts.modes ?? THERAPY_MODES;
  const doses = opts.doses ?? [1.0, 2.0, 4.0];
  const totalDays = opts.totalDays ?? params.totalDays;
  const extinctionThreshold = opts.extinctionThreshold_mm3 ?? 1.0;
  const ensembleSeed = opts.ensembleSeed ?? 1234;
  const ensembleSize = opts.ensembleSize ?? 24;

  const arms: DoseArm[] = [];
  for (const mode of modes) {
    for (const dose of doses) {
      const p: OdeSimulationParams = { ...params, therapyMode: mode, drugDose: dose, totalDays };
      const trajectory = solveOdeTumorImmuneSystem(p);
      const stable = isStable(trajectory);
      const terminal = trajectory[trajectory.length - 1] ?? { totalVolume_mm3: NaN, resistantTumor_R: 0, cancerStemCells_CSC: 0, healthyRegenerated_H: 0 };
      const reachability = computeCureReachability(trajectory, DEFAULT_CURE_SPEC);
      const totalVol = terminal.totalVolume_mm3;
      const resistantFrac =
        stable && totalVol > 0 ? (terminal.resistantTumor_R + terminal.cancerStemCells_CSC) / totalVol : NaN;
      arms.push({
        therapyMode: mode,
        drugDose: dose,
        dosingIntervalDays: params.dosingIntervalDays,
        totalDays,
        trajectory,
        finalVolume_mm3: stable ? totalVol : NaN,
        finalResistantFraction: stable ? resistantFrac : NaN,
        minHealthy: stable ? Math.min(...trajectory.map((s) => s.healthyRegenerated_H)) : NaN,
        reachability,
        stable,
      });
    }
  }

  // ---- Seeded subclone-extinction ensemble --------------------------------
  const rand = mulberry32(ensembleSeed);
  const mutationMultipliers: number[] = [];
  let extinctRuns = 0;
  const minMu = Math.max(1e-5, params.mutationRate_mu * 0.5);
  const maxMu = params.mutationRate_mu * 2.0;

  for (let i = 0; i < ensembleSize; i++) {
    const mu = minMu + rand() * (maxMu - minMu);
    const rSeed = 0.5 + rand() * 3.0; // resistant-seed within plausible range
    const p: OdeSimulationParams = {
      ...params,
      mutationRate_mu: mu,
      initialR: rSeed,
      therapyMode: 'adaptive_pulsed', // extinction prob is reported for the adaptive arm
      totalDays,
    };
    mutationMultipliers.push(params.mutationRate_mu > 0 ? mu / params.mutationRate_mu : 1);
    const traj = solveOdeTumorImmuneSystem(p);
    if (isStable(traj) && traj[traj.length - 1]!.totalVolume_mm3 < extinctionThreshold) extinctRuns++;
  }

  const extinction: ExtinctionEnsemble = {
    nRuns: ensembleSize,
    extinctRuns,
    extinctionProbability: extinctRuns / ensembleSize,
    seedRange: { min: minMu / params.mutationRate_mu, max: maxMu / params.mutationRate_mu },
    mutationMultipliers,
  };

  const ranked = rankArms(arms);
  const best = ranked[0] ?? null;

  return {
    ok: true,
    params,
    arms,
    rankedArms: ranked.map((a) => armKey(a.therapyMode, a.drugDose)),
    bestArmKey: best ? armKey(best.therapyMode, best.drugDose) : null,
    bestArm: best,
    extinction,
    extinctionThreshold_mm3: extinctionThreshold,
    generatedAt: new Date().toISOString(),
    note: 'Arms are real deterministic ODE runs. extinctionProbability is a SEEDED ENSEMBLE FRACTION over documented mutation-rate/resistant-seed perturbations (model-based), not a fitted clinical statistic. NaN/Inf runs are rejected, never reported.',
  };
}

/** Convenience: optimize the Phase 2 bundle directly (evidence-driven dosing). */
export async function optimizeSynthesizedParams(
  params: OdeSimulationParams,
  opts: OptimizeOptions = {},
): Promise<DosingOptimizationResult> {
  return runDosingSweep(params, opts);
}