import { describe, it, expect } from 'vitest';
import { buildSynergyMap, crossDomainSynergyFor } from '../../src/lib/synergy/synergyMap.js';
import type { TransferCandidate, SynergyMap } from '../../src/lib/synergy/types.js';

function candidate(id: string, from: string, to: string, score: number): TransferCandidate {
  return {
    id, methodId: 'm', problemId: 'p', fromDomain: from, toDomain: to,
    bridges: [], score, support: 1, prediction: 'pass', falsification: '',
    filters: [], engineVersion: '0.1.0',
  };
}

const candidates = [
  candidate('tc_1', 'mathematics', 'logistics', 0.8),
  candidate('tc_2', 'mathematics', 'logistics', 0.4),
  candidate('tc_3', 'sports', 'health_oncology', 0.6),
];

describe('synergy map', () => {
  it('aggregates candidate edges per domain pair deterministically', () => {
    const map = buildSynergyMap(candidates, { generatedAtRun: 'run:1' });
    const edge = map.edges.find((e) => e.from === 'mathematics' && e.to === 'logistics');
    expect(edge?.attempts).toBe(2);
    expect(edge?.score).toBe(0.8);
    expect(edge?.kind).toBe('candidate');
    expect(map.domains).toEqual(['health_oncology', 'logistics', 'mathematics', 'sports']);
    const again = buildSynergyMap(candidates, { generatedAtRun: 'run:1' });
    expect(again.manifestHash).toBe(map.manifestHash);
  });

  it('crossDomainSynergyFor is 0 for a domain with no resolved edges and no candidates', () => {
    const map = buildSynergyMap(candidates, { generatedAtRun: 'run:1' });
    expect(crossDomainSynergyFor(map, 'cybersecurity')).toBe(0);
  });

  it('crossDomainSynergyFor rises with open opportunity', () => {
    const map = buildSynergyMap(candidates, { generatedAtRun: 'run:1' });
    const math = crossDomainSynergyFor(map, 'mathematics');
    const empty = crossDomainSynergyFor(map, 'cybersecurity');
    expect(math).toBeGreaterThan(empty);
    expect(math).toBeLessThanOrEqual(1);
  });

  it('is order-invariant (canonical output)', () => {
    const a = buildSynergyMap(candidates, { generatedAtRun: 'run:1' });
    const b = buildSynergyMap([...candidates].reverse(), { generatedAtRun: 'run:1' });
    expect(b.manifestHash).toBe(a.manifestHash);
    expect(b.edges).toEqual(a.edges);
    expect(b.candidates.map((c) => c.id)).toEqual(a.candidates.map((c) => c.id));
  });

  it('credits a domain that only appears as the target', () => {
    const map = buildSynergyMap(candidates, { generatedAtRun: 'run:1' });
    expect(crossDomainSynergyFor(map, 'health_oncology')).toBe(0.3);
  });

  it('credits resolved passes and returns a real earned term', () => {
    const withResolved: SynergyMap = {
      engineVersion: '0.1.0', generatedAtRun: 'run:1', domains: ['a', 'b'],
      edges: [{ from: 'a', to: 'b', kind: 'resolved', score: 0.9, passes: 3, attempts: 3, backingIds: ['x'] }],
      candidates: [], manifestHash: 'h',
    };
    expect(crossDomainSynergyFor(withResolved, 'a')).toBe(0.5);
    expect(crossDomainSynergyFor(withResolved, 'b')).toBe(0.5);
    expect(crossDomainSynergyFor(withResolved, 'c')).toBe(0);
  });

  it('scales open potential with score and excludes below-floor candidates', () => {
    const high = buildSynergyMap([candidate('tc_high', 'mathematics', 'logistics', 0.9)], { generatedAtRun: 'r' });
    const low = buildSynergyMap([candidate('tc_low', 'mathematics', 'logistics', 0.3)], { generatedAtRun: 'r' });
    const below = buildSynergyMap([candidate('tc_below', 'mathematics', 'logistics', 0.2)], { generatedAtRun: 'r' });
    expect(crossDomainSynergyFor(high, 'mathematics')).toBeGreaterThan(crossDomainSynergyFor(low, 'mathematics'));
    expect(crossDomainSynergyFor(below, 'mathematics')).toBe(0);
  });
});
