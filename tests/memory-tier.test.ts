import { describe, expect, it } from 'vitest'
import { InMemoryEpisodeDriver, InMemorySemanticDriver } from '../src/lib/memory/drivers'
import { EpisodicStore } from '../src/lib/memory/episodicStore'
import { SemanticStore } from '../src/lib/memory/semanticStore'
import { geneBiasWeights, rankByBias } from '../src/lib/memory/failureMemory'
import { promotionCandidates } from '../src/lib/memory/skillPromotion'
import type { Episode } from '../src/lib/memory/types'

type NewEpisode = Omit<Episode, 'id' | 'timestamp'>

function episode(overrides: Partial<NewEpisode> = {}): NewEpisode {
  return {
    problemFingerprint: 'layout/metric-load',
    outcome: 'loss',
    score: 0,
    geneIds: ['gene-a'],
    summary: 'test episode',
    ...overrides,
  }
}

describe('EpisodicStore', () => {
  it('records with deterministic ids and queries by fingerprint', () => {
    const store = new EpisodicStore({ driver: new InMemoryEpisodeDriver() })
    store.record(episode())
    store.record(episode({ problemFingerprint: 'intake/rss-parse' }))
    store.record(episode({ problemFingerprint: 'layout/metric-load', outcome: 'win', score: 0.9 }))
    expect(store.all().map((e) => e.id)).toEqual(['ep-1', 'ep-2', 'ep-3'])
    expect(store.queryByFingerprint('layout/metric-load')).toHaveLength(2)
  })

  it('ranks similar fingerprints by token overlap', () => {
    const store = new EpisodicStore({ driver: new InMemoryEpisodeDriver() })
    store.record(episode({ problemFingerprint: 'layout/metric-load' }))
    store.record(episode({ problemFingerprint: 'layout/metric-idle' }))
    store.record(episode({ problemFingerprint: 'intake/rss-parse' }))
    const ranked = store.similar('layout/metric-load')
    expect(ranked[0].episode.problemFingerprint).toBe('layout/metric-load')
    expect(ranked[1].episode.problemFingerprint).toBe('layout/metric-idle')
    expect(ranked.every((r) => r.similarity > 0)).toBe(true)
  })
})

describe('SemanticStore', () => {
  it('emits a fact when a fingerprint cluster has enough losses, with evidence links', () => {
    const episodic = new EpisodicStore({ driver: new InMemoryEpisodeDriver() })
    const semantic = new SemanticStore(new InMemorySemanticDriver())
    episodic.record(episode({ outcome: 'loss', geneIds: ['gene-a'] }))
    episodic.record(episode({ outcome: 'loss', geneIds: ['gene-a'] }))
    episodic.record(episode({ outcome: 'loss', geneIds: ['gene-a'] }))
    episodic.record(episode({ outcome: 'win', score: 0.8, geneIds: ['gene-b'] }))
    const facts = semantic.consolidate(episodic.all(), { minClusterSize: 3 })
    expect(facts).toHaveLength(1)
    expect(facts[0].confidence).toBe(0.75)
    expect(facts[0].evidenceEpisodeIds).toEqual(['ep-1', 'ep-2', 'ep-3'])
    expect(facts[0].statement).toContain('layout/metric-load')
    expect(semantic.facts()).toEqual(facts)
  })

  it('emits nothing below the cluster threshold', () => {
    const episodic = new EpisodicStore({ driver: new InMemoryEpisodeDriver() })
    episodic.record(episode({ outcome: 'loss' }))
    episodic.record(episode({ outcome: 'loss' }))
    const semantic = new SemanticStore(new InMemorySemanticDriver())
    expect(semantic.consolidate(episodic.all(), { minClusterSize: 3 })).toHaveLength(0)
  })
})

describe('failure memory biasing', () => {
  const episodes: Episode[] = [
    { id: '1', timestamp: 1, problemFingerprint: 'p1', outcome: 'loss', score: 0, geneIds: ['bad'], summary: '' },
    { id: '2', timestamp: 2, problemFingerprint: 'p1', outcome: 'loss', score: 0, geneIds: ['bad'], summary: '' },
    { id: '3', timestamp: 3, problemFingerprint: 'p2', outcome: 'win', score: 1, geneIds: ['good'], summary: '' },
    { id: '4', timestamp: 4, problemFingerprint: 'p2', outcome: 'neutral', score: 0.5, geneIds: ['flat'], summary: '' },
  ]

  it('down-weights loss-heavy genes but never below the epsilon floor', () => {
    const weights = geneBiasWeights(episodes, ['bad', 'good', 'flat', 'unused'])
    expect(weights.get('bad')).toBe(0.5)
    expect(weights.get('good')).toBe(1)
    expect(weights.get('flat')).toBe(1)
    expect(weights.get('unused')).toBe(1)

    const floored = geneBiasWeights(
      episodes.map((e) => ({ ...e, outcome: 'loss' as const, geneIds: ['bad'] })),
      ['bad'],
      { epsilon: 0.2 },
    )
    expect(floored.get('bad')).toBe(0.2)
  })

  it('ranks candidates deterministically with lexical tie-breaks', () => {
    expect(rankByBias(episodes, ['bad', 'good', 'flat'])).toEqual(['good', 'flat', 'bad'])
    expect(rankByBias(episodes, ['good', 'flat'])).toEqual(['flat', 'good'])
  })
})

describe('skill promotion detection', () => {
  it('requires wins across distinct problems, not repeat wins on one problem', () => {
    const episodes: Episode[] = [
      { id: '1', timestamp: 1, problemFingerprint: 'p1', outcome: 'win', score: 0.9, geneIds: ['generalist'], summary: '' },
      { id: '2', timestamp: 2, problemFingerprint: 'p2', outcome: 'win', score: 0.8, geneIds: ['generalist'], summary: '' },
      { id: '3', timestamp: 3, problemFingerprint: 'p3', outcome: 'win', score: 0.7, geneIds: ['generalist'], summary: '' },
      { id: '4', timestamp: 4, problemFingerprint: 'p1', outcome: 'win', score: 0.9, geneIds: ['specialist'], summary: '' },
      { id: '5', timestamp: 5, problemFingerprint: 'p1', outcome: 'win', score: 0.95, geneIds: ['specialist'], summary: '' },
      { id: '6', timestamp: 6, problemFingerprint: 'p1', outcome: 'win', score: 0.85, geneIds: ['specialist'], summary: '' },
    ]
    const candidates = promotionCandidates(episodes, { minDistinctProblemWins: 3 })
    expect(candidates.map((c) => c.geneId)).toEqual(['generalist'])
    expect(candidates[0].distinctProblemWins).toBe(3)
    expect(candidates[0].winEpisodeIds).toEqual(['1', '2', '3'])
  })

  it('applies the average win score filter when provided', () => {
    const episodes: Episode[] = [
      { id: '1', timestamp: 1, problemFingerprint: 'p1', outcome: 'win', score: 0.5, geneIds: ['g'], summary: '' },
      { id: '2', timestamp: 2, problemFingerprint: 'p2', outcome: 'win', score: 0.6, geneIds: ['g'], summary: '' },
    ]
    expect(promotionCandidates(episodes, { minDistinctProblemWins: 2 })).toHaveLength(1)
    expect(promotionCandidates(episodes, { minDistinctProblemWins: 2, minAverageWinScore: 0.7 })).toHaveLength(0)
  })
})
