import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  openWallet,
  readWallet,
  verifyWalletRecords,
  computeBalances,
  canAutoMerge,
} from '../src/lib/wallet';

const dirs: string[] = [];
function freshFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-wallet-'));
  dirs.push(dir);
  return path.join(dir, 'wallet-ledger.jsonl');
}
afterEach(() => {
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

describe('budgeted wallet', () => {
  it('sets a budget, debits within it, and tracks the balance', () => {
    const w = openWallet(freshFile());
    w.setBudget('model', 1000, 'initial', 1);
    w.debit('model', 250, 'call', 2);
    const b = w.balance('model');
    expect(b.capCents).toBe(1000);
    expect(b.spentCents).toBe(250);
    expect(b.remainingCents).toBe(750);
    expect(verifyWalletRecords(readWallet(w.file())).valid).toBe(true);
  });

  it('refuses a debit that would exceed the remaining budget', () => {
    const w = openWallet(freshFile());
    w.setBudget('model', 100, 'initial', 1);
    expect(() => w.debit('model', 150, 'too much')).toThrow(/exceeds/);
    try {
      w.debit('model', 150);
    } catch (e: any) {
      expect(e.code).toBe('insufficient');
    }
    // Nothing was written for the refused debit.
    expect(readWallet(w.file())).toHaveLength(1);
  });

  it('credits top up the available balance', () => {
    const w = openWallet(freshFile());
    w.setBudget('model', 100, 'initial', 1);
    w.credit('model', 50, 'refund', 2);
    expect(w.balance('model').remainingCents).toBe(150);
  });

  it('rejects invalid amounts', () => {
    const w = openWallet(freshFile());
    expect(() => w.setBudget('x', -5)).toThrow();
    expect(() => w.debit('x', 0)).toThrow();
    expect(() => w.credit('x', 1.5)).toThrow();
  });

  it('detects a tampered ledger in reconcile', () => {
    const file = freshFile();
    const w = openWallet(file);
    w.setBudget('model', 100, 'a', 1);
    w.debit('model', 10, 'b', 2);
    const entries = readWallet(file);
    entries[1] = { ...entries[1], cents: 999 };
    expect(verifyWalletRecords(entries).valid).toBe(false);
    expect(computeBalances(entries).get('model')!.spentCents).toBe(999);
  });
});

describe('autopilot merge gating', () => {
  it('blocks auto-merge with no budget and allows it when funded', () => {
    const empty = computeBalances([]);
    expect(canAutoMerge(empty).allowed).toBe(false);
    expect(canAutoMerge(empty).reason).toMatch(/no ".*" budget/);

    const funded = computeBalances([
      { id: 'w_1', at: 1, kind: 'budget', token: 'merge', cents: 500, description: '', prevHash: '', hash: '' },
    ]);
    expect(canAutoMerge(funded, { requiredCents: 100 }).allowed).toBe(true);
    expect(canAutoMerge(funded, { requiredCents: 600 }).allowed).toBe(false);
  });
});
