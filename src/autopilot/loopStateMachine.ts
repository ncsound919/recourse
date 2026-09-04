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
  type AuditStatementT,
  type BusinessScorecardT,
  type GitHubClient,
  type LoopContext,
  type LoopState,
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
import { projectScorecard, saveScorecard, slugify } from './scorecard';
import { analyzeGaps } from './gapAnalyzer';
import { generateUpgrade } from './upgradeGenerator';
import { runGate, type GateExecutors } from './preMergeGate';
import { computeVetoDeadline, parseOwnerRepo, savePRState } from './vetoScheduler';
import { fetchGitHubToken } from './keywireClient';
import { createGitHubClient } from './gitHubClient';

export type LoopRunOptions = {
  profile: BusinessProfileT;
  adapters?: AuditAdapters;
  dryRun?: boolean;
  auditDir?: string;
  now?: Date;
  github?: GitHubClient;
  ledgerRoot?: string;
  gateExecutors?: GateExecutors;
};

export type LoopOutcome = { state: LoopState; context: LoopContext };

const DEFAULT_AUDIT_DIR = 'data/business-profiles';

function emptyContext(): LoopContext {
  return { profileSlug: '', scorecard: null, queue: null, currentProposal: null, prState: null };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function runLoop(options: LoopRunOptions): Promise<LoopOutcome> {
  const { profile } = options;
  const context: LoopContext = emptyContext();

  // 1. Kill switch.
  if (isKillSwitchActive()) {
    return { state: { status: 'error', reason: 'kill_switch' }, context };
  }

  // 2. Repo binding + auto-merge gate.
  const repo = repoBinding(profile);
  if (!repo) {
    return {
      state: { status: 'error', reason: 'no_repo_binding' },
      context: { ...context, profileSlug: slugify(profile.business.name) },
    };
  }
  if (!isAutoMergeEnabled(profile) && !options.dryRun) {
    return {
      state: { status: 'idle' },
      context: { ...context, profileSlug: slugify(profile.business.name) },
    };
  }

  // Dry runs never touch the default on-disk profile dir; an explicit auditDir
  // is honored in both modes.
  const auditDir = options.auditDir ?? (options.dryRun ? undefined : DEFAULT_AUDIT_DIR);
  const now = options.now ?? new Date();
  context.profileSlug = slugify(profile.business.name);

  // 3. AUDIT.
  let statement: AuditStatementT;
  try {
    statement = await runAudit({ profile, adapters: options.adapters, auditDir });
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

  // 6. GENERATE + GATE per gap. First gap whose gate passes is chosen.
  let current: UpgradeProposalT | null = null;
  try {
    for (const gap of queue.gaps) {
      const proposal = await generateUpgrade(gap, profile);
      const result = await runGate(proposal, repo.localPath, options.gateExecutors, repo);
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

  // 7. PR phase (skipped in dryRun).
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
      openedAt,
      vetoDeadline,
    });
    context.prState = prState;

    if (auditDir) {
      const prFilePath = path.join(auditDir, context.profileSlug, 'prs', `pr-${prNumber}.json`);
      await savePRState(prState, prFilePath);
    }
    return { state: { status: 'veto_wait', prNumber, deadline: vetoDeadline }, context };
  } catch (err) {
    return {
      state: { status: 'error', reason: `pr failed: ${errMsg(err)}` },
      context,
    };
  }
}
