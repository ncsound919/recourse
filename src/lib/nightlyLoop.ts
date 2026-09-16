/**
 * nightlyLoop.ts — the durable, idempotent nightly self-improvement coordinator
 * (Phase 5, item 17): dream -> problem -> forge -> verify -> promote ->
 * benchmark-delta report.
 *
 * The individual loops already exist and run on the server heartbeat. What was
 * missing is a *coordinated nightly* pass that (a) runs at most once per night,
 * (b) records a durable run journal, and (c) emits a self-attested
 * benchmark-delta report via `upgradeReport`. This module owns that
 * coordination; every step is injected, so it is testable without the server.
 *
 * Honesty: a step that is not configured is recorded as skipped; a step that
 * throws is recorded as failed with the real error. The report reflects only
 * measured before/after deltas — never an invented improvement.
 */
import fs from 'node:fs';
import path from 'node:path';
import { readJsonFile, writeJsonFile } from './durableJson.js';
import { renderUpgradeReport, type Snapshot } from './upgradeReport.js';

export type NightlyActionStep = 'dream' | 'forge' | 'benchmark';
export const NIGHTLY_ACTION_STEPS: readonly NightlyActionStep[] = ['dream', 'forge', 'benchmark'];

export interface NightlyStepResult {
  id: NightlyActionStep | 'snapshot' | 'report';
  ok: boolean;
  skipped: boolean;
  detail: string;
  at: number;
  ms: number;
  data?: unknown;
}

export interface NightlyRun {
  key: string;
  startedAt: number;
  finishedAt: number;
  forced: boolean;
  skipped: boolean;
  steps: NightlyStepResult[];
  before?: Snapshot;
  after?: Snapshot;
  reportMarkdown?: string;
}

export function nightlyKey(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function nightlyFile(): string {
  return process.env.RECOURSE_NIGHTLY_FILE || path.join(process.cwd(), 'data', 'self-improvement', 'nightly.json');
}

interface NightlyDoc {
  version: 1;
  runs: Record<string, NightlyRun>;
}

const MAX_RUNS = 90;

export interface NightlyStore {
  file(): string;
  get(key: string): NightlyRun | undefined;
  save(run: NightlyRun): void;
  latest(): NightlyRun | undefined;
  list(limit?: number): NightlyRun[];
  status(): { runCount: number; lastKey?: string; lastRun?: NightlyRun };
}

export function openNightlyStore(file = nightlyFile()): NightlyStore {
  const load = (): NightlyDoc => {
    const doc = readJsonFile<NightlyDoc>(file, { version: 1, runs: {} });
    if (!doc || typeof doc !== 'object' || typeof doc.runs !== 'object' || doc.runs === null) return { version: 1, runs: {} };
    return { version: 1, runs: doc.runs };
  };
  const ordered = (doc: NightlyDoc): NightlyRun[] =>
    Object.values(doc.runs).sort((a, b) => a.startedAt - b.startedAt);
  return {
    file: () => file,
    get: (key) => load().runs[key],
    save(run) {
      const doc = load();
      doc.runs[run.key] = run;
      const keys = ordered(doc).map((r) => r.key);
      while (keys.length > MAX_RUNS) {
        const drop = keys.shift();
        if (drop) delete doc.runs[drop];
      }
      writeJsonFile(file, doc);
    },
    latest() {
      const runs = ordered(load());
      return runs.length ? runs[runs.length - 1] : undefined;
    },
    list(limit = 30) {
      return ordered(load()).slice(-Math.max(1, limit)).reverse();
    },
    status() {
      const runs = ordered(load());
      const last = runs[runs.length - 1];
      return { runCount: runs.length, ...(last ? { lastKey: last.key, lastRun: last } : {}) };
    },
  };
}

export interface NightlyPlan {
  run: boolean;
  reason: string;
}

/** Pure idempotency check: run once per night unless forced. */
export function planNightlyRun(input: { key: string; existingKey?: string; force?: boolean }): NightlyPlan {
  if (input.force) return { run: true, reason: 'forced' };
  if (input.existingKey === input.key) return { run: false, reason: `already ran for ${input.key}` };
  return { run: true, reason: `first run for ${input.key}` };
}

export interface NightlyStepOutcome {
  ok: boolean;
  detail: string;
  data?: unknown;
}

export interface NightlyDeps {
  store: NightlyStore;
  /** Real before/after metric snapshots (from the server). */
  metrics: () => Promise<Snapshot>;
  /** Action runners; a missing runner is recorded as skipped, never fabricated. */
  steps?: Partial<Record<NightlyActionStep, () => Promise<NightlyStepOutcome>>>;
  now?: () => number;
  force?: boolean;
}

async function timed(id: NightlyStepResult['id'], run: () => Promise<NightlyStepOutcome>, now: () => number): Promise<NightlyStepResult> {
  const start = now();
  try {
    const out = await run();
    return { id, ok: out.ok, skipped: false, detail: out.detail, data: out.data, at: start, ms: Math.max(0, now() - start) };
  } catch (err: any) {
    return { id, ok: false, skipped: false, detail: err?.message || 'step threw', at: start, ms: Math.max(0, now() - start) };
  }
}

/** Run one nightly cycle (idempotent per UTC day unless forced). */
export async function runNightlyCycle(deps: NightlyDeps): Promise<NightlyRun> {
  const now = deps.now ?? (() => Date.now());
  const key = nightlyKey(now());
  const existing = deps.store.get(key);
  const plan = planNightlyRun({ key, existingKey: existing?.key, force: deps.force });
  if (!plan.run && existing) return { ...existing, skipped: true };

  const startedAt = now();
  const steps: NightlyStepResult[] = [];

  let before: Snapshot | undefined;
  try {
    before = await deps.metrics();
    steps.push({ id: 'snapshot', ok: true, skipped: false, detail: 'captured before-metrics', at: startedAt, ms: 0, data: before });
  } catch (err: any) {
    steps.push({ id: 'snapshot', ok: false, skipped: false, detail: `before-metrics failed: ${err?.message || err}`, at: startedAt, ms: 0 });
  }

  for (const id of NIGHTLY_ACTION_STEPS) {
    const runner = deps.steps?.[id];
    if (!runner) {
      steps.push({ id, ok: true, skipped: true, detail: `${id} not configured`, at: now(), ms: 0 });
      continue;
    }
    steps.push(await timed(id, runner, now));
  }

  let after: Snapshot | undefined;
  const afterStart = now();
  try {
    after = await deps.metrics();
    steps.push({ id: 'snapshot', ok: true, skipped: false, detail: 'captured after-metrics', at: afterStart, ms: Math.max(0, now() - afterStart), data: after });
  } catch (err: any) {
    steps.push({ id: 'snapshot', ok: false, skipped: false, detail: `after-metrics failed: ${err?.message || err}`, at: afterStart, ms: Math.max(0, now() - afterStart) });
  }

  const events = steps.filter((s) => !s.skipped).map((s) => `${s.id}: ${s.ok ? 'ok' : 'FAILED'} — ${s.detail}`);
  const reportMarkdown = renderUpgradeReport({ before: before ?? {}, after: after ?? {}, events, date: new Date(now()) });
  steps.push({ id: 'report', ok: true, skipped: false, detail: 'rendered upgrade report', at: now(), ms: 0 });

  const finishedAt = now();
  const run: NightlyRun = {
    key,
    startedAt,
    finishedAt,
    forced: Boolean(deps.force),
    skipped: false,
    steps,
    before,
    after,
    reportMarkdown,
  };
  deps.store.save(run);
  return run;
}
