/**
 * jobEffectiveness.test.ts — a job that is enabled but does nothing must not
 * read as healthy.
 *
 * WHY THIS EXISTS
 * With all 24 scheduler jobs enabled and every autopilot flag off, every job woke
 * on its cadence and returned `{skipped: 'autopilot disabled'}`. Anything
 * derived from `job.enabled` — the fleet dashboard, `activeLoops`, the boot log
 * line "governor armed (24/24 jobs)" — reported a fully armed fleet while the
 * system produced nothing. `runOutcome.ts` had already fixed this blindness for
 * individual runs; this extends it to job state, so the same question ("is it
 * actually working?") has an answer at both levels.
 */
import { describe, it, expect } from 'vitest';
import {
  jobEffectiveState,
  schedulerEffectiveness,
  type JobEffectiveState,
  type ScheduledJobState,
} from '../src/lib/jobScheduler.js';

function job(over: Partial<ScheduledJobState> = {}): ScheduledJobState {
  return {
    id: 'forge',
    name: 'Capability Forge',
    group: 'autonomy',
    run: async () => undefined,
    cadenceMs: 60_000,
    enabledByDefault: true,
    enabled: true,
    lastRunAt: null,
    lastOk: null,
    lastError: null,
    lastSkipped: null,
    runCount: 0,
    failCount: 0,
    skipCount: 0,
    maintainedCount: 0,
    unproductiveCount: 0,
    lastOutcome: null,
    lastOutcomeDetail: null,
    running: false,
    nextRunAt: 0,
    ...over,
  };
}

describe('jobEffectiveState', () => {
  it('reports a disabled job as disabled', () => {
    expect(jobEffectiveState(job({ enabled: false, runCount: 12, lastOk: true }))).toBe('disabled');
  });

  it('reports an enabled job that has never fired as pending, not running', () => {
    expect(jobEffectiveState(job({ runCount: 0 }))).toBe('pending');
  });

  it('reports an enabled job that only ever skips as no_op', () => {
    // The exact state the whole fleet was in: armed, firing, doing nothing.
    const j = job({
      runCount: 40,
      skipCount: 40,
      lastOk: null,
      lastOutcome: 'skipped',
      lastSkipped: 'autopilot disabled',
    });
    expect(jobEffectiveState(j)).toBe('no_op');
  });

  it('reports an enabled job whose recent runs produced artifacts as running', () => {
    const j = job({ runCount: 12, lastOk: true, lastOutcome: 'artifact' });
    expect(jobEffectiveState(j)).toBe('running');
  });

  it('reports a throwing job as failing', () => {
    const j = job({ runCount: 5, lastOk: false, lastError: 'boom', failCount: 5 });
    expect(jobEffectiveState(j)).toBe('failing');
  });

  it('does not let a maintenance job read as failing just for being idle', () => {
    const j = job({ runCount: 9, lastOk: null, lastOutcome: 'maintained', maintainedCount: 9 });
    expect(jobEffectiveState(j)).toBe('running');
  });

  it('does not let a job that worked then went quiet keep claiming to run', () => {
    // runCount high, but the last run skipped: the tail is what counts.
    const j = job({
      runCount: 500,
      skipCount: 6,
      lastOk: null,
      lastOutcome: 'skipped',
      lastSkipped: 'autopilot disabled',
    });
    expect(jobEffectiveState(j)).toBe('no_op');
  });
});

describe('schedulerEffectiveness', () => {
  const fleet: ScheduledJobState[] = [
    job({ id: 'a', runCount: 10, lastOk: true, lastOutcome: 'artifact' }),
    job({ id: 'b', runCount: 10, skipCount: 10, lastOk: null, lastOutcome: 'skipped', lastSkipped: 'autopilot disabled' }),
    job({ id: 'c', runCount: 10, lastOk: false, lastError: 'boom' }),
    job({ id: 'd', enabled: false, runCount: 0 }),
    job({ id: 'e', runCount: 0 }),
  ];

  const states = fleet.map((j) => jobEffectiveState(j));
  const rollup = schedulerEffectiveness({ running: true, startedAt: 0, jobs: fleet });

  it('classifies each job', () => {
    expect(states).toEqual<JobEffectiveState[]>(['running', 'no_op', 'failing', 'disabled', 'pending']);
  });

  it('separates armed from working', () => {
    expect(rollup.total).toBe(5);
    expect(rollup.armedJobs).toBe(4);
    // The number that actually matters, and the one the old reporting hid.
    expect(rollup.workingJobs).toBe(1);
  });

  it('names the jobs that are armed and idle', () => {
    expect(rollup.noOpJobIds).toEqual(['b']);
  });

  it('counts failures separately from idleness', () => {
    expect(rollup.failingJobs).toBe(1);
    expect(rollup.noOpJobs).toBe(1);
  });

  it('never reports working jobs exceeding the fleet', () => {
    expect(rollup.workingJobs).toBeLessThanOrEqual(rollup.total);
    expect(rollup.armedJobs).toBeGreaterThanOrEqual(rollup.workingJobs);
  });
});
