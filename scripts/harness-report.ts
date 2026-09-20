/**
 * Harness benchmark report.
 *
 * Reads one or more pipeline-benchmark ledgers (written by
 * scripts/pipeline-benchmark.ts) and emits a Benchmark Olympics report JSON:
 * per-pipeline standings aggregated across ALL runs (pass rate, median score,
 * median duration, churn) plus a summary. The Benchmark Olympics app serves
 * this file at /api/harness-benchmark and renders it in the Harness Benchmark
 * panel.
 *
 *   tsx scripts/harness-report.ts <ledger.jsonl[,ledger2.jsonl...]> <out.json> [profile.json]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { readPipelineLedger, type PipelineBenchmarkRecord } from '../src/lib/codingPipelines/index.js';

export interface HarnessStanding {
  rank: number;
  pipeline: string;
  pipelineName: string;
  version?: string;
  /** True when every recorded run passed. */
  ok: boolean;
  runs: number;
  passes: number;
  passRate: number;
  ciLow: number;
  ciHigh: number;
  /** Median score across runs (the `score` field kept for the panel). */
  score: number | null;
  medianScore: number | null;
  /** Reliability-weighted score = passRate% * medianScore. */
  expectedScore: number | null;
  bestScore: number | null;
  testsPassed: boolean | null;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  churn: number;
  regressionRisk: string;
  /** Median duration (kept as `durationMs` for the panel). */
  durationMs: number;
  minDurationMs: number;
  medianDurationMs: number;
  lastError?: string;
}

export interface HarnessReport {
  generatedAt: string;
  source: { ledger: string; task: string; repoDir: string };
  standings: HarnessStanding[];
  summary: {
    pipelines: number;
    totalRuns: number;
    fullyPassing: number;
    avgMedianScore: number | null;
    avgExpectedScore: number | null;
    bestPipeline: string | null;
    fastestPipeline: string | null;
    totalFiles: number;
    totalChurn: number;
  };
  /** Optional Axiom loop stage-timing profile (scripts/axiom-profile.ts). */
  efficiency?: unknown;
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round(((s[mid - 1] + s[mid]) / 2) * 100) / 100;
}

/** Wilson 95% interval for a proportion, as percentages. */
function wilson(passes: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 0];
  const p = passes / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, Math.round((center - margin) * 1000) / 10), Math.min(100, Math.round((center + margin) * 1000) / 10)];
}

/** Aggregate every ledger into one standing per pipeline (all runs). */
export function buildHarnessReport(records: PipelineBenchmarkRecord[], ledgerPath: string): HarnessReport {
  const byPipeline = new Map<string, PipelineBenchmarkRecord[]>();
  for (const r of records) {
    const list = byPipeline.get(r.pipeline) ?? [];
    list.push(r);
    byPipeline.set(r.pipeline, list);
  }

  const standings = [...byPipeline.entries()]
    .map(([pipeline, runs]) => {
      const scored = runs.map((r) => r.score).filter((s): s is number => typeof s === 'number');
      const passes = runs.filter((r) => r.ok && r.testsPassed !== false).length;
      const last = runs[runs.length - 1];
      const lastFailed = [...runs].reverse().find((r) => !r.ok || r.testsPassed === false);
      const version = [...runs].reverse().find((r) => r.pipelineVersion)?.pipelineVersion;
      const medianDuration = median(runs.map((r) => r.durationMs));
      const rank = (risk: string): number => ['MINIMAL', 'LOW', 'MODERATE', 'HIGH', 'CRITICAL'].indexOf(risk);
      const worstRisk = runs.map((r) => r.regressionRisk).sort((a, b) => rank(b) - rank(a))[0] ?? 'MINIMAL';
      const passRate = Math.round((passes / runs.length) * 1000) / 10;
      const [ciLow, ciHigh] = wilson(passes, runs.length);
      const med = median(scored);
      // Reliability-weighted expected score: a 100%-reliable 92 beats a 66%-reliable
      // 100. Prevents a pipeline that fails 1 in 3 runs from topping the table.
      const expectedScore = med === null ? null : Math.round((passRate / 100) * med * 10) / 10;

      return {
        pipeline,
        pipelineName: last.pipelineName,
        ...(version ? { version } : {}),
        ok: passes === runs.length,
        runs: runs.length,
        passes,
        passRate,
        ciLow,
        ciHigh,
        score: med,
        medianScore: med,
        expectedScore,
        bestScore: scored.length ? Math.max(...scored) : null,
        testsPassed: passes === runs.length ? true : passes === 0 ? false : null,
        filesChanged: Math.round(median(runs.map((r) => r.filesChanged)) ?? 0),
        linesAdded: Math.round(median(runs.map((r) => r.linesAdded)) ?? 0),
        linesRemoved: Math.round(median(runs.map((r) => r.linesRemoved)) ?? 0),
        churn: Math.round(median(runs.map((r) => r.linesAdded + r.linesRemoved)) ?? 0),
        regressionRisk: worstRisk,
        durationMs: medianDuration ?? last.durationMs,
        minDurationMs: Math.min(...runs.map((r) => r.durationMs)),
        medianDurationMs: medianDuration ?? last.durationMs,
        ...(lastFailed?.error ? { lastError: lastFailed.error } : {}),
      };
    })
    // Reliability first (pass rate, then Wilson lower bound), then expected
    // score, then speed. A failing pipeline can no longer outrank a green one.
    .sort((a, b) =>
      b.passRate - a.passRate ||
      b.ciLow - a.ciLow ||
      (b.expectedScore ?? -1) - (a.expectedScore ?? -1) ||
      a.medianDurationMs - b.medianDurationMs,
    )
    .map((s, i) => ({ rank: i + 1, ...s }));

  const medians = standings.map((s) => s.medianScore).filter((s): s is number => typeof s === 'number');
  const avgMedianScore = medians.length ? Math.round((medians.reduce((a, b) => a + b, 0) / medians.length) * 100) / 100 : null;
  const expected = standings.map((s) => s.expectedScore).filter((s): s is number => typeof s === 'number');
  const avgExpectedScore = expected.length ? Math.round((expected.reduce((a, b) => a + b, 0) / expected.length) * 100) / 100 : null;
  const best = standings[0] ?? null;
  const fastest = [...standings].sort((a, b) => a.medianDurationMs - b.medianDurationMs)[0] ?? null;
  const last = records[records.length - 1];

  return {
    generatedAt: new Date().toISOString(),
    source: {
      ledger: ledgerPath,
      task: last?.task ?? '',
      repoDir: last?.repoDir ?? '',
    },
    standings,
    summary: {
      pipelines: standings.length,
      totalRuns: records.length,
      fullyPassing: standings.filter((s) => s.passRate === 100).length,
      avgMedianScore,
      avgExpectedScore,
      bestPipeline: best?.pipelineName ?? null,
      fastestPipeline: fastest?.pipelineName ?? null,
      totalFiles: standings.reduce((a, s) => a + s.filesChanged, 0),
      totalChurn: standings.reduce((a, s) => a + s.churn, 0),
    },
  };
}

function main(): void {
  const ledgerArg = process.argv[2];
  const outPath = process.argv[3];
  if (!ledgerArg || !outPath) {
    console.error('usage: harness-report.ts <ledger.jsonl[,ledger2.jsonl...]> <out.json> [profile.json]');
    process.exitCode = 1;
    return;
  }
  const ledgerPaths = ledgerArg.split(',').map((p) => p.trim()).filter(Boolean);
  const records = ledgerPaths.flatMap((p) => readPipelineLedger(p));
  if (!records.length) {
    console.error(`no records in ${ledgerArg}`);
    process.exitCode = 1;
    return;
  }
  const report = buildHarnessReport(records, ledgerPaths.join(', '));
  const profilePath = process.argv[4];
  if (profilePath) {
    try {
      if (fs.existsSync(profilePath)) report.efficiency = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
    } catch {
      // best-effort; report still valid without the profile
    }
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');
  console.log(JSON.stringify({ out: outPath, pipelines: report.summary.pipelines, runs: report.summary.totalRuns, best: report.summary.bestPipeline, avgMedianScore: report.summary.avgMedianScore }));
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('harness-report.ts')) main();
