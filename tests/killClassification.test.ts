/**
 * A5 — kill classification, and A3 — preserve failing inputs.
 *
 * WHY THIS EXISTS
 * ISSTA 2023 measured that up to **43.8%** of "mutants killed" died from CRASHES
 * rather than assertion failures, and that test oracles contributed as little as
 * 11.8% of failures for some subjects. A crash-kill is a weaker signal than it
 * looks: the mutant may have died for the wrong reason.
 *
 * This exact shape already appeared here. The forged `exponentialBackoffMs`
 * returned `null`, so `backoffMs * Math.pow(...)`-shaped code threw a TypeError on
 * the next line. It was "caught" — but by a crash, not by noticing the wrong value.
 *
 * A3 is the companion: the research found LLMs generate discriminating INPUTS at a
 * 25-78% rate but correct ASSERTIONS only 0-10% of the time. So when a probe
 * disagrees, the INPUT is the valuable artefact and must be kept, even when the
 * assertion that found it is discarded.
 */
import { executeTestSuite } from '../src/lib/executionSandbox.js';
import { classifyFailure, classifyFailures, summarizeKills } from '../src/lib/killClassification.js';
import { describe, it, expect } from 'vitest';

// Expected values verified by computation, not by hand:
//   2^10 mod 1000        === 24        (NOT 1024 — 1024 is the UNREDUCED power)
//   3^5  mod 7           === 5
//   2^100 mod 1000000007 === 976371285
// Two earlier versions of this fixture asserted 1024 and 976371285-for-1000,
// i.e. unreduced or mis-transcribed values. Both made a CORRECT implementation
// look broken. That is precisely the failure mode this workstream exists to
// catch, and it happened in the test rather than the code — which is why every
// expected value here is now derived, not recalled.
const SUITE = [
  'assert powerMod(2,10,1000) === 24;',
  'assert powerMod(3,5,7) === 5;',
].join('\n');

const CRASH_SRC = 'export function powerMod(b,e,m){ return null; }';
// A float implementation, indistinguishable from the exact one below 2^53.
// Returns the right shape but a wrong value: an off-by-one in the final reduce.
// It fails the assertion cleanly, which is what an ASSERTION kill looks like (as
// opposed to the thrower below, which is a CRASH).
const WRONG_VALUE_SRC = `
export function powerMod(base, exp, mod) {
  let r = 1;
  let b = base % mod;
  let e = exp;
  while (e > 0) {
    if (e & 1) r = (r * b) % mod;
    b = (b * b) % mod;
    e >>= 1;
  }
  return (r + 1) % mod;
}`;
// Correct for the suite's inputs. BigInt is deliberately avoided: the sandbox
// strips some globals, so an "exact" fixture that throws would look like a
// product defect rather than a test artefact.
const CORRECT_SRC = `
export function powerMod(b,e,m){
  let r=1,x=((b%m)+m)%m,n=e;
  while(n>0){ if(n&1) r=(r*x)%m; x=(x*x)%m; n>>=1; }
  return r;
}`;

function run(src: string) {
  return executeTestSuite(src, SUITE);
}

describe('A5 — a crash is not the same signal as a wrong value', () => {
  it('distinguishes a wrong returned value from a thrown error', () => {
    // The forged tool that was "caught" earlier returned `null`. On its own that
    // is a wrong VALUE, not a crash — the TypeError only appeared once caller code
    // did arithmetic on the result. Both are detected; they are different signals
    // and must not be conflated.
    const wrongValue = run(CRASH_SRC);
    expect(wrongValue.passed).toBe(false);
    expect(classifyFailures(wrongValue).some((k) => k.kind === 'assertion')).toBe(true);

    // A genuine throw aborts the run and is reported distinctly.
    const thrower = run('export function powerMod(b,e,m){ throw new TypeError("boom"); }');
    expect(thrower.passed).toBe(false);
    expect(classifyFailures(thrower).some((k) => k.kind === 'crash')).toBe(true);
  });

  it('classifies a wrong returned value as an assertion failure', () => {
    const r = run(WRONG_VALUE_SRC);
    expect(r.passed).toBe(false);
    const kinds = classifyFailures(r);
    expect(kinds.some((k) => k.kind === 'assertion')).toBe(true);
  });

  it('reports no failures at all for a correct implementation', () => {
    const r = run(CORRECT_SRC);
    expect(r.passed).toBe(true);
    expect(classifyFailures(r)).toEqual([]);
  });

  it('summarises the split so a crash-heavy verdict is visible', () => {
    const s = summarizeKills(run(CRASH_SRC));
    expect(s.total).toBeGreaterThan(0);
    expect(s.crashes + s.assertions + s.other).toBe(s.total);
  });
});

describe('A3 — the discriminating input survives the discarded assertion', () => {
  it('retains the input that produced a disagreement', () => {
    const r = run(WRONG_VALUE_SRC);
    const artefacts = classifyFailures(r);
    expect(artefacts.length).toBeGreaterThan(0);
    // Every artefact carries the input, even though the finding it came from is
    // only a report — the input is the reusable part.
    for (const a of artefacts) {
      expect(a.detail.length).toBeGreaterThan(0);
    }
  });

  it('a crash artefact is still an input worth keeping', () => {
    // The thrown error IS the bug; the input that provoked it is what a future
    // differential pass needs.
    const r = run('export function powerMod(b,e,m){ throw new TypeError("boom"); }');
    const crashes = classifyFailures(r).filter((a) => a.kind === 'crash');
    expect(crashes.length).toBeGreaterThan(0);
    expect(crashes[0].detail).toMatch(/\S/);
  });

  it('never reports a pass as a failure', () => {
    // A green run must yield zero artefacts; otherwise "keeping inputs" becomes
    // an ever-growing pile of noise.
    expect(classifyFailures(run(CORRECT_SRC))).toEqual([]);
  });
});

describe('classification is conservative', () => {
  it('an unrecognised failure shape is `other`, never silently `assertion`', () => {
    // Misclassifying an unknown failure as an assertion would overstate the
    // strength of the evidence, which is the exact error this guards.
    expect(classifyFailure('something entirely unexpected', '').kind).toBe('other');
  });

  it('a timeout is its own kind, not an assertion failure', () => {
    expect(classifyFailure('timed out after 3000ms', '').kind).toBe('timeout');
  });
});