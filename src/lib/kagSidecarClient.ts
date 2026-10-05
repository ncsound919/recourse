// src/lib/kagSidecarClient.ts
//
// KAG sidecar client — logical-form-guided reasoning over Neo4j KG.
// Stateless HTTP service; honest when unavailable.

/**
 * Env var naming the KAG sidecar. There is deliberately NO default URL.
 *
 * This client previously defaulted to `http://127.0.0.1:8800`, which is the
 * contested port that `python/trend_service/main.py:22-27` names as the cause of
 * three services once claiming 8800. With a default in place, wiring this client
 * into a health route would have probed 8800 and reported whatever answered —
 * the exact "health endpoint reported ONLINE for an unrelated service" failure.
 * An unset env var now means "not configured", which is reported as such.
 */
export const KAG_SIDECAR_ENV = 'KAG_SIDECAR_URL';

/** The configured sidecar base URL, or null when it is not configured. */
export function kagSidecarBase(explicit?: string): string | null {
  const url = explicit ?? process.env[KAG_SIDECAR_ENV];
  if (!url || url.trim() === '') return null;
  return url.trim();
}

const NOT_CONFIGURED = { ok: false, error: `${KAG_SIDECAR_ENV} is not set — KAG sidecar not configured` } as const;

export interface KagHealthResult {
  ok: boolean;
  service?: string;
  neo4j_available?: boolean;
  neo4j_uri?: string;
  error?: string;
  latencyMs?: number;
}

export interface KagReasonResult {
  ok: boolean;
  query?: string;
  plan?: {
    type: string;
    max_hops: number;
    domain?: string;
  };
  evidence?: Array<{
    source: string;
    target: string;
    relations: string[];
  }>;
  evidence_count?: number;
  error?: string;
}

export interface KagInferResult {
  ok: boolean;
  triple?: {
    subject: string;
    predicate: string;
    object?: string;
  };
  inferences?: Array<{
    subject: string;
    object: string;
    relation: string;
  }>;
  inference_count?: number;
  error?: string;
}

async function postKag<T>(path: string, body: unknown, base: string, timeoutMs: number): Promise<T> {
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
      return { ok: false, error: `kag sidecar HTTP ${res.status}` } as T;
    }
    return (await res.json()) as T;
  } catch (err: any) {
    return { ok: false, error: err?.name === 'AbortError' ? `kag sidecar timed out after ${timeoutMs}ms` : err?.message || 'kag sidecar unreachable' } as T;
  } finally {
    clearTimeout(timer);
  }
}

async function getKag<T>(path: string, base: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}${path}`, { signal: controller.signal });
    if (!res.ok) return { ok: false, error: `kag sidecar HTTP ${res.status}` } as T;
    return (await res.json()) as T;
  } catch (err: any) {
    return { ok: false, error: err?.name === 'AbortError' ? `kag sidecar timed out after ${timeoutMs}ms` : err?.message || 'kag sidecar unreachable' } as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function kagSidecarHealth(base?: string, timeoutMs = 2000): Promise<KagHealthResult> {
  const resolved = kagSidecarBase(base);
  if (!resolved) return { ...NOT_CONFIGURED };
  return getKag<KagHealthResult>('/health', resolved, timeoutMs);
}

export async function kagReason(
  query: string,
  opts: { domain?: string; maxHops?: number; timeoutMs?: number; base?: string } = {},
): Promise<KagReasonResult> {
  const { domain, maxHops = 3, timeoutMs = 15000 } = opts;
  const resolved = kagSidecarBase(opts.base);
  if (!resolved) return { ...NOT_CONFIGURED };
  return postKag<KagReasonResult>('/kag/reason', { query, domain, max_hops: maxHops }, resolved, timeoutMs);
}

export async function kagInfer(
  subject: string,
  predicate: string,
  object?: string,
  opts: { timeoutMs?: number; base?: string } = {},
): Promise<KagInferResult> {
  const { timeoutMs = 10000 } = opts;
  const resolved = kagSidecarBase(opts.base);
  if (!resolved) return { ...NOT_CONFIGURED };
  return postKag<KagInferResult>('/kag/infer', { subject, predicate, object }, resolved, timeoutMs);
}
