// src/dream/types.ts — shared contracts for the Dreaming Engine.
// Re-export these from your existing `../types` module so the view compiles:
//   export * from './dream/types';

export type DreamPhase =
  | 'idle'
  | 'rem_counterfactual_sim'
  | 'synaptic_pruning'
  | 'cross_pollination'
  | 'theorem_induction'
  | 'lucid_crystallization'
  | 'memory_consolidation';

export type ToolDomain =
  | 'coding'
  | 'math'
  | 'biotech'
  | 'systemic'
  | 'neuro_symbolic'
  | 'cyber_defense'
  | 'quantum_sim';

/** A single structural parameterization of a tool-gene template. */
export interface GenomeSpec {
  kind: string;
  domain: ToolDomain;
  params: Record<string, number>;
}

export interface InvariantCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface DreamThought {
  id: string;
  phase: DreamPhase;
  domain: ToolDomain;
  premise: string;
  hypothesis: string;
  simulatedOutcome: string;
  intensity: number;                  // 0..1 — survival weight, decays under pruning
  crystallizationReadiness: number;   // 0..1 — raised by passing theorem induction
  abstractGenomeDraft?: string;       // compiled gene source shown in the UI
  genome?: GenomeSpec;                // structural spec used for mutation/crossover
  /** Where this thought came from: the local model, or the deterministic rule lexicon. */
  origin?: 'local_model' | 'rule_based';
  /** Arbitrary code candidate (local-model thoughts) + its own assert suite. */
  code?: string;
  codeTests?: string;
  invariantChecks?: InvariantCheck[];
  parentId?: string;
  secondParentId?: string;
  provenance?: string[];
  createdAt?: string;
  timestamp?: number;
  tick?: number;
}

export interface CrystallizedTool {
  id: string;
  name: string;
  domain: ToolDomain;
  kind: string;
  description: string;
  code: string;
  verified: boolean;
  invariantChecks: InvariantCheck[];
  crystallizedAt: string;
  fromThoughtId: string;
}

export interface DreamState {
  isDreamingActive: boolean;
  currentPhase: DreamPhase;
  dreamCyclesCompleted: number;
  cognitiveCoherence: number;
  totalCrystallizedGenes: number;
  recentThoughts: DreamThought[];
  registry: CrystallizedTool[];
  seed: number;
  tick: number;
  lastTickAt: string | null;
  prunedCount: number;
  activeHypothesesCount?: number;
  lastCrystallizationTime?: number;
  /** Snapshot of real signals consumed at the last memory_consolidation phase. */
  lastSignalSnapshot?: {
    readinessScore: number | null;
    legoAssemblyCount: number | null;
    learnerEpisode: number | null;
    learnerCalibration: number | null;
    sampledAtTick: number;
  } | null;
  /** How many memory consolidation cycles have run (increments each phase). */
  consolidationCount?: number;
}

export interface TickResult {
  dreamState: DreamState;
  newThought: DreamThought | null;
  phaseReport: string;
}
