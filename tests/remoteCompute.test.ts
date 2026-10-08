import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildRemoteJob,
  buildSmallModelNotebook,
  buildForgePrecomputeNotebook,
  parseRemoteResult,
  enqueueRemoteTask,
  drainRemoteTasks,
  remoteComputeSnapshot,
  clearRemoteAppliers,
  registerRemoteApplier,
  REMOTE_RESULT_MARKER,
  type RemoteTask,
} from '../src/lib/remoteCompute';
import {
  registerRemoteComputeAppliers,
  readSmallModelRegistry,
} from '../src/lib/remoteComputeIntegrations';
import { takeReadySleepArtifact } from '../src/lib/sleepCompute';
import type {
  ComputeJob,
  ComputeJobHandle,
  ComputeJobResult,
  ComputeJobStatus,
  ComputePlatformStatus,
  UnifiedComputeClient,
} from '../src/lib/computePlatforms';
import { kagglePlatform } from '../src/lib/computePlatforms';

// ---------------------------------------------------------------------------
// Fake unified client (no network)
// ---------------------------------------------------------------------------

function fakeClient(script: {
  poll?: (h: ComputeJobHandle) => ComputeJobStatus;
  fetch?: (h: ComputeJobHandle) => ComputeJobResult;
} = {}): UnifiedComputeClient {
  return {
    async submit(job: ComputeJob): Promise<ComputeJobHandle> {
      return { id: job.id, platform: job.platform, externalId: job.id, submittedAt: Date.now(), status: 'running' };
    },
    async submitTo(platform, job: ComputeJob): Promise<ComputeJobHandle> {
      return { id: job.id, platform, externalId: job.id, submittedAt: Date.now(), status: 'running' };
    },
    async poll(handle: ComputeJobHandle): Promise<ComputeJobStatus> {
      return script.poll?.(handle) ?? { handle, state: 'running' };
    },
    async await(handle: ComputeJobHandle): Promise<ComputeJobResult> {
      return script.fetch?.(handle) ?? { handle, success: true, stdout: '', stderr: '', durationMs: 0 };
    },
    async cancel(): Promise<boolean> {
      return true;
    },
    status(): ComputePlatformStatus[] {
      return [];
    },
  };
}

function completed(envelope: Record<string, unknown>, marker = REMOTE_RESULT_MARKER): ComputeJobResult {
  return {
    handle: { id: 'x', platform: 'kaggle', externalId: 'x', submittedAt: Date.now(), status: 'completed' },
    success: true,
    stdout: `noise\n${marker} ${JSON.stringify(envelope)}`,
    stderr: '',
    durationMs: 7,
  };
}

describe('remoteCompute', () => {
  let tmpDir: string;
  const originalEnv = process.env;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-remote-'));
    process.env = { ...originalEnv };
    process.env.REMOTE_COMPUTE_FILE = path.join(tmpDir, 'remote.json');
    process.env.SLEEP_COMPUTE_FILE = path.join(tmpDir, 'sleep.json');
    process.env.SMALL_MODEL_REGISTRY_FILE = path.join(tmpDir, 'models.json');
    clearRemoteAppliers();
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- builders ---

  it('builds a small-model training notebook that prints the result envelope', () => {
    const { notebook, requirements } = buildSmallModelNotebook({ rows: [[0], [1], [2], [3]], target: [1, 3, 5, 7] });
    expect(notebook.kernel).toBe('python3');
    expect(notebook.cells[0].source).toContain('LinearRegression');
    expect(notebook.cells[0].source).toContain(REMOTE_RESULT_MARKER);
    expect(requirements).toContain('scikit-learn');
  });

  it('never leaks hidden reference suites into the forge notebook', () => {
    const { notebook } = buildForgePrecomputeNotebook({
      specs: [{ name: 'f', prompt: 'contract text' } as any],
    });
    // Only name+prompt are serialized; a refSuite passed on the object is dropped.
    expect(notebook.cells[0].source).toContain('contract text');
    expect(notebook.cells[0].source).not.toContain('assert');
  });

  it('buildRemoteJob rejects incomplete payloads and accepts valid ones', () => {
    expect(buildRemoteJob('train_small_model', { rows: [], target: [] })).toBeNull();
    expect(buildRemoteJob('forge_precompute', { specs: [] })).toBeNull();
    expect(buildRemoteJob('learner_stress_eval', { script: '' })).toBeNull();
    const job = buildRemoteJob('learner_stress_eval', { script: 'result={"externalScore":1.0}' });
    expect(job?.kind).toBe('notebook');
    expect(job?.hardware?.type).toBe('cpu');
    // CPU by default: scikit-learn / HTTP-only jobs must not spend GPU quota.
    expect(buildRemoteJob('train_small_model', { rows: [[1]], target: [1] })?.hardware?.type).toBe('cpu');
    const gpuJob = buildRemoteJob('train_small_model', { rows: [[1]], target: [1] }, { hardware: { type: 'gpu' } });
    expect(gpuJob?.hardware?.type).toBe('gpu');
    // Accelerator sessions cap at 9h, CPU at 12h.
    expect(gpuJob?.maxRuntimeMs).toBe(9 * 3_600_000);
    expect(job?.maxRuntimeMs).toBe(12 * 3_600_000);
  });

  // --- result parsing ---

  it('parses the last result envelope out of stdout', () => {
    const parsed = parseRemoteResult(`a\n${REMOTE_RESULT_MARKER} {"ok":true,"externalScore":0.5}\n`);
    expect(parsed.data).toEqual({ ok: true, externalScore: 0.5 });
  });

  it('reports an honest error when no envelope is present', () => {
    expect(parseRemoteResult('just logs').error).toMatch(/no result envelope/i);
    expect(parseRemoteResult(`${REMOTE_RESULT_MARKER} not json`).error).toMatch(/unparseable/i);
  });

  // --- enqueue ---

  it('enqueues to an explicit remote platform and persists the task', async () => {
    const client = fakeClient();
    const res = await enqueueRemoteTask('learner_stress_eval', { script: 'result={"externalScore":0.5}' }, { platform: 'kaggle' }, { client });
    expect(res.queued).toBe(true);
    expect(res.task?.platform).toBe('kaggle');
    const snap = remoteComputeSnapshot();
    expect(snap.queued).toBe(1);
  });

  it('refuses to enqueue when only the local platform is available', async () => {
    const client = fakeClient();
    // No explicit platform + no remote platform configured => local is chosen => refused.
    const res = await enqueueRemoteTask('learner_stress_eval', { script: 'result={"externalScore":0.5}' }, {}, { client });
    expect(res.queued).toBe(false);
    expect(res.reason).toMatch(/remote|local/i);
  });

  it('routes a CPU job to Kaggle when it is available and no platform is given', async () => {
    // Regression: the generic selector scored CPU jobs toward local/e2b, so every
    // CPU offload (train_small_model, stress eval) silently refused even with
    // Kaggle configured. The remote path must choose among notebook platforms.
    const client = fakeClient();
    kagglePlatform.configured = true;
    try {
      const res = await enqueueRemoteTask(
        'train_small_model',
        { rows: [[1], [2], [3], [4]], target: [0, 1, 0, 1] },
        {},
        { client },
      );
      expect(res.queued).toBe(true);
      expect(res.task?.platform).toBe('kaggle');
    } finally {
      kagglePlatform.configured = false;
    }
  });

  it('refuses explicit non-notebook platforms (local, e2b, huggingface)', async () => {
    const client = fakeClient();
    for (const platform of ['local', 'e2b', 'huggingface'] as const) {
      const res = await enqueueRemoteTask('learner_stress_eval', { script: 'result={}' }, { platform }, { client });
      expect(res.queued).toBe(false);
    }
  });

  // --- drain + appliers ---

  it('drains a completed task, parses the envelope, and runs its applier', async () => {
    const scores: number[] = [];
    registerRemoteApplier('learner_stress_eval', (task: RemoteTask) => {
      const s = task.result?.data?.externalScore;
      if (typeof s === 'number') scores.push(s);
    });
    const client = fakeClient({
      poll: (h) => ({ handle: h, state: 'completed' }),
      fetch: () => completed({ ok: true, externalScore: 0.42 }),
    });
    await enqueueRemoteTask('learner_stress_eval', { script: 'result={"externalScore":0.42}' }, { platform: 'kaggle' }, { client });
    const summary = await drainRemoteTasks({ client });
    expect(summary.completed).toHaveLength(1);
    expect(summary.applied).toBe(1);
    expect(scores).toEqual([0.42]);
    expect(remoteComputeSnapshot().completed).toBe(1);
  });

  it('marks a task failed when the remote output has no envelope', async () => {
    const client = fakeClient({
      poll: (h) => ({ handle: h, state: 'completed' }),
      fetch: (h) => ({ handle: h, success: true, stdout: 'no marker here', stderr: '', durationMs: 1 }),
    });
    await enqueueRemoteTask('repair_diagnose', { script: 'result={}', issue: { id: 'job:forge', name: 'Forge', detail: 'boom' } }, { platform: 'kaggle' }, { client });
    const summary = await drainRemoteTasks({ client });
    expect(summary.completed).toHaveLength(0);
    expect(summary.failed).toHaveLength(1);
    expect(remoteComputeSnapshot().failed).toBe(1);
  });

  it('does NOT run the applier for a failed task (failed remote work never mutates state)', async () => {
    let applied = 0;
    registerRemoteApplier('learner_stress_eval', () => { applied += 1; });
    const client = fakeClient({
      poll: (h) => ({ handle: h, state: 'completed' }),
      fetch: (h) => ({ handle: h, success: true, stdout: 'no envelope here', stderr: '', durationMs: 1 }),
    });
    await enqueueRemoteTask('learner_stress_eval', { script: 'result={}' }, { platform: 'kaggle' }, { client });
    const summary = await drainRemoteTasks({ client });
    expect(summary.failed).toHaveLength(1);
    expect(summary.applied).toBe(0);
    expect(applied).toBe(0);
  });

  it('keeps a running task in the queue and does not apply it', async () => {
    let applied = 0;
    registerRemoteApplier('learner_stress_eval', () => { applied += 1; });
    const client = fakeClient({ poll: (h) => ({ handle: h, state: 'running' }) });
    await enqueueRemoteTask('learner_stress_eval', { script: 'result={}' }, { platform: 'kaggle' }, { client });
    const summary = await drainRemoteTasks({ client });
    expect(summary.polled).toBe(1);
    expect(applied).toBe(0);
    expect(remoteComputeSnapshot().running).toBe(1);
  });

  // --- integrations ---

  it('forge applier stores candidates in the sleep store only after LOCAL verification', async () => {
    registerRemoteComputeAppliers();
    const client = fakeClient({
      poll: (h) => ({ handle: h, state: 'completed' }),
      fetch: () => completed({
        ok: true,
        specs: [{ name: 'addOne', candidates: ['export function addOne(n) { return n + 1; }'] }],
      }),
    });
    await enqueueRemoteTask(
      'forge_precompute',
      { specs: [{ name: 'addOne', domain: 'math', prompt: 'Return n+1', refSuite: 'assert addOne(1) === 2;' }] },
      { platform: 'kaggle' },
      { client },
    );
    const summary = await drainRemoteTasks({ client });
    expect(summary.applied).toBe(1);
    const ready = takeReadySleepArtifact('addOne');
    expect(ready).not.toBeNull();
    expect(ready?.verified).toBe(true);
  });

  it('forge applier does NOT mark a failing remote candidate as verified', async () => {
    registerRemoteComputeAppliers();
    const client = fakeClient({
      poll: (h) => ({ handle: h, state: 'completed' }),
      fetch: () => completed({
        ok: true,
        specs: [{ name: 'addOne', candidates: ['export function addOne(n) { return n + 2; }'] }],
      }),
    });
    await enqueueRemoteTask(
      'forge_precompute',
      { specs: [{ name: 'addOne', domain: 'math', prompt: 'Return n+1', refSuite: 'assert addOne(1) === 2;' }] },
      { platform: 'kaggle' },
      { client },
    );
    await drainRemoteTasks({ client });
    expect(takeReadySleepArtifact('addOne')).toBeNull();
  });

  it('small-model applier writes real metrics to the durable registry', async () => {
    registerRemoteComputeAppliers();
    const client = fakeClient({
      poll: (h) => ({ handle: h, state: 'completed' }),
      fetch: () => completed({
        ok: true,
        metric: 0.87,
        metricName: 'accuracy',
        model: 'ridge',
        task: 'classification',
        trainRows: 80,
        testRows: 20,
      }),
    });
    await enqueueRemoteTask('train_small_model', { rows: [[1], [2]], target: [0, 1] }, { platform: 'kaggle' }, { client });
    await drainRemoteTasks({ client });
    const reg = readSmallModelRegistry();
    expect(reg.models).toHaveLength(1);
    expect(reg.models[0].metric).toBe(0.87);
    expect(reg.models[0].model).toBe('ridge');
  });

  it('learner applier forwards the score through the injected callback', async () => {
    const seen: number[] = [];
    registerRemoteComputeAppliers({ applyExternalScore: (s) => { seen.push(s); } });
    const client = fakeClient({
      poll: (h) => ({ handle: h, state: 'completed' }),
      fetch: () => completed({ ok: true, externalScore: 0.66 }),
    });
    await enqueueRemoteTask('learner_stress_eval', { script: 'result={"externalScore":0.66}' }, { platform: 'kaggle' }, { client });
    await drainRemoteTasks({ client });
    expect(seen).toEqual([0.66]);
  });
});

describe('buildSmallModelNotebook � candidate scoring', () => {
  it('embeds predictRows and emits a predictions step only when candidates are given', () => {
    const withPred = buildSmallModelNotebook({ rows: [[1], [2], [3], [4]], target: [0, 1, 0, 1], model: 'mlp', predictRows: [[5], [6]] });
    const src = withPred.notebook.cells[0].source as string;
    expect(src).toContain('[[5],[6]]');
    expect(src).toContain('result["predictions"]');

    const noPred = buildSmallModelNotebook({ rows: [[1], [2], [3], [4]], target: [0, 1, 0, 1] });
    expect(noPred.notebook.cells[0].source as string).not.toContain('[[5],[6]]');
  });
});
