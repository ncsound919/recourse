/**
 * Skill auto-promotion — detect genes that win across multiple unrelated
 * problems. A gene that only wins repeatedly on one fingerprint is a
 * specialist, not a skill; the distinct-fingerprint requirement filters
 * that out. Promotion itself (tool extraction + suite + pre-merge gate)
 * stays a separate gated pipeline — this module only surfaces candidates.
 */
import type { Episode } from './types'

export interface PromotionRule {
  minDistinctProblemWins: number
  minAverageWinScore?: number
}

export interface PromotionCandidate {
  geneId: string
  distinctProblemWins: number
  averageWinScore: number
  winEpisodeIds: string[]
}

export function promotionCandidates(episodes: Episode[], rule: PromotionRule): PromotionCandidate[] {
  const winsByGene = new Map<string, Episode[]>()
  for (const episode of episodes) {
    if (episode.outcome !== 'win') continue
    for (const geneId of episode.geneIds) {
      const list = winsByGene.get(geneId) ?? []
      list.push(episode)
      winsByGene.set(geneId, list)
    }
  }

  const candidates: PromotionCandidate[] = []
  for (const [geneId, wins] of [...winsByGene.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const distinctProblemWins = new Set(wins.map((w) => w.problemFingerprint)).size
    const averageWinScore = wins.reduce((sum, w) => sum + w.score, 0) / wins.length
    const scoreOk = rule.minAverageWinScore === undefined || averageWinScore >= rule.minAverageWinScore
    if (distinctProblemWins >= rule.minDistinctProblemWins && scoreOk) {
      candidates.push({
        geneId,
        distinctProblemWins,
        averageWinScore,
        winEpisodeIds: wins.map((w) => w.id),
      })
    }
  }
  return candidates.sort(
    (a, b) => b.distinctProblemWins - a.distinctProblemWins || a.geneId.localeCompare(b.geneId),
  )
}
