import { describe, expect, it } from 'vitest';
import {
  deterministicHash,
  recomputeGoalProgress,
  replayGoalSnapshot,
  replayTrendRecords,
} from '../src/lib/replay';
import { hashInsightRecord, type LedgerInsight } from '../src/lib/trendLedger';
import type { BiotechClaim, MathAttempt } from '../src/lib/goalLedger';

const GENESIS = '0'.repeat(64);

function makeTrendChain(): LedgerInsight[] {
  const rec1Base = {
    id: 'ins_1',
    createdRun: 'run-1',
    hypothesisId: 'h1',
    templateId: 'tpl_x',
    statement: 'A',
    confidence: 0.5,
    provenanceRoot: 'root-1',
    prevInsightHash: GENESIS,
    payload: { a: 1 },
  };
  const rec1: LedgerInsight = { ...rec1Base, hash: hashInsightRecord(rec1Base) };
  const rec2Base = {
    id: 'ins_2',
    createdRun: 'run-1',
    hypothesisId: 'h2',
    templateId: 'tpl_x',
    statement: 'B',
    confidence: 0.7,
    provenanceRoot: 'root-1',
    prevInsightHash: rec1.hash,
    payload: { b: 2 },
  };
  const rec2: LedgerInsight = { ...rec2Base, hash: hashInsightRecord(rec2Base) };
  return [rec1, rec2];
}

function mathAttempt(overrides: Partial<MathAttempt> = {}): MathAttempt {
  return {
    id: 'math_1',
    problemId: 'p1',
    problemTier: 'solvable',
    toolName: 't',
    passed: true,
    score: 1,
    timestamp: 1,
    generation: 1,
    latMs: 1,
    ...overrides,
  };
}

function biotechClaim(overrides: Partial<BiotechClaim> = {}): BiotechClaim {
  return {
    id: 'biotech_1',
    assetName: 'drug',
    leg: 'target_engagement',
    evidenceTier: 1,
    passed: true,
    score: 0.9,
    summary: 's',
    timestamp: 1,
    generation: 1,
    ...overrides,
  };
}

describe('deterministicHash', () => {
  it('is stable regardless of object key order', () => {
    expect(deterministicHash({ a: 1, b: { x: 2, y: 3 } })).toBe(
      deterministicHash({ b: { y: 3, x: 2 }, a: 1 }),
    );
    expect(deterministicHash([1, 2, 3])).not.toBe(deterministicHash([3, 2, 1]));
  });
});

describe('trend ledger replay', () => {
  it('reports an intact chain as a match', () => {
    const report = replayTrendRecords(makeTrendChain());
    expect(report.chainValid).toBe(true);
    expect(report.matches).toBe(true);
    expect(report.records).toBe(2);
    // Same records -> same replayHash (bit-for-bit).
    expect(report.replayHash).toBe(replayTrendRecords(makeTrendChain()).replayHash);
  });

  it('detects a tampered record and reports the break', () => {
    const chain = makeTrendChain();
    chain[1] = { ...chain[1], statement: 'TAMPERED' };
    const report = replayTrendRecords(chain);
    expect(report.chainValid).toBe(false);
    expect(report.matches).toBe(false);
    expect(report.brokenAt).toBe(1);
  });
});

describe('goal ledger replay', () => {
  it('re-derives progress from records and matches live counters', () => {
    const snapshot = {
      mathAttempts: [
        mathAttempt({ passed: true, problemTier: 'solvable' }),
        mathAttempt({ id: 'math_2', passed: false, problemTier: 'open' }),
      ],
      biotechClaims: [biotechClaim({ passed: true }), biotechClaim({ id: 'biotech_2', passed: false, leg: 'safety' })],
    };
    const derived = recomputeGoalProgress(snapshot);
    expect(derived.math).toMatchObject({ solved: 1, total: 2 });
    expect(derived.biotech).toMatchObject({ passed: 1, total: 2 });

    const report = replayGoalSnapshot(snapshot, derived);
    expect(report.matches).toBe(true);
    expect(report.replayHash).toBe(report.liveHash);
  });

  it('reports drift when the live counters disagree with the records', () => {
    const snapshot = { mathAttempts: [mathAttempt({ passed: true })], biotechClaims: [] };
    const live = recomputeGoalProgress(snapshot);
    const drifted = { ...live, math: { ...live.math, solved: 999 } };
    const report = replayGoalSnapshot(snapshot, drifted);
    expect(report.matches).toBe(false);
    expect(report.details.join(' ')).toMatch(/disagree/);
  });
});
