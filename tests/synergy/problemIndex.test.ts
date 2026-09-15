import { describe, it, expect } from 'vitest';
import { extractProblem, extractProblems, detectPrimitives } from '../../src/lib/synergy/problemIndex.js';
import type { RecourseProblem } from '../../src/lib/problemArchive.js';

const problem: RecourseProblem = {
  id: 'repro:trend-analyzer',
  domain: 'mathematics',
  title: 'Reproduce: Time-Series Trend & Breakout Analyzer',
  statement: 'Implement a capability that produces a prediction and reports statistics over the series.',
  acceptanceTest: 'const a = TrendAnalyzer.analyzeTrend([{value:1},{value:2}]); assert a.slope > 0;',
};

describe('problem index', () => {
  it('extracts a stable id, test hash, and heuristic primitives', () => {
    const p = extractProblem(problem);
    expect(p.id).toBe('problem:repro_trend_analyzer');
    expect(p.testHash).toHaveLength(64);
    expect(p.extraction).toBe('heuristic');
    expect(p.requiredPrimitives).toEqual(['statistics', 'prediction']);
  });

  it('detects controlled primitives with word boundaries', () => {
    expect(detectPrimitives('signals and risk')).toEqual([]);
    expect(detectPrimitives('lossless compression')).toEqual([]);
    expect(detectPrimitives('research')).toEqual([]);
    expect(detectPrimitives('linear algebra')).toEqual(['linear_algebra']);
    expect(detectPrimitives('linear_algebra')).toEqual(['linear_algebra']);
  });

  it('rejects a problem with no id', () => {
    expect(() => extractProblem({ ...problem, id: '' })).toThrow(/id is required/);
  });

  it('produces no primitives when the text mentions none', () => {
    const p = extractProblem({ ...problem, title: 'Alpha', statement: 'Beta', acceptanceTest: 'assert true;' });
    expect(p.requiredPrimitives).toEqual([]);
  });

  it('extractProblems sorts by id', () => {
    const ps = extractProblems([problem, { ...problem, id: 'aaa' }]);
    expect(ps.map((p) => p.domain)).toEqual(['mathematics', 'mathematics']);
    expect(ps[0].id < ps[1].id).toBe(true);
  });
});
