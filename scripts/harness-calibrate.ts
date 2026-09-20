/**
 * Harness calibration.
 *
 * The composite rubric is a heuristic; this validates it against an INDEPENDENT
 * grader (RepoRank) and anchors the grade scale on real GitHub repos.
 *
 *   tsx scripts/harness-calibrate.ts --repos sindresorhus/is,expressjs/express,chalk/chalk
 *   tsx scripts/harness-calibrate.ts --task all --pipelines opencode,deepseek,axiom,settlement --out <file>
 *
 * Mode A (--repos): RepoRank-scores real GitHub repos -> what a "good" grade is.
 * Mode B (--task):  runs each pipeline on a lab task, scores it with the v2
 *                   rubric AND RepoRank, so the two orderings can be compared.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { installDefaultPipelines, listPipelines, runPipelineBenchmark } from '../src/lib/codingPipelines/index.js';
import { labTasks } from '../src/lib/codingPipelines/lab.js';
import { reporankScoreDir, reporankScoreRepo } from '../src/lib/codingPipelines/repoQuality.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : '';
}

interface AnchorRow { repo: string; overallScore: number | null; grade: string | null; error?: string }
interface CalibrationRow {
  pipeline: string;
  pipelineName: string;
  ok: boolean;
  composite: number | null;
  rubric?: { correctness: number; minimality: number; focus: number; speed: number; total: number };
  filesChanged: number;
  churn: number;
  durationMs: number;
  reporankScore: number | null;
  reporankGrade: string | null;
  reporankError?: string;
}

function rankOf(xs: Array<number | null>): number[] {
  const idx = xs.map((v, i) => ({ v: v ?? -1, i })).sort((a, b) => b.v - a.v);
  const rank: number[] = Array.from({ length: xs.length }, () => 0);
  idx.forEach((e, r) => { rank[e.i] = r + 1; });
  return rank;
}
function spearman(a: Array<number | null>, b: Array<number | null>): number | null {
  const pairs = a.map((v, i) => [v, b[i]]).filter(([x, y]) => x !== null && y !== null) as number[][];
  if (pairs.length < 2) return null;
  const av = pairs.map((p) => p[0]), bv = pairs.map((p) => p[1]);
  const ra = rankOf(av), rb = rankOf(bv);
  const n = pairs.length;
  const d2 = ra.reduce((s, r, i) => s + (r - rb[i]) ** 2, 0);
  return Math.round((1 - (6 * d2) / (n * (n * n - 1))) * 100) / 100;
}

async function calibrateRepos(repos: string[]): Promise<AnchorRow[]> {
  const rows: AnchorRow[] = [];
  for (const repo of repos) {
    process.stdout.write(`  anchor ${repo.padEnd(28)} … `);
    const r = await reporankScoreRepo(repo);
    rows.push({ repo, overallScore: r.overallScore ?? null, grade: r.gradeCategory ?? null, ...(r.error ? { error: r.error } : {}) });
    console.log(`score=${r.overallScore ?? '-'} grade=${r.gradeCategory ?? '-'}${r.error ? ' ERR=' + r.error : ''}`);
  }
  return rows;
}

async function calibrateTask(taskId: string, pipelines: string[]): Promise<CalibrationRow[]> {
  installDefaultPipelines();
  const task = labTasks().find((t) => t.id === taskId) ?? labTasks()[0];
  const rows: CalibrationRow[] = [];
  for (const id of pipelines) {
    process.stdout.write(`  ${task.id.padEnd(12)} ${id.padEnd(11)} … `);
    const r = await runPipelineBenchmark(id, {
      repoDir: task.repoDir,
      task: task.task,
      testCommand: task.testCommand,
      ...(task.contractPath ? { contractPath: task.contractPath } : {}),
      keepWorktree: true,
    });
    const rq = await reporankScoreDir(r.workdir).catch((e) => ({ ok: false, error: String(e) }));
    try { fs.rmSync(r.workdir, { recursive: true, force: true }); } catch { /* ignore */ }
    rows.push({
      pipeline: r.pipeline.id,
      pipelineName: r.pipeline.name,
      ok: r.run.ok && r.score.testsPassed !== false,
      composite: r.score.score,
      rubric: r.score.rubric,
      filesChanged: r.score.diff.changedFiles.length,
      churn: r.score.diff.linesAdded + r.score.diff.linesRemoved,
      durationMs: r.run.durationMs,
      reporankScore: 'overallScore' in rq ? (rq.overallScore ?? null) : null,
      reporankGrade: 'gradeCategory' in rq ? (rq.gradeCategory ?? null) : null,
      ...('error' in rq && rq.error ? { reporankError: String(rq.error) } : {}),
    });
    const row = rows[rows.length - 1];
    console.log(`composite=${row.composite ?? '-'} reporank=${row.reporankScore ?? '-'} (${row.reporankGrade ?? '-'}) files=${row.filesChanged} churn=${row.churn} ${(row.durationMs / 1000).toFixed(0)}s`);
  }
  return rows;
}

async function main(): Promise<void> {
  const outPath = arg('out') || path.join(os.homedir(), 'Downloads', 'Uplift', 'Benchmark Olympics', 'data', 'harness-calibration.json');
  const reposArg = arg('repos');
  const taskId = arg('task');

  const report: Record<string, unknown> = { generatedAt: new Date().toISOString() };

  if (reposArg) {
    console.log('\n=== RepoRank anchors (real GitHub repos) ===');
    report.anchors = await calibrateRepos(reposArg.split(',').map((s) => s.trim()).filter(Boolean));
  }

  if (taskId !== undefined) {
    const pipelines = arg('pipelines')?.split(',').map((s) => s.trim()).filter(Boolean)
      ?? listPipelines().map((p) => p.spec.id);
    console.log(`\n=== Calibration: task=${taskId || 'all'} pipelines=[${pipelines.join(',')}] ===`);
    const rows = await calibrateTask(taskId || 'all', pipelines);
    report.task = taskId || 'all';
    report.rows = rows;
    report.compositeVsReporank = spearman(rows.map((r) => r.composite), rows.map((r) => r.reporankScore));
    console.log('\n  composite ranking (v2):', [...rows].sort((a, b) => (b.composite ?? -1) - (a.composite ?? -1)).map((r) => `${r.pipeline}:${r.composite}`).join(' > '));
    console.log('  reporank  ranking    :', [...rows].sort((a, b) => (b.reporankScore ?? -1) - (a.reporankScore ?? -1)).map((r) => `${r.pipeline}:${r.reporankScore}`).join(' > '));
    console.log('  spearman(composite, reporank):', report.compositeVsReporank ?? 'n/a');
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');
  console.log(`\ncalibration: ${outPath}`);
}

main().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exitCode = 1; });
