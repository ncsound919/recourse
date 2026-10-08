/**
 * dailyScience.ts — Recourse-native daily science jobs.
 *
 *   runLogisticsDaily()      enqueue OV365-LOGI-001 on Kaggle CPU (non-blocking).
 *                            The 2-minute remote-compute drain collects the result and
 *                            applyScienceExperiment() writes the dated report.
 *   runOncologyGateDaily()   evaluate OV365-NEURO-002 prerequisites and write a
 *                            fail-closed report. Never runs an experiment.
 *
 * Honesty contract: every metric in a report comes from the remote run's result
 * envelope. A failed or missing run produces a failure report, never a number.
 */
import fs from 'node:fs';
import path from 'node:path';
import { readJsonFile, writeJsonFile } from './durableJson.js';
import {
  enqueueRemoteTask,
  readRemoteQueue,
  remoteComputeEnabled,
  type RemoteComputeDeps,
  type RemoteTask,
} from './remoteCompute.js';
import { mirrorReadout } from './lensReadoutMirror.js';
import { buildArtifact, type ResearchArtifact } from './researchArtifact.js';
import {
  ONCOLOGY_METHODS,
  ONCOLOGY_METHOD_REQUIREMENTS,
  buildOncologyScript,
  oncologyMethodById,
} from './oncologyExperiments.js';
import type { ScienceFinding } from './scienceConductor.js';
import { COHORT_EXPERIMENTS, buildCohortScript, cohortExperimentById, cohortKernelSlug, type CohortExperiment } from './cohortExperiments.js';

/** A WDBC method experiment (ONC-*) or a dataset-attached cohort experiment (COH-*). */
function isMethodExperiment(id: string): boolean {
  return !!(oncologyMethodById(id) || cohortExperimentById(id));
}
import {
  LOGISTICS_EXPERIMENT_ID,
  LOGISTICS_REQUIREMENTS,
  ONCOLOGY_EXPERIMENT_ID,
  buildLogisticsScript,
  evaluateOncologyGate,
  loadOncologyGate,
  localDateStamp,
  readLogisticsSample,
  renderLogisticsReport,
  renderOncologyGateReport,
  scienceReportsDir,
  type LogisticsRunRecord,
} from './dailyScienceCore.js';

export interface DailyScienceDoc {
  version: 1;
  runs: LogisticsRunRecord[];
  oncology: Array<{ date: string; status: string; unmet: number; reportPath: string | null }>;
}

export function dailyScienceRegistryPath(): string {
  return process.env.DAILY_SCIENCE_FILE || `${process.cwd()}/data/daily-science.json`;
}
export function oncologyGatePath(): string {
  return process.env.ONCOLOGY_GATE_FILE || `${process.cwd()}/data/oncology-gate.json`;
}

export function readDailyScience(): DailyScienceDoc {
  const doc = readJsonFile<DailyScienceDoc>(dailyScienceRegistryPath(), { version: 1, runs: [], oncology: [] });
  if (!doc || doc.version !== 1 || !Array.isArray(doc.runs)) return { version: 1, runs: [], oncology: [] };
  if (!Array.isArray(doc.oncology)) doc.oncology = [];
  return doc;
}

function writeDailyScience(doc: DailyScienceDoc): void {
  // Dedupe of failed-task reports relies on this list; keep it well past the queue's 200-task cap.
  doc.runs = doc.runs.slice(-2000);
  doc.oncology = doc.oncology.slice(-200);
  try {
    writeJsonFile(dailyScienceRegistryPath(), doc);
  } catch (err) {
    console.warn('[daily-science] registry persist failed:', err instanceof Error ? err.message : String(err));
  }
}

/** Write a report to the Overlay-Global-Lens folder; fall back to data/reports/science if it is unwritable. */
function writeReport(name: string, latestName: string, markdown: string): string | null {
  const dirs = [scienceReportsDir(), path.join(process.cwd(), 'data', 'reports', 'science')];
  for (const dir of dirs) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, name);
      fs.writeFileSync(file, markdown, 'utf8');
      fs.writeFileSync(path.join(dir, latestName), markdown, 'utf8');
      return file;
    } catch (err) {
      console.warn(`[daily-science] could not write report to ${dir}:`, err instanceof Error ? err.message : String(err));
    }
  }
  return null;
}

function recordRun(rec: LogisticsRunRecord): string | null {
  const doc = readDailyScience();
  if (doc.runs.some((r) => r.taskId === rec.taskId)) return null;
  const reportPath = writeReport(
    `${rec.experimentId}-${rec.date}${rec.ok ? '' : '-FAILED'}${rec.experimentId === LOGISTICS_EXPERIMENT_ID ? '' : `-${String(rec.taskId).slice(-6)}`}.md`,
    `latest-${rec.experimentId}.md`,
    isMethodExperiment(rec.experimentId) ? renderOncologyMethodReport(rec) : renderLogisticsReport(rec),
  );
  doc.runs.push(rec);
  writeDailyScience(doc);
  return reportPath;
}

// ---------------------------------------------------------------------------
// OV365-ONC-A/B/C: WDBC method experiments (see oncologyExperiments.ts for scope)
// ---------------------------------------------------------------------------
type OncSummary = { claim: string; numbers: Record<string, number | null>; n: number; test: string | null; effect?: number; p?: number };

function oncSummary(rec: LogisticsRunRecord): OncSummary | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sm = (rec.data as any)?.summary;
  if (!sm || typeof sm.claim !== 'string' || !sm.numbers || typeof sm.numbers !== 'object') return null;
  return sm as OncSummary;
}

export function renderOncologyMethodReport(rec: LogisticsRunRecord): string {
  const m = oncologyMethodById(rec.experimentId);
  const c = cohortExperimentById(rec.experimentId);
  const L: string[] = [`# ${rec.experimentId} — ${m?.title ?? c?.title ?? 'oncology method experiment'} (${rec.date})`, ''];
  if (c) {
    L.push(`Data: Kaggle dataset \`${c.dataset}\` (licence: ${c.license}), attached to the kernel; computed next to the data. Public retrospective data, no independent verification: evidence tier E4, internal only.`, '');
  } else {
    L.push('Scope: method validation on the public UCI WDBC benchmark (569 breast-cytology cases, bundled with scikit-learn). Small and easy (AUC about 0.99). NOT an oncology finding; evidence tier E4; internal only.', '');
  }
  if (!rec.ok) {
    L.push(`**Run failed:** ${rec.error ?? 'no result data'}. No numbers are reported.`, '', `Task ${rec.taskId} on ${rec.platform}.`);
    return L.join('\n');
  }
  const sm = oncSummary(rec);
  if (!sm) { L.push('Run returned no summary block; nothing is reported.'); return L.join('\n'); }
  L.push(`**Result:** ${sm.claim}`, '', '| quantity | value |', '|---|---|');
  for (const [k, v] of Object.entries(sm.numbers)) L.push(`| ${k} | ${v ?? 'n/a'} |`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = rec.data as any;
  if (c) {
    // Full envelope (minus the summary already shown) so every reported number is inspectable.
    const { summary: _s, ok: _o, ...rest } = (d ?? {}) as Record<string, unknown>;
    L.push('', '<details><summary>full result</summary>', '', '```json', JSON.stringify(rest, null, 1), '```', '</details>');
  } else {
    for (const key of ['alphas', 'levels', 'learningCurve']) {
      if (d?.[key]) L.push('', `<details><summary>${key}</summary>`, '', '```json', JSON.stringify(d[key], null, 1), '```', '</details>');
    }
  }
  L.push('', `Seed ${d?.seed}, ${d?.reps} repetitions, task ${rec.taskId} on ${rec.platform}. Every number above comes from the remote result envelope.`);
  return L.join('\n');
}

export function buildOncologyFinding(rec: LogisticsRunRecord): { finding: ScienceFinding; artifact: ResearchArtifact } | null {
  const sm = oncSummary(rec);
  if (!sm) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = rec.data as any;
  const hasTest = sm.test && typeof sm.p === 'number' && typeof sm.effect === 'number';
  const artifact = buildArtifact({
    kind: 'science_experiment_result',
    claim: sm.claim,
    engine: `kaggle:${rec.platform}`,
    dataVersion: typeof d?.fileSha256 === 'string' ? d.fileSha256 : cohortExperimentById(rec.experimentId) ? `kaggle:${cohortExperimentById(rec.experimentId)!.dataset}` : 'uci-wdbc:sklearn.datasets.load_breast_cancer',
    params: { experiment: rec.experimentId, seed: d?.seed ?? 0, reps: d?.reps ?? 0, taskId: rec.taskId },
    seed: typeof d?.seed === 'number' ? d.seed : null,
    evidenceTier: 'E4',
    stats: hasTest ? { test: String(sm.test), n: sm.n, effect: sm.effect, p: sm.p, method: 'permutation' } : null,
    verification: null,
    provenance: `${rec.experimentId} kaggle task ${rec.taskId}`,
  });
  const finding: ScienceFinding = {
    kind: 'science_experiment_result', hypothesisId: rec.experimentId, problemId: cohortExperimentById(rec.experimentId) ? 'oncology-cohorts' : 'oncology-methods-wdbc',
    claim: sm.claim, numbers: sm.numbers, provenance: `${rec.experimentId} kaggle ${rec.taskId}`, mode: 'remote_engine', cycle: 0,
  };
  return { finding, artifact };
}

/**
 * Internal findings-ledger entry for a successful logistics run. Every number comes from the run
 * envelope; tier is E4 (exploratory: unverified-provenance data, no independent verification).
 * Returns null when the envelope lacks the temporal-holdout result (nothing is invented).
 */
export function buildLogisticsFinding(rec: LogisticsRunRecord): { finding: ScienceFinding; artifact: ResearchArtifact } | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = (rec.data as any)?.splits?.temporal_holdout;
  const g = s?.mae_gain_gbm_vs_mean;
  if (!s || !g || typeof g.estimate !== 'number' || !Array.isArray(g.ci95) || g.ci95.length !== 2) return null;
  const mae = (arm: string): number | null => (typeof s.arms?.[arm]?.mae === 'number' ? s.arms[arm].mae : null);
  const claim = `Delivery-time model (${rec.experimentId}, temporal holdout): gradient boosting reduces MAE by ${g.estimate.toFixed(1)} min vs predicting the training mean (95% day-cluster bootstrap CI ${g.ci95[0].toFixed(1)} to ${g.ci95[1].toFixed(1)}). Dataset provenance unverified; internal only.`;
  const numbers: Record<string, number | null> = {
    mae_gain_vs_mean: g.estimate, ci_lo: g.ci95[0], ci_hi: g.ci95[1],
    mae_b2: mae('B2_gbm'), mae_b0: mae('B0_mean'), n_train: s.n_train ?? null, n_test: s.n_test ?? null,
  };
  const artifact = buildArtifact({
    kind: 'science_experiment_result',
    claim,
    engine: `kaggle:${rec.platform}`,
    dataVersion: rec.dataset?.fileSha256 ?? null,
    params: { sampleSha256: rec.dataset?.sampleSha256 ?? '', sampledRows: rec.dataset?.sampledRows ?? 0, taskId: rec.taskId },
    seed: null,
    evidenceTier: 'E4',
    stats: {
      test: 'day_cluster_bootstrap_mae_gain', n: Number(s.n_test ?? 0), effect: g.estimate,
      ci: { lower: g.ci95[0], upper: g.ci95[1], level: 0.95 }, method: 'bootstrap',
    },
    verification: null,
    provenance: `${rec.experimentId} kaggle task ${rec.taskId}`,
  });
  const finding: ScienceFinding = {
    kind: 'science_experiment_result', hypothesisId: rec.experimentId, problemId: 'logistics-eta',
    claim, numbers, provenance: `${rec.experimentId} kaggle ${rec.taskId}`, mode: 'remote_engine', cycle: 0,
  };
  return { finding, artifact };
}

/** Applier for task kind `science_experiment` (successful results only). */
export function applyScienceExperiment(
  task: RemoteTask,
  appendProvenance?: (type: string, data: Record<string, unknown>) => void,
  recordFinding?: (f: ScienceFinding, a: ResearchArtifact) => void,
): void {
  const data = task.result?.data;
  // Kaggle reuses one kernel slug per task kind; if a poll ever returned the previous
  // version's log, the envelope would belong to another experiment. Refuse it.
  const expected = String(task.payload?.experiment ?? LOGISTICS_EXPERIMENT_ID);
  const reported = data ? (data.experiment ?? data.experiment_id) : undefined;
  const mismatch = typeof reported === 'string' && reported !== expected;
  const ok = !!data && data.ok !== false && task.result?.ok !== false && !mismatch;
  const rec: LogisticsRunRecord = {
    experimentId: String(task.payload?.experiment ?? LOGISTICS_EXPERIMENT_ID),
    taskId: task.id,
    platform: task.platform,
    at: Date.now(),
    date: localDateStamp(new Date(task.createdAt)),
    ok,
    data: ok ? data : undefined,
    error: ok ? undefined : mismatch ? `result envelope is for ${reported}, not ${expected} (stale kernel output?)` : task.result?.error ?? 'no result data',
    dataset: task.payload?.dataset as LogisticsRunRecord['dataset'],
  };
  const already = readDailyScience().runs.some((r) => r.taskId === rec.taskId);
  const reportPath = recordRun(rec);
  if (ok && !already && recordFinding && (rec.experimentId === LOGISTICS_EXPERIMENT_ID || isMethodExperiment(rec.experimentId))) {
    try {
      const built = rec.experimentId === LOGISTICS_EXPERIMENT_ID ? buildLogisticsFinding(rec) : buildOncologyFinding(rec);
      if (built) recordFinding(built.finding, built.artifact);
    } catch (err) {
      console.warn('[daily-science] finding record failed:', err instanceof Error ? err.message : String(err));
    }
  }
  appendProvenance?.('daily_science_applied', { taskId: task.id, experiment: rec.experimentId, ok, reportPath });
}

/** Failed kernels never reach the applier; give each one a visible failure report exactly once. */
export function reconcileFailedScienceTasks(): number {
  let n = 0;
  for (const t of readRemoteQueue().tasks) {
    if (t.kind !== 'science_experiment' || t.status !== 'failed') continue;
    applyScienceExperiment({ ...t, result: { ok: false, error: t.result?.error ?? 'remote job failed' } });
    n += 1;
  }
  return n;
}

export interface LogisticsDailyResult {
  queued: boolean;
  reason?: string;
  taskId?: string;
  platform?: string;
  rows?: number;
  sampleSha256?: string;
  failuresReported?: number;
}

export async function runLogisticsDaily(
  opts: { maxRows?: number } = {},
  deps: RemoteComputeDeps = {},
): Promise<LogisticsDailyResult> {
  const failuresReported = reconcileFailedScienceTasks();
  const base = { failuresReported };
  if (!remoteComputeEnabled()) return { queued: false, reason: 'no remote compute platform configured', ...base };

  const today = localDateStamp();
  const tasks = readRemoteQueue().tasks.filter((t) => t.kind === 'science_experiment');
  if (tasks.some((t) => !t.payload?.batch && (t.status === 'queued' || t.status === 'running'))) {
    return { queued: false, reason: 'a science experiment is already queued/running', ...base };
  }
  const logisticsToday = tasks.filter((t) => t.payload?.experiment === LOGISTICS_EXPERIMENT_ID && localDateStamp(new Date(t.createdAt)) === today);
  if (logisticsToday.some((t) => t.status === 'completed')) {
    return { queued: false, reason: `already ran today (${today})`, ...base };
  }
  if (logisticsToday.filter((t) => t.status === 'failed').length >= 2) {
    return { queued: false, reason: `2 failed runs today (${today}); not retrying until tomorrow`, ...base };
  }

  const sample = readLogisticsSample(undefined, opts.maxRows ?? 10000);
  if ('error' in sample) return { queued: false, reason: sample.error, ...base };

  const dataset = {
    sourcePath: sample.sourcePath,
    fileSha256: sample.fileSha256,
    sampleSha256: sample.sampleSha256,
    totalRows: sample.totalRows,
    sampledRows: sample.sampledRows,
  };
  const res = await enqueueRemoteTask(
    'science_experiment',
    { script: buildLogisticsScript(sample), requirements: LOGISTICS_REQUIREMENTS, experiment: LOGISTICS_EXPERIMENT_ID, dataset },
    // The kernel script embeds the data rows (~1.5 MB); persist only a slim record in the queue.
    { hardware: { type: 'cpu' }, maxRuntimeMs: 45 * 60 * 1000, persistPayload: { experiment: LOGISTICS_EXPERIMENT_ID, dataset, scriptOmitted: true } },
    deps,
  );
  if (!res.queued || !res.task) return { queued: false, reason: `refused: ${res.reason ?? 'unknown'}`, ...base };
  return {
    queued: true,
    taskId: res.task.id,
    platform: res.task.platform,
    rows: sample.sampledRows,
    sampleSha256: sample.sampleSha256,
    ...base,
  };
}

export interface OncologyGateDailyResult {
  status: string;
  unmet: number;
  met: number;
  reportPath: string | null;
}

export function runOncologyGateDaily(): OncologyGateDailyResult {
  const ev = evaluateOncologyGate(loadOncologyGate(oncologyGatePath()));
  const date = localDateStamp();
  const reportPath = writeReport(
    `${ONCOLOGY_EXPERIMENT_ID}-gate-${date}.md`,
    `latest-${ONCOLOGY_EXPERIMENT_ID}-gate.md`,
    renderOncologyGateReport(ev, date),
  );
  // The gate readout also lands in the Oncology Ecosystem tree (it is not sent to Lens).
  mirrorReadout(`${ONCOLOGY_EXPERIMENT_ID} gate ${date}`, renderOncologyGateReport(ev, date), { source: 'daily-science' });
  const doc = readDailyScience();
  doc.oncology = doc.oncology.filter((o) => o.date !== date);
  doc.oncology.push({ date, status: ev.status, unmet: ev.unmet.length, reportPath });
  writeDailyScience(doc);
  return { status: ev.status, unmet: ev.unmet.length, met: ev.met.length, reportPath };
}

// ---------------------------------------------------------------------------
// Research window: bounded run of the three WDBC method experiments (A/B/C rotate,
// a new seed each cycle, one Kaggle kernel at a time), then a pooled report.
// Pooling is across independent seeds: it shows between-seed stability, nothing more.
// ---------------------------------------------------------------------------
export interface ResearchWindow {
  id: string;
  startedAt: number;
  endsAt: number;
  cycle: number;
  reps: number;
  taskIds: string[];
  done: boolean;
  doneReason?: string;
  reportPath?: string | null;
}

/** How long past endsAt the window waits for an in-flight kernel before finalizing anyway. */
export const WINDOW_GRACE_MS = 45 * 60 * 1000;

export function researchWindowPath(): string {
  return process.env.RESEARCH_WINDOW_FILE || `${process.cwd()}/data/research-window.json`;
}
export function readResearchWindow(): ResearchWindow | null {
  const w = readJsonFile<ResearchWindow | null>(researchWindowPath(), null);
  return w && typeof w.id === 'string' && Array.isArray(w.taskIds) ? w : null;
}
function writeResearchWindow(w: ResearchWindow): void {
  try { writeJsonFile(researchWindowPath(), w); } catch (err) {
    console.warn('[research-window] persist failed:', err instanceof Error ? err.message : String(err));
  }
}

export function startResearchWindow(durationMs = 2 * 60 * 60 * 1000, reps = 300, now = Date.now()): { started: boolean; reason?: string; window?: ResearchWindow } {
  const cur = readResearchWindow();
  if (cur && !cur.done && now < cur.endsAt) return { started: false, reason: `window ${cur.id} already active until ${new Date(cur.endsAt).toISOString()}`, window: cur };
  const w: ResearchWindow = { id: `win_${now}`, startedAt: now, endsAt: now + Math.max(10 * 60_000, durationMs), cycle: 0, reps, taskIds: [], done: false };
  writeResearchWindow(w);
  return { started: true, window: w };
}

function mean(a: number[]): number { return a.reduce((x, y) => x + y, 0) / a.length; }
function sd(a: number[]): number { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); }

/** Pool the window's successful runs per experiment: across-seed mean/sd/min/max for each reported number. */
export function renderWindowReport(w: ResearchWindow, runs: LogisticsRunRecord[], failedTasks: number): string {
  const L: string[] = [`# Oncology method-experiment window ${w.id}`, ''];
  L.push(`Window ${new Date(w.startedAt).toISOString()} to ${new Date(Math.min(Date.now(), w.endsAt)).toISOString()}; ${w.taskIds.length} kernels submitted, ${runs.length} succeeded, ${failedTasks} failed. End reason: ${w.doneReason ?? 'window elapsed'}.`);
  L.push('', 'Scope: UCI WDBC (569 cases, bundled with scikit-learn), method validation only, evidence tier E4, internal. Each kernel used a different seed; the spread below is between-seed variability of the same procedure on the same 569 cases, not an estimate of performance on any other population.', '');
  for (const m of ONCOLOGY_METHODS) {
    const rs = runs.filter((r) => r.experimentId === m.id);
    L.push(`## ${m.id} — ${m.title}`, '');
    if (!rs.length) { L.push('No successful runs in this window.', ''); continue; }
    // Union of keys: runs from different script versions still pool every quantity they share.
    const keys = [...new Set(rs.flatMap((r) => Object.keys(oncSummary(r)?.numbers ?? {})))];
    L.push(`Seeds: ${rs.length}`, '', '| quantity | mean | sd | min | max |', '|---|---|---|---|---|');
    for (const k of keys) {
      const vals = rs.map((r) => oncSummary(r)?.numbers?.[k]).filter((v): v is number => typeof v === 'number');
      if (!vals.length) continue;
      L.push(`| ${k} | ${mean(vals).toFixed(4)} | ${sd(vals).toFixed(4)} | ${Math.min(...vals).toFixed(4)} | ${Math.max(...vals).toFixed(4)} |`);
    }
    L.push('');
  }
  return L.join('\n');
}

function finalizeWindow(w: ResearchWindow, reason: string): ResearchWindow {
  const doc = readDailyScience();
  const ids = new Set(w.taskIds);
  const runs = doc.runs.filter((r) => ids.has(r.taskId) && r.ok);
  const failed = doc.runs.filter((r) => ids.has(r.taskId) && !r.ok).length;
  w.done = true;
  w.doneReason = reason;
  const md = renderWindowReport(w, runs, failed);
  w.reportPath = writeReport(`OV365-ONC-window-${localDateStamp(new Date(w.startedAt))}-${w.id.slice(-6)}.md`, 'latest-OV365-ONC-window.md', md);
  mirrorReadout(`OV365-ONC window ${w.id}`, md, { source: 'daily-science' });
  writeResearchWindow(w);
  return w;
}

export interface WindowTickResult { state: 'idle' | 'waiting' | 'submitted' | 'finished'; detail?: string; taskId?: string; experiment?: string; cycle?: number; reportPath?: string | null; }

export async function runResearchWindowTick(deps: RemoteComputeDeps = {}, now = Date.now()): Promise<WindowTickResult> {
  const w = readResearchWindow();
  if (!w || w.done) return { state: 'idle' };
  reconcileFailedScienceTasks();
  const queue = readRemoteQueue().tasks;
  const mine = queue.filter((t) => w.taskIds.includes(t.id));
  const lastThree = w.taskIds.slice(-3).map((id) => queue.find((t) => t.id === id)?.status);
  if (lastThree.length === 3 && lastThree.every((s) => s === 'failed')) {
    const f = finalizeWindow(w, 'aborted: 3 consecutive kernel failures');
    return { state: 'finished', detail: f.doneReason, reportPath: f.reportPath };
  }
  // Cohort batch kernels use their own slugs and run in parallel; only the shared kernel blocks.
  const active = queue.some((t) => t.kind === 'science_experiment' && !t.payload?.batch && (t.status === 'queued' || t.status === 'running'));
  if (now >= w.endsAt) {
    if (active && now < w.endsAt + WINDOW_GRACE_MS) return { state: 'waiting', detail: 'window elapsed; waiting for the in-flight kernel to finish' };
    if (active) {
      const stuck = mine.filter((t) => t.status === 'queued' || t.status === 'running').map((t) => t.id);
      const f = finalizeWindow(w, `forced: window elapsed + ${WINDOW_GRACE_MS / 60_000} min grace; still in flight: ${stuck.join(', ') || 'a non-window science kernel'}`);
      return { state: 'finished', detail: f.doneReason, reportPath: f.reportPath };
    }
    const f = finalizeWindow(w, 'window elapsed');
    return { state: 'finished', detail: `${mine.length} kernels`, reportPath: f.reportPath };
  }
  if (active) return { state: 'waiting', detail: 'a science kernel is in flight' };
  if (!remoteComputeEnabled()) return { state: 'waiting', detail: 'no remote compute platform configured' };

  const method = ONCOLOGY_METHODS[w.cycle % ONCOLOGY_METHODS.length]!;
  const seed = 1 + w.cycle;
  const res = await enqueueRemoteTask(
    'science_experiment',
    { script: buildOncologyScript(method, seed, w.reps), requirements: ONCOLOGY_METHOD_REQUIREMENTS, experiment: method.id },
    { hardware: { type: 'cpu' }, maxRuntimeMs: 30 * 60 * 1000, persistPayload: { experiment: method.id, seed, reps: w.reps, window: w.id, scriptOmitted: true } },
    deps,
  );
  if (!res.queued || !res.task) return { state: 'waiting', detail: `enqueue refused: ${res.reason ?? 'unknown'}` };
  w.taskIds.push(res.task.id);
  w.cycle += 1;
  writeResearchWindow(w);
  return { state: 'submitted', taskId: res.task.id, experiment: method.id, cycle: w.cycle };
}

// ---------------------------------------------------------------------------
// Cohort batch: every COH-* experiment at once, each on its own kernel with its dataset
// attached. An experiment that already has a queued/running kernel is skipped, not doubled.
// ---------------------------------------------------------------------------
export interface CohortSubmit { experiment: string; queued: boolean; taskId?: string; reason?: string; hardware: string }

export async function runCohortBatch(
  opts: { only?: string[]; seed?: number } = {},
  deps: RemoteComputeDeps = {},
): Promise<{ submitted: CohortSubmit[]; failuresReported: number }> {
  const failuresReported = reconcileFailedScienceTasks();
  if (!remoteComputeEnabled()) {
    return { submitted: COHORT_EXPERIMENTS.map((e) => ({ experiment: e.id, queued: false, reason: 'no remote compute platform configured', hardware: e.hardware })), failuresReported };
  }
  const seed = opts.seed ?? Math.floor(Date.now() / 86_400_000) % 100_000; // one seed per day, recorded
  const queue = readRemoteQueue().tasks;
  const out: CohortSubmit[] = [];
  for (const e of COHORT_EXPERIMENTS as CohortExperiment[]) {
    if (opts.only && !opts.only.includes(e.id)) continue;
    if (queue.some((t) => t.payload?.experiment === e.id && (t.status === 'queued' || t.status === 'running'))) {
      out.push({ experiment: e.id, queued: false, reason: 'already queued/running', hardware: e.hardware });
      continue;
    }
    const slug = cohortKernelSlug(e);
    const res = await enqueueRemoteTask(
      'science_experiment',
      { script: buildCohortScript(e, seed), experiment: e.id },
      {
        hardware: { type: e.hardware },
        maxRuntimeMs: e.maxRuntimeMs,
        kernelSlug: slug,
        datasetSources: [e.dataset],
        persistPayload: { experiment: e.id, batch: true, dataset: e.dataset, seed, kernelSlug: slug, scriptOmitted: true },
      },
      deps,
    );
    out.push({ experiment: e.id, queued: !!res.queued, taskId: res.task?.id, reason: res.queued ? undefined : res.reason, hardware: e.hardware });
  }
  return { submitted: out, failuresReported };
}
