import { describe, it, expect } from 'vitest';
import { solveHornClauses, calculateCosineDistance, HornClause } from '../src/lib/neuroSymbolicEngine';

describe('solveHornClauses (forward-chaining saturation)', () => {
  it('derives the transitive closure of a Horn program from real facts', () => {
    const clauses: HornClause[] = [
      { premises: ['healthy', 'verified'], head: 'promotable' },
      { premises: ['promotable'], head: 'registry_gene' },
      { premises: ['registry_gene'], head: 'self_hosted' },
    ];
    const r = solveHornClauses(clauses, new Set(['healthy', 'verified']));
    expect(r.inferredFacts.has('promotable')).toBe(true);
    expect(r.inferredFacts.has('registry_gene')).toBe(true);
    expect(r.inferredFacts.has('self_hosted')).toBe(true);
    expect(r.isSatisfiable).toBe(true);
    // Head already satisfied in the first pass mutates `inferred`, so the whole
    // chain fires in pass 1; the loop needs one extra no-change pass to exit.
    expect(r.saturationCycles).toBe(2);
    expect(r.derivationSteps.map((s) => s.derived)).toEqual(['promotable', 'registry_gene', 'self_hosted']);
    expect(r.derivationSteps.every((s) => s.step === 1)).toBe(true);
    for (const s of r.derivationSteps) {
      expect(s.rule.head).toBe(s.derived);
    }
  });

  it('accepts a plain string[] of initial facts (Set input also supported)', () => {
    const r = solveHornClauses([{ premises: ['a'], head: 'b' }], ['a']);
    expect(r.inferredFacts.has('b')).toBe(true);
    const r2 = solveHornClauses([{ premises: ['a'], head: 'b' }], new Set(['a']));
    expect(r2.inferredFacts.has('b')).toBe(true);
  });

  it('does not re-derive facts that are already inferred', () => {
    const clauses: HornClause[] = [{ premises: [], head: 'root' }, { premises: ['root'], head: 'child' }];
    const r = solveHornClauses(clauses, new Set(['root']));
    // `root` is a fact already; its rule must not append a derivation step.
    expect(r.derivationSteps.map((s) => s.derived)).toEqual(['child']);
  });

  it('leaves premises unsatisfied as non-derivations (no fabrication)', () => {
    const r = solveHornClauses([{ premises: ['missing'], head: 'ghost' }], new Set(['present']));
    expect(r.inferredFacts.has('ghost')).toBe(false);
    expect(r.derivationSteps).toHaveLength(0);
  });

  it('reports satisfiable=false when the false atom is present or derived', () => {
    const fromFact = solveHornClauses([], new Set(['false']));
    expect(fromFact.isSatisfiable).toBe(false);

    const derived = solveHornClauses([{ premises: ['contradiction'], head: 'x' }], new Set(['contradiction']));
    expect(derived.isSatisfiable).toBe(false);

    const contradictionDerived = solveHornClauses([{ premises: ['a', 'b'], head: 'contradiction' }], new Set(['a', 'b']));
    expect(contradictionDerived.isSatisfiable).toBe(false);
  });

  it('handles an empty clause set by returning the facts unchanged', () => {
    const r = solveHornClauses([], new Set(['only']));
    expect([...r.inferredFacts]).toEqual(['only']);
    expect(r.derivationSteps).toHaveLength(0);
    expect(r.saturationCycles).toBe(1);
  });

  it('bounds runaway derivation at MAX_CYCLES = 1000 instead of looping forever', () => {
    // A chain p0 -> p1 -> ... -> p1001 where each pass can derive at most one
    // new fact (clauses stored in reverse dependency order). 1001 derivations
    // are needed but only 1000 passes are allowed.
    const N = 1001;
    const clauses: HornClause[] = [];
    for (let k = N - 1; k >= 0; k--) clauses.push({ premises: [`p${k}`], head: `p${k + 1}` });
    const r = solveHornClauses(clauses, new Set(['p0']));
    expect(r.saturationCycles).toBe(1000);
    expect(r.derivationSteps).toHaveLength(1000);
    expect(r.inferredFacts.has('p1000')).toBe(true);
    expect(r.inferredFacts.has('p1001')).toBe(false);
    expect(r.isSatisfiable).toBe(true);
  });
});

describe('calculateCosineDistance', () => {
  it('returns an invalid result for mismatched or empty vectors', () => {
    expect(calculateCosineDistance([1, 2, 3], [1, 2])).toEqual({
      cosineSimilarity: 0,
      cosineDistance: 1,
      normA: 0,
      normB: 0,
      valid: false,
    });
    expect(calculateCosineDistance([], [])).toEqual({
      cosineSimilarity: 0,
      cosineDistance: 1,
      normA: 0,
      normB: 0,
      valid: false,
    });
  });

  it('computes exact similarity/distance for identical vectors', () => {
    const r = calculateCosineDistance([1, 2, 3], [1, 2, 3]);
    expect(r.valid).toBe(true);
    expect(r.cosineSimilarity).toBeCloseTo(1, 12);
    expect(r.cosineDistance).toBeCloseTo(0, 12);
    expect(r.normA).toBeCloseTo(Math.sqrt(14), 12);
    expect(r.normB).toBeCloseTo(Math.sqrt(14), 12);
  });

  it('returns 0 similarity (distance 1) for orthogonal vectors', () => {
    const r = calculateCosineDistance([1, 0], [0, 1]);
    expect(r.valid).toBe(true);
    expect(r.cosineSimilarity).toBeCloseTo(0, 12);
    expect(r.cosineDistance).toBeCloseTo(1, 12);
  });

  it('returns -1 similarity for anti-parallel vectors', () => {
    const r = calculateCosineDistance([-1, -2], [1, 2]);
    expect(r.valid).toBe(true);
    expect(r.cosineSimilarity).toBeCloseTo(-1, 12);
    expect(r.cosineDistance).toBeCloseTo(2, 12);
  });

  it('scales by magnitude only, not length (cosine is angle-only)', () => {
    const r = calculateCosineDistance([2, 4, 6], [1, 2, 3]);
    expect(r.valid).toBe(true);
    expect(r.cosineSimilarity).toBeCloseTo(1, 12);
  });

  it('invalidates zero-norm vectors without dividing by zero', () => {
    expect(calculateCosineDistance([0, 0], [1, 1]).valid).toBe(false);
    expect(calculateCosineDistance([0, 0], [1, 1]).normA).toBe(0);
    expect(calculateCosineDistance([1, 1], [0, 0]).valid).toBe(false);
    expect(calculateCosineDistance([1, 1], [0, 0]).normB).toBe(0);
  });

  it('agrees with an independent dot-product reference computation', () => {
    const a = [0.5, -1.5, 2.25, 0.125];
    const b = [-2.0, 0.75, 0.5, 3.0];
    const dot = a.reduce((s, v, i) => s + v * b[i], 0);
    const normA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    const normB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
    const sim = dot / (normA * normB);
    const r = calculateCosineDistance(a, b);
    expect(r.valid).toBe(true);
    expect(r.cosineSimilarity).toBeCloseTo(sim, 12);
    expect(r.cosineDistance).toBeCloseTo(1 - sim, 12);
  });
});
