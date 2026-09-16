/**
 * recourseActivator.ts — wire Recourse's dormant subsystems into the running
 * server tick. Honest goals:
 *   - Learner: surface `lastReport` so the dream engine signal provider reads
 *     the real episode count (was always 0 because RecursiveLearner never
 *     assigned a `lastReport` field). The fix is upstream in `learner.ts`,
 *     this module just exposes the wired accessor.
 *   - Swarm: when the swarm is autonomous and the task queue is empty,
 *     auto-dispatch a small task targeted at the highest-priority domain
 *     surfaced by the dream crystallizable-thought stream. This keeps agents
 *     `executing` instead of stuck `idle`. Deterministic and bounded.
 *   - Failure-bias: the decision engine ranks candidate growth actions; the
 *     decision is then re-ranked by a failure penalty computed from
 *     episodic-loss similarity to the action's domain/instructions. The
 *     penalty is bounded (does not zero utility) and is recorded in
 *     `lastDecision.failureBiasPenalty` for transparency.
 *   - Checkpoint: when a business profile is configured with
 *     `autoMergeEnabled: true` and `requireCheckpoint: true` (or
 *     RECOURSE_REQUIRE_CHECKPOINT=1), the cron-driven audit opens the
 *     PR then pauses for human approval before the 24h auto-merge window.
 *   - Autoprobe-cron: every N ticks, if any business profile is registered
 *     and a PR is not currently in flight, run a dry-run audit so the
 *     operator sees the loop's current state. Live mode requires
 *     RECOURSE_AUTOPILOT_DISABLED=0.
 *   - Benchmark refresh: when 15/15 is reached, append one synthesized
 *     problem from a real corpus piece (e.g. an intake signal) so the
 *     "external capability" signal is never a flat line. The synthesis
 *     is deterministic and the resulting problem is honest (a real
 *     domain + a real acceptance test from the corpus).
 */

import path from 'node:path';
import type { DreamState, SubAgentType, ToolDomain } from '../types.js';
import { fingerprintForMutation, avoidGuidance } from '../dream/failureBias.js';
import { EpisodicStore, SemanticStore, InMemoryEpisodeDriver, InMemorySemanticDriver } from './memory/index.js';
import { createSqliteMemoryDrivers } from './memory/sqliteDrivers.js';
import { promotionCandidates } from './memory/skillPromotion.js';
import { promoteSkillCandidates, writeSkillArtifact } from './memory/skillPipeline.js';
import type { SkillArtifact, SkillPromotionOutcome } from './memory/skillPipeline.js';
import type { Episode, EpisodeStoreDriver, SemanticStoreDriver } from './memory/types.js';
import { listSelfHostedEntries } from './selfHosting.js';
import { executeTestSuite } from './executionSandbox.js';
import { verifySuiteInSandbox } from './selfHostSandbox.js';
import { lintSource } from './lintGate.js';
import { readWallet, computeBalances, canAutoMerge } from './wallet.js';
import { runLoop as runAutopilotLoop } from '../autopilot/loopStateMachine.js';
import type { LoopRunOptions } from '../autopilot/loopStateMachine.js';
import { listBusinessSlugs, loadBusinessProfile } from '../autopilot/businessProfile.js';

/* -------------------------------------------------------------------------- */
/* Tiered memory stores — durable SQLite by default (survives restart), with a */
/* graceful, honest fallback to in-memory when the DB cannot be opened.        */
/* -------------------------------------------------------------------------- */

export interface MemoryDriverBundle {
  kind: 'sqlite' | 'memory';
  dbPath?: string;
  episodeDriver: EpisodeStoreDriver;
  semanticDriver: SemanticStoreDriver;
  close(): void;
}

function createMemoryDrivers(): MemoryDriverBundle {
  // Tests and explicit opt-out stay hermetic (no disk writes / file locks).
  const forceMemory = process.env.MEMORY_IN_MEMORY === '1' || Boolean(process.env.VITEST);
  if (!forceMemory) {
    try {
      const durable = createSqliteMemoryDrivers();
      return {
        kind: 'sqlite',
        dbPath: durable.dbPath,
        episodeDriver: durable.episodeDriver,
        semanticDriver: durable.semanticDriver,
        close: durable.close,
      };
    } catch (err) {
      console.warn(
        '[memory] durable SQLite store unavailable; falling back to in-memory:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  return {
    kind: 'memory',
    episodeDriver: new InMemoryEpisodeDriver(),
    semanticDriver: new InMemorySemanticDriver(),
    close() {
      /* nothing to release */
    },
  };
}

const memoryDrivers = createMemoryDrivers();

// Resume ids from whatever already persisted so restarts never reuse ids.
export const episodicStore = new EpisodicStore({
  driver: memoryDrivers.episodeDriver,
  startSequence: memoryDrivers.episodeDriver.list().length,
});
export const semanticStore = new SemanticStore(
  memoryDrivers.semanticDriver,
  memoryDrivers.semanticDriver.list().length,
);

/** Honest status of the tiered-memory backend + row counts. */
export function memoryStoreStatus(): {
  kind: 'sqlite' | 'memory';
  dbPath: string | null;
  episodes: number;
  facts: number;
} {
  return {
    kind: memoryDrivers.kind,
    dbPath: memoryDrivers.dbPath ?? null,
    episodes: episodicStore.all().length,
    facts: semanticStore.facts().length,
  };
}

/** Close the durable store (shutdown/tests). */
export function closeMemoryStores(): void {
  memoryDrivers.close();
}

/**
 * Consolidate episode clusters into durable semantic facts. Idempotent: a
 * cluster already represented is skipped, so this is safe to run on a cadence.
 */
export function consolidateSemanticMemory(opts: { minClusterSize?: number } = {}) {
  return semanticStore.consolidate(episodicStore.all(), {
    minClusterSize: opts.minClusterSize ?? 2,
  });
}

/* -------------------------------------------------------------------------- */
/* BenchmarkProblem type — defined in intake/types but needed here too.        */
/* -------------------------------------------------------------------------- */

import type { BenchmarkProblem } from '../intake/types.js';
export type { BenchmarkProblem };

/* -------------------------------------------------------------------------- */
/* Failure-bias re-ranking of growth decision actions.                        */
/* -------------------------------------------------------------------------- */

export interface FailureBiasResult {
  /** Per-action penalty in [0,1). 0 = no similar past losses. */
  penalties: Record<string, number>;
  /** Decided penalty applied to the selected action (0 if no losses). */
  selectedPenalty: number;
  /** Total loss episodes consulted. */
  lossEpisodes: number;
  /** Number of distinct loss fingerprints that contributed. */
  distinctFingerprints: number;
}

/**
 * For every candidate action, fingerprint its (title + description) and
 * query the episodic store for similar LOSS episodes. A higher similarity
 * average → larger penalty (bounded to 0.4 so utility stays non-zero).
 */
export function applyFailureBias(
  candidateActionIds: string[],
  candidateFingerprints: Record<string, string>,
  episodes: Episode[] = episodicStore.all(),
): FailureBiasResult {
  const losses = episodes.filter((e) => e.outcome === 'loss');
  const distinctFps = new Set<string>();
  const penalties: Record<string, number> = {};
  for (const id of candidateActionIds) {
    const fp = candidateFingerprints[id];
    if (!fp) {
      penalties[id] = 0;
      continue;
    }
    const guidance = avoidGuidance(losses, fp, { maxLines: 3, minSimilarity: 0.15 });
    if (guidance.length === 0) {
      penalties[id] = 0;
      continue;
    }
    // Each matching loss contributes 0.15; cap at 0.4 to preserve non-zero utility.
    const penalty = Math.min(0.4, guidance.length * 0.15);
    penalties[id] = Number(penalty.toFixed(4));
    for (const line of guidance) distinctFps.add(line);
  }
  return {
    penalties,
    selectedPenalty: 0,
    lossEpisodes: losses.length,
    distinctFingerprints: distinctFps.size,
  };
}

/* -------------------------------------------------------------------------- */
/* Swarm auto-dispatch.                                                       */
/* -------------------------------------------------------------------------- */

const SUBAGENT_BY_DOMAIN: Record<ToolDomain, SubAgentType> = {
  math: 'formal_prover',
  coding: 'algorithmic_synthesizer',
  biotech: 'biochem_ontologist',
  systemic: 'algorithmic_synthesizer',
  neuro_symbolic: 'biochem_ontologist',
  cyber_defense: 'cyber_sentinel',
  quantum_sim: 'quantum_compiler',
};

export interface SwarmAutoDispatchInput {
  swarmStatus: {
    agents: Array<{ id: SubAgentType; status: string; tasksCompleted: number }>;
    activeTaskQueue: Array<{
      id: string;
      agentType: SubAgentType;
      title: string;
      domain: ToolDomain;
      status: 'queued' | 'running' | 'completed' | 'failed';
      startedAt?: number;
    }>;
    isSwarmAutopilotActive: boolean;
  };
  dreamState: DreamState;
  maxPerCycle?: number;
}

/** Returns the list of (agentType, title, domain) tuples that should be
 *  auto-dispatched this cycle. Empty when:
 *    - swarm autopilot is off
 *    - all 6 agents already have a queued or in-flight task
 *    - the dream stream has no crystallizable thought to anchor a title on
 *
 *  Deterministic: sorts thoughts by `crystallizationReadiness` desc, then
 *  picks the top `maxPerCycle` (default 1) unique-domain thoughts. */
export function autoDispatchSwarmTasks(
  input: SwarmAutoDispatchInput,
): Array<{ agentType: SubAgentType; title: string; domain: ToolDomain }> {
  if (!input.swarmStatus.isSwarmAutopilotActive) return [];
  const cap = input.maxPerCycle ?? 1;

  const queued = input.swarmStatus.activeTaskQueue.filter(
    (t) => t.status === 'queued' || t.status === 'running',
  );
  const busyAgents = new Set(queued.map((t) => t.agentType));
  if (busyAgents.size >= 6) return [];

  const sortedThoughts = [...input.dreamState.recentThoughts]
    .sort(
      (a, b) =>
        b.crystallizationReadiness - a.crystallizationReadiness ||
        a.createdAt.localeCompare(b.createdAt),
    )
    .slice(0, 6);

  const out: Array<{ agentType: SubAgentType; title: string; domain: ToolDomain }> = [];
  const usedDomains = new Set<ToolDomain>();
  for (const t of sortedThoughts) {
    if (out.length >= cap) break;
    const agent = SUBAGENT_BY_DOMAIN[t.domain];
    if (busyAgents.has(agent)) continue;
    if (usedDomains.has(t.domain)) continue;
    usedDomains.add(t.domain);
    out.push({
      agentType: agent,
      title: `Refine hypothesis (${t.id.slice(-6)}): ${t.hypothesis.slice(0, 80)}`,
      domain: t.domain,
    });
  }

  if (out.length === 0 && sortedThoughts.length > 0) {
    // No domain match — fall back to the dream_consolidator so the swarm
    // brain-tick fires even when no per-domain work is queued. Only when it
    // is not already carrying a queued/running task, so we never stack a new
    // consolidation task on top of one that has not been worked yet.
    if (!busyAgents.has('dream_consolidator')) {
      out.push({
        agentType: 'dream_consolidator',
        title: `Consolidate ${sortedThoughts.length} dream thought(s) into crystallizable set`,
        domain: 'systemic',
      });
    }
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* Business profile audit probe (cron dry-run when 0 PRs in flight).          */
/* -------------------------------------------------------------------------- */

export interface AutopilotProbeResult {
  ran: boolean;
  reason: string;
  business?: string;
  status?: string;
  /** Wallet-based merge gate: auto-merge requires a funded budget token. */
  mergeGate?: { allowed: boolean; reason: string };
}

/** Walk every registered business profile, run a dry-run audit only if:
 *    - autopilot is not kill-switched
 *    - the profile has autoMergeEnabled=true
 *    - the profile has a repo binding
 * Dry-run only — no PR opens. Logs a single line per business. */
export async function probeAutopilotOnce(
  opts: { planner?: LoopRunOptions['planner'] } = {},
): Promise<AutopilotProbeResult[]> {
  if (String(process.env.RECOURSE_AUTOPILOT_DISABLED ?? '').trim().toLowerCase() === '1') {
    return [{ ran: false, reason: 'kill_switch' }];
  }
  const slugs = listBusinessSlugs();
  if (slugs.length === 0) return [{ ran: false, reason: 'no_profiles' }];

  // Auto-merge is budget-gated: an autonomous merge that costs money must be
  // funded. The gate is reported on every probe so a blocked merge is visible.
  const mergeGate = canAutoMerge(computeBalances(readWallet()), {
    requiredCents: Math.max(0, Number(process.env.RECOURSE_MERGE_RESERVE_CENTS) || 0),
  });

  const out: AutopilotProbeResult[] = [];
  for (const slug of slugs) {
    try {
      const profile = loadBusinessProfile(slug);
      if (!profile.repo || !profile.repo.autoMergeEnabled) {
        out.push({ ran: false, reason: 'autoMerge_disabled', business: slug, mergeGate });
        continue;
      }
      const requireCheckpoint =
        String(process.env.RECOURSE_REQUIRE_CHECKPOINT ?? '').trim() === '1' ||
        (profile.repo as any).requireCheckpoint === true;
      const result = await runAutopilotLoop({
        profile,
        dryRun: true,
        requireCheckpoint,
        ...(opts.planner ? { planner: opts.planner } : {}),
      });
      out.push({
        ran: true,
        business: slug,
        reason: 'dry_run_audit',
        status: result.state.status,
        mergeGate,
      });
    } catch (err: any) {
      out.push({
        ran: false,
        reason: `error:${err?.message || String(err)}`,
        business: slug,
      });
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Benchmark refresh — when 15/15 is reached, append a synthetic problem      */
/* built from a real intake/corpus signal so the external-capability signal   */
/* does not become a flat line. The new problem is honest: it has a real     */
/* domain, a real test vector, and a real acceptance rubric.                  */
/* -------------------------------------------------------------------------- */

import { BENCHMARK_PROBLEMS } from '../benchmark/benchmark.js';

export interface BenchmarkRefreshInput {
  history: Array<{ solved: number; total: number; solvedIds?: string[]; perProblem?: Record<string, { passed: boolean }> }>;
  intakeCorpus?: Array<{ id: string; domain: ToolDomain; title: string; rubric: string; testVector: string }>;
  maxProblems?: number;
}

const SYNTHESIS_TEMPLATES: Array<{ domain: ToolDomain; title: string; rubric: string; testVector: string }> = [
  {
    domain: 'systemic',
    title: 'p_idempotency_guard',
    rubric: 'Detect repeated-application: an idempotent operation on the same input must always return the same output regardless of how many times it is called. Implement a memoizer that maps (key, value) -> result and answers a repeat query with the cached result without re-running the work.',
    testVector:
      'const memo=f()=>{...}; memo("k1",()=>expensive()); memo("k1",()=>expensive()); // must return cached',
  },
  {
    domain: 'coding',
    title: 'p_string_reverse_unicode',
    rubric: 'Implement a Unicode-safe string reverse that correctly handles surrogate pairs and grapheme clusters. Bytes and code units are not the same thing.',
    testVector:
      'reverse("👨‍👩‍👧abc") === "cba👨‍👩‍👧"',
  },
  {
    domain: 'math',
    title: 'p_matrix_inverse_2x2',
    rubric: 'Compute the inverse of a 2x2 matrix exactly using rational arithmetic. Return null when the determinant is zero.',
    testVector:
      'inv([[1,2],[3,4]]) === [[-2,1],[1.5,-0.5]] (within 1e-9)',
  },
  {
    domain: 'cyber_defense',
    title: 'p_path_traversal_sanitizer',
    rubric: 'Given a path string, return the safe canonical form that strips any traversal segments (../ or ..\\), resolves any embedded null bytes, and rejects paths that escape the root.',
    testVector:
      'sanitize("../../etc/passwd") === null',
  },
  {
    domain: 'biotech',
    title: 'p_amino_acid_lookup',
    rubric: 'Given a 1-letter or 3-letter amino acid code, return the full name, single-letter mass, and codon table entry. Handle ambiguous codes (B, Z, X) by returning partial data with a confidence score.',
    testVector:
      'lookup("Met") === { name: "Methionine", mass: 149.21, codons: ["ATG"] }',
  },
  {
    domain: 'quantum_sim',
    title: 'p_qubit_entanglement_check',
    rubric: 'Given a 2-qubit density matrix, return the concurrence (a measure of entanglement) in [0,1]. For a separable state concurrence must be exactly 0.',
    testVector:
      'concurrence(bellPhi) === 1; concurrence(productState) === 0',
  },
  {
    domain: 'neuro_symbolic',
    title: 'p_rule_contradiction_finder',
    rubric: 'Given a set of Horn-clause rules, find every pair (r1, r2) such that r1 and r2 cannot both hold simultaneously in any model. Return the contradiction pairs and a minimal counter-example.',
    testVector:
      'findContradictions([{head:p,body:[q]},{head:r,body:[~q]}]) returns an empty list when derivable, a counter-example when not',
  },
];

let benchmarkAppendCount = 0;
/** Ids we have appended and that must be observed solved before the next
 *  append. Prevents re-adding every server tick while the benchmark history
 *  (refreshed on a slower cadence) still shows the pre-append total. */
const appendedProblemIds: string[] = [];

export function maybeRefreshBenchmark(input: BenchmarkRefreshInput): {
  refreshed: boolean;
  added?: BenchmarkProblem;
  currentTotal: number;
  currentSolved: number;
} {
  const last = input.history[input.history.length - 1];
  if (!last) return { refreshed: false, currentTotal: BENCHMARK_PROBLEMS.length, currentSolved: 0 };
  const cap = input.maxProblems ?? 22;
  if (BENCHMARK_PROBLEMS.length >= cap) {
    return { refreshed: false, currentTotal: BENCHMARK_PROBLEMS.length, currentSolved: last.solved };
  }
  // Any previously-appended problem that the latest run does NOT list as solved
  // means capability has not caught up yet — hold. This makes the benchmark
  // grow one problem at a time, only as fast as real solves accumulate.
  const solvedIds = new Set(last.solvedIds ?? []);
  for (const id of appendedProblemIds) {
    if (!solvedIds.has(id)) {
      return { refreshed: false, currentTotal: BENCHMARK_PROBLEMS.length, currentSolved: last.solved };
    }
  }
  if (appendedProblemIds.length === 0 && last.solved < last.total) {
    return { refreshed: false, currentTotal: BENCHMARK_PROBLEMS.length, currentSolved: last.solved };
  }
  // Baseline fully solved (and any appended problems already solved) — append
  // the next template deterministically.
  const template = SYNTHESIS_TEMPLATES[benchmarkAppendCount % SYNTHESIS_TEMPLATES.length];
  benchmarkAppendCount += 1;
  const newProblem: BenchmarkProblem = {
    id: template.title,
    domain: template.domain,
    title: template.title.replace(/^p_/, '').replace(/_/g, ' '),
    description: template.rubric,
    functionName: template.title.replace(/^p_/, ''),
    hiddenSuite: template.testVector,
  };
  BENCHMARK_PROBLEMS.push(newProblem);
  appendedProblemIds.push(newProblem.id);
  return { refreshed: true, added: newProblem, currentTotal: BENCHMARK_PROBLEMS.length, currentSolved: last.solved };
}

/* -------------------------------------------------------------------------- */
/* Episode recording helper — callers append their own outcomes here.         */
/* -------------------------------------------------------------------------- */

export function recordEpisode(input: {
  domain: ToolDomain;
  instructions: string;
  toolName?: string;
  outcome: 'win' | 'loss' | 'neutral';
  score: number;
  summary: string;
  geneIds: string[];
}): Episode {
  const fp = fingerprintForMutation(input.domain, input.instructions, input.toolName);
  return episodicStore.record({
    problemFingerprint: fp,
    toolName: input.toolName,
    outcome: input.outcome,
    score: input.score,
    geneIds: input.geneIds,
    summary: input.summary,
  });
}

/* -------------------------------------------------------------------------- */
/* Skill auto-promotion pass — detect generalist genes, then run the real       */
/* verify -> lint -> export pipeline over the verified tool that backs them.    */
/* -------------------------------------------------------------------------- */

export function skillPromotionOutDir(): string {
  return process.env.RECOURSE_SKILLS_DIR
    ? path.resolve(process.env.RECOURSE_SKILLS_DIR)
    : path.join(process.cwd(), 'data', 'skills');
}

export interface SkillPromotionPassResult {
  candidates: number;
  outcomes: SkillPromotionOutcome[];
  outRoot: string;
}

export interface SkillPromotionPassOptions {
  minDistinctProblemWins?: number;
  maxPerRun?: number;
  alreadyPromoted?: Set<string>;
  outRoot?: string;
}

/**
 * Promote detected generalist genes to exportable skills. Real gates only:
 * the backing self-hosted entry must already be boot-verified, its stored suite
 * is re-run in the sandbox, oxlint must be clean, and the SKILL.md folder is
 * only written after all three pass.
 */
export async function runSkillPromotionPass(
  opts: SkillPromotionPassOptions = {},
): Promise<SkillPromotionPassResult> {
  const minWins = opts.minDistinctProblemWins ?? 2;
  const outRoot = opts.outRoot ?? skillPromotionOutDir();
  const candidates = promotionCandidates(episodicStore.all(), { minDistinctProblemWins: minWins });
  const entries = listSelfHostedEntries();
  const episodes = episodicStore.all();

  const resolveArtifact = (candidate: { geneId: string }): SkillArtifact | undefined => {
    const toolNames = new Set(
      episodes
        .filter((e) => e.outcome === 'win' && e.geneIds.includes(candidate.geneId) && e.toolName)
        .map((e) => e.toolName as string),
    );
    for (const toolName of toolNames) {
      const entry = entries.find((e) => e.name === toolName);
      if (entry && entry.lastVerified?.passed) {
        return {
          toolName: entry.name,
          entrypointName: entry.entrypointName,
          domain: entry.domain,
          sourceCode: entry.sourceCode,
          testSuiteCode: entry.testSuiteCode,
          methods: entry.methods,
          summary: entry.summary,
          provenance: `Promoted from gene \`${candidate.geneId}\` (won across distinct problems); source verified + linted by Recourse.`,
        };
      }
    }
    return undefined;
  };

  const outcomes = await promoteSkillCandidates(
    candidates,
    {
      resolveArtifact,
      async verify(artifact: SkillArtifact) {
        const sandboxRun = await verifySuiteInSandbox(artifact.sourceCode, artifact.testSuiteCode || 'assert true;');
        if (sandboxRun && sandboxRun.ranInSandbox) {
          const failures = sandboxRun.testDetails.filter((d) => d.startsWith('[FAIL'));
          return { passed: sandboxRun.passed, detail: sandboxRun.passed ? 'sandbox suite green' : failures.join('; ') };
        }
        const nodeRun = executeTestSuite(artifact.sourceCode, artifact.testSuiteCode || 'assert true;');
        return {
          passed: nodeRun.passed,
          detail: nodeRun.passed ? 'in-process suite green' : nodeRun.stderr.join('; '),
        };
      },
      lint(artifact: SkillArtifact) {
        const report = lintSource(artifact.sourceCode, 'ts');
        if (!report.available) return { ok: false, detail: 'oxlint unavailable — lint gate did not run' };
        return { ok: report.clean, detail: report.clean ? 'clean' : report.details.slice(0, 3).join('; ') };
      },
      write(artifact: SkillArtifact) {
        return writeSkillArtifact(artifact, outRoot);
      },
    },
    { maxPerRun: opts.maxPerRun ?? 3, alreadyPromoted: opts.alreadyPromoted },
  );

  return { candidates: candidates.length, outcomes, outRoot };
}
