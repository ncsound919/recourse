import { describe, it, expect } from 'vitest';

import {
  LIST_PRIMITIVES,
  differentialCheck,
  evaluateSygusTerm,
} from '../src/lib/v5/sygus';

describe('differentialCheck', () => {
  it('agrees when the candidate matches the reference on every case', () => {
    const verdict = differentialCheck('(sortf x)', [
      { input: [3, 1, 2], expected: [1, 2, 3] },
      { input: [], expected: [] },
      { input: [1], expected: [1] },
    ]);
    expect(verdict).toEqual({ agree: true, checked: 3, unevaluated: 0 });
  });

  it('returns the counterexample instead of a bare boolean', () => {
    // `(rev x)` is a real candidate; checked against sort's expectations it
    // must fail, and the failure must name the input.
    const verdict = differentialCheck('(rev x)', [
      { input: [1, 2, 3], expected: [1, 2, 3] },
      { input: [3, 1, 2], expected: [1, 2, 3] },
    ]);
    expect(verdict.agree).toBe(false);
    // Fail-fast: the first case already disagrees, so only one was checked.
    expect(verdict.checked).toBe(1);
    expect(verdict.disagreement).toEqual({ input: [1, 2, 3], got: [3, 2, 1], expected: [1, 2, 3] });
  });

  it('handles nested compositions', () => {
    const verdict = differentialCheck('(sortf (rev x))', [
      { input: [3, 1, 2], expected: [1, 2, 3] },
    ]);
    expect(verdict.agree).toBe(true);
  });

  it('never reports agreement it did not earn', () => {
    // No cases: there is nothing to agree with.
    expect(differentialCheck('(sortf x)', []).agree).toBe(false);
    // Unevaluable term: skipped and counted, not silently agreed with.
    const verdict = differentialCheck('(frobnicate x)', [
      { input: [1], expected: [1] },
    ]);
    expect(verdict).toEqual({ agree: false, checked: 0, unevaluated: 1 });
  });
});

describe('LIST_PRIMITIVES tsImplementation', () => {
  function impl(name: string): (...args: unknown[]) => unknown {
    const p = LIST_PRIMITIVES.find((q) => q.name === name)!;
    expect(p).toBeDefined();
    return p.tsImplementation;
  }

  it('implements every primitive for real, matching the SMT definitions', () => {
    // app: (ite ((_ is nil) x) y (cons (hd x) (app (tl x) y))) — append.
    expect(impl('app')([1, 2], [3])).toEqual([1, 2, 3]);
    expect(impl('app')([], [3])).toEqual([3]);
    // ins: insert maintaining sorted order.
    expect(impl('ins')(2, [1, 3])).toEqual([1, 2, 3]);
    expect(impl('ins')(0, [])).toEqual([0]);
    expect(impl('ins')(5, [1, 3])).toEqual([1, 3, 5]);
    // filtf: remove every occurrence.
    expect(impl('filtf')(2, [1, 2, 2, 3])).toEqual([1, 3]);
    expect(impl('filtf')(9, [1])).toEqual([1]);
    // The unary trio, unchanged.
    expect(impl('rev')([1, 2])).toEqual([2, 1]);
    expect(impl('sortf')([2, 1])).toEqual([1, 2]);
    expect(impl('dedupef')([1, 1, 2])).toEqual([1, 2]);
  });

  it('the differential oracle can use the table as its reference', () => {
    // sortf's TS implementation IS the reference differentialCheck compares
    // against in production use; prove they are the same function.
    const sortf = impl('sortf');
    for (const input of [[3, 1, 2], [], [5]]) {
      const expected = sortf(input) as number[];
      expect(differentialCheck('(sortf x)', [{ input, expected }]).agree).toBe(true);
      expect(evaluateSygusTerm('(sortf x)', input)).toEqual(expected);
    }
  });
});
