/**
 * Open-Ended Capability Engine — the orchestrator.
 *
 * One cycle:
 *   1. MINT   — if the archive is short of unsolved problems, ask the model for
 *               new ones (each admitted only when its hidden reference passes
 *               its own acceptance test in the sandbox).
 *   2. PICK   — curriculum-select the next unsolved problem from learner beliefs.
 *   3. RECALL — pull top-k similar prior solutions from durable memory
 *               (`inspirationCrossover`) so cross-run knowledge transfers.
 *   4. SOLVE  — the injected solver produces source (model or forge); the cycle
 *               then runs, in order:
 *                 novelty gate  (near-duplicate rejection)
 *                 property gate (Totality/Determinism/Purity/FiniteOutputs)
 *                 acceptance    (the problem's real machine-checkable suite)
 *               A solution is "solved" only when all configured gates pass.
 *   5. LEARN  — record the real outcome on the archive; the caller folds the
 *               reward into the recursive learner.
 *
 * Every side effect is injected (mint drafter, solver, verifier, memory), so the
 * whole cycle is unit-testable with no model, no filesystem, and no sandbox.
 * The result reports exactly which gates ran and what they returned — never a
 * fabricated improvement.
 */

import type { BeliefLike } from '../problemArchive.js';
import type { MemoryItem } from '../inspirationCrossover.js';
import { inspire } from '../inspirationCrossover.js';
import { canonicalToolKey, noveltyVerdict, propertyGate } from './gates.js';
import { mintProblems, problemIsSolvable, type MintVerifyResult, type MintedRejection } from './problemMint.js';
import type { ArchivedProblem, OpenEndedArchive } from './archive.js';

export interface OpenEndedMintConfig {
  context: string;
  count: number;
  draft: (system: string, user: string) => Promise<string>;
  verify: (source: string, suite: string) => MintVerifyResult;
}

export interface SolverResult {
  ok: boolean;
  source?: string;
  detail: string;
}

export interface OpenEndedDeps {
  archive: OpenEndedArchive;
  beliefs: BeliefLike[];
  knownDomains?: string[];
  /** Only mint when unsolved problems drop below this. Default 5. */
  minUnsolved?: number;
  /** Bounded retries when a mint round admits nothing (model JSON/self-consistency
   *  failures are transient — one bad roll must not stall the cycle). Default 3. */
  maxMintRounds?: number;
  /** Problems requested per mint round. Defaults to what the archive needs. */
  mintBatch?: number;
  mint?: OpenEndedMintConfig;
  /** Required: produces candidate source for a problem. */
  solver: (problem: ArchivedProblem, inspirationHint: string) => Promise<SolverResult>;
  /** Required: the real sandbox verifier for the acceptance test. */
  verify: (source: string, suite: string) => MintVerifyResult;
  /** Optional bounded retry that sees the previous failure. */
  refine?: (problem: ArchivedProblem, priorSource: string, failure: string, inspirationHint: string) => Promise<SolverResult>;
  maxSolveAttempts?: number;
  memory?: MemoryItem[];
  /** Inputs for the property gate; when absent the gate is reported unavailable. */
  propertyVectorsFor?: (problem: ArchivedProblem) => unknown[] | null;
  propertyRuns?: number;
  /** Extra texts (e.g. injected tools) the solution must not duplicate. */
  noveltyPool?: string[];
  noveltyThreshold?: number;
}

export interface OpenEndedCycleResult {
  minted: number;
  mintRejected: number;
  /** Honest reasons the drafter's problems were refused (parse/unsafe/unsatisfiable). */
  mintRejections?: MintedRejection[];
  picked: { id: string; title: string; domain: string } | null;
  inspirationHits: number;
  solved: boolean;
  source?: string;
  reason?: string;
  novelty?: { novel: boolean; bestScore: number; mostSimilar: string | null };
  property?: { passed: boolean; available: boolean; score: number; enforced?: boolean };
  acceptance?: { passed: boolean; detail?: string };
  archive: ReturnType<OpenEndedArchive['snapshot']>;
  steps: string[];
}

function failureDetail(v: MintVerifyResult): string {
  return (v.testDetails ?? []).filter((d) => d.startsWith('[FAIL') || d.startsWith('[COMPILATION')).slice(0, 3).join('; ');
}

export async function runOpenEndedCycle(deps: OpenEndedDeps): Promise<OpenEndedCycleResult> {
  const steps: string[] = [];
  const archive = deps.archive;
  const minUnsolved = deps.minUnsolved ?? 5;
  let minted = 0;
  let mintRejected = 0;
  let mintRejections: MintedRejection[] = [];

  // 1. MINT (retry a few rounds: a model that emits one self-inconsistent
  //    reference must not leave the archive empty and stall the whole cycle).
  if (deps.mint && archive.unsolved().length < minUnsolved) {
    const rounds = Math.max(1, deps.maxMintRounds ?? 3);
    for (let round = 1; round <= rounds; round++) {
      if (archive.unsolved().length >= minUnsolved) break;
      const need = Math.max(1, minUnsolved - archive.unsolved().length);
      const res = await mintProblems({
        context: deps.mint.context,
        count: Math.max(need, deps.mintBatch ?? need),
        draft: deps.mint.draft,
        verify: deps.mint.verify,
        knownTitles: archive.list().map((p) => p.title),
      });
      const added = archive.addAll(res.minted);
      minted += added.added;
      mintRejected += res.rejected.length + added.duplicates;
      mintRejections.push(...res.rejected);
      steps.push(`mint[${round}]: +${added.added} (${res.rejected.length} rejected, ${added.duplicates} dup)`);
      if (added.added > 0) break;
    }
  } else {
    steps.push('mint: skipped (archive sufficient)');
  }

  // 2. PICK
  const picked = archive.nextByCurriculum(deps.beliefs, deps.knownDomains ?? []);
  if (!picked) {
    steps.push('pick: no unsolved problem');
    return {
      minted,
      mintRejected,
      ...(mintRejections.length ? { mintRejections } : {}),
      picked: null,
      inspirationHits: 0,
      solved: false,
      reason: 'archive empty',
      archive: archive.snapshot(),
      steps,
    };
  }
  steps.push(`pick: ${picked.id} (${picked.domain})`);

  // Re-prove the problem is solvable before chasing it.
  if (!problemIsSolvable(picked, deps.verify)) {
    archive.markAttempt(picked.id, false);
    steps.push('guard: stored reference no longer passes its acceptance test — skipped');
    return {
      minted,
      mintRejected,
      ...(mintRejections.length ? { mintRejections } : {}),
      picked: { id: picked.id, title: picked.title, domain: picked.domain },
      inspirationHits: 0,
      solved: false,
      reason: 'problem not provably solvable',
      acceptance: { passed: false, detail: 'reference failed acceptance re-check' },
      archive: archive.snapshot(),
      steps,
    };
  }

  // 3. RECALL
  let inspirationHint = `${picked.statement}\n\nRequired export: ${picked.functionName}.`;
  let inspirationHits = 0;
  if (deps.memory && deps.memory.length) {
    const inspiration = inspire(`${picked.title} ${picked.statement}`, deps.memory, { k: 3, threshold: 0.2 });
    inspirationHits = inspiration.hits.length;
    inspirationHint = inspiration.promptHint + `\n\nRequired export: ${picked.functionName}.`;
    steps.push(`recall: ${inspirationHits} inspiration hit(s)`);
  } else {
    steps.push('recall: no memory');
  }

  // 4. SOLVE
  const maxAttempts = Math.max(1, deps.maxSolveAttempts ?? 1);
  const pool = [...archive.noveltyPool(), ...(deps.noveltyPool ?? [])];
  let lastFailure = '';
  let lastSource = '';

  // Property gate inputs + whether the invariant gate is meaningful for THIS
  // problem. If the hidden reference cannot satisfy the universal invariants
  // under the inferred shapes, enforcing them would be a false negative against
  // any correct solution — so the gate becomes advisory.
  const vectors = deps.propertyVectorsFor?.(picked) ?? picked.vectors ?? null;
  let enforceProperty = true;
  if (vectors && vectors.length) {
    const baseline = propertyGate(picked.referenceSource, vectors, undefined, deps.propertyRuns ?? 50, picked.functionName);
    if (baseline.available && !baseline.passed) {
      enforceProperty = false;
      steps.push('property: hidden reference fails invariants under inferred inputs — gate advisory');
    }
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const solverRes =
      attempt > 1 && deps.refine
        ? await deps.refine(picked, lastSource, lastFailure, inspirationHint)
        : await deps.solver(picked, inspirationHint);

    if (!solverRes.ok || !solverRes.source) {
      lastFailure = solverRes.detail || 'solver produced no source';
      steps.push(`solve[${attempt}]: ${lastFailure}`);
      continue;
    }
    lastSource = solverRes.source;

    // 4a. novelty gate
    const novelty = noveltyVerdict(`${picked.title} ${solverRes.source}`, pool, deps.noveltyThreshold ?? 0.85);
    if (!novelty.novel) {
      lastFailure = `near-duplicate of existing candidate (score ${novelty.bestScore})`;
      steps.push(`gate-novelty[${attempt}]: rejected (${lastFailure})`);
      continue;
    }

    // 4b. property gate (enforced only when the hidden oracle passes it)
    const prop = vectors && vectors.length ? propertyGate(solverRes.source, vectors, undefined, deps.propertyRuns ?? 50, picked.functionName) : null;
    if (prop && prop.available && !prop.passed && enforceProperty) {
      const failing = prop.report.properties.filter((p) => !p.passed).map((p) => p.name).join(',');
      lastFailure = `property gate failed: ${failing}`;
      steps.push(`gate-property[${attempt}]: ${lastFailure}`);
      continue;
    }
    if (prop && prop.available && !prop.passed && !enforceProperty) {
      steps.push(`gate-property[${attempt}]: advisory failure (not enforced)`);
    }

    // 4c. acceptance test
    const accept = deps.verify(solverRes.source, picked.acceptanceTest);
    if (!accept.passed) {
      lastFailure = `acceptance failed: ${failureDetail(accept) || 'not passing'}`;
      steps.push(`gate-acceptance[${attempt}]: ${lastFailure}`);
      continue;
    }

    archive.markAttempt(picked.id, true);
    steps.push(`solve[${attempt}]: PASSED all gates`);
    return {
      minted,
      mintRejected,
      ...(mintRejections.length ? { mintRejections } : {}),
      picked: { id: picked.id, title: picked.title, domain: picked.domain },
      inspirationHits,
      solved: true,
      source: solverRes.source,
      novelty: { novel: true, bestScore: novelty.bestScore, mostSimilar: novelty.mostSimilar },
      ...(prop ? { property: { passed: prop.passed, available: prop.available, score: prop.score, enforced: enforceProperty } } : {}),
      acceptance: { passed: true },
      archive: archive.snapshot(),
      steps,
    };
  }

  archive.markAttempt(picked.id, false);
  steps.push(`solve: failed after ${maxAttempts} attempt(s) — ${lastFailure || 'no solution'}`);
  return {
    minted,
    mintRejected,
    picked: { id: picked.id, title: picked.title, domain: picked.domain },
    inspirationHits,
    solved: false,
    reason: lastFailure || 'solver failed',
    acceptance: { passed: false, detail: lastFailure },
    archive: archive.snapshot(),
    steps,
  };
}

/** Reward in [0,1] for the learner: a full pass is 1, otherwise a decayed
 *  partial credit by how far the candidate got. Pure. */
export function rewardForResult(r: OpenEndedCycleResult): number {
  if (r.solved) return 1;
  if (!r.picked) return 0;
  let reward = 0;
  if (r.acceptance && !r.acceptance.passed) reward = 0.15;
  if (r.reason?.startsWith('acceptance failed')) reward = 0.3;
  if (r.reason?.startsWith('property gate failed')) reward = 0.45;
  if (r.reason?.startsWith('near-duplicate')) reward = 0.2;
  return reward;
}

/** Canonical key for the learned capability, used as the learner gene key. */
export function capabilityKeyFor(r: OpenEndedCycleResult): string | null {
  if (!r.picked) return null;
  return `real:${canonicalToolKey(r.picked.title)}`;
}
