/**
 * Biotech scientific_api bridge — stateless HTTP client for the Biotech
 * scientific_api FastAPI service (`scientific_api.py`, port 8090).
 *
 * The scientific_api service is an EXTERNAL process (default
 * http://127.0.0.1:8090). This module never owns its data and never invents
 * results: every fetch is guarded by a timeout and returns `ok:false`
 * with the underlying error when the service is down or rejects, mirroring
 * the honesty contract in `src/lib/kgSidecarClient.ts` and
 * `src/lib/prometheusBridge.ts`.
 *
 * Env: SCIENTIFIC_API_URL (default http://127.0.0.1:8090).
 */

export const SCIENTIFIC_API_DEFAULT_URL =
  process.env.SCIENTIFIC_API_URL || 'http://127.0.0.1:8090';

export interface ScientificHealthResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  latencyMs: number;
}

export interface ScientificApiResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  latencyMs: number;
}

function baseUrl(base: string): string {
  return base.replace(/\/$/, '');
}

interface RawCall {
  ok: boolean;
  status: number;
  data: unknown | null;
  error?: string;
  latencyMs: number;
}

async function getJson(
  path: string,
  base: string,
  timeoutMs: number,
  label: string,
): Promise<RawCall> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`${baseUrl(base)}${path}`, { signal: controller.signal });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { ok: false, status: res.status, data: null, latencyMs, error: `${label} HTTP ${res.status}` };
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return { ok: false, status: res.status, data: null, latencyMs, error: `${label} invalid JSON` };
    }
    return { ok: true, status: res.status, data, latencyMs };
  } catch (err: unknown) {
    const latencyMs = Date.now() - started;
    const timedOut = err instanceof Error && err.name === 'AbortError';
    const msg = err instanceof Error ? err.message : `${label} unreachable`;
    return {
      ok: false,
      status: 0,
      data: null,
      latencyMs,
      error: timedOut ? `${label} timed out after ${timeoutMs}ms` : msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function postJson(
  path: string,
  body: unknown,
  base: string,
  timeoutMs: number,
  label: string,
): Promise<RawCall> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`${baseUrl(base)}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { ok: false, status: res.status, data: null, latencyMs, error: `${label} HTTP ${res.status}` };
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return { ok: false, status: res.status, data: null, latencyMs, error: `${label} invalid JSON` };
    }
    return { ok: true, status: res.status, data, latencyMs };
  } catch (err: unknown) {
    const latencyMs = Date.now() - started;
    const timedOut = err instanceof Error && err.name === 'AbortError';
    const msg = err instanceof Error ? err.message : `${label} unreachable`;
    return {
      ok: false,
      status: 0,
      data: null,
      latencyMs,
      error: timedOut ? `${label} timed out after ${timeoutMs}ms` : msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

function toResult(call: RawCall): ScientificApiResult {
  if (!call.ok) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  return { ok: true, data: call.data, latencyMs: call.latencyMs };
}

/**
 * GET / — health probe. Non-2xx → ok:false. NEVER throws and NEVER
 * fabricates health status.
 */
export async function scientificHealth(
  base: string = SCIENTIFIC_API_DEFAULT_URL,
  timeoutMs = 5000,
): Promise<ScientificHealthResult> {
  return toResult(await getJson('/', base, timeoutMs, 'scientific_api health'));
}

/**
 * POST /api/v1/biology/dna/analyze {sequence}. Guarded, never fabricates.
 */
export async function dnaAnalyze(
  sequence: string,
  base: string = SCIENTIFIC_API_DEFAULT_URL,
  timeoutMs = 10000,
): Promise<ScientificApiResult> {
  return toResult(
    await postJson('/api/v1/biology/dna/analyze', { sequence }, base, timeoutMs, 'scientific_api dna/analyze'),
  );
}

/**
 * POST /api/v1/protein/analyze {sequence}. Guarded, never fabricates.
 */
export async function proteinAnalyze(
  sequence: string,
  base: string = SCIENTIFIC_API_DEFAULT_URL,
  timeoutMs = 10000,
): Promise<ScientificApiResult> {
  return toResult(
    await postJson('/api/v1/protein/analyze', { sequence }, base, timeoutMs, 'scientific_api protein/analyze'),
  );
}

/**
 * GET /api/v1/database/genes/{symbol}, falling back to
 * /api/v1/database/gene/{symbol} on 404. Returns ok:false if both fail.
 * NEVER throws and NEVER fabricates a gene record.
 */
export async function geneLookup(
  symbol: string,
  base: string = SCIENTIFIC_API_DEFAULT_URL,
  timeoutMs = 10000,
): Promise<ScientificApiResult> {
  const encoded = encodeURIComponent(symbol);
  const first = await getJson(`/api/v1/database/genes/${encoded}`, base, timeoutMs, 'scientific_api geneLookup');
  if (first.ok) return toResult(first);
  if (first.status !== 404) return toResult(first);
  const second = await getJson(`/api/v1/database/gene/${encoded}`, base, timeoutMs, 'scientific_api geneLookup');
  return toResult(second);
}

/**
 * POST /api/v1/stats/ttest {a, b}. Guarded, never fabricates.
 */
export async function statsTTest(
  a: number[],
  b: number[],
  base: string = SCIENTIFIC_API_DEFAULT_URL,
  timeoutMs = 10000,
): Promise<ScientificApiResult> {
  return toResult(
    await postJson('/api/v1/stats/ttest', { a, b }, base, timeoutMs, 'scientific_api stats/ttest'),
  );
}
