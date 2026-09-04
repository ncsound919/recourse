// src/dream/mutator-types.ts — contracts for the AI Architectural Mutator.

import type { InvariantCheck, ToolDomain } from './types';

/** Gate policy applied to verified genes.
 *  - auto_promote:    verified genes become active immediately
 *  - manual_approval: verified genes land in pending_approval until approved */
export type PromotionPolicy = 'auto_promote' | 'manual_approval';

export type MutationOutcome = 'promoted' | 'pending_approval' | 'rejected';

export type GeneStatus = 'active' | 'pending_approval' | 'rejected' | 'retired';

export type GeneOrigin = 'local_model' | 'deterministic_fallback' | 'dream_engine';

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
  engine?: 'local_model' | 'deterministic_fallback';
  error?: string;
}
