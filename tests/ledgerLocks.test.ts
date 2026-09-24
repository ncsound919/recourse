import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendPipelineBenchmark } from '../src/lib/codingPipelines/ledger';
import { FleetRecursionLedger } from '../src/lib/openEnded/fleetRecursion';
import { RatingStore } from '../src/lib/rating/store';

const dirs: string[] = [];
function tmpFile(name: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-ledger-lock-'));
  dirs.push(d);
  return path.join(d, name);
}
afterEach(() => {
  for (const d of dirs.splice(0)) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* noop */ } }
});

describe('hash-chain ledgers are serialized by a cross-process lock', () => {
  it('pipeline ledger refuses to append while the lock is held', () => {
    const file = tmpFile('pipeline.jsonl');
    fs.writeFileSync(`${file}.lock`, 'held');
    const record = {
      pipeline: 'opencode', pipelineName: 'x', task: 't', repoDir: '.',
      ok: true, score: 1, testsPassed: true, filesChanged: 0,
      linesAdded: 0, linesRemoved: 0, regressionRisk: 'low', durationMs: 1,
    } as unknown as Parameters<typeof appendPipelineBenchmark>[0];
    expect(() => appendPipelineBenchmark(record, file)).toThrow(/file lock timeout/);
  });

  it('fleet recursion ledger refuses to append while the lock is held', () => {
    const file = tmpFile('fleet.jsonl');
    fs.writeFileSync(`${file}.lock`, 'held');
    const ledger = new FleetRecursionLedger(file);
    expect(() => ledger.append({ canonicalId: 'x', iteration: 1 } as never)).toThrow(/file lock timeout/);
  });

  it('rating store refuses to append while the lock is held', () => {
    const file = tmpFile('rating.jsonl');
    fs.writeFileSync(`${file}.lock`, 'held');
    const store = new RatingStore(file);
    expect(() => store.registerVariation({ source: 's', params: { a: 1 } })).toThrow(/file lock timeout/);
  });
});
