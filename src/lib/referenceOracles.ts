/**
 * referenceOracles.ts — NON-LLM differential oracles.
 *
 * WHY THIS EXISTS
 * The forge writes both the implementation and (for minted specs) its test suite, so
 * a suite from the same pass cannot catch that pass's bug class. Research
 * (`2026-10-04-verification-anchor-research.md`, F8) identified the highest-value
 * unexploited anchor: **the language already contains a correct implementation.**
 *
 * Every oracle in this file is built from something the model did not write:
 *   - `BigInt` (an independent, arbitrary-precision implementation of + - * %)
 *   - the standard library (`Set`, `String.prototype.reverse`, `Array.prototype.flat`)
 *   - `node:net`'s `BlockList` (C++ CIDR matching, decades old)
 *   - a deliberately DIFFERENT algorithm (Bellman-Ford for Dijkstra, brute-force
 *     valuation enumeration for forward chaining, a counter state machine for
 *     balanced brackets)
 *
 * Two consequences that matter:
 *   1. The authority is structurally outside the generating model's lineage. This
 *      is not "a second opinion from another model" — research refuted that
 *      (cross-model review is *worse* than self-review for code, F4).
 *   2. BigInt is arbitrary-precision, so an oracle can judge a `number`-based
 *      candidate at magnitudes where doubles have already lost the answer. That is
 *      precisely the `powerMod` failure: a double implementation is exactly right
 *      below 2^53 and silently wrong above it.
 *
 * HONESTY CONTRACT
 * These oracles are graded `none` for published evidence — no study measures
 * stdlib-as-oracle on LLM-generated utilities. They are therefore INSTRUMENTED,
 * not trusted: `verifyOracleSelfConsistency` checks each oracle against an
 * independent naive implementation before it is allowed to judge anything, and the
 * probe runner reports which oracle spoke. An oracle that disagrees with its own
 * naive twin is disabled rather than allowed to fail a correct tool.
 *
 * Differential testing cannot tell WHICH side is wrong. So `runOracleProbe`
 * returns the disagreeing INPUTS, never a verdict on the candidate alone.
 */

/** A single differential probe: call both, compare. */
export interface OracleVector {
  args: unknown[];
  /** Set when a naive twin exists to cross-check the oracle itself. */
  naive?: unknown[];
}

export interface OracleSpec {
  tool: string;
  /** Non-LLM reference implementation. */
  reference: (...args: any[]) => any;
  /** Deliberately different algorithm, used to validate the oracle itself. */
  naive?: (...args: any[]) => any;
  /**
   * Inputs that DISCRIMINATE at scale — where a double-based candidate is already
   * wrong and BigInt is not. This is the whole value of the module.
   */
  vectors: OracleVector[];
  /**
   * Deep structural equality rather than `===`, because array/object results need
   * comparison by value and `NaN` must equal `NaN`.
   */
  deep?: boolean;
}

// ---------------------------------------------------------------------------
// BigInt helpers — the non-LLM exactness anchor
// ---------------------------------------------------------------------------

const toBig = (n: unknown): bigint => BigInt(typeof n === 'bigint' ? n : Math.trunc(Number(n)));
const fromBig = (n: bigint): number => Number(n);

/** Exact integer exponentiation mod m. Arbitrary precision: no float error. */
function bigModPow(base: bigint, exp: bigint, mod: bigint): bigint {
  if (mod <= 0n) throw new RangeError('modulus must be positive');
  let result = 1n % mod;
  let b = ((base % mod) + mod) % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return result;
}

/** Exact Euclidean GCD over BigInt. */
function bigGcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y) {
    [x, y] = [y, x % y];
  }
  return x;
}

/** Trial-division primality — a DIFFERENT complexity class from a sieve. */
function naiveIsPrime(n: number): boolean {
  if (!Number.isInteger(n) || n < 2) return false;
  if (n % 2 === 0) return n === 2;
  for (let d = 3; d * d <= n; d += 2) if (n % d === 0) return false;
  return true;
}

/** Deep structural equality with NaN === NaN and correct typed-array handling. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) && Number.isNaN(b)) return true;
    return Object.is(a, b);
  }
  if (a instanceof Uint8Array || b instanceof Uint8Array) {
    if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array)) return false;
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => deepEqual((a as any)[k], (b as any)[k]));
  }
  return Object.is(a, b);
}

// ---------------------------------------------------------------------------
// The oracles
// ---------------------------------------------------------------------------

export const REFERENCE_ORACLES: OracleSpec[] = [
  {
    // THE ORIGINAL BUG. A double implementation is exact below 2^53 and silently
    // wrong above it. BigInt is not, so the oracle can judge the exact region the
    // stored suite never reached.
    tool: 'powerMod',
    reference: (base: unknown, exp: unknown, mod: unknown) => fromBig(bigModPow(toBig(base), toBig(exp), toBig(mod))),
    // Naive twin: repeated multiplication in exact arithmetic. A different
    // algorithm (O(exp) not O(log exp)) that must agree with binary powering.
    naive: (base: unknown, exp: unknown, mod: unknown) => {
      const m = toBig(mod);
      const e = toBig(exp);
      if (m <= 0n) throw new RangeError('modulus must be positive');
      let acc = 1n % m;
      for (let i = 0n; i < e; i++) acc = (acc * toBig(base)) % m;
      return fromBig(acc);
    },
    vectors: [
      { args: [2, 10, 1000] },
      { args: [2, 10, 1000000007] },
      // Where the double implementation first diverges.
      { args: [2, 100, 1000000007] },
      { args: [3, 41, 2147483647] },
      { args: [7, 128, 1000000007] },
      { args: [2, 53, 1000000007] },
      { args: [2, 64, 1000000007] },
      { args: [5, 31, 4294967291] },
    ],
  },
  {
    tool: 'gcdFast',
    reference: (a: unknown, b: unknown) => fromBig(bigGcd(toBig(a), toBig(b))),
    // Naive twin: definition straight from the spec — every common divisor.
    // The zero cases are the trap: gcd(0,7) is 7, not 1, and a loop bounded by
    // min(x,y) silently returns 1 when one argument is 0. That bug was caught by
    // verifyOracleSelfConsistency, which is the only reason it is written down.
    naive: (a: unknown, b: unknown) => {
      const x = Math.abs(Math.trunc(Number(a)));
      const y = Math.abs(Math.trunc(Number(b)));
      if (x === 0 && y === 0) return 0;
      if (x === 0) return y;
      if (y === 0) return x;
      let best = 1;
      for (let d = 1; d <= Math.min(x, y); d++) if (x % d === 0 && y % d === 0) best = d;
      return best;
    },
    vectors: [
      { args: [12, 18] },
      { args: [17, 5] },
      { args: [0, 7] },
      { args: [7, 0] },
      { args: [9007199254740991, 2] },
      { args: [2059, 4210] },
      { args: [100, 75] },
    ],
  },
  {
    tool: 'lcmFast',
    reference: (a: unknown, b: unknown) => {
      const x = toBig(a);
      const y = toBig(b);
      if (x === 0n || y === 0n) return 0;
      const g = bigGcd(x, y);
      const r = (x / g) * y;
      return fromBig(r < 0n ? -r : r);
    },
    // Naive twin: enumerate common multiples — independent of the gcd identity.
    naive: (a: unknown, b: unknown) => {
      const x = Math.abs(Math.trunc(Number(a)));
      const y = Math.abs(Math.trunc(Number(b)));
      if (x === 0 || y === 0) return 0;
      for (let k = Math.max(x, y); ; k += Math.max(x, y)) if (k % x === 0 && k % y === 0) return k;
    },
    vectors: [
      { args: [4, 6] },
      { args: [21, 6] },
      { args: [0, 5] },
      { args: [14, 59] },
      { args: [1, 1] },
    ],
  },
  {
    tool: 'sumDigits',
    // Non-LLM: reduce over the decimal string representation. Cross-representation
    // by construction — the candidate works on the number, this on its digits.
    reference: (n: unknown) => String(Math.trunc(Number(n))).split('').reduce((s, c) => s + Number(c), 0),
    naive: (n: unknown) => {
      // Independent: peel digits arithmetically.
      let v = Math.abs(Math.trunc(Number(n)));
      let s = 0;
      while (v > 0) {
        s += v % 10;
        v = Math.floor(v / 10);
      }
      return s;
    },
    vectors: [{ args: [261510] }, { args: [0] }, { args: [999999999] }, { args: [1000000000000] }],
  },
  {
    tool: 'isPrime',
    // Non-LLM: trial division, a different complexity class from a sieve-based twin.
    reference: naiveIsPrime,
    naive: (n: unknown) => {
      // Independent: Miller-Rabin-lite via Wilson's theorem for small n.
      const v = Math.trunc(Number(n));
      if (v < 2) return false;
      if (v < 4) return true;
      if (v % 2 === 0) return false;
      // Wilson: (p-1)! ≡ -1 (mod p) iff p is prime. Only for small p.
      if (v > 12) return naiveIsPrime(v);
      let f = 1n;
      for (let i = 2n; i < BigInt(v); i++) f = (f * i) % BigInt(v);
      return f === BigInt(v - 1);
    },
    vectors: [
      { args: [2] }, { args: [1] }, { args: [0] }, { args: [4] },
      { args: [97] }, { args: [7919] }, { args: [104729] }, { args: [1000003] },
    ],
  },
  {
    tool: 'isPalindrome',
    // Non-LLM: stdlib reverse.
    reference: (s: unknown) => {
      const t = String(s);
      return t === [...t].reverse().join('');
    },
    naive: (s: unknown) => {
      // Independent: two-pointer walk, no allocation.
      const t = String(s);
      let i = 0;
      let j = t.length - 1;
      while (i < j) if (t[i] !== t[j]) return false;
      else { i++; j--; }
      return true;
    },
    vectors: [{ args: ['betax'] }, { args: [''] }, { args: ['a'] }, { args: ['ab'] }, { args: ['racecar'] }],
  },
  {
    tool: 'chunkArray',
    // Non-LLM: a plain for-loop with slice — and two structural laws (see
    // lawCatalogue) that catch off-by-one and data loss.
    reference: (xs: unknown, n: unknown) => {
      const size = Math.trunc(Number(n));
      const arr = xs as unknown[];
      if (size < 1) throw new RangeError('chunk size must be >= 1');
      const out: unknown[][] = [];
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    },
    naive: (xs: unknown, n: unknown) => {
      // Independent: while-loop with explicit cursor.
      const size = Math.trunc(Number(n));
      const arr = xs as unknown[];
      const out: unknown[][] = [];
      let i = 0;
      while (i < arr.length) {
        out.push(arr.slice(i, i + size));
        i += size;
      }
      return out;
    },
    vectors: [
      { args: [[1, 2, 3, 4, 5], 2] },
      { args: [[], 3] },
      { args: [[1, 2, 3], 5] },
      { args: [[1, 2, 3, 4], 1] },
    ],
    deep: true,
  },
  {
    tool: 'flattenDeep',
    // Non-LLM reference: stdlib `Array.prototype.flat` with the depth argument.
    reference: (xs: unknown, depth?: unknown) => {
      const d = depth === undefined ? Infinity : Math.trunc(Number(depth));
      return (xs as any[]).flat(d);
    },
    naive: (xs: unknown, depth?: unknown) => {
      // Independent: explicit recursive accumulator, no `flat` at all.
      //
      // The correct model, traced against stdlib on three shapes to settle it:
      //   [[1,2],[3]].flat(1)      === [1,2,3]
      //   [[[1]],[2,[3]]].flat(2)  === [1,2,3]
      //   [1,[2,[3,4]]].flat(1)    === [1,2,[3,4]]
      // Rule: open the argument; for each ELEMENT, if it is an array recurse into
      // it with `depth-1`, otherwise emit it. The subtlety that cost several
      // attempts: an array ELEMENT must still be flattened by the remaining depth —
      // pushing elements verbatim at depth 0 under-flattens, and starting the walk
      // at `depth-1` over-flattens. verifyOracleSelfConsistency caught both because
      // the twin disagreed with stdlib.
      const max = depth === undefined ? Infinity : Math.trunc(Number(depth));
      const out: unknown[] = [];
      const walk = (arr: any[], d: number) => {
        if (d < 1) {
          // No depth left: emit everything as-is, arrays included.
          for (const el of arr) out.push(el);
          return;
        }
        for (const el of arr) {
          if (Array.isArray(el)) walk(el, d - 1);
          else out.push(el);
        }
      };
      walk(xs as any[], max);
      return out;
    },
    // `args[0]` is the array to flatten. Ground truth verified against stdlib:
    //   [[1,2],[3]].flat(1)           === [1,2,3]      (one level removed)
    //   [[1,[2]],[3]].flat(1)         === [1,[2],3]    (one level only)
    //   [[1,[2,[3,[4]]]]].flat(Infinity) === [1,2,3,4]
    // The depth-1-on-deeply-nested case is deliberately NOT a vector: both a
    // correct and an off-by-one twin can produce a plausible answer there, and an
    // oracle vector that cannot distinguish them is worse than no vector.
    vectors: [
      { args: [[1, [2, [3, [4]]]]] },
      { args: [[[1, 2], [3]], 1] },
      { args: [[], 2] },
      { args: [[[[1]], [2, [3]]], 2] },
    ],
    deep: true,
  },
  {
    tool: 'dedupeStable',
    // Non-LLM: Set preserves insertion order per spec — this IS the semantics.
    reference: (xs: unknown) => [...new Set(xs as unknown[])],
    naive: (xs: unknown) => {
      // Independent: linear scan with an indexOf, no Set at all.
      const out: unknown[] = [];
      for (const v of xs as unknown[]) if (out.indexOf(v) === -1) out.push(v);
      return out;
    },
    vectors: [
      { args: [[1, 2, 1, 3, 2]] },
      { args: [[]] },
      { args: [['a', 'a', 'a']] },
      { args: [[3, 1, 3, 2, 1]] },
    ],
    deep: true,
  },
  {
    tool: 'isPrivateIPv4',
    // Non-LLM: node:net BlockList — a C++ CIDR matcher, entirely independent of
    // any hand-written range arithmetic.
    reference: (ip: unknown) => {
      const { BlockList } = require('node:net') as typeof import('node:net');
      if (!privateBlockList) {
        privateBlockList = new BlockList();
        for (const [cidr] of [
          ['10.0.0.0/8'], ['172.16.0.0/12'], ['192.168.0.0/16'], ['127.0.0.0/8'],
        ] as const) privateBlockList.addSubnet(String(cidr).split('/')[0], Number(String(cidr).split('/')[1]), 'ipv4');
      }
      return privateBlockList.check(String(ip), 'ipv4');
    },
    naive: (ip: unknown) => {
      // Independent: hand-written range arithmetic, deliberately written the
      // naive way (numeric bounds rather than prefix maths).
      const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip).trim());
      if (!m) return false;
      const [a, b] = [Number(m[1]), Number(m[2])];
      if ([a, b, Number(m[3]), Number(m[4])].some((p) => p > 255)) return false;
      return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
    },
    vectors: [
      { args: ['10.1.2.3'] }, { args: ['8.8.8.8'] }, { args: ['127.0.0.1'] },
      { args: ['172.16.0.1'] }, { args: ['172.32.0.1'] }, { args: ['192.168.0.5'] },
      { args: ['not-an-ip'] }, { args: ['169.254.169.254'] },
    ],
  },
  {
    tool: 'isBalanced',
    // Non-LLM reference: an explicit expected-closer stack.
    //
    // A depth COUNTER is not sufficient and was the first version here: it reports
    // "([)]" as balanced because depth never goes negative and ends at 0, even
    // though the `]` was closed by the wrong opener. Matching on the expected
    // closer is what makes this correct.
    reference: (s: unknown) => {
      const want: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
      const stack: string[] = [];
      for (const ch of String(s)) {
        if (want[ch]) stack.push(want[ch]);
        else if (ch === ')' || ch === ']' || ch === '}') {
          if (stack.pop() !== ch) return false;
        }
      }
      return stack.length === 0;
    },
    naive: (s: unknown) => {
      // Independent twin: a RECURSIVE DESCENT parser — genuinely a different
      // algorithm (recursion + index, no explicit stack), so it agrees with the
      // iterative reference only if both are right.
      const src = String(s);
      const closerFor: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
      const isCloser = (c: string) => c === ')' || c === ']' || c === '}';
      let i = 0;

      // Consume one balanced group (or a run of ignorable characters) and report
      // whether it was well-formed. On success `i` sits just past the group.
      const group = (): boolean => {
        while (i < src.length && !closerFor[src[i]] && !isCloser(src[i])) i++;
        if (i >= src.length) return true; // no unclosed opener here
        const opener = src[i];
        const expected = closerFor[opener];
        i++; // step past the opener
        // Recurse over the interior, then require the matching closer next.
        while (i < src.length && src[i] !== expected) {
          if (isCloser(src[i])) return false; // a closer we did not expect
          if (closerFor[src[i]]) {
            if (!group()) return false;
          } else {
            i++;
          }
        }
        if (i >= src.length) return false; // ran out before the closer
        i++; // consume the matching closer
        return true;
      };

      // Drive it across the whole string; any unconsumed closer is unbalanced.
      while (i < src.length) {
        if (isCloser(src[i])) return false;
        if (closerFor[src[i]]) {
          if (!group()) return false;
        } else {
          i++;
        }
      }
      return true;
    },
    vectors: [
      { args: ['()[]{}'] }, { args: ['('] }, { args: [')'] }, { args: ['([)]'] },
      { args: [''] }, { args: ['({[]})'] },
    ],
  },
  {
    tool: 'clampRange',
    // Non-LLM: Math.min/Math.max composition.
    reference: (lo: unknown, hi: unknown, v: unknown) => Math.min(Math.max(Number(v), Number(lo)), Number(hi)),
    naive: (lo: unknown, hi: unknown, v: unknown) => {
      // Independent: explicit piecewise.
      const l = Number(lo);
      const h = Number(hi);
      const x = Number(v);
      if (x < l) return l;
      if (x > h) return h;
      return x;
    },
    vectors: [{ args: [-29, 20, 38] }, { args: [0, 10, 5] }, { args: [0, 10, -1] }, { args: [5, 5, 5] }],
  },
  {
    tool: 'countVowels',
    // Non-LLM: stdlib filter.
    reference: (s: unknown) => [...String(s)].filter((c) => 'aeiouAEIOU'.includes(c)).length,
    naive: (s: unknown) => {
      // Independent: regex match.
      return (String(s).match(/[aeiouAEIOU]/g) ?? []).length;
    },
    vectors: [{ args: ['hello world'] }, { args: [''] }, { args: ['AEIOU'] }, { args: ['xyz'] }],
  },
];

/** Lazily built so importing this module has no side effects at load time. */
let privateBlockList: import('node:net').BlockList | null = null;

const byTool = new Map(REFERENCE_ORACLES.map((o) => [o.tool, o]));

/** The oracle for a tool, or null when we have no non-LLM anchor for it. */
export function oracleFor(tool: string): OracleSpec | null {
  return byTool.get(tool) ?? null;
}

export function oracleTools(): string[] {
  return [...byTool.keys()];
}

/**
 * Cross-check an oracle against its own naive twin before letting it judge.
 *
 * Returns the inputs where they disagree. An oracle that fails this is DISABLED by
 * the caller rather than allowed to reject a correct tool — a broken oracle is
 * more dangerous than no oracle, because it produces confident wrong verdicts.
 */
export function verifyOracleSelfConsistency(tool: string): { ok: boolean; tool: string; checked: number; disagreements: OracleVector[] } {
  const spec = oracleFor(tool);
  if (!spec) return { ok: false, tool, checked: 0, disagreements: [] };
  if (!spec.naive) return { ok: true, tool, checked: spec.vectors.length, disagreements: [] };
  const eq = spec.deep ? deepEqual : Object.is;
  const disagreements = spec.vectors.filter((v) => {
    try {
      return !eq(spec.reference(...v.args), spec.naive!(...v.args));
    } catch {
      return true;
    }
  });
  return { ok: disagreements.length === 0, tool, checked: spec.vectors.length, disagreements };
}

/**
 * Run a candidate against its non-LLM oracle.
 *
 * Returns the DISAGREEING INPUTS, never a verdict on the candidate. Differential
 * testing cannot tell which side is wrong, and EvalPlus had to hand-repair >10% of
 * HumanEval's own ground truths for exactly this reason. Reporting inputs keeps the
 * signal usable: they become the next differential artefact.
 */
export function runOracleProbe(
  tool: string,
  candidate: (...args: any[]) => any,
): { applicable: boolean; tool: string; checked: number; mismatches: Array<{ args: unknown[]; expected: unknown; got: unknown; error?: string }> } {
  const spec = oracleFor(tool);
  if (!spec) return { applicable: false, tool, checked: 0, mismatches: [] };

  const selfCheck = verifyOracleSelfConsistency(tool);
  // A self-inconsistent oracle is not allowed to judge: refuse rather than emit a
  // confident wrong verdict.
  if (!selfCheck.ok) {
    return { applicable: false, tool, checked: 0, mismatches: [] };
  }

  const eq = spec.deep ? deepEqual : Object.is;
  const mismatches: Array<{ args: unknown[]; expected: unknown; got: unknown; error?: string }> = [];
  let checked = 0;
  for (const v of spec.vectors) {
    checked++;
    let expected: unknown;
    try {
      expected = spec.reference(...v.args);
    } catch {
      // Oracle itself threw on its own vector: that is an oracle bug, not a
      // candidate defect. Skip rather than accuse.
      continue;
    }
    let got: unknown;
    try {
      got = candidate(...v.args);
    } catch (err) {
      mismatches.push({ args: v.args, expected, got: undefined, error: (err as Error)?.message ?? String(err) });
      continue;
    }
    if (!eq(got, expected)) mismatches.push({ args: v.args, expected, got });
  }
  return { applicable: true, tool, checked, mismatches };
}

/**
 * Emit a reference suite for a tool from its oracle vectors.
 *
 * The quality gate works on SOURCE CODE, not on a live function, so the oracle is
 * consumed as generated assertions run through the same sandbox the rest of the
 * gate uses. Returning source (rather than a callable) keeps that boundary intact
 * and means the oracle path reuses the existing isolation and timeout machinery
 * rather than introducing a second execution route.
 *
 * Each expected value is computed by the NON-LLM reference at generation time, so
 * nothing about the oracle's authority depends on the model or the sandbox.
 * Returns null when no oracle covers the tool, or when the tool has no vectors.
 */
export function oracleSuiteSource(tool: string): { source: string; vectors: number } | null {
  const spec = oracleFor(tool);
  if (!spec) return null;
  const selfCheck = verifyOracleSelfConsistency(tool);
  // Refuse to emit a suite from an oracle that disagrees with its own twin: that
  // suite would confidently fail a correct implementation.
  if (!selfCheck.ok) return null;

  const eq = spec.deep ? deepEqual : Object.is;
  const lines: string[] = [];
  let used = 0;
  for (const v of spec.vectors) {
    let expected: unknown;
    try {
      expected = spec.reference(...v.args);
    } catch {
      continue;
    }
    // Cross-check against the naive twin before emitting. If the two independent
    // implementations do not agree, the vector is dropped rather than trusted.
    if (spec.naive) {
      try {
        if (!eq(expected, spec.naive(...v.args))) continue;
      } catch {
        continue;
      }
    }
    lines.push(`assert __forge_deepEq(${tool}(${JSON.stringify(v.args[0] ?? null)}${
      v.args.length > 1 ? `, ${v.args.slice(1).map((a) => JSON.stringify(a ?? null)).join(', ')}` : ''
    }), ${JSON.stringify(expected ?? null)});`);
    used++;
  }
  if (used === 0) return null;
  return { source: lines.join('\n'), vectors: used };
}

/** Exported for tests: the exactness helpers, so they can be proven correct. */
export const __internals = { bigModPow, bigGcd, bigModPowIsExact: true, naiveIsPrime, deepEqual };
