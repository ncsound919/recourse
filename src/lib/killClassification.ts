/**
 * killClassification.ts — A5 (classify kills) and A3 (preserve failing inputs).
 *
 * WHY (A5)
 * ISSTA 2023 measured, over 50,000 mutants and 2.5M test runs, that **up to 43.8%
 * of killed mutants died from CRASHES rather than assertion failures**, and that
 * test oracles contributed as little as 11.8% of failures for some subjects. A
 * crash-kill is a weaker signal than a score implies: the mutant may have died for
 * an unrelated reason (a TypeError three lines later) rather than because the test
 * noticed a wrong value.
 *
 * That exact shape occurred here: the forged `exponentialBackoffMs` returned
 * `null`, so arithmetic on its result threw a TypeError one line later. It was
 * "caught" — but by a crash, not by observing the wrong value.
 *
 * WHY (A3)
 * The research found LLMs generate inputs that DISCRIMINATE faulty from correct
 * behaviour 25-78% of the time, but assert the correct behaviour only 0-10% of the
 * time. So when a probe disagrees, the INPUT is the valuable artefact and must
 * survive even when the assertion that surfaced it is discarded. This module
 * returns inputs as first-class records for exactly that reason.
 *
 * HONESTY CONTRACT
 * Classification is CONSERVATIVE. An unrecognised shape is `other`, never
 * `assertion`: overstating the strength of evidence is the error this exists to
 * prevent. And `passed === true` yields zero artefacts — otherwise "keep the
 * inputs" degenerates into an ever-growing pile of noise.
 */

/** How a probe run failed. */
export type KillKind =
  /** The assertion ran and reported a wrong value. The strongest signal. */
  | 'assertion'
  /** The code threw. Detects a defect, but not necessarily the intended one. */
  | 'crash'
  /** The run exceeded its time budget. Says nothing about correctness. */
  | 'timeout'
  /** Compilation failed, or the shape was not recognised. */
  | 'other';

export interface FailureArtefact {
  kind: KillKind;
  /**
   * The failing assertion or diagnostic, VERBATIM. Retained because it is the
   * discriminating input: the research found inputs are what the pipeline produces
   * reliably, and they are what a later differential pass can reuse.
   */
  detail: string;
  /** True when this failure genuinely distinguishes faulty from correct behaviour. */
  discriminating: boolean;
}

/** Fields we read off a sandbox run. Structural so it works for both runners. */
export interface SuiteRunLike {
  passed: boolean;
  testDetails?: string[];
  stderr?: string[];
  stdout?: string[];
}

const TIMEOUT = /timed out|timeout|exceeded/i;
const CRASH =
  /uncaught|aborted with|\bthrow\b|is not a function|is not defined|cannot read|undefined is not|stack overflow|out of memory/i;
const COMPILE = /compilation error|syntaxerror|unexpected token/i;
/** The sandbox's own assertion-failure prefix, e.g. `[FAIL] assert ... -> non-true (3)`. */
const ASSERT_FAIL = /^\[FAIL\]/;
const PASS = /^\[PASS\]|static syntax analysis passed/i;

/**
 * Classify ONE diagnostic line.
 *
 * `stderrLine` is the surrounding stderr, because a thrown error can surface
 * either as its own detail entry or on stderr, and both must classify the same.
 */
export function classifyFailure(detail: string, stderrLine = ''): FailureArtefact {
  const text = `${detail ?? ''} ${stderrLine ?? ''}`.trim();

  if (!text) return { kind: 'other', detail: '', discriminating: false };

  if (TIMEOUT.test(text)) {
    // A timeout is not evidence of a wrong value. Recording it as an assertion
    // failure would let a slow-but-correct tool be reported as buggy.
    return { kind: 'timeout', detail, discriminating: false };
  }

  if (CRASH.test(text)) {
    // Detects A defect, but the defect it detected may not be the one the test
    // was written about. Flagged as non-discriminating so it can be weighted.
    return { kind: 'crash', detail, discriminating: true };
  }

  if (COMPILE.test(text)) {
    return { kind: 'other', detail, discriminating: false };
  }

  if (ASSERT_FAIL.test(text.trim())) {
    // The assertion executed and returned a non-true value: the strongest signal,
    // because the suite observed the wrong answer directly.
    return { kind: 'assertion', detail, discriminating: true };
  }

  // Unknown shape. `other`, never `assertion`.
  return { kind: 'other', detail, discriminating: false };
}

/** Every failure in a run, classified. A passing run yields an empty array. */
export function classifyFailures(run: SuiteRunLike): FailureArtefact[] {
  if (run?.passed) return [];
  const out: FailureArtefact[] = [];
  for (const d of run?.testDetails ?? []) {
    if (PASS.test(d)) continue;
    out.push(classifyFailure(d));
  }
  for (const e of run?.stderr ?? []) {
    // stderr entries are only interesting when something actually failed.
    if ((run?.testDetails ?? []).length === 0 || !out.length) out.push(classifyFailure(e, e));
  }
  return out;
}

export interface KillSummary {
  total: number;
  /** Wrong value observed by an assertion. The signal that actually matters. */
  assertions: number;
  /** Threw. Real defect, possibly not the intended one. */
  crashes: number;
  timeouts: number;
  other: number;
  /**
   * Share of failures that were genuine assertion failures. Low values mean the
   * suite is mostly detecting crashes, which inflates any raw "tests passed"
   * style score built on it.
   */
  assertionShare: number;
}

export function summarizeKills(run: SuiteRunLike): KillSummary {
  const all = classifyFailures(run);
  const count = (k: KillKind) => all.filter((a) => a.kind === k).length;
  const assertions = count('assertion');
  const crashes = count('crash');
  const timeouts = count('timeout');
  const other = count('other');
  const total = all.length;
  return {
    total,
    assertions,
    crashes,
    timeouts,
    other,
    assertionShare: total === 0 ? 0 : Math.round((assertions / total) * 1000) / 1000,
  };
}