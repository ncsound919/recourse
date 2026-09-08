/**
 * BioSim-Fusion protein folding bridge — stateless HTTP client for the
 * BioSim-Fusion FastAPI engine.
 *
 * BioSim-Fusion is an EXTERNAL process (default http://127.0.0.1:8000;
 * see `biosim_fusion/api/main.py`). This module never owns its data and
 * never invents structures: every fetch is guarded by a timeout and
 * returns `ok:false` with the underlying error when the engine is down
 * or rejects, mirroring the honesty contract in
 * `src/lib/prometheusBridge.ts`.
 *
 * Route convention (from `biosim_fusion/api/main.py`):
 *   GET  {base}/          — API info
 *   GET  {base}/health    — health check
 *   POST {base}/v1/fold   — FoldRequest{fastas[1..100], mode, cores,
 *                            quantum_shots, alpha_start/end} → FoldResponse
 *   GET  {base}/v1/run/{run_id} — FoldResponse for one run
 *   GET  {base}/v1/runs   — `{ runs, count }` envelope
 *
 * Env: FOLDING_URL (default http://127.0.0.1:8000).
 */

export const FOLDING_DEFAULT_URL =
  process.env.FOLDING_URL || 'http://127.0.0.1:8000';

export type FoldMode = 'quantum' | 'cpu' | 'hybrid';
export type FoldRunStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface FoldSubmitInput {
  fastas: string[];
  mode?: FoldMode;
  cores?: number;
  quantum_shots?: number;
}

export interface FoldPdbResult {
  sequence: string;
  pdb: string;
  rmsd: number | null;
  mode_used: string;
  shots_used: number | null;
}

export interface FoldRunData {
  run_id: string;
  status: string;
  pdbs: FoldPdbResult[];
  rmsds: number[];
  shots: number | null;
  time: string | null;
  error: string | null;
}

export interface FoldingResult {
  ok: boolean;
  /** Raw payload when the engine answered (parsed JSON). */
  data?: unknown;
  error?: string;
  latencyMs: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function normalizeBase(base: string): string {
  return base.replace(/\/$/, '');
}

function timeoutError(timeoutMs: number): string {
  return `folding engine timed out after ${timeoutMs}ms`;
}

/**
 * Validate a fold submission client-side (mirrors FoldRequest bounds in
 * `biosim_fusion/models/schemas.py`). Invalid input → error string, never
 * thrown; valid input → null. The server remains the authority — this only
 * avoids a wasted round-trip and keeps failures in the ok:false channel.
 */
function validateFoldInput(input: FoldSubmitInput): string | null {
  if (!input || !Array.isArray(input.fastas)) {
    return 'fastas must be an array of 1..100 sequences';
  }
  if (input.fastas.length < 1 || input.fastas.length > 100) {
    return `fastas must contain 1..100 sequences (got ${input.fastas.length})`;
  }
  for (const seq of input.fastas) {
    if (typeof seq !== 'string' || seq.length < 3) {
      return 'each FASTA sequence must be a string of at least 3 amino acids';
    }
  }
  if (
    input.mode !== undefined &&
    input.mode !== 'quantum' &&
    input.mode !== 'cpu' &&
    input.mode !== 'hybrid'
  ) {
    return `mode must be quantum|cpu|hybrid (got "${String(input.mode)}")`;
  }
  if (
    input.cores !== undefined &&
    (!Number.isInteger(input.cores) || input.cores < 1 || input.cores > 128)
  ) {
    return `cores must be an integer 1..128 (got ${String(input.cores)})`;
  }
  if (
    input.quantum_shots !== undefined &&
    (!Number.isInteger(input.quantum_shots) ||
      input.quantum_shots < 10 ||
      input.quantum_shots > 1000)
  ) {
    return `quantum_shots must be an integer 10..1000 (got ${String(input.quantum_shots)})`;
  }
  return null;
}

interface GuardedFetch {
  ok: boolean;
  status: number;
  data: unknown;
  error: string | null;
  timedOut: boolean;
}

/**
 * Single guarded fetch: timeout via AbortController, body parsed as JSON
 * (falling back to text when the payload is not JSON). NEVER throws.
 */
async function guardedFetchJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<GuardedFetch> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      try {
        data = await res.text();
      } catch {
        data = null;
      }
    }
    return { ok: res.ok, status: res.status, data, error: null, timedOut: false };
  } catch (err: unknown) {
    const timedOut = err instanceof Error && err.name === 'AbortError';
    const msg = err instanceof Error ? err.message : 'folding engine unreachable';
    return { ok: false, status: 0, data: null, error: msg, timedOut };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Health check for the BioSim-Fusion engine. Guarded: timeout, non-2xx →
 * ok:false. NEVER throws and NEVER fabricates a healthy status.
 */
export async function foldingHealth(
  base: string = FOLDING_DEFAULT_URL,
  timeoutMs = 10000,
): Promise<FoldingResult> {
  const started = Date.now();
  const res = await guardedFetchJson(
    `${normalizeBase(base)}/health`,
    {},
    timeoutMs,
  );
  const latencyMs = Date.now() - started;
  if (res.timedOut) return { ok: false, latencyMs, error: timeoutError(timeoutMs) };
  if (res.error !== null) return { ok: false, latencyMs, error: res.error };
  if (!res.ok) return { ok: false, latencyMs, error: `folding HTTP ${res.status}` };
  return { ok: true, data: res.data, latencyMs };
}

/**
 * Submit a folding job. Client-side bounds are checked first (ok:false on
 * violation); the request is then guarded like every other call. NEVER
 * throws and NEVER fabricates a run_id — the run_id only ever comes from
 * the engine's FoldResponse.
 */
export async function submitFold(
  input: FoldSubmitInput,
  base: string = FOLDING_DEFAULT_URL,
  timeoutMs = 60000,
): Promise<FoldingResult> {
  const started = Date.now();
  const validation = validateFoldInput(input);
  if (validation !== null) {
    return { ok: false, latencyMs: Date.now() - started, error: validation };
  }
  const body: Record<string, unknown> = { fastas: input.fastas };
  if (input.mode !== undefined) body.mode = input.mode;
  if (input.cores !== undefined) body.cores = input.cores;
  if (input.quantum_shots !== undefined) body.quantum_shots = input.quantum_shots;
  const res = await guardedFetchJson(
    `${normalizeBase(base)}/v1/fold`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    timeoutMs,
  );
  const latencyMs = Date.now() - started;
  if (res.timedOut) return { ok: false, latencyMs, error: timeoutError(timeoutMs) };
  if (res.error !== null) return { ok: false, latencyMs, error: res.error };
  if (!res.ok) {
    const detail =
      isRecord(res.data) && typeof res.data.detail === 'string'
        ? `: ${res.data.detail}`
        : '';
    return { ok: false, latencyMs, error: `folding HTTP ${res.status}${detail}` };
  }
  return { ok: true, data: res.data, latencyMs };
}

/**
 * Fetch one folding run by id. Guarded: timeout, non-2xx (including 404
 * for an unknown run) → ok:false. NEVER throws and NEVER fabricates
 * structures — a missing run is an error, not an empty FoldResponse.
 */
export async function getFoldRun(
  runId: string,
  base: string = FOLDING_DEFAULT_URL,
  timeoutMs = 10000,
): Promise<FoldingResult> {
  const started = Date.now();
  if (typeof runId !== 'string' || runId.trim().length === 0) {
    return { ok: false, latencyMs: Date.now() - started, error: 'runId must be a non-empty string' };
  }
  const res = await guardedFetchJson(
    `${normalizeBase(base)}/v1/run/${encodeURIComponent(runId.trim())}`,
    {},
    timeoutMs,
  );
  const latencyMs = Date.now() - started;
  if (res.timedOut) return { ok: false, latencyMs, error: timeoutError(timeoutMs) };
  if (res.error !== null) return { ok: false, latencyMs, error: res.error };
  if (!res.ok) return { ok: false, latencyMs, error: `folding HTTP ${res.status}` };
  return { ok: true, data: res.data, latencyMs };
}

/**
 * List recent folding runs (`{ runs, count }` envelope). Guarded like the
 * rest. NEVER throws and NEVER fabricates runs — down engine → ok:false.
 */
export async function listFoldRuns(
  base: string = FOLDING_DEFAULT_URL,
  timeoutMs = 10000,
): Promise<FoldingResult> {
  const started = Date.now();
  const res = await guardedFetchJson(
    `${normalizeBase(base)}/v1/runs`,
    {},
    timeoutMs,
  );
  const latencyMs = Date.now() - started;
  if (res.timedOut) return { ok: false, latencyMs, error: timeoutError(timeoutMs) };
  if (res.error !== null) return { ok: false, latencyMs, error: res.error };
  if (!res.ok) return { ok: false, latencyMs, error: `folding HTTP ${res.status}` };
  return { ok: true, data: res.data, latencyMs };
}
