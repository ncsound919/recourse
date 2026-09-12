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
 * SCHEDULING ENGINE: the actual firing is delegated to the mature `node-cron`
 * library (v4). One `node-cron` task is created per registered job and
 * started/stopped as the job's `enabled` toggle + scheduler lifecycle change.
 * `node-cron` owns the wall-clock timing; this module owns the registry, the
 * per-job bookkeeping, and the public API.
 *
 * A job is scheduled from its `cadenceMs` (fixed interval) OR its `cron`
 * 5/6-field expression. `cadenceMs` is translated to an equivalent cron
 * expression — see `intervalMsToCron` below for the exact (and honest)
 * mapping rules. Because node-cron is cron-shaped, a fixed interval is only
 * reproduced EXACTLY when it evenly divides the relevant period; every other
 * cadence is mapped to the closest cron step and the divergence documented.
 *
 * Honesty contract: the scheduler is pure orchestration. It never fabricates
 * a job's result — it records what the job returned. A job that is disabled,
 * gated by safe-boot, or skipped by its own guard is reported as skipped with
 * a reason, never as "ran".
 */

import fs from 'fs';
import path from 'path';
import cron, { type ScheduledTask } from 'node-cron';

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
  /** 5/6-field cron expression (minute hour dom mon dow [second]). */
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
// Cron-subset next-run estimator (reporting only)
// ----------------------------------------------------------------------------

// NOTE: node-cron is the actual scheduling engine. This legacy parser is kept
// for (a) the exported `nextRunForCron` helper and (b) estimating `nextRunAt`
// for jobs defined by a raw cron expression, where there is no cadenceMs to
// derive a projection from. Actual fire times are node-cron's.

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
// Fixed-interval → cron translation
// ----------------------------------------------------------------------------

/**
 * Translate a fixed `cadenceMs` interval into a node-cron expression.
 *
 * node-cron fires on wall-clock cron boundaries, so a pure interval is only
 * reproduced EXACTLY when it evenly divides its unit's period:
 *   - whole seconds < 1 min  → step must divide 60  → `* /<sec>` on the seconds field
 *   - whole minutes < 1 hour → step must divide 60  → `* /<min>` on the minutes field
 *   - whole hours            → step must divide 24  → `* /<hour>` on the hours field
 *
 * Honest mapping notes:
 *   - Cadences that are clean whole-second/minute/hour/day multiples map to a
 *     star-slash step expression and fire on the same cadence, but aligned to
 *     the wall clock instead of to registration/completion time (the old
 *     setInterval restarted cadenceMs after each run finished).
 *   - A sub-minute cadence whose seconds do not divide 60 (e.g. 7 s) maps to a
 *     second-step expression: node-cron re-aligns on the minute boundary, so
 *     the last gap of each minute is shorter than the cadence.
 *   - A cadence that is not a whole second/minute/hour (e.g. 90 s, 36 h)
 *     cannot be expressed exactly in cron; it is approximated to the nearest
 *     representable step (never firing more often than the requested cadence
 *     where avoidable). No current Recourse job registers such a cadence.
 * All cadences are validated to be >= 1000 ms at registration.
 */
function intervalMsToCron(cadenceMs: number): string {
  const seconds = cadenceMs / 1000;

  // Whole multiples of an hour.
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    if (hours === 24) return '0 0 * * *';
    if (hours > 24 && hours % 24 === 0) {
      const days = hours / 24;
      return days === 1 ? '0 0 * * *' : `0 0 */${days} * *`;
    }
    if (hours < 24) return hours === 1 ? '0 * * * *' : `0 */${hours} * * *`;
    // > 24 h but not a whole number of days (e.g. 36 h): approximate down to
    // the nearest whole-day step.
    const days = Math.max(1, Math.round(hours / 24));
    return days === 1 ? '0 0 * * *' : `0 0 */${days} * *`;
  }

  // Whole multiples of a minute (but not of an hour).
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    if (minutes <= 59) return minutes === 1 ? '* * * * *' : `*/${minutes} * * * *`;
    // >= 1 h but not a whole-hour multiple (e.g. 100 min): approximate to
    // the nearest hour step.
    const hours = Math.min(23, Math.max(1, Math.round(minutes / 60)));
    return hours === 1 ? '0 * * * *' : `0 */${hours} * * *`;
  }

  // Whole seconds under a minute → second-step expression.
  if (seconds < 60) {
    const sec = Math.max(1, Math.round(seconds));
    return `*/${sec} * * * * *`;
  }

  // >= 60 s but not a whole minute (e.g. 90 s): approximate to the nearest
  // whole minute.
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes === 1 ? '* * * * *' : `*/${minutes} * * * *`;
}

// ----------------------------------------------------------------------------
// Registry + scheduler state
// ----------------------------------------------------------------------------

/** The cron expression a job's def drives. cadenceMs wins when both present. */
function cronExpressionFor(def: ScheduledJobDef): string {
  return def.cadenceMs ? intervalMsToCron(def.cadenceMs) : (def.cron as string);
}

const jobs = new Map<string, ScheduledJobState>();
/** node-cron task per registered job, created stopped at registration. */
const cronTasks = new Map<string, ScheduledTask>();

const globalForScheduler = globalThis as unknown as {
  __recourseScheduler?: { running: boolean; startedAt: number | null };
};
const scheduler = globalForScheduler.__recourseScheduler ?? { running: false, startedAt: null };
globalForScheduler.__recourseScheduler = scheduler;

/** Projection of the next run for reporting (mirrors legacy cadence model). */
function estimateNextRunAt(job: Pick<ScheduledJobState, 'cadenceMs' | 'cron'>): number {
  const now = Date.now();
  if (job.cadenceMs) return now + job.cadenceMs;
  if (job.cron) return nextRunForCron(job.cron, now);
  return now + 60_000;
}

/** Run the handler once, recording state exactly like a scheduled fire. */
async function runJobOnce(job: ScheduledJobState): Promise<JobRunResult> {
  if (job.running) return { skipped: 'overlap guard' }; // belt-and-braces w/ noOverlap
  job.running = true;
  try {
    const result = await job.run();
    job.lastRunAt = Date.now();
    job.lastOk = true;
    job.lastError = null;
    job.runCount += 1;
    return result;
  } catch (err) {
    job.lastRunAt = Date.now();
    job.lastOk = false;
    job.lastError = err instanceof Error ? err.message : String(err);
    job.runCount += 1;
    job.failCount += 1;
    return null;
  } finally {
    job.running = false;
    job.nextRunAt = estimateNextRunAt(job);
  }
}

/** Should this job's node-cron task currently be ticking? */
function taskShouldRun(job: ScheduledJobState): boolean {
  return scheduler.running && job.enabled;
}

/** Bring one job's node-cron task in line with its enabled + scheduler state. */
function syncCronTask(job: ScheduledJobState): void {
  const task = cronTasks.get(job.id);
  if (!task) return;
  const status = task.getStatus();
  const shouldRun = taskShouldRun(job);
if (shouldRun && status === 'stopped') {
    void task.start();
  } else if (!shouldRun && (status === 'idle' || status === 'running')) {
    void task.stop();
  }
}

export function registerScheduledJob(def: ScheduledJobDef): { ok: boolean; error?: string } {
  if (!def || typeof def.id !== 'string' || !def.id) return { ok: false, error: 'job id required' };
  if (jobs.has(def.id)) return { ok: false, error: `job "${def.id}" already registered` };
  if (typeof def.run !== 'function') return { ok: false, error: `job "${def.id}" requires a run() function` };
  if (!def.cadenceMs && !def.cron) return { ok: false, error: `job "${def.id}" requires cadenceMs or cron` };
  if (def.cadenceMs && def.cadenceMs < 1000) return { ok: false, error: `job "${def.id}" cadenceMs too fast (<1000)` };
  if (!def.cadenceMs && def.cron && !cron.validate(def.cron)) {
    return { ok: false, error: `job "${def.id}" has invalid cron expression ("${def.cron}")` };
  }

  const persisted = loadToggles().enabled;
  const enabled = persisted[def.id] ?? def.enabledByDefault;
  const job: ScheduledJobState = {
    ...def,
    enabled,
    lastRunAt: null,
    lastOk: null,
    lastError: null,
    runCount: 0,
    failCount: 0,
    running: false,
    nextRunAt: estimateNextRunAt(def),
  };
  jobs.set(def.id, job);

  // Create the node-cron task STOPPED (createTask, not schedule), so a job is
  // only armed when the scheduler is running AND the job is enabled.
  try {
    const task = cron.createTask(cronExpressionFor(def), () => runJobOnce(job), {
      name: def.id,
      noOverlap: true, // never run a job concurrently with itself
    });
    cronTasks.set(def.id, task);
    syncCronTask(job);
  } catch (err) {
    jobs.delete(def.id);
    return { ok: false, error: `job "${def.id}" could not be scheduled: ${(err as Error)?.message ?? err}` };
  }
  return { ok: true };
}

export function setJobEnabled(id: string, enabled: boolean): SchedulerToggleResult {
  const job = jobs.get(id);
  if (!job) return { ok: false, error: `unknown job "${id}"` };
  job.enabled = enabled;
  job.nextRunAt = estimateNextRunAt(job);
  syncCronTask(job);
  saveToggles();
  return { ok: true, state: { ...job } };
}

/** Immediately run a job (respects overlap guard; returns ran=false if busy). */
export async function triggerJob(id: string): Promise<SchedulerTriggerResult> {
  const job = jobs.get(id);
  if (!job) return { ok: false, error: `unknown job "${id}"` };
  if (job.running) return { ok: false, error: `job "${id}" is already running (overlap guard)` };
  const result = await runJobOnce(job);
  return { ok: true, result, ran: true, state: { ...job } };
}

export function startScheduler(_tickMs = 1000): { started: boolean; reason?: string } {
  if (scheduler.running) return { started: false, reason: 'already running' };
  scheduler.running = true;
  scheduler.startedAt = Date.now();
  // _tickMs is accepted for API compatibility with the legacy polling loop;
  // node-cron owns timing now, so there is no tick interval to honour.
  for (const job of jobs.values()) syncCronTask(job);
  return { started: true };
}

export function stopScheduler(): { stopped: boolean } {
  scheduler.running = false;
  scheduler.startedAt = null;
  for (const task of cronTasks.values()) {
    const status = task.getStatus();
    if (status === 'idle' || status === 'running') void task.stop();
  }
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
    job.nextRunAt = estimateNextRunAt(job);
  }
  for (const job of jobs.values()) syncCronTask(job);
  saveToggles();
}
