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
// Mixing-model registry (Qwen 3.5 4B audio-mixing fine-tune on Kaggle GPU)
// ---------------------------------------------------------------------------
export interface MixingModelRecord {
  jobId: string; at: number; platform: string;
  finalLoss: number | null; jsonValidity: number | null; steps: number;
  trainExamples: number; hfRepo: string | null; adapterPath: string | null;
  runtimeSec: number | null; peakVramGb: number | null;
}
export interface MixingModelRegistryDoc { version: 1; models: MixingModelRecord[]; }

export function mixingModelRegistryPath(): string {
  return process.env.MIXING_MODEL_REGISTRY_FILE || `${process.cwd()}/data/mixing-models.json`;
}
export function readMixingModelRegistry(): MixingModelRegistryDoc {
  const doc = readJsonFile<MixingModelRegistryDoc>(mixingModelRegistryPath(), { version: 1, models: [] });
  if (!doc || doc.version !== 1 || !Array.isArray(doc.models)) return { version: 1, models: [] };
  return doc;
}
export function writeMixingModelRegistry(doc: MixingModelRegistryDoc): void {
  try { writeJsonFile(mixingModelRegistryPath(), doc); }
  catch (err) { console.warn('[remote-compute] mixing-model registry persist failed:', err instanceof Error ? err.message : String(err)); }
}

export function enqueueMixingModelTraining(
  opts?: RemoteJobOptions,
  deps?: RemoteComputeDeps,
): Promise<EnqueueResult> {
  return enqueueRemoteTask('train_mixing_model', {}, { ...opts, hardware: opts?.hardware ?? { type: 'gpu' }, maxRuntimeMs: opts?.maxRuntimeMs ?? 4 * 60 * 60 * 1000 }, deps);
}

// ---------------------------------------------------------------------------
// Oncology concordance model registry (METABRIC/GBSG2 survival, C-index)
// ---------------------------------------------------------------------------
export interface OncologyConcordanceRecord {
  jobId: string; at: number; platform: string;
  source: string | null; nTrain: number; nTest: number;
  coxCindex: number | null; rsfCindex: number | null; xgbCindex: number | null;
  bestModel: string | null; bestCindex: number | null; brier: number | null;
  topFeatures: Array<{ name: string; importance: number }>;
  runtimeSec: number | null;
}
export interface OncologyConcordanceRegistryDoc { version: 1; models: OncologyConcordanceRecord[]; }

export function oncologyConcordanceRegistryPath(): string {
  return process.env.ONCOLOGY_CONCORDANCE_REGISTRY_FILE || `${process.cwd()}/data/oncology-concordance-models.json`;
}
export function readOncologyConcordanceRegistry(): OncologyConcordanceRegistryDoc {
  const doc = readJsonFile<OncologyConcordanceRegistryDoc>(oncologyConcordanceRegistryPath(), { version: 1, models: [] });
  if (!doc || doc.version !== 1 || !Array.isArray(doc.models)) return { version: 1, models: [] };
  return doc;
}
export function writeOncologyConcordanceRegistry(doc: OncologyConcordanceRegistryDoc): void {
  try { writeJsonFile(oncologyConcordanceRegistryPath(), doc); }
  catch (err) { console.warn('[remote-compute] oncology-concordance registry persist failed:', err instanceof Error ? err.message : String(err)); }
}

export function enqueueOncologyConcordanceTraining(
  opts?: RemoteJobOptions,
  deps?: RemoteComputeDeps,
): Promise<EnqueueResult> {
  return enqueueRemoteTask('train_oncology_concordance', {}, { ...opts, hardware: opts?.hardware ?? { type: 'cpu' }, maxRuntimeMs: opts?.maxRuntimeMs ?? 60 * 60 * 1000 }, deps);
}

// ---------------------------------------------------------------------------
// SurvBoard concordance model registry (TCGA standardized features, multi-cancer)
// ---------------------------------------------------------------------------
export interface SurvboardConcordanceRecord {
  jobId: string; at: number; platform: string;
  nCancers: number; pooledCindex: number | null;
  results: Record<string, { best_model: string | null; best_cindex: number | null; cox_cindex: number | null; rsf_cindex: number | null; xgb_cindex: number | null; n: number }>;
  runtimeSec: number | null;
}
export interface SurvboardConcordanceRegistryDoc { version: 1; models: SurvboardConcordanceRecord[]; }

export function survboardConcordanceRegistryPath(): string {
  return process.env.SURVBOARD_CONCORDANCE_REGISTRY_FILE || `${process.cwd()}/data/survboard-concordance-models.json`;
}
export function readSurvboardConcordanceRegistry(): SurvboardConcordanceRegistryDoc {
  const doc = readJsonFile<SurvboardConcordanceRegistryDoc>(survboardConcordanceRegistryPath(), { version: 1, models: [] });
  if (!doc || doc.version !== 1 || !Array.isArray(doc.models)) return { version: 1, models: [] };
  return doc;
}
export function writeSurvboardConcordanceRegistry(doc: SurvboardConcordanceRegistryDoc): void {
  try { writeJsonFile(survboardConcordanceRegistryPath(), doc); }
  catch (err) { console.warn('[remote-compute] survboard-concordance registry persist failed:', err instanceof Error ? err.message : String(err)); }
}

export function enqueueSurvboardConcordanceTraining(
  opts?: RemoteJobOptions,
  deps?: RemoteComputeDeps,
): Promise<EnqueueResult> {
  return enqueueRemoteTask('train_survboard_concordance', {}, { ...opts, hardware: opts?.hardware ?? { type: 'cpu' }, maxRuntimeMs: opts?.maxRuntimeMs ?? 60 * 60 * 1000 }, deps);
}

// ---------------------------------------------------------------------------
// Music therapy concordance registry (oncology supportive intervention)
// ---------------------------------------------------------------------------
export interface MusicTherapyConcordanceRecord {
  jobId: string; at: number; platform: string;
  nPatients: number; nTrials: number; bestModel: string | null; bestR2: number | null;
  rfR2: number | null; gbR2: number | null; topFeatures: Array<{ name: string; importance: number }>;
  runtimeSec: number | null;
}
export interface MusicTherapyConcordanceRegistryDoc { version: 1; models: MusicTherapyConcordanceRecord[]; }

export function musicTherapyConcordanceRegistryPath(): string {
  return process.env.MUSIC_THERAPY_CONCORDANCE_REGISTRY_FILE || `${process.cwd()}/data/music-therapy-concordance-models.json`;
}
export function readMusicTherapyConcordanceRegistry(): MusicTherapyConcordanceRegistryDoc {
  const doc = readJsonFile<MusicTherapyConcordanceRegistryDoc>(musicTherapyConcordanceRegistryPath(), { version: 1, models: [] });
  if (!doc || doc.version !== 1 || !Array.isArray(doc.models)) return { version: 1, models: [] };
  return doc;
}
export function writeMusicTherapyConcordanceRegistry(doc: MusicTherapyConcordanceRegistryDoc): void {
  try { writeJsonFile(musicTherapyConcordanceRegistryPath(), doc); }
  catch (err) { console.warn('[remote-compute] music-therapy-concordance registry persist failed:', err instanceof Error ? err.message : String(err)); }
}

export function enqueueMusicTherapyConcordanceTraining(
  opts?: RemoteJobOptions,
  deps?: RemoteComputeDeps,
): Promise<EnqueueResult> {
  return enqueueRemoteTask('train_music_therapy_concordance', {}, { ...opts, hardware: opts?.hardware ?? { type: 'cpu' }, maxRuntimeMs: opts?.maxRuntimeMs ?? 60 * 60 * 1000 }, deps);
}

// ---------------------------------------------------------------------------
// Score calibration — normalize heterogeneous metrics to a common 0..1 scale
// before feeding the recursive learner, so high-variance metrics don't dominate.
// ---------------------------------------------------------------------------
export type ScoreSource = 'json_validity' | 'c_index' | 'r2' | 'loss' | 'external';

export function calibrateExternalScore(source: ScoreSource, raw: number): number {
  if (Number.isNaN(raw)) return 0;
  if (raw === Infinity) return 1;
  if (raw === -Infinity) return 0;
  switch (source) {
    case 'json_validity': // already 0..1
      return Math.max(0, Math.min(1, raw));
    case 'c_index': // typical range 0.5..0.85 -> map to 0..1
      return Math.max(0, Math.min(1, (raw - 0.5) / 0.35));
    case 'r2': // can be negative; clamp to 0..1
      return Math.max(0, Math.min(1, raw));
    case 'loss': // lower is better; assume 0..5 range
      return Math.max(0, Math.min(1, 1 - raw / 5));
    case 'external':
    default:
      return Math.max(0, Math.min(1, raw));
  }
}

// ---------------------------------------------------------------------------
// Experiment lineage — track which experiments led to which improvements
// ---------------------------------------------------------------------------
export interface ExperimentLineageNode {
  id: string;
  kind: string;
  parent: string | null;
  result: Record<string, unknown>;
  score: number;
  delta: number | null; // improvement over parent
  at: number;
}

export interface ExperimentLineageDoc { version: 1; nodes: ExperimentLineageNode[]; }

export function experimentLineagePath(): string {
  return process.env.EXPERIMENT_LINEAGE_FILE || `${process.cwd()}/data/experiment-lineage.json`;
}

export function readExperimentLineage(): ExperimentLineageDoc {
  const doc = readJsonFile<ExperimentLineageDoc>(experimentLineagePath(), { version: 1, nodes: [] });
  if (!doc || doc.version !== 1 || !Array.isArray(doc.nodes)) return { version: 1, nodes: [] };
  return doc;
}

export function writeExperimentLineage(doc: ExperimentLineageDoc): void {
  try { writeJsonFile(experimentLineagePath(), doc); }
  catch (err) { console.warn('[remote-compute] experiment lineage persist failed:', err instanceof Error ? err.message : String(err)); }
}

export function recordExperimentLineage(node: ExperimentLineageNode): void {
  const doc = readExperimentLineage();
  // compute delta from parent
  if (node.parent) {
    const parentNode = doc.nodes.find((n) => n.id === node.parent);
    if (parentNode) node.delta = Math.round((node.score - parentNode.score) * 1000) / 1000;
  }
  doc.nodes.push(node);
  if (doc.nodes.length > 500) doc.nodes = doc.nodes.slice(-500);
  writeExperimentLineage(doc);
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

  // train_mixing_model: Qwen 3.5 4B audio-mixing fine-tune on Kaggle GPU.
  // Records metrics to a durable registry and feeds a quality score to the learner.
  registerRemoteApplier('train_mixing_model', async (task) => {
    const data = task.result?.data;
    if (!data || data.ok === false) {
      deps.appendProvenance?.('remote_mixing_model_failed', { jobId: task.id, error: task.result?.error, platform: task.platform });
      return;
    }
    const doc = readMixingModelRegistry();
    doc.models.push({
      jobId: task.id,
      at: Date.now(),
      platform: task.platform,
      finalLoss: typeof data.final_loss === 'number' ? Number(data.final_loss) : null,
      jsonValidity: typeof data.json_validity === 'number' ? Number(data.json_validity) : null,
      steps: typeof data.steps === 'number' ? Number(data.steps) : 0,
      trainExamples: typeof data.train_examples === 'number' ? Number(data.train_examples) : 0,
      hfRepo: typeof data.hf_repo === 'string' ? data.hf_repo : null,
      adapterPath: typeof data.adapter_path === 'string' ? data.adapter_path : null,
      runtimeSec: typeof data.runtime_sec === 'number' ? Number(data.runtime_sec) : null,
      peakVramGb: typeof data.peak_vram_gb === 'number' ? Number(data.peak_vram_gb) : null,
    });
    if (doc.models.length > 200) doc.models = doc.models.slice(-200);
    writeMixingModelRegistry(doc);
    const rawScore = typeof data.json_validity === 'number' ? Number(data.json_validity) : (typeof data.final_loss === 'number' ? Math.max(0, 1 - Number(data.final_loss)) : undefined);
    const score = typeof rawScore === 'number' ? calibrateExternalScore('json_validity', rawScore) : undefined;
    if (typeof score === 'number' && !Number.isNaN(score) && deps.applyExternalScore) {
      await deps.applyExternalScore(score, task);
    }
    // record lineage
    recordExperimentLineage({ id: task.id, kind: 'train_mixing_model', parent: null, result: { finalLoss: data.final_loss, jsonValidity: data.json_validity, steps: data.steps }, score: score ?? 0, delta: null, at: Date.now() });
    deps.appendProvenance?.('remote_mixing_model_trained', {
      jobId: task.id,
      finalLoss: data.final_loss,
      jsonValidity: data.json_validity,
      steps: data.steps,
      hfRepo: data.hf_repo,
      platform: task.platform,
    });
  });

  // train_oncology_concordance: small survival model on METABRIC/GBSG2, C-index.
  registerRemoteApplier('train_oncology_concordance', async (task) => {
    const data = task.result?.data;
    if (!data || data.ok === false) {
      deps.appendProvenance?.('remote_oncology_concordance_failed', { jobId: task.id, error: task.result?.error, platform: task.platform });
      return;
    }
    const doc = readOncologyConcordanceRegistry();
    doc.models.push({
      jobId: task.id,
      at: Date.now(),
      platform: task.platform,
      source: typeof data.source === 'string' ? data.source : null,
      nTrain: typeof data.n === 'number' ? Number(data.n) : (typeof data.n_train === 'number' ? Number(data.n_train) : 0),
      nTest: typeof data.n_test === 'number' ? Number(data.n_test) : 0,
      coxCindex: typeof data.cox_cindex === 'number' ? Number(data.cox_cindex) : null,
      rsfCindex: typeof data.rsf_cindex === 'number' ? Number(data.rsf_cindex) : null,
      xgbCindex: typeof data.xgb_cindex === 'number' ? Number(data.xgb_cindex) : null,
      bestModel: typeof data.best_model === 'string' ? data.best_model : null,
      bestCindex: typeof data.best_cindex === 'number' ? Number(data.best_cindex) : null,
      brier: typeof data.brier_at_median === 'number' ? Number(data.brier_at_median) : null,
      topFeatures: Array.isArray(data.top_features) ? data.top_features : [],
      runtimeSec: typeof data.runtime_sec === 'number' ? Number(data.runtime_sec) : null,
    });
    if (doc.models.length > 200) doc.models = doc.models.slice(-200);
    writeOncologyConcordanceRegistry(doc);
    const rawScore = typeof data.best_cindex === 'number' ? Number(data.best_cindex) : undefined;
    const score = typeof rawScore === 'number' ? calibrateExternalScore('c_index', rawScore) : undefined;
    if (typeof score === 'number' && !Number.isNaN(score) && deps.applyExternalScore) {
      await deps.applyExternalScore(score, task);
    }
    recordExperimentLineage({ id: task.id, kind: 'train_oncology_concordance', parent: null, result: { bestModel: data.best_model, bestCindex: data.best_cindex, source: data.source }, score: score ?? 0, delta: null, at: Date.now() });
    deps.appendProvenance?.('remote_oncology_concordance_trained', {
      jobId: task.id, bestModel: data.best_model, bestCindex: data.best_cindex, source: data.source, platform: task.platform,
    });
  });

  // train_survboard_concordance: multi-cancer survival (TCGA standardized features).
  registerRemoteApplier('train_survboard_concordance', async (task) => {
    const data = task.result?.data;
    if (!data || data.ok === false) {
      deps.appendProvenance?.('remote_survboard_concordance_failed', { jobId: task.id, error: task.result?.error, platform: task.platform });
      return;
    }
    const doc = readSurvboardConcordanceRegistry();
    const cancers = (data.datasets && typeof data.datasets === 'object') ? data.datasets : (data.cancers && typeof data.cancers === 'object' ? data.cancers : {});
    const slim: Record<string, { best_model: string | null; best_cindex: number | null; cox_cindex: number | null; rsf_cindex: number | null; xgb_cindex: number | null; n: number }> = {};
    for (const [k, v] of Object.entries(cancers)) {
      const r = v as Record<string, unknown>;
      slim[k] = {
        best_model: typeof r.best_model === 'string' ? r.best_model : null,
        best_cindex: typeof r.best_cindex === 'number' ? Number(r.best_cindex) : null,
        cox_cindex: typeof r.cox_cindex === 'number' ? Number(r.cox_cindex) : null,
        rsf_cindex: typeof r.rsf_cindex === 'number' ? Number(r.rsf_cindex) : null,
        xgb_cindex: typeof r.xgb_cindex === 'number' ? Number(r.xgb_cindex) : null,
        n: typeof r.n === 'number' ? Number(r.n) : 0,
      };
    }
    doc.models.push({
      jobId: task.id,
      at: Date.now(),
      platform: task.platform,
      nCancers: typeof data.n_datasets === 'number' ? Number(data.n_datasets) : (typeof data.n_cancers === 'number' ? Number(data.n_cancers) : Object.keys(slim).length),
      pooledCindex: typeof data.pooled_cindex === 'number' ? Number(data.pooled_cindex) : null,
      results: slim,
      runtimeSec: typeof data.runtime_sec === 'number' ? Number(data.runtime_sec) : null,
    });
    if (doc.models.length > 200) doc.models = doc.models.slice(-200);
    writeSurvboardConcordanceRegistry(doc);
    const rawScore = typeof data.pooled_cindex === 'number' ? Number(data.pooled_cindex) : undefined;
    const score = typeof rawScore === 'number' ? calibrateExternalScore('c_index', rawScore) : undefined;
    if (typeof score === 'number' && !Number.isNaN(score) && deps.applyExternalScore) {
      await deps.applyExternalScore(score, task);
    }
    recordExperimentLineage({ id: task.id, kind: 'train_survboard_concordance', parent: null, result: { nCancers: data.n_cancers, pooledCindex: data.pooled_cindex }, score: score ?? 0, delta: null, at: Date.now() });
    deps.appendProvenance?.('remote_survboard_concordance_trained', {
      jobId: task.id, nCancers: data.n_cancers, pooledCindex: data.pooled_cindex, platform: task.platform,
    });
  });

  // train_music_therapy_concordance: music therapy stimulus optimization for oncology.
  registerRemoteApplier('train_music_therapy_concordance', async (task) => {
    const data = task.result?.data;
    if (!data || data.ok === false) {
      deps.appendProvenance?.('remote_music_therapy_concordance_failed', { jobId: task.id, error: task.result?.error, platform: task.platform });
      return;
    }
    const doc = readMusicTherapyConcordanceRegistry();
    doc.models.push({
      jobId: task.id,
      at: Date.now(),
      platform: task.platform,
      nPatients: typeof data.n_patients === 'number' ? Number(data.n_patients) : 0,
      nTrials: typeof data.n_trials === 'number' ? Number(data.n_trials) : 0,
      bestModel: typeof data.best_model === 'string' ? data.best_model : null,
      bestR2: typeof data.best_r2 === 'number' ? Number(data.best_r2) : null,
      rfR2: typeof data.rf_r2 === 'number' ? Number(data.rf_r2) : null,
      gbR2: typeof data.gb_r2 === 'number' ? Number(data.gb_r2) : null,
      topFeatures: Array.isArray(data.top_features) ? data.top_features : [],
      runtimeSec: typeof data.runtime_sec === 'number' ? Number(data.runtime_sec) : null,
    });
    if (doc.models.length > 200) doc.models = doc.models.slice(-200);
    writeMusicTherapyConcordanceRegistry(doc);
    const rawScore = typeof data.best_r2 === 'number' ? Number(data.best_r2) : undefined;
    const score = typeof rawScore === 'number' ? calibrateExternalScore('r2', rawScore) : undefined;
    if (typeof score === 'number' && !Number.isNaN(score) && deps.applyExternalScore) {
      await deps.applyExternalScore(score, task);
    }
    recordExperimentLineage({ id: task.id, kind: 'train_music_therapy_concordance', parent: null, result: { bestModel: data.best_model, bestR2: data.best_r2, nPatients: data.n_patients }, score: score ?? 0, delta: null, at: Date.now() });
    deps.appendProvenance?.('remote_music_therapy_concordance_trained', {
      jobId: task.id, bestModel: data.best_model, bestR2: data.best_r2, nPatients: data.n_patients, platform: task.platform,
    });
  });
}
