/**
 * remoteComputeIntegrations.ts — binds remote-compute results back into the
 * internal loops that asked for them:
 *
 *   forge_precompute      -> sleep-time artifacts (re-verified LOCALLY) that the
 *                            capability forge then consumes with zero model calls.
 *   train_small_model     -> a durable small-model registry (metrics only; the
 *                            checkpoint stays on the remote box).
 *   learner_stress_eval   -> the recursive learner's `externalScore`.
 *   repair_diagnose       -> a repair proposal handed to the self-repair loop.
 *
 * Honesty: a remote worker's output is NEVER trusted as verified. Forge
 * candidates are re-run through the local sandbox test suite before they can be
 * served from the sleep store, and the applier records real pass/fail.
 */
import { createHash } from 'node:crypto';
import { readJsonFile, writeJsonFile } from './durableJson.js';
import { executeTestSuite } from './executionSandbox.js';
import { recordSleepArtifacts } from './sleepCompute.js';
import { applyScienceExperiment } from './dailyScience.js';
import { recordExternalFinding } from './scienceConductor.js';
import {
  enqueueRemoteTask,
  registerRemoteApplier,
  type EnqueueResult,
  type RemoteComputeDeps,
  type RemoteJobOptions,
  type RemoteTask,
} from './remoteCompute.js';

export interface RemoteIntegrationDeps {
  /** Provenance sink (server supplies appendProvenanceEvent). */
  appendProvenance?: (type: string, data: Record<string, unknown>) => void;
  /** Live learner hook: score feeds `learner.runEpisode(score)`. */
  applyExternalScore?: (score: number, task: RemoteTask) => void | Promise<void>;
  /** Live self-repair hook: persists the remote diagnosis as a repair proposal. */
  applyRepairDiagnosis?: (task: RemoteTask) => void | Promise<void>;
  /** Dream hook: hand remote-generated candidates to the dream engine, which
   *  re-verifies each in the LOCAL sandbox before it becomes a thought. */
  ingestDreamCandidates?: (
    candidates: Array<{ domain?: string; premise: string; hypothesis: string; sourceCode: string; testSuiteCode: string }>,
    task: RemoteTask,
  ) => Promise<{ ingested: number; verified: number; duplicates: number; rejected: number }>;
}

// ---------------------------------------------------------------------------
// Small-model registry (durable, metrics only)
// ---------------------------------------------------------------------------

export interface SmallModelRecord {
  jobId: string;
  at: number;
  platform: string;
  task: 'regression' | 'classification';
  model: string;
  metricName: string;
  metric: number;
  trainRows: number;
  testRows: number;
}

export interface SmallModelRegistryDoc {
  version: 1;
  models: SmallModelRecord[];
}

export function smallModelRegistryPath(): string {
  return process.env.SMALL_MODEL_REGISTRY_FILE || `${process.cwd()}/data/small-models.json`;
}

export function readSmallModelRegistry(): SmallModelRegistryDoc {
  const doc = readJsonFile<SmallModelRegistryDoc>(smallModelRegistryPath(), { version: 1, models: [] });
  if (!doc || doc.version !== 1 || !Array.isArray(doc.models)) return { version: 1, models: [] };
  return doc;
}

export function writeSmallModelRegistry(doc: SmallModelRegistryDoc): void {
  try {
    writeJsonFile(smallModelRegistryPath(), doc);
  } catch (err) {
    console.warn('[remote-compute] small-model registry persist failed:', err instanceof Error ? err.message : String(err));
  }
}

// ---------------------------------------------------------------------------
// Enqueue helpers (used by routes and loops)
// ---------------------------------------------------------------------------

export function enqueueSmallModelTraining(
  payload: { rows: number[][]; target: number[]; task?: 'regression' | 'classification'; model?: 'linear' | 'ridge' | 'mlp'; testFraction?: number },
  opts?: RemoteJobOptions,
  deps?: RemoteComputeDeps,
): Promise<EnqueueResult> {
  return enqueueRemoteTask('train_small_model', payload as unknown as Record<string, unknown>, opts, deps);
}

// ---------------------------------------------------------------------------
// Survival-model registry (durable, metrics only)
// ---------------------------------------------------------------------------

export interface SurvivalModelRecord {
  jobId: string; at: number; platform: string;
  cIndex: number; n: number; nEvents: number;
}
export interface SurvivalModelRegistryDoc { version: 1; models: SurvivalModelRecord[]; }

export function survivalRegistryPath(): string {
  return process.env.SURVIVAL_MODEL_REGISTRY_FILE || `${process.cwd()}/data/survival-models.json`;
}
export function readSurvivalRegistry(): SurvivalModelRegistryDoc {
  const doc = readJsonFile<SurvivalModelRegistryDoc>(survivalRegistryPath(), { version: 1, models: [] });
  if (!doc || doc.version !== 1 || !Array.isArray(doc.models)) return { version: 1, models: [] };
  return doc;
}
export function writeSurvivalRegistry(doc: SurvivalModelRegistryDoc): void {
  try { writeJsonFile(survivalRegistryPath(), doc); }
  catch (err) { console.warn('[remote-compute] survival registry persist failed:', err instanceof Error ? err.message : String(err)); }
}

export function enqueueSurvivalTraining(
  payload: { features: number[][]; durations: number[]; events: number[] },
  opts?: RemoteJobOptions,
  deps?: RemoteComputeDeps,
): Promise<EnqueueResult> {
  return enqueueRemoteTask('train_survival', payload as unknown as Record<string, unknown>, opts, deps);
}

// ---------------------------------------------------------------------------
// Meta-analysis registry (durable, estimates only)
// ---------------------------------------------------------------------------

export interface MetaAnalysisRecord {
  jobId: string; at: number; platform: string;
  k: number; pooled: number; ciLo: number; ciHi: number; I2: number; tau2: number;
  bootLo?: number; bootHi?: number;
}
export interface MetaAnalysisRegistryDoc { version: 1; analyses: MetaAnalysisRecord[]; }

export function metaAnalysisRegistryPath(): string {
  return process.env.META_ANALYSIS_REGISTRY_FILE || `${process.cwd()}/data/meta-analyses.json`;
}
export function readMetaAnalysisRegistry(): MetaAnalysisRegistryDoc {
  const doc = readJsonFile<MetaAnalysisRegistryDoc>(metaAnalysisRegistryPath(), { version: 1, analyses: [] });
  if (!doc || doc.version !== 1 || !Array.isArray(doc.analyses)) return { version: 1, analyses: [] };
  return doc;
}
export function writeMetaAnalysisRegistry(doc: MetaAnalysisRegistryDoc): void {
  try { writeJsonFile(metaAnalysisRegistryPath(), doc); }
  catch (err) { console.warn('[remote-compute] meta-analysis registry persist failed:', err instanceof Error ? err.message : String(err)); }
}

export function enqueueMetaAnalysis(
  payload: { items: Array<Record<string, unknown>>; seed?: number; boot?: number },
  opts?: RemoteJobOptions,
  deps?: RemoteComputeDeps,
): Promise<EnqueueResult> {
  return enqueueRemoteTask('meta_analysis', payload as unknown as Record<string, unknown>, opts, deps);
}

export function enqueueForgePrecompute(
  specs: Array<{ name: string; domain: string; prompt: string; refSuite: string }>,
  opts?: RemoteJobOptions & { count?: number },
  deps?: RemoteComputeDeps,
): Promise<EnqueueResult> {
  return enqueueRemoteTask('forge_precompute', { specs, count: opts?.count ?? 2 }, opts, deps);
}

export function enqueueDreamCandidates(
  payload: { domains: string[]; perDomain?: number; avoid?: string[]; context?: string[] },
  opts?: RemoteJobOptions,
  deps?: RemoteComputeDeps,
): Promise<EnqueueResult> {
  return enqueueRemoteTask('dream_candidates', payload as unknown as Record<string, unknown>, opts, deps);
}

export function enqueueLearnerStressEval(
  script: string,
  requirements?: string[],
  opts?: RemoteJobOptions,
  deps?: RemoteComputeDeps,
): Promise<EnqueueResult> {
  return enqueueRemoteTask('learner_stress_eval', { script, requirements }, opts, deps);
}

export function enqueueRepairDiagnose(
  script: string,
  issue: { id: string; name: string; detail: string },
  opts?: RemoteJobOptions,
  deps?: RemoteComputeDeps,
): Promise<EnqueueResult> {
  // The script embeds the measured series; store only its hash (used to skip re-running an
  // identical diagnosis) instead of the full text on every queued task.
  return enqueueRemoteTask('repair_diagnose', { script, issue }, { ...opts, persistPayload: { issue, scriptSha256: repairScriptHash(script), scriptOmitted: true } }, deps);
}

export function repairScriptHash(script: string): string {
  return createHash('sha256').update(script).digest('hex');
}

// ---------------------------------------------------------------------------
// Appliers
// ---------------------------------------------------------------------------

/** Register the four appliers. Idempotent (last registration wins). */
export function registerRemoteComputeAppliers(deps: RemoteIntegrationDeps = {}): void {
  // forge_precompute: candidates are re-verified LOCALLY before being stored.
  registerRemoteApplier('forge_precompute', (task) => {
    const specs = (task.payload?.specs as Array<{ name: string; domain: string; prompt: string; refSuite: string }>) ?? [];
    const remoteSpecs = (task.result?.data?.specs as Array<{ name: string; candidates: string[] }>) ?? [];
    if (!remoteSpecs.length) return;
    const byName = new Map(specs.map((s) => [s.name, s]));
    const entries: Array<{ name: string; domain: string; prompt: string; refSuite: string; source: string }> = [];
    for (const rs of remoteSpecs) {
      const spec = byName.get(rs.name);
      if (!spec) continue;
      const candidate = (rs.candidates || []).find((c) => typeof c === 'string' && c.trim().length > 10);
      if (!candidate) continue;
      entries.push({ name: spec.name, domain: spec.domain, prompt: spec.prompt, refSuite: spec.refSuite, source: candidate });
    }
    if (!entries.length) return;
    const { recorded, ready } = recordSleepArtifacts(entries, (source, suite) => executeTestSuite(source, suite));
    deps.appendProvenance?.('remote_forge_precompute_applied', {
      jobId: task.id,
      recorded,
      verifiedLocally: ready,
      platform: task.platform,
    });
  });

  // dream_candidates: remote batch of hypothesis+code+tests. Shape-checked and
  // size-capped here, then re-verified locally by the dream engine; a candidate
  // the sandbox rejects never becomes a thought.
  registerRemoteApplier('dream_candidates', async (task) => {
    const raw = task.result?.data?.thoughts;
    if (!Array.isArray(raw) || !deps.ingestDreamCandidates) return;
    const MAX = 24;
    const candidates = raw
      .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
      .map((t) => ({
        domain: typeof t.domain === 'string' ? t.domain : undefined,
        premise: String(t.premise ?? '').slice(0, 300),
        hypothesis: String(t.hypothesis ?? '').slice(0, 300),
        sourceCode: typeof t.sourceCode === 'string' ? t.sourceCode.slice(0, 20_000) : '',
        testSuiteCode: typeof t.testSuiteCode === 'string' ? t.testSuiteCode.slice(0, 10_000) : '',
      }))
      .filter((c) => c.sourceCode.trim().length >= 20 && c.testSuiteCode.trim().length >= 4 && c.hypothesis.trim().length > 0)
      .slice(0, MAX);
    if (!candidates.length) return;
    const r = await deps.ingestDreamCandidates(candidates, task);
    deps.appendProvenance?.('remote_dream_candidates_applied', { jobId: task.id, received: raw.length, ...r, platform: task.platform });
  });

  // train_small_model: metrics-only record.
  registerRemoteApplier('train_small_model', (task) => {
    const data = task.result?.data;
    if (!data || data.ok === false || typeof data.metric !== 'number') return;
    const doc = readSmallModelRegistry();
    doc.models.push({
      jobId: task.id,
      at: Date.now(),
      platform: task.platform,
      task: (data.task as 'regression' | 'classification') ?? 'regression',
      model: String(data.model ?? 'linear'),
      metricName: String(data.metricName ?? 'metric'),
      metric: Number(data.metric),
      trainRows: Number(data.trainRows ?? 0),
      testRows: Number(data.testRows ?? 0),
    });
    if (doc.models.length > 200) doc.models = doc.models.slice(-200);
    writeSmallModelRegistry(doc);
    deps.appendProvenance?.('remote_small_model_trained', {
      jobId: task.id,
      metric: data.metric,
      metricName: data.metricName,
      platform: task.platform,
    });
  });

  // train_survival: Cox C-index record.
  registerRemoteApplier('train_survival', (task) => {
    const data = task.result?.data;
    if (!data || data.ok === false || typeof data.cIndex !== 'number') return;
    const doc = readSurvivalRegistry();
    doc.models.push({
      jobId: task.id, at: Date.now(), platform: task.platform,
      cIndex: Number(data.cIndex), n: Number(data.n ?? 0), nEvents: Number(data.nEvents ?? 0),
    });
    if (doc.models.length > 200) doc.models = doc.models.slice(-200);
    writeSurvivalRegistry(doc);
    deps.appendProvenance?.('remote_survival_trained', {
      jobId: task.id, cIndex: data.cIndex, n: data.n, platform: task.platform,
    });
  });

  // meta_analysis: pooled estimate record.
  registerRemoteApplier('meta_analysis', (task) => {
    const data = task.result?.data;
    if (!data || data.ok === false || typeof data.pooled !== 'number') return;
    const doc = readMetaAnalysisRegistry();
    doc.analyses.push({
      jobId: task.id, at: Date.now(), platform: task.platform,
      k: Number(data.k ?? 0), pooled: Number(data.pooled),
      ciLo: Number(data.ci_lo ?? 0), ciHi: Number(data.ci_hi ?? 0),
      I2: Number(data.I2 ?? 0), tau2: Number(data.tau2 ?? 0),
      bootLo: typeof data.boot_lo === 'number' ? data.boot_lo : undefined,
      bootHi: typeof data.boot_hi === 'number' ? data.boot_hi : undefined,
    });
    if (doc.analyses.length > 200) doc.analyses = doc.analyses.slice(-200);
    writeMetaAnalysisRegistry(doc);
    deps.appendProvenance?.('remote_meta_analysis_applied', {
      jobId: task.id, k: data.k, pooled: data.pooled, I2: data.I2, platform: task.platform,
    });
  });

  // learner_stress_eval: feed the scalar into the live learner.
  registerRemoteApplier('learner_stress_eval', async (task) => {
    const data = task.result?.data;
    const score = typeof data?.externalScore === 'number' ? data.externalScore : typeof data?.value === 'number' ? data.value : undefined;
    if (typeof score !== 'number' || Number.isNaN(score)) return;
    if (deps.applyExternalScore) await deps.applyExternalScore(score, task);
    deps.appendProvenance?.('remote_learner_score_applied', { jobId: task.id, externalScore: score, platform: task.platform });
  });

  // repair_diagnose: hand the structured diagnosis to the self-repair loop.
  registerRemoteApplier('repair_diagnose', async (task) => {
    if (!task.result?.data) return;
    if (deps.applyRepairDiagnosis) await deps.applyRepairDiagnosis(task);
    deps.appendProvenance?.('remote_repair_diagnosis_applied', { jobId: task.id, platform: task.platform });
  });

  // science_experiment: dated markdown report (Overlay-Global-Lens) + durable run record.
  registerRemoteApplier('science_experiment', (task) => {
    applyScienceExperiment(task, deps.appendProvenance, recordExternalFinding);
  });
}
