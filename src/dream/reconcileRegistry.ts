// src/dream/reconcileRegistry.ts
//
// Re-verify the dream registry against today's verifier.
//
// Why this exists: `promote()` used to write `verified: true` as a literal, so
// a gene that was never re-checked kept claiming verification forever. The
// promotion path is now honest (it records the real checks), but the ~1,133
// genes crystallized before that fix are still stored with a claim nothing
// backs: no `export` in their code, no test vectors, and one model-derived
// gene whose own stored check is red.
//
// The policy is deliberately narrow:
//   - `verified` is never taken from the stored value. It is recomputed from a
//     real sandbox run of the stored code, and is true only when at least one
//     check exists and every check is green.
//   - a gene whose kind the engine knows is re-verified with that kind's own
//     invariant protocol (the same checks `verifyGenome` runs).
//   - a gene the engine cannot verify (unknown kind, or arbitrary model code
//     with no stored test suite) is marked NOT verified with the reason
//     recorded. Downgrading is the honest answer; leaving the claim would not
//     be.
//   - `code` is rewritten to module form (a pure `export` prefix) and
//     `testVectors` are restored from the kind, so a gene that genuinely
//     verifies can still clear the registry substance gate and be scored by
//     property tests downstream.
//
// Pure: it takes a registry and returns a new one plus a report. Persistence
// and locking belong to the caller.

import type { CrystallizedTool, InvariantCheck } from './types';
import {
  geneModuleForm,
  geneVectorsForKind,
  isKnownGeneKind,
  verifyGeneSource,
} from './genomes';

export interface ReconcileEntry {
  name: string;
  kind: string;
  wasVerified: boolean;
  nowVerified: boolean;
  checksPassed: number;
  checksTotal: number;
  /** Why the verdict is what it is, e.g. `3/7 invariants hold`. */
  reason: string;
}

export interface ReconcileReport {
  total: number;
  /** Genes that were actually re-run through a verifier. */
  reverified: number;
  /** Re-checked and still fully green. */
  stillVerified: number;
  /** Re-checked and no longer green. */
  failed: number;
  /** Were claiming verification and no longer can - the honest headline. Spans
   *  both `failed` and `unverifiable`, because withdrawing a claim that cannot
   *  even be re-checked is still a withdrawal. */
  downgraded: number;
  /** Were not verified and now genuinely are. */
  upgraded: number;
  /** Could not be checked at all (unknown kind, no code, model code with no
   *  stored suite). Orthogonal to the verdicts. */
  unverifiable: number;
  codeRewrittenToModuleForm: number;
  vectorsRestored: number;
  /** Capped detail list; the counts above are the real totals. */
  entries: ReconcileEntry[];
}

const DETAIL_LIMIT = 40;

function reconcileOne(tool: CrystallizedTool): { tool: CrystallizedTool; entry: ReconcileEntry } {
  const code = typeof tool.code === 'string' ? tool.code : '';
  const kind = tool.kind || '';
  const wasVerified = tool.verified === true;

  // What can be honestly re-checked: a rule-based gene, whose kind determines
  // both the invariant inputs and the semantic checks. Model-derived code has no
  // stored suite to run, so its claim cannot be re-confirmed either way.
  const verifiable = code.trim().length > 0 && isKnownGeneKind(kind);
  if (!verifiable) {
    const reason = !code.trim()
      ? 'no stored code to verify'
      : kind === 'model_hypothesis'
        ? 'model-derived code with no stored test suite — cannot be re-verified'
        : `unknown gene kind "${kind}"`;
    return {
      tool: { ...tool, verified: false },
      entry: { name: tool.name, kind, wasVerified, nowVerified: false, checksPassed: 0, checksTotal: 0, reason },
    };
  }

  const result = verifyGeneSource(kind, code);
  const checks: InvariantCheck[] = result.checks ?? [];
  const checksPassed = checks.filter((c) => c.passed).length;
  const nowVerified = checks.length > 0 && checksPassed === checks.length;

  const moduleCode = geneModuleForm(code);
  const vectors = geneVectorsForKind(kind);

  return {
    tool: {
      ...tool,
      code: moduleCode,
      verified: nowVerified,
      invariantChecks: checks,
      testVectors: vectors.length ? vectors : tool.testVectors,
    },
    entry: {
      name: tool.name,
      kind,
      wasVerified,
      nowVerified,
      checksPassed,
      checksTotal: checks.length,
      reason: result.summary,
    },
  };
}

/**
 * Re-verify every gene in a dream registry. Returns the corrected registry and
 * an honest report; entries that were already correct come back untouched in
 * substance (their code/vectors are still normalized, which is idempotent).
 */
export function reconcileDreamRegistry(
  registry: CrystallizedTool[],
): { registry: CrystallizedTool[]; report: ReconcileReport } {
  const entries: ReconcileEntry[] = [];
  let downgraded = 0;
  let upgraded = 0;
  let stillVerified = 0;
  let failed = 0;
  let unverifiable = 0;
  let codeRewritten = 0;
  let vectorsRestored = 0;

  const next = registry.map((tool) => {
    const { tool: fixed, entry } = reconcileOne(tool);
    // `unverifiable` says what could be checked; `downgraded` says how many
    // existing claims were withdrawn. A gene that claimed verification and
    // cannot be re-checked is BOTH - counting it only as unverifiable would
    // hide the withdrawal behind a softer-sounding number.
    if (entry.checksTotal === 0) unverifiable += 1;
    else if (entry.nowVerified) {
      if (entry.wasVerified) stillVerified += 1;
      else upgraded += 1;
    } else failed += 1;
    if (entry.wasVerified && !entry.nowVerified) downgraded += 1;

    if (fixed.code !== tool.code) codeRewritten += 1;
    if (!tool.testVectors?.length && fixed.testVectors?.length) vectorsRestored += 1;
    if (entries.length < DETAIL_LIMIT) entries.push(entry);
    return fixed;
  });

  return {
    registry: next,
    report: {
      total: registry.length,
      reverified: registry.length - unverifiable,
      stillVerified,
      failed,
      downgraded,
      upgraded,
      unverifiable,
      codeRewrittenToModuleForm: codeRewritten,
      vectorsRestored,
      entries,
    },
  };
}
