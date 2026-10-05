/**
 * Regression tests for the self-repair runaway.
 *
 * The failure these lock down was measured on 2026-10-04: `self-repair` judged a
 * repair against the tool's STORED WEAK suite while `promoted_quality_audit`
 * judged the same tool with the ENHANCED gate. Repair won every round, promoting a
 * new version each time — 78 chained repairs on `powerMod`, 8,413 versions held.
 *
 * Each test is a specific way that loop could come back.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateRepair,
  repairAttemptCount,
  pruneToolVersions,
  countsAsUpgrade,
  DEFAULT_MAX_REPAIR_ATTEMPTS,
  DEFAULT_KEEP_VERSIONS,
  type RepairableTool,
} from '../src/lib/repairBounds.js';

const PASSING_GATE = { gateOk: true, reasons: [], score: 1 };
const FAILING_GATE = { gateOk: false, reasons: ['precision: diverges at scale'], score: 0.4 };

/** A tool that has already been "repaired" `n` times. */
function churned(n: number, over: Partial<RepairableTool> = {}): RepairableTool {
  const suffix = Array.from({ length: n }, (_, i) => `-repaired.${1000 + i}`).join('');
  return {
    name: 'powerMod',
    currentVersion: `1.0.0-forge${suffix}`,
    versions: [
      { version: `1.0.0-forge${suffix}`, promoted: true, passed_verifier: true, isRepaired: n > 0 },
    ],
    healthStatus: 'degraded',
    ...over,
  };
}

describe('repair attempt counting', () => {
  it('counts chained repairs from the version name', () => {
    expect(repairAttemptCount(churned(0))).toBe(0);
    expect(repairAttemptCount(churned(1))).toBe(1);
    expect(repairAttemptCount(churned(78))).toBe(78);
  });

  it('is zero for a missing tool or a never-repaired version', () => {
    expect(repairAttemptCount(undefined)).toBe(0);
    expect(repairAttemptCount({ name: 'x', currentVersion: '1.0.0', versions: [] })).toBe(0);
  });

  it('survives a restart because it is derived, not persisted', () => {
    // The original counters (`repairAttempts`) were incremented and never read, so
    // they could not have bounded anything. Deriving from the version name means
    // the bound cannot be reset by restarting the process.
    const t = churned(5);
    expect(repairAttemptCount(JSON.parse(JSON.stringify(t)))).toBe(5);
  });
});

describe('evaluateRepair — the loop-breaker', () => {
  it('REFUSES a heal when the enhanced gate rejects what the weak suite accepted', () => {
    // This is the exact powerMod loop: suite says yes, strong gate says no.
    const r = evaluateRepair({
      tool: churned(3),
      suitePassed: true,
      verificationDepth: 'suite',
      gateVerdict: FAILING_GATE,
    });
    expect(r.healed).toBe(false);
    expect(r.blockReason).toMatch(/enhanced quality gate rejected/);
    expect(r.blockReason).toMatch(/diverges at scale/);
  });

  it('allows a heal when both the suite and the gate agree', () => {
    const r = evaluateRepair({
      tool: churned(1),
      suitePassed: true,
      verificationDepth: 'suite',
      gateVerdict: PASSING_GATE,
    });
    expect(r.healed).toBe(true);
    expect(r.blockReason).toBeUndefined();
  });

  it('does NOT invent a gate verdict when there is nothing to judge with', () => {
    // A null gate (no suite, biotech claim payload, class-shaped tool) must not
    // block: fabricating a rejection would be the same class of lie this fixes.
    const r = evaluateRepair({
      tool: churned(1),
      suitePassed: true,
      verificationDepth: 'suite',
      gateVerdict: null,
    });
    expect(r.healed).toBe(true);
  });

  it('never calls a smoke pass a heal', () => {
    const r = evaluateRepair({
      tool: churned(0),
      suitePassed: true,
      verificationDepth: 'smoke',
      gateVerdict: PASSING_GATE,
    });
    expect(r.healed).toBe(false);
    expect(r.smokeOnly).toBe(true);
  });

  it('does not heal when the suite itself failed, whatever the gate says', () => {
    const r = evaluateRepair({
      tool: churned(2),
      suitePassed: false,
      verificationDepth: 'suite',
      gateVerdict: PASSING_GATE,
    });
    expect(r.healed).toBe(false);
    expect(r.blockReason).toBeUndefined(); // plain failure, not a gate block
  });
});

describe('evaluateRepair — the attempt ceiling (backstop)', () => {
  it('stops healing at the ceiling even when the gate passes', () => {
    const r = evaluateRepair({
      tool: churned(DEFAULT_MAX_REPAIR_ATTEMPTS),
      suitePassed: true,
      verificationDepth: 'suite',
      gateVerdict: PASSING_GATE,
    });
    expect(r.healed).toBe(false);
    expect(r.blockReason).toMatch(/ceiling reached/);
  });

  it('allows healing below the ceiling', () => {
    const r = evaluateRepair({
      tool: churned(DEFAULT_MAX_REPAIR_ATTEMPTS - 1),
      suitePassed: true,
      verificationDepth: 'suite',
      gateVerdict: PASSING_GATE,
    });
    expect(r.healed).toBe(true);
  });

  it('honours a custom ceiling', () => {
    const args = { tool: churned(3), suitePassed: true, verificationDepth: 'suite' as const, gateVerdict: PASSING_GATE };
    expect(evaluateRepair({ ...args, bounds: { maxAttempts: 3 } }).healed).toBe(false);
    expect(evaluateRepair({ ...args, bounds: { maxAttempts: 4 } }).healed).toBe(true);
  });

  it('the ceiling is finite — the runaway cannot be unbounded', () => {
    expect(DEFAULT_MAX_REPAIR_ATTEMPTS).toBeGreaterThan(0);
    expect(Number.isFinite(DEFAULT_MAX_REPAIR_ATTEMPTS)).toBe(true);
  });
});

describe('version pruning', () => {
  it('bounds an unbounded chain', () => {
    const versions = Array.from({ length: 200 }, (_, i) => ({
      version: `1.0.0-forge-repaired.${1000 + i}`,
      promoted: i === 199, // only the newest is live/promoted
      passed_verifier: false,
      isRepaired: true,
    }));
    const t: RepairableTool = { name: 'x', currentVersion: versions[199].version, versions };
    const removed = pruneToolVersions(t, DEFAULT_KEEP_VERSIONS);
    expect(removed).toBeGreaterThan(150);
    expect(t.versions.length).toBeLessThanOrEqual(DEFAULT_KEEP_VERSIONS + 2);
  });

  it('ALWAYS keeps the live version', () => {
    const versions = Array.from({ length: 50 }, (_, i) => ({
      version: `v${i}`,
      promoted: i === 49,
      passed_verifier: false,
    }));
    const t: RepairableTool = { name: 'x', currentVersion: 'v49', versions };
    pruneToolVersions(t, 3);
    expect(t.versions.some((v) => v.version === t.currentVersion)).toBe(true);
  });

  it('retains promoted history as a rollback substrate', () => {
    const versions = [
      { version: 'good-v1', promoted: true, passed_verifier: true },
      ...Array.from({ length: 40 }, (_, i) => ({ version: `bad-${i}`, promoted: false, passed_verifier: false })),
      { version: 'current', promoted: true, passed_verifier: false },
    ];
    const t: RepairableTool = { name: 'x', currentVersion: 'current', versions };
    pruneToolVersions(t, 4);
    expect(t.versions.some((v) => v.version === 'good-v1')).toBe(true);
    expect(t.versions.some((v) => v.version === 'current')).toBe(true);
  });

  it('is a no-op below the retention floor', () => {
    const t: RepairableTool = {
      name: 'x',
      currentVersion: 'v1',
      versions: [{ version: 'v1', promoted: true, passed_verifier: true }],
    };
    expect(pruneToolVersions(t, 5)).toBe(0);
    expect(t.versions.length).toBe(1);
  });

  it('never drops below the live version even when keep is tiny', () => {
    const versions = Array.from({ length: 30 }, (_, i) => ({ version: `v${i}`, promoted: i === 29, passed_verifier: false }));
    const t: RepairableTool = { name: 'x', currentVersion: 'v29', versions };
    pruneToolVersions(t, 2);
    expect(t.versions.some((v) => v.version === 'v29')).toBe(true);
  });
});

describe('upgrade accounting excludes repair churn', () => {
  it('counts a genuine capability upgrade', () => {
    expect(countsAsUpgrade({ version: '1.0.0-forge', promoted: true, passed_verifier: true })).toBe(true);
  });

  it('does NOT count a repair, even a successful one', () => {
    // This is the metric half of the bug: repair churn inflated totalUpgrades, so
    // a stuck loop read as steady progress.
    expect(countsAsUpgrade({ version: '1.0.0-repaired.1234', promoted: true, passed_verifier: true, isRepaired: true })).toBe(false);
  });

  it('does not count a failing version', () => {
    expect(countsAsUpgrade({ version: '1.0.0-forge', promoted: false, passed_verifier: false })).toBe(false);
  });

  it('78 successful repairs add 0 to the upgrade count', () => {
    let total = 0;
    for (let i = 0; i < 78; i++) {
      total += countsAsUpgrade({ version: `1.0.0-repaired.${i}`, promoted: true, passed_verifier: true, isRepaired: true }) ? 1 : 0;
    }
    expect(total).toBe(0);
  });
});
