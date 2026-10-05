/**
 * A7 â€” incoherence as a one-sided error red flag.
 *
 * The property that makes this worth having: ZERO FALSE POSITIVES in the
 * detecting direction. If samples disagree, something is definitely wrong. That is
 * stronger than any other unsupervised signal available here.
 *
 * These tests therefore assert BOTH directions honestly:
 *   - disagreement must be detected (no false negatives on the flag)
 *   - agreement must NOT be reported as proof of correctness (the one-sided limit)
 */
import { describe, it, expect } from 'vitest';
import { measureIncoherence, shouldInspect, MIN_SAMPLES_FOR_SILENCE } from '../src/lib/incoherence.js';

// Inputs chosen so the two implementations genuinely DIVERGE. Verified against
// BigInt ground truth: 2^100 mod 1000000007 is 976371285 exactly, while the
// double-based loop yields 976371253. The small inputs agree, which is why a
// suite of small assertions cannot see the difference.
const inputs = [[2, 10, 1000], [3, 5, 7], [7, 1, 13], [2, 100, 1000000007], [2, 100, 998244353]];

// The double-based implementation â€” the bug shape this project exists to catch.
const floatImpl = (b: number, e: number, m: number) => {
  let r = 1;
  let x = b % m;
  let n = e;
  while (n > 0) { if (n & 1) r = (r * x) % m; x = (x * x) % m; n >>= 1; }
  return r;
};

// The CORRECT implementation. Must be genuinely different from `floatImpl`, or
// there is no disagreement to detect and the test proves nothing. An earlier
// version of this fixture duplicated the float algorithm with a cosmetic
// `((b % m) + m) % m` change — identical behaviour, so incoherence correctly
// reported 0 and the test failed for the right reason.
const correctImpl = (b: number, e: number, m: number) => {
  // Arbitrary precision: correct where the double version is not.
  let r = 1n % BigInt(m);
  let x = BigInt(b) % BigInt(m);
  let n = BigInt(e);
  while (n > 0n) { if (n & 1n) r = (r * x) % BigInt(m); x = (x * x) % BigInt(m); n >>= 1n; }
  return Number(r);
};

describe('incoherence detects real disagreement', () => {
  it('flags when one sample diverges from the others', () => {
    const r = measureIncoherence('powerMod', {
      samples: [correctImpl, correctImpl, floatImpl],
      inputs: [...inputs, [2, 100, 1000000007]],
    });
    expect(r.flagsError).toBe(true);
    expect(shouldInspect(r)).toBe(true);
    expect(r.incoherence).toBeGreaterThan(0);
    // The disagreeing input is retained: a score is far less useful than a
    // reproducible counterexample.
    expect(r.disagreeingInputs.length).toBeGreaterThan(0);
    expect(Array.isArray(r.disagreeingInputs[0])).toBe(true);
  });

  it('flags when only TWO of many samples disagree', () => {
    const r = measureIncoherence('powerMod', {
      samples: [correctImpl, correctImpl, correctImpl, () => 0],
      inputs,
    });
    expect(r.flagsError).toBe(true);
  });

  it('flags a throw-versus-return disagreement', () => {
    // Returning and throwing are different observable behaviours, so at least one
    // sample is wrong even though both "did something".
    const r = measureIncoherence('x', {
      samples: [
        () => 1,
        () => {
          throw new Error('boom');
        },
      ],
      inputs: [[1]],
    });
    expect(r.flagsError).toBe(true);
    expect(r.note).toMatch(/wrong/i);
  });

  it('flags structural differences, not just scalar ones', () => {
    const r = measureIncoherence('x', {
      samples: [(a: number[]) => a, (a: number[]) => [...a].reverse()],
      inputs: [[1, 2, 3]],
    });
    expect(r.flagsError).toBe(true);
  });
});

describe('incoherence is one-sided, and says so', () => {
  it('does NOT flag when all samples agree â€” and never claims correctness', () => {
    const r = measureIncoherence('powerMod', { samples: [correctImpl, correctImpl, correctImpl], inputs });
    expect(r.flagsError).toBe(false);
    expect(r.incoherence).toBe(0);
    // The important half: agreement must be reported as consistent-with-correct,
    // not as proof. A shared bug is invisible to this method.
    expect(r.note).toMatch(/does NOT prove/i);
  });

  it('a CONSTANT implementation passes silently â€” the known blind spot', () => {
    // Every sample shares the same bug, so nothing disagrees. This is exactly why
    // incoherence is a supplement to the oracle and law checks, never a
    // replacement: a shared defect is invisible here by construction.
    const r = measureIncoherence('powerMod', { samples: [() => 42, () => 42, () => 42], inputs });
    expect(r.flagsError).toBe(false);
    expect(r.note).toMatch(/consistent with correctness/);
  });
});

describe('incoherence refuses to over-claim', () => {
  it('says nothing conclusive with fewer than two samples', () => {
    const r = measureIncoherence('powerMod', { samples: [correctImpl], inputs });
    expect(r.flagsError).toBe(false);
    expect(r.conclusiveWhenSilent).toBe(false);
    expect(r.note).toMatch(/needs >= 2/);
    expect(MIN_SAMPLES_FOR_SILENCE).toBe(2);
  });

  it('says nothing conclusive with no inputs', () => {
    const r = measureIncoherence('powerMod', { samples: [correctImpl, correctImpl], inputs: [] });
    expect(r.flagsError).toBe(false);
    expect(r.note).toMatch(/no inputs/i);
  });

  it('handles an empty sample list without throwing', () => {
    const r = measureIncoherence('x', { samples: [], inputs: [[1]] });
    expect(r.flagsError).toBe(false);
    expect(r.n).toBe(0);
  });

  it('reports how many samples and inputs were actually used', () => {
    const r = measureIncoherence('powerMod', { samples: [correctImpl, floatImpl, correctImpl], inputs });
    expect(r.n).toBe(3);
    expect(r.inputsCompared).toBe(inputs.length);
  });
});