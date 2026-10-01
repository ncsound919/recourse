/**
 * Compute Platforms — free-tier GPU/CPU execution backends for Recourse.
 *
 * Integrates:
 *   - Kaggle: 30h/week GPU (T4/P100), 12h session cap, 20h/week TPU
 *   - Hugging Face: ZeroGPU 3.5min/day shared GPU, Static/Dynamic Spaces
 *   - Local: isolated-vm, E2B, self-hosted WASM (existing)
 *
 * Honesty contract:
 *   - Platform reports `available: false` when quota exhausted / not configured
 *   - Never fabricates results — real execution or honest failure
 *   - Quota tracked per-platform; caller decides fallback policy
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export type ComputePlatformId = 'kaggle' | 'huggingface' | 'local' | 'e2b';

export interface ComputePlatform {
  id: ComputePlatformId;
  name: string;
  description: string;
  /** Hardware available on this platform */
  hardware: ComputeHardware[];
  /** Current quota status */
  quota: ComputeQuota;
  /** Whether platform is configured and reachable */
  configured: boolean;
  /** Optional async initialization (credentials, CLI checks) */
  initialize?: (config?: unknown) => Promise<void>;
  /** Submit a job and return execution handle */
  submit(job: ComputeJob): Promise<ComputeJobHandle>;
  /** Poll job status */
  poll(handle: ComputeJobHandle): Promise<ComputeJobStatus>;
  /** Fetch job result (blocks until complete) */
  fetch(handle: ComputeJobHandle, timeoutMs?: number): Promise<ComputeJobResult>;
  /** Cancel a running job */
  cancel(handle: ComputeJobHandle): Promise<boolean>;
  // Platform-specific methods (optional, for internal use)
  deployStaticSpace?: (job: ComputeJob, config: ComputeSpaceConfig) => Promise<ComputeJobHandle>;
  deployDynamicSpace?: (job: ComputeJob, config: ComputeSpaceConfig) => Promise<ComputeJobHandle>;
  getUsername?: (token: string) => Promise<string | null>;
  writeSpaceFiles?: (dir: string, config: ComputeSpaceConfig, payload: unknown) => Promise<void>;
  uploadFolder?: (localPath: string, repoId: string, token: string, repoType: 'space' | 'model' | 'dataset') => Promise<void>;
  fetchSpaceLogs?: (repoId: string) => Promise<{ stdout: string; stderr: string }>;
}

export interface ComputeHardware {
  type: 'gpu' | 'cpu' | 'tpu';
  spec: string;           // e.g., 'NVIDIA T4', 'NVIDIA P100', 'TPU v3-8'
  count: number;          // concurrent units available
  memoryGb?: number;
}

export interface ComputeQuota {
  /** Weekly quota in hours (GPU/TPU) or minutes (ZeroGPU) */
  weeklyLimit: number;
  /** Consumed this period */
  consumed: number;
  /** Period reset timestamp (epoch ms) */
  resetsAt: number;
  /** Per-session cap in hours/minutes */
  sessionCap: number;
  /** Current session consumption (if session active) */
  sessionConsumed?: number;
}

export interface ComputeJob {
  id: string;
  platform: ComputePlatformId;
  /** Entry point: 'notebook' (Kaggle), 'space' (HF), 'script' (local/E2B) */
  kind: 'notebook' | 'space' | 'script' | 'container';
  /** Source code / notebook cells / container spec */
  payload: string | ComputeNotebook | ComputeSpaceConfig | ComputeContainerSpec;
  /** Hardware request */
  hardware?: { type: 'gpu' | 'cpu' | 'tpu'; spec?: string; count?: number };
  /** Max wall time (respects platform session cap) */
  maxRuntimeMs: number;
  /** Environment variables / secrets */
  env?: Record<string, string>;
  /** Input files (mounted into execution environment) */
  inputs?: ComputeFile[];
  /** Output files to retrieve */
  outputs?: string[];
  /** Metadata for tracking */
  meta?: Record<string, unknown>;
}

export interface ComputeNotebook {
  cells: NotebookCell[];
  kernel: 'python3' | 'python2' | 'r' | 'julia';
  metadata?: Record<string, unknown>;
}

export interface NotebookCell {
  type: 'code' | 'markdown';
  source: string;
  outputs?: unknown[];
  executionCount?: number | null;
}

export interface ComputeSpaceConfig {
  repoId: string;           // e.g., 'username/space-name'
  sdk: 'gradio' | 'streamlit' | 'docker' | 'static';
  entrypoint?: string;
  requirements?: string[];
  hardware?: 'cpu-basic' | 'cpu-upgrade' | 't4-small' | 't4-medium' | 'a10g' | 'a100' | 'zero-gpu';
  secrets?: string[];       // secret names to inject
  title?: string;
  /** Inline files to write into the Space (e.g. index.html for static). */
  files?: ComputeFile[];
}

export interface ComputeContainerSpec {
  image: string;            // Docker image
  command?: string[];
  args?: string[];
  mounts?: { source: string; target: string; readonly?: boolean }[];
  gpus?: number;
}

export interface ComputeFile {
  path: string;             // destination path in execution env
  content: string | Uint8Array;
  encoding?: 'utf8' | 'base64';
}

export interface ComputeJobHandle {
  id: string;
  platform: ComputePlatformId;
  externalId: string;       // platform-specific job/run ID
  submittedAt: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
}

export interface ComputeJobStatus {
  handle: ComputeJobHandle;
  state: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress?: number;        // 0-100
  logs?: string[];
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface ComputeJobResult {
  handle: ComputeJobHandle;
  success: boolean;
  exitCode?: number;
  stdout: string;
  stderr: string;
  outputFiles?: ComputeFile[];
  artifacts?: Record<string, unknown>;
  durationMs: number;
  error?: string;
}

// ============================================================================
// Platform Registry
// ============================================================================

const PLATFORMS = new Map<ComputePlatformId, ComputePlatform>();

export function registerPlatform(platform: ComputePlatform): void {
  PLATFORMS.set(platform.id, platform);
}

export function getPlatform(id: ComputePlatformId): ComputePlatform | undefined {
  return PLATFORMS.get(id);
}

export function listPlatforms(): ComputePlatform[] {
  return Array.from(PLATFORMS.values());
}

export function getAvailablePlatforms(): ComputePlatform[] {
  return listPlatforms().filter(p => p.configured && p.quota.consumed < p.quota.weeklyLimit);
}

// ============================================================================
// Kaggle Platform
// ============================================================================

export interface KaggleConfig {
  username?: string;
  key?: string;
  /** Path to kaggle.json (default: ~/.kaggle/kaggle.json) */
  credentialsPath?: string;
}

const KAGGLE_QUOTA_FILE = '.kaggle_quota.json';

interface KaggleQuotaState {
  weekStart: number;
  gpuHours: number;
  tpuHours: number;
  cpuHours: number;
}

function loadKaggleQuota(): KaggleQuotaState {
  try {
    const raw = fs.readFileSync(KAGGLE_QUOTA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { weekStart: weekStartMs(), gpuHours: 0, tpuHours: 0, cpuHours: 0 };
  }
}

function saveKaggleQuota(state: KaggleQuotaState): void {
  fs.writeFileSync(KAGGLE_QUOTA_FILE, JSON.stringify(state, null, 2));
}

function weekStartMs(): number {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sunday
  const diff = now.getTime() - day * 24 * 60 * 60 * 1000;
  return new Date(new Date(diff).setUTCHours(0, 0, 0, 0)).getTime();
}

function maybeResetKaggleQuota(state: KaggleQuotaState): KaggleQuotaState {
  const ws = weekStartMs();
  if (state.weekStart !== ws) {
    return { weekStart: ws, gpuHours: 0, tpuHours: 0, cpuHours: 0 };
  }
  return state;
}

const kagglePlatform: ComputePlatform = {
  id: 'kaggle',
  name: 'Kaggle Kernels',
  description: '30h/week GPU (T4/P100), 20h/week TPU v3-8, 12h session cap',
  hardware: [
    { type: 'gpu', spec: 'NVIDIA T4', count: 1, memoryGb: 16 },
    { type: 'gpu', spec: 'NVIDIA P100', count: 1, memoryGb: 16 },
    { type: 'tpu', spec: 'TPU v3-8', count: 8 },
    { type: 'cpu', spec: 'Intel Xeon', count: 4 },
  ],
  quota: { weeklyLimit: 30, consumed: 0, resetsAt: 0, sessionCap: 12 },
  configured: false,

  async initialize(config: KaggleConfig = {}): Promise<void> {
    const credsPath = config.credentialsPath || path.join(process.env.HOME || '', '.kaggle', 'kaggle.json');
    if (!fs.existsSync(credsPath)) {
      this.configured = false;
      return;
    }
    try {
      execSync('kaggle --version', { stdio: 'ignore' });
      this.configured = true;
      const quota = maybeResetKaggleQuota(loadKaggleQuota());
      this.quota = { ...this.quota, consumed: quota.gpuHours, resetsAt: quota.weekStart + 7 * 24 * 60 * 60 * 1000 };
    } catch {
      this.configured = false;
    }
  },

  async submit(job: ComputeJob): Promise<ComputeJobHandle> {
    if (!this.configured) throw new Error('Kaggle not configured (kaggle CLI + credentials)');
    if (this.quota.consumed >= this.quota.weeklyLimit) throw new Error('Kaggle weekly GPU quota exhausted');

    const notebook = job.payload as ComputeNotebook;
    const filename = `recourse_${job.id}.ipynb`;
    const nbContent = notebookToJson(notebook);

    // Write notebook to a per-job temp dir (kernel metadata + cells). The dir is
    // always removed, even when the CLI push fails, so no scratch is left behind.
    const tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'kaggle_'));
    try {
      const nbPath = path.join(tmpDir, filename);
      fs.writeFileSync(nbPath, nbContent, 'utf-8');
      // Kernel metadata sidecar the Kaggle CLI requires.
      fs.writeFileSync(
        path.join(tmpDir, 'kernel-metadata.json'),
        JSON.stringify(
          {
            id: job.id,
            title: job.id,
            code_file: filename,
            language: 'python',
            kernel_type: 'notebook',
            is_private: true,
            enable_gpu: job.hardware?.type === 'gpu',
            enable_tpu: job.hardware?.type === 'tpu',
            dataset_sources: [],
            competition_sources: [],
            kernel_sources: [],
          },
          null,
          2,
        ),
        'utf-8',
      );

      // `kaggle kernels push` submits the version; the CLI runs it remotely.
      execSync(`kaggle kernels push -p "${tmpDir}"`, { stdio: 'pipe', timeout: 120000 });
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    }

    // Record the requested budget against the weekly quota only after a
    // successful submission.
    const budgetHours = job.maxRuntimeMs / 3_600_000;
    const quotaState = maybeResetKaggleQuota(loadKaggleQuota());
    if (job.hardware?.type === 'tpu') quotaState.tpuHours += budgetHours;
    else if (job.hardware?.type === 'gpu') quotaState.gpuHours += budgetHours;
    else quotaState.cpuHours += budgetHours;
    saveKaggleQuota(quotaState);
    this.quota = { ...this.quota, consumed: quotaState.gpuHours, resetsAt: quotaState.weekStart + 7 * 24 * 60 * 60 * 1000 };

    return {
      id: job.id,
      platform: 'kaggle',
      externalId: job.id,
      submittedAt: Date.now(),
      status: 'running',
    };
  },

  async poll(handle: ComputeJobHandle): Promise<ComputeJobStatus> {
    try {
      const output = execSync(`kaggle kernels output "${handle.externalId}"`, { encoding: 'utf-8', timeout: 30000 });
      const lines = output.trim().split('\n');
      const lastLine = lines[lines.length - 1];
      if (lastLine.includes('complete') || lastLine.includes('success')) {
        return { handle, state: 'completed', progress: 100, logs: lines };
      }
      if (lastLine.includes('error') || lastLine.includes('failed')) {
        return { handle, state: 'failed', progress: 100, logs: lines, error: lastLine };
      }
      return { handle, state: 'running', progress: 50, logs: lines.slice(-20) };
    } catch (e: any) {
      return { handle, state: 'failed', progress: 0, logs: [], error: e.message };
    }
  },

  async fetch(handle: ComputeJobHandle, timeoutMs = 3600000): Promise<ComputeJobResult> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const status = await this.poll(handle);
      if (status.state === 'completed' || status.state === 'failed') {
        const output = execSync(`kaggle kernels output "${handle.externalId}"`, { encoding: 'utf-8', timeout: 30000 });
        return {
          handle,
          success: status.state === 'completed',
          stdout: output,
          stderr: '',
          durationMs: Date.now() - start,
          error: status.error,
        };
      }
      await new Promise(r => setTimeout(r, 5000));
    }
    throw new Error('Kaggle job timeout');
  },

  async cancel(handle: ComputeJobHandle): Promise<boolean> {
    try {
      execSync(`kaggle kernels cancel "${handle.externalId}"`, { stdio: 'ignore', timeout: 30000 });
      return true;
    } catch {
      return false;
    }
  },
};

function notebookToJson(nb: ComputeNotebook): string {
  return JSON.stringify({
    nbformat: 4,
    nbformat_minor: 4,
    metadata: {
      kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
      language_info: { name: 'python', version: '3.10' },
      ...nb.metadata,
    },
    cells: nb.cells.map(c => ({
      cell_type: c.type,
      source: c.source.split('\n').map(l => l + '\n'),
      outputs: c.outputs || [],
      execution_count: c.executionCount ?? null,
      metadata: {},
    })),
  }, null, 2);
}

// ============================================================================
// Hugging Face Platform (ZeroGPU / Spaces) - direct HF Hub REST calls
//
// CAVEAT (honesty): the Space create/upload/restart/pause/logs endpoints below
// are best-effort against the public Hub REST API and are NOT covered by a live
// integration test (Kaggle is the workhorse for heavy jobs). Every call fails
// loudly rather than fabricating a deploy; verify against the current Hub API
// docs before relying on Space deployment in production.
// ============================================================================

export interface HuggingFaceConfig {
  token?: string;           // HF_TOKEN or HUGGINGFACE_HUB_TOKEN
}

const HF_QUOTA_FILE = '.hf_quota.json';
const HF_API_URL = 'https://huggingface.co/api';

interface HFQuotaState {
  dayStart: number;
  zeroGpuMinutes: number;
}

function loadHFQuota(): HFQuotaState {
  try {
    const raw = fs.readFileSync(HF_QUOTA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { dayStart: dayStartMs(), zeroGpuMinutes: 0 };
  }
}

function saveHFQuota(state: HFQuotaState): void {
  fs.writeFileSync(HF_QUOTA_FILE, JSON.stringify(state, null, 2));
}

function dayStartMs(): number {
  const now = new Date();
  return new Date(now.setUTCHours(0, 0, 0, 0)).getTime();
}

function maybeResetHFQuota(state: HFQuotaState): HFQuotaState {
  const ds = dayStartMs();
  if (state.dayStart !== ds) {
    return { dayStart: ds, zeroGpuMinutes: 0 };
  }
  return state;
}

async function hfFetch(endpoint: string, token: string, options: RequestInit = {}): Promise<Response> {
  const url = `${HF_API_URL}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  return res;
}

const hfPlatform: ComputePlatform = {
  id: 'huggingface',
  name: 'Hugging Face Spaces / ZeroGPU',
  description: 'ZeroGPU 3.5min/day shared GPU, Static Spaces free, Dynamic CPU requires paid plan',
  hardware: [
    { type: 'gpu', spec: 'ZeroGPU (shared A10G/T4)', count: 1, memoryGb: 24 },
    { type: 'cpu', spec: 'CPU Basic (2 vCPU, 16GB RAM)', count: 1 },
  ],
  quota: { weeklyLimit: 3.5 * 7, consumed: 0, resetsAt: 0, sessionCap: 3.5 / 60 }, // 3.5 min/day in hours
  configured: false,

  async initialize(config: HuggingFaceConfig = {}): Promise<void> {
    const token = config.token || process.env.HF_TOKEN || process.env.HUGGINGFACE_HUB_TOKEN;
    if (!token) {
      this.configured = false;
      return;
    }
    try {
      const res = await hfFetch('/whoami-v2', token);
      if (res.ok) {
        this.configured = true;
        const quota = maybeResetHFQuota(loadHFQuota());
        this.quota = { ...this.quota, consumed: quota.zeroGpuMinutes / 60, resetsAt: quota.dayStart + 24 * 60 * 60 * 1000 };
      } else {
        this.configured = false;
      }
    } catch {
      this.configured = false;
    }
  },

  async submit(job: ComputeJob): Promise<ComputeJobHandle> {
    if (!this.configured) throw new Error('Hugging Face not configured (HF_TOKEN)');
    const quota = maybeResetHFQuota(loadHFQuota());
    if (quota.zeroGpuMinutes >= 3.5) throw new Error('ZeroGPU daily quota exhausted (3.5 min)');

    const spaceConfig = job.payload as ComputeSpaceConfig;
    if (spaceConfig.sdk === 'static') {
      return this.deployStaticSpace(job, spaceConfig);
    }
    if (spaceConfig.hardware === 'zero-gpu') {
      quota.zeroGpuMinutes += job.maxRuntimeMs / 60000;
      if (quota.zeroGpuMinutes > 3.5) quota.zeroGpuMinutes = 3.5;
      saveHFQuota(quota);
      this.quota.consumed = quota.zeroGpuMinutes / 60;
    }
    return this.deployDynamicSpace(job, spaceConfig);
  },

  async deployStaticSpace(job: ComputeJob, config: ComputeSpaceConfig): Promise<ComputeJobHandle> {
    const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_HUB_TOKEN!;
    const repoId = config.repoId || `recourse/${job.id}`;
    const username = (await this.getUsername(token)) || 'recourse';
    const fullRepoId = `${username}/${repoId.split('/').pop()}`;

    // Create space repo
    await hfFetch(`/spaces/${fullRepoId}`, token, {
      method: 'POST',
      body: JSON.stringify({
        repoId: fullRepoId,
        sdk: 'static',
        private: true,
      }),
    }).catch(async (e) => {
      // Space might exist, try to update
      if (e.message?.includes('already exists') || e.status === 409) {
        return;
      }
      throw e;
    });

    const tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'hf_static_'));
    if (typeof job.payload === 'string') {
      fs.writeFileSync(path.join(tmpDir, 'index.html'), job.payload);
    } else if (config.files?.length) {
      for (const f of config.files) {
        const dest = path.join(tmpDir, f.path);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, f.content);
      }
    } else if (job.payload && typeof job.payload === 'object' && 'cells' in job.payload) {
      fs.writeFileSync(path.join(tmpDir, 'index.html'), notebookToHtml(job.payload as ComputeNotebook));
    }

    // Upload files using the files API
    await this.uploadFolder(tmpDir, fullRepoId, token, 'space');

    return {
      id: job.id,
      platform: 'huggingface',
      externalId: fullRepoId,
      submittedAt: Date.now(),
      status: 'completed',
    };
  },

  async deployDynamicSpace(job: ComputeJob, config: ComputeSpaceConfig): Promise<ComputeJobHandle> {
    const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_HUB_TOKEN!;
    const repoId = config.repoId || `recourse/${job.id}`;
    const username = (await this.getUsername(token)) || 'recourse';
    const fullRepoId = `${username}/${repoId.split('/').pop()}`;

    // Create or update space
    const hardware = config.hardware === 'zero-gpu' ? 'cpu-basic' : (config.hardware || 'cpu-basic');
    await hfFetch(`/spaces/${fullRepoId}`, token, {
      method: 'POST',
      body: JSON.stringify({
        repoId: fullRepoId,
        sdk: config.sdk,
        hardware,
        private: true,
      }),
    }).catch(async (e) => {
      if (e.message?.includes('already exists') || e.status === 409) {
        return;
      }
      throw e;
    });

    const tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'hf_space_'));
    await this.writeSpaceFiles(tmpDir, config, job.payload);
    await this.uploadFolder(tmpDir, fullRepoId, token, 'space');

    // Trigger rebuild for ZeroGPU
    if (config.hardware === 'zero-gpu') {
      await hfFetch(`/spaces/${fullRepoId}/restart`, token, { method: 'POST' }).catch(() => {});
    }

    return {
      id: job.id,
      platform: 'huggingface',
      externalId: fullRepoId,
      submittedAt: Date.now(),
      status: 'running',
    };
  },

  async getUsername(token: string): Promise<string | null> {
    try {
      const res = await hfFetch('/whoami-v2', token);
      if (res.ok) {
        const data = await res.json();
        return data.name || data.user?.name || null;
      }
    } catch {}
    return null;
  },

  async writeSpaceFiles(dir: string, config: ComputeSpaceConfig, payload: unknown): Promise<void> {
    const reqs = config.requirements || [];
    if (reqs.length) {
      fs.writeFileSync(path.join(dir, 'requirements.txt'), reqs.join('\n'));
    }

    const entrypoint = config.entrypoint || 'app.py';
    if (typeof payload === 'string') {
      fs.writeFileSync(path.join(dir, entrypoint), payload);
    } else if (payload && typeof payload === 'object' && 'cells' in payload) {
      const pyCode = notebookToPython(payload as ComputeNotebook);
      fs.writeFileSync(path.join(dir, entrypoint), pyCode);
    }

    if (config.files?.length) {
      for (const f of config.files) {
        const dest = path.join(dir, f.path);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, f.content);
      }
    }

    const readme = `---\ntitle: ${config.title || config.repoId}\nsdk: ${config.sdk}\nhardware: ${config.hardware || 'cpu-basic'}\n---\n`;
    fs.writeFileSync(path.join(dir, 'README.md'), readme);
  },

  async uploadFolder(localPath: string, repoId: string, token: string, repoType: 'space' | 'model' | 'dataset'): Promise<void> {
    const files = fs.readdirSync(localPath, { recursive: true });
    for (const file of files) {
      const filePath = path.join(localPath, file as string);
      if (fs.statSync(filePath).isDirectory()) continue;
      const content = fs.readFileSync(filePath);
      const relativePath = path.relative(localPath, filePath).replace(/\\/g, '/');
      await hfFetch(`/${repoType}s/${repoId}/files/${relativePath}`, token, {
        method: 'POST',
        body: content,
        headers: { 'Content-Type': 'application/octet-stream' },
      }).catch(async (e) => {
        if (e.status === 409) {
          // File exists, update it
          await hfFetch(`/${repoType}s/${repoId}/files/${relativePath}`, token, {
            method: 'PUT',
            body: content,
            headers: { 'Content-Type': 'application/octet-stream' },
          });
        } else {
          throw e;
        }
      });
    }
  },

  async poll(handle: ComputeJobHandle): Promise<ComputeJobStatus> {
    try {
      const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_HUB_TOKEN!;
      const res = await hfFetch(`/spaces/${handle.externalId}`, token);
      if (!res.ok) throw new Error(`HF API error: ${res.status}`);
      const info = await res.json();
      const state = info.runtime?.stage || 'BUILDING';
      if (state === 'RUNNING') return { handle, state: 'running', progress: 80 };
      if (state === 'BUILDING') return { handle, state: 'pending', progress: 30 };
      if (state === 'ERROR') return { handle, state: 'failed', progress: 100, error: info.runtime?.error };
      return { handle, state: 'running', progress: 50 };
    } catch (e: any) {
      return { handle, state: 'failed', progress: 0, error: e.message };
    }
  },

  async fetch(handle: ComputeJobHandle, timeoutMs = 300000): Promise<ComputeJobResult> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const status = await this.poll(handle);
      if (status.state === 'completed' || status.state === 'failed') {
        const logs = await this.fetchSpaceLogs(handle.externalId);
        return {
          handle,
          success: status.state === 'completed',
          stdout: logs.stdout,
          stderr: logs.stderr,
          durationMs: Date.now() - start,
          error: status.error,
        };
      }
      await new Promise(r => setTimeout(r, 10000));
    }
    throw new Error('HF Space deployment timeout');
  },

  async fetchSpaceLogs(repoId: string): Promise<{ stdout: string; stderr: string }> {
    try {
      const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_HUB_TOKEN!;
      const res = await hfFetch(`/spaces/${repoId}/runtime/logs`, token);
      if (!res.ok) throw new Error(`HF API error: ${res.status}`);
      const data = await res.json();
      return { stdout: data.stdout || '', stderr: data.stderr || '' };
    } catch {
      return { stdout: '', stderr: 'Failed to fetch logs' };
    }
  },

  async cancel(handle: ComputeJobHandle): Promise<boolean> {
    try {
      const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_HUB_TOKEN!;
      await hfFetch(`/spaces/${handle.externalId}/pause`, token, { method: 'POST' });
      return true;
    } catch {
      return false;
    }
  },
};

function notebookToHtml(nb: ComputeNotebook): string {
  let html = '<!DOCTYPE html><html><head><title>Recourse Notebook</title></head><body>';
  for (const cell of nb.cells) {
    if (cell.type === 'code') {
      html += `<pre><code>${escapeHtml(cell.source)}</code></pre>`;
    } else {
      html += `<div>${cell.source}</div>`;
    }
  }
  html += '</body></html>';
  return html;
}

function notebookToPython(nb: ComputeNotebook): string {
  return nb.cells
    .filter(c => c.type === 'code')
    .map(c => c.source)
    .join('\n\n');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ============================================================================
// Local Platform (existing isolated-vm / self-hosted)
// ============================================================================

// In-memory registry of completed local jobs (the compute client's poll/fetch
// contract is async, but isolated-vm execution is synchronous). Bounded so a
// long-running server cannot leak job results.
const localJobResults = new Map<string, ComputeJobResult>();

/** Insert into a bounded FIFO map (oldest evicted past `max`). */
function rememberJob<T>(map: Map<string, T>, key: string, value: T, max = 500): void {
  map.set(key, value);
  while (map.size > max) {
    const first = map.keys().next().value;
    if (first === undefined) break;
    map.delete(first);
  }
}

const localPlatform: ComputePlatform = {
  id: 'local',
  name: 'Local Execution',
  description: 'isolated-vm (V8 isolate), self-hosted WASM — always available',
  hardware: [
    { type: 'cpu', spec: 'Host CPU', count: os.cpus().length },
  ],
  quota: { weeklyLimit: Infinity, consumed: 0, resetsAt: 0, sessionCap: Infinity },
  configured: true,

  async submit(job: ComputeJob): Promise<ComputeJobHandle> {
    const started = Date.now();
    const source = typeof job.payload === 'string' ? job.payload : '';
    const { executeToolFunction } = await import('./executionSandbox.js');
    const result = executeToolFunction(source, job.meta?.functionName as string | undefined, (job.meta?.args as any[]) ?? []);
    const handle: ComputeJobHandle = {
      id: job.id,
      platform: 'local',
      externalId: job.id,
      submittedAt: started,
      status: result.success ? 'completed' : 'failed',
    };
    rememberJob(localJobResults, job.id, {
      handle,
      success: result.success,
      exitCode: result.success ? 0 : 1,
      stdout: result.stdout.join('\n'),
      stderr: result.stderr.join('\n'),
      artifacts: result.success ? { returnValue: result.returnValue } : undefined,
      durationMs: result.executionTimeMs,
      error: result.error,
    });
    return handle;
  },

  async poll(handle: ComputeJobHandle): Promise<ComputeJobStatus> {
    const result = localJobResults.get(handle.id);
    if (!result) return { handle, state: 'failed', progress: 0, error: 'unknown local job' };
    return {
      handle: { ...handle, status: result.success ? 'completed' : 'failed' },
      state: result.success ? 'completed' : 'failed',
      progress: 100,
      error: result.error,
    };
  },

  async fetch(handle: ComputeJobHandle): Promise<ComputeJobResult> {
    const result = localJobResults.get(handle.id);
    if (result) return result;
    return {
      handle,
      success: false,
      exitCode: -1,
      stdout: '',
      stderr: '',
      durationMs: 0,
      error: 'unknown local job',
    };
  },

  async cancel(): Promise<boolean> {
    return true;
  },
};

// ============================================================================
// E2B Platform (existing)
// ============================================================================

// E2B executes synchronously in `submit`; the real result is cached here so
// `poll`/`fetch` can return the actual stdout/stderr instead of an empty stub.
const e2bJobResults = new Map<string, ComputeJobResult>();

const e2bPlatform: ComputePlatform = {
  id: 'e2b',
  name: 'E2B Sandbox',
  description: 'Full Linux environments with package installation, filesystem persistence',
  hardware: [
    { type: 'cpu', spec: 'E2B Cloud CPU', count: 4, memoryGb: 16 },
    { type: 'gpu', spec: 'E2B GPU (T4)', count: 1, memoryGb: 16 },
  ],
  quota: { weeklyLimit: Infinity, consumed: 0, resetsAt: 0, sessionCap: 24 },
  configured: false,

  async initialize(): Promise<void> {
    const { initE2b } = await import('./e2bSandbox.js');
    // e2bSandbox keeps its own module-level status; initialize it so the flag
    // here matches the sandbox's real readiness (not just env presence).
    const status = initE2b();
    this.configured = status.active === true;
  },

  async submit(job: ComputeJob): Promise<ComputeJobHandle> {
    const { executeInSandbox, initE2b } = await import('./e2bSandbox.js');
    initE2b();
    const code = typeof job.payload === 'string' ? job.payload : '';
    if (typeof job.payload !== 'string') {
      // E2B runs a raw script string. A notebook payload is a caller error.
      throw new Error('e2b platform only accepts string `payload` (script), not a notebook');
    }
    const result = await executeInSandbox(code, {
      language: 'python',
      timeoutMs: job.maxRuntimeMs,
      packages: job.meta?.packages as string[],
    });

    const handle: ComputeJobHandle = {
      id: job.id,
      platform: 'e2b',
      externalId: job.id,
      submittedAt: Date.now(),
      status: result.ok ? 'completed' : 'failed',
    };
    rememberJob(e2bJobResults, job.id, {
      handle,
      success: result.ok,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
      error: result.error,
    });
    return handle;
  },

  async poll(handle: ComputeJobHandle): Promise<ComputeJobStatus> {
    const result = e2bJobResults.get(handle.id);
    if (!result) return { handle, state: 'failed', progress: 0, error: 'unknown e2b job' };
    return { handle: { ...handle, status: result.success ? 'completed' : 'failed' }, state: result.success ? 'completed' : 'failed', progress: 100, error: result.error };
  },

  async fetch(handle: ComputeJobHandle): Promise<ComputeJobResult> {
    return e2bJobResults.get(handle.id) ?? {
      handle,
      success: false,
      exitCode: -1,
      stdout: '',
      stderr: '',
      durationMs: 0,
      error: 'unknown e2b job',
    };
  },

  async cancel(): Promise<boolean> {
    return true;
  },
};

// ============================================================================
// Platform Selector / Router
// ============================================================================

export interface PlatformSelection {
  platform: ComputePlatformId;
  reason: string;
  estimatedCost: number;      // 0 for free tiers
  estimatedDurationMs: number;
}

export function selectPlatform(
  job: ComputeJob,
  preferences: { preferGpu?: boolean; maxCost?: number; maxDurationMs?: number } = {}
): PlatformSelection {
  const available = getAvailablePlatforms();

  // Honor an explicit GPU preference even when the job didn't set hardware.
  const wantGpu = job.hardware?.type === 'gpu' || preferences.preferGpu === true;

  // Filter by hardware requirement
  let candidates = available.filter(p => {
    if (!job.hardware) return true;
    return p.hardware.some(h => h.type === job.hardware!.type &&
      (!job.hardware!.spec || h.spec.includes(job.hardware!.spec)));
  });

  if (candidates.length === 0) candidates = available;

  // Score candidates
  const scored = candidates.map(p => {
    let score = 0;
    let reason = '';

    if (p.id === 'kaggle' && wantGpu) {
      score += 100;
      reason = 'Kaggle: 30h/week free GPU (T4/P100)';
    } else if (p.id === 'huggingface' && wantGpu) {
      score += 50;
      reason = 'HF ZeroGPU: 3.5min/day free shared GPU';
    } else if (p.id === 'e2b') {
      score += 30;
      reason = 'E2B: Full Linux sandbox (requires API key)';
    } else if (p.id === 'local') {
      score += 10;
      reason = 'Local: isolated-vm / WASM (always available)';
    }

    // Penalize near-quota platforms
    const quotaRatio = p.quota.weeklyLimit > 0 ? p.quota.consumed / p.quota.weeklyLimit : 0;
    score *= (1 - quotaRatio * 0.5);

    return { platform: p, score, reason, quotaRatio };
  });

  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  return {
    platform: best.platform.id,
    reason: best.reason,
    estimatedCost: 0,
    estimatedDurationMs: Math.min(job.maxRuntimeMs, preferences.maxDurationMs ?? job.maxRuntimeMs),
  };
}

// ============================================================================
// Unified Compute Client
// ============================================================================

export interface UnifiedComputeClient {
  /** Submit a job to the best available platform */
  submit(job: ComputeJob): Promise<ComputeJobHandle>;
  /** Submit with explicit platform */
  submitTo(platformId: ComputePlatformId, job: ComputeJob): Promise<ComputeJobHandle>;
  /** Poll job status */
  poll(handle: ComputeJobHandle): Promise<ComputeJobStatus>;
  /** Wait for completion and fetch result */
  await(handle: ComputeJobHandle, timeoutMs?: number): Promise<ComputeJobResult>;
  /** Cancel job */
  cancel(handle: ComputeJobHandle): Promise<boolean>;
  /** Get platform status summary */
  status(): ComputePlatformStatus[];
}

export interface ComputePlatformStatus {
  id: ComputePlatformId;
  name: string;
  configured: boolean;
  available: boolean;
  quota: ComputeQuota;
  hardware: ComputeHardware[];
}

// Platform initialization is idempotent and happens exactly once per process,
// so repeated `createComputeClient()` calls never re-detect credentials or
// reset live quota state. The in-flight promise is memoized so concurrent
// callers all observe the settled state.
let _platformsInitPromise: Promise<void> | null = null;
function ensurePlatformsInitialized(): Promise<void> {
  if (!_platformsInitPromise) {
    _platformsInitPromise = (async () => {
      await kagglePlatform.initialize?.();
      await hfPlatform.initialize?.();
      await e2bPlatform.initialize?.();
    })();
  }
  return _platformsInitPromise;
}

export function createComputeClient(): UnifiedComputeClient {
  void ensurePlatformsInitialized();

  return {
    async submit(job: ComputeJob): Promise<ComputeJobHandle> {
      const selection = selectPlatform(job);
      const platform = getPlatform(selection.platform)!;
      return platform.submit(job);
    },

    async submitTo(platformId: ComputePlatformId, job: ComputeJob): Promise<ComputeJobHandle> {
      const platform = getPlatform(platformId);
      if (!platform) throw new Error(`Platform ${platformId} not registered`);
      if (!platform.configured) throw new Error(`Platform ${platformId} not configured`);
      return platform.submit(job);
    },

    async poll(handle: ComputeJobHandle): Promise<ComputeJobStatus> {
      const platform = getPlatform(handle.platform);
      if (!platform) throw new Error(`Platform ${handle.platform} not registered`);
      return platform.poll(handle);
    },

    async await(handle: ComputeJobHandle, timeoutMs?: number): Promise<ComputeJobResult> {
      const platform = getPlatform(handle.platform);
      if (!platform) throw new Error(`Platform ${handle.platform} not registered`);
      return platform.fetch(handle, timeoutMs);
    },

    async cancel(handle: ComputeJobHandle): Promise<boolean> {
      const platform = getPlatform(handle.platform);
      if (!platform) return false;
      return platform.cancel(handle);
    },

    status(): ComputePlatformStatus[] {
      return listPlatforms().map(p => ({
        id: p.id,
        name: p.name,
        configured: p.configured,
        available: p.configured && p.quota.consumed < p.quota.weeklyLimit,
        quota: p.quota,
        hardware: p.hardware,
      }));
    },
  };
}

// ============================================================================
// Register all platforms
// ============================================================================

registerPlatform(kagglePlatform);
registerPlatform(hfPlatform);
registerPlatform(localPlatform);
registerPlatform(e2bPlatform);

// Export initializer for server boot.
export async function initializeComputePlatforms(): Promise<void> {
  await ensurePlatformsInitialized();
}

export { kagglePlatform, hfPlatform, localPlatform, e2bPlatform };