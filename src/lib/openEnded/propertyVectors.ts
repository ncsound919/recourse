// src/lib/openEnded/propertyVectors.ts
//
// Property-gate input shapes for a minted problem.
//
// Why this exists: the shapes used to be guessed from the *text* of the
// problem's export name (`/arr|list|merge|.../ ` -> array samples). That made
// scoring depend on what a function happened to be called: renaming `chunk` to
// `sliceInto` silently changed which invariants were enforced, and a name that
// matched no pattern fell through to numeric samples for a string/array
// problem. A name is a label, not a contract.
//
// Shapes are therefore taken only from what the problem actually declares:
//   1. `vectors` the minting model supplied, or
//   2. the sample calls in the problem's own acceptance test (its contract),
//   3. otherwise null — "unknown shapes", not a guess.
//
// Returning null is meaningful: the caller runs the property gate only when
// shapes exist, so an undeclared problem simply runs without the universal
// invariants instead of being failed by fabricated inputs.

import { suiteVectors } from '../forgeQuality.js';

export interface PropertyVectorProblem {
  /** Required export name. Used only as a call *key* into the acceptance
   *  test — never inspected for meaning. */
  functionName: string;
  /** Sample argument lists supplied at mint time, when present. */
  vectors?: unknown[];
  /** The problem's acceptance test — its machine-checkable contract. */
  acceptanceTest?: string;
}

/**
 * Sample argument lists for the property gate, or null when the problem
 * declares no shapes. Renaming a problem (function name, title, domain) leaves
 * the result unchanged.
 */
export function propertyVectorsForProblem(problem: PropertyVectorProblem): unknown[] | null {
  const declared = Array.isArray(problem.vectors) ? problem.vectors : [];
  if (declared.length) return declared;

  const suite = typeof problem.acceptanceTest === 'string' ? problem.acceptanceTest : '';
  if (suite.trim() && problem.functionName) {
    const fromContract = suiteVectors(suite, problem.functionName);
    if (fromContract.length) return fromContract;
  }

  return null;
}
