import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  scorecardDeltaToReward,
  revenueDeltaToReward,
  blendOutcomeReward,
  computeOutcomeReward,
  openOutcomeLedger,
  recordMergedOutcome,
} from '../src/lib/outcomeFeedback';

const dirs: string[] = [];
function freshDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-outcome-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

describe('outcome reward mapping', () => {
  it('maps scorecard deltas monotonically around neutral', () => {
    expect(scorecardDeltaToReward(0)).toBe(0.5);
    expect(scorecardDeltaToReward(200)).toBe(1);
    expect(scorecardDeltaToReward(-200)).toBe(0);
    expect(scorecardDeltaToReward(100)).toBe(0.75);
    expect(scorecardDeltaToReward(10)).toBeCloseTo(0.525, 5);
    expect(scorecardDeltaToReward(5000)).toBe(1);
    expect(scorecardDeltaToReward(NaN)).toBe(0.5);
  });

  it('maps revenue deltas relative to a target', () => {
    expect(revenueDeltaToReward(0, 10_000)).toBe(0.5);
    expect(revenueDeltaToReward(10_000, 10_000)).toBe(1);
    expect(revenueDeltaToReward(-10_000, 10_000)).toBe(0);
    expect(revenueDeltaToReward(5_000, 10_000)).toBe(0.75);
    expect(revenueDeltaToReward(1, 0)).toBe(0.5);
  });

  it('blends weighted parts and defaults to neutral', () => {
    expect(blendOutcomeReward([])).toBe(0.5);
    expect(blendOutcomeReward([{ reward: 1, weight: 1 }, { reward: 0, weight: 1 }])).toBe(0.5);
    expect(blendOutcomeReward([{ reward: 1, weight: 3 }, { reward: 0, weight: 1 }])).toBe(0.75);
  });

  it('computes a blended reward with components', () => {
    const c = computeOutcomeReward({ scorecardDelta: 200, revenueDeltaCents: 0, targetRevenueCents: 10_000 });
    expect(c.reward).toBe(0.75);
    expect(c.scorecard).toBe(1);
    expect(c.revenue).toBe(0.5);
    expect(c.blendedFrom).toEqual(['scorecard', 'revenue']);
    expect(computeOutcomeReward({}).blendedFrom).toEqual([]);
  });
});

describe('outcome ledger', () => {
  it('records, clamps, lists and averages', () => {
    const ledger = openOutcomeLedger(path.join(freshDir(), 'outcomes.json'));
    expect(ledger.latest()).toBeUndefined();
    expect(ledger.reward()).toBeUndefined();
    ledger.record({ source: 'manual', reward: 1.5 });
    ledger.record({ source: 'manual', reward: -1 });
    expect(ledger.history()).toHaveLength(2);
    expect(ledger.latest()!.reward).toBe(0);
    expect(ledger.reward(2)).toBe(0.5);
    expect(ledger.reward(1)).toBe(0);
  });

  it('survives a corrupt file', () => {
    const file = path.join(freshDir(), 'outcomes.json');
    fs.writeFileSync(file, 'not json', 'utf-8');
    const ledger = openOutcomeLedger(file);
    expect(ledger.latest()).toBeUndefined();
    ledger.record({ source: 'manual', reward: 0.7 });
    expect(ledger.latest()!.reward).toBe(0.7);
  });

  it('records a merged scorecard outcome into the ledger root', () => {
    const root = freshDir();
    const signal = recordMergedOutcome({ ledgerRoot: root, proposalId: 'p1', gapId: 'g1', scorecardDelta: 100 });
    expect(signal.reward).toBe(0.75);
    const ledger = openOutcomeLedger(path.join(root, 'data', 'outcome-feedback.json'));
    expect(ledger.latest()!.proposalId).toBe('p1');
    expect(ledger.reward()).toBe(0.75);
  });
});
