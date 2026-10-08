// Tests for the run-outcome contract.
//
// The load-bearing behaviour: a run that completes without throwing but produces
// nothing verifiable is recorded as UNPRODUCTIVE, not as success. That is the
// state the whole system was blind to — a job spinning every cadence while
// accomplishing nothing looked identical to one doing real work.

import { describe, it, expect } from 'vitest';

import { classifyRun, skipReason, tallyOutcome, type RunOutcome } from '../src/lib/runOutcome.js';
import { buildArtifact, verifyArtifactHash } from '../src/lib/researchArtifact.js';

const artifact = (over: Partial<Parameters<typeof buildArtifact>[0]> = {}) =>
  buildArtifact({
    kind: 'decision',
    claim: 'a real recorded decision',
    engine: 'test-engine',
    provenance: 'test',
    ...over,
  });

describe('classifyRun — terminal states', () => {
  it('a run with no verifiable artifact is UNPRODUCTIVE', () => {
    // The core fix: this used to be a success.
    const res = classifyRun('corpus', { artifacts: 0, dispatched: 0 });
    expect(res.outcome).toBe('unproductive');
    expect(res.detail).toContain('no verifiable artifact');
  });

  it('an empty object result is unproductive, not a pass', () => {
    expect(classifyRun('forge', {}).outcome).toBe('unproductive');
    expect(classifyRun('forge', null).outcome).toBe('unproductive');
    expect(classifyRun('forge', undefined).outcome).toBe('unproductive');
  });

  it('an explicit skip is SKIPPED, not unproductive and not success', () => {
    const res = classifyRun('science', { skipped: 'autopilot disabled' });
    expect(res.outcome).toBe('skipped');
    expect(res.detail).toContain('autopilot disabled');
  });

  it('a run producing a real artifact is an artifact outcome', () => {
    const a = artifact();
    const res = classifyRun('math', { artifact: a });
    expect(res.outcome).toBe('artifact');
    expect(res.artifact?.id).toBe(a.id);
    expect(res.detail).toContain('hash verified');
  });

  it('accepts the artifacts[] shape', () => {
    const res = classifyRun('science', { artifacts: [artifact(), artifact({ claim: 'second' })] });
    expect(res.outcome).toBe('artifact');
    expect(res.detail).toContain('2 verified artifacts');
  });

  it('accepts a BARE artifact (the documented shape that was silently uncredited)', () => {
    // A job that returns the artifact itself, not wrapped, must still be credited.
    const a = artifact();
    const res = classifyRun('composer_retrain', a);
    expect(res.outcome).toBe('artifact');
    expect(res.artifact?.id).toBe(a.id);
  });
});

describe('classifyRun — a run never self-certifies', () => {
  it('rejects an artifact whose hash does not match its contents', () => {
    // Tamper the claim after the hash was computed.
    const a = artifact();
    expect(verifyArtifactHash(a)).toBe(true);
    const tampered = { ...a, claim: 'something the artifact never claimed' };
    expect(verifyArtifactHash(tampered)).toBe(false);

    const res = classifyRun('math', { artifact: tampered });
    expect(res.outcome).toBe('unproductive');
    expect(res.tampered).toBe(true);
    expect(res.detail).toContain('failed hash re-verification');
  });

  it('rejects when only SOME artifacts verify', () => {
    const good = artifact();
    const bad = { ...artifact({ claim: 'b' }), evidenceTier: 'E1' as const };
    const res = classifyRun('science', { artifacts: [good, bad] });
    expect(res.outcome).toBe('unproductive');
    expect(res.tampered).toBe(true);
  });

  it('ignores an `artifacts: 3` COUNT — a number is not an artifact', () => {
    // Jobs report counts; that must not be mistaken for evidence.
    expect(classifyRun('corpus', { artifacts: 3 }).outcome).toBe('unproductive');
    expect(classifyRun('corpus', { artifacts: 'many' }).outcome).toBe('unproductive');
  });
});

describe('skipReason', () => {
  it('reads a non-empty skip string', () => {
    expect(skipReason({ skipped: 'autopilot disabled' })).toBe('autopilot disabled');
  });
  it('ignores empty or non-string skips', () => {
    expect(skipReason({ skipped: '' })).toBeNull();
    expect(skipReason({ skipped: 123 })).toBeNull();
    expect(skipReason({})).toBeNull();
    expect(skipReason(null)).toBeNull();
  });
});

describe('maintenance jobs', () => {
  it('a maintenance job that found nothing is MAINTAINED, not unproductive', () => {
    // A health poll correctly produces no artifact. Calling that a failure
    // makes a healthy idle system look broken.
    const r = classifyRun('telemetry', { queued: 0, ok: true }, { maintenance: true });
    expect(r.outcome).toBe('maintained');
    expect(r.detail).toContain('maintained');
  });

  it('is still unproductive when NOT declared maintenance', () => {
    // The same result from a job that is supposed to do work is a failure.
    const r = classifyRun('forge', { queued: 0, ok: true });
    expect(r.outcome).toBe('unproductive');
  });

  it('a skip outranks maintenance (it did not even run)', () => {
    const r = classifyRun('telemetry', { skipped: 'autopilot disabled' }, { maintenance: true });
    expect(r.outcome).toBe('skipped');
  });

  it('ARTIFACTS OUTRANK MAINTENANCE — maintenance cannot hide real work', () => {
    // This is the guard against 'maintenance' becoming a loophole: a maintenance
    // job that genuinely found something must be credited with it.
    const a = buildArtifact({ kind: 'decision', claim: 'real work', engine: 'e', provenance: 'p' });
    const r = classifyRun('telemetry', { artifact: a }, { maintenance: true });
    expect(r.outcome).toBe('artifact');
    expect(r.artifact?.id).toBe(a.id);
  });

  it('a tampered artifact outranks maintenance too — it must not be excused', () => {
    const a = buildArtifact({ kind: 'decision', claim: 'real work', engine: 'e', provenance: 'p' });
    const r = classifyRun('telemetry', { artifact: { ...a, claim: 'swapped' } }, { maintenance: true });
    expect(r.outcome).toBe('unproductive');
    expect(r.tampered).toBe(true);
  });

  it('includes the maintenance note when given', () => {
    const r = classifyRun('memory_consolidation', {}, { maintenance: true, maintenanceNote: 'nothing to consolidate' });
    expect(r.detail).toContain('nothing to consolidate');
  });
});

const tally = () => ({ artifact: 0, skipped: 0, maintained: 0, unproductive: 0, failed: 0 });

describe('tallyOutcome', () => {
  it('counts each terminal state separately and does not mutate', () => {
    const start = tally();
    let t = tallyOutcome(start, 'artifact');
    t = tallyOutcome(t, 'unproductive');
    t = tallyOutcome(t, 'unproductive');
    t = tallyOutcome(t, 'skipped');
    t = tallyOutcome(t, 'maintained');
    expect(t).toEqual({ artifact: 1, skipped: 1, maintained: 1, unproductive: 2, failed: 0 });
    // The original tally must be untouched.
    expect(start.unproductive).toBe(0);
  });

  it('covers every RunOutcome', () => {
    const all: RunOutcome[] = ['artifact', 'skipped', 'maintained', 'unproductive'];
    for (const o of all) {
      const t = tallyOutcome(tally(), o);
      expect(t[o]).toBe(1);
    }
  });
});