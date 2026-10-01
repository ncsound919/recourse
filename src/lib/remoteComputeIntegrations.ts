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
import { readJsonFile, writeJsonFile } from './durableJson.js';
import { executeTestSuite } from './executionSandbox.js';
import { recordSleepArtifacts } from './sleepCompute.js';
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

export function enqueueForgePrecompute(
  specs: Array<{ name: string; domain: string; prompt: string; refSuite: string }>,
  opts?: RemoteJobOptions & { count?: number },
  deps?: RemoteComputeDeps,
): Promise<EnqueueResult> {
  return enqueueRemoteTask('forge_precompute', { specs, count: opts?.count ?? 2 }, opts, deps);
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
  return enqueueRemoteTask('repair_diagnose', { script, issue }, opts, deps);
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
}
