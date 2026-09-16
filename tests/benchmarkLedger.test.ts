import { describe, expect, it, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  appendBenchmarkRun,
  readBenchmarkLedger,
  verifyBenchmarkLedger,
  verifyBenchmarkRecords,
  benchmarkLeaderboard,
  latestBenchmarkRecord,
  benchmarkSetHash,
  sha256Hex,
} from '../src/lib/benchmarkLedger';

const dirs: string[] = [];
function freshFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-bench-'));
  dirs.push(dir);
  return path.join(dir, 'benchmark-ledger.jsonl');
}

afterEach(() => {
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

describe('benchmark ledger', () => {
  it('chains records with deterministic ids and per-run deltas', () => {
    const file = freshFile();
    const a = appendBenchmarkRun({ at: 1, solved: 3, total: 16, solvedIds: ['c', 'a', 'b'] }, { registryHash: 'r1', file });
    const b = appendBenchmarkRun({ at: 2, solved: 5, total: 16, solvedIds: ['a', 'b', 'c', 'd', 'e'] }, { registryHash: 'r2', file });
    expect(a.id).toBe('bench_1');
    expect(b.id).toBe('bench_2');
    expect(a.deltaSolved).toBeNull();
    expect(b.deltaSolved).toBe(2);
    expect(b.prevHash).toBe(a.hash);
    // solvedIds are stored sorted so the hash is order-independent of the engine.
    expect(a.solvedIds).toEqual(['a', 'b', 'c']);
    expect(verifyBenchmarkLedger(file)).toEqual({ valid: true, length: 2, brokenAt: undefined });
  });

  it('detects tampering in the chain', () => {
    const file = freshFile();
    appendBenchmarkRun({ at: 1, solved: 3, total: 16, solvedIds: ['a'] }, { file });
    appendBenchmarkRun({ at: 2, solved: 4, total: 16, solvedIds: ['a', 'b'] }, { file });
    const records = readBenchmarkLedger(file);
    records[1] = { ...records[1], solved: 99 };
    const verdict = verifyBenchmarkRecords(records);
    expect(verdict.valid).toBe(false);
    expect(verdict.brokenAt).toBe(1);
  });

  it('ranks runs into a leaderboard and returns the latest record', () => {
    const file = freshFile();
    appendBenchmarkRun({ at: 1, solved: 3, total: 16, solvedIds: [] }, { file });
    appendBenchmarkRun({ at: 2, solved: 7, total: 16, solvedIds: [] }, { file });
    appendBenchmarkRun({ at: 3, solved: 5, total: 16, solvedIds: [] }, { file });
    const board = benchmarkLeaderboard(file);
    expect(board.map((e) => e.solved)).toEqual([7, 5, 3]);
    expect(board[0].rank).toBe(1);
    expect(board[0].pct).toBeCloseTo(43.75, 2);
    expect(latestBenchmarkRecord(file)?.solved).toBe(5);
  });

  it('set hash is stable and changes with the problem set identity', () => {
    expect(benchmarkSetHash()).toHaveLength(64);
    expect(benchmarkSetHash()).toBe(benchmarkSetHash());
    expect(sha256Hex('a')).not.toBe(sha256Hex('b'));
  });
});
