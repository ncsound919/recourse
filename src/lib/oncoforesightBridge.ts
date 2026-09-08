/**
 * OncoForesight bridge — stateless HTTP client for the OncoForesight Next
 * app (`components/OncoForesight`, pm2 "onco-foresight", :8095 — the old
 * :3000 default collided with Keywire's SPA).
 *
 * OncoForesight is an EXTERNAL process (default http://127.0.0.1:8095).
 * This module never owns its data and never invents clinical output: every
 * fetch is guarded by a timeout and returns `ok:false` with the underlying
 * error when the app is down or rejects, mirroring the honesty contract in
 * `src/lib/prometheusBridge.ts`.
 *
 * Route convention:
 *   GET  {base}/api/patients
 *   GET  {base}/api/backtest[?query]
 *   GET  {base}/api/evidence
 *   POST {base}/api/simulate
 *   POST {base}/api/resistance
 *   POST {base}/api/toxicity
 *   POST {base}/api/remission
 *   POST {base}/api/narrative
 *
 * POST bodies are passed through verbatim — request schemas live upstream.
 *
 * Env: ONCOFORESIGHT_URL (default http://127.0.0.1:8095).
 */

export const ONCOFORESIGHT_DEFAULT_URL =
  process.env.ONCOFORESIGHT_URL || 'http://127.0.0.1:8095';

export interface ForesightBridgeResult {
  ok: boolean;
  /** Raw payload when the app answered (parsed JSON). */
  data?: unknown;
  error?: string;
  latencyMs: number;
}

function stripBase(base: string): string {
  return base.replace(/\/$/, '');
}

async function getJson(path: string, base: string, timeoutMs: number): Promise<ForesightBridgeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`${stripBase(base)}${path}`, { signal: controller.signal });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { ok: false, latencyMs, error: `oncoforesight HTTP ${res.status}` };
    }
    const data: unknown = await res.json();
    return { ok: true, data, latencyMs };
  } catch (err: unknown) {
    const latencyMs = Date.now() - started;
    const msg = err instanceof Error ? err.message : 'oncoforesight unreachable';
    const timedOut = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      latencyMs,
      error: timedOut ? `oncoforesight timed out after ${timeoutMs}ms` : msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function postJson(
  path: string,
  body: Record<string, unknown>,
  base: string,
  timeoutMs: number,
): Promise<ForesightBridgeResult> {
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
      return { ok: false, latencyMs, error: `oncoforesight HTTP ${res.status}` };
    }
    const data: unknown = await res.json();
    return { ok: true, data, latencyMs };
  } catch (err: unknown) {
    const latencyMs = Date.now() - started;
    const msg = err instanceof Error ? err.message : 'oncoforesight unreachable';
    const timedOut = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      latencyMs,
      error: timedOut ? `oncoforesight timed out after ${timeoutMs}ms` : msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Online check via GET /api/patients.
 * Guarded: timeout via AbortController, non-2xx → ok:false,
 * network error → ok:false. NEVER throws and NEVER fabricates.
 */
export async function foresightStatus(
  base: string = ONCOFORESIGHT_DEFAULT_URL,
  timeoutMs = 10000,
): Promise<ForesightBridgeResult> {
  return getJson('/api/patients', base, timeoutMs);
}

/**
 * POST /api/simulate. Body passed through verbatim (schema lives upstream).
 * Guarded, never throws, never fabricates.
 */
export async function foresightSimulate(
  body: Record<string, unknown>,
  base: string = ONCOFORESIGHT_DEFAULT_URL,
  timeoutMs = 60000,
): Promise<ForesightBridgeResult> {
  return postJson('/api/simulate', body, base, timeoutMs);
}

/**
 * POST /api/resistance. Body passed through verbatim (schema lives upstream).
 * Guarded, never throws, never fabricates.
 */
export async function foresightResistance(
  body: Record<string, unknown>,
  base: string = ONCOFORESIGHT_DEFAULT_URL,
  timeoutMs = 60000,
): Promise<ForesightBridgeResult> {
  return postJson('/api/resistance', body, base, timeoutMs);
}

/**
 * POST /api/toxicity. Body passed through verbatim (schema lives upstream).
 * Guarded, never throws, never fabricates.
 */
export async function foresightToxicity(
  body: Record<string, unknown>,
  base: string = ONCOFORESIGHT_DEFAULT_URL,
  timeoutMs = 60000,
): Promise<ForesightBridgeResult> {
  return postJson('/api/toxicity', body, base, timeoutMs);
}

/**
 * POST /api/remission. Body passed through verbatim (schema lives upstream).
 * Guarded, never throws, never fabricates.
 */
export async function foresightRemission(
  body: Record<string, unknown>,
  base: string = ONCOFORESIGHT_DEFAULT_URL,
  timeoutMs = 60000,
): Promise<ForesightBridgeResult> {
  return postJson('/api/remission', body, base, timeoutMs);
}

/**
 * GET /api/backtest[?query]. When `query` is supplied it is appended as the
 * raw query string (a leading `?` is optional). Guarded, never throws,
 * never fabricates.
 */
export async function foresightBacktest(
  query = '',
  base: string = ONCOFORESIGHT_DEFAULT_URL,
  timeoutMs = 60000,
): Promise<ForesightBridgeResult> {
  const suffix = !query ? '' : query.startsWith('?') ? query : `?${query}`;
  return getJson(`/api/backtest${suffix}`, base, timeoutMs);
}
