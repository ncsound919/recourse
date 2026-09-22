import { describe, it, expect } from 'vitest';
import { benchmarkGapSpecs } from '../src/lib/capabilityForge';
import { GENERATED_PROBLEMS } from '../src/benchmark/generatedProblems';

describe('benchmarkGapSpecs — the forge targets that make the generated tier move', () => {
  it('returns [] with no run (nothing to build)', () => {
    expect(benchmarkGapSpecs(null)).toEqual([]);
    expect(benchmarkGapSpecs(undefined)).toEqual([]);
  });

  it('maps every unsolved generated problem to a forge spec with its hidden suite', () => {
    const specs = benchmarkGapSpecs({ solvedIds: [] });
    expect(specs).toHaveLength(GENERATED_PROBLEMS.length);
    const byId = new Map(GENERATED_PROBLEMS.map((p) => [p.id, p]));
    for (const s of specs) {
      const problem = byId.get(s.id.replace(/^benchgap_/, ''));
      expect(problem).toBeTruthy();
      expect(s.name).toBe(problem!.functionName); // the exported name the forge must define
      expect(s.refSuite).toBe(problem!.hiddenSuite); // the real judge, not the model's own tests
      expect(s.refSuite).toContain('assert');
      expect(s.id.startsWith('benchgap_')).toBe(true);
    }
  });

  it('drops problems already solved (no rebuilding what works)', () => {
    const solved = GENERATED_PROBLEMS.slice(0, 5).map((p) => p.id);
    const specs = benchmarkGapSpecs({ solvedIds: solved });
    expect(specs).toHaveLength(GENERATED_PROBLEMS.length - 5);
    for (const id of solved) expect(specs.some((s) => s.id === `benchgap_${id}`)).toBe(false);
  });
});
