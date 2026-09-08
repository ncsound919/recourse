import { describe, it, expect } from 'vitest';
import {
  updateStuckIssues,
  shouldEscalate,
  repairRowForIssue,
  buildStuckRepairQuery,
  stuckSnapshot,
  DEFAULT_ESCALATION_BACKOFF_MS,
  type StuckIssue,
  type StuckSignal,
} from '../src/lib/selfRepairLoop';

const base = 1_000_000_000_000;

function sig(over: Partial<StuckSignal>): StuckSignal {
  return { id: 'job:forge', name: 'Forge', kind: 'job', failing: true, threshold: 3, detail: 'boom', ...over };
}

describe('selfRepairLoop (pure stuck detection)', () => {
  it('accumulates consecutive failures to a stuck threshold, then recovers', () => {
    let issues: StuckIssue[] = [];
    const s = () => sig({});
    issues = updateStuckIssues(issues, [s()], base);
    expect(issues[0].consecutiveFailures).toBe(1);
    expect(issues[0].stuck).toBe(false);
    issues = updateStuckIssues(issues, [s()], base + 1);
    issues = updateStuckIssues(issues, [s()], base + 2);
    expect(issues[0].consecutiveFailures).toBe(3);
    expect(issues[0].stuck).toBe(true);
    // A genuinely healthy pass resets the streak.
    issues = updateStuckIssues(issues, [sig({ failing: false })], base + 3);
    expect(issues[0].consecutiveFailures).toBe(0);
    expect(issues[0].stuck).toBe(false);
  });

  it('threshold 1 marks stuck on the first failing pass', () => {
    const issues = updateStuckIssues([], [sig({ id: 'anomaly:x', threshold: 1 })], base);
    expect(issues[0].stuck).toBe(true);
  });

  it('retains prior state when a signal disappears (no data != healthy)', () => {
    const once = updateStuckIssues([], [sig({})], base);
    const twice = updateStuckIssues(once, [], base + 1);
    expect(twice[0].consecutiveFailures).toBe(1); // not reset by absence
  });

  it('shouldEscalate respects backoff and first-time immediate', () => {
    const issue: StuckIssue = { ...sig({}), consecutiveFailures: 3, stuck: true, lastEscalatedAt: null, escalationCount: 0 };
    expect(shouldEscalate(issue, base)).toBe(true);
    issue.lastEscalatedAt = base;
    expect(shouldEscalate(issue, base + DEFAULT_ESCALATION_BACKOFF_MS - 1)).toBe(false);
    expect(shouldEscalate(issue, base + DEFAULT_ESCALATION_BACKOFF_MS)).toBe(true);
    expect(shouldEscalate({ ...issue, stuck: false }, base)).toBe(false);
  });

  it('repairRowForIssue produces a >=50 band row with real reasons', () => {
    const issue: StuckIssue = { ...sig({}), consecutiveFailures: 4, stuck: true, lastEscalatedAt: base, escalationCount: 2 };
    const row = repairRowForIssue(issue, 'https://repo');
    expect(row.weakness_score).toBeGreaterThanOrEqual(60);
    expect(row.component_slug).toContain('job:forge');
    expect(row.reasons.join(' ')).toContain('4 consecutive');
    expect(row.repo_url).toBe('https://repo');
  });

  it('stuckSnapshot sorts stuck first and counts honestly', () => {
    const a: StuckIssue = { ...sig({ id: 'a' }), consecutiveFailures: 4, stuck: true, lastEscalatedAt: null, escalationCount: 0 };
    const b: StuckIssue = { ...sig({ id: 'b' }), consecutiveFailures: 2, stuck: false, lastEscalatedAt: null, escalationCount: 0 };
    const snap = stuckSnapshot([b, a]);
    expect(snap.issues[0].id).toBe('a');
    expect(snap.stuckCount).toBe(1);
    expect(snap.activeCount).toBe(2);
  });

  it('buildStuckRepairQuery embeds the issue + gate instructions', () => {
    const issue: StuckIssue = { ...sig({}), consecutiveFailures: 3, stuck: true, lastEscalatedAt: null, escalationCount: 0 };
    const q = buildStuckRepairQuery(issue, 'https://repo');
    expect(q).toContain('job:forge');
    expect(q).toContain('boom');
    expect(q).toContain('fenced JSON block');
    expect(q).toContain('sandbox verifier + lint');
  });
});
