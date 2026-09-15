import { describe, it, expect } from 'vitest';
import { filterBridge, allPassed, type FilterContext } from '../../src/lib/synergy/filters.js';
import { buildGraph } from '../../src/lib/synergy/graph.js';
import type { BridgeEvidence } from '../../src/lib/synergy/types.js';

const graph = buildGraph([
  { id: 'method:a', domain: 'mathematics', text: 'graph sequence' },
  { id: 'problem:b', domain: 'logistics', text: 'graph prediction' },
]);

const baseCtx: FilterContext = {
  graph,
  stoplist: [],
  maxDocFrequency: 0.9,
  minDocsPerLeg: 1,
  fromDomain: 'mathematics',
  toDomain: 'logistics',
  knownPairs: [],
};

const bridge: BridgeEvidence = { term: 'term:sequence', weightAB: 1, weightBC: 1, score: 1, docs: 1 };
const general: BridgeEvidence = { term: 'term:graph', weightAB: 1, weightBC: 1, score: 1, docs: 2 };

describe('bridge filters', () => {
  it('passes a known primitive with sufficient evidence', () => {
    const d = filterBridge(bridge, baseCtx);
    expect(allPassed(d)).toBe(true);
  });

  it('rejects unknown terms at the semantic_type gate', () => {
    const d = filterBridge({ ...bridge, term: 'term:breakout' }, baseCtx);
    expect(allPassed(d)).toBe(false);
    expect(d.find((x) => x.gate === 'semantic_type')?.passed).toBe(false);
  });

  it('rejects same-sector pairs', () => {
    const d = filterBridge(bridge, { ...baseCtx, toDomain: 'mathematics' });
    expect(d.find((x) => x.gate === 'cross_domain')?.passed).toBe(false);
  });

  it('rejects over-general terms', () => {
    const over = filterBridge(general, baseCtx);
    expect(over.find((x) => x.gate === 'generalness')?.passed).toBe(false);
  });

  it('rejects stoplisted terms with a stoplist reason', () => {
    const d = filterBridge(bridge, { ...baseCtx, stoplist: ['sequence'] });
    const g = d.find((x) => x.gate === 'generalness');
    expect(g?.passed).toBe(false);
    expect(g?.reason).toContain('stoplisted');
  });

  it('rejects insufficient evidence and known pairs', () => {
    const thin = filterBridge({ ...bridge, docs: 0 }, baseCtx);
    expect(thin.find((x) => x.gate === 'evidence')?.passed).toBe(false);
    const known = filterBridge(bridge, { ...baseCtx, knownPairs: ['mathematics->logistics'] });
    expect(known.find((x) => x.gate === 'novelty')?.passed).toBe(false);
  });
});
