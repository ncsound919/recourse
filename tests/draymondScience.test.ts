import { describe, it, expect } from 'vitest';
import {
  tidSignalsToTrendSeries,
  researchGradesToTrendSeries,
  learningStoreToTrendSeries,
  draymondToTrendSeries,
  synergyCandidateToScienceInsight,
  crossDomainLinkToScienceInsight,
  draymondInsightsToKnownPairs,
  timestampToMs,
  type DraymondTidSignal,
} from '../src/lib/draymondScience';
import { buildCrossDomainGraph } from '../src/lib/crossDomainGraph';
import type { TransferCandidate } from '../src/lib/synergy/types';

describe('draymondScience — real payloads into real series, no fabrication', () => {
  it('groups TID signals by component+metric and canonicalizes the domain', () => {
    const signals: DraymondTidSignal[] = [
      { id: 's1', source: 'benchmark', category: 'performance', component: 'oncology', metric: 'weakness_score', value: 12, created_at: '2026-09-01T00:00:00Z' },
      { id: 's2', source: 'benchmark', category: 'performance', component: 'oncology', metric: 'weakness_score', value: 15, created_at: '2026-09-02T00:00:00Z' },
      { id: 's3', source: 'benchmark', category: 'performance', component: 'aging', metric: 'weakness_score', value: 9, created_at: '2026-09-01T00:00:00Z' },
      // invalid: no timestamp / non-numeric value -> skipped, not faked
      { id: 's4', source: 'benchmark', category: 'performance', component: 'oncology', metric: 'weakness_score', value: 1, created_at: 'not-a-date' },
    ];
    const series = tidSignalsToTrendSeries(signals);
    expect(series).toHaveLength(2);
    const onco = series.find((s) => s.id === 'draymond:tid:oncology:weakness_score')!;
    expect(onco.domain).toBe('health_oncology');
    expect(onco.points.map((p) => p.value)).toEqual([12, 15]);
    expect(series.find((s) => s.id.includes('aging'))!.domain).toBe('aging');
  });

  it('builds grade series with score + real dimensions only', () => {
    const grades = [
      { goalId: 'g1', domain: 'sports', score: 620, dimensions: { novelty: 0.5, crossDomain: 0.8 }, gradedAt: '2026-09-01T00:00:00Z' },
      { goalId: 'g2', domain: 'sports', score: 700, dimensions: { novelty: 0.6, crossDomain: 0.9, impact: 0.7 }, gradedAt: '2026-09-02T00:00:00Z' },
      { goalId: 'g3', domain: 'biotech', score: 500, gradedAt: 'bad' }, // skipped: no time axis
    ];
    const series = researchGradesToTrendSeries(grades);
    const score = series.find((s) => s.id === 'draymond:grade:sports:breakthrough_score')!;
    expect(score.points.map((p) => p.value)).toEqual([620, 700]);
    expect(series.find((s) => s.id === 'draymond:grade:sports:dim_crossDomain')!.points).toHaveLength(2);
    expect(series.some((s) => s.domain === 'biotech')).toBe(false);
  });

  it('flattens learning-store drift records into metrics with a timestamp', () => {
    const series = learningStoreToTrendSeries({
      driftMetrics: [
        { at: '2026-09-01T00:00:00Z', domain: 'sports', driftScore: 0.1, driftVelocity: 0.02 },
        { at: '2026-09-02T00:00:00Z', domain: 'sports', driftScore: 0.2, driftVelocity: 0.03 },
      ],
    });
    expect(series.find((s) => s.id === 'draymond:learning:sports:drift_driftScore')!.points).toHaveLength(2);
  });

  it('de-duplicates series across payloads by id', () => {
    const s = draymondToTrendSeries({
      signals: [{ id: 's1', source: 'benchmark', category: 'performance', component: 'sports', metric: 'm', value: 1, created_at: '2026-09-01T00:00:00Z' }],
      grades: [],
      learning: null,
    });
    expect(s).toHaveLength(1);
  });

  it('exports a synergy candidate as a science insight, or null when unmapped and required', () => {
    const c: TransferCandidate = {
      id: 'tc_1', methodId: 'method:tool:fit', problemId: 'problem:protocol', fromDomain: 'health_oncology', toDomain: 'sports',
      bridges: [{ term: 'optimization', weightAB: 0.7, weightBC: 0.6, score: 0.6, docs: 3 }],
      score: 0.6, support: 1, prediction: 'pass', falsification: 'f', filters: [], engineVersion: '0.1.0',
    };
    const r = synergyCandidateToScienceInsight(c)!;
    expect(r.from_domain).toBe('biotech');
    expect(r.to_domain).toBe('sports');
    expect(r.translated_metrics[0].name).toBe('optimization');

    const unmapped: TransferCandidate = { ...c, fromDomain: 'mathematics', toDomain: 'cybersecurity' };
    expect(synergyCandidateToScienceInsight(unmapped)).toBeNull();
    // ...unless mapping is not required.
    expect(synergyCandidateToScienceInsight(unmapped, { requireDraymondDomain: false })).not.toBeNull();
  });

  it('exports a unified link with both evidence metrics', () => {
    const g = buildCrossDomainGraph({
      candidates: [{
        id: 'tc_1', methodId: 'm', problemId: 'p', fromDomain: 'health_oncology', toDomain: 'sports',
        bridges: [], score: 0.6, support: 1, prediction: 'pass', falsification: 'f', filters: [], engineVersion: '0.1.0',
      }],
    });
    const r = crossDomainLinkToScienceInsight(g.links[0])!;
    expect(r.from_domain).toBe('biotech');
    expect(r.translated_metrics.map((m) => m.name)).toContain('structural_transfer_score');
  });

  it('maps Draymond cross-domain reports into Recourse knownPairs', () => {
    const pairs = draymondInsightsToKnownPairs([
      { from_domain: 'sports', to_domain: 'biotech' },
      { from_domain: 'sports', to_domain: 'sports' }, // dropped (same)
    ]);
    expect(pairs).toContain('sports->health_oncology');
    expect(pairs).toContain('sports->aging');
    expect(pairs).toContain('sports->biotech');
    expect(pairs.some((p) => p === 'sports->sports')).toBe(false);
  });

  it('timestampToMs parses ISO and rejects garbage', () => {
    expect(timestampToMs('2026-09-01T00:00:00Z')).toBe(Date.parse('2026-09-01T00:00:00Z'));
    expect(timestampToMs('nope')).toBeNull();
    expect(timestampToMs(undefined)).toBeNull();
  });
});
