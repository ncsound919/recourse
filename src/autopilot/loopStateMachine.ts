/**
 * loopStateMachine.ts - orchestrates one full pass of the recursive audit
 * loop for a single business profile:
 *
 *   AUDIT -> ANALYZE -> GENERATE + GATE -> (dryRun ? pr_open : PR -> veto_wait)
 *
 * Kill-switch, repo-binding and auto-merge gates short-circuit before any
 * audit work. Every network/LLM touch is skippable: dryRun runs the loop
 * through the gate only (no token, no PR, no PR-state persistence). Audit and
 * scorecard persistence happen only when auditDir is provided; a real (non
 * dry-run) pass without auditDir falls back to data/business-profiles.
 *
 * Signature deviations from the task sketch:
 *   - gateExecutors was added to LoopRunOptions and forwarded to runGate so
 *     dry-run tests can run the gate hermetically without shelling out.
 *   - runLoop returns { state, context } with context.currentProposal set to
 *     the chosen (gate-passing) proposal; idle outcomes carry the queue.
 */

import path from 'node:path';
import {
  PRState,
  type AuditorIdT,
  type AuditStatementT,
  type BusinessScorecardT,
  type GapT,
  type GitHubClient,
  type LoopContext,
  type LoopState,
  type PRStateT,
  type UpgradeProposalT,
  type UpgradeQueueT,
} from './loopTypes';
import {
  isAutoMergeEnabled,
  isKillSwitchActive,
  repoBinding,
  type BusinessProfileT,
} from './businessProfile';
import { runAudit, type AuditAdapters } from './auditRunner';
import { auditorsForDepth, depthFromSignals, planAuditDepth, type AuditDepth } from './auditDepth';
import type { LearnerState } from '../dream/learner-types';
import type { ToolDomain } from '../dream/types';
import { loadLatestScorecard, projectScorecard, saveScorecard, slugify } from './scorecard';
import { analyzeGaps } from './gapAnalyzer';
import { generateUpgrade, type PlannedCode } from './upgradeGenerator';
import { runGate, type GateExecutors } from './preMergeGate';
import { checkAndMerge, computeVetoDeadline, parseOwnerRepo, savePRState } from './vetoScheduler';
import { fetchGitHubToken } from './keywireClient';
import { createGitHubClient } from './gitHubClient';
import { DEFAULT_LEDGER_ROOT, loadLedger, quarantinedGapIds, updateGeneFitness } from './fitnessLoop';
import { recordMergedOutcome } from '../lib/outcomeFeedback';
import { FileCheckpointStore, buildCheckpoint, evaluateCheckpointTimeout, resolveCheckpoint } from './checkpoint';

export type LoopRunOptions = {
  profile: BusinessProfileT;
  adapters?: AuditAdapters;
  dryRun?: boolean;
  auditDir?: string;
  now?: Date;
  github?: GitHubClient;
  ledgerRoot?: string;
  gateExecutors?: GateExecutors;
  /** If true, create a checkpoint after opening PR and pause for review. */
  requireCheckpoint?: boolean;
  /** Checkpoint store for testing. Defaults to FileCheckpointStore. */
  checkpointStore?: import('./checkpoint').CheckpointStore;
  /**
   * Optional real planner (model/forge) that synthesizes Tier A code and its
   * acceptance test. When present, the produced file is gated by a real sandbox
   * run of that test; when absent, Tier A code gaps stay honest placeholders.
   */
  planner?: (gap: GapT, profile: BusinessProfileT) => Promise<PlannedCode | null>;
  /** Recursive learner; when present, its domain beliefs choose the audit depth. */
  learner?: LearnerLike;
  /** Pin the learner domain whose depth applies to this repo's audits. */
  auditDomain?: ToolDomain;
  /** Explicit audit depth; overrides the learner. */
  auditDepth?: AuditDepth;
  /** External fleet audit signals (e.g. OpenHub self-report health). */
  externalAuditSignals?: Array<{ uncertainty: number; meanReward: number; attempts: number }>;
};

export type LoopOutcome = { state: LoopState; context: LoopContext };

const DEFAULT_AUDIT_DIR = 'data/business-profiles';

function emptyContext(): LoopContext {
  return { profileSlug: '', scorecard: null, queue: null, currentProposal: null, prState: null, checkpoint: null };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Minimal learner surface the loop needs (satisfied by RecursiveLearner). */
export type LearnerLike = {
  status(): Promise<Pick<LearnerState, 'geneBeliefs' | 'directives'>> | Pick<LearnerState, 'geneBeliefs' | 'directives'>;
};

/**
 * Resolve how deep the audit team should go, from the recursive learner's real
 * domain beliefs. Priority:
 *   1. an explicit `auditDepth` (operator override);
 *   2. otherwise the learner's deepest-needed domain (`auditDomain` pins one,
 *      default = across all domains).
 * Always returns `undefined` — meaning "run the full team", the pre-existing
 * behavior — when there is no learner, the learner is unavailable, or the
 * chosen tier has no auditor the caller can actually run. So this can only ever
 * ADD learner-driven scrutiny; it never turns a working full audit into an
 * empty one.
 */
export async function resolveAuditDepth(opts: {
  auditDepth?: AuditDepth;
  auditDomain?: ToolDomain;
  learner?: LearnerLike;
  adapters?: AuditAdapters;
  /** External fleet audit signals (e.g. OpenHub's self-report health). */
  externalAuditSignals?: Array<{ uncertainty: number; meanReward: number; attempts: number }>;
}): Promise<AuditDepth | undefined> {
  if (opts.auditDepth) return opts.auditDepth;

  let learnerDepth: AuditDepth | undefined;
  if (opts.learner) {
    try {
      const state = await opts.learner.status();
      const plan = planAuditDepth(state, opts.auditDomain ? { domains: [opts.auditDomain] } : {});
      learnerDepth = plan[0]?.depth;
    } catch {
      learnerDepth = undefined;
    }
  }

  // The audit is never shallower than the fleet's own reported health demands:
  // an unhealthy external system raises the floor; a healthy one never lowers
  // the learner's ask.
  const fleetDepth = (opts.externalAuditSignals ?? []).reduce<AuditDepth | undefined>(
    (max, s) => {
      const d = depthFromSignals(s);
      return max === undefined || d > max ? d : max;
    },
    undefined,
  );

  const chosen = [learnerDepth, fleetDepth].reduce<AuditDepth | undefined>(
    (max, d) => (d === undefined ? max : max === undefined || d > max ? d : max),
    undefined,
  );
  if (chosen === undefined) return undefined;

  const available = Object.keys(opts.adapters ?? {}) as AuditorIdT[];
  return auditorsForDepth(chosen, available).length > 0 ? chosen : undefined;
}

export async function runLoop(options: LoopRunOptions): Promise<LoopOutcome> {
  const { profile } = options;
  const slug = slugify(profile.business.name);
  const context: LoopContext = { ...emptyContext(), profileSlug: slug };

  // 1. Kill switch.
  if (isKillSwitchActive()) {
    return { state: { status: 'error', reason: 'kill_switch' }, context };
  }

  // 2. Repo binding + auto-merge gate.
  const repo = repoBinding(profile);
  if (!repo) {
    return {
      state: { status: 'error', reason: 'no_repo_binding' },
      context,
    };
  }
  if (!isAutoMergeEnabled(profile) && !options.dryRun) {
    return {
      state: { status: 'idle' },
      context,
    };
  }

  // Dry runs never touch the default on-disk profile dir; an explicit auditDir
  // is honored in both modes.
  const auditDir = options.auditDir ?? (options.dryRun ? undefined : DEFAULT_AUDIT_DIR);
  const now = options.now ?? new Date();

  // 3. AUDIT — depth derived from the recursive learner when available.
  let statement: AuditStatementT;
  try {
    const auditDepth = await resolveAuditDepth({
      auditDepth: options.auditDepth,
      auditDomain: options.auditDomain,
      learner: options.learner,
      adapters: options.adapters,
      externalAuditSignals: options.externalAuditSignals,
    });
    statement = await runAudit({
      profile,
      adapters: options.adapters,
      auditDir,
      ...(auditDepth ? { depth: auditDepth } : {}),
    });
  } catch (err) {
    return {
      state: { status: 'error', reason: `audit failed: ${errMsg(err)}` },
      context,
    };
  }

  // 4. Scorecard.
  let scorecard: BusinessScorecardT;
  try {
    scorecard = projectScorecard(statement, profile);
    if (auditDir) saveScorecard(scorecard, auditDir);
  } catch (err) {
    return {
      state: { status: 'error', reason: `scorecard failed: ${errMsg(err)}` },
      context,
    };
  }
  context.scorecard = scorecard;

  // 5. ANALYZE.
  let queue: UpgradeQueueT;
  try {
    queue = analyzeGaps(scorecard, profile);
  } catch (err) {
    return {
      state: { status: 'error', reason: `gap analysis failed: ${errMsg(err)}` },
      context,
    };
  }
  context.queue = queue;

  // 6. GENERATE + GATE per gap. First gate-passing candidate is chosen.
  //    Auto-merge (non-dry-run) is restricted to TIER A proposals: tier B/C
  //    carry human-review markers and are never auto-merged, per spec §5.7.
  //    Dry runs may select any tier because nothing is opened or merged.
  //    Gaps whose id is quarantined (M4) are skipped entirely so a regression
  //    cannot re-select the same upgrade on the next cycle.
  const quarantinedGaps = quarantinedGapIds(
    loadLedger(options.ledgerRoot ?? DEFAULT_LEDGER_ROOT),
  );
  let current: UpgradeProposalT | null = null;
  try {
    for (const gap of queue.gaps) {
      if (quarantinedGaps.has(gap.id)) continue;
      if (!options.dryRun && gap.tier !== 'A') continue;
      const proposal = await generateUpgrade(gap, profile, options.planner ? { planner: options.planner } : {});
      const result = await runGate(
        proposal,
        repo.localPath,
        options.gateExecutors,
        repo,
        { applyFiles: !options.dryRun },
      );
      if (result.passed) {
        current = proposal;
        break;
      }
    }
  } catch (err) {
    return {
      state: { status: 'error', reason: `generate/gate failed: ${errMsg(err)}` },
      context,
    };
  }
  if (!current) {
    return { state: { status: 'idle' }, context };
  }
  context.currentProposal = current;

  // 7. PR phase (skipped in dryRun; nothing is written to disk or opened).
  if (options.dryRun) {
    return { state: { status: 'pr_open', prNumber: -1 }, context };
  }

  try {
    const parsed = parseOwnerRepo(repo.githubUrl);
    if (!parsed) {
      return { state: { status: 'error', reason: 'no_github_url' }, context };
    }
    const { owner, repo: repoName } = parsed;

    const client =
      options.github ?? createGitHubClient({ token: await fetchGitHubToken(owner) });

    const branch = `recourse/upgrade-${now.getTime()}`;
    await client.createBranch(owner, repoName, repo.defaultBranch, branch);
    await client.createCommit(owner, repoName, branch, current.files);
    const prNumber = await client.createDraftPR({
      owner,
      repo: repoName,
      title: current.title,
      body: current.description,
      head: branch,
      base: repo.defaultBranch,
      draft: true,
    });
    await client.addLabel(owner, repoName, prNumber, 'recourse-auto-merge');

    const openedAt = now.toISOString();
    const vetoHours = repo.autoMergeVetoHours ?? 24;
    const vetoDeadline = computeVetoDeadline(openedAt, vetoHours);
    const prState = PRState.parse({
      prNumber,
      owner,
      repo: repoName,
      branch,
      proposalId: current.id,
      gapId: current.gapId,
      openedAt,
      vetoDeadline,
    });
     context.prState = prState;

     if (auditDir) {
       const prFilePath = path.join(auditDir, context.profileSlug, 'prs', `pr-${prNumber}.json`);
       await savePRState(prState, prFilePath);
     }

     // Interactive-veto checkpoint: if required, pause the loop and wait for
     // human approval before the PR enters its 24h auto-merge window.
     if (options.requireCheckpoint) {
       const store = options.checkpointStore ?? new FileCheckpointStore(auditDir ?? DEFAULT_AUDIT_DIR);
       const now = options.now ?? new Date();
       const vetoHours = repo.autoMergeVetoHours ?? 24;
       const checkpoint = buildCheckpoint({
         id: `ckpt_${prNumber}_${now.getTime()}`,
         profileSlug: slug,
         prNumber,
         proposalId: current.id,
         expiresAt: new Date(now.getTime() + vetoHours * 3600_000).toISOString(),
       });
       await store.save(checkpoint);
       context.checkpoint = checkpoint;
       return { state: { status: 'checkpoint', checkpointId: checkpoint.id }, context };
     }

     return { state: { status: 'veto_wait', prNumber, deadline: vetoDeadline }, context };
  } catch (err) {
    return {
      state: { status: 'error', reason: `pr failed: ${errMsg(err)}` },
      context,
    };
  }
}

// ============================================================================
// resumeAfterVeto — closes the recursive loop after a PR has aged past (or
// been vetoed within) its window. runLoop ends at veto_wait; a scheduler
// tick calls this later to advance the PR. On merge, a fresh audit runs and
// the resulting scorecard delta is folded into gene fitness (quarantining the
// proposal id on a real regression).
// ============================================================================

export type ResumeOptions = {
  profile: BusinessProfileT;
  prState: PRStateT;
  github: GitHubClient;
  adapters?: AuditAdapters;
  auditDir?: string;
  ledgerRoot?: string;
  now?: Date;
  /** Users whose "veto" comment closes a PR. Defaults to the repo owner. */
  authorizedVetoUsers?: string[];
  /** Checkpoint store for resolving checkpoint state. */
  checkpointStore?: import('./checkpoint').CheckpointStore;
  /** Wallet merge gate forwarded to the veto scheduler; blocks the merge when disallowed. */
  mergeGate?: { allowed: boolean; reason: string };
  /** Recursive learner; when present, its domain beliefs choose the audit depth. */
  learner?: LearnerLike;
  /** Pin the learner domain whose depth applies to this repo's audits. */
  auditDomain?: ToolDomain;
  /** Explicit audit depth; overrides the learner. */
  auditDepth?: AuditDepth;
  /** External fleet audit signals (e.g. OpenHub self-report health). */
  externalAuditSignals?: Array<{ uncertainty: number; meanReward: number; attempts: number }>;
};

export async function resumeAfterVeto(options: ResumeOptions): Promise<LoopOutcome> {
  const { profile, prState, github } = options;
  const slug = slugify(profile.business.name);
  const context: LoopContext = { ...emptyContext(), profileSlug: slug, prState };
  const repo = repoBinding(profile);

  // If a checkpoint exists for this PR, resolve it first.
  if (options.checkpointStore) {
    const checkpoints = await options.checkpointStore.list(slug);
    const matching = checkpoints.find((c) => c.prNumber === prState.prNumber);
    if (matching && matching.status === 'pending') {
      if (evaluateCheckpointTimeout(matching, options.now)) {
        await options.checkpointStore.remove(matching.id);
        context.checkpoint = { ...matching, status: 'expired' };
        return {
          state: { status: 'error', reason: `checkpoint expired for PR #${prState.prNumber}` },
          context,
        };
      }
      // Checkpoint still pending — do not advance.
      context.checkpoint = matching;
      return {
        state: { status: 'checkpoint', checkpointId: matching.id },
        context,
      };
    }
    if (matching && matching.status === 'rejected') {
      await options.checkpointStore.remove(matching.id);
      context.checkpoint = matching;
      return {
        state: { status: 'vetoed', prNumber: prState.prNumber },
        context,
      };
    }
    // Approved: clear the checkpoint and proceed with the veto window.
    if (matching && matching.status === 'approved') {
      await options.checkpointStore.remove(matching.id);
      context.checkpoint = { ...matching, status: 'approved' };
    }
  }

  let updated: PRStateT;
  try {
    updated = await checkAndMerge(prState, github, {
      now: options.now,
      authorizedVetoUsers: options.authorizedVetoUsers,
      mergeGate: options.mergeGate,
    });
  } catch (err) {
    return {
      state: { status: 'error', reason: `veto check failed: ${errMsg(err)}` },
      context,
    };
  }
  context.prState = updated;

  if (updated.vetoReceived) {
    return { state: { status: 'vetoed', prNumber: updated.prNumber }, context };
  }
  if (!updated.merged) {
    return {
      state: { status: 'veto_wait', prNumber: updated.prNumber, deadline: updated.vetoDeadline },
      context,
    };
  }

  // Merged. Re-audit post-merge and fold the delta into gene fitness.
  if (!repo) {
    return { state: { status: 'merged', prNumber: updated.prNumber }, context };
  }
  const auditDir = options.auditDir ?? DEFAULT_AUDIT_DIR;
  try {
    // H1: capture the pre-merge scorecard BEFORE the post-merge audit runs and
    // overwrites the newest scorecard file. loadLatestScorecard() after the
    // save would return the file we just wrote (pre === post, delta always 0),
    // which made the fitness loop inert. Loading first gives a real baseline.
    const pre = loadLatestScorecard(slug, auditDir);
    const auditDepth = await resolveAuditDepth({
      auditDepth: options.auditDepth,
      auditDomain: options.auditDomain,
      learner: options.learner,
      adapters: options.adapters,
      externalAuditSignals: options.externalAuditSignals,
    });
    const postStatement = await runAudit({
      profile,
      adapters: options.adapters,
      auditDir,
      ...(auditDepth ? { depth: auditDepth } : {}),
    });
    const post = projectScorecard(postStatement, profile);
    saveScorecard(post, auditDir);
    context.scorecard = post;

    if (pre) {
      const { quarantined } = await updateGeneFitness({
        proposalId: updated.proposalId,
        gapId: updated.gapId,
        pre,
        post,
        ledgerRoot: options.ledgerRoot,
      });
      // Feed the real business outcome (scorecard delta) to the learner's
      // external reward ledger. This is the signal that was previously written
      // into the fitness ledger and never consumed.
      try {
        recordMergedOutcome({
          ledgerRoot: options.ledgerRoot ?? DEFAULT_LEDGER_ROOT,
          proposalId: updated.proposalId,
          gapId: updated.gapId,
          scorecardDelta: post.overallScore - pre.overallScore,
          notes: `scorecard ${pre.overallScore} -> ${post.overallScore}`,
        });
      } catch {
        // Outcome feedback must never fail the merge path.
      }
      context.currentProposal = null;
      return {
        state: quarantined
          ? { status: 'error', reason: 'gene_quarantined' }
          : { status: 'merged', prNumber: updated.prNumber },
        context: { ...context, scorecard: post },
      };
    }
  } catch (err) {
    return {
      state: { status: 'error', reason: `post-merge re-audit failed: ${errMsg(err)}` },
      context,
    };
  }
  return { state: { status: 'merged', prNumber: updated.prNumber }, context };
}

// ============================================================================
// resolveCheckpoint — re-exported from checkpoint.ts for convenience.
// ============================================================================

export type ResolveCheckpointOptions = {
  checkpointId: string;
  action: 'approve' | 'reject';
  reviewerNotes?: string;
  store: import('./checkpoint').CheckpointStore;
  now?: Date;
};

export { resolveCheckpoint };
