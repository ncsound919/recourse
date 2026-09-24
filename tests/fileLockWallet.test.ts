import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { withSyncFileLock } from '../src/lib/fileLock';
import { openWallet } from '../src/lib/wallet';

const tmpDirs: string[] = [];
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-lock-'));
  tmpDirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* noop */ } }
});

describe('withSyncFileLock', () => {
  it('runs the section and releases the lock', () => {
    const lock = path.join(tmp(), 'x.lock');
    const out = withSyncFileLock(lock, () => 42);
    expect(out).toBe(42);
    expect(fs.existsSync(lock)).toBe(false);
  });

  it('reclaims a stale lock left by a crashed holder', () => {
    const lock = path.join(tmp(), 'stale.lock');
    fs.writeFileSync(lock, '99999');
    const old = Date.now() - 60_000;
    fs.utimesSync(lock, old / 1000, old / 1000);
    expect(withSyncFileLock(lock, () => 'ok', { staleMs: 1000 })).toBe('ok');
    expect(fs.existsSync(lock)).toBe(false);
  });

  it('times out on a fresh held lock instead of running concurrently', () => {
    const lock = path.join(tmp(), 'held.lock');
    fs.writeFileSync(lock, '123');
    expect(() => withSyncFileLock(lock, () => 'nope', { timeoutMs: 50, staleMs: 60_000 })).toThrow(/file lock timeout/);
  });
});

describe('wallet debit is serialized under the ledger lock', () => {
  it('refuses to append while the lock is held (proves the check+append is guarded)', () => {
    const dir = tmp();
    const file = path.join(dir, 'wallet.jsonl');
    fs.writeFileSync(path.join(dir, 'wallet.jsonl.lock'), 'held');
    const w = openWallet(file);
    expect(() => w.setBudget('merge', 100)).toThrow(/file lock timeout/);
    expect(() => w.debit('merge', 10)).toThrow(/file lock timeout/);
  });

  it('appends a valid hash-chained debit when the lock is free', () => {
    const file = path.join(tmp(), 'wallet.jsonl');
    const w = openWallet(file);
    w.setBudget('merge', 100);
    w.debit('merge', 30);
    expect(w.balance('merge').remainingCents).toBe(70);
    expect(w.reconcile().valid).toBe(true);
  });
});
