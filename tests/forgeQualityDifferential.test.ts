import { describe, expect, it } from 'vitest';
import { differential, isSubstantivelyClean } from '../src/lib/forgeQuality';

/**
 * The forge differential must never report a check that did not run.
 *
 * `differential()` returned `available: true` when the REFERENCE implementation
 * hung or errored on EVERY probe, so no comparison was performed at all — and
 * because the quality gate gates on `checked > 0`, a zero-checked report was
 * treated as "substantively clean", which ends sampling early. The net effect was
 * that a candidate which disagreed with its reference oracle was ranked as
 * agreeing with it, and the forge stopped looking.
 *
 * The inconsistency that proves this was a defect rather than a convention: the
 * genuine-error path already used `available: false`, so `available` was always
 * meant to mean "the harness ran".
 */

const INPUT = {
  name: 'gcdPair',
  reference: 'export function gcdPair(a, b) { while (b) { const t = b; b = a % b; a = t; } return a; }',
  suite: '',
} as any;

/** A reference that throws the moment it is called: terminates on nothing. */
const THROWING_REFERENCE = 'export function gcdPair() { throw new Error("reference exploded"); }';

describe('forge differential honesty', () => {
  it('reports available:false when the reference cannot be exercised at all', () => {
    const seeds = [[12, 18], [24, 36], [7, 13], [100, 250]];
    const d = differential({ ...INPUT, reference: THROWING_REFERENCE }, 'export function gcdPair(){}', seeds);

    // Nothing was compared, so the harness did not run.
    expect(d.available).toBe(false);
    expect(d.checked).toBe(0);
    expect(d.agreed).toBe(0);
    expect(d.mismatches.length).toBeGreaterThan(0);
    // The reason must be legible: an operator needs to know it was the REFERENCE
    // that failed, not the candidate.
    expect(d.mismatches.join(' ')).toMatch(/reference/i);
  }, 60_000);

  it('never reports full reference agreement for a comparison that never ran', () => {
    const seeds = [[12, 18], [24, 36]];
    const d = differential({ ...INPUT, reference: THROWING_REFERENCE }, 'export function gcdPair(){}', seeds);
    // The regression shape: `agreed === checked === 0` while `available: true`
    // read as "checked everything, everything agreed".
    expect(d.available).toBe(false);
    expect(d.agreed).not.toBeGreaterThan(0);
  }, 60_000);

  it('a report whose differential never ran is not "substantively clean"', () => {
    const d = differential({ ...INPUT, reference: THROWING_REFERENCE }, 'export function gcdPair(){}', [[12, 18]]);
    const report = {
      score: 1,
      gate: { ok: true },
      differential: d,
      robustness: null,
      static: { hardcodedSuiteLiterals: [] },
    } as any;
    // The regression: `isSubstantivelyClean` gated on `checked > 0`, so a harness
    // that ran zero probes satisfied the guard and the candidate was ranked
    // clean — ending sampling on an unverified implementation.
    expect(isSubstantivelyClean(report)).toBe(false);
  }, 60_000);

  it('still treats a genuinely-run, fully-agreeing differential as clean', () => {
    const report = {
      score: 1,
      gate: { ok: true },
      differential: { available: true, checked: 3, agreed: 3, mismatches: [] },
      robustness: null,
      static: { hardcodedSuiteLiterals: [] },
    } as any;
    // Guard against over-correction: a real, passing differential must NOT be
    // treated as unclean, or every candidate would burn extra paid samples.
    expect(isSubstantivelyClean(report)).toBe(true);
  }, 60_000);
});