/**
 * ODE SIMULATOR — TS port of Overlay Oncology's
 * `solveOdeTumorImmuneSystem` + `computeCureReachability`
 * (lib/oncology-math-engine.ts). Same equations, same constants, same params
 * contract (`OdeSimulationParams`).
 *
 * INTEGRATOR: the coupled tumor-immune-resistance system is integrated with
 * `diff-grok`'s adaptive LSODA solver (the scipy `solve_ivp` default — a
 * variable-order Nordsieck method that switches between Adams non-stiff and
 * BDF stiff formulations). Because dosing is event-based, the continuous ODE
 * is integrated segment-by-segment between dose boundaries: at each day
 * boundary where `doseOnDay` fires, the drug-concentration state is stepped
 * (C += drugDose, or C += drugDose*0.4 for metronomic), and the adaptive
 * solver continues from that event-adjusted state. Between boundaries C decays
 * continuously via dC = -k_elim*C. The solver is re-seeded with the event-
 * adjusted state at every day boundary, and one row is recorded per simulated
 * day (rounded to match the original output contract).
 *
 * NOTE ON GOLDEN TRAJECTORIES: this is NOT the old Forward-Euler port. LSODA
 * takes an adaptive, internally-variable step and is strictly more accurate
 * than dt=0.2 Forward-Euler, so daily samples differ (slightly) from the
 * previous Euler goldens. That difference is accuracy, not regression; the
 * model equations and constants are unchanged.
 *
 * Honesty note: this is a *mechanistic model port*, not a clinical model. All
 * growth/kill/immune rates are fixed literature-order constants or caller-
 * supplied params; only explicitly supplied values (e.g. an IC50 fit) are
 * calibrated. No result here is a clinical claim.
 */

import { lsoda } from 'diff-grok';
import type { ODEs } from 'diff-grok';
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

/** State-vector index map: [S, R, CSC, H, E, C, Sen]. */
const S_ = 0;
const R_ = 1;
const CSC_ = 2;
const H_ = 3;
const E_ = 4;
const C_ = 5;
const SEN_ = 6;

const AWAKEN_INDUCTION_END = 21;
const AWAKEN_WASHOUT_END = 42;

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Right-hand side F(t, y) of the coupled tumor-immune-resistance system.
 * Kept equation-for-equation identical to the original Overlay model; only the
 * integrator changes (Forward-Euler -> diff-grok LSODA). The reflected
 * non-negativity/boundedness conditions mirror the per-step clamps the Euler
 * loop applied (variables cannot leave their biological domain).
 */
function makeRhs(params: OdeSimulationParams) {
  const mode = params.therapyMode;
  const K = params.carryingCap_K;

  return (t: number, y: Float64Array, out: Float64Array) => {
    const S = y[S_];
    const R = y[R_];
    const CSC = y[CSC_];
    const H = y[H_];
    const E = y[E_];
    const C = y[C_];
    const Sen = y[SEN_];

    const k_elim = mode === 'awaken_senescence' && t >= AWAKEN_INDUCTION_END && t < AWAKEN_WASHOUT_END ? 0.85 : 0.46;
    const dC = -k_elim * C;

    const hill_S = C / (params.ic50_S + C + 1e-6);
    const hill_R = C / (params.ic50_R + C + 1e-6);
    const hill_CSC = C / (params.ic50_S * 8.0 + C + 1e-6);

    const totalPop = S + R + CSC;
    const logisticConstraint = Math.max(0, 1 - totalPop / K);

    const plasticityConversion = 0.0015 * S * C;

    const senescentInduction =
      mode === 'awaken_senescence' && t < AWAKEN_INDUCTION_END ? 0.0085 * S * C : 0;
    const immuneClearanceOfSen =
      mode === 'awaken_senescence' && t >= AWAKEN_INDUCTION_END ? (0.18 * E * Sen) / (120 + E) : 0;
    const saspRecruitment =
      mode === 'awaken_senescence' && t >= AWAKEN_INDUCTION_END && t < AWAKEN_WASHOUT_END ? 8.5 * Sen : 0;
    const awakenPostWashoutBoost = mode === 'awaken_senescence' && t >= AWAKEN_WASHOUT_END ? 0.6 : 1.0;

    const immuneKill_S = (awakenPostWashoutBoost * 0.2 * E * S) / (100 + E);
    const immuneKill_R = (awakenPostWashoutBoost * 0.08 * E * R) / (100 + E);
    const immuneKill_CSC = (awakenPostWashoutBoost * 0.05 * E * CSC) / (100 + E);

    const inductionKillFactor = mode === 'awaken_senescence' && t < AWAKEN_INDUCTION_END ? 0.45 : 1.0;

    out[S_] =
      params.growthRate_S * S * logisticConstraint +
      0.015 * CSC -
      params.drugKill_S * hill_S * S * inductionKillFactor -
      immuneKill_S -
      plasticityConversion -
      params.mutationRate_mu * S * C -
      senescentInduction;

    out[R_] =
      params.growthRate_R * R * logisticConstraint -
      params.drugKill_R * hill_R * R -
      immuneKill_R +
      params.mutationRate_mu * S * C;

    out[CSC_] =
      0.08 * CSC * logisticConstraint -
      0.015 * CSC +
      plasticityConversion -
      params.drugKill_S * 0.15 * hill_CSC * CSC -
      immuneKill_CSC;

    out[SEN_] = senescentInduction - immuneClearanceOfSen;
    out[H_] = -0.02 * C * H + 0.06 * (100.0 - H);
    out[E_] =
      2.0 +
      (0.08 * totalPop * E) / (100 + totalPop) -
      0.05 * E -
      0.002 * S * E +
      saspRecruitment -
      0.005 * E * (E / 200);
    out[C_] = dC;

    if (S <= 0 && out[S_] < 0) out[S_] = 0;
    if (R <= 0 && out[R_] < 0) out[R_] = 0;
    if (CSC <= 0 && out[CSC_] < 0) out[CSC_] = 0;
    if (Sen <= 0 && out[SEN_] < 0) out[SEN_] = 0;
    if (E <= 0 && out[E_] < 0) out[E_] = 0;
    if (C <= 0 && out[C_] < 0) out[C_] = 0;
    if (H <= 0 && out[H_] < 0) out[H_] = 0;
    if (H >= 100 && out[H_] > 0) out[H_] = 0;
  };
}

/**
 * Event-segmented integration of the coupled tumor-immune-resistance ODE system
 * with diff-grok's adaptive LSODA solver. Because dosing is event-based, the
 * continuous ODE segments between day boundaries are each integrated with LSODA
 * (one-day windows, adaptive internal steps), the dose increment is applied at
 * the event boundary, and the solver continues from the event-adjusted state.
 * Returns one row per simulated day (rounded to 0.1, C to 0.01).
 */
export function solveOdeTumorImmuneSystem(params: OdeSimulationParams): OdeSimulationStep[] {
  const steps: OdeSimulationStep[] = [];
  const func = makeRhs(params);
  const baselineVol = params.initialS + params.initialR;

  const y = new Float64Array([
    params.initialS,
    params.initialR,
    params.initialS * 0.12,
    100.0,
    params.initialE,
    0,
    0,
  ]);

  const tolerance = 1e-8;
  const totalDays = params.totalDays;

  for (let day = 0; day <= totalDays; day++) {
    if (doseOnDay(day, params, y[S_] + y[R_] + y[CSC_], baselineVol)) {
      if (params.therapyMode === 'metronomic') y[C_] += params.drugDose * 0.4;
      else y[C_] += params.drugDose;
    }

    steps.push({
      time_days: day,
      sensitiveTumor_S: r1(y[S_]),
      resistantTumor_R: r1(y[R_]),
      cancerStemCells_CSC: r1(y[CSC_]),
      senescentTumor_Sen: r1(y[SEN_]),
      healthyRegenerated_H: r1(y[H_]),
      drugConc_C: r2(y[C_]),
      immuneEffectors_E: r1(y[E_]),
      totalVolume_mm3: r1(y[S_] + y[R_] + y[CSC_]),
    });

    if (day >= totalDays) break;

    const task: ODEs = {
      name: 'tumorImmuneSystem',
      arg: { name: 't', start: day, finish: day + 1, step: 1 },
      initial: Array.from(y),
      func,
      tolerance,
      solutionColNames: ['S', 'R', 'CSC', 'H', 'E', 'C', 'Sen'],
    };

    const sol = lsoda(task);
    const last = sol[0].length - 1;
    for (let i = 0; i < 7; i++) y[i] = sol[i + 1][last];
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