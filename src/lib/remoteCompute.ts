/**
 * remoteCompute.ts — durable bridge between Recourse's internal loops and the
 * free-tier compute platforms (Kaggle / Hugging Face / E2B), for work that is
 * genuinely a better fit for a remote GPU/CPU box than the local process.
 *
 * Where remote compute is used (and why):
 *   - `train_small_model`  — real scikit-learn/PyTorch training on a dataset.
 *     Python/ML is exactly what Kaggle's free GPU is for; nothing about this
 *     needs the Node realm.
 *   - `forge_precompute`   — batch LLM candidate generation for the capability
 *     forge. The remote notebook generates candidates via an OpenAI-compatible
 *     endpoint; Recourse ALWAYS re-verifies them locally against the reference
 *     suite before promotion (remote workers never mark their own homework).
 *   - `learner_stress_eval`— a heavy numeric/statistical evaluation script whose
 *     scalar output becomes the learner's `externalScore`.
 *   - `repair_diagnose`    — a reproduction/diagnostic script for a stuck issue;
 *     its structured output becomes a repair proposal for the self-repair loop.
 *
 * Honesty contract:
 *   - `remoteComputeEnabled()` is false unless a REMOTE platform is configured
 *     (kaggle/huggingface/e2b). `local` never counts — it is not remote.
 *   - Enqueue never fabricates a task: if no platform is available, or the
 *     submit throws, it returns `{ queued:false, reason }` and the caller keeps
 *     its local behavior.
 *   - A task is only `completed` when the platform reports success AND its
 *     stdout carries a parseable `__RECOURSE_RESULT__` envelope. Anything else
 *     is `failed` with the real error.
 *   - Result routing is applier-based; unregistered kinds are stored, not
 *     silently applied.
 */
import { readJsonFile, writeJsonFile } from './durableJson.js';
import {
  createComputeClient,
  selectPlatform,
  getAvailablePlatforms,
  listPlatforms,
  type ComputeJob,
  type ComputeJobHandle,
  type ComputeNotebook,
  type ComputePlatformId,
  type UnifiedComputeClient,
} from './computePlatforms.js';

export type RemoteTaskKind =
  | 'train_small_model'
  | 'forge_precompute'
  | 'learner_stress_eval'
  | 'repair_diagnose';

export type RemoteTaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface RemoteTaskResult {
  ok: boolean;
  /** Parsed `__RECOURSE_RESULT__` envelope (when present). */
  data?: Record<string, unknown>;
  /** Raw stdout/stderr (bounded) for diagnostics. */
  stdout?: string;
  stderr?: string;
  error?: string;
  durationMs?: number;
}

export interface RemoteTask {
  id: string;
  kind: RemoteTaskKind;
  platform: ComputePlatformId;
  handle: ComputeJobHandle;
  status: RemoteTaskStatus;
  createdAt: number;
  updatedAt: number;
  payload: Record<string, unknown>;
  meta?: Record<string, unknown>;
  result?: RemoteTaskResult;
  appliedAt?: number;
}

export interface RemoteQueueDoc {
  version: 1;
  tasks: RemoteTask[];
  updatedAt: number;
}

/** Marker a remote notebook prints immediately before its JSON envelope. */
export const REMOTE_RESULT_MARKER = '__RECOURSE_RESULT__';

const MAX_TASKS = 200;

export function remoteComputeQueuePath(): string {
  return process.env.REMOTE_COMPUTE_FILE || `${process.cwd()}/data/remote-compute.json`;
}

/**
 * Platforms the bridge may offload NOTEBOOK jobs to.
 *   - `local` is excluded (in-process).
 *   - `e2b` is excluded: it runs a raw script string, so a `ComputeNotebook`
 *     payload would execute empty code. E2B stays reachable via its own route.
 *   - `huggingface` is excluded: HF Spaces run an app (`ComputeSpaceConfig`),
 *     not a notebook, and its free tier (ZeroGPU 3.5min/day, paid dynamic CPU)
 *     cannot run training/batch jobs. HF remains reachable through its own
 *     `/compute/huggingface/*` Space routes.
 * Kaggle is the only free backend that actually runs notebooks.
 */
const NOTEBOOK_PLATFORM_IDS: ComputePlatformId[] = ['kaggle'];

export interface RemoteComputeDeps {
  /** Injectable for tests; defaults to the real unified client. */
  client?: UnifiedComputeClient;
}

function emptyDoc(): RemoteQueueDoc {
  return { version: 1, tasks: [], updatedAt: 0 };
}

export function readRemoteQueue(): RemoteQueueDoc {
  const doc = readJsonFile<RemoteQueueDoc>(remoteComputeQueuePath(), emptyDoc());
  if (!doc || doc.version !== 1 || !Array.isArray(doc.tasks)) return emptyDoc();
  return doc;
}

function writeRemoteQueue(doc: RemoteQueueDoc): void {
  try {
    writeJsonFile(remoteComputeQueuePath(), doc);
  } catch (err) {
    console.warn('[remote-compute] persist failed:', err instanceof Error ? err.message : String(err));
  }
}

/**
 * True when at least one remote platform is configured and has quota left.
 * Uses the platform registry directly (no network).
 */
export function remoteComputeEnabled(): boolean {
  return getAvailablePlatforms().some((p) => NOTEBOOK_PLATFORM_IDS.includes(p.id));
}

/** Which remote platforms could take work right now (diagnostics). */
export function remotePlatformStatus(): Array<{ id: ComputePlatformId; available: boolean }> {
  return listPlatforms()
    .filter((p) => NOTEBOOK_PLATFORM_IDS.includes(p.id))
    .map((p) => ({ id: p.id, available: p.configured && p.quota.consumed < p.quota.weeklyLimit }));
}

// ---------------------------------------------------------------------------
// Result envelope
// ---------------------------------------------------------------------------

/** Parse the last `__RECOURSE_RESULT__ {json}` line out of remote stdout. */
export function parseRemoteResult(stdout: string): { data?: Record<string, unknown>; error?: string } {
  const lines = String(stdout || '').split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const idx = line.indexOf(REMOTE_RESULT_MARKER);
    if (idx === -1) continue;
    const raw = line.slice(idx + REMOTE_RESULT_MARKER.length).trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { data: parsed as Record<string, unknown> };
      }
      return { data: { value: parsed } };
    } catch {
      return { error: 'result marker present but JSON was unparseable' };
    }
  }
  return { error: 'no result envelope found in remote output' };
}

// ---------------------------------------------------------------------------
// Notebook builders
// ---------------------------------------------------------------------------

/** Wrap a Python statement that computes `result` and prints the envelope. */
function enveloped(code: string): string {
  return (
    `import json as _rc_json\n` +
    `${code}\n` +
    `print("${REMOTE_RESULT_MARKER}" + _rc_json.dumps(result))`
  );
}

function pythonNotebook(code: string, requirements: string[] = []): { notebook: ComputeNotebook; requirements: string[] } {
  return {
    notebook: {
      kernel: 'python3',
      cells: [{ type: 'code', source: enveloped(code) }],
    },
    requirements,
  };
}

/**
 * Small-model training notebook. Trains a scikit-learn model on the provided
 * rows and reports honest held-out metrics. `rows` is a JSON array of feature
 * vectors; `target` the labels; `task` 'regression' | 'classification'.
 */
export function buildSmallModelNotebook(payload: {
  rows: number[][];
  target: number[];
  task?: 'regression' | 'classification';
  model?: 'linear' | 'ridge' | 'mlp';
  testFraction?: number;
}): { notebook: ComputeNotebook; requirements: string[] } {
  const cfg = JSON.stringify({
    rows: payload.rows,
    target: payload.target,
    task: payload.task ?? 'regression',
    model: payload.model ?? 'linear',
    testFraction: payload.testFraction ?? 0.2,
  });
  const code =
    `from sklearn.model_selection import train_test_split\n` +
    `from sklearn.linear_model import LinearRegression, Ridge, LogisticRegression\n` +
    `from sklearn.neural_network import MLPRegressor, MLPClassifier\n` +
    `from sklearn.metrics import mean_squared_error, accuracy_score\n` +
    `import numpy as np\n` +
    `cfg = _rc_json.loads(${JSON.stringify(cfg)})\n` +
    `X = np.array(cfg["rows"], dtype=float)\n` +
    `y = np.array(cfg["target"], dtype=float)\n` +
    `is_cls = cfg["task"] == "classification"\n` +
    `if len(X) < 4:\n` +
    `    result = {"ok": False, "error": "need at least 4 training rows"}\n` +
    `else:\n` +
    `    stratify = y if is_cls else None\n` +
    `    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=cfg["testFraction"], random_state=42, stratify=stratify)\n` +
    `    if cfg["model"] == "mlp":\n` +
    `        clf = MLPClassifier(max_iter=500, random_state=1) if is_cls else MLPRegressor(max_iter=800, random_state=1)\n` +
    `    elif cfg["model"] == "ridge":\n` +
    `        clf = LogisticRegression(max_iter=500) if is_cls else Ridge(alpha=1.0)\n` +
    `    else:\n` +
    `        clf = LogisticRegression(max_iter=500) if is_cls else LinearRegression()\n` +
    `    clf.fit(Xtr, ytr)\n` +
    `    pred = clf.predict(Xte)\n` +
    `    metric = accuracy_score(yte, pred) if is_cls else -float(mean_squared_error(yte, pred))\n` +
    `    result = {"ok": True, "metric": round(float(metric), 6), "metricName": "accuracy" if is_cls else "neg_mse",\n` +
    `              "trainRows": int(Xtr.shape[0]), "testRows": int(Xte.shape[0]),\n` +
    `              "model": cfg["model"], "task": cfg["task"]}`;
  return pythonNotebook(code, ['scikit-learn', 'numpy']);
}

/**
 * Forge candidate-generation notebook. Generates `count` candidate solutions per
 * spec via an OpenAI-compatible endpoint. The API base/model/key are read from
 * the remote runtime env (`RECOURSE_FORGE_BASE_URL`, `RECOURSE_FORGE_API_KEY`,
 * `RECOURSE_FORGE_MODEL`) so secrets are never embedded in the notebook. If the
 * env is absent the notebook reports an honest error; Recourse re-verifies every
 * candidate locally regardless.
 */
export function buildForgePrecomputeNotebook(payload: {
  specs: Array<{ name: string; prompt: string }>;
  count?: number;
}): { notebook: ComputeNotebook; requirements: string[] } {
  // Only name+prompt go to the remote box; hidden reference suites never leave
  // the local process (Recourse re-verifies every remote candidate locally).
  const safeSpecs = payload.specs.map((s) => ({ name: s.name, prompt: s.prompt }));
  const cfg = JSON.stringify({ specs: safeSpecs, count: payload.count ?? 2 });
  const code =
    `import os, urllib.request\n` +
    `cfg = _rc_json.loads(${JSON.stringify(cfg)})\n` +
    `base = os.environ.get("RECOURSE_FORGE_BASE_URL", "").rstrip("/")\n` +
    `key = os.environ.get("RECOURSE_FORGE_API_KEY", "")\n` +
    `model = os.environ.get("RECOURSE_FORGE_MODEL", "")\n` +
    `if not base or not model:\n` +
    `    result = {"ok": False, "error": "remote forge env not configured (RECOURSE_FORGE_BASE_URL/RECOURSE_FORGE_MODEL)"}\n` +
    `else:\n` +
    `    out = []\n` +
    `    for spec in cfg["specs"]:\n` +
    `        cands = []\n` +
    `        for _ in range(int(cfg["count"])):\n` +
    `            body = _rc_json.dumps({"model": model, "temperature": 0.2,\n` +
    `                "messages": [{"role": "system", "content": "Return ONLY JavaScript source, no fences."},\n` +
    `                             {"role": "user", "content": "Write " + spec["name"] + ". Contract:\\n" + spec["prompt"]}]}).encode()\n` +
    `            req = urllib.request.Request(base + "/chat/completions", data=body,\n` +
    `                headers={"Content-Type": "application/json", "Authorization": "Bearer " + key})\n` +
    `            try:\n` +
    `                with urllib.request.urlopen(req, timeout=180) as r:\n` +
    `                    txt = _rc_json.loads(r.read().decode())["choices"][0]["message"]["content"]\n` +
    `                    cands.append(txt.replace("\`\`\`javascript", "").replace("\`\`\`js", "").replace("\`\`\`", "").strip())\n` +
    `            except Exception as e:\n` +
    `                cands.append("")\n` +
    `        out.append({"name": spec["name"], "candidates": [c for c in cands if c]})\n` +
    `    result = {"ok": True, "specs": out}`;
  return pythonNotebook(code, []);
}

/**
 * Generic evaluation notebook: runs the supplied Python body, which must set
 * `result` (a dict). Used for learner stress evaluation and repair diagnostics.
 */
export function buildEvalNotebook(payload: {
  script: string;
  requirements?: string[];
}): { notebook: ComputeNotebook; requirements: string[] } {
  return pythonNotebook(payload.script, payload.requirements ?? []);
}

// ---------------------------------------------------------------------------
// Job construction
// ---------------------------------------------------------------------------

export interface RemoteJobOptions {
  platform?: ComputePlatformId;
  hardware?: { type: 'gpu' | 'cpu' | 'tpu'; spec?: string };
  maxRuntimeMs?: number;
}

/** Build a ComputeJob for a kind. Returns null when the payload is unusable. */
export function buildRemoteJob(
  kind: RemoteTaskKind,
  payload: Record<string, unknown>,
  opts: RemoteJobOptions = {},
): ComputeJob | null {
  let built: { notebook: ComputeNotebook; requirements: string[] };
  switch (kind) {
    case 'train_small_model': {
      const rows = payload.rows as number[][] | undefined;
      const target = payload.target as number[] | undefined;
      if (!Array.isArray(rows) || !Array.isArray(target) || rows.length !== target.length || rows.length === 0) {
        return null;
      }
      built = buildSmallModelNotebook({
        rows,
        target,
        task: payload.task as 'regression' | 'classification' | undefined,
        model: payload.model as 'linear' | 'ridge' | 'mlp' | undefined,
        testFraction: payload.testFraction as number | undefined,
      });
      break;
    }
    case 'forge_precompute': {
      const specs = payload.specs as Array<{ name: string; prompt: string }> | undefined;
      if (!Array.isArray(specs) || specs.length === 0) return null;
      built = buildForgePrecomputeNotebook({ specs, count: payload.count as number | undefined });
      break;
    }
    case 'learner_stress_eval':
    case 'repair_diagnose': {
      const script = payload.script as string | undefined;
      if (!script || !script.trim()) return null;
      built = buildEvalNotebook({ script, requirements: payload.requirements as string[] | undefined });
      break;
    }
    default:
      return null;
  }

  const hardware = opts.hardware ?? (
    kind === 'forge_precompute' || kind === 'train_small_model'
      ? { type: 'gpu' as const }
      : { type: 'cpu' as const }
  );

  return {
    id: `rc_${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    platform: opts.platform ?? 'kaggle',
    kind: 'notebook',
    payload: built.notebook,
    hardware,
    maxRuntimeMs: Math.min(opts.maxRuntimeMs ?? 12 * 3_600_000, 12 * 3_600_000),
    meta: { requirements: built.requirements },
  };
}

// ---------------------------------------------------------------------------
// Enqueue / drain
// ---------------------------------------------------------------------------

export interface EnqueueResult {
  queued: boolean;
  task?: RemoteTask;
  reason?: string;
}

export async function enqueueRemoteTask(
  kind: RemoteTaskKind,
  payload: Record<string, unknown>,
  opts: RemoteJobOptions & { meta?: Record<string, unknown> } = {},
  deps: RemoteComputeDeps = {},
): Promise<EnqueueResult> {
  const client = deps.client ?? createComputeClient();
  const job = buildRemoteJob(kind, payload, opts);
  if (!job) return { queued: false, reason: `${kind} payload was incomplete` };

  let platform = opts.platform;
  if (!platform) {
    const selection = selectPlatform(job, { preferGpu: opts.hardware?.type === 'gpu' });
    // Only offload when a REMOTE platform is chosen; local stays in-process.
    if (!NOTEBOOK_PLATFORM_IDS.includes(selection.platform)) {
      return { queued: false, reason: 'no remote platform available (local stays in-process)' };
    }
    platform = selection.platform;
  }
  if (!NOTEBOOK_PLATFORM_IDS.includes(platform)) {
    return { queued: false, reason: `platform "${platform}" is not remote` };
  }

  try {
    const handle = await client.submitTo(platform, { ...job, platform });
    const now = Date.now();
    const task: RemoteTask = {
      id: job.id,
      kind,
      platform,
      handle,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
      payload,
      meta: opts.meta,
    };
    const doc = readRemoteQueue();
    doc.tasks.push(task);
    if (doc.tasks.length > MAX_TASKS) {
      // Keep active tasks plus the newest finished ones, never exceeding the cap.
      const active = doc.tasks.filter((t) => t.status === 'queued' || t.status === 'running');
      const finished = doc.tasks.filter((t) => t.status !== 'queued' && t.status !== 'running');
      const keepActive = active.slice(-MAX_TASKS);
      const room = Math.max(0, MAX_TASKS - keepActive.length);
      doc.tasks = [...keepActive, ...finished.slice(-room)];
    }
    doc.updatedAt = now;
    writeRemoteQueue(doc);
    return { queued: true, task };
  } catch (err: any) {
    return { queued: false, reason: err?.message || String(err) };
  }
}

/** Registered result appliers, keyed by task kind. */
export type RemoteApplier = (task: RemoteTask) => void | Promise<void>;
const APPLIERS = new Map<RemoteTaskKind, RemoteApplier>();

export function registerRemoteApplier(kind: RemoteTaskKind, applier: RemoteApplier): void {
  APPLIERS.set(kind, applier);
}

export function clearRemoteAppliers(): void {
  APPLIERS.clear();
}

export interface DrainSummary {
  polled: number;
  completed: RemoteTask[];
  failed: RemoteTask[];
  applied: number;
}

/**
 * Poll every active task once; fetch + parse finished ones, then run their
 * appliers. Never throws (a single failing task is isolated).
 */
export async function drainRemoteTasks(deps: RemoteComputeDeps = {}, limit = 5): Promise<DrainSummary> {
  const client = deps.client ?? createComputeClient();
  const doc = readRemoteQueue();
  const active = doc.tasks.filter((t) => t.status === 'queued' || t.status === 'running').slice(0, limit);
  const summary: DrainSummary = { polled: 0, completed: [], failed: [], applied: 0 };

  for (const task of active) {
    summary.polled += 1;
    let state: string = 'running';
    try {
      const status = await client.poll(task.handle);
      state = status.state;
    } catch (err: any) {
      task.status = 'failed';
      task.result = { ok: false, error: err?.message || String(err) };
      task.updatedAt = Date.now();
      summary.failed.push(task);
      continue;
    }
    task.updatedAt = Date.now();
    if (state === 'running' || state === 'pending') {
      task.status = 'running';
      continue;
    }
    if (state === 'cancelled') {
      task.status = 'cancelled';
      continue;
    }
    // completed | failed -> fetch the real result.
    let fetched;
    try {
      fetched = await client.await(task.handle);
    } catch (err: any) {
      task.status = 'failed';
      task.result = { ok: false, error: err?.message || String(err) };
      summary.failed.push(task);
      continue;
    }
    const parsed = parseRemoteResult(fetched.stdout || '');
    const ok = fetched.success && !parsed.error && parsed.data?.ok !== false;
    task.result = {
      ok,
      data: parsed.data,
      stdout: (fetched.stdout || '').slice(0, 8000),
      stderr: (fetched.stderr || '').slice(0, 4000),
      error: ok ? undefined : (parsed.error || fetched.error || (parsed.data?.error as string) || 'remote job failed'),
      durationMs: fetched.durationMs,
    };
    task.status = ok ? 'completed' : 'failed';
    if (ok) summary.completed.push(task);
    else summary.failed.push(task);

    // Only SUCCESSFUL results are ever applied to internal state. A failed task
    // must never mutate the sleep store / learner / repair loop.
    if (ok) {
      const applier = APPLIERS.get(task.kind);
      if (applier) {
        try {
          await applier(task);
          task.appliedAt = Date.now();
          summary.applied += 1;
        } catch (err) {
          console.warn(`[remote-compute] applier for ${task.kind} failed:`, err instanceof Error ? err.message : String(err));
        }
      }
    }
  }

  // Merge our updated tasks back into a FRESH read so an enqueue that happened
  // while we were polling is not clobbered by this write.
  const fresh = readRemoteQueue();
  const byId = new Map(doc.tasks.map((t) => [t.id, t]));
  for (let i = 0; i < fresh.tasks.length; i++) {
    const updated = byId.get(fresh.tasks[i].id);
    if (updated) fresh.tasks[i] = updated;
  }
  fresh.updatedAt = Date.now();
  writeRemoteQueue(fresh);
  return summary;
}

/** Most recent FINISHED task of a kind (optionally filtered), newest first. */
export function lastFinishedRemoteTask(
  kind: RemoteTaskKind,
  predicate?: (t: RemoteTask) => boolean,
): RemoteTask | undefined {
  const tasks = readRemoteQueue().tasks;
  for (let i = tasks.length - 1; i >= 0; i--) {
    const t = tasks[i];
    if (t.kind !== kind) continue;
    if (t.status !== 'completed' && t.status !== 'failed') continue;
    if (predicate && !predicate(t)) continue;
    return t;
  }
  return undefined;
}

export interface RemoteComputeSnapshot {
  enabled: boolean;
  platforms: Array<{ id: ComputePlatformId; available: boolean }>;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  tasks: Array<Pick<RemoteTask, 'id' | 'kind' | 'platform' | 'status' | 'createdAt' | 'updatedAt'>>;
}

export function remoteComputeSnapshot(limit = 25): RemoteComputeSnapshot {
  const doc = readRemoteQueue();
  return {
    enabled: remoteComputeEnabled(),
    platforms: remotePlatformStatus(),
    queued: doc.tasks.filter((t) => t.status === 'queued').length,
    running: doc.tasks.filter((t) => t.status === 'running').length,
    completed: doc.tasks.filter((t) => t.status === 'completed').length,
    failed: doc.tasks.filter((t) => t.status === 'failed').length,
    tasks: doc.tasks
      .slice(-limit)
      .reverse()
      .map((t) => ({ id: t.id, kind: t.kind, platform: t.platform, status: t.status, createdAt: t.createdAt, updatedAt: t.updatedAt })),
  };
}
