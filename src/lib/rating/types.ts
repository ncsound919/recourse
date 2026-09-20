/**
 * Cross-app pairwise rating — shared types.
 *
 * This is the generic counterpart to the composer learner
 * (src/lib/composer/learner.ts). Where that learner can only score Recourse's
 * own deterministic (style, seed) briefs, this store rates ARBITRARY external
 * variations (ChordStudio, SoundLab, anything) by an opaque `paramHash` of the
 * parameters that produced the sound. It never re-renders or re-composes: the
 * caller owns reproduction; the store owns the preference record.
 */

/** Where a variation came from. Free-form so new clients need no schema change. */
export type RatingSource = string;

export interface VariationDescriptor {
  /** SHA-256 of the canonical JSON of `params`, first 16 hex chars. */
  paramHash: string;
  source: RatingSource;
  /** The parameters that produced the sound — copied, never referenced. */
  params: Record<string, unknown>;
  label?: string;
  /** Parent/seed identity the variation evolved from, if any. */
  seedId?: string;
  /** 0 = seed itself, 1+ = batch depth. */
  generation?: number;
  origin?: 'evolve' | 'seed' | 'hand_tuned' | string;
  createdAt: number;
}

export type Winner = 'A' | 'B';

export interface DimensionTags {
  tags?: string[];
  note?: string;
}

export interface PairChoice {
  pairId: string;
  sessionId?: string;
  source: RatingSource;
  aHash: string;
  bHash: string;
  winner: Winner;
  confidence?: 1 | 2 | 3;
  dimensions?: DimensionTags;
  listenMsA?: number;
  listenMsB?: number;
  elapsedMs?: number;
  decidedAt: number;
  /** Assigned by the store; position in the append-only ledger. */
  seq: number;
  prevHash: string;
  hash: string;
}

export type LedgerRecord =
  | { kind: 'variation'; seq: number; prevHash: string; hash: string; variation: VariationDescriptor }
  | { kind: 'pair'; seq: number; prevHash: string; hash: string; choice: Omit<PairChoice, 'seq' | 'prevHash' | 'hash'> };

export interface Standing {
  paramHash: string;
  source: RatingSource;
  label?: string;
  elo: number;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
}

export const RATING_SYSTEM = 'elo_k32_v1';
