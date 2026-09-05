/**
 * Episodic tier — append-only run log with fingerprint retrieval and
 * token-overlap similarity ranking. Sequence-based ids and timestamps keep
 * replays deterministic.
 */
import type { Episode, EpisodeStoreDriver } from './types'

export interface EpisodicStoreOptions {
  driver: EpisodeStoreDriver
  idPrefix?: string
}

function tokens(fingerprint: string): string[] {
  return fingerprint
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0)
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let intersection = 0
  for (const t of a) if (b.has(t)) intersection++
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

export class EpisodicStore {
  private sequence = 0
  private readonly driver: EpisodeStoreDriver
  private readonly idPrefix: string

  constructor(opts: EpisodicStoreOptions) {
    this.driver = opts.driver
    this.idPrefix = opts.idPrefix ?? 'ep'
  }

  record(episode: Omit<Episode, 'id' | 'timestamp'>): Episode {
    this.sequence += 1
    const full: Episode = {
      ...episode,
      id: `${this.idPrefix}-${this.sequence}`,
      timestamp: this.sequence,
    }
    this.driver.append(full)
    return full
  }

  all(): Episode[] {
    return this.driver.list()
  }

  queryByFingerprint(fingerprint: string): Episode[] {
    return this.all().filter((e) => e.problemFingerprint === fingerprint)
  }

  /** Rank all episodes by token overlap with the given fingerprint. */
  similar(fingerprint: string): Array<{ episode: Episode; similarity: number }> {
    const target = new Set(tokens(fingerprint))
    return this.all()
      .map((episode) => ({
        episode,
        similarity: jaccard(target, new Set(tokens(episode.problemFingerprint))),
      }))
      .filter((x) => x.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity || a.episode.id.localeCompare(b.episode.id))
  }

  winsForGene(geneId: string): Episode[] {
    return this.all().filter((e) => e.geneIds.includes(geneId) && e.outcome === 'win')
  }

  distinctWinFingerprints(geneId: string): number {
    return new Set(this.winsForGene(geneId).map((e) => e.problemFingerprint)).size
  }
}
