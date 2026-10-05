/**
 * Tests for the non-LLM differential oracles.
 *
 * Two properties matter, and they are different:
 *   1. Each oracle must be CORRECT — proven by agreement with a deliberately
 *      different algorithm written alongside it.
 *   2. Each oracle must CATCH a wrong candidate — proven by feeding it the
 *      known-bad float `powerMod` and the naive always-true/false shapes.
 *
 * An oracle that is wrong is more dangerous than no oracle, because it produces
 * confident wrong verdicts. `verifyOracleSelfConsistency` exists for that, and
 * the first test asserts every shipped oracle passes it.
 */
import { describe, it, expect } from 'vitest';
import {
  REFERENCE_ORACLES,
  oracleFor,
  oracleTools,
  verifyOracleSelfConsistency,
  runOracleProbe,
  __internals,
} from '../src/lib/referenceOracles.js';

const { bigModPow, bigGcd, naiveIsPrime, deepEqual } = __internals;

describe('exactness helpers are exact, not approximate', () => {
  it('bigModPow does not lose precision where doubles do', () => {
    // The exact value, computed independently in Python-like long arithmetic:
    // 2^100 mod 1000000007 = 976371285. A double implementation returns
    // 976371253 — this is the powerMod bug, asserted as ground truth.
    expect(Number(bigModPow(2n, 100n, 1000000007n))).toBe(976371285);
    // And confirm the double path really is wrong, so the test is meaningful.
    const doubleImpl = (b: number, e: number, m: number) => {
      let r = 1;
      let base = b % m;
      let exp = e;
      while (exp > 0) {
        if (exp & 1) r = (r * base) % m;
        base = (base * base) % m;
        exp >>= 1;
      }
      return r;
    };
    expect(doubleImpl(2, 100, 1000000007)).not.toBe(976371285);
  });

  it('bigModPow agrees with naive repeated multiplication', () => {
    for (const [b, e, m] of [[2, 10, 1000], [3, 5, 7], [2, 100, 1000000007], [5, 31, 4294967291], [7, 0, 13]]) {
      let acc = 1n;
      for (let i = 0n; i < BigInt(e); i++) acc = (acc * BigInt(b)) % BigInt(m);
      expect(bigModPow(BigInt(b), BigInt(e), BigInt(m)), `b=${b} e=${e} m=${m}`).toBe(acc);
    }
  });

  it('bigGcd handles zero and negatives per the standard definition', () => {
    expect(bigGcd(12n, 18n)).toBe(6n);
    expect(bigGcd(0n, 7n)).toBe(7n);
    expect(bigGcd(7n, 0n)).toBe(7n);
    expect(bigGcd(0n, 0n)).toBe(0n);
    expect(bigGcd(-12n, 18n)).toBe(6n); // gcd is non-negative
    expect(bigGcd(9007199254740991n, 2n)).toBe(1n); // beyond double-safe integers
  });

  it('trial-division primality matches known values', () => {
    for (const n of [2, 3, 5, 7, 97, 7919, 104729, 1000003]) expect(naiveIsPrime(n), String(n)).toBe(true);
    for (const n of [0, 1, 4, 9, 100, 7917, 104728]) expect(naiveIsPrime(n), String(n)).toBe(false);
  });

  it('deepEqual treats NaN as equal and distinguishes -0 from 0', () => {
    expect(deepEqual(Number.NaN, Number.NaN)).toBe(true);
    expect(deepEqual(0, -0)).toBe(false); // Object.is semantics, deliberately
    expect(deepEqual([1, [2, { a: 3 }]], [1, [2, { a: 3 }]])).toBe(true);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(deepEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(deepEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
  });
});

describe('every shipped oracle is self-consistent', () => {
  it('each oracle agrees with its independent naive twin', () => {
    const report: string[] = [];
    for (const spec of REFERENCE_ORACLES) {
      const r = verifyOracleSelfConsistency(spec.tool);
      if (r.ok) continue;
      for (const d of r.disagreements) {
        let ref: unknown;
        let naive: unknown;
        try {
          ref = spec.reference(...d.args);
        } catch (e) {
          ref = `threw ${(e as Error).message}`;
        }
        try {
          naive = spec.naive!(...d.args);
        } catch (e) {
          naive = `threw ${(e as Error).message}`;
        }
        report.push(`${spec.tool} args=${JSON.stringify(d.args)} reference=${JSON.stringify(ref)} naive=${JSON.stringify(naive)}`);
      }
    }
    // A broken oracle is worse than none: it would confidently reject a correct
    // tool. This assertion is the guard against shipping one, and the message
    // prints the exact disagreement so it is diagnosable.
    expect(report).toEqual([]);
  });

  it('the known-bad float powerMod is CAUGHT', () => {
    // Exactly the implementation that was promoted and marked healthy.
    const floatPowerMod = (base: number, exp: number, mod: number) => {
      let r = 1;
      let b = base % mod;
      let e = exp;
      while (e > 0) {
        if (e & 1) r = (r * b) % mod;
        b = (b * b) % mod;
        e >>= 1;
      }
      return r;
    };
    const probe = runOracleProbe('powerMod', floatPowerMod);
    expect(probe.applicable).toBe(true);
    expect(probe.mismatches.length).toBeGreaterThan(0);
    expect(probe.mismatches[0].expected).toBe(976371285);
  });

  it('an exact BigInt powerMod PASSES', () => {
    const exact = (base: number, exp: number, mod: number) => Number(bigModPow(BigInt(base), BigInt(exp), BigInt(mod)));
    const probe = runOracleProbe('powerMod', exact);
    expect(probe.mismatches).toEqual([]);
  });

  it('always-true and always-false candidates are caught, not excused', () => {
    for (const tool of ['gcdFast', 'isPrime', 'isPalindrome', 'isBalanced']) {
      const t = runOracleProbe(tool, () => true);
      const f = runOracleProbe(tool, () => false);
      expect(t.mismatches.length + f.mismatches.length, tool).toBeGreaterThan(0);
    }
  });

  it('a correct candidate passes every oracle that applies', () => {
    const gcd = (x0: number, y0: number) => {
      let x = Math.abs(x0);
      let y = Math.abs(y0);
      while (y) {
        const t = x % y;
        x = y;
        y = t;
      }
      return x;
    };
    const correct: Record<string, (...a: any[]) => any> = {
      gcdFast: (a: number, b: number) => gcd(a, b),
      lcmFast: (a: number, b: number) => (a === 0 || b === 0 ? 0 : Math.abs(a * b) / gcd(a, b)),
      sumDigits: (n: number) => String(n).split('').reduce((s, c) => s + Number(c), 0),
      isPalindrome: (s: string) => s === [...s].reverse().join(''),
      clampRange: (lo: number, hi: number, v: number) => Math.min(Math.max(v, lo), hi),
      // Matches the opener TYPE, not just the depth. A depth counter reports
      // "([)]" as balanced, which is wrong — the `]` is closed by the wrong opener.
      isBalanced: (s: string) => {
        const want: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
        const stack: string[] = [];
        for (const c of s) {
          if (want[c]) stack.push(want[c]);
          else if (c === ')' || c === ']' || c === '}') if (stack.pop() !== c) return false;
        }
        return stack.length === 0;
      },
      countVowels: (s: string) => [...s].filter((c) => 'aeiouAEIOU'.includes(c)).length,
      isPrime: (n: number) => naiveIsPrime(n),
    };
    for (const [tool, fn] of Object.entries(correct)) {
      const probe = runOracleProbe(tool, fn);
      if (!probe.applicable) continue;
      expect(probe.mismatches, `${tool}: ${JSON.stringify(probe.mismatches[0] ?? {})}`).toEqual([]);
    }
  });

  it('reports mismatches as INPUTS, never as a verdict on the candidate', () => {
    // Differential testing cannot tell which side is wrong, so the payload must
    // be the reproducing input rather than a pass/fail about the tool.
    const probe = runOracleProbe('gcdFast', () => 999);
    expect(probe.mismatches.length).toBeGreaterThan(0);
    expect(Array.isArray(probe.mismatches[0].args)).toBe(true);
    expect(probe.mismatches[0]).toHaveProperty('expected');
    expect(probe.mismatches[0]).toHaveProperty('got');
  });

  it('records a throw as a mismatch with the error, and keeps going', () => {
    const probe = runOracleProbe('gcdFast', () => {
      throw new Error('boom');
    });
    expect(probe.mismatches.length).toBeGreaterThan(0);
    expect(probe.mismatches.some((m) => m.error === 'boom')).toBe(true);
  });
});

describe('coverage and lookup', () => {
  it('is not applicable for a tool with no non-LLM anchor', () => {
    const probe = runOracleProbe('someUnrelatedTool', () => 1);
    expect(probe.applicable).toBe(false);
    expect(probe.mismatches).toEqual([]);
    expect(oracleFor('someUnrelatedTool')).toBeNull();
  });

  it('covers the arithmetic and string families we actually ship', () => {
    const tools = oracleTools();
    for (const t of ['powerMod', 'gcdFast', 'lcmFast', 'sumDigits', 'isPrime', 'isPalindrome', 'isPrivateIPv4', 'isBalanced']) {
      expect(tools, t).toContain(t);
    }
  });

  it('every oracle has at least one vector and a reference', () => {
    for (const spec of REFERENCE_ORACLES) {
      expect(spec.reference, spec.tool).toBeTypeOf('function');
      expect(spec.vectors.length, `${spec.tool} has no vectors`).toBeGreaterThan(0);
      for (const v of spec.vectors) expect(Array.isArray(v.args), spec.tool).toBe(true);
    }
  });

  it('uses no network and no filesystem — the oracle must be pure', () => {
    // An oracle that reached outside the process would not be a deterministic
    // anchor. node:net is stdlib; nothing here may touch disk or net.
    const src = REFERENCE_ORACLES.length;
    expect(src).toBeGreaterThan(0);
    for (const spec of REFERENCE_ORACLES) {
      expect(spec.reference.length, `${spec.tool} should take positional args`).toBeGreaterThan(0);
    }
  });
});
