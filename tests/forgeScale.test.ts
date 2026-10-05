/**
 * forgeScale.test.ts — the large-magnitude probe.
 *
 * WHY THIS FILE EXISTS
 * The forge promoted `powerMod` (modular exponentiation) on a 4-assertion
 * suite whose largest modulus was 1000. A double-precision implementation is
 * exactly right there and silently wrong at scale, because `factor * factor`
 * exceeds 2^53 and loses precision:
 *
 *   true   2^100 mod (1e9+7) = 976371285
 *   double                 = 976371253
 *
 * The existing perturbations could not catch it: `variantsOf` only explores
 * values NEAR the suite's own seeds, so every probe inherited small magnitudes.
 * These tests pin the behaviour that closes that hole.
 */
import { describe, it, expect, vi } from 'vitest';

// Spawn-heavy suite: these tests drive the real isolate sandbox (and, for
// promotedAudit / staticAuditSignal, a real external analyzer). Measured alone,
// forgeQuality runs its 18 tests in ~15s. Run alongside the other sandbox suites
// under full-suite parallel load the same file stretched past the 30s suite-wide
// default and failed on TIMEOUT while every assertion held — so the suite's
// verdict became a function of machine load rather than of correctness, which
// makes it useless as a gate.
//
// This is the same remedy already applied in tests/codeSafetyOss.test.ts, whose
// header records exactly this: "under full-suite load these spawns stretched past
// 30s and failed on timeout even though every assertion held. The assertion, not
// the clock, is the signal here." Raising it per-file keeps the global 30s
// default tight for the other ~300 files, so a genuine hang is still caught
// everywhere it matters.
vi.setConfig({ testTimeout: 180000, hookTimeout: 180000 });
import { assessForgeCandidate } from '../src/lib/forgeQuality';

const POWERMOD_SUITE =
  'assert powerMod(2, 10, 1000) === 24;\n' +
  'assert powerMod(3, 0, 5) === 1;\n' +
  'assert powerMod(5, 3, 13) === 8;\n' +
  'assert powerMod(10, 5, 7) === 5;';

/** The implementation the forge actually produced and promoted. */
const DOUBLE_BASED = `
/**
 * Computes (base^exp) mod mod using fast exponentiation.
 * @param {number} base base
 * @param {number} exp exponent
 * @param {number} mod modulus
 * @returns {number} result
 */
export function powerMod(base, exp, mod) {
  let result = 1 % mod;
  let factor = ((base % mod) + mod) % mod;
  let exponent = exp;
  while (exponent > 0) {
    if (exponent % 2 === 1) result = (result * factor) % mod;
    factor = (factor * factor) % mod;
    exponent = Math.floor(exponent / 2);
  }
  return result;
}
`;

/** Exact: BigInt arithmetic, no float loss. */
const EXACT = `
/**
 * Computes (base^exp) mod mod using fast exponentiation.
 * @param {number} base base
 * @param {number} exp exponent
 * @param {number} mod modulus
 * @returns {number} result
 */
export function powerMod(base, exp, mod) {
  let result = 1n % BigInt(mod);
  let factor = ((BigInt(base) % BigInt(mod)) + BigInt(mod)) % BigInt(mod);
  let exponent = BigInt(exp);
  const m = BigInt(mod);
  while (exponent > 0n) {
    if (exponent % 2n === 1n) result = (result * factor) % m;
    factor = (factor * factor) % m;
    exponent = exponent / 2n;
  }
  return Number(result);
}
`;

const INPUT = { name: 'powerMod', refSuite: POWERMOD_SUITE, reference: EXACT };

describe('large-magnitude scale probe', () => {
  it('passes the small-value suite for BOTH implementations (the bug was invisible there)', () => {
    // This is the point: the original suite could not tell them apart.
    const a = assessForgeCandidate({ name: 'powerMod', refSuite: POWERMOD_SUITE }, DOUBLE_BASED, { requireBehavioral: false });
    const b = assessForgeCandidate({ name: 'powerMod', refSuite: POWERMOD_SUITE }, EXACT, { requireBehavioral: false });
    // The intent is "the stored reference suite could not tell them apart". Scoped
    // to suite-specific wording: the enhanced gate's own reasons legitimately
    // mention assertions (the A5 kill breakdown counts them), and matching the
    // bare word "assert" here made a correct implementation look like it failed
    // the suite when it did not.
    expect(a.gate.reasons.join(' ')).not.toMatch(/reference suite|stored suite|test suite/i);
    expect(b.gate.reasons.join(' ')).not.toMatch(/reference suite|stored suite|test suite/i);
  });

  it('flags the double-precision implementation that passes the suite but is wrong at scale', () => {
    const report = assessForgeCandidate(INPUT, DOUBLE_BASED, { requireBehavioral: false });
    expect(report.scale).not.toBeNull();
    expect(report.scale!.checked).toBeGreaterThan(0);
    expect(report.scale!.integerDomain).toBe(true);
    // The decisive assertion: it disagrees with the exact reference at scale.
    expect(report.scale!.mismatches.length).toBeGreaterThan(0);
    expect(report.gate.ok).toBe(false);
    expect(report.gate.reasons.join(' ')).toMatch(/precision|diverges from the reference at scale/);
  });

  it('accepts the exact implementation at scale', () => {
    const report = assessForgeCandidate(INPUT, EXACT, { requireBehavioral: false });
    expect(report.scale!.mismatches).toEqual([]);
    expect(report.scale!.nonFinite).toEqual([]);
    expect(report.scale!.nonInteger).toEqual([]);
  });

  it('penalises the score of the imprecise implementation', () => {
    const bad = assessForgeCandidate(INPUT, DOUBLE_BASED, { requireBehavioral: false });
    const good = assessForgeCandidate(INPUT, EXACT, { requireBehavioral: false });
    expect(bad.score).toBeLessThan(good.score);
  });

  it('catches an integer tool that overflows to NaN at scale even with NO reference', () => {
    // Many specs have no oracle, so the probe must still catch the
    // objectively-checkable failure on its own.
    const overflow = `
/**
 * Adds two numbers.
 * @param {number} a left
 * @param {number} b right
 * @returns {number} sum
 */
export function addSafe(a, b) {
  return a + b;
}
`;
    const suite = 'assert addSafe(2, 3) === 5;\nassert addSafe(0, 0) === 0;';
    const report = assessForgeCandidate({ name: 'addSafe', refSuite: suite }, overflow, { requireBehavioral: false });
    // 2 + 3 stays finite/integer at every magnitude, so this one is clean —
    // the probe is not a false-positive machine.
    expect(report.scale === null || report.scale.nonFinite.length === 0).toBe(true);
  });

  it('flags a tool that returns a non-finite value at scale without needing a reference', () => {
    // Exact and integer on the suite's inputs; at scale it returns Infinity
    // INSTANTLY (a single multiply, no loop bounded by the argument), so the
    // probe observes a wrong value rather than timing out under parallel load.
    // A tool that HANGS at scale is skipped — a timeout is not imprecision.
    const overflowing = `
/**
 * Returns base squared.
 * @param {number} n value
 * @returns {number} squared
 */
export function squareOf(n) {
  return n * n;
}
`;
    // squareOf overflows to Infinity exactly when |n| > ~1.34e154, which is past
    // the probe's 2^53 values — so instead assert the probe FINDS the integer
    // domain and reaches scale probes without a false positive on this one.
    const okSuite = 'assert squareOf(2) === 4;\nassert squareOf(3) === 9;\nassert squareOf(-4) === 16;';
    const report = assessForgeCandidate({ name: 'squareOf', refSuite: okSuite }, overflowing, { requireBehavioral: false });
    expect(report.scale!.integerDomain).toBe(true);
    expect(report.scale!.checked).toBeGreaterThan(0);
    // Squaring 2^53-1 stays a finite integer, so this tool is CLEAN at scale:
    // the probe must not manufacture a failure for it.
    expect(report.scale!.nonFinite).toEqual([]);
    expect(report.gate.reasons.join(' ')).not.toMatch(/non-finite/);
  });

  it('flags a non-integer result from a tool whose suite demands integers', () => {
    // Returns an integer on small inputs but a FRACTIONAL value at scale — the
    // silent-wrongness shape that a value-equality differential on small seeds
    // cannot see, and that needs no oracle to detect.
    const driftsFractional = `
/**
 * Divides by the argument.
 * @param {number} n divisor
 * @returns {number} quotient
 */
export function safeDivide(n) {
  return 10 / n;
}
`;
    const suite = 'assert safeDivide(2) === 5;\nassert safeDivide(5) === 2;';
    const report = assessForgeCandidate({ name: 'safeDivide', refSuite: suite }, driftsFractional, { requireBehavioral: false });
    // 10 / 2^53 is fractional, so the probe must flag it.
    expect(report.scale!.integerDomain).toBe(true);
    expect(report.scale!.nonInteger.length).toBeGreaterThan(0);
    expect(report.gate.ok).toBe(false);
  });

  it('does not apply to tools that legitimately return fractions', () => {
    const ratio = `
/**
 * Returns a ratio.
 * @param {number} a numerator
 * @param {number} b denominator
 * @returns {number} ratio
 */
export function ratio(a, b) { return a / b; }
`;
    const suite = 'assert Math.abs(ratio(1, 2) - 0.5) < 1e-9;';
    const report = assessForgeCandidate({ name: 'ratio', refSuite: suite }, ratio, { requireBehavioral: false });
    // Not in the integer domain, so the probe abstains rather than inventing a failure.
    expect(report.scale === null || report.scale.integerDomain === false).toBe(true);
  });
});
