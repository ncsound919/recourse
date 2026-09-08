/**
 * Shared ODE simulation contract — mirrors Overlay Oncology's
 * `OdeSimulationParams` (lib/engine-registry.ts) so a bundle synthesized here
 * can be consumed verbatim by `solveOdeTumorImmuneSystem`.
 */

export type TherapyMode = 'continuous_mtd' | 'adaptive_pulsed' | 'metronomic' | 'awaken_senescence';

export interface OdeSimulationParams {
  initialS: number;
  initialR: number;
  initialE: number;
  carryingCap_K: number;
  growthRate_S: number;
  growthRate_R: number;
  drugKill_S: number;
  drugKill_R: number;
  ic50_S: number;
  ic50_R: number;
  mutationRate_mu: number;
  drugDose: number;
  dosingIntervalDays: number;
  totalDays: number;
  therapyMode: TherapyMode;
}