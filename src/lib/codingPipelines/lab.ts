/**
 * Harness Lab — rigorous, repeatable harness evaluation.
 *
 * Where the single benchmark run compares pipelines on one task, the lab runs a
 * SUITE of tasks (independent per-feature verifiers), repeats each cell, and
 * classifies failures so we get pass rates with confidence intervals, score
 * distributions, a harness×category strength matrix, and a failure taxonomy —
 * the raw material recourse's learning/trend/synergy/healing systems consume.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { PipelineBenchmarkResult, BenchmarkTarget } from './runner.js';
import { runPipelineBenchmark } from './runner.js';

export interface LabTask {
  id: string;
  category: string;
  repoDir: string;
  task: string;
  testCommand: string;
  contractPath?: string;
}

export interface LabRun {
  id: string;
  at: number;
  taskId: string;
  category: string;
  pipeline: string;
  pipelineName: string;
  version?: string;
  repeat: number;
  ok: boolean;
  score: number | null;
  testsPassed: boolean | null;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  regressionRisk: string;
  durationMs: number;
  failureClass: string;
  scoringVersion?: number;
  rubric?: { correctness: number; minimality: number; focus: number; speed: number; total: number };
  error?: string;
}

export type FailureClass =
  | 'pass'
  | 'tests_fail'
  | 'no_diff'
  | 'module_error'
  | 'timeout'
  | 'action_cap'
  | 'loop_stall'
  | 'infra_error'
  | 'error';

function home(...p: string[]): string {
  return path.join(os.homedir(), ...p);
}

export function labTasksDir(): string {
  return process.env.LAB_TASKS_DIR?.trim() || home('Downloads', 'bare-harnesses', '_tasks', 'lab');
}

export function labContractPath(): string | undefined {
  const p =
    process.env.LAB_CONTRACT?.trim() ||
    home('Downloads', 'bare-harnesses', '_tasks', 'multifile.deferred.contract.json');
  return fs.existsSync(p) ? p : undefined;
}

/** Settlement contract for the "build a small tool" task. */
export function labToolContractPath(): string | undefined {
  const p =
    process.env.LAB_TOOL_CONTRACT?.trim() ||
    home('Downloads', 'bare-harnesses', '_tasks', 'tool.contract.json');
  return fs.existsSync(p) ? p : undefined;
}

const MODULE_TASK = (module: string, api: string): string =>
  `Create src/${module}.js implementing ${api}. Read test/${module}.js for the exact expected behavior. Do not modify anything under test/.`;

/** The default task suite: three single-file tasks plus the multi-file rollup. */
export function labTasks(): LabTask[] {
  const repoDir = labTasksDir();
  const contractPath = labContractPath();
  const toolContract = labToolContractPath();
  return [
    {
      id: 'validation',
      category: 'single-file',
      repoDir,
      task: MODULE_TASK('validation', 'isEmail(s) and isStrongPassword(s)'),
      testCommand: 'node test/validation.js',
      ...(contractPath ? { contractPath } : {}),
    },
    {
      id: 'format',
      category: 'single-file',
      repoDir,
      task: MODULE_TASK('format', 'formatCurrency(n) and slugify(s)'),
      testCommand: 'node test/format.js',
      ...(contractPath ? { contractPath } : {}),
    },
    {
      id: 'collections',
      category: 'single-file',
      repoDir,
      task: MODULE_TASK('collections', 'uniq(arr) and chunk(arr, size)'),
      testCommand: 'node test/collections.js',
      ...(contractPath ? { contractPath } : {}),
    },
    {
      id: 'all',
      category: 'multi-file',
      repoDir,
      task: 'Create src/validation.js, src/format.js, and src/collections.js so that `node test/run.js` passes. Read the test files for exact behavior. Do not modify anything under test/.',
      testCommand: 'node test/run.js',
      ...(contractPath ? { contractPath } : {}),
    },
    {
      id: 'bugfix',
      category: 'bugfix',
      repoDir,
      task: 'Fix the bug in src/round.js so that round2(n) rounds to 2 decimal places (e.g. 1.239 -> 1.24, 1.2345 -> 1.23). Read test/bugfix.js for the exact expectations and make the minimal change. Do not modify anything under test/.',
      testCommand: 'node test/bugfix.js',
      ...(contractPath ? { contractPath } : {}),
    },
    {
      id: 'extend',
      category: 'extend',
      repoDir,
      task: 'Add a multiply(a, b) export to src/mathx.js WITHOUT breaking the existing add export. Read test/extend.js for the exact expectations. Do not modify anything under test/.',
      testCommand: 'node test/extend.js',
      ...(contractPath ? { contractPath } : {}),
    },
    {
      id: 'tool',
      category: 'tool',
      repoDir,
      task: 'Build a small CLI tool at bin/tool.js that converts CSV to JSON. Read test/tool.js for the exact CLI contract (stdin, file arg, quoted fields, --help, malformed input -> non-zero exit). Create only bin/tool.js; do not modify anything under test/.',
      testCommand: 'node test/tool.js',
      ...(toolContract ? { contractPath: toolContract } : {}),
    },
  ];
}

/** Classify a run's failure mode from its error/score signals. */
export function classifyFailure(r: PipelineBenchmarkResult): FailureClass {
  const passed = r.run.ok && r.score.testsPassed !== false;
  if (passed) return 'pass';
  const text = `${r.run.error ?? ''}\n${r.run.stderr ?? ''}\n${r.run.stdout ?? ''}`.toLowerCase();
  const reasons = (r.score.reasons ?? []).join(' ').toLowerCase();
  if (r.score.testsTimedOut || /timed out after/.test(text)) return 'timeout';
  if (/no files changed|no diff/.test(reasons)) return 'no_diff';
  if (/exceeded max_actions/.test(text)) return 'action_cap';
  if (/cannot find module|requirestack|module_not_found|modulenotfound|err_require/.test(text)) return 'module_error';
  if (/stalled|max_iterations|max iterations/.test(text)) return 'loop_stall';
  if (/eaddrinuse|econnrefused|spawn .* enoent|http 401|unauthorized/.test(text)) return 'infra_error';
  if (r.score.testsPassed === false) return 'tests_fail';
  return 'error';
}

export interface LabRunCellOptions {
  repeats?: number;
  repeat?: number;
  env?: Record<string, string>;
  pipelineTimeoutMs?: number;
}

export async function runLabCell(
  pipelineId: string,
  task: LabTask,
  opts: LabRunCellOptions = {},
): Promise<LabRun> {
  const target: BenchmarkTarget = {
    repoDir: task.repoDir,
    task: task.task,
    testCommand: task.testCommand,
    ...(task.contractPath ? { contractPath: task.contractPath } : {}),
    ...(opts.pipelineTimeoutMs ? { pipelineTimeoutMs: opts.pipelineTimeoutMs } : {}),
    ...(opts.env ? { env: opts.env } : {}),
  };
  const r = await runPipelineBenchmark(pipelineId, target);
  return {
    id: `${task.id}:${pipelineId}:r${opts.repeat ?? 1}:${Date.now().toString(36)}`,
    at: r.startedAt,
    taskId: task.id,
    category: task.category,
    pipeline: r.pipeline.id,
    pipelineName: r.pipeline.name,
    ...(r.status.version ? { version: r.status.version } : {}),
    repeat: opts.repeat ?? 1,
    ok: r.run.ok && r.score.testsPassed !== false,
    score: r.score.score,
    testsPassed: r.score.testsPassed,
    filesChanged: r.score.diff.changedFiles.length,
    linesAdded: r.score.diff.linesAdded,
    linesRemoved: r.score.diff.linesRemoved,
    regressionRisk: r.score.regressionRisk,
    durationMs: r.run.durationMs,
    failureClass: classifyFailure(r),
    scoringVersion: r.score.scoringVersion,
    rubric: r.score.rubric,
    ...(r.run.error ? { error: r.run.error } : {}),
  };
}

// =============================================================================
// LEDGER
// =============================================================================

export function labLedgerFile(): string {
  return process.env.HARNESS_LAB_LEDGER_FILE || path.join(process.cwd(), 'data', 'harness-lab.jsonl');
}

export function appendLabRun(run: LabRun, file = labLedgerFile()): LabRun {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(run) + '\n', 'utf-8');
  } catch (err) {
    console.warn('[harnessLab] append failed:', err instanceof Error ? err.message : String(err));
  }
  return run;
}

export function readLabRuns(file = labLedgerFile()): LabRun[] {
  try {
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as LabRun);
  } catch {
    return [];
  }
}

// =============================================================================
// STATISTICS
// =============================================================================

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round(((s[mid - 1] + s[mid]) / 2) * 100) / 100;
}

function quantile(nums: number[], q: number): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? s[lo] : Math.round((s[lo] + (s[hi] - s[lo]) * (pos - lo)) * 100) / 100;
}

/** Wilson score interval for a binomial proportion, returned as percentages. */
export function wilson(passes: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 0];
  const p = passes / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, Math.round((center - margin) * 1000) / 10), Math.min(100, Math.round((center + margin) * 1000) / 10)];
}

export interface LabStanding {
  pipeline: string;
  pipelineName: string;
  version?: string;
  runs: number;
  passes: number;
  passRate: number;
  ciLow: number;
  ciHigh: number;
  medianScore: number | null;
  iqrScore: number | null;
  bestScore: number | null;
  medianDurationMs: number;
  failureClasses: Record<string, number>;
  lastError?: string;
}

export interface LabMatrixCell {
  pipeline: string;
  passes: number;
  runs: number;
  passRate: number;
  medianScore: number | null;
}

export interface LabMatrixRow {
  taskId: string;
  category: string;
  cells: LabMatrixCell[];
}

export interface LabSummary {
  total: number;
  pipelines: number;
  tasks: number;
  standings: LabStanding[];
  matrix: LabMatrixRow[];
  failureTaxonomy: Record<string, number>;
}

export function summarizeLab(runs: LabRun[]): LabSummary {
  const byPipeline = new Map<string, LabRun[]>();
  for (const r of runs) {
    const list = byPipeline.get(r.pipeline) ?? [];
    list.push(r);
    byPipeline.set(r.pipeline, list);
  }

  const standings: LabStanding[] = [...byPipeline.entries()]
    .map(([pipeline, rs]) => {
      const passes = rs.filter((r) => r.ok).length;
      const scored = rs.map((r) => r.score).filter((s): s is number => typeof s === 'number');
      const [ciLow, ciHigh] = wilson(passes, rs.length);
      const failureClasses: Record<string, number> = {};
      for (const r of rs) if (r.failureClass !== 'pass') failureClasses[r.failureClass] = (failureClasses[r.failureClass] ?? 0) + 1;
      const lastFail = [...rs].reverse().find((r) => !r.ok);
      const version = [...rs].reverse().find((r) => r.version)?.version;
      return {
        pipeline,
        pipelineName: rs[rs.length - 1].pipelineName,
        ...(version ? { version } : {}),
        runs: rs.length,
        passes,
        passRate: Math.round((passes / rs.length) * 1000) / 10,
        ciLow,
        ciHigh,
        medianScore: median(scored),
        iqrScore: scored.length ? Math.round(((quantile(scored, 0.75) ?? 0) - (quantile(scored, 0.25) ?? 0)) * 100) / 100 : null,
        bestScore: scored.length ? Math.max(...scored) : null,
        medianDurationMs: median(rs.map((r) => r.durationMs)) ?? 0,
        failureClasses,
        ...(lastFail?.error ? { lastError: lastFail.error } : {}),
      };
    })
    .sort((a, b) => b.passRate - a.passRate || (b.medianScore ?? -1) - (a.medianScore ?? -1));

  const taskIds = [...new Set(runs.map((r) => r.taskId))].sort();
  const matrix: LabMatrixRow[] = taskIds.map((taskId) => {
    const taskRuns = runs.filter((r) => r.taskId === taskId);
    const pipelines = [...new Set(taskRuns.map((r) => r.pipeline))].sort();
    return {
      taskId,
      category: taskRuns[0]?.category ?? 'unknown',
      cells: pipelines.map((pipeline) => {
        const rs = taskRuns.filter((r) => r.pipeline === pipeline);
        const passes = rs.filter((r) => r.ok).length;
        const scored = rs.map((r) => r.score).filter((s): s is number => typeof s === 'number');
        return {
          pipeline,
          passes,
          runs: rs.length,
          passRate: rs.length ? Math.round((passes / rs.length) * 1000) / 10 : 0,
          medianScore: median(scored),
        };
      }),
    };
  });

  const failureTaxonomy: Record<string, number> = {};
  for (const r of runs) if (r.failureClass !== 'pass') failureTaxonomy[r.failureClass] = (failureTaxonomy[r.failureClass] ?? 0) + 1;

  return {
    total: runs.length,
    pipelines: byPipeline.size,
    tasks: taskIds.length,
    standings,
    matrix,
    failureTaxonomy,
  };
}

/** Per-pipeline score series (oldest→newest) for recourse's trend engine. */
export function toTrendSeries(runs: LabRun[]): Array<{ id: string; name: string; domain: string; points: Array<{ t: number; value: number }> }> {
  const byPipeline = new Map<string, LabRun[]>();
  for (const r of runs) {
    const list = byPipeline.get(r.pipeline) ?? [];
    list.push(r);
    byPipeline.set(r.pipeline, list);
  }
  return [...byPipeline.entries()].map(([pipeline, rs]) => {
    const ordered = [...rs].sort((a, b) => a.at - b.at);
    return {
      id: `bench:${pipeline}`,
      name: ordered[ordered.length - 1]?.pipelineName ?? pipeline,
      domain: 'coding',
      points: ordered.map((r, i) => ({ t: i + 1, value: r.score ?? (r.ok ? 100 : 0) })),
    };
  });
}
