/**
 * Benchmark ledger — the self-attested, hash-chained record of every external
 * benchmark run. This is the public number: each entry records what was scored
 * (the fixed problem set + a registry attestation of the exact live sources),
 * the outcome, and the delta versus the previous run. Rewriting history breaks
 * the chain, so the "Recourse is getting more capable" claim is auditable.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { allBenchmarkProblems } from '../benchmark/benchmark.js';
import type { BenchmarkRun } from '../intake/types.js';

export interface BenchmarkRecord {
  id: string;
  at: number;
  solved: number;
  total: number;
  solvedIds: string[];
  /** Hash of the fixed problem set the run was scored against. */
  benchmarkHash: string;
  /** Hash of the scored live sources (attestation of exactly what ran). */
  registryHash: string;
  /** Delta vs the previous record (null for the first). */
  deltaSolved: number | null;
  prevHash: string;
  hash: string;
}

const GENESIS = '0'.repeat(64);

export function benchmarkLedgerFile(): string {
  return process.env.BENCHMARK_LEDGER_FILE || path.join(process.cwd(), 'data', 'benchmark-ledger.jsonl');
}

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** Stable hash of the full scored problem set (ids only — descriptions don't affect scoring). */
export function benchmarkSetHash(): string {
  return sha256Hex(allBenchmarkProblems().map((p) => p.id).join('|'));
}

function hashRecord(r: Omit<BenchmarkRecord, 'hash'>): string {
  return sha256Hex(
    JSON.stringify({
      id: r.id,
      at: r.at,
      solved: r.solved,
      total: r.total,
      solvedIds: r.solvedIds,
      benchmarkHash: r.benchmarkHash,
      registryHash: r.registryHash,
      deltaSolved: r.deltaSolved,
      prevHash: r.prevHash,
    }),
  );
}

export function readBenchmarkLedger(file = benchmarkLedgerFile()): BenchmarkRecord[] {
  try {
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, 'utf-8').trim();
    if (!raw) return [];
    return raw.split('\n').map((l) => JSON.parse(l) as BenchmarkRecord);
  } catch {
    return [];
  }
}

/** Append a run. Deterministic id/delta; hash-chained to the previous record. */
export function appendBenchmarkRun(
  run: BenchmarkRun,
  opts: { registryHash?: string; file?: string; at?: number } = {},
): BenchmarkRecord {
  const file = opts.file ?? benchmarkLedgerFile();
  const ledger = readBenchmarkLedger(file);
  const prev = ledger[ledger.length - 1];
  const prevHash = prev ? prev.hash : GENESIS;
  const base: Omit<BenchmarkRecord, 'hash'> = {
    id: `bench_${ledger.length + 1}`,
    at: opts.at ?? run.at ?? Date.now(),
    solved: run.solved,
    total: run.total,
    solvedIds: [...run.solvedIds].sort(),
    benchmarkHash: run.problemSetHash ?? benchmarkSetHash(),
    registryHash: opts.registryHash ?? '',
    deltaSolved: prev ? run.solved - prev.solved : null,
    prevHash,
  };
  const record: BenchmarkRecord = { ...base, hash: hashRecord(base) };
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(record) + '\n', 'utf-8');
  } catch (err) {
    console.warn('[benchmarkLedger] append failed:', err instanceof Error ? err.message : String(err));
  }
  return record;
}

/** Recompute the chain from raw records (pure, no filesystem). */
export function verifyBenchmarkRecords(records: BenchmarkRecord[]): { valid: boolean; brokenAt?: number } {
  let prev = GENESIS;
  for (let i = 0; i < records.length; i++) {
    if (records[i].prevHash !== prev) return { valid: false, brokenAt: i };
    const { hash: _h, ...content } = records[i];
    if (hashRecord(content) !== records[i].hash) return { valid: false, brokenAt: i };
    prev = records[i].hash;
  }
  return { valid: true };
}

export function verifyBenchmarkLedger(file = benchmarkLedgerFile()): { valid: boolean; length: number; brokenAt?: number } {
  const records = readBenchmarkLedger(file);
  const v = verifyBenchmarkRecords(records);
  return { valid: v.valid, length: records.length, brokenAt: v.brokenAt };
}

export interface LeaderboardEntry {
  rank: number;
  id: string;
  at: number;
  solved: number;
  total: number;
  pct: number;
  deltaSolved: number | null;
  registryHash: string;
}

/** Rank every recorded run by solved desc, then earliest first (ties). */
export function benchmarkLeaderboard(file = benchmarkLedgerFile()): LeaderboardEntry[] {
  const records = readBenchmarkLedger(file);
  return [...records]
    .sort((a, b) => b.solved - a.solved || a.at - b.at || a.id.localeCompare(b.id))
    .map((r, i) => ({
      rank: i + 1,
      id: r.id,
      at: r.at,
      solved: r.solved,
      total: r.total,
      pct: r.total > 0 ? Math.round((r.solved / r.total) * 10000) / 100 : 0,
      deltaSolved: r.deltaSolved,
      registryHash: r.registryHash,
    }));
}

export function latestBenchmarkRecord(file = benchmarkLedgerFile()): BenchmarkRecord | null {
  const records = readBenchmarkLedger(file);
  return records.length ? records[records.length - 1] : null;
}
