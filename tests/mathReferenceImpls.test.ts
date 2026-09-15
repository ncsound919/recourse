import { describe, expect, it } from 'vitest';
import {
  zeta,
  MATH_REFERENCE_IMPLS,
  installMathReferenceGlobals,
  mathReferenceSource,
} from '../src/lib/mathReferenceImpls';
import type { HardMathProblem } from '../src/lib/hardMathProblems';

function problem(toolName?: string): HardMathProblem {
  return {
    id: 'hm.test.fixture',
    tier: 'solvable',
    title: 'fixture',
    statement: 'fixture',
    toolName,
    acceptanceTest: '',
    citation: 'fixture',
    successCriterion: 'fixture',
  } as HardMathProblem;
}

function isProthNumber(p: number): boolean {
  let q = p - 1;
  let m = 0;
  while (q % 2 === 0) {
    q /= 2;
    m += 1;
  }
  return m >= 1 && q % 2 === 1 && q < Math.pow(2, m);
}

describe('zeta (stdlib anchor)', () => {
  it('matches known zeta values on the real line', () => {
    expect(zeta(2)).toBeCloseTo(Math.PI ** 2 / 6, 12);
    expect(zeta(-1)).toBeCloseTo(-1 / 12, 12);
    expect(zeta(0.5)).toBeCloseTo(-1.4603545088095868, 9);
  });
});

describe('MATH_REFERENCE_IMPLS registry', () => {
  it('exposes one real implementation per registered tool', () => {
    const expected = [
      'collatzTotalStopping',
      'maxPrimeGap',
      'zetaZeroCount',
      'factorialDigitChain',
      'prothPrimality',
      'goldbachCheck',
      'collatzVerifiedRange',
      'riemannSearch',
      'bealSearch',
    ];
    for (const key of expected) {
      expect(MATH_REFERENCE_IMPLS[key], key).toBeDefined();
      expect(typeof MATH_REFERENCE_IMPLS[key].lib).toBe('string');
      expect(typeof MATH_REFERENCE_IMPLS[key].fn).toBe('function');
    }
    expect(Object.keys(MATH_REFERENCE_IMPLS)).toHaveLength(expected.length);
  });
});

describe('collatzTotalStopping', () => {
  it('returns hand-computable total stopping times for scalar inputs', () => {
    expect(MATH_REFERENCE_IMPLS.collatzTotalStopping.fn(1)).toBe(0);
    expect(MATH_REFERENCE_IMPLS.collatzTotalStopping.fn(2)).toBe(1);
    expect(MATH_REFERENCE_IMPLS.collatzTotalStopping.fn(3)).toBe(7);
    expect(MATH_REFERENCE_IMPLS.collatzTotalStopping.fn(4)).toBe(2);
    expect(MATH_REFERENCE_IMPLS.collatzTotalStopping.fn(6)).toBe(8);
    expect(MATH_REFERENCE_IMPLS.collatzTotalStopping.fn(9)).toBe(19);
    expect(MATH_REFERENCE_IMPLS.collatzTotalStopping.fn(27)).toBe(111);
  });

  it('returns the range statistic for the search-bound mode at N=1000', () => {
    const r = MATH_REFERENCE_IMPLS.collatzTotalStopping.fn(1000) as {
      maxSteps: number;
      argmax: number;
    };
    expect(r.maxSteps).toBe(178);
    expect(r.argmax).toBe(871);
  });

  it('rejects non-positive-integer samples', () => {
    expect(() => MATH_REFERENCE_IMPLS.collatzTotalStopping.fn(0)).toThrow(/positive integer/);
    expect(() => MATH_REFERENCE_IMPLS.collatzTotalStopping.fn(1.5)).toThrow(/positive integer/);
  });
});

describe('maxPrimeGap', () => {
  it('finds the maximal gap below N with its bounding primes', () => {
    expect(MATH_REFERENCE_IMPLS.maxPrimeGap.fn(30)).toEqual({ gap: 6, primes: [23, 29] });
    expect(MATH_REFERENCE_IMPLS.maxPrimeGap.fn(100)).toEqual({ gap: 8, primes: [89, 97] });
    expect(MATH_REFERENCE_IMPLS.maxPrimeGap.fn(1000)).toEqual({ gap: 20, primes: [887, 907] });
  });

  it('drops N itself when N is prime so primes stay strictly below N', () => {
    expect(MATH_REFERENCE_IMPLS.maxPrimeGap.fn(29)).toEqual({ gap: 4, primes: [7, 11] });
  });
});

describe('zetaZeroCount', () => {
  it('counts known critical-line zeros below T', () => {
    expect(MATH_REFERENCE_IMPLS.zetaZeroCount.fn(100)).toEqual({
      N: 29,
      lastImPart: expect.any(Number),
    });
    const r100 = MATH_REFERENCE_IMPLS.zetaZeroCount.fn(100) as {
      N: number;
      lastImPart: number;
    };
    expect(r100.lastImPart).toBeGreaterThan(98.7);
    expect(r100.lastImPart).toBeLessThan(99);
  });

  it('matches the documented N(1000)=649 count', () => {
    const r = MATH_REFERENCE_IMPLS.zetaZeroCount.fn(1000) as { N: number; lastImPart: number };
    expect(r.N).toBe(649);
    expect(r.lastImPart).toBeGreaterThan(0);
    expect(r.lastImPart).toBeLessThan(1000);
  }, 180000);

  it('returns zero count below the first zero or for non-positive T', () => {
    expect(MATH_REFERENCE_IMPLS.zetaZeroCount.fn(10)).toEqual({ N: 0, lastImPart: 0 });
    expect(MATH_REFERENCE_IMPLS.zetaZeroCount.fn(-5)).toEqual({ N: 0, lastImPart: 0 });
  });
});

describe('factorialDigitChain', () => {
  it('finds the 169 cycle and its non-fixed-point classification', () => {
    expect(MATH_REFERENCE_IMPLS.factorialDigitChain.fn(169)).toEqual({
      cycle: [169, 363601, 1454],
      fixedPoint: null,
    });
  });

  it('finds the 871 loop', () => {
    expect(MATH_REFERENCE_IMPLS.factorialDigitChain.fn(871)).toEqual({
      cycle: [871, 45361],
      fixedPoint: null,
    });
  });

  it('classifies factorions as single-element fixed-point cycles', () => {
    expect(MATH_REFERENCE_IMPLS.factorialDigitChain.fn(1)).toEqual({ cycle: [1], fixedPoint: 1 });
    expect(MATH_REFERENCE_IMPLS.factorialDigitChain.fn(145)).toEqual({ cycle: [145], fixedPoint: 145 });
    expect(MATH_REFERENCE_IMPLS.factorialDigitChain.fn(40585)).toEqual({ cycle: [40585], fixedPoint: 40585 });
  });

  it('handles n=0 whose digit-factorial chain reaches 1', () => {
    expect(MATH_REFERENCE_IMPLS.factorialDigitChain.fn(0)).toEqual({ cycle: [1], fixedPoint: 1 });
  });
});

describe('prothPrimality', () => {
  it('returns the smallest Proth prime above 10^12 for count=1', () => {
    expect(MATH_REFERENCE_IMPLS.prothPrimality.fn(1)).toEqual([1000001765377]);
  }, 120000);

  it('returns strictly increasing genuine Proth primes for count=3', () => {
    const primes = MATH_REFERENCE_IMPLS.prothPrimality.fn(3) as number[];
    expect(primes).toHaveLength(3);
    expect(primes[0]).toBe(1000001765377);
    expect(primes[1]).toBeGreaterThan(primes[0]);
    expect(primes[2]).toBeGreaterThan(primes[1]);
    for (const p of primes) {
      expect(Number.isInteger(p)).toBe(true);
      expect(p).toBeGreaterThan(1e12);
      expect(p % 2).toBe(1);
      expect(isProthNumber(p)).toBe(true);
    }
  }, 120000);
});

describe('goldbachCheck', () => {
  it('verifies every even in [4, 30] with a hand-counted pair total', () => {
    expect(MATH_REFERENCE_IMPLS.goldbachCheck.fn(30)).toEqual({
      verified: true,
      minEven: 4,
      maxEven: 30,
      totalPairs: 28,
    });
  });

  it('verifies the range up to 100 with positive pair counts', () => {
    const r = MATH_REFERENCE_IMPLS.goldbachCheck.fn(100) as {
      verified: boolean;
      minEven: number;
      maxEven: number;
      totalPairs: number;
    };
    expect(r.verified).toBe(true);
    expect(r.minEven).toBe(4);
    expect(r.maxEven).toBe(100);
    expect(r.totalPairs).toBeGreaterThan(0);
  });

  it('counts the single representation of 4', () => {
    expect(MATH_REFERENCE_IMPLS.goldbachCheck.fn(4)).toEqual({
      verified: true,
      minEven: 4,
      maxEven: 4,
      totalPairs: 1,
    });
  });
});

describe('collatzVerifiedRange', () => {
  it('reports the maximal total stopping time across the range', () => {
    expect(MATH_REFERENCE_IMPLS.collatzVerifiedRange.fn(10)).toEqual({
      verified: true,
      minN: 1,
      maxN: 10,
      maxTotalSteps: 19,
    });
    expect(MATH_REFERENCE_IMPLS.collatzVerifiedRange.fn(1000)).toEqual({
      verified: true,
      minN: 1,
      maxN: 1000,
      maxTotalSteps: 178,
    });
  });
});

describe('riemannSearch', () => {
  it('finds no zeros below the first zero ordinate', () => {
    expect(MATH_REFERENCE_IMPLS.riemannSearch.fn(10)).toEqual({
      candidates: [],
      criticalCount: 0,
    });
  });

  it('counts the 29 critical zeros below T=100 with no off-line candidates', () => {
    expect(MATH_REFERENCE_IMPLS.riemannSearch.fn(100)).toEqual({
      candidates: [],
      criticalCount: 29,
    });
  }, 60000);
});

describe('bealSearch', () => {
  it('finds no counterexamples within the bound but tests quadruples', () => {
    const r = MATH_REFERENCE_IMPLS.bealSearch.fn(10000) as {
      counterexamples: Array<Record<string, number>>;
      testedQuadruples: number;
    };
    expect(r.counterexamples).toEqual([]);
    expect(r.testedQuadruples).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    const a = MATH_REFERENCE_IMPLS.bealSearch.fn(10000);
    const b = MATH_REFERENCE_IMPLS.bealSearch.fn(10000);
    expect(a).toEqual(b);
  });
});

describe('installMathReferenceGlobals', () => {
  it('installs callable real implementations on globalThis', () => {
    installMathReferenceGlobals();
    const g = globalThis as unknown as { __recourseMathRef?: Record<string, unknown> };
    expect(typeof g.__recourseMathRef?.collatzTotalStopping).toBe('function');
    const fn = g.__recourseMathRef?.collatzTotalStopping as (n: number) => number;
    expect(fn(27)).toBe(111);
  });

  it('is idempotent', () => {
    expect(() => installMathReferenceGlobals()).not.toThrow();
  });
});

describe('mathReferenceSource', () => {
  it('emits a delegating wrapper for a registered toolName', () => {
    const src = mathReferenceSource(problem('collatzTotalStopping'));
    expect(src).not.toBeNull();
    expect(src).toContain('function collatzTotalStopping(...args)');
    expect(src).toContain("globalThis.__recourseMathRef['collatzTotalStopping']");
  });

  it('returns null when the problem has no toolName', () => {
    expect(mathReferenceSource(problem())).toBeNull();
  });

  it('returns null for an unregistered toolName', () => {
    expect(mathReferenceSource(problem('notARegisteredTool'))).toBeNull();
  });

  it('generates a source that evaluates to the real implementation', () => {
    installMathReferenceGlobals();
    const src = mathReferenceSource(problem('collatzTotalStopping'));
    const run = new Function(`${src}\nreturn collatzTotalStopping(27);`);
    expect(run()).toBe(111);
  });
});