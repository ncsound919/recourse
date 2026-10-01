// src/lib/registryReverify.ts
//
// Re-verify main-registry tool copies that were mirrored out of the dream store.
//
// The problem this fixes: the dream mirror wrote each gene into the registry
// with `passed_verifier: true, promoted: true` and, where it could, a
// `test_suite_code` built by `buildRefSuiteFromVectors`. That suite only
// asserts the function exists and "did not throw" — its own comment says the
// gene has no oracle — so the stored green was a smoke result presented as a
// verifier pass. Worse, boot re-verification runs *any* stored suite and marks
// the tool `healthy` on a pass, so a smoke suite becomes a health claim. On top
// of that the mirrored source was the bare (non-module) form the engine used to
// compile, which the registry substance gate refuses.
//
// What this pass does, and deliberately does not do:
//   - It re-runs the real invariant protocol for the gene kind
//     (`verifyGeneSource`) against the tool's OWN stored source, so the verdict
//     is about this artifact, not about the dream store's copy of it.
//   - It appends a new version in module form with a recomputed hash and the
//     real check results in `verifier_notes`. Old versions keep their own hash.
//   - It does NOT attach a smoke suite and does NOT claim `healthy`. With no
//     semantic oracle for these genes there is nothing for a boot re-verify to
//     run, so the honest state stays `unverified`; the notes say exactly that
//     instead of leaving a claim nothing can reproduce.
//
// Pure: no clock of its own (the caller passes `now`), no filesystem, no I/O,
// and idempotent — re-running it does not append versions forever.

import { createHash } from 'crypto';
import type { ToolEntry, ToolVersion } from '../types';
import type { InvariantCheck } from '../dream/types';
import { geneEntrypointName, geneModuleForm, verifyGeneSource } from '../dream/genomes';

/** What we know about a tool from the dream store, matched by name. */
export interface DreamGeneRef {
  kind: string;
}

export type ReverifyVerdict =
  /** Re-ran the protocol; every check green. */
  | 'verified'
  /** Re-ran the protocol; at least one check red. */
  | 'failed'
  /** No stored source, or a kind the engine cannot verify. */
  | 'unverifiable'
  /** Already carries a stored suite, so a boot re-verify owns this verdict. */
  | 'skipped-has-suite'
  /** Already carries this pass's result for the same source. */
  | 'skipped-already-current';

export interface ReverifyOutcome {
  tool: ToolEntry;
  changed: boolean;
  verdict: ReverifyVerdict;
  checks: InvariantCheck[];
  /** `passed/checks (names of the red ones)`. */
  detail: string;
  /** A fabricated claim on file that this pass REPLACED with a real verdict. */
  withdrewClaim: boolean;
  /** A claim on file that this pass could neither confirm nor replace - it is
   *  still there, and it is still unsupported. */
  unsupportedClaim: boolean;
  /** The current version has no suite, so no boot re-verify can reproduce a verdict. */
  noSuiteOnFile: boolean;
}

export interface ReverifyReport {
  considered: number;
  verified: number;
  failed: number;
  unverifiable: number;
  skippedHasSuite: number;
  skippedAlreadyCurrent: number;
  /** Tools whose current version has no stored suite (the honest gap). */
  noSuiteOnFile: number;
  /** Fabricated `passed_verifier: true` claims this pass replaced with a real
   *  verdict. */
  withdrawnClaims: number;
  /** Claims on file that could neither be confirmed nor replaced. */
  unsupportedClaims: number;
  /** Capped detail list, problems first; the counts above are the real totals. */
  entries: Array<{ name: string; verdict: ReverifyVerdict; detail: string }>;
}

const ENTRY_LIMIT = 40;
const REVERIFIED_MARK = '-reverified.';

function sha16(source: string): string {
  return createHash('sha256').update(source).digest('hex').substring(0, 16);
}

/** The version that describes the tool now: the current one, else the newest
 *  promoted, else the newest. */
export function currentToolVersion(tool: ToolEntry): ToolVersion | undefined {
  const versions = tool.versions ?? [];
  return [...versions].reverse().find((v) => v.version === tool.currentVersion)
    ?? [...versions].reverse().find((v) => v.promoted)
    ?? versions[versions.length - 1];
}

function checkSummary(checks: InvariantCheck[]): string {
  if (!checks.length) return 'no checks ran';
  const passed = checks.filter((c) => c.passed).length;
  const red = checks.filter((c) => !c.passed).map((c) => c.name);
  return `${passed}/${checks.length}${red.length ? ` red: ${red.join(', ')}` : ''}`;
}

/** The source as it would be stored, for identity matching only. */
function moduleFormPreview(source: string): string {
  return geneModuleForm(source);
}

/**
 * Re-verify one tool against its gene kind. Returns the (possibly unchanged)
 * tool plus the verdict. Never throws: a verification problem is a verdict, not
 * an exception, because this runs over the whole registry.
 */
export function reverifyToolAgainstGene(
  tool: ToolEntry,
  gene: DreamGeneRef | undefined,
  now: number = Date.now(),
): ReverifyOutcome {
  const current = currentToolVersion(tool);
  const source = current?.source_code;
  const noSuiteOnFile = !current?.test_suite_code;
  const base = { checks: [] as InvariantCheck[], noSuiteOnFile };
  /** A claim we cannot replace is reported separately from one we withdrew:
   *  counting it as "withdrawn" would overstate what the pass actually did. */
  const unverifiable = (detail: string) => ({
    ...base,
    tool,
    changed: false,
    verdict: 'unverifiable' as const,
    detail,
    withdrewClaim: false,
    unsupportedClaim: current?.passed_verifier === true,
  });

  if (!current || typeof source !== 'string' || !source.trim()) {
    return unverifiable('no stored source on the current version');
  }
  // A tool with a real suite has a verdict boot can reproduce; leave it alone.
  if (!noSuiteOnFile) {
    return { ...base, tool, changed: false, verdict: 'skipped-has-suite', detail: 'current version carries a stored suite', withdrewClaim: false, unsupportedClaim: false };
  }
  if (!gene?.kind) {
    return unverifiable('no gene kind on file to verify against');
  }

  // Identity check before verification: a registry name is a label, and the
  // registry holds tools whose name suggests one gene while their source is a
  // different artifact entirely (TypeScript `LRUCache` classes named
  // `CODI_CYCLOMATIC_*`). Applying a gene's protocol to an artifact that gene
  // never produced would attribute a verdict to the wrong code, so require the
  // source to declare that kind's entrypoint before checking it.
  const entrypoint = geneEntrypointName(gene.kind);
  if (!entrypoint) {
    return unverifiable(`gene kind "${gene.kind}" has no verifiable entrypoint (arbitrary model code?)`);
  }
  if (!new RegExp(`(?:export\\s+)?(?:function|class|const|let|var)\\s+${entrypoint}\\b`).test(moduleFormPreview(source))) {
    return unverifiable(`stored source does not declare ${entrypoint}() — it is not the artifact ${gene.kind} describes`);
  }

  // Verify THIS tool's source (in the form we are about to store), not the
  // dream store's copy of it: the registry artifact is what health describes.
  const moduleSource = geneModuleForm(source);
  const hash = sha16(moduleSource);

  // Idempotence: a prior pass already recorded this verdict for this exact
  // source, so appending another version would grow history without adding
  // evidence.
    if (current.version.includes(REVERIFIED_MARK) && current.hash === hash) {
      return {
        ...base,
        tool,
        changed: false,
        verdict: 'skipped-already-current',
        detail: `already re-verified (${current.passed_verifier ? 'pass' : 'fail'}) for this source`,
        withdrewClaim: false,
        unsupportedClaim: false,
      };
    }

  const result = verifyGeneSource(gene.kind, moduleSource);
  const checks = result.checks ?? [];
  const verified = checks.length > 0 && checks.every((c) => c.passed);
  const score = checks.length ? Math.round((checks.filter((c) => c.passed).length / checks.length) * 100) / 100 : 0;

  const notes = [
    `RE-VERIFIED ${verified ? 'PASS' : 'FAIL'}: ${checkSummary(checks)} via the ${gene.kind} invariant protocol (${checks.map((c) => c.name).join(', ') || 'none'}).`,
    verified
      ? 'No semantic suite exists for this gene (its vectors only prove it runs), so no test_suite_code is stored and registry health stays `unverified` instead of claiming a pass a boot re-verify cannot reproduce.'
      : 'The patched artifact is not promoted; the previous version stays current for promotion purposes.',
  ].join(' ');

  const version: ToolVersion = {
    version: `${current.version}${REVERIFIED_MARK}${now.toString().slice(-6)}`,
    hash,
    created_at: now,
    passed_verifier: verified,
    score,
    promoted: verified,
    verifier_notes: notes,
    source_code: moduleSource,
  };

  return {
    tool: {
      ...tool,
      versions: [...(tool.versions ?? []), version],
      currentVersion: version.version,
      // Honest: a verified artifact with no reproducible suite is not health,
      // and a failed re-check is a defect even without a suite on file.
      healthStatus: verified ? 'unverified' : 'degraded',
    },
    changed: true,
    verdict: verified ? 'verified' : 'failed',
    checks,
    detail: checkSummary(checks),
    withdrewClaim: current.passed_verifier === true,
    unsupportedClaim: false,
    noSuiteOnFile,
  };
}

export interface ReverifyAllResult {
  tools: ToolEntry[];
  report: ReverifyReport;
}

/** Detail-list priority: a failure outranks an unverifiable, which outranks a
 *  skip, which outranks a success. Without this, 1,124 successes fill the cap
 *  and the one genuine failure is what an operator never sees. */
function detailRank(verdict: ReverifyVerdict): number {
  switch (verdict) {
    case 'failed': return 0;
    case 'unverifiable': return 1;
    case 'skipped-has-suite': return 2;
    case 'skipped-already-current': return 3;
    case 'verified': return 4;
  }
}

/** Verdict -> report counter. Explicit rather than `verdict in tally`: the
 *  verdict strings are kebab-case and the report fields camelCase, and a
 *  mismatched key lookup would silently count nothing. */
function counterFor(verdict: ReverifyVerdict): keyof Omit<ReverifyReport, 'considered' | 'noSuiteOnFile' | 'withdrawnClaims' | 'entries'> {
  switch (verdict) {
    case 'verified': return 'verified';
    case 'failed': return 'failed';
    case 'unverifiable': return 'unverifiable';
    case 'skipped-has-suite': return 'skippedHasSuite';
    case 'skipped-already-current': return 'skippedAlreadyCurrent';
  }
}

/**
 * Re-verify a whole registry against dream-store gene references keyed by tool
 * name. Tools with no matching gene cannot be checked and are left untouched.
 */
export function reverifyRegistry(
  tools: ToolEntry[],
  geneByName: Map<string, DreamGeneRef>,
  now: number = Date.now(),
): ReverifyAllResult {
  const tally = { verified: 0, failed: 0, unverifiable: 0, skippedHasSuite: 0, skippedAlreadyCurrent: 0 };
  let noSuiteOnFile = 0;
  let withdrawnClaims = 0;
  let unsupportedClaims = 0;
  // Ranked buckets so a capped list can never hide a failure behind successes.
  type Detail = ReverifyReport['entries'][number];
  const buckets: Detail[][] = [[], [], [], [], []];

  const next = tools.map((tool) => {
    const outcome = reverifyToolAgainstGene(tool, geneByName.get(tool.name), now);
    if (outcome.noSuiteOnFile) noSuiteOnFile += 1;
    if (outcome.withdrewClaim) withdrawnClaims += 1;
    if (outcome.unsupportedClaim) unsupportedClaims += 1;
    tally[counterFor(outcome.verdict)] += 1;
    const bucket = buckets[detailRank(outcome.verdict)];
    if (bucket.length < ENTRY_LIMIT) {
      bucket.push({ name: tool.name, verdict: outcome.verdict, detail: outcome.detail });
    }
    return outcome.tool;
  });

  const ranked = buckets.flat();

  return {
    tools: next,
    report: {
      considered: tools.length,
      ...tally,
      noSuiteOnFile,
      withdrawnClaims,
      unsupportedClaims,
      entries: ranked,
    },
  };
}
