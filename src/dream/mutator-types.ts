// src/dream/mutator-types.ts — contracts for the AI Architectural Mutator.

import type { InvariantCheck, ToolDomain } from './types';
import type { BiasOptions } from '../lib/memory/failureMemory';
import type { Episode } from '../lib/memory/types';

/** Canonical gate policy applied to verified genes (one vocabulary, shared by
 *  the mutator, the HTTP API, and the UI).
 *  - any_pass:        verified genes become active immediately
 *  - non_regressing:  promote only when the verified score is >= the current
 *                     active baseline for the same tool (no baseline => promote)
 *  - strict_improve:  promote only when the verified score is strictly greater
 *  - human_approval:  verified genes land in pending_approval until approved */
export type PromotionPolicy = 'any_pass' | 'non_regressing' | 'strict_improve' | 'human_approval';

/** Legacy labels accepted at API boundaries for backward compatibility. */
export type LegacyPromotionPolicy = 'auto_promote' | 'manual_approval';

export type PromotionPolicyInput = PromotionPolicy | LegacyPromotionPolicy;

export type MutationOutcome = 'promoted' | 'pending_approval' | 'rejected';

export type GeneStatus = 'active' | 'pending_approval' | 'rejected' | 'retired';

export type GeneOrigin = 'local_model' | 'api_model' | 'deterministic_fallback' | 'dream_engine';

/** Raw candidate produced by the model (or the local fallback synthesizer).
 *  Never trusted directly — everything passes through verification. */
export interface MutationCandidate {
  toolName: string;
  description: string;
  source: string;
  testVectors: unknown[];
  expectedOutputs?: unknown[];
}

export interface RegistryGene {
  id: string;
  name: string;
  domain: ToolDomain;
  version: number;      // accepted iterations only
  generation: number;   // every attempt increments (shown as "Gen #" in UI)
  origin: GeneOrigin;
  status: GeneStatus;
  code: string;
  description: string;
  testVectors: unknown[];
  versionHash: string;
  parentHash?: string;
  verifierChecks: InvariantCheck[];
  instructions?: string;
  createdAt: string;
}

/** Optional failure-memory input for evolveGene. When present the mutator
 *  steers synthesis with past similar failures and returns a recordable
 *  episode. When absent behavior is exactly as before. */
export interface EvolveMemory {
  /** Past episodes to learn from (losses steer, wins/neutrals never block). */
  episodes: Episode[];
  /** Max avoid-lines attached to the synthesis instructions. Default 5. */
  maxAvoidLines?: number;
  /** Bias options for the transparency weight lookup. */
  bias?: BiasOptions;
}

/** Failure-memory accounting attached to a mutation result. */
export interface EvolveMemoryResult {
  fingerprint: string;
  avoidedCount: number;
  /** Current bias weight for the (sanitized) target tool name, when given. */
  biasWeight?: number;
  /** Recordable episode for the caller to persist (store owns id/timestamp). */
  episode: Omit<Episode, 'id' | 'timestamp'>;
}

/** Shape consumed by AiMutatorModal's evolutionResult. */
export interface MutationResult {
  success: boolean;
  outcome: MutationOutcome;
  toolName: string;
  version: number;
  generation: number;
  versionHash: string;
  verifierResult: { verified: boolean; summary: string; checks: InvariantCheck[] };
  geneId?: string;
  engine?: 'local_model' | 'api_model' | 'deterministic_fallback';
  error?: string;
  memory?: EvolveMemoryResult;
}
