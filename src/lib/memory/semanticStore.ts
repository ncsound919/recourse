/**
 * Semantic tier — consolidates episode clusters into durable facts with
 * provenance back-links to their evidence episodes. Deterministic by default:
 * facts are emitted per fingerprint cluster in sorted order once the loss
 * count reaches the threshold. Swap in an injected summarizer for richer
 * statements later; the evidence links are produced either way.
 */
import type { ConsolidationOptions, Episode, SemanticFact, SemanticStoreDriver } from './types'

function defaultSummarizer(cluster: Episode[]): string {
  const losses = cluster.filter((e) => e.outcome === 'loss')
  const genes = [...new Set(losses.flatMap((e) => e.geneIds))].sort()
  return `${cluster[0]?.problemFingerprint ?? 'unknown'} produced ${losses.length} losses across ${cluster.length} attempts; strategies [${genes.join(', ')}] are associated with failure`
}

export class SemanticStore {
  private sequence = 0
  private readonly driver: SemanticStoreDriver

  constructor(driver: SemanticStoreDriver) {
    this.driver = driver
  }

  facts(): SemanticFact[] {
    return this.driver.list()
  }

  /** Emit and persist facts from loss clusters; returns the new facts only. */
  consolidate(episodes: Episode[], opts: ConsolidationOptions): SemanticFact[] {
    const summarizer = opts.summarizer ?? defaultSummarizer
    const byFingerprint = new Map<string, Episode[]>()
    for (const e of episodes) {
      const group = byFingerprint.get(e.problemFingerprint) ?? []
      group.push(e)
      byFingerprint.set(e.problemFingerprint, group)
    }

    const created: SemanticFact[] = []
    for (const [fingerprint, group] of [...byFingerprint.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const losses = group.filter((e) => e.outcome === 'loss')
      if (losses.length < opts.minClusterSize) continue
      this.sequence += 1
      const fact: SemanticFact = {
        id: `fact-${this.sequence}`,
        statement: summarizer(group),
        confidence: losses.length / group.length,
        evidenceEpisodeIds: losses.map((e) => e.id),
        createdAt: this.sequence,
      }
      this.driver.append(fact)
      created.push(fact)
      void fingerprint
    }
    return created
  }
}
