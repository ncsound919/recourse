/**
 * Problem generator (Phase 3 #10).
 *
 * The dream engine emits hypotheses; to be "open-ended" it must also emit
 * problems with a machine-checkable acceptance test. Generating brand-new,
 * genuinely novel problems still needs a model — but there is a real, honest
 * class of problems Recourse can produce *without a model, today*: turning an
 * already-verified capability into a benchmark problem ("reproduce this
 * capability"). Each verified tool already ships a real test suite that proves
 * its own behavior — that suite IS a perfect, machine-checkable acceptance test
 * for a solver aiming to reproduce the capability.
 *
 * Honesty contract:
 *  - `problemFromVerifiedTool` does not invent requirements. The acceptance test
 *    is the tool's own verified suite, verbatim. A solver passes iff it
 *    re-derives behavior that satisfies a known-green suite.
 *  - The problem's source is NOT embedded as the answer; only the suite (the
 *    spec) becomes the acceptance test.
 *  - Model-generated novelty (dream -> brand-new problems) is a separate,
 *    follow-up wiring step; nothing here fakes novelty.
 */

import type { RecourseProblem } from './problemArchive.js';
import { jaccard } from './novelty.js';

export interface VerifiedToolLike {
  name: string;
  domain: string;
  description?: string;
  /** the tool's real, verified test suite (the spec to satisfy) */
  suite?: string;
}

export function safeProblemId(name: string, prefix = 'problem:repro'): string {
  const safe = String(name).replace(/[^a-zA-Z0-9_-]/g, '_') || 'unnamed';
  return `${prefix}:${safe}`;
}

/** Build a reproduce-the-capability problem from an already-verified tool. */
export function problemFromVerifiedTool(tool: VerifiedToolLike): RecourseProblem | null {
  if (!tool.suite || tool.suite.trim().length === 0) return null;
  const suite = tool.suite;
  const title = `Reproduce: ${tool.name}`;
  const statement =
    `Implement a capability that satisfies the acceptance criteria for "${tool.name}" ` +
    `(${tool.domain}). The criteria below are a real test suite that must pass against ` +
    `your implementation. Do not embed the reference solution; satisfy the spec.`;
  return {
    id: safeProblemId(tool.name),
    domain: tool.domain,
    title,
    statement,
    acceptanceTest: suite,
    hints: {
      requiredPrimitives: 1,
      acceptanceLines: suite.split('\n').length,
      dataDims: 1,
    },
  };
}

/** Seed an archive with one problem per verified tool that has a suite. Returns
 *  a summary; tools without a suite are skipped (never given a fake spec). */
export function seedArchiveFromVerifiedTools(
  archive: { add(p: RecourseProblem): { added: boolean; duplicateOf: string | null } },
  tools: VerifiedToolLike[],
): { added: number; skippedNoSuite: number; duplicates: number } {
  let added = 0;
  let skippedNoSuite = 0;
  let duplicates = 0;
  for (const t of tools) {
    const p = problemFromVerifiedTool(t);
    if (!p) { skippedNoSuite += 1; continue; }
    const res = archive.add(p);
    if (res.added) added += 1;
    else duplicates += 1;
  }
  return { added, skippedNoSuite, duplicates };
}

/** Near-duplicate check between a proposed problem title and existing ones. */
export function resemblesProblem(existing: Array<{ title: string }>, title: string, threshold = 0.7): boolean {
  for (const e of existing) {
    if (jaccard(e.title, title) >= threshold) return true;
  }
  return false;
}
