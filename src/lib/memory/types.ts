/**
 * Tiered Memory — shared types.
 * Spec: docs/superpowers/specs/2026-09-04-tiered-memory-and-experience-learning.md
 */

export type Outcome = 'win' | 'loss' | 'neutral'

/** Episodic tier: append-only record of every run. */
export interface Episode {
  id: string
  timestamp: number
  problemFingerprint: string
  toolName?: string
  outcome: Outcome
  score: number
  geneIds: string[]
  summary: string
  provenanceId?: string
}

/** Semantic tier: durable facts consolidated from episode clusters. */
export interface SemanticFact {
  id: string
  statement: string
  confidence: number
  evidenceEpisodeIds: string[]
  createdAt: number
}

export interface EpisodeStoreDriver {
  append(episode: Episode): void
  list(): Episode[]
}

export interface SemanticStoreDriver {
  append(fact: SemanticFact): void
  list(): SemanticFact[]
}

export interface ConsolidationOptions {
  /** Minimum loss count per fingerprint cluster before a fact is emitted. */
  minClusterSize: number
  /** Deterministic by default; inject an LLM-backed summarizer later if desired. */
  summarizer?: (cluster: Episode[]) => string
}
