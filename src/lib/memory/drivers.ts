/** In-memory drivers; swap for Supabase/file-backed implementations. */
import type { Episode, EpisodeStoreDriver, SemanticFact, SemanticStoreDriver } from './types'

export class InMemoryEpisodeDriver implements EpisodeStoreDriver {
  private readonly items: Episode[] = []
  append(episode: Episode): void {
    this.items.push(episode)
  }
  list(): Episode[] {
    return [...this.items]
  }
}

export class InMemorySemanticDriver implements SemanticStoreDriver {
  private readonly items: SemanticFact[] = []
  append(fact: SemanticFact): void {
    this.items.push(fact)
  }
  list(): SemanticFact[] {
    return [...this.items]
  }
}
