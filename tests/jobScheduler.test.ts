import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  registerScheduledJob,
  stopScheduler,
  getSchedulerStatus,
  setJobEnabled,
  triggerJob,
  listScheduledJobs,
  getScheduledJob,
  nextRunForCron,
  resetSchedule,
} from '../src/lib/jobScheduler.js';

// Isolate persistence from the real scheduler toggles.
const TEST_STORE = `${process.cwd()}\\data\\test-job-scheduler.json`;
beforeAll(() => {
  process.env.JOB_SCHEDULER_FILE = TEST_STORE;
  require('fs').rmSync(TEST_STORE, { force: true });
});
afterAll(() => {
  process.env.JOB_SCHEDULER_FILE = '';
  stopScheduler();
});

describe('job scheduler', () => {
  it('registers jobs and rejects duplicates', () => {
    const ok = registerScheduledJob({
      id: 'test_job_a',
      name: 'Test A',
      group: 'test',
      cadenceMs: 60_000,
      enabledByDefault: true,
      run: async () => ({ ran: true }),
    });
    expect(ok.ok).toBe(true);
    const dup = registerScheduledJob({
      id: 'test_job_a',
      name: 'Dup',
      group: 'test',
      cadenceMs: 60_000,
      enabledByDefault: false,
      run: async () => ({}),
    });
    expect(dup.ok).toBe(false);
  });

  it('rejects invalid jobs (no cadence, too fast)', () => {
    expect(registerScheduledJob({ id: 'bad1', name: 'x', group: 't', enabledByDefault: true, run: () => ({}), cadenceMs: undefined }).ok).toBe(false);
    expect(registerScheduledJob({ id: 'bad2', name: 'x', group: 't', enabledByDefault: true, run: () => ({}), cadenceMs: 500 }).ok).toBe(false);
  });

  it('tracks run/fail counts + lastOk honestly', async () => {
    let fail = false;
    registerScheduledJob({
      id: 'test_job_okfail',
      name: 'OkFail',
      group: 'test',
      cadenceMs: 60_000,
      enabledByDefault: false,
      run: async () => {
        if (fail) throw new Error('boom');
        return { value: 42 };
      },
    });
    const r1 = await triggerJob('test_job_okfail');
    expect(r1.ok).toBe(true);
    if (r1.ok === false) throw new Error('unreachable');
    expect(r1.ran).toBe(true);
    expect(r1.result).toEqual({ value: 42 });
    fail = true;
    const r2 = await triggerJob('test_job_okfail');
    expect(r2.ok).toBe(true); // trigger completes even on job failure
    const st = getScheduledJob('test_job_okfail');
    expect(st?.lastOk).toBe(false);
    expect(st?.lastError).toContain('boom');
    expect(st?.runCount).toBe(2);
    expect(st?.failCount).toBe(1);
  });

  it('overlap guard blocks concurrent trigger', async () => {
    let release!: () => void;
    const gate = new Promise<void>((res) => { release = res; });
    registerScheduledJob({
      id: 'test_job_slow',
      name: 'Slow',
      group: 'test',
      cadenceMs: 60_000,
      enabledByDefault: false,
      run: async () => { await gate; return { done: true }; },
    });
    const first = triggerJob('test_job_slow'); // holds the gate
    const second = await triggerJob('test_job_slow');
    expect(second.ok).toBe(false);
    release();
    await first;
  });

  it('cron next-run computes correct minute/hour', () => {
    const base = Date.UTC(2026, 8, 6, 10, 15, 0); // 2026-09-06 10:15 UTC
    const dailyAtMidnight = nextRunForCron('0 0 * * *', base);
    expect(new Date(dailyAtMidnight).getUTCHours()).toBe(0);
    expect(new Date(dailyAtMidnight).getUTCMinutes()).toBe(0);
    expect(dailyAtMidnight).toBeGreaterThan(base);
    const every15 = nextRunForCron('*/15 * * * *', base);
    expect(new Date(every15).getUTCMinutes()).toBe(30);
  });

  it('enabled toggle persists and status reflects it', () => {
    setJobEnabled('test_job_a', false);
    expect(getScheduledJob('test_job_a')?.enabled).toBe(false);
    const status = getSchedulerStatus();
    const job = status.jobs.find((j) => j.id === 'test_job_a');
    expect(job?.enabled).toBe(false);
    resetSchedule();
    expect(listScheduledJobs().length).toBeGreaterThan(0);
  });
});