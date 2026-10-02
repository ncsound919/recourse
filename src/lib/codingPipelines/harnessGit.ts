/**
 * harnessGit.ts — deep GitHub/Git integration for the DeepSeek harness.
 *
 * Four capabilities:
 *   1. commitResults  — commit harness output (ledger, report, diff) to a git repo
 *   2. pushResults    — push the results repo to its remote
 *   3. createHarnessPR — open a GitHub PR with harness results via gitHubClient
 *   4. runAutopilot   — full loop: run → score → commit → push → PR → merge
 *
 * Provenance: every run stamps the exact git SHA of both the harness checkout
 * and the target repo, so a benchmark number is always traceable to the code
 * that produced it.
 *
 * Configuration (env vars):
 *   HARNESS_RESULTS_REPO     — path to the results repo (required for commit/push)
 *   HARNESS_RESULTS_REMOTE   — git remote name (default: origin)
 *   HARNESS_RESULTS_BRANCH   — branch to push to (default: main)
 *   HARNESS_GIT_USER_NAME    — git user name for commits
 *   HARNESS_GIT_USER_EMAIL   — git user email for commits
 *   GITHUB_TOKEN              — GitHub API token (for PR creation)
 *   GITHUB_OWNER              — GitHub repo owner
 *   GITHUB_REPO               — GitHub repo name
 *   HARNESS_AUTOPILOT_MERGE   — auto-merge PRs after creation (default: false)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

import type { PipelineBenchmarkResult, BenchmarkTarget } from './runner.js';
import { gitRevision, gitBranch } from './provenance.js';
import { deepseekBareDir } from './deepseekPipeline.js';
import { createGitHubClient } from '../../autopilot/gitHubClient.js';
import type { UpgradeFileT } from '../../autopilot/loopTypes.js';

// ============================================================================
// Provenance
// ============================================================================

export interface HarnessProvenance {
  /** Git SHA of the harness checkout (e.g. "dev@350c726" or "350c726"). */
  harnessSha: string | undefined;
  /** Git branch of the harness checkout. */
  harnessBranch: string | undefined;
  /** Git SHA of the target repo at the time of the run. */
  targetSha: string | undefined;
  /** Git branch of the target repo. */
  targetBranch: string | undefined;
  /** ISO timestamp of the run. */
  timestamp: string;
}

/**
 * Collect provenance for a harness run: git SHAs of both the harness checkout
 * and the target repo. This is the stamp that makes a benchmark number
 * traceable to the exact code that produced it.
 */
export function collectProvenance(targetRepoDir: string, harnessDir?: string): HarnessProvenance {
  const hDir = harnessDir ?? deepseekBareDir();
  return {
    harnessSha: gitRevision(hDir) ?? undefined,
    harnessBranch: gitBranch(hDir) ?? undefined,
    targetSha: gitRevision(targetRepoDir) ?? undefined,
    targetBranch: gitBranch(targetRepoDir) ?? undefined,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// Git operations
// ============================================================================

export interface GitConfig {
  repoPath: string;
  remote: string;
  branch: string;
  userName: string;
  userEmail: string;
}

export function gitConfig(): GitConfig {
  const repoPath = process.env.HARNESS_RESULTS_REPO?.trim() || '';
  return {
    repoPath,
    remote: process.env.HARNESS_RESULTS_REMOTE?.trim() || 'origin',
    branch: process.env.HARNESS_RESULTS_BRANCH?.trim() || 'main',
    userName: process.env.HARNESS_GIT_USER_NAME?.trim() || 'Harness Autopilot',
    userEmail: process.env.HARNESS_GIT_USER_EMAIL?.trim() || 'harness@recourse.local',
  };
}

function git(args: string[], cwd: string): { ok: boolean; stdout: string; stderr: string } {
  const res = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  return {
    ok: res.status === 0,
    stdout: res.stdout?.trim() ?? '',
    stderr: res.stderr?.trim() ?? '',
  };
}

function sanitizeCommitMessage(msg: string): string {
  return msg.replace(/[\r\n]+/g, ' ').slice(0, 200);
}

function uniqueRunDir(repoPath: string, timestamp: string): string {
  const base = timestamp.replace(/[:.]/g, '-');
  const unique = `${base}-${Date.now().toString(36)}`;
  return path.join(repoPath, 'runs', unique);
}

export interface CommitResult {
  ok: boolean;
  commitSha?: string;
  branch: string;
  filesCommitted: number;
  error?: string;
}

/**
 * Commit harness results to the results repo. Creates the repo if it doesn't
 * exist, initializes git if needed, and commits all result files.
 */
export function commitResults(
  results: PipelineBenchmarkResult[],
  target: BenchmarkTarget,
  provenance: HarnessProvenance,
  config: GitConfig = gitConfig(),
): CommitResult {
  if (!config.repoPath) {
    return { ok: false, branch: config.branch, filesCommitted: 0, error: 'HARNESS_RESULTS_REPO not set' };
  }

  if (fs.existsSync(config.repoPath) && !fs.statSync(config.repoPath).isDirectory()) {
    return { ok: false, branch: config.branch, filesCommitted: 0, error: `results repo path is not a directory: ${config.repoPath}` };
  }

  fs.mkdirSync(config.repoPath, { recursive: true });

  if (!fs.existsSync(path.join(config.repoPath, '.git'))) {
    const init = git(['init', '-q'], config.repoPath);
    if (!init.ok) return { ok: false, branch: config.branch, filesCommitted: 0, error: `git init failed: ${init.stderr}` };
    git(['checkout', '-q', '-b', config.branch], config.repoPath);
  }

  const runDir = uniqueRunDir(config.repoPath, provenance.timestamp);
  fs.mkdirSync(runDir, { recursive: true });

  const report = {
    generatedAt: provenance.timestamp,
    provenance,
    target: {
      repoDir: target.repoDir,
      task: target.task,
      testCommand: target.testCommand,
    },
    results: results.map((r) => ({
      pipeline: r.pipeline.id,
      pipelineName: r.pipeline.name,
      status: {
        available: r.status.available,
        detail: r.status.detail,
        version: r.status.version,
      },
      run: {
        ok: r.run.ok,
        exitCode: r.run.exitCode,
        durationMs: r.run.durationMs,
        error: r.run.error,
      },
      score: r.score,
    })),
  };

  const reportPath = path.join(runDir, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');

  const matrix = results.map((r) => ({
    pipeline: r.pipeline.id,
    ok: r.run.ok,
    score: r.score.score,
    testsPassed: r.score.testsPassed,
    filesChanged: r.score.diff.changedFiles.length,
    linesAdded: r.score.diff.linesAdded,
    linesRemoved: r.score.diff.linesRemoved,
    regressionRisk: r.score.regressionRisk,
    durationMs: r.run.durationMs,
  }));
  const matrixPath = path.join(runDir, 'matrix.json');
  fs.writeFileSync(matrixPath, JSON.stringify(matrix, null, 2) + '\n', 'utf-8');

  const summary = {
    timestamp: provenance.timestamp,
    provenance,
    pipelines: results.length,
    passing: results.filter((r) => r.run.ok && r.score.testsPassed !== false).length,
    total: results.length,
    best: results.sort((a, b) => (b.score.score ?? 0) - (a.score.score ?? 0))[0]?.pipeline.id ?? null,
  };
  const summaryPath = path.join(runDir, 'summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n', 'utf-8');

  const add = git(['add', '-A'], config.repoPath);
  if (!add.ok) {
    return { ok: false, branch: config.branch, filesCommitted: 0, error: `git add failed: ${add.stderr}` };
  }

  const commitMsg = sanitizeCommitMessage(
    `harness: ${results.length} pipelines on ${path.basename(target.repoDir)} — ${summary.passing}/${summary.total} passed [${provenance.harnessSha ?? 'unknown'}]`,
  );
  const commit = git(
    ['-c', `user.name=${config.userName}`, '-c', `user.email=${config.userEmail}`, 'commit', '-q', '-m', commitMsg],
    config.repoPath,
  );

  if (!commit.ok) {
    if (commit.stderr.includes('nothing to commit')) {
      return { ok: true, branch: config.branch, filesCommitted: 0 };
    }
    return { ok: false, branch: config.branch, filesCommitted: 0, error: `git commit failed: ${commit.stderr}` };
  }

  const sha = git(['rev-parse', '--short', 'HEAD'], config.repoPath).stdout;
  return { ok: true, commitSha: sha, branch: config.branch, filesCommitted: 3 };
}

export interface PushResult {
  ok: boolean;
  remote: string;
  branch: string;
  error?: string;
}

/**
 * Push the results repo to its remote. Configures the remote if it doesn't
 * exist yet.
 */
export function pushResults(config: GitConfig = gitConfig()): PushResult {
  if (!config.repoPath) {
    return { ok: false, remote: config.remote, branch: config.branch, error: 'HARNESS_RESULTS_REPO not set' };
  }

  const remotes = git(['remote'], config.repoPath);
  if (!remotes.stdout.includes(config.remote)) {
    const url = process.env.HARNESS_RESULTS_REMOTE_URL?.trim();
    if (!url) {
      return { ok: false, remote: config.remote, branch: config.branch, error: `remote '${config.remote}' not configured and HARNESS_RESULTS_REMOTE_URL not set` };
    }
    const add = git(['remote', 'add', config.remote, url], config.repoPath);
    if (!add.ok) return { ok: false, remote: config.remote, branch: config.branch, error: `git remote add failed: ${add.stderr}` };
  }

  const push = git(['push', '-u', config.remote, config.branch], config.repoPath);
  if (!push.ok) {
    return { ok: false, remote: config.remote, branch: config.branch, error: `git push failed: ${push.stderr}` };
  }

  return { ok: true, remote: config.remote, branch: config.branch };
}

// ============================================================================
// GitHub PR creation
// ============================================================================

export interface PRResult {
  ok: boolean;
  prNumber?: number;
  prUrl?: string;
  error?: string;
}

const MAX_PR_BODY_LENGTH = 65536;

function truncateBody(body: string): string {
  if (body.length <= MAX_PR_BODY_LENGTH) return body;
  return body.slice(0, MAX_PR_BODY_LENGTH - 3) + '...';
}

/**
 * Create a GitHub PR with harness results. Uses the existing gitHubClient
 * to open a PR from the results branch to the base branch.
 */
export async function createHarnessPR(
  results: PipelineBenchmarkResult[],
  target: BenchmarkTarget,
  provenance: HarnessProvenance,
  config: GitConfig = gitConfig(),
): Promise<PRResult> {
  const token = process.env.GITHUB_TOKEN?.trim();
  const owner = process.env.GITHUB_OWNER?.trim();
  const repo = process.env.GITHUB_REPO?.trim();

  if (!token || !owner || !repo) {
    return { ok: false, error: 'GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO must be set' };
  }

  const client = createGitHubClient({ token });
  const baseBranch = process.env.HARNESS_PR_BASE_BRANCH?.trim() || 'main';
  const headBranch = `harness/${provenance.timestamp.replace(/[:.]/g, '-')}`;

  const summary = results.map((r) =>
    `| ${r.pipeline.id} | ${r.run.ok ? 'PASS' : 'FAIL'} | ${r.score.score ?? '-'} | ${r.score.regressionRisk} | ${(r.run.durationMs / 1000).toFixed(1)}s |`,
  ).join('\n');

  const body = truncateBody([
    `## Harness Results`,
    ``,
    `**Target:** \`${path.basename(target.repoDir)}\``,
    `**Task:** ${target.task}`,
    `**Harness SHA:** \`${provenance.harnessSha ?? 'unknown'}\` (${provenance.harnessBranch ?? 'unknown'})`,
    `**Target SHA:** \`${provenance.targetSha ?? 'unknown'}\` (${provenance.targetBranch ?? 'unknown'})`,
    ``,
    `| Pipeline | Status | Score | Risk | Duration |`,
    `|----------|--------|-------|------|----------|`,
    summary,
    ``,
    `Generated: ${provenance.timestamp}`,
  ].join('\n'));

  try {
    const branchResult = await client.createBranch(owner, repo, baseBranch, headBranch);
    if (!branchResult) {
      const del = await client.closePR(owner, repo, 0).catch(() => undefined);
      void del;
    }

    const files: UpgradeFileT[] = [{
      path: 'README.md',
      action: 'modify',
      content: body,
    }];

    await client.createCommit(owner, repo, headBranch, files);

    const prNumber = await client.createDraftPR({
      owner,
      repo,
      title: `Harness: ${results.length} pipelines on ${path.basename(target.repoDir)}`,
      body,
      head: headBranch,
      base: baseBranch,
      draft: false,
    });

    return { ok: true, prNumber, prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ============================================================================
// Full autopilot loop
// ============================================================================

export interface AutopilotStep {
  name: string;
  ok: boolean;
  detail: string;
  durationMs: number;
}

export interface AutopilotResult {
  ok: boolean;
  steps: AutopilotStep[];
  provenance: HarnessProvenance;
  commit?: CommitResult;
  push?: PushResult;
  pr?: PRResult;
  merged: boolean;
  error?: string;
}

/**
 * Full autopilot loop: run harness → score → commit → push → PR → merge.
 *
 * This is the seamless ecosystem workflow: trigger it and the harness runs
 * against the target repo, scores the diff, commits results to the results
 * repo, pushes to remote, opens a GitHub PR, and optionally merges it.
 */
export async function runAutopilot(
  results: PipelineBenchmarkResult[],
  target: BenchmarkTarget,
  opts: { merge?: boolean } = {},
): Promise<AutopilotResult> {
  const steps: AutopilotStep[] = [];
  const merge = opts.merge ?? process.env.HARNESS_AUTOPILOT_MERGE === 'true';

  if (results.length === 0) {
    return { ok: false, steps, provenance: collectProvenance(target.repoDir), merged: false, error: 'no results to autopilot' };
  }

  const t0 = Date.now();
  const provenance = collectProvenance(target.repoDir);
  steps.push({ name: 'provenance', ok: true, detail: `harness=${provenance.harnessSha ?? '?'} target=${provenance.targetSha ?? '?'}`, durationMs: Date.now() - t0 });

  const t1 = Date.now();
  const commit = commitResults(results, target, provenance);
  steps.push({ name: 'commit', ok: commit.ok, detail: commit.ok ? `${commit.commitSha} (${commit.filesCommitted} files)` : commit.error ?? 'failed', durationMs: Date.now() - t1 });

  if (!commit.ok) {
    return { ok: false, steps, provenance, commit, merged: false, error: commit.error };
  }

  const t2 = Date.now();
  const push = pushResults();
  steps.push({ name: 'push', ok: push.ok, detail: push.ok ? `${push.remote}/${push.branch}` : push.error ?? 'failed', durationMs: Date.now() - t2 });

  if (!push.ok) {
    return { ok: false, steps, provenance, commit, push, merged: false, error: push.error };
  }

  const t3 = Date.now();
  const pr = await createHarnessPR(results, target, provenance);
  steps.push({ name: 'pr', ok: pr.ok, detail: pr.ok ? `PR #${pr.prNumber}` : pr.error ?? 'failed', durationMs: Date.now() - t3 });

  if (!pr.ok) {
    return { ok: false, steps, provenance, commit, push, pr, merged: false, error: pr.error };
  }

  let merged = false;
  if (merge && pr.prNumber) {
    const t4 = Date.now();
    const token = process.env.GITHUB_TOKEN?.trim();
    const owner = process.env.GITHUB_OWNER?.trim();
    const repo = process.env.GITHUB_REPO?.trim();
    if (token && owner && repo) {
      const client = createGitHubClient({ token });
      try {
        await client.mergePR(owner, repo, pr.prNumber);
        merged = true;
        steps.push({ name: 'merge', ok: true, detail: `PR #${pr.prNumber} merged`, durationMs: Date.now() - t4 });
      } catch (err) {
        steps.push({ name: 'merge', ok: false, detail: err instanceof Error ? err.message : String(err), durationMs: Date.now() - t4 });
      }
    }
  }

  const allOk = steps.every((s) => s.ok);
  return { ok: allOk, steps, provenance, commit, push, pr, merged };
}
