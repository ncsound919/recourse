/**
 * ODE SIMULATOR — faithful TS port of Overlay Oncology's
 * `solveOdeTumorImmuneSystem` + `computeCureReachability`
 * (lib/oncology-math-engine.ts). Same equations, same constants, same params
 * contract (`OdeSimulationParams`), so a bundle synthesized by Phase 2 and
 * optimized here produces trajectories numerically identical to the Overlay
 * engine for the same inputs. This makes Recourse self-contained for sweeps.
 *
 * Honesty note: this is a *mechanistic model port*, not a clinical model. All
 * growth/kill/immune rates are fixed literature-order constants or caller-
 * supplied params; only explicitly supplied values (e.g. an IC50 fit) are
 * calibrated. No result here is a clinical claim.
 */

import type { OdeSimulationParams, TherapyMode } from './types/odeContract';

export interface OdeSimulationStep {
  time_days: number;
  sensitiveTumor_S: number;
  resistantTumor_R: number;
  cancerStemCells_CSC: number;
  senescentTumor_Sen?: number;
  healthyRegenerated_H: number;
  drugConc_C: number;
  immuneEffectors_E: number;
  totalVolume_mm3: number;
}

/** Dosing decision applied at a given time (mirrors the Overlay engine). */
export function doseOnDay(t: number, params: OdeSimulationParams, currentVol: number, baselineVol: number): boolean {
  if ((t % params.dosingIntervalDays) >= 0.2) return false;
  switch (params.therapyMode) {
    case 'continuous_mtd':
      return true;
    case 'adaptive_pulsed':
      return currentVol > baselineVol * 0.5;
    case 'metronomic':
      return true;
    case 'awaken_senescence':
      return t < 21; // induction phase only
    default:
      return true;
  }
}

/**
 * Forward-Euler integration of the coupled tumor-immune-resistance ODE system.
 * Returns one row per simulated day (rounded to 0.1). Ported line-for-line
 * from Overlay Oncology so drift stays at zero.
 */
export function solveOdeTumorImmuneSystem(params: OdeSimulationParams): OdeSimulationStep[] {
  const steps: OdeSimulationStep[] = [];
  const dt = 0.2;
  const numSteps = Math.round(params.totalDays / dt);

  let S = params.initialS;
  let R = params.initialR;
  let CSC = params.initialS * 0.12;
  let H = 100.0;
  let E = params.initialE;
  let C = 0;
  const K = params.carryingCap_K;
  let Sen = 0;

  const stemRenewalRate = 0.08;
  const differentiationRate = 0.015;
  const epigeneticReprogramming = 0.0015;
  const tissueRegenRate = 0.06;

  const awakenInductionEnd = 21;
  const awakenWashoutEnd = 42;
  const senescenceConversionRate = 0.0085;
  const saspImmuneRecruitment = 8.5;
  const awakenWashoutClearance = 0.85;

  const baselineVol = params.initialS + params.initialR;

  for (let step = 0; step <= numSteps; step++) {
    const t = Math.round(step * dt * 10) / 10;

    if (doseOnDay(t, params, S + R + CSC, baselineVol)) {
      if (params.therapyMode === 'metronomic') C += params.drugDose * 0.4;
      else C += params.drugDose;
    }

    const k_elim =
      params.therapyMode === 'awaken_senescence' && t >= awakenInductionEnd && t < awakenWashoutEnd
        ? awakenWashoutClearance
        : 0.46;
    const dC = -k_elim * C;

    const hill_S = C / (params.ic50_S + C + 1e-6);
    const hill_R = C / (params.ic50_R + C + 1e-6);
    const hill_CSC = C / (params.ic50_S * 8.0 + C + 1e-6);

    const totalPop = S + R + CSC;
    const logisticConstraint = Math.max(0, 1 - totalPop / K);

    const plasticityConversion = epigeneticReprogramming * S * C;

    const senescentInduction =
      params.therapyMode === 'awaken_senescence' && t < awakenInductionEnd ? senescenceConversionRate * S * C : 0;
    const immuneClearanceOfSen =
      params.therapyMode === 'awaken_senescence' && t >= awakenInductionEnd ? (0.18 * E * Sen) / (120 + E) : 0;
    const saspRecruitment =
      params.therapyMode === 'awaken_senescence' && t >= awakenInductionEnd && t < awakenWashoutEnd
        ? saspImmuneRecruitment * Sen
        : 0;
    const awakenPostWashoutBoost = params.therapyMode === 'awaken_senescence' && t >= awakenWashoutEnd ? 0.6 : 1.0;

    const immuneKill_S = (awakenPostWashoutBoost * 0.2 * E * S) / (100 + E);
    const immuneKill_R = (awakenPostWashoutBoost * 0.08 * E * R) / (100 + E);
    const immuneKill_CSC = (awakenPostWashoutBoost * 0.05 * E * CSC) / (100 + E);

    const inductionKillFactor = params.therapyMode === 'awaken_senescence' && t < awakenInductionEnd ? 0.45 : 1.0;

    const dS =
      params.growthRate_S * S * logisticConstraint +
      differentiationRate * CSC -
      params.drugKill_S * hill_S * S * inductionKillFactor -
      immuneKill_S -
      plasticityConversion -
      params.mutationRate_mu * S * C -
      senescentInduction;

    const dR =
      params.growthRate_R * R * logisticConstraint -
      params.drugKill_R * hill_R * R -
      immuneKill_R +
      params.mutationRate_mu * S * C;

    const dCSC =
      stemRenewalRate * CSC * logisticConstraint -
      differentiationRate * CSC +
      plasticityConversion -
      params.drugKill_S * 0.15 * hill_CSC * CSC -
      immuneKill_CSC;

    const dSen = senescentInduction - immuneClearanceOfSen;
    const dH = -0.02 * C * H + tissueRegenRate * (100.0 - H);
    const dE = 2.0 + (0.08 * totalPop * E) / (100 + totalPop) - 0.05 * E - 0.002 * S * E + saspRecruitment - 0.005 * E * (E / 200);

    S = Math.max(0, S + dS * dt);
    R = Math.max(0, R + dR * dt);
    Sen = Math.max(0, Sen + dSen * dt);
    CSC = Math.max(0, CSC + dCSC * dt);
    H = Math.min(100.0, Math.max(0, H + dH * dt));
    E = Math.max(0, E + dE * dt);
    C = Math.max(0, C + dC * dt);

    if (step % Math.round(1 / dt) === 0) {
      steps.push({
        time_days: t,
        sensitiveTumor_S: Math.round(S * 10) / 10,
        resistantTumor_R: Math.round(R * 10) / 10,
        cancerStemCells_CSC: Math.round(CSC * 10) / 10,
        senescentTumor_Sen: Math.round(Sen * 10) / 10,
        healthyRegenerated_H: Math.round(H * 10) / 10,
        drugConc_C: Math.round(C * 100) / 100,
        immuneEffectors_E: Math.round(E * 10) / 10,
        totalVolume_mm3: Math.round((S + R + CSC) * 10) / 10,
      });
    }
  }
  return steps;
}

// ---------------------------------------------------------------------------
// Cure reachability (port of computeCureReachability)
// ---------------------------------------------------------------------------

export type CureObjective =
  | 'CURATIVE_ERADICATION'
  | 'MRD_GUIDED_DFS24'
  | 'EVOLUTIONARY_CONTAINMENT'
  | 'ORGAN_PRESERVATION_DEESC';

export interface CureReachabilitySpec {
  objective: CureObjective;
  interceptDay: number;
  mrdVolumeThreshold: number;
  toxicityFloor: number;
  maxResistantFraction: number;
  maxPermissibleEvolvability: number;
}

export interface CureReachabilityVerdict {
  isReachable: boolean;
  isInterceptCleared: boolean;
  isToxSafe: boolean;
  isEradicated: boolean;
  resistantFraction: number;
  finalTumorVolume: number;
  minHealthy: number;
  failureReason: string;
  proposedShrunkObjective: Exclude<CureObjective, 'CURATIVE_ERADICATION'> | null;
}

export const DEFAULT_CURE_SPEC: CureReachabilitySpec = {
  objective: 'CURATIVE_ERADICATION',
  interceptDay: 60,
  mrdVolumeThreshold: 1.0,
  toxicityFloor: 50.0,
  maxResistantFraction: 0.15,
  maxPermissibleEvolvability: 0.3,
};

export function computeCureReachability(
  trajectory: OdeSimulationStep[],
  spec: CureReachabilitySpec = DEFAULT_CURE_SPEC,
): CureReachabilityVerdict {
  if (!trajectory || trajectory.length === 0) {
    return {
      isReachable: false, isInterceptCleared: false, isToxSafe: false, isEradicated: false,
      resistantFraction: 0, finalTumorVolume: 0, minHealthy: 0,
      failureReason: 'Empty ODE trajectory', proposedShrunkObjective: 'EVOLUTIONARY_CONTAINMENT',
    };
  }

  const interceptPoint = trajectory.find((p) => p.time_days >= spec.interceptDay) ?? trajectory[trajectory.length - 1]!;
  const last = trajectory[trajectory.length - 1]!;

  const isInterceptCleared = interceptPoint.totalVolume_mm3 < spec.mrdVolumeThreshold;
  const isToxSafe = Math.min(...trajectory.map((p) => p.healthyRegenerated_H)) >= spec.toxicityFloor;
  const isEradicated = last.totalVolume_mm3 < 0.05;
  const isContained = last.totalVolume_mm3 < 25.0;

  let resistantFraction = last.totalVolume_mm3 > 0 ? (last.resistantTumor_R + last.cancerStemCells_CSC) / last.totalVolume_mm3 : 0;
  const minHealthy = Math.min(...trajectory.map((p) => p.healthyRegenerated_H));

  let isReachable = false;
  let proposedShrunkObjective: CureReachabilityVerdict['proposedShrunkObjective'] = null;
  let failureReason = '';

  switch (spec.objective) {
    case 'CURATIVE_ERADICATION':
      if (resistantFraction > spec.maxResistantFraction) {
        failureReason = `Resistant fraction ${resistantFraction.toFixed(2)} exceeds ${spec.maxResistantFraction} — evolutionary escape, curative spec not reachable.`;
        proposedShrunkObjective = 'EVOLUTIONARY_CONTAINMENT';
      } else if (!isToxSafe) {
        failureReason = `Healthy vitality fell below floor (min H=${minHealthy.toFixed(1)} < ${spec.toxicityFloor}) — dose exceeds toxicity bound.`;
        proposedShrunkObjective = 'ORGAN_PRESERVATION_DEESC';
      } else if (isEradicated && isInterceptCleared) {
        isReachable = true;
      } else {
        failureReason = 'Eradication + MRD clearance not jointly achieved within the controllable vector field.';
        proposedShrunkObjective = 'MRD_GUIDED_DFS24';
      }
      break;
    case 'MRD_GUIDED_DFS24':
      isReachable = isInterceptCleared && isToxSafe;
      if (!isReachable) {
        failureReason = 'MRD clearance at intercept not achieved without breaching toxicity floor.';
        proposedShrunkObjective = 'EVOLUTIONARY_CONTAINMENT';
      }
      break;
    case 'EVOLUTIONARY_CONTAINMENT':
      isReachable = isContained && isToxSafe;
      break;
    case 'ORGAN_PRESERVATION_DEESC':
    default:
      isReachable = isToxSafe;
      break;
  }

  return {
    isReachable, isInterceptCleared, isToxSafe, isEradicated, resistantFraction,
    finalTumorVolume: last.totalVolume_mm3, minHealthy, failureReason, proposedShrunkObjective,
  };
}

export type { TherapyMode, OdeSimulationParams };