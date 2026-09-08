/**
 * UMOE engine bridge — stateless HTTP client for the UMOE service
 * (`components/UMOE/umoe/service.py`, stdlib http.server).
 *
 * The UMOE service is an EXTERNAL process (default
 * http://127.0.0.1:8723). This module never owns its data and never invents
 * predictions: every fetch is guarded by a timeout and returns `ok:false`
 * with the underlying error when the service is down or rejects, mirroring
 * the honesty contract in `src/lib/prometheusBridge.ts`.
 *
 * Route convention:
 *   GET  {base}/health                  → { status, version, engines, workflows }
 *   GET  {base}/workflows
 *   GET  {base}/predictions/{tumor_id}
 *   GET  {base}/fields/{tumor_id}
 *   GET  {base}/network/{tumor_id}
 *   POST {base}/run                     → { workflow_id, tumor_id, therapies, mode, params, seed }
 *   POST {base}/register_workflow       → { workflow }
 *
 * Env: UMOE_URL (default http://127.0.0.1:8723).
 */

export const UMOE_DEFAULT_URL =
  process.env.UMOE_URL || 'http://127.0.0.1:8723';

export interface UmoeBridgeResult {
  ok: boolean;
  /** Raw payload when the service answered (parsed JSON). */
  data?: unknown;
  error?: string;
  latencyMs: number;
}

export interface UmoeRunInput {
  tumor_id: string;
  workflow_id?: string;
  therapies?: unknown;
  mode?: string;
  params?: Record<string, unknown>;
  seed?: number;
}

function stripBase(base: string): string {
  return base.replace(/\/$/, '');
}

async function getJson(path: string, base: string, timeoutMs: number, label: string): Promise<UmoeBridgeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`${stripBase(base)}${path}`, { signal: controller.signal });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { ok: false, latencyMs, error: `${label} HTTP ${res.status}` };
    }
    const data: unknown = await res.json();
    return { ok: true, data, latencyMs };
  } catch (err: unknown) {
    const latencyMs = Date.now() - started;
    const msg = err instanceof Error ? err.message : 'umoe unreachable';
    const timedOut = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      latencyMs,
      error: timedOut ? `umoe timed out after ${timeoutMs}ms` : msg,
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
): Promise<UmoeBridgeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`${stripBase(base)}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { ok: false, latencyMs, error: `${label} HTTP ${res.status}` };
    }
    const data: unknown = await res.json();
    return { ok: true, data, latencyMs };
  } catch (err: unknown) {
    const latencyMs = Date.now() - started;
    const msg = err instanceof Error ? err.message : 'umoe unreachable';
    const timedOut = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      latencyMs,
      error: timedOut ? `umoe timed out after ${timeoutMs}ms` : msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET /health → { status, version, engines, workflows }.
 * Guarded: timeout via AbortController, non-2xx → ok:false,
 * network error → ok:false. NEVER throws and NEVER fabricates.
 */
export async function umoeHealth(
  base: string = UMOE_DEFAULT_URL,
  timeoutMs = 10000,
): Promise<UmoeBridgeResult> {
  return getJson('/health', base, timeoutMs, 'umoe');
}

/**
 * GET /workflows. Guarded, never throws, never fabricates.
 */
export async function umoeWorkflows(
  base: string = UMOE_DEFAULT_URL,
  timeoutMs = 10000,
): Promise<UmoeBridgeResult> {
  return getJson('/workflows', base, timeoutMs, 'umoe');
}

/**
 * GET /predictions/{tumor_id}. Guarded, never throws, never fabricates.
 */
export async function umoePredictions(
  tumorId: string,
  base: string = UMOE_DEFAULT_URL,
  timeoutMs = 10000,
): Promise<UmoeBridgeResult> {
  if (!tumorId || !tumorId.trim()) {
    return { ok: false, latencyMs: 0, error: 'umoe predictions requires a tumor id' };
  }
  return getJson(`/predictions/${encodeURIComponent(tumorId)}`, base, timeoutMs, 'umoe');
}

/**
 * GET /fields/{tumor_id}. Guarded, never throws, never fabricates.
 */
export async function umoeFields(
  tumorId: string,
  base: string = UMOE_DEFAULT_URL,
  timeoutMs = 10000,
): Promise<UmoeBridgeResult> {
  if (!tumorId || !tumorId.trim()) {
    return { ok: false, latencyMs: 0, error: 'umoe fields requires a tumor id' };
  }
  return getJson(`/fields/${encodeURIComponent(tumorId)}`, base, timeoutMs, 'umoe');
}

/**
 * GET /network/{tumor_id}. Guarded, never throws, never fabricates.
 */
export async function umoeNetwork(
  tumorId: string,
  base: string = UMOE_DEFAULT_URL,
  timeoutMs = 10000,
): Promise<UmoeBridgeResult> {
  if (!tumorId || !tumorId.trim()) {
    return { ok: false, latencyMs: 0, error: 'umoe network requires a tumor id' };
  }
  return getJson(`/network/${encodeURIComponent(tumorId)}`, base, timeoutMs, 'umoe');
}

/**
 * POST /run with { workflow_id, tumor_id, therapies, mode, params, seed }.
 * Runs can take a while, so the default timeout is 60s.
 * Guarded: timeout via AbortController, non-2xx → ok:false,
 * network error → ok:false. NEVER throws and NEVER fabricates results.
 */
export async function umoeRun(
  input: UmoeRunInput,
  base: string = UMOE_DEFAULT_URL,
  timeoutMs = 60000,
): Promise<UmoeBridgeResult> {
  if (!input || !input.tumor_id || !input.tumor_id.trim()) {
    return { ok: false, latencyMs: 0, error: 'umoe run requires tumor_id' };
  }
  return postJson('/run', input, base, timeoutMs, 'umoe');
}
