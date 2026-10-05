// src/lib/inspectSidecarClient.ts
//
// Inspect sidecar client — capability evaluation harness.
// Stateless HTTP service; honest when unavailable.

/**
 * Env var naming the Inspect sidecar. There is deliberately NO default URL.
 *
 * This client previously defaulted to `http://127.0.0.1:8810`, which
 * `python/trend_service/main.py:387` actually binds. Wiring it into a health
 * route with that default would have probed the TREND service and reported it as
 * the inspect service. An unset env var now means "not configured".
 */
export const INSPECT_SIDECAR_ENV = 'INSPECT_SIDECAR_URL';

/** The configured sidecar base URL, or null when it is not configured. */
export function inspectSidecarBase(explicit?: string): string | null {
  const url = explicit ?? process.env[INSPECT_SIDECAR_ENV];
  if (!url || url.trim() === '') return null;
  return url.trim();
}

const NOT_CONFIGURED = { ok: false, error: `${INSPECT_SIDECAR_ENV} is not set — inspect sidecar not configured` } as const;

export interface InspectHealthResult {
  ok: boolean;
  service?: string;
  inspect_available?: boolean;
  error?: string;
}

export interface InspectEvalResult {
  ok: boolean;
  eval_name?: string;
  model?: string;
  samples?: number;
  results?: {
    status: string;
    note?: string;
  };
  error?: string;
}

export interface InspectScoreResult {
  ok: boolean;
  eval_name?: string;
  response_count?: number;
  scores?: {
    status: string;
    note?: string;
  };
  error?: string;
}

async function postInspect<T>(path: string, body: unknown, base: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, error: `inspect sidecar HTTP ${res.status}` } as T;
    }
    return (await res.json()) as T;
  } catch (err: any) {
    return { ok: false, error: err?.name === 'AbortError' ? `inspect sidecar timed out after ${timeoutMs}ms` : err?.message || 'inspect sidecar unreachable' } as T;
  } finally {
    clearTimeout(timer);
  }
}

async function getInspect<T>(path: string, base: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}${path}`, { signal: controller.signal });
    if (!res.ok) return { ok: false, error: `inspect sidecar HTTP ${res.status}` } as T;
    return (await res.json()) as T;
  } catch (err: any) {
    return { ok: false, error: err?.name === 'AbortError' ? `inspect sidecar timed out after ${timeoutMs}ms` : err?.message || 'inspect sidecar unreachable' } as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function inspectSidecarHealth(base?: string, timeoutMs = 2000): Promise<InspectHealthResult> {
  const resolved = inspectSidecarBase(base);
  if (!resolved) return { ...NOT_CONFIGURED };
  return getInspect<InspectHealthResult>('/health', resolved, timeoutMs);
}

export async function inspectEval(
  evalName: string,
  opts: { model?: string; samples?: number; timeoutMs?: number; base?: string } = {},
): Promise<InspectEvalResult> {
  const { model, samples, timeoutMs = 15000 } = opts;
  const resolved = inspectSidecarBase(opts.base);
  if (!resolved) return { ...NOT_CONFIGURED };
  return postInspect<InspectEvalResult>('/inspect/eval', { eval_name: evalName, model, samples }, resolved, timeoutMs);
}

export async function inspectScore(
  evalName: string,
  responses: unknown[],
  opts: { timeoutMs?: number; base?: string } = {},
): Promise<InspectScoreResult> {
  const { timeoutMs = 10000 } = opts;
  const resolved = inspectSidecarBase(opts.base);
  if (!resolved) return { ...NOT_CONFIGURED };
  return postInspect<InspectScoreResult>('/inspect/score', { eval_name: evalName, responses }, resolved, timeoutMs);
}
