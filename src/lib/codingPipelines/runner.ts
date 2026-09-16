/**
 * Unified pipeline runner — the benchmark harness.
 *
 * One target worktree per run: copy the repo, snapshot, dispatch the chosen
 * pipeline, snapshot again, score the diff, clean up. Every pipeline sees the
 * exact same starting state, which is what makes the head-to-head fair.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { PipelineId, PipelineSpec, PipelineStatus, PipelineRunResult } from './types.js';
import { getPipeline, installDefaultPipelines, listPipelines } from './registry.js';
import { snapshotDir, diffSnapshots } from './snapshot.js';
import { scorePipelineRun, type PipelineScore } from './scorer.js';
import { appendPipelineBenchmark, type PipelineBenchmarkRecord } from './ledger.js';

export interface BenchmarkTarget {
  /** Repo to benchmark against; copied into an ephemeral worktree per run. */
  repoDir: string;
  /** Natural-language coding task handed to each pipeline. */
  task: string;
  /** Required by the settlement pipeline. */
  contractPath?: string;
  /** Test command used by the scorer; falls back to package.json / env. */
  testCommand?: string;
  /** Pipeline invocation timeout. */
  pipelineTimeoutMs?: number;
  /** Scorer (test) timeout. */
  scoreTimeoutMs?: number;
  /** Extra env for the pipeline child and the scorer. */
  env?: Record<string, string>;
  /** Leave worktrees on disk for inspection (default: clean up). */
  keepWorktree?: boolean;
  /** Parent dir for worktrees (default: OS temp). */
  worktreeRoot?: string;
}

export interface PipelineBenchmarkResult {
  pipeline: PipelineSpec;
  status: PipelineStatus;
  run: PipelineRunResult;
  score: PipelineScore;
  workdir: string;
  startedAt: number;
}

const COPY_SKIP = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  'coverage',
  '.turbo',
  '.cache',
  '.settlement',
]);

/** Copy `repoDir` into a fresh temp worktree, skipping heavy/derived trees. */
export function prepareWorktree(repoDir: string, worktreeRoot?: string): string {
  if (!fs.existsSync(repoDir)) throw new Error(`repoDir not found: ${repoDir}`);
  const parent = worktreeRoot || fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-bench-'));
  const workdir = fs.mkdtempSync(path.join(parent, 'wt-'));
  fs.cpSync(repoDir, workdir, {
    recursive: true,
    filter: (src) => !COPY_SKIP.has(path.basename(src)),
  });
  return workdir;
}

export async function runPipelineBenchmark(
  id: string,
  target: BenchmarkTarget,
): Promise<PipelineBenchmarkResult> {
  installDefaultPipelines();
  const pipeline = getPipeline(id);
  if (!pipeline) throw new Error(`unknown pipeline: ${id}`);

  const startedAt = Date.now();
  const workdir = prepareWorktree(target.repoDir, target.worktreeRoot);
  const status = await pipeline.status();
  const before = snapshotDir(workdir);

  let run: PipelineRunResult;
  try {
    run = await pipeline.run({
      task: target.task,
      workdir,
      ...(target.contractPath ? { contractPath: target.contractPath } : {}),
      ...(target.pipelineTimeoutMs ? { timeoutMs: target.pipelineTimeoutMs } : {}),
      ...(target.env ? { env: target.env } : {}),
    });
  } catch (err) {
    run = {
      ok: false,
      id: pipeline.spec.id,
      stdout: '',
      stderr: '',
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const after = snapshotDir(workdir);
  const diff = diffSnapshots(before, after);
  const score = await scorePipelineRun(workdir, diff, {
    runOk: run.ok,
    ...(target.testCommand ? { testCommand: target.testCommand } : {}),
    ...(target.scoreTimeoutMs ? { timeoutMs: target.scoreTimeoutMs } : {}),
    ...(target.env ? { env: target.env } : {}),
  });

  if (!target.keepWorktree) {
    fs.rmSync(workdir, { recursive: true, force: true });
  }

  return { pipeline: pipeline.spec, status, run, score, workdir, startedAt };
}

/** Run several pipelines against the same target, sequentially. */
export async function runPipelineBenchmarks(
  ids: string[],
  target: BenchmarkTarget,
): Promise<PipelineBenchmarkResult[]> {
  installDefaultPipelines();
  const results: PipelineBenchmarkResult[] = [];
  for (const id of ids) {
    results.push(await runPipelineBenchmark(id, target));
  }
  return results;
}

export async function runAllPipelineBenchmarks(target: BenchmarkTarget): Promise<PipelineBenchmarkResult[]> {
  installDefaultPipelines();
  return runPipelineBenchmarks(listPipelines().map((p) => p.spec.id), target);
}

/** Persist results to the hash-chained pipeline ledger. Returns the records. */
export function recordBenchmarkResults(
  results: PipelineBenchmarkResult[],
  target: BenchmarkTarget,
  file?: string,
): PipelineBenchmarkRecord[] {
  const records: PipelineBenchmarkRecord[] = [];
  for (const r of results) {
    const base = {
      pipeline: r.pipeline.id as PipelineId,
      pipelineName: r.pipeline.name,
      ...(r.status.version ? { pipelineVersion: r.status.version } : {}),
      task: target.task,
      repoDir: target.repoDir,
      ok: r.run.ok,
      score: r.score.score,
      testsPassed: r.score.testsPassed,
      filesChanged: r.score.diff.changedFiles.length,
      linesAdded: r.score.diff.linesAdded,
      linesRemoved: r.score.diff.linesRemoved,
      regressionRisk: r.score.regressionRisk,
      durationMs: r.run.durationMs,
      ...(r.run.error ? { error: r.run.error } : {}),
    };
    records.push(file ? appendPipelineBenchmark(base, file) : appendPipelineBenchmark(base));
  }
  return records;
}
