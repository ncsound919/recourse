import { describe, it, expect } from 'vitest';
import {
  behaviorOf,
  buildQDArchive,
  cellCoord,
  findRedundant,
} from '../src/lib/qualityDiversity';
import type { QDToolLike } from '../src/lib/qualityDiversity';

function tool(name: string, domain: string, versions: Array<{ passed?: boolean; score?: number; promoted?: boolean }>, health = 'healthy'): QDToolLike {
  return {
    name,
    domain,
    healthStatus: health,
    currentVersion: `${name}@1`,
    versions: versions.map((v, i) => ({
      version: `${name}@${i + 1}`,
      passed_verifier: v.passed ?? true,
      score: v.score ?? 0.9,
      promoted: v.promoted ?? false,
    })),
  };
}

describe('behavior descriptors', () => {
  it('computes pass rate, mean score and health rank from real fields', () => {
    const b = behaviorOf(tool('t', 'math', [
      { passed: true, score: 1.0, promoted: true },
      { passed: false, score: 0.5 },
    ], 'degraded'));
    expect(b.passRate).toBe(0.5);
    expect(b.meanScore).toBe(0.75);
    expect(b.healthRank).toBe(0.5);
  });

  it('clamps out-of-range values so a corrupted score cannot break the archive', () => {
    const b = behaviorOf({ domain: 'x', name: 'n', healthStatus: 'healthy', versions: [{ passed_verifier: true, score: 5 }] });
    expect(b.fitness).toBeLessThanOrEqual(1);
  });
});

describe('MAP-Elites archive', () => {
  it('keeps only the highest-fitness tool per (domain, passRate, meanScore) cell', () => {
    // Two coding tools in the same niche -> only the fitter is kept.
    const a = tool('fast', 'coding', [{ passed: true, score: 1.0, promoted: true }]);
    const b = tool('slower', 'coding', [{ passed: true, score: 0.98, promoted: true }]);
    const snap = buildQDArchive([a, b], 8);
    expect(snap.covered).toBe(1);
    expect(snap.niches[0].toolName).toBe('fast');
  });

  it('fills distinct niches across domains and reports coverage', () => {
    const tools = [
      tool('m1', 'math', [{ passed: true, score: 0.9, promoted: true }]),
      tool('m2', 'math', [{ passed: true, score: 0.3, promoted: true }]),
      tool('c1', 'coding', [{ passed: false, score: 0.7, promoted: true }]),
      tool('c2', 'coding', [{ passed: true, score: 1.0, promoted: true }]),
    ];
    const snap = buildQDArchive(tools, 4);
    expect(snap.coverage).toBeGreaterThan(0);
    expect(snap.coverage).toBeLessThanOrEqual(1);
    expect(snap.byDomain.map((d) => d.domain).sort()).toEqual(['coding', 'math']);
    expect(snap.niches.length).toBeGreaterThanOrEqual(3);
  });

  it('is deterministic for the same input', () => {
    const tools = [tool('x', 'coding', [{ passed: true, score: 0.8, promoted: true }])];
    const s1 = buildQDArchive(tools, 8);
    const s2 = buildQDArchive(tools, 8);
    expect(JSON.stringify(s1.niches)).toBe(JSON.stringify(s2.niches));
  });

  it('cellCoord quantizes into [0, resolution) and is clamped', () => {
    expect(cellCoord(0, 8)).toBe(0);
    expect(cellCoord(1, 8)).toBe(7);
    expect(cellCoord(0.9999, 8)).toBe(7);
    expect(cellCoord(-5, 8)).toBe(0);
    expect(cellCoord(Number.NaN, 8)).toBe(0);
  });
});

describe('redundancy signal', () => {
  it('flags tools displaced by a fitter niche sibling', () => {
    const a = tool('champ', 'coding', [{ passed: true, score: 1.0, promoted: true }]);
    const dup = tool('dup', 'coding', [{ passed: true, score: 0.98, promoted: true }]);
    const redundant = findRedundant([a, dup], 8);
    expect(redundant.map((r) => r.name)).toContain('dup');
  });
});
