/**
 * Recourse fuzzy-dedup sidecar client (Python/RapidFuzz).
 *
 * The sidecar (`python/fuzz_service/main.py`) is STATELESS: Recourse sends a
 * needle + candidates (or a name list) and gets real RapidFuzz scores back. It
 * keeps no registry/gene copy, so there is no drift. This is the dedup layer
 * for registry tool names, GitHub UNVERIFIED candidates and the learner gene
 * pool - where exact matching misses near-duplicates.
 *
 * Honesty contract: results are real RapidFuzz scores. `fuzzMatch` drops
 * candidates below `threshold`; `fuzzDedup` only groups names that actually
 * meet the threshold. Nothing is invented.
 *
 * Env: FUZZ_SIDECAR_URL (default http://127.0.0.1:8700).
 */

export const FUZZ_SIDECAR_DEFAULT_URL = process.env.FUZZ_SIDECAR_URL || 'http://127.0.0.1:8700';

export type FuzzScorer = 'ratio' | 'token_ratio' | 'token_sort' | 'partial_ratio';

export interface FuzzMatch {
  candidate: string;
  score: number;
  index: number;
}

export interface FuzzMatchResult {
  ok: boolean;
  needle?: string;
  scorer?: FuzzScorer;
  threshold?: number;
  matches?: FuzzMatch[];
  error?: string;
  latencyMs?: number;
}

export interface FuzzCluster {
  seed: string;
  members: string[];
  links: Array<{ from: string; to: string; score: number }>;
}

export interface FuzzDedupResult {
  ok: boolean;
  scorer?: FuzzScorer;
  threshold?: number;
  input_names?: number;
  cluster_count?: number;
  dedup_savings?: number;
  clusters?: FuzzCluster[];
  error?: string;
  latencyMs?: number;
}

export interface FuzzHealthResult {
  ok: boolean;
  service?: string;
  rapidfuzz?: string;
  error?: string;
  latencyMs?: number;
}

export interface FuzzSidecarCall<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
  latencyMs: number;
}

async function callFuzz<T>(path: string, body: unknown, base: string, timeoutMs: number): Promise<FuzzSidecarCall<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false, status: res.status, data: null, latencyMs, error: `fuzz sidecar HTTP ${res.status}${detail ? `: ${detail}` : ''}` };
    }
    const data = (await res.json()) as T;
    return { ok: true, status: res.status, data, latencyMs };
  } catch (err: any) {
    const latencyMs = Date.now() - started;
    return {
      ok: false,
      status: 0,
      data: null,
      latencyMs,
      error: err?.name === 'AbortError' ? `fuzz sidecar timed out after ${timeoutMs}ms` : err?.message || 'fuzz sidecar unreachable',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function getFuzz<T>(path: string, base: string, timeoutMs: number): Promise<FuzzSidecarCall<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}${path}`, { signal: controller.signal });
    const latencyMs = Date.now() - started;
    if (!res.ok) return { ok: false, status: res.status, data: null, latencyMs, error: `fuzz sidecar HTTP ${res.status}` };
    const data = (await res.json()) as T;
    return { ok: true, status: res.status, data, latencyMs };
  } catch (err: any) {
    const latencyMs = Date.now() - started;
    return {
      ok: false,
      status: 0,
      data: null,
      latencyMs,
      error: err?.name === 'AbortError' ? `fuzz sidecar timed out after ${timeoutMs}ms` : err?.message || 'fuzz sidecar unreachable',
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fuzzSidecarHealth(base = FUZZ_SIDECAR_DEFAULT_URL, timeoutMs = 2000): Promise<FuzzHealthResult> {
  const call = await getFuzz<FuzzHealthResult>('/health', base, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  return { ok: true, service: call.data.service, rapidfuzz: call.data.rapidfuzz, latencyMs: call.latencyMs };
}

export async function fuzzMatch(
  needle: string,
  candidates: string[],
  opts: { scorer?: FuzzScorer; threshold?: number; limit?: number; timeoutMs?: number; base?: string } = {},
): Promise<FuzzMatchResult> {
  const { scorer, threshold, limit, timeoutMs = 10000, base = FUZZ_SIDECAR_DEFAULT_URL } = opts;
  const body: Record<string, unknown> = { needle, candidates };
  if (scorer) body.scorer = scorer;
  if (threshold !== undefined) body.threshold = threshold;
  if (limit) body.limit = limit;
  const call = await callFuzz<FuzzMatchResult>('/fuzz/match', body, base, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  return { ...call.data, latencyMs: call.latencyMs };
}

export async function fuzzDedup(
  names: string[],
  opts: { scorer?: FuzzScorer; threshold?: number; timeoutMs?: number; base?: string } = {},
): Promise<FuzzDedupResult> {
  const { scorer, threshold, timeoutMs = 20000, base = FUZZ_SIDECAR_DEFAULT_URL } = opts;
  const body: Record<string, unknown> = { names };
  if (scorer) body.scorer = scorer;
  if (threshold !== undefined) body.threshold = threshold;
  const call = await callFuzz<FuzzDedupResult>('/fuzz/dedup', body, base, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  return { ...call.data, latencyMs: call.latencyMs };
}
