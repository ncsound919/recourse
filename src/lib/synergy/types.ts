// src/lib/synergy/types.ts
/**
 * Shared types for the cross-domain synergy engine. Types only — no runtime.
 */

/** Reserved for the Plan 4 admission-gate lifecycle; unused in Plan 1. */
export type EvidenceStatus = 'hypothesis' | 'tested' | 'reproduced' | 'refuted' | 'stale';
export type RelType = 'rel' | 'attr' | 'fn';

export interface Rel {
  functor: string;
  type: RelType;
  args: string[];
  order: number;
}

/**
 * Normalized, source-agnostic contract shape. This is an intentional structural
 * SUBSET of the lego `StudContract` (src/lego/types.ts): lego bricks normalize
 * into it via a converter in methodIndex so non-lego methods (verified tools,
 * translation engines, logistics functions) can carry a contract too. Do not
 * add lego-only cost/latency fields here.
 */
export interface StudShape {
  dims: Array<number | string>;
  dtype: string;
  preconditions: string[];
}

export interface MethodSignature {
  id: string;
  name: string;
  domain: string;
  source: 'tool' | 'brick' | 'translation';
  primitives: string[];
  inputContract?: StudShape;
  outputContract?: StudShape;
  complexity?: string;
  deterministic: boolean;
  relations: Rel[];
  relationBasis?: 'declared' | 'placeholder';
  suiteHash?: string;
}

export interface ProblemSignature {
  id: string;
  name: string;
  domain: string;
  requiredPrimitives: string[];
  requiredContract?: StudShape;
  acceptanceTest: string;
  testHash: string;
  extraction: 'heuristic' | 'declared';
  relations: Rel[];
  relationBasis?: 'declared' | 'placeholder';
}

export interface BridgeEvidence {
  term: string;
  weightAB: number;
  weightBC: number;
  score: number;
  docs: number;
}

export interface FilterDecision {
  gate: string;
  passed: boolean;
  reason: string;
}

export interface TransferCandidate {
  id: string;
  methodId: string;
  problemId: string;
  fromDomain: string;
  toDomain: string;
  bridges: BridgeEvidence[];
  score: number;
  support: number;
  alignment?: AlignmentResult;
  /** high structure + low surface similarity = far (true analogy) transfer, [0,1] */
  farTransfer?: number;
  prediction: 'pass' | 'fail';
  falsification: string;
  filters: FilterDecision[];
  engineVersion: string;
}

export interface SynergyEdge {
  from: string;
  to: string;
  kind: 'resolved' | 'candidate';
  score: number;
  passes: number;
  attempts: number;
  backingIds: string[];
}

export interface SynergyMap {
  engineVersion: string;
  generatedAtRun: string;
  domains: string[];
  edges: SynergyEdge[];
  candidates: TransferCandidate[];
  manifestHash: string;
}

export interface AlignmentMapping {
  /** base functor or entity */
  base: string;
  /** target functor or entity */
  target: string;
  /** [0,1] evidence weight for this match */
  evidence: number;
}

export interface AlignmentResult {
  /** summed positive evidence of the chosen gmap, normalized to [0,1] */
  gmapWeight: number;
  mappings: AlignmentMapping[];
  /** base predicates projected onto the target */
  inferences: string[];
  /** structural consistency (one-to-one + parallel connectivity) held */
  consistent: boolean;
}
