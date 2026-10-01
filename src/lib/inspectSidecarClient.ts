// src/lib/inspectSidecarClient.ts
//
// Inspect sidecar client — capability evaluation harness.
// Stateless HTTP service; honest when unavailable.

export const INSPECT_SIDECAR_DEFAULT_URL = process.env.INSPECT_SIDECAR_URL || 'http://127.0.0.1:8810';

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

export async function inspectSidecarHealth(base = INSPECT_SIDECAR_DEFAULT_URL, timeoutMs = 2000): Promise<InspectHealthResult> {
  return getInspect<InspectHealthResult>('/health', base, timeoutMs);
}

export async function inspectEval(
  evalName: string,
  opts: { model?: string; samples?: number; timeoutMs?: number; base?: string } = {},
): Promise<InspectEvalResult> {
  const { model, samples, timeoutMs = 15000, base = INSPECT_SIDECAR_DEFAULT_URL } = opts;
  return postInspect<InspectEvalResult>('/inspect/eval', { eval_name: evalName, model, samples }, base, timeoutMs);
}

export async function inspectScore(
  evalName: string,
  responses: unknown[],
  opts: { timeoutMs?: number; base?: string } = {},
): Promise<InspectScoreResult> {
  const { timeoutMs = 10000, base = INSPECT_SIDECAR_DEFAULT_URL } = opts;
  return postInspect<InspectScoreResult>('/inspect/score', { eval_name: evalName, responses }, base, timeoutMs);
}
