/**
 * Pipeline scorer — a shared quality signal across all four pipelines.
 *
 * Settlement-harness style scoring without the dependency: run the target's
 * test command in the worktree, combine the result with the measured diff into
 * a 0-100 composite plus named signals (regression risk, churn, coherence).
 *
 * Honest by construction: if no test command is configured the test result is
 * `null` and the score is explicitly flagged `measured: false` rather than
 * pretending the tests passed.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { SnapshotDiff } from './snapshot.js';
import { runShellCommand } from './subprocess.js';

export type RegressionRisk = 'MINIMAL' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export interface PipelineScore {
  /** True when at least one concrete signal (tests or diff) was measured. */
  measured: boolean;
  testCommand?: string;
  testsPassed: boolean | null;
  testExitCode: number | null;
  testDurationMs: number;
  testsTimedOut: boolean;
  diff: SnapshotDiff;
  regressionRisk: RegressionRisk;
  score: number | null;
  reasons: string[];
}

export interface ScoreOptions {
  testCommand?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  /**
   * Whether the pipeline invocation itself succeeded. When explicitly false the
   * composite is forced to 0: a pipeline that errored must not score on the
   * strength of tests passing against an unchanged worktree.
   */
  runOk?: boolean;
}

/** Resolve a test command: explicit arg -> PIPELINE_TEST_CMD -> package.json. */
export function resolveTestCommand(workdir: string, explicit?: string): string | undefined {
  if (explicit?.trim()) return explicit.trim();
  if (process.env.PIPELINE_TEST_CMD?.trim()) return process.env.PIPELINE_TEST_CMD.trim();
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(workdir, 'package.json'), 'utf-8'));
    const script = pkg?.scripts?.test;
    if (typeof script === 'string' && script.trim()) return 'npm test --silent';
  } catch {
    // No package.json / unreadable — caller may still pass a command.
  }
  return undefined;
}

export function regressionRiskFor(diff: SnapshotDiff): RegressionRisk {
  const churn = diff.linesAdded + diff.linesRemoved;
  const files = diff.changedFiles.length;
  const touchesCore = diff.changedFiles.some((f) =>
    /(^|\/)(package\.json|tsconfig[^/]*\.json|vite\.config\.|esbuild\.config\.|\.github\/|Dockerfile)/.test(f),
  );

  if (touchesCore || churn > 800 || files > 20) return 'CRITICAL';
  if (churn > 400 || files > 10) return 'HIGH';
  if (churn > 150 || files > 5) return 'MODERATE';
  if (churn > 40 || files > 2) return 'LOW';
  return 'MINIMAL';
}

export async function scorePipelineRun(
  workdir: string,
  diff: SnapshotDiff,
  opts: ScoreOptions = {},
): Promise<PipelineScore> {
  const reasons: string[] = [];
  const testCommand = resolveTestCommand(workdir, opts.testCommand);

  let testsPassed: boolean | null = null;
  let testExitCode: number | null = null;
  let testDurationMs = 0;
  let testsTimedOut = false;

  if (testCommand) {
    const res = await runShellCommand(testCommand, {
      cwd: workdir,
      timeoutMs: opts.timeoutMs ?? 300_000,
      env: opts.env,
    });
    testsPassed = res.ok;
    testExitCode = res.code;
    testDurationMs = res.durationMs;
    testsTimedOut = res.timedOut;
    if (res.timedOut) reasons.push('test run timed out');
    else if (!res.ok) reasons.push(`tests failed (exit ${res.code ?? 'null'})`);
  } else {
    reasons.push('no test command configured; test signal unmeasured');
  }

  const regressionRisk = regressionRiskFor(diff);
  if (regressionRisk === 'CRITICAL') reasons.push('change touches core/build files or is very high churn');
  else if (regressionRisk === 'HIGH') reasons.push('high churn or broad file spread');

  const churn = diff.linesAdded + diff.linesRemoved;
  const files = diff.changedFiles.length;

  let score: number | null;
  if (opts.runOk === false) {
    score = 0;
    reasons.push('pipeline run failed; no score for an unchanged worktree');
  } else if (testsPassed === false) {
    score = 0;
  } else if (files === 0) {
    // Tests may pass simply because nothing was attempted. No diff => no
    // demonstrated output, so cap the score rather than rewarding a no-op.
    reasons.push('no files changed');
    score = testsPassed === true ? 30 : 20;
  } else {
    const base = testsPassed === true ? 80 : 40;
    const changeBonus = Math.min(20, files * 4);
    const churnPenalty = churn > 400 ? 10 : 0;
    score = Math.max(0, Math.min(100, base + changeBonus - churnPenalty));
  }

  return {
    measured: testsPassed !== null || files > 0,
    ...(testCommand ? { testCommand } : {}),
    testsPassed,
    testExitCode,
    testDurationMs,
    testsTimedOut,
    diff,
    regressionRisk,
    score,
    reasons,
  };
}
