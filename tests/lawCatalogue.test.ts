/**
 * A6 — the hand-authored law catalogue.
 *
 * Two properties must hold for every law:
 *   1. A CORRECT implementation passes it. A law that fails correct code is a
 *      false alarm, and false alarms train operators to ignore the channel.
 *   2. A plausibly-WRONG implementation fails it. A law that everything passes
 *      is decoration.
 */
import { describe, it, expect } from 'vitest';
import {
  LAW_CATALOGUE,
  lawsFor,
  runLaws,
  sameMultiset,
  lawCoverage,
  lawSuiteSource,
  EXPLICIT_BOUNDARIES,
} from '../src/lib/lawCatalogue.js';

const sorted = (a: number[]) => [...a].sort((x, y) => x - y);

// Takes a SINGLE array, matching the signature the laws call with. The earlier
// variadic version made the mutation law test a different function shape.
const GOOD: Record<string, (...a: any[]) => any> = {
  quickSort: (xs: number[]) => sorted(xs),
  mergeSorted: (a: number[], b: number[]) => sorted([...a, ...b]),
  gcdFast: (a: number, b: number) => { let x = Math.abs(a), y = Math.abs(b); while (y) { const t = x % y; x = y; y = t; } return x; },
  lcmFast: (a: number, b: number) => (a === 0 || b === 0 ? 0 : Math.abs(a * b) / (() => { let x = Math.abs(a), y = Math.abs(b); while (y) { const t = x % y; x = y; y = t; } return x; })()),
  powerMod: (b: number, e: number, m: number) => { let r = 1 % m, x = ((b % m) + m) % m, n = e; while (n > 0) { if (n & 1) r = (r * x) % m; x = (x * x) % m; n >>= 1; } return r; },
  dedupeStable: (xs: unknown[]) => xs.filter((v, i) => xs.indexOf(v) === i),
  chunkArray: (xs: unknown[], n: number) => { const o: unknown[][] = []; for (let i = 0; i < xs.length; i += n) o.push(xs.slice(i, i + n)); return o; },
  isPalindrome: (s: string) => s === [...s].reverse().join(''),
  isBalanced: (s: string) => { const w: Record<string, string> = { '(': ')', '[': ']', '{': '}' }; const st: string[] = []; for (const c of s) { if (w[c]) st.push(w[c]); else if (c === ')' || c === ']' || c === '}') if (st.pop() !== c) return false; } return st.length === 0; },
  clampRange: (lo: number, hi: number, v: number) => Math.min(Math.max(v, lo), hi),
  countVowels: (s: string) => [...s].filter((c) => 'aeiouAEIOU'.includes(c)).length,
  runLengthEncode: (s: string) => { const o: Array<[string, number]> = []; for (const c of s) { if (o.length && o[o.length - 1][0] === c) o[o.length - 1][1]++; else o.push([c, 1]); } return o; },
};

describe('every law passes a correct implementation', () => {
  for (const [tool, fn] of Object.entries(GOOD)) {
    it(`${tool}: no false alarms`, () => {
      const { checked, failures } = runLaws(tool, fn);
      // A tool absent from the catalogue legitimately has nothing to check.
      if (checked === 0) return;
      expect(failures, failures.map((x) => `${x.law}: ${x.why}`).join('; ')).toEqual([]);
    });
  }
});

describe('laws catch wrong implementations', () => {
  it('a sort that drops duplicates fails the multiset law', () => {
    const dropsDupes = (xs: number[]) => [...new Set(sorted(xs))];
    const { failures } = runLaws('quickSort', dropsDupes);
    expect(failures.some((f) => f.law === 'preserves-multiset')).toBe(true);
  });

  it('an in-place mutating sort fails the no-mutation law', () => {
    const mutates = (xs: number[]) => {
      xs.sort((a, b) => a - b);
      return xs;
    };
    const { failures } = runLaws('quickSort', mutates);
    expect(failures.some((f) => f.law === 'does-not-mutate-input')).toBe(true);
  });

  it('a non-associative merge fails', () => {
    const bad = (a: number[], b: number[]) => sorted([...a, ...b]).reverse();
    const { failures } = runLaws('mergeSorted', bad);
    expect(failures.length).toBeGreaterThan(0);
  });

  it('a depth-counter isBalanced fails the mismatched-closer case', () => {
    // THE bug A4's self-consistency guard caught. It must also fail a law.
    const depthCounter = (s: string) => {
      let d = 0;
      for (const c of s) { if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) { d--; if (d < 0) return false; } }
      return d === 0;
    };
    const { failures } = runLaws('isBalanced', depthCounter);
    expect(failures.some((f) => f.law === 'unbalanced-prefix-stays-unbalanced')).toBe(true);
  });

  it('an always-false predicate is caught by every law that uses it', () => {
    for (const tool of ['isPalindrome', 'isBalanced']) {
      const { failures } = runLaws(tool, () => false);
      expect(failures.length, tool).toBeGreaterThan(0);
    }
  });

  it('a clamp that ignores hi fails the in-range law', () => {
    const bad = (lo: number, _hi: number, v: number) => Math.max(v, lo);
    const { failures } = runLaws('clampRange', bad);
    expect(failures.length).toBeGreaterThan(0);
  });
});

describe('law quality', () => {
  it('every law states its relation in words a reviewer can check', () => {
    for (const [tool, laws] of Object.entries(LAW_CATALOGUE)) {
      for (const law of laws) {
        expect(law.statement.length, `${tool}.${law.name}`).toBeGreaterThan(8);
        expect(law.check, `${tool}.${law.name}`).toBeTypeOf('function');
        expect(['metamorphic', 'property']).toContain(law.kind);
      }
    }
  });

  it('sorting laws use MULTISET equality, never strict equality', () => {
    // Strict equality on tie-permitting functions produces false alarms, which
    // train operators to ignore the channel.
    for (const law of LAW_CATALOGUE.quickSort ?? []) {
      expect(law.statement.toLowerCase()).not.toContain('exactly equal');
    }
    expect(LAW_CATALOGUE.quickSort.some((l) => l.name === 'preserves-multiset')).toBe(true);
  });

  it('a tool with no laws reports none rather than inventing relations', () => {
    expect(lawsFor('redactSecrets')).toEqual([]);
    expect(lawSuiteSource('redactSecrets')).toBeNull();
  });

  it('coverage is reported honestly', () => {
    const c = lawCoverage(Object.keys(LAW_CATALOGUE));
    expect(c.covered).toBe(c.total);
    expect(lawCoverage(['redactSecrets']).covered).toBe(0);
  });

  it('boundaries include the values generated input rarely reaches', () => {
    expect(EXPLICIT_BOUNDARIES.number).toContain(0);
    expect(EXPLICIT_BOUNDARIES.number).toContain(Number.MAX_SAFE_INTEGER);
    // `toContain` uses ===, which can never match NaN, so membership is checked
// with a predicate instead.
expect(EXPLICIT_BOUNDARIES.number.some((v) => Number.isNaN(v))).toBe(true);
    expect(EXPLICIT_BOUNDARIES.string).toContain('');
    expect(EXPLICIT_BOUNDARIES.array).toEqual(expect.arrayContaining([[]]));
  });

  it('a law that throws is reported as a failure, never crashing the gate', () => {
    const thrower = () => {
      throw new Error('law exploded');
    };
    const { failures } = runLaws('clampRange', thrower);
    expect(failures.length).toBeGreaterThan(0);
  });

  it('a failing law reports a reason, so it is actionable', () => {
    const { failures } = runLaws('clampRange', (lo: number, _hi: number, v: number) => Math.max(v, lo));
    expect(failures.length).toBeGreaterThan(0);
    for (const f of failures) expect(f.why.length).toBeGreaterThan(0);
  });
});

describe('multiset equality helper', () => {
  it('handles duplicates and order', () => {
    expect(sameMultiset([1, 1, 2], [2, 1, 1])).toBe(true);
    expect(sameMultiset([1, 1, 2], [1, 2, 2])).toBe(false);
    expect(sameMultiset([1], [1, 2])).toBe(false);
  });
});

describe('sandbox emission', () => {
  it('emits a runnable suite naming the law on failure', () => {
    const src = lawSuiteSource('isBalanced');
    expect(src).toBeTruthy();
    expect(src).toContain('LAW FAILED');
    // The statement travels with the failure so the message is actionable.
    expect(src).toMatch(/unbalanced|mismatched|balanced/i);
  });

  it('emits nothing for an uncovered tool', () => {
    expect(lawSuiteSource('tokenizeLogic')).toBeNull();
  });
});