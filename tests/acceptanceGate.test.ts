/**
 * Tests for the acceptance gate.
 *
 * The point of these tests is NOT that the gate passes. It is that the gate
 * FAILS in every situation that previously looked healthy — because the whole
 * reason this module exists is that "enabled", "configured" and "reachable"
 * were all being read as "working".
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  ACCEPTANCE_STAGES,
  STAGE_FRESHNESS_MS,
  recordStage,
  evaluateAcceptance,
  acceptanceEvents,
  resetAcceptance,
  type AcceptanceStage,
} from '../src/lib/acceptance.js';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'acceptance-'));
});

/** Record every stage as healthy, as of `at`. */
function recordAll(detail = 'evidence', at = 1_000_000): void {
  for (const s of ACCEPTANCE_STAGES) recordStage(s, detail, at, root);
}

describe('acceptance gate', () => {
  it('fails with NO evidence at all, naming every dark stage', () => {
    const r = evaluateAcceptance({ root, now: 1_000_000 });
    expect(r.pass).toBe(false);
    expect(r.passed).toBe(0);
    expect(r.total).toBe(ACCEPTANCE_STAGES.length);
    // Every stage must say why it failed, not just be false.
    for (const s of r.stages) {
      expect(s.ok).toBe(false);
      expect(s.why.length).toBeGreaterThan(0);
      expect(s.why).toMatch(/never been observed/);
    }
  });

  it('passes only when every stage has fresh evidence', () => {
    recordAll('did the thing', 1_000_000);
    const r = evaluateAcceptance({ root, now: 1_000_000 });
    expect(r.pass).toBe(true);
    expect(r.passed).toBe(ACCEPTANCE_STAGES.length);
    expect(r.headline).toMatch(/ACCEPTED/);
  });

  it('refuses an empty detail — a stage that produced nothing is not evidence', () => {
    expect(() => recordStage('generated', '', 1_000_000, root)).toThrow(/without detail/);
    expect(() => recordStage('generated', '   ', 1_000_000, root)).toThrow(/without detail/);
    // And nothing was written.
    expect(acceptanceEvents(root).generated).toBeUndefined();
  });

  it('treats a stage that worked once and has been dark since as FAILING', () => {
    // This is the "worked at boot, dead ever since" trap: the artifact exists,
    // it is simply stale. Presence of evidence must not equal a pass.
    recordAll('did the thing', 1_000_000);
    const muchLater = 1_000_000 + 30 * 24 * 60 * 60_000;
    const r = evaluateAcceptance({ root, now: muchLater });
    expect(r.pass).toBe(false);
    expect(r.stages.every((s) => !s.ok)).toBe(true);
    for (const s of r.stages) expect(s.why).toMatch(/worked once, dark since/);
  });

  it('uses per-stage freshness, so a long-cadence dream is not judged like a forge', () => {
    const now = 1_000_000;
    // 2 hours later: the 30-minute scheduler window has expired, but the
    // 24-hour dream/consumption/learning windows have not.
    const twoHours = now + 2 * 60 * 60_000;
    recordAll('did the thing', now);
    const r = evaluateAcceptance({ root, now: twoHours });
    const byStage = Object.fromEntries(r.stages.map((s) => [s.stage, s.ok]));
    expect(byStage.scheduled).toBe(false); // 30 min window, 2 h old -> dark
    expect(byStage.generated).toBe(true); // 6 h window, 2 h old -> fresh
    expect(byStage.dream).toBe(true); // 24 h window, 2 h old -> fresh
    expect(byStage.consumed).toBe(true);
  });

  it('fails the moment ONE link in the chain is dark', () => {
    // The whole point: a chain is only as strong as its weakest link, and a
    // partially-working system must not read as a working one.
    const allButLearned = ACCEPTANCE_STAGES.filter((s) => s !== 'learned');
    for (const s of allButLearned) recordStage(s, 'ok', 1_000_000, root);
    const r = evaluateAcceptance({ root, now: 1_000_000 });
    expect(r.pass).toBe(false);
    expect(r.passed).toBe(ACCEPTANCE_STAGES.length - 1);
    expect(r.headline).toMatch(/NOT ACCEPTED/);
    expect(r.headline).toMatch(/learned/);
  });

  it('cannot be satisfied by a stale-but-present ledger after a restart', () => {
    recordAll('did the thing', 1_000_000);
    // Simulate a restart reading a persisted ledger written days ago.
    const later = Date.now() + 3 * 24 * 60 * 60_000;
    const r = evaluateAcceptance({ root, now: later });
    expect(r.pass).toBe(false);
  });

  it('keeps the recorded evidence readable for inspection', () => {
    recordStage('verified', 'powerMod cleared the gate', 1_000_000, root);
    const ev = acceptanceEvents(root);
    expect(ev.verified?.detail).toBe('powerMod cleared the gate');
    expect(ev.verified?.at).toBe(1_000_000);
    expect(ev.generated).toBeUndefined();
  });

  it('does not let an explicit override mask the rest of the chain', () => {
    // Overrides exist so a host can inject a stage it measures differently, but
    // one override must not silently pass the others.
    recordAll('ok', 1_000_000);
    resetAcceptance(root);
    const r = evaluateAcceptance({
      root,
      now: 1_000_000,
      overrides: {
        consumed: { stage: 'consumed', ok: true, why: 'host-measured', at: 1_000_000, ageMs: 0 },
      },
    });
    expect(r.pass).toBe(false);
    expect(r.stages.filter((s) => s.ok).map((s) => s.stage)).toEqual(['consumed']);
  });

  it('every stage has a freshness window and a distinct identity', () => {
    for (const s of ACCEPTANCE_STAGES) {
      expect(STAGE_FRESHNESS_MS[s as AcceptanceStage]).toBeGreaterThan(0);
    }
    expect(new Set(ACCEPTANCE_STAGES).size).toBe(ACCEPTANCE_STAGES.length);
  });
});