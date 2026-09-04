// src/dream/learner-types.ts — contracts for the Recursive Learner.
import type { ToolDomain } from './types';

/** Beta-posterior belief over a gene's robustness under stress. */
export interface GeneBelief {
  geneId: string;
  geneName: string;
  domain: ToolDomain;
  alpha: number;      // accumulated reward mass (successes)
  beta: number;       // accumulated failure mass
  attempts: number;
  meanReward: number; // EMA reward, updated at meta.learningRate
  weight: number;     // selection weight = decaying meanReward
  lastEpisode: number;
}

/** Hyperparameters the learner tunes about ITSELF (the recursive layer). */
export interface MetaParams {
  learningRate: number;       // EMA rate for rewards (self-adjusted)
  temperature: number;        // exploration temperature (entropy-driven)
  promotionThreshold: number; // meanReward needed for 'amplify' directives
  decayFactor: number;        // forgetting rate for unevaluated genes
}

export type DirectiveKind = 'retire' | 'refine' | 'amplify' | 'synthesize_template';

/** Structured recommendations the learner emits back into the ecosystem. */
export interface Directive {
  id: string;
  kind: DirectiveKind;
  geneName: string;
  reason: string;
  episode: number;
  templateId?: string;
  targetDomain?: ToolDomain;
}

/** Append-only, hash-chained learning ledger. */
export interface LedgerEntry {
  episode: number;
  prevHash: string;
  inputHash: string;   // hash of the evaluated gene set (divergence detector)
  stateHash: string;   // hash of canonical post-episode state
  summary: string;
  createdAt: string;
  /** Exact external inputs this episode was evaluated against, so a replay
   *  from genesis reproduces the chain bit-for-bit instead of guessing. */
  input?: {
    externalScore?: number; // verifier/pass-rate signal folded into selfScore
  };
}

export interface LearnerState {
  schema: 1;
  episode: number;
  meta: MetaParams;
  geneBeliefs: Record<string, GeneBelief>;
  selfScore: number;         // EMA of the learner's own prediction accuracy
  calibrationError: number;  // mean |realized - predicted| last episode
  directives: Directive[];
  ledgerHead: string;
  updatedAt: string;
}

export interface EpisodeReport {
  episode: number;
  genesEvaluated: number;
  avgReward: number;
  calibrationError: number;
  selfScore: number;
  meta: MetaParams;
  directives: Directive[];
  stateHash: string;
  replayable: true;
}

export interface ReplayReport {
  replayed: number;
  divergedAtEpisode: number | null;
  matchesHead: boolean;
  storedHead: string;
  replayedHead: string;
}
