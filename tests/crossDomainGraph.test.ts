import { describe, it, expect } from 'vitest';
import { buildCrossDomainGraph, linksForDomain } from '../src/lib/crossDomainGraph';
import type { TransferCandidate } from '../src/lib/synergy/types';
import type { LaggedCorrelation } from '../src/lib/trendEngine';

function candidate(over: Partial<TransferCandidate>): TransferCandidate {
  return {
    id: 'tc_1',
    methodId: 'method:tool:x',
    problemId: 'problem:y',
    fromDomain: 'health_oncology',
    toDomain: 'sports',
    bridges: [],
    score: 0.5,
    support: 2,
    prediction: 'pass',
    falsification: 'f',
    filters: [],
    engineVersion: '0.1.0',
    ...over,
  };
}

const corr = (over: Partial<LaggedCorrelation>): LaggedCorrelation => ({
  a: 'draymond:tid:oncology:score',
  b: 'draymond:tid:aging:score',
  bestLag: 2,
  correlation: 0.8,
  significant: true,
  ...over,
});

describe('buildCrossDomainGraph — merges temporal + structural evidence', () => {
  const series = [
    { id: 'draymond:tid:oncology:score', domain: 'oncology' },
    { id: 'draymond:tid:aging:score', domain: 'aging' },
  ];

  it('creates a temporal link from a correlation, on canonical domains', () => {
    const g = buildCrossDomainGraph({ correlations: [corr({})], series, candidates: [] });
    expect(g.links).toHaveLength(1);
    expect(g.links[0].evidence).toEqual(['temporal']);
    expect(g.links[0].combined).toBe(0.8);
    expect([g.links[0].from, g.links[0].to].sort()).toEqual(['aging', 'health_oncology']);
    expect(g.counts.temporal).toBe(1);
  });

  it('creates a structural link from a synergy candidate with transfer direction', () => {
    const g = buildCrossDomainGraph({ candidates: [candidate({ score: 0.42 })] });
    expect(g.links).toHaveLength(1);
    expect(g.links[0]).toMatchObject({ from: 'health_oncology', to: 'sports', combined: 0.42, evidence: ['structural'] });
  });

  it('merges both channels for the same pair into one link (mean, not sum)', () => {
    const c = candidate({ fromDomain: 'health_oncology', toDomain: 'aging', score: 0.6, id: 'tc_merge' });
    const g = buildCrossDomainGraph({ correlations: [corr({})], series, candidates: [c] });
    expect(g.links).toHaveLength(1);
    expect(g.links[0].evidence).toEqual(['temporal', 'structural']);
    expect(g.links[0].combined).toBe(0.7); // (0.8 + 0.6) / 2
    expect(g.counts.merged).toBe(1);
  });

  it('drops same-domain correlations and is deterministic', () => {
    const same = corr({ b: 'draymond:tid:oncology:two', correlation: 0.9 });
    const s2 = [...series, { id: 'draymond:tid:oncology:two', domain: 'oncology' }];
    const g = buildCrossDomainGraph({ correlations: [same], series: s2, candidates: [] });
    expect(g.links).toHaveLength(0);
    const a = buildCrossDomainGraph({ correlations: [corr({})], series, candidates: [candidate({})] });
    const b = buildCrossDomainGraph({ correlations: [corr({})], series, candidates: [candidate({})] });
    expect(a.manifestHash).toBe(b.manifestHash);
  });

  it('linksForDomain returns both directions', () => {
    const g = buildCrossDomainGraph({ candidates: [candidate({})] });
    expect(linksForDomain(g, 'sports')).toHaveLength(1);
    expect(linksForDomain(g, 'health_oncology')).toHaveLength(1);
  });
});
