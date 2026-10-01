import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  listPlatforms,
  getPlatform,
  getAvailablePlatforms,
  selectPlatform,
  createComputeClient,
  initializeComputePlatforms,
  kagglePlatform,
  hfPlatform,
  localPlatform,
  e2bPlatform,
  type ComputeJob,
} from '../src/lib/computePlatforms';

describe('computePlatforms', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.KAGGLE_USERNAME;
    delete process.env.KAGGLE_KEY;
    delete process.env.HF_TOKEN;
    delete process.env.HUGGINGFACE_HUB_TOKEN;
    delete process.env.E2B_API_KEY;
    // Reset configured flags mutated by individual tests.
    kagglePlatform.configured = false;
    hfPlatform.configured = false;
    e2bPlatform.configured = false;
    kagglePlatform.quota.consumed = 0;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('registers the four expected platforms', () => {
    const ids = listPlatforms().map((p) => p.id).sort();
    expect(ids).toEqual(['e2b', 'huggingface', 'kaggle', 'local']);
  });

  it('exposes the free-tier hardware specs for Kaggle and Hugging Face', () => {
    const kaggle = getPlatform('kaggle')!;
    expect(kaggle.hardware.some((h) => h.type === 'gpu' && h.spec.includes('T4'))).toBe(true);
    expect(kaggle.hardware.some((h) => h.type === 'tpu')).toBe(true);
    expect(kaggle.quota.weeklyLimit).toBe(30);
    expect(kaggle.quota.sessionCap).toBe(12);

    const hf = getPlatform('huggingface')!;
    expect(hf.hardware.some((h) => h.type === 'gpu')).toBe(true);
    // 3.5 min/day expressed as hours/week.
    expect(hf.quota.weeklyLimit).toBeCloseTo(3.5 * 7, 5);
  });

  it('reports Kaggle and HF as unconfigured without credentials', async () => {
    // Point both at deliberately absent credentials so the assertion holds even
    // on a machine that happens to have a real ~/.kaggle/kaggle.json.
    await kagglePlatform.initialize?.({ credentialsPath: 'C:/nonexistent-dir/kaggle.json' });
    await hfPlatform.initialize?.({ token: '' });
    expect(kagglePlatform.configured).toBe(false);
    expect(hfPlatform.configured).toBe(false);
    // Local is always available.
    expect(localPlatform.configured).toBe(true);
  });

  it('only lists configured platforms with remaining quota as available', () => {
    // Nothing configured except local.
    const available = getAvailablePlatforms().map((p) => p.id);
    expect(available).toContain('local');
    expect(available).not.toContain('kaggle');
  });

  it('prefers Kaggle for a GPU job when it is configured', () => {
    kagglePlatform.configured = true;
    const job: ComputeJob = {
      id: 'gpu-job',
      platform: 'kaggle',
      kind: 'notebook',
      payload: { cells: [{ type: 'code', source: 'print(1)' }], kernel: 'python3' },
      hardware: { type: 'gpu' },
      maxRuntimeMs: 60_000,
    };
    const selection = selectPlatform(job);
    expect(selection.platform).toBe('kaggle');
    expect(selection.reason).toContain('Kaggle');
  });

  it('falls back to local when no GPU platform is configured', async () => {
    const job: ComputeJob = {
      id: 'cpu-job',
      platform: 'local',
      kind: 'script',
      payload: 'export function add(a, b) { return a + b; }',
      maxRuntimeMs: 10_000,
      meta: { functionName: 'add', args: [2, 3] },
    };
    const selection = selectPlatform(job);
    expect(selection.platform).toBe('local');
  });

  it('executes a real local job through the isolated sandbox', async () => {
    const client = createComputeClient();
    const job: ComputeJob = {
      id: 'local-exec-1',
      platform: 'local',
      kind: 'script',
      payload: 'export function add(a, b) { return a + b; }',
      maxRuntimeMs: 10_000,
      meta: { functionName: 'add', args: [2, 3] },
    };
    const handle = await client.submitTo('local', job);
    expect(handle.platform).toBe('local');
    const result = await client.await(handle);
    expect(result.success).toBe(true);
    // The real return value crosses the isolate as JSON.
    expect(result.artifacts?.returnValue).toBe(5);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('reports an honest failure for a local job whose code throws', async () => {
    const client = createComputeClient();
    const job: ComputeJob = {
      id: 'local-exec-throw',
      platform: 'local',
      kind: 'script',
      payload: 'export function boom() { throw new Error("kaboom"); }',
      maxRuntimeMs: 10_000,
      meta: { functionName: 'boom', args: [] },
    };
    const handle = await client.submitTo('local', job);
    const result = await client.await(handle);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/kaboom|Execution/i);
  });

  it('refuses to submit to an unconfigured platform', async () => {
    const client = createComputeClient();
    // Let any lazy initialization settle, then force the guard condition.
    await initializeComputePlatforms();
    kagglePlatform.configured = false;
    const job: ComputeJob = {
      id: 'kaggle-nope',
      platform: 'kaggle',
      kind: 'notebook',
      payload: { cells: [], kernel: 'python3' },
      maxRuntimeMs: 60_000,
    };
    await expect(client.submitTo('kaggle', job)).rejects.toThrow(/not configured/i);
  });

  it('e2b rejects a notebook payload (it only runs raw scripts)', async () => {
    const job: ComputeJob = {
      id: 'e2b-nb',
      platform: 'e2b',
      kind: 'notebook',
      payload: { cells: [{ type: 'code', source: 'print(1)' }], kernel: 'python3' },
      maxRuntimeMs: 1000,
    };
    await expect(e2bPlatform.submit(job)).rejects.toThrow(/string/);
  });

  it('e2b caches the real execution result for fetch (no empty stub)', async () => {
    const job: ComputeJob = {
      id: 'e2b-str',
      platform: 'e2b',
      kind: 'script',
      payload: 'print(1)',
      maxRuntimeMs: 1000,
    };
    // E2B_API_KEY is deleted in beforeEach, so this is an honest failed run.
    const handle = await e2bPlatform.submit(job);
    expect(handle.status).toBe('failed');
    const result = await e2bPlatform.fetch(handle);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not configured/i);
  });

  it('status() summarizes every platform', () => {
    const client = createComputeClient();
    const status = client.status();
    expect(status).toHaveLength(4);
    const local = status.find((s) => s.id === 'local')!;
    expect(local.configured).toBe(true);
    expect(local.available).toBe(true);
  });
});
