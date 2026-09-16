import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  registerScheduledJob,
  startScheduler,
  stopScheduler,
  getSchedulerStatus,
  setJobEnabled,
  triggerJob,
  listScheduledJobs,
  getScheduledJob,
  nextRunForCron,
  resetSchedule,
  schedulerStorePath,
  type ScheduledJobDef,
} from '../src/lib/jobScheduler.js';

let tmpDir = '';
let storeFile = '';

const def = (over: Partial<ScheduledJobDef> & { id: string }): ScheduledJobDef => ({
  name: over.id,
  group: 'test',
  cadenceMs: 60000,
  enabledByDefault: false,
  run: () => ({ ok: true }),
  ...over,
});

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobsched-test-'));
  storeFile = path.join(tmpDir, 'job-scheduler.json');
});

beforeEach(() => {
  fs.rmSync(storeFile, { force: true });
  vi.stubEnv('JOB_SCHEDULER_FILE', storeFile);
});

afterAll(() => {
  stopScheduler();
  vi.unstubAllEnvs();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('schedulerStorePath', () => {
  it('honours JOB_SCHEDULER_FILE and falls back to the default', () => {
    expect(schedulerStorePath()).toBe(storeFile);
    vi.stubEnv('JOB_SCHEDULER_FILE', '');
    expect(schedulerStorePath()).toContain(path.join('data', 'job-scheduler.json'));
  });
});

describe('registerScheduledJob validation', () => {
  it('rejects malformed definitions with specific errors', () => {
    expect(registerScheduledJob(undefined as any).ok).toBe(false);
    expect(registerScheduledJob({ id: '' } as any)).toEqual({ ok: false, error: 'job id required' });
    expect(registerScheduledJob({ id: 123 } as any).error).toBe('job id required');
    expect(registerScheduledJob({ id: 'v_norun', name: 'n', group: 't', cadenceMs: 60000, enabledByDefault: false } as any).error).toContain('requires a run() function');
    expect(registerScheduledJob({ id: 'v_nocad', name: 'n', group: 't', enabledByDefault: false, run: () => ({}) } as any).error).toContain('requires cadenceMs or cron');
    const tooFast = registerScheduledJob(def({ id: 'v_fast', cadenceMs: 999 }));
    expect(tooFast.ok).toBe(false);
    expect(tooFast.error).toContain('<1000');
    const badCron = registerScheduledJob(def({ id: 'v_badcron', cadenceMs: undefined, cron: 'not a cron' }));
    expect(badCron.ok).toBe(false);
    expect(badCron.error).toContain('invalid cron expression');
  });

  it('accepts a valid cron expression and rejects duplicate ids', () => {
    expect(registerScheduledJob(def({ id: 'cron_ok', cadenceMs: undefined, cron: '*/5 * * * *' })).ok).toBe(true);
    const dup = registerScheduledJob(def({ id: 'cron_ok', cadenceMs: undefined, cron: '*/5 * * * *' }));
    expect(dup.ok).toBe(false);
    expect(dup.error).toContain('already registered');
  });

  it('projects nextRunAt from cadence and from cron', () => {
    const before = Date.now();
    expect(registerScheduledJob(def({ id: 'proj_cadence', cadenceMs: 60000 })).ok).toBe(true);
    const j = getScheduledJob('proj_cadence')!;
    expect(j.nextRunAt).toBeGreaterThanOrEqual(before + 59000);
    expect(j.nextRunAt).toBeLessThanOrEqual(Date.now() + 61000);

    expect(registerScheduledJob(def({ id: 'proj_cron', cadenceMs: undefined, cron: '*/5 * * * *' })).ok).toBe(true);
    expect(getScheduledJob('proj_cron')!.nextRunAt).toBeGreaterThan(Date.now());
  });

  it('covers every interval → cron translation branch at registration', () => {
    const cadences = [
      1000, 3000, 60000, 120000, 3600000, 7200000, 86400000, 172800000,
      90000, 6000000, 5400000, 129600000, 259200000,
    ];
    for (const cadenceMs of cadences) {
      const r = registerScheduledJob(def({ id: `cad_${cadenceMs}`, cadenceMs }));
      expect(r.ok, `cadence ${cadenceMs}`).toBe(true);
      expect(getScheduledJob(`cad_${cadenceMs}`)!.nextRunAt).toBeGreaterThan(Date.now());
    }
  });

  it('reads persisted toggles over enabledByDefault and falls back on a corrupt file', () => {
    fs.writeFileSync(storeFile, JSON.stringify({ enabled: { persist_off: false } }), 'utf-8');
    expect(registerScheduledJob(def({ id: 'persist_off', enabledByDefault: true })).ok).toBe(true);
    expect(getScheduledJob('persist_off')!.enabled).toBe(false);

    fs.writeFileSync(storeFile, '{ not json', 'utf-8');
    expect(registerScheduledJob(def({ id: 'corrupt_fallback', enabledByDefault: true })).ok).toBe(true);
    expect(getScheduledJob('corrupt_fallback')!.enabled).toBe(true);
  });
});

describe('run bookkeeping', () => {
  it('tracks run/fail counts and lastOk/lastError', async () => {
    let fail = false;
    registerScheduledJob(
      def({
        id: 'okfail',
        run: async () => {
          if (fail) throw new Error('boom');
          return { value: 42 };
        },
      }),
    );

    const r1 = await triggerJob('okfail');
    expect(r1.ok).toBe(true);
    if (r1.ok === false) throw new Error('unreachable');
    expect(r1.ran).toBe(true);
    expect(r1.result).toEqual({ value: 42 });
    expect(r1.state.lastOk).toBe(true);
    expect(r1.state.runCount).toBe(1);

    fail = true;
    const r2 = await triggerJob('okfail');
    expect(r2.ok).toBe(true); // trigger completes; the failure is recorded
    const st = getScheduledJob('okfail')!;
    expect(st.lastOk).toBe(false);
    expect(st.lastError).toContain('boom');
    expect(st.runCount).toBe(2);
    expect(st.failCount).toBe(1);
    expect(st.lastRunAt).not.toBeNull();
    expect(st.running).toBe(false);
  });

  it('handles a thrown non-Error value', async () => {
    registerScheduledJob(def({ id: 'throwstr', run: () => { throw 'plain-string'; } }));
    await triggerJob('throwstr');
    expect(getScheduledJob('throwstr')!.lastError).toBe('plain-string');
  });

  it('overlap-guards concurrent triggers', async () => {
    let release!: () => void;
    const gate = new Promise<void>((res) => { release = res; });
    registerScheduledJob(def({ id: 'slow', run: async () => { await gate; return { done: true }; } }));

    const first = triggerJob('slow');
    const second = await triggerJob('slow');
    expect(second.ok).toBe(false);
    if (second.ok === false) expect(second.error).toContain('overlap guard');
    release();
    await first;
  });

  it('rejects unknown job ids', async () => {
    expect(await triggerJob('nope')).toEqual({ ok: false, error: 'unknown job "nope"' });
    const t = setJobEnabled('nope', true);
    expect(t.ok).toBe(false);
    if (t.ok === false) expect(t.error).toContain('unknown job');
    expect(getScheduledJob('nope')).toBeUndefined();
  });
});

describe('enabled toggles + persistence', () => {
  it('persists toggles and reports them through status/list', () => {
    registerScheduledJob(def({ id: 'toggle_me', enabledByDefault: true }));
    const r = setJobEnabled('toggle_me', false);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.enabled).toBe(false);
    expect(getScheduledJob('toggle_me')!.enabled).toBe(false);

    const written = JSON.parse(fs.readFileSync(storeFile, 'utf-8'));
    expect(written.enabled.toggle_me).toBe(false);

    const status = getSchedulerStatus();
    expect(status.jobs.find((j) => j.id === 'toggle_me')!.enabled).toBe(false);
    expect(listScheduledJobs().length).toBeGreaterThan(0);
  });

  it('resetSchedule restores persisted values and defaults', () => {
    registerScheduledJob(def({ id: 'reset_default', enabledByDefault: true }));
    registerScheduledJob(def({ id: 'reset_persisted', enabledByDefault: true }));
    fs.writeFileSync(storeFile, JSON.stringify({ enabled: { reset_persisted: false } }), 'utf-8');
    resetSchedule();
    expect(getScheduledJob('reset_default')!.enabled).toBe(true);
    expect(getScheduledJob('reset_persisted')!.enabled).toBe(false);
  });
});

describe('nextRunForCron', () => {
  const base = Date.UTC(2026, 8, 6, 10, 15, 0); // 2026-09-06 10:15 UTC

  it('returns a fallback when the expression is not 5 fields', () => {
    expect(nextRunForCron('* * *', base)).toBe(base + 60_000);
  });

  it('computes the next minute for * * * * *', () => {
    const next = nextRunForCron('* * * * *', base);
    expect(next).toBeGreaterThan(base);
    expect(new Date(next).getUTCMinutes()).toBe(16);
  });

  it('computes daily and stepped-minute schedules', () => {
    const daily = nextRunForCron('0 0 * * *', base);
    expect(new Date(daily).getUTCHours()).toBe(0);
    expect(new Date(daily).getUTCMinutes()).toBe(0);
    expect(daily).toBeGreaterThan(base);
    expect(new Date(nextRunForCron('*/15 * * * *', base)).getUTCMinutes()).toBe(30);
  });

  it('supports comma lists, ranges, and dom/mon/dow constraints', () => {
    expect(nextRunForCron('5,10 * * * *', base)).toBeGreaterThan(base);
    expect(nextRunForCron('20-30 * * * *', base)).toBeGreaterThan(base);
    expect(nextRunForCron('0 0 15 * *', base)).toBeGreaterThan(base);
    expect(nextRunForCron('0 0 * 6 *', base)).toBeGreaterThan(base);
    expect(nextRunForCron('0 0 * * 0', base)).toBeGreaterThan(base);
  });

  it('handles a zero step as a step of one without hanging', () => {
    expect(nextRunForCron('*/0 * * * *', base)).toBe(base + 60_000);
  });
});

describe('scheduler lifecycle (node-cron tasks)', () => {
  it('start/stop is idempotent and reflected in status', () => {
    registerScheduledJob(def({ id: 'lifecycle', cadenceMs: 3600000, enabledByDefault: true }));
    const s = startScheduler(1000);
    expect(s).toEqual({ started: true });
    const startedAt = getSchedulerStatus().startedAt;
    expect(typeof startedAt).toBe('number');

    expect(startScheduler()).toEqual({ started: false, reason: 'already running' });
    expect(getSchedulerStatus().running).toBe(true);

    expect(stopScheduler()).toEqual({ stopped: true });
    expect(getSchedulerStatus().running).toBe(false);
    expect(getSchedulerStatus().startedAt).toBeNull();
    // stopScheduler is idempotent: it always reports stopped and clears state.
    expect(stopScheduler()).toEqual({ stopped: true });
    expect(getSchedulerStatus().running).toBe(false);
  });

  it('syncs a cron task when a job is toggled while the scheduler runs', () => {
    registerScheduledJob(def({ id: 'toggle_running', cadenceMs: 3600000, enabledByDefault: false }));
    startScheduler();
    expect(setJobEnabled('toggle_running', true).ok).toBe(true);
    expect(setJobEnabled('toggle_running', false).ok).toBe(true);
    stopScheduler();
  });
});

describe('getSchedulerStatus', () => {
  it('returns copies of job state, not live references', () => {
    const status = getSchedulerStatus();
    expect(status).toHaveProperty('running');
    expect(status).toHaveProperty('startedAt');
    expect(Array.isArray(status.jobs)).toBe(true);
    if (status.jobs.length > 0) {
      const snapshot = status.jobs[0];
      const live = getScheduledJob(snapshot.id);
      expect(live).not.toBe(snapshot);
    }
  });
});
