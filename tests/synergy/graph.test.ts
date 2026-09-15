import { describe, it, expect } from 'vitest';
import { controlledTokens, buildGraph, edgeWeight, termDocFrequency } from '../../src/lib/synergy/graph.js';

describe('controlled-token graph', () => {
  it('extracts only vocabulary terms, ignoring free text', () => {
    const toks = controlledTokens('Analyze the trend and detect a breakout over the series with a graph');
    expect(toks).toContain('graph');
    expect(toks).not.toContain('breakout');
    expect(toks).not.toContain('trend');
  });

  it('builds tf-normalized method/term edges and document frequencies', () => {
    const g = buildGraph([
      { id: 'method:a', domain: 'mathematics', text: 'graph graph sequence' },
      { id: 'problem:b', domain: 'logistics', text: 'graph prediction' },
    ]);
    expect(edgeWeight(g, 'method:a', 'term:graph')).toBe(1);
    expect(edgeWeight(g, 'method:a', 'term:sequence')).toBe(0.5);
    expect(termDocFrequency(g, 'term:graph')).toBe(2);
    expect(termDocFrequency(g, 'term:prediction')).toBe(1);
    expect(g.docCount).toBe(2);
  });

  it('returns 0 for unknown edges', () => {
    const g = buildGraph([{ id: 'x', domain: 'd', text: 'graph' }]);
    expect(edgeWeight(g, 'x', 'term:nope')).toBe(0);
    expect(edgeWeight(g, 'missing', 'term:graph')).toBe(0);
  });

  it('handles zero-token docs and empty input', () => {
    const g = buildGraph([{ id: 'a', domain: 'd', text: 'nothing controlled here' }]);
    expect(edgeWeight(g, 'a', 'term:graph')).toBe(0);
    expect(termDocFrequency(g, 'term:graph')).toBe(0);
    const empty = buildGraph([]);
    expect(empty.docCount).toBe(0);
    expect(empty.nodes).toEqual([]);
  });

  it('throws on duplicate doc ids instead of corrupting df', () => {
    expect(() =>
      buildGraph([
        { id: 'dup', domain: 'd', text: 'graph' },
        { id: 'dup', domain: 'e', text: 'graph' },
      ]),
    ).toThrow(/duplicate doc id/);
  });

  it('matches underscore/spaced forms via canonicalization', () => {
    const g = buildGraph([{ id: 'x', domain: 'd', text: 'linear algebra and linear_algebra' }]);
    expect(edgeWeight(g, 'x', 'term:linear_algebra')).toBe(1);
  });
});
