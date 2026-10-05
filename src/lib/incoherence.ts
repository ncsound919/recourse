/**
 * incoherence.ts — A7: the only verification signal here with a proof behind it.
 *
 * WHAT IT IS
 * Sample the same spec from a generator N times. On a set of inputs, ask how often
 * two independent samples DISAGREE. That rate is `incoherence`.
 *
 * WHY IT MATTERS HERE
 * The published theorem is `Inc(d) <= 2 * Err(d)`: if two implementations of the
 * same specification disagree on input X, at least one of them is wrong. So
 * incoherence is a **sound certificate that something is wrong, with zero false
 * positives by construction** — if the error rate is zero, incoherence must also be
 * zero. Every other unsupervised proxy in this system (mutation score, coverage,
 * self-consistency, ensemble agreement) can flag uncertainty even when outputs are
 * correct; this one cannot.
 *
 * WHY IT IS ONLY A RED FLAG HERE
 * Three limits, all measured in the source work, all respected by this API:
 *   1. It is a DETECTOR, not a verifier. Agreement across samples is consistent
 *      with a shared bug — a defect every sample makes is invisible to it.
 *   2. Resolution must never be by majority vote. Variants can inherit the same
 *      bugs, so the DISSENTING variant deserves more trust, not less.
 *   3. Per-task correlation between incoherence and error MAGNITUDE is moderate
 *      (0.56-0.69) even though detection of non-zero error is strong. So a
 *      non-zero reading means "go and look", not "this tool is this broken".
 *
 * Consequently nothing here auto-rejects a candidate. `incoherenceVerdict` returns
 * an ADVISORY with the evidence attached, and the caller decides.
 */

export interface IncoherenceSample {
  /** Distinct implementations of the same spec, from independent generations. */
  samples: Array<(...args: any[]) => any>;
  /** Inputs to compare on. Must be discriminating; random noise proves nothing. */
  inputs: unknown[][];
}

export interface IncoherenceResult {
  /** Tools covered by this module, for honest reporting. */
  tool: string;
  /** Samples actually used. */
  n: number;
  /** Inputs actually compared. */
  inputsCompared: number;
  /** Fraction of input-comparisons where some pair disagreed, in [0,1]. */
  incoherence: number;
  /**
   * Inputs on which samples disagreed. THE ARTEFACT: a concrete, reproducible
   * counterexample, which is far more actionable than a score.
   */
  disagreeingInputs: unknown[][];
  /** TRUE means disagreement was observed, so at least one sample is wrong. */
  flagsError: boolean;
  /**
   * Always true when `flagsError` is false AND the sample count is adequate. The
   * guarantee is one-sided: agreement is evidence of absence only if the samples
   * were genuinely independent attempts.
   */
  conclusiveWhenSilent: boolean;
  note: string;
}

/** Minimum samples before "no disagreement" means anything at all. */
export const MIN_SAMPLES_FOR_SILENCE = 2;

function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) && Number.isNaN(b)) return true;
    return Object.is(a, b);
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  }
  if (a instanceof Uint8Array && b instanceof Uint8Array) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => sameValue((a as any)[k], (b as any)[k]));
  }
  return Object.is(a, b);
}

/**
 * Measure behavioural disagreement between independent implementations.
 *
 * Returns an ADVISORY. Never throws on a bad sample: a sample that throws on an
 * input is treated as DISAGREEING with any sample that returns, because returning
 * and throwing are different observable behaviours and at least one is wrong.
 */
export function measureIncoherence(tool: string, input: IncoherenceSample): IncoherenceResult {
  const samples = input.samples ?? [];
  const inputs = input.inputs ?? [];
  const n = samples.length;

  if (n < MIN_SAMPLES_FOR_SILENCE || inputs.length === 0) {
    return {
      tool,
      n,
      inputsCompared: 0,
      incoherence: 0,
      disagreeingInputs: [],
      flagsError: false,
      conclusiveWhenSilent: false,
      note:
        n < MIN_SAMPLES_FOR_SILENCE
          ? `needs >= ${MIN_SAMPLES_FOR_SILENCE} independent samples to say anything; got ${n}`
          : 'no inputs supplied, so nothing was compared',
    };
  }

  const disagreeingInputs: unknown[][] = [];
  let comparisons = 0;

  for (const args of inputs) {
    const outputs: Array<{ ok: boolean; value: unknown }> = [];
    for (const s of samples) {
      try {
        outputs.push({ ok: true, value: s(...args) });
      } catch {
        outputs.push({ ok: false, value: undefined });
      }
    }
    comparisons++;
    // Any pair differing — including a throw-versus-return pair — means at least
    // one sample is wrong.
    let disagreed = false;
    for (let i = 0; i < outputs.length && !disagreed; i++) {
      for (let j = i + 1; j < outputs.length && !disagreed; j++) {
        if (outputs[i].ok !== outputs[j].ok || !sameValue(outputs[i].value, outputs[j].value)) disagreed = true;
      }
    }
    if (disagreed) disagreeingInputs.push(args);
  }

  const incoherence = comparisons === 0 ? 0 : Math.round((disagreeingInputs.length / comparisons) * 1000) / 1000;
  const flagsError = disagreeingInputs.length > 0;

  return {
    tool,
    n,
    inputsCompared: comparisons,
    incoherence,
    disagreeingInputs,
    flagsError,
    // Sound in one direction only: disagreement PROVES an error exists;
    // agreement proves nothing beyond "no error on these inputs, from these
    // samples".
    conclusiveWhenSilent: true,
    note: flagsError
      ? `${disagreeingInputs.length}/${comparisons} inputs had disagreeing samples — at least one sample is wrong (sound, zero false positives)`
      : `all ${n} samples agreed on ${comparisons} inputs; this is consistent with correctness but does NOT prove it (a shared bug is invisible here)`,
  };
}

/** Convenience: true only when disagreement was actually observed. */
export function shouldInspect(result: IncoherenceResult): boolean {
  return result.flagsError;
}