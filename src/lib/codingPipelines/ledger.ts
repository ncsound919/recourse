/**
 * Pipeline benchmark ledger — hash-chained JSONL record of every head-to-head
 * run. Mirrors src/lib/benchmarkLedger.ts so the "which pipeline is best"
 * claim stays auditable: rewriting a past record breaks the chain.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { sha256Hex } from '../benchmarkLedger.js';
import type { PipelineId } from './types.js';

export interface PipelineBenchmarkRecord {
  id: string;
  at: number;
  pipeline: PipelineId;
  pipelineName: string;
  /** Bare-harness provenance (git branch@rev) when the pipeline is a checkout. */
  pipelineVersion?: string;
  task: string;
  repoDir: string;
  ok: boolean;
  score: number | null;
  testsPassed: boolean | null;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  regressionRisk: string;
  durationMs: number;
  error?: string;
  prevHash: string;
  hash: string;
}

const GENESIS = '0'.repeat(64);

export function pipelineLedgerFile(): string {
  return (
    process.env.PIPELINE_BENCHMARK_LEDGER_FILE ||
    path.join(process.cwd(), 'data', 'pipeline-benchmarks.jsonl')
  );
}

function hashRecord(r: Omit<PipelineBenchmarkRecord, 'hash'>): string {
  const { error: _e, ...stable } = r;
  return sha256Hex(JSON.stringify({ ...stable, error: r.error ?? null }));
}

export function readPipelineLedger(file = pipelineLedgerFile()): PipelineBenchmarkRecord[] {
  try {
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, 'utf-8').trim();
    if (!raw) return [];
    return raw.split('\n').map((l) => JSON.parse(l) as PipelineBenchmarkRecord);
  } catch {
    return [];
  }
}

export function appendPipelineBenchmark(
  record: Omit<PipelineBenchmarkRecord, 'id' | 'prevHash' | 'hash' | 'at'> & { at?: number },
  file = pipelineLedgerFile(),
): PipelineBenchmarkRecord {
  const ledger = readPipelineLedger(file);
  const prev = ledger[ledger.length - 1];
  const base: Omit<PipelineBenchmarkRecord, 'hash'> = {
    ...record,
    at: record.at ?? Date.now(),
    id: `pipe_${ledger.length + 1}`,
    prevHash: prev ? prev.hash : GENESIS,
  };
  const full: PipelineBenchmarkRecord = { ...base, hash: hashRecord(base) };
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(full) + '\n', 'utf-8');
  } catch (err) {
    console.warn('[pipelineLedger] append failed:', err instanceof Error ? err.message : String(err));
  }
  return full;
}

export function verifyPipelineRecords(records: PipelineBenchmarkRecord[]): { valid: boolean; brokenAt?: number } {
  let prev = GENESIS;
  for (let i = 0; i < records.length; i++) {
    if (records[i].prevHash !== prev) return { valid: false, brokenAt: i };
    const { hash: _h, ...content } = records[i];
    if (hashRecord(content) !== records[i].hash) return { valid: false, brokenAt: i };
    prev = records[i].hash;
  }
  return { valid: true };
}

export interface PipelineStanding {
  pipeline: PipelineId;
  runs: number;
  passes: number;
  avgScore: number | null;
  bestScore: number | null;
}

/** Aggregate the ledger into a per-pipeline leaderboard. */
export function pipelineStandings(file = pipelineLedgerFile()): PipelineStanding[] {
  const byPipeline = new Map<PipelineId, PipelineBenchmarkRecord[]>();
  for (const r of readPipelineLedger(file)) {
    const list = byPipeline.get(r.pipeline) ?? [];
    list.push(r);
    byPipeline.set(r.pipeline, list);
  }
  return [...byPipeline.entries()]
    .map(([pipeline, runs]) => {
      const scored = runs.filter((r) => typeof r.score === 'number') as Array<{ score: number; ok: boolean }>;
      const avg = scored.length ? scored.reduce((s, r) => s + r.score, 0) / scored.length : null;
      const best = scored.length ? Math.max(...scored.map((r) => r.score)) : null;
      return {
        pipeline,
        runs: runs.length,
        passes: runs.filter((r) => r.ok && r.testsPassed !== false).length,
        avgScore: avg === null ? null : Math.round(avg * 100) / 100,
        bestScore: best,
      };
    })
    .sort((a, b) => (b.avgScore ?? -1) - (a.avgScore ?? -1) || b.passes - a.passes);
}
