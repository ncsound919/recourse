// src/lib/kagSidecarClient.ts
//
// KAG sidecar client — logical-form-guided reasoning over Neo4j KG.
// Stateless HTTP service; honest when unavailable.

export const KAG_SIDECAR_DEFAULT_URL = process.env.KAG_SIDECAR_URL || 'http://127.0.0.1:8800';

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

export async function kagSidecarHealth(base = KAG_SIDECAR_DEFAULT_URL, timeoutMs = 2000): Promise<KagHealthResult> {
  return getKag<KagHealthResult>('/health', base, timeoutMs);
}

export async function kagReason(
  query: string,
  opts: { domain?: string; maxHops?: number; timeoutMs?: number; base?: string } = {},
): Promise<KagReasonResult> {
  const { domain, maxHops = 3, timeoutMs = 15000, base = KAG_SIDECAR_DEFAULT_URL } = opts;
  return postKag<KagReasonResult>('/kag/reason', { query, domain, max_hops: maxHops }, base, timeoutMs);
}

export async function kagInfer(
  subject: string,
  predicate: string,
  object?: string,
  opts: { timeoutMs?: number; base?: string } = {},
): Promise<KagInferResult> {
  const { timeoutMs = 10000, base = KAG_SIDECAR_DEFAULT_URL } = opts;
  return postKag<KagInferResult>('/kag/infer', { subject, predicate, object }, base, timeoutMs);
}
