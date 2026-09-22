import { describe, it, expect } from 'vitest';
import {
  openRepairVerification,
  resolveRepairVerification,
  repairVerificationStats,
  type RepairVerification,
} from '../src/lib/repairVerification';

describe('openRepairVerification', () => {
  it('opens a pending window when a regression suite is on file', () => {
    const e = openRepairVerification({ id: 'rv1', tool: 't', version: 'v1', healedAt: 1, suitePresent: true });
    expect(e.status).toBe('pending');
    expect(e.detail).toBeUndefined();
  });

  it('marks a smoke-only heal unverifiable, never verified', () => {
    const e = openRepairVerification({ id: 'rv2', tool: 't', version: 'v1', healedAt: 1, suitePresent: false });
    expect(e.status).toBe('unverifiable');
    expect(e.detail).toContain('cannot be verified');
  });
});

describe('resolveRepairVerification', () => {
  it('resolves a pending window by id to verified or regressed', () => {
    const entries: RepairVerification[] = [
      openRepairVerification({ id: 'a', tool: 't', version: 'v1', healedAt: 1, suitePresent: true }),
      openRepairVerification({ id: 'b', tool: 'u', version: 'v1', healedAt: 1, suitePresent: true }),
    ];
    expect(resolveRepairVerification(entries, 'a', true, 10)?.status).toBe('verified');
    expect(resolveRepairVerification(entries, 'b', false, 10)?.status).toBe('regressed');
  });

  it('returns null for an unknown or already-resolved id (no double-resolve)', () => {
    const entries = [openRepairVerification({ id: 'a', tool: 't', version: 'v1', healedAt: 1, suitePresent: true })];
    expect(resolveRepairVerification(entries, 'nope', true, 10)).toBeNull();
    resolveRepairVerification(entries, 'a', true, 10);
    expect(resolveRepairVerification(entries, 'a', false, 20)).toBeNull();
  });
});

describe('repairVerificationStats', () => {
  it('computes the rate from resolved outcomes only; pending/unverifiable excluded', () => {
    const entries: RepairVerification[] = [
      { id: '1', tool: 'a', version: 'v', healedAt: 1, suitePresent: true, status: 'verified' },
      { id: '2', tool: 'b', version: 'v', healedAt: 1, suitePresent: true, status: 'verified' },
      { id: '3', tool: 'c', version: 'v', healedAt: 1, suitePresent: true, status: 'regressed' },
      { id: '4', tool: 'd', version: 'v', healedAt: 1, suitePresent: true, status: 'pending' },
      { id: '5', tool: 'e', version: 'v', healedAt: 1, suitePresent: false, status: 'unverifiable' },
    ];
    const s = repairVerificationStats(entries);
    expect(s).toMatchObject({ verified: 2, regressed: 1, pending: 1, unverifiable: 1 });
    expect(s.successRate).toBe(0.67); // 2/3, rounded to 2dp
  });

  it('reports rate 0 when nothing is resolved yet (never a fabricated 100%)', () => {
    const entries = [openRepairVerification({ id: 'a', tool: 't', version: 'v', healedAt: 1, suitePresent: true })];
    expect(repairVerificationStats(entries).successRate).toBe(0);
  });

  it('a heal that later fails counts as a failure (the P0.2 acceptance)', () => {
    const entries = [openRepairVerification({ id: 'a', tool: 't', version: 'v', healedAt: 1, suitePresent: true })];
    expect(repairVerificationStats(entries).successRate).toBe(0); // pending
    resolveRepairVerification(entries, 'a', true, 10);
    expect(repairVerificationStats(entries).successRate).toBe(1); // verified
    // Re-opening a fresh heal that regresses must lower the rate.
    entries.push(openRepairVerification({ id: 'b', tool: 'u', version: 'v', healedAt: 2, suitePresent: true }));
    resolveRepairVerification(entries, 'b', false, 20);
    expect(repairVerificationStats(entries).successRate).toBe(0.5); // 1 verified, 1 regressed
  });
});
