/**
 * Failure memory — bias mutator search away from known-bad gene regions.
 * Every gene keeps a weight in [epsilon, 1]; losses push it down, wins push
 * it up (capped at 1). The epsilon floor guarantees an exploration minimum
 * so negative examples never fully prune the search space.
 */
import type { Episode } from './types'

export interface BiasOptions {
  /** Minimum weight floor. Default 0.1. */
  epsilon?: number
  /** Weight subtracted per loss involving the gene. Default 0.25. */
  lossPenalty?: number
  /** Weight added per win involving the gene. Default 0.05. */
  winBonus?: number
}

export function geneBiasWeights(
  episodes: Episode[],
  geneIds: string[],
  opts: BiasOptions = {},
): Map<string, number> {
  const epsilon = opts.epsilon ?? 0.1
  const lossPenalty = opts.lossPenalty ?? 0.25
  const winBonus = opts.winBonus ?? 0.05

  const weights = new Map<string, number>()
  for (const geneId of geneIds) weights.set(geneId, 1)

  for (const episode of episodes) {
    if (episode.outcome !== 'win' && episode.outcome !== 'loss') continue
    for (const geneId of episode.geneIds) {
      if (!weights.has(geneId)) continue
      const delta = episode.outcome === 'loss' ? -lossPenalty : winBonus
      weights.set(geneId, weights.get(geneId)! + delta)
    }
  }

  for (const [geneId, weight] of weights) {
    weights.set(geneId, Math.min(1, Math.max(epsilon, weight)))
  }
  return weights
}

/** Gene ids ordered most-promising-first (ties broken lexically). */
export function rankByBias(episodes: Episode[], geneIds: string[], opts: BiasOptions = {}): string[] {
  const weights = geneBiasWeights(episodes, geneIds, opts)
  return [...geneIds].sort(
    (a, b) => weights.get(b)! - weights.get(a)! || a.localeCompare(b),
  )
}
