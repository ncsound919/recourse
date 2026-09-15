import { describe, it, expect } from 'vitest';
import { discover, findBridges, SYNERGY_ENGINE_VERSION } from '../../src/lib/synergy/closedDiscovery.js';
import type { MethodSignature, ProblemSignature } from '../../src/lib/synergy/types.js';

function method(id: string, domain: string, primitives: string[], relationBasis: 'declared' | 'placeholder' = 'placeholder'): MethodSignature {
  return {
    id, name: id, domain, source: 'tool', primitives, deterministic: true,
    relationBasis,
    relations: primitives.map((p, i) => ({ functor: p, type: 'rel', args: [domain], order: i + 1 })),
  };
}
function problem(id: string, domain: string, requiredPrimitives: string[], acceptanceTest = 'assert true;', relationBasis: 'declared' | 'placeholder' = 'placeholder'): ProblemSignature {
  return {
    id, name: id, domain, requiredPrimitives, acceptanceTest, testHash: 'x', extraction: 'heuristic',
    relationBasis,
    relations: requiredPrimitives.map((p, i) => ({ functor: p, type: 'rel', args: [domain], order: i + 1 })),
  };
}

// A third non-overlapping doc keeps the corpus at 3 docs so the shared `graph`
// bridge is not over-general (df=2 <= 0.9 * 3) while exactly one candidate forms.
const methods = [method('method:a', 'mathematics', ['graph', 'sequence']), method('method:c', 'cybersecurity', ['compliance'])];
const problems = [problem('problem:b', 'logistics', ['graph', 'prediction'])];

describe('closed discovery', () => {
  it('finds the shared controlled-vocabulary bridge', () => {
    const { candidates } = discover(methods, problems);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].bridges.map((b) => b.term)).toContain('term:graph');
    expect(candidates[0].fromDomain).toBe('mathematics');
    expect(candidates[0].toDomain).toBe('logistics');
    expect(candidates[0].score).toBe(1);
    expect(candidates[0].support).toBe(1);
    expect(candidates[0].prediction).toBe('pass');
  });

  it('is deterministic and order-invariant', () => {
    const a = discover(methods, problems);
    const b = discover([...methods].reverse(), [...problems].reverse());
    expect(a.manifest).toBe(b.manifest);
    // Golden manifest: pins version + vocabulary + options + canonical ordering
    // (and, since the alignment segment was added to the hash input, the
    // candidate's alignment/farTransfer).
    expect(a.manifest).toBe('5fa38be07547022813e1dc2ea10bdb37a658e3d5d0a37f286cc748fc719142c2');
  });

  it('excludes same-domain pairs', () => {
    const { candidates } = discover(methods, [problem('problem:c', 'mathematics', ['graph'])]);
    expect(candidates).toHaveLength(0);
  });

  it('prediction flips with passThreshold', () => {
    const pass = discover(methods, problems, { passThreshold: 0.1 });
    const fail = discover(methods, problems, { passThreshold: 1.1 });
    expect(pass.candidates[0].prediction).toBe('pass');
    expect(fail.candidates[0].prediction).toBe('fail');
  });

  it('emits a falsification statement per candidate', () => {
    const { candidates } = discover(methods, problems);
    expect(candidates[0].falsification).toMatch(/sandbox run/i);
    expect(candidates[0].engineVersion).toBe(SYNERGY_ENGINE_VERSION);
  });

  it('findBridges returns [] for unindexed ids', () => {
    const { graph } = discover(methods, problems);
    expect(findBridges(graph, 'method:a', 'problem:b').length).toBeGreaterThan(0);
    expect(findBridges(graph, 'missing', 'problem:b')).toEqual([]);
  });

  it('attaches an alignment and farTransfer when relations are declared', () => {
    const declaredMethods = methods.map((m) => ({ ...m, relationBasis: 'declared' as const }));
    const declaredProblems = problems.map((p) => ({ ...p, relationBasis: 'declared' as const }));
    const { candidates } = discover(declaredMethods, declaredProblems);
    expect(candidates[0].alignment).toBeDefined();
    expect(typeof candidates[0].farTransfer).toBe('number');
  });

  it('fails closed: no alignment when relations are placeholders', () => {
    const { candidates } = discover(methods, problems);
    expect(candidates[0].alignment).toBeUndefined();
    expect(candidates[0].farTransfer).toBeUndefined();
  });

  it('can disable alignment via opts', () => {
    const declaredMethods = methods.map((m) => ({ ...m, relationBasis: 'declared' as const }));
    const declaredProblems = problems.map((p) => ({ ...p, relationBasis: 'declared' as const }));
    const { candidates } = discover(declaredMethods, declaredProblems, { align: false });
    expect(candidates[0].alignment).toBeUndefined();
  });
});
