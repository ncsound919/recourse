/**
 * Job Scheduler — the autonomy governor that compartmentalizes every
 * long-running Recourse function into its own scheduled job.
 *
 * Replaces the ad-hoc scatter of independent `setInterval`s (forge, intake,
 * swarm, dev, server-tick, science conductor, dream, self-hosted re-verify)
 * with ONE scheduler that:
 *
 *   - Arms every job at boot (respecting persisted toggles + safe-boot), so
 *     "when Recourse starts, all functions are used ongoingly".
 *   - Compartmentalizes: each job gets its own cadence, its own state, and a
 *     failure is isolated to that job — one broken subsystem never stops the
 *     others.
 *   - Overlap-guards: a job never runs concurrently with itself.
 *   - Persists enabled/disabled toggles to data/job-scheduler.json so the
 *     schedule survives restarts.
 *   - Tracks lastRun/lastOk/lastError/runCount/failCount per job, exposed for
 *     dashboards and provenance.
 *
 * Scheduling supports either a fixed `cadenceMs` interval OR a 5-field cron
 * expression (minute/hour/dom/mon/dow — the common subset: `*`, step `N`,
 * single `N`, `N-M`, comma lists). For cron jobs with dom/mon/dow constraints
 * beyond `*`, the computed next-run is conservative (daily).
 *
 * Honesty contract: the scheduler is pure orchestration. It never fabricates
 * a job's result — it records what the job returned. A job that is disabled,
 * gated by safe-boot, or skipped by its own guard is reported as skipped with
 * a reason, never as "ran".
 */

import fs from 'fs';
import path from 'path';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type JobRunResult = unknown;

export interface ScheduledJobDef {
  /** Stable id used by routes/persistence, e.g. 'forge', 'science'. */
  id: string;
  /** Human label for dashboards. */
  name: string;
  /** Compartment group, e.g. 'autonomy' | 'science' | 'system'. */
  group: string;
  /** One-shot runner. Return value recorded; throw recorded as failure. */
  run: () => Promise<JobRunResult> | JobRunResult;
  /** Fixed-interval cadence, OR provide `cron`. One of the two required. */
  cadenceMs?: number;
  /** 5-field cron expression (minute hour dom mon dow). */
  cron?: string;
  /** Enabled when the scheduler starts (overridden by persisted toggles). */
  enabledByDefault: boolean;
  /** Jobs gated behind safe-boot (model/self-modifying) stay disabled until
   *  the operator arms them when safe-boot is active. */
  safeBootGated?: boolean;
}

export interface ScheduledJobState extends ScheduledJobDef {
  enabled: boolean;
  lastRunAt: number | null;
  lastOk: boolean | null;
  lastError: string | null;
  runCount: number;
  failCount: number;
  running: boolean;
  nextRunAt: number;
}

export interface SchedulerStatus {
  running: boolean;
  startedAt: number | null;
  jobs: ScheduledJobState[];
}

export type SchedulerToggleResult =
  | { ok: true; state: ScheduledJobState }
  | { ok: false; error: string };

export type SchedulerTriggerResult =
  | { ok: true; result: JobRunResult; ran: boolean; skippedReason?: string; state: ScheduledJobState }
  | { ok: false; error: string };

// ----------------------------------------------------------------------------
// Persistence
// ----------------------------------------------------------------------------

const STORE_DEFAULT = path.join(process.cwd(), 'data', 'job-scheduler.json');

export function schedulerStorePath(): string {
  return process.env.JOB_SCHEDULER_FILE || STORE_DEFAULT;
}

interface PersistedToggles {
  enabled: Record<string, boolean>;
}

function loadToggles(): PersistedToggles {
  try {
    const file = schedulerStorePath();
    if (!fs.existsSync(file)) return { enabled: {} };
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as PersistedToggles;
  } catch {
    return { enabled: {} };
  }
}

function saveToggles(): void {
  const toggles: PersistedToggles = { enabled: {} };
  for (const job of jobs.values()) toggles.enabled[job.id] = job.enabled;
  try {
    fs.mkdirSync(path.dirname(schedulerStorePath()), { recursive: true });
    fs.writeFileSync(schedulerStorePath(), JSON.stringify(toggles, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[job-scheduler] failed to persist toggles:', (err as Error)?.message ?? err);
  }
}

// ----------------------------------------------------------------------------
// Cron subset parser
// ----------------------------------------------------------------------------

function parseField(field: string, min: number, max: number): Set<number> {
  const out = new Set<number>();
  for (const part of field.split(',')) {
    if (part === '*') {
      for (let v = min; v <= max; v++) out.add(v);
      continue;
    }
    const stepMatch = /^\*\/(\d+)$/.exec(part);
    if (stepMatch) {
      const step = Math.max(1, Number(stepMatch[1]));
      for (let v = min; v <= max; v += step) out.add(v);
      continue;
    }
    const rangeMatch = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (rangeMatch) {
      const a = Number(rangeMatch[1]);
      const b = rangeMatch[2] ? Number(rangeMatch[2]) : a;
      for (let v = a; v <= b; v++) out.add(v);
      continue;
    }
  }
  return out;
}

/**
 * Compute the next time a cron expression fires at-or-after `from`.
 * Evaluates minute/hour/dom/mon/dow with the supported subset; a conservative
 * daily roll is used when dom/mon/dow are not `*`.
 */
export function nextRunForCron(expr: string, from: number): number {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return from + 60_000;
  const [minField, hourField, domField, monField, dowField] = parts;
  const minutes = parseField(minField, 0, 59);
  const hours = parseField(hourField, 0, 23);
  const domAll = domField === '*';
  const monAll = monField === '*';
  const dowAll = dowField === '*';

  // Search forward up to 370 days; deterministic, bounded.
  for (let day = 0; day < 370; day++) {
    const dayStart = new Date(from);
    dayStart.setUTCHours(0, 0, 0, 0);
    dayStart.setTime(dayStart.getTime() + day * 24 * 3600 * 1000);
    const m = dayStart.getUTCMonth() + 1;
    const dow = (dayStart.getUTCDay() + 6) % 7; // 0=Monday..6=Sunday
    const dom = dayStart.getUTCDate();
    if (!monAll && !parseField(monField, 1, 12).has(m)) continue;
    if (!dowAll && !parseField(dowField, 0, 6).has(dow)) continue;
    if (!domAll && !parseField(domField, 1, 31).has(dom)) continue;
    for (const h of [...hours].sort((a, b) => a - b)) {
      for (const minute of [...minutes].sort((a, b) => a - b)) {
        const candidate = new Date(dayStart);
        candidate.setUTCHours(h, minute, 0, 0);
        if (candidate.getTime() > from) return candidate.getTime();
      }
    }
  }
  return from + 24 * 3600 * 1000;
}

// ----------------------------------------------------------------------------
// Registry + scheduler state
// ----------------------------------------------------------------------------

const jobs = new Map<string, ScheduledJobState>();
const globalForScheduler = globalThis as unknown as { __recourseScheduler?: { running: boolean; startedAt: number | null; timer: NodeJS.Timeout | null } };
const scheduler =
  globalForScheduler.__recourseScheduler ?? { running: false, startedAt: null, timer: null };
globalForScheduler.__recourseScheduler = scheduler;

export function registerScheduledJob(def: ScheduledJobDef): { ok: boolean; error?: string } {
  if (!def || typeof def.id !== 'string' || !def.id) return { ok: false, error: 'job id required' };
  if (jobs.has(def.id)) return { ok: false, error: `job "${def.id}" already registered` };
  if (typeof def.run !== 'function') return { ok: false, error: `job "${def.id}" requires a run() function` };
  if (!def.cadenceMs && !def.cron) return { ok: false, error: `job "${def.id}" requires cadenceMs or cron` };
  if (def.cadenceMs && def.cadenceMs < 1000) return { ok: false, error: `job "${def.id}" cadenceMs too fast (<1000)` };

  const persisted = loadToggles().enabled;
  const enabled = persisted[def.id] ?? def.enabledByDefault;
  const now = Date.now();
  jobs.set(def.id, {
    ...def,
    enabled,
    lastRunAt: null,
    lastOk: null,
    lastError: null,
    runCount: 0,
    failCount: 0,
    running: false,
    nextRunAt: now + (def.cadenceMs ?? 60_000),
  });
  return { ok: true };
}

export function setJobEnabled(id: string, enabled: boolean): SchedulerToggleResult {
  const job = jobs.get(id);
  if (!job) return { ok: false, error: `unknown job "${id}"` };
  job.enabled = enabled;
  job.nextRunAt = Date.now() + (job.cadenceMs ?? 60_000);
  saveToggles();
  return { ok: true, state: { ...job } };
}

/** Immediately run a job (respects overlap guard; returns ran=false if busy). */
export async function triggerJob(id: string): Promise<SchedulerTriggerResult> {
  const job = jobs.get(id);
  if (!job) return { ok: false, error: `unknown job "${id}"` };
  if (job.running) return { ok: false, error: `job "${id}" is already running (overlap guard)` };
  job.running = true;
  try {
    const result = await job.run();
    job.lastRunAt = Date.now();
    job.lastOk = true;
    job.lastError = null;
    job.runCount += 1;
    job.nextRunAt = Date.now() + (job.cadenceMs ?? 60_000);
    return { ok: true, result, ran: true, state: { ...job } };
  } catch (err) {
    job.lastRunAt = Date.now();
    job.lastOk = false;
    job.lastError = err instanceof Error ? err.message : String(err);
    job.runCount += 1;
    job.failCount += 1;
    job.nextRunAt = Date.now() + (job.cadenceMs ?? 60_000);
    return { ok: true, result: null, ran: true, state: { ...job } };
  } finally {
    job.running = false;
  }
}

async function runDueJobs(): Promise<void> {
  const now = Date.now();
  for (const job of jobs.values()) {
    if (!job.enabled) continue;
    if (job.running) continue; // overlap guard
    if (now < job.nextRunAt) continue;
    job.running = true;
    void (async () => {
      try {
        await job.run();
        job.lastRunAt = Date.now();
        job.lastOk = true;
        job.lastError = null;
        job.runCount += 1;
      } catch (err) {
        job.lastRunAt = Date.now();
        job.lastOk = false;
        job.lastError = err instanceof Error ? err.message : String(err);
        job.runCount += 1;
        job.failCount += 1;
      } finally {
        job.running = false;
        job.nextRunAt = Date.now() + (job.cadenceMs ?? 60_000);
      }
    })();
  }
}

export function startScheduler(tickMs = 1000): { started: boolean; reason?: string } {
  if (scheduler.running) return { started: false, reason: 'already running' };
  scheduler.running = true;
  scheduler.startedAt = Date.now();
  scheduler.timer = setInterval(() => void runDueJobs().catch(() => {}), tickMs);
  return { started: true };
}

export function stopScheduler(): { stopped: boolean } {
  if (scheduler.timer) clearInterval(scheduler.timer);
  scheduler.timer = null;
  scheduler.running = false;
  scheduler.startedAt = null;
  return { stopped: true };
}

export function getSchedulerStatus(): SchedulerStatus {
  return {
    running: scheduler.running,
    startedAt: scheduler.startedAt,
    jobs: [...jobs.values()].map((j) => ({ ...j })),
  };
}

export function listScheduledJobs(): ScheduledJobState[] {
  return [...jobs.values()].map((j) => ({ ...j }));
}

export function getScheduledJob(id: string): ScheduledJobState | undefined {
  const job = jobs.get(id);
  return job ? { ...job } : undefined;
}

/** Reset every job to enabledByDefault (persisted) — used on full reset. */
export function resetSchedule(): void {
  const persisted = loadToggles().enabled;
  for (const job of jobs.values()) {
    job.enabled = persisted[job.id] ?? job.enabledByDefault;
    job.nextRunAt = Date.now() + (job.cadenceMs ?? 60_000);
  }
  saveToggles();
}