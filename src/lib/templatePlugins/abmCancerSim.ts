/**
 * ABM cancer-sim template plugin — agent-lite tumor/immune/stromal model.
 *
 * Mechanistic rules (distilled from `bisim and abm/ABM-ARCHITECTURE-ENHANCED.md`
 * and `bisim and abm/abm-cancer-sim.tsx`):
 * - Tumor cells proliferate logistically; hypoxia (tumor burden / carrying
 *   capacity) pushes a fraction into quiescence (G0) where they neither
 *   divide nor die from CAR-T.
 * - Immune (CAR-T + endogenous CD8) cells kill proliferating tumor cells;
 *   sustained antigen exposure drives an exhaustion state [0,1] that damps
 *   cytotoxicity.
 * - Stromal (CAF) cells grow with tumor burden and form an exclusion
 *   barrier that scales down immune infiltration.
 * - VAF trajectory: mutant allele fraction = mutantCells / (2 · totalCells),
 *   tracked per generation.
 * - Immune niche classifier: HOT / EXHAUSTED / EXCLUDED / COLD.
 *
 * Honest scope: agent-LITE — compartment counts, not per-cell agents or
 * spatial fields. Deterministic given seed (mulberry32). An educational /
 * hypothesis-generation proxy, not a calibrated clinical model.
 */

import type { ToolDomain, ComponentTemplateParam, ComponentTemplateCategory } from '../../types';
import type { TemplatePlugin } from '../templatePlugin';

export type AbmNiche = 'HOT' | 'EXHAUSTED' | 'EXCLUDED' | 'COLD';
export const ABM_NICHES: AbmNiche[] = ['HOT', 'EXHAUSTED', 'EXCLUDED', 'COLD'];

export interface AbmState {
  generation: number;
  tumor: number;
  quiescent: number;
  immune: number;
  stromal: number;
  exhaustion: number;
  hypoxia: number;
  vaf: number;
}

/** Deterministic PRNG shared by the reference runner and the emitted class. */
export function abmRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Immune-niche classifier (pure). Rules:
 * - infiltration = immune / (tumor + immune + 1)
 * - EXCLUDED: stromal barrier high (stromal/(tumor+stromal+1) > 0.45) AND infiltration low (< 0.15)
 * - EXHAUSTED: infiltration adequate (≥ 0.15) AND exhaustion high (> 0.6)
 * - HOT: infiltration adequate AND exhaustion low
 * - COLD: otherwise (desert)
 */
export function classifyImmuneNiche(
  tumor: number,
  immune: number,
  stromal: number,
  exhaustion: number,
): AbmNiche {
  const t = Math.max(0, tumor);
  const im = Math.max(0, immune);
  const st = Math.max(0, stromal);
  const ex = Math.min(1, Math.max(0, exhaustion));
  const infiltration = im / (t + im + 1);
  const barrier = st / (t + st + 1);
  if (barrier > 0.45 && infiltration < 0.15) return 'EXCLUDED';
  if (infiltration >= 0.15 && ex > 0.6) return 'EXHAUSTED';
  if (infiltration >= 0.15) return 'HOT';
  return 'COLD';
}

export interface AbmLiteParams {
  nCells?: number;
  generations?: number;
  carTDose?: number;
  killRate?: number;
  seed?: number;
}

/** Reference agent-lite runner — the same dynamics the emitted class implements. */
export function runAbmLite(p: AbmLiteParams): AbmState[] {
  const nCells = Math.max(10, Math.floor(p.nCells ?? 1000));
  const generations = Math.max(1, Math.min(5000, Math.floor(p.generations ?? 60)));
  const carTDose = Math.max(0, p.carTDose ?? 0);
  const killRate = Math.min(1, Math.max(0, p.killRate ?? 0.25));
  const rng = abmRng(Math.floor(p.seed ?? 42));
  const K = nCells * 4; // carrying capacity
  let tumor = nCells * 0.8;
  let mutant = nCells * 0.2;
  let quiescent = 0;
  let immune = 20 + carTDose;
  let stromal = nCells * 0.05;
  let exhaustion = 0.05;
  const traj: AbmState[] = [];
  for (let g = 0; g < generations; g++) {
    const burden = tumor / K;
    const hypoxia = Math.min(1, burden * 1.2);
    // Quiescence on hypoxia: fraction of proliferating tumor enters G0.
    const qIn = tumor * hypoxia * 0.25 * (0.9 + rng() * 0.2);
    // Re-entry when oxygenated.
    const qOut = quiescent * (1 - hypoxia) * 0.2;
    quiescent = Math.max(0, quiescent + qIn - qOut);
    tumor = Math.max(0, tumor - qIn + qOut);
    // Logistic proliferation of non-quiescent tumor.
    const growth = tumor * 0.22 * (1 - tumor / K) * (1 - hypoxia * 0.7);
    tumor += Math.max(0, growth);
    mutant += Math.max(0, mutant * 0.22 * (1 - (mutant + tumor * 0.2) / K));
    // Stromal expansion with burden; barrier excludes infiltration.
    stromal += stromal * 0.05 * burden;
    const barrier = stromal / (tumor + stromal + 1);
    const infiltrationFactor = 1 - Math.min(0.9, barrier * 1.5);
    // Exhaustion dynamics: antigen exposure drives up, rest recovers.
    exhaustion = Math.min(1, Math.max(0, exhaustion + burden * 0.03 - 0.008));
    // Immune killing (quiescent cells escape), scaled by exhaustion + barrier.
    const effectors = immune * infiltrationFactor * (1 - exhaustion * 0.8);
    const kills = Math.min(tumor, effectors * killRate * (0.9 + rng() * 0.2));
    tumor = Math.max(0, tumor - kills);
    mutant = Math.max(0, mutant - kills * (mutant / (tumor + kills + 1e-9)));
    // Immune turnover: recruitment with dose, contraction with exhaustion.
    immune = Math.max(0, immune + carTDose * 0.05 * (1 - exhaustion) - immune * 0.02 * exhaustion);
    const total = tumor + quiescent + immune + stromal;
    traj.push({
      generation: g,
      tumor: Math.round(tumor * 100) / 100,
      quiescent: Math.round(quiescent * 100) / 100,
      immune: Math.round(immune * 100) / 100,
      stromal: Math.round(stromal * 100) / 100,
      exhaustion: Math.round(exhaustion * 10000) / 10000,
      hypoxia: Math.round(hypoxia * 10000) / 10000,
      vaf: total > 0 ? Math.round((mutant / (2 * total)) * 100000) / 100000 : 0,
    });
  }
  return traj;
}

const params: ComponentTemplateParam[] = [
  { id: 'nCells', label: 'Initial Tumor Cells', type: 'number', default: 1000, min: 10, max: 100000, step: 10, description: 'Seed tumor cell count' },
  { id: 'generations', label: 'Generations', type: 'number', default: 60, min: 1, max: 5000, step: 1, description: 'Simulation steps' },
  { id: 'carTDose', label: 'CAR-T Dose', type: 'number', default: 200, min: 0, max: 10000, step: 10, description: 'Adoptive cell dose (0 = untreated)' },
  { id: 'killRate', label: 'Kill Rate', type: 'number', default: 0.25, min: 0, max: 1, step: 0.05, description: 'Per-effector kill probability' },
];

export const abmCancerSimPlugin: TemplatePlugin = {
  id: 'tpl_abm_cancer_sim',
  name: 'Agent-Lite ABM Cancer Simulator (Tumor/Immune/Stromal)',
  domain: 'biotech' as ToolDomain,
  category: 'biotech' as ComponentTemplateCategory,
  description: 'Deterministic agent-lite tumor/immune/stromal simulator with hypoxia quiescence, exhaustion dynamics, VAF trajectory, and HOT/EXHAUSTED/EXCLUDED/COLD niche classification.',
  benchmarkFlops: 2600,
  complexity: 'O(Generations)',
  defaultScore: 0.93,
  tags: ['abm', 'oncology', 'car-t', 'tumor-microenvironment', 'deterministic'],
  params,
  synthesizer: (userParams, options) => {
    const nCells = Math.max(10, Math.floor(Number(userParams.nCells) || 1000));
    const generations = Math.max(1, Math.min(5000, Math.floor(Number(userParams.generations) || 60)));
    const carTDose = Math.max(0, Number(userParams.carTDose ?? 200));
    const killRate = Math.min(1, Math.max(0, Number(userParams.killRate ?? 0.25)));
    const compName = options?.componentName || 'AbmCancerSim';

    const sourceCode = `/**
 * Autonomously Synthesized Component: ${compName}
 * Blueprint: tpl_abm_cancer_sim (nCells: ${nCells}, generations: ${generations}, carTDose: ${carTDose}, killRate: ${killRate})
 * Agent-lite ABM: compartment counts with hypoxia quiescence, exhaustion dynamics,
 * VAF trajectory, and immune niche classification. Deterministic given seed.
 */
export type ImmuneNiche = 'HOT' | 'EXHAUSTED' | 'EXCLUDED' | 'COLD';

export interface AbmStep {
  generation: number;
  tumor: number;
  quiescent: number;
  immune: number;
  stromal: number;
  exhaustion: number;
  hypoxia: number;
  vaf: number;
}

export class ${compName} {
  private tumor: number;
  private mutant: number;
  private quiescent = 0;
  private immune: number;
  private stromal: number;
  private exhaustion = 0.05;
  private generation = 0;
  private rngState: number;
  private readonly carryingCapacity: number;
  private readonly carTDose: number;
  private readonly killRate: number;

  constructor(nCells = ${nCells}, carTDose = ${carTDose}, killRate = ${killRate}, seed = 42) {
    this.tumor = Math.max(1, nCells) * 0.8;
    this.mutant = Math.max(1, nCells) * 0.2;
    this.immune = 20 + Math.max(0, carTDose);
    this.stromal = Math.max(1, nCells) * 0.05;
    this.carryingCapacity = Math.max(1, nCells) * 4;
    this.carTDose = Math.max(0, carTDose);
    this.killRate = Math.min(1, Math.max(0, killRate));
    this.rngState = seed >>> 0;
  }

  private rand(): number {
    this.rngState |= 0;
    this.rngState = (this.rngState + 0x6d2b79f5) | 0;
    let t = Math.imul(this.rngState ^ (this.rngState >>> 15), 1 | this.rngState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public step(): AbmStep {
    const K = this.carryingCapacity;
    const burden = this.tumor / K;
    const hypoxia = Math.min(1, burden * 1.2);
    const qIn = this.tumor * hypoxia * 0.25 * (0.9 + this.rand() * 0.2);
    const qOut = this.quiescent * (1 - hypoxia) * 0.2;
    this.quiescent = Math.max(0, this.quiescent + qIn - qOut);
    this.tumor = Math.max(0, this.tumor - qIn + qOut);
    const growth = this.tumor * 0.22 * (1 - this.tumor / K) * (1 - hypoxia * 0.7);
    this.tumor += Math.max(0, growth);
    this.mutant += Math.max(0, this.mutant * 0.22 * (1 - (this.mutant + this.tumor * 0.2) / K));
    this.stromal += this.stromal * 0.05 * burden;
    const barrier = this.stromal / (this.tumor + this.stromal + 1);
    const infiltrationFactor = 1 - Math.min(0.9, barrier * 1.5);
    this.exhaustion = Math.min(1, Math.max(0, this.exhaustion + burden * 0.03 - 0.008));
    const effectors = this.immune * infiltrationFactor * (1 - this.exhaustion * 0.8);
    const kills = Math.min(this.tumor, effectors * this.killRate * (0.9 + this.rand() * 0.2));
    this.tumor = Math.max(0, this.tumor - kills);
    this.mutant = Math.max(0, this.mutant - kills * (this.mutant / (this.tumor + kills + 1e-9)));
    this.immune = Math.max(0, this.immune + this.carTDose * 0.05 * (1 - this.exhaustion) - this.immune * 0.02 * this.exhaustion);
    const total = this.tumor + this.quiescent + this.immune + this.stromal;
    const state: AbmStep = {
      generation: this.generation++,
      tumor: Math.round(this.tumor * 100) / 100,
      quiescent: Math.round(this.quiescent * 100) / 100,
      immune: Math.round(this.immune * 100) / 100,
      stromal: Math.round(this.stromal * 100) / 100,
      exhaustion: Math.round(this.exhaustion * 10000) / 10000,
      hypoxia: Math.round(hypoxia * 10000) / 10000,
      vaf: total > 0 ? Math.round((this.mutant / (2 * total)) * 100000) / 100000 : 0,
    };
    return state;
  }

  public run(generations = ${generations}): AbmStep[] {
    const n = Math.max(1, Math.min(5000, Math.floor(generations)));
    const traj: AbmStep[] = [];
    for (let i = 0; i < n; i++) traj.push(this.step());
    return traj;
  }

  public classifyNiche(): ImmuneNiche {
    const infiltration = this.immune / (this.tumor + this.immune + 1);
    const barrier = this.stromal / (this.tumor + this.stromal + 1);
    if (barrier > 0.45 && infiltration < 0.15) return 'EXCLUDED';
    if (infiltration >= 0.15 && this.exhaustion > 0.6) return 'EXHAUSTED';
    if (infiltration >= 0.15) return 'HOT';
    return 'COLD';
  }
}`;

    const testSuiteCode = `const untreated = new ${compName}(${nCells}, 0, ${killRate}, 7);
const treated = new ${compName}(${nCells}, ${carTDose}, ${killRate}, 7);
const trajU = untreated.run(${generations});
const trajT = treated.run(${generations});
assert trajU[trajU.length - 1].tumor > trajT[trajT.length - 1].tumor;
const niche = treated.classifyNiche();
assert niche === 'HOT' || niche === 'EXHAUSTED' || niche === 'EXCLUDED' || niche === 'COLD';
const replay = new ${compName}(${nCells}, ${carTDose}, ${killRate}, 7);
const trajR = replay.run(${generations});
assert JSON.stringify(trajT) === JSON.stringify(trajR);
assert trajT.every(s => s.vaf >= 0 && s.vaf <= 0.5);`;

    return {
      sourceCode,
      testSuiteCode,
      entrypointName: compName,
      summary: `Synthesized agent-lite ABM cancer simulator (${nCells} cells, ${generations} generations, CAR-T ${carTDose}) with niche classification`,
      selfHealingGuards: ['NonNegativePopulationClamp', 'ExhaustionUnitIntervalClamp', 'DeterministicSeedGuard'],
    };
  },
  selfHost: {
    stateful: true,
    ctorParamIds: ['nCells', 'carTDose', 'killRate'],
    methods: [
      { method: 'step', label: 'Advance one generation' },
      { method: 'run', label: 'Run N generations' },
      { method: 'classifyNiche', label: 'Classify immune niche' },
    ],
  },
};
