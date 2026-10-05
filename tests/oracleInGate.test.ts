/**
 * The non-LLM oracle wired INTO the enhanced quality gate.
 *
 * `referenceOracles.test.ts` proves the oracles are correct in isolation. These
 * tests prove the thing that matters: that a wrong candidate is REJECTED by the
 * gate using an authority the generating model did not write.
 */
import { describe, it, expect } from 'vitest';
import { assessForgeCandidate } from '../src/lib/forgeQuality.js';

const REF_POW = (name: string) => [
  `export function ${name}(base, exp, mod) {`,
  '  let r = 1, b = base % mod, e = exp;',
  '  while (e > 0) { if (e & 1) r = (r * b) % mod; b = (b * b) % mod; e >>= 1; }',
  '  return r;',
  '}',
].join('\n');

const powSpec = {
  name: 'powerMod',
  refSuite: [
    'assert powerMod(2, 10, 1000) === 1024;',
    'assert powerMod(3, 5, 7) === 5;',
    'assert powerMod(5, 0, 11) === 1;',
    'assert powerMod(7, 1, 13) === 7;',
  ].join('\n'),
};

describe('non-LLM oracle inside the enhanced gate', () => {
  it('REJECTS the double-precision powerMod that the stored suite cannot catch', () => {
    // This implementation PASSES every assertion in powSpec — it is exactly the
    // code that was promoted and marked healthy for so long.
    const src = REF_POW('powerMod');
    const suiteOnly = src + '\n' + powSpec.refSuite;
    // Sanity: the weak suite really does pass it.
    const weak = assessForgeCandidate({ name: 'powerMod', refSuite: powSpec.refSuite }, src);
    expect(weak.scale).not.toBeNull();

    const report = assessForgeCandidate(powSpec, src);
    expect(report.gate.ok).toBe(false);
    expect(report.gate.reasons.join(' ')).toMatch(/non-LLM differential oracle/);
    expect(report.oracle).not.toBeNull();
    expect(report.oracle!.mismatches.length).toBeGreaterThan(0);
  });

  it('ACCEPTS an exact implementation of the same function', () => {
    const exact = [
      'export function powerMod(base, exp, mod) {',
      '  const B = BigInt(base), E = BigInt(exp), M = BigInt(mod);',
      '  let r = 1n % M, b = ((B % M) + M) % M, e = E;',
      '  while (e > 0n) { if (e & 1n) r = (r * b) % M; b = (b * b) % M; e >>= 1n; }',
      '  return Number(r);',
      '}',
    ].join('\n');
    const report = assessForgeCandidate(powSpec, exact);
    expect(report.gate.reasons.filter((r) => /oracle/.test(r))).toEqual([]);
    expect(report.oracle?.mismatches ?? []).toEqual([]);
  });

  it('reports which oracle spoke, so the verdict is attributable', () => {
    const report = assessForgeCandidate(powSpec, REF_POW('powerMod'));
    expect(report.oracle?.tool).toBe('powerMod');
    expect(report.oracle?.checked).toBeGreaterThan(0);
  });

  it('is silent for a tool no oracle covers — absence is not failure', () => {
    const spec = { name: 'someNovelTool', refSuite: 'assert someNovelTool(1) === 1;' };
    const src = 'export function someNovelTool(a){ return a; }';
    const report = assessForgeCandidate(spec, src);
    expect(report.oracle ?? null).toBeNull();
    expect(report.gate.reasons.filter((r) => /oracle/.test(r))).toEqual([]);
  });

  it('a hardcoded-to-the-suite implementation still fails the oracle', () => {
    // The suite returns hardcoded values for exactly its four inputs. It passes
    // the suite and is wrong everywhere else — precisely the overfit shape.
    const overfit = [
      'export function powerMod(base, exp, mod) {',
      '  const k = JSON.stringify([base, exp, mod]);',
      '  const table = {',
      '    "[2,10,1000]": 1024, "[3,5,7]": 5, "[5,0,11]": 1, "[7,1,13]": 7',
      '  };',
      '  return k in table ? table[k] : 1;',
      '}',
    ].join('\n');
    const report = assessForgeCandidate(powSpec, overfit);
    expect(report.gate.ok).toBe(false);
  });

  it('catches an isPalindrome that only handles even-length inputs', () => {
    const spec = {
      name: 'isPalindrome',
      refSuite: 'assert isPalindrome("betax") === false;\nassert isPalindrome("") === true;\nassert isPalindrome("a") === true;\nassert isPalindrome("ab") === false;',
    };
    const evenOnly = [
      'export function isPalindrome(s) {',
      '  if (s.length % 2 !== 0) return false;',
      '  let i = 0, j = s.length - 1;',
      '  while (i < j) { if (s[i] !== s[j]) return false; i++; j--; }',
      '  return true;',
      '}',
    ].join('\n');
    const report = assessForgeCandidate(spec, evenOnly);
    // "a" is odd-length and must be a palindrome; the suite asserts it too, so
    // either the suite or the oracle catches it. The oracle must not be silent.
    expect(report.gate.ok).toBe(false);
  });
});
