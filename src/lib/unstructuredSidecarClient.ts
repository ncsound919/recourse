// src/lib/unstructuredSidecarClient.ts
//
// Unstructured sidecar client — document ingestion and chunking.
// Stateless HTTP service; honest when unavailable.

/**
 * Env var naming the Unstructured sidecar.
 *
 * Unlike the KAG and Inspect clients this one keeps a default (8820), which
 * `python/unstructured_service/` does not share with anything else. It is still
 * overridable, and an explicit empty value means "not configured".
 */
export const UNSTRUCTURED_SIDECAR_ENV = 'UNSTRUCTURED_SIDECAR_URL';
export const UNSTRUCTURED_SIDECAR_DEFAULT_URL = 'http://127.0.0.1:8820';

/** The configured sidecar base URL, or null when it is not configured. */
export function unstructuredSidecarBase(explicit?: string): string | null {
  const raw = explicit ?? process.env[UNSTRUCTURED_SIDECAR_ENV];
  if (typeof raw === 'string' && raw.trim() === '') return null; // explicitly disabled
  const url = raw ?? UNSTRUCTURED_SIDECAR_DEFAULT_URL;
  return url.trim();
}

const NOT_CONFIGURED = { ok: false, error: `${UNSTRUCTURED_SIDECAR_ENV} is set to empty — unstructured sidecar disabled` } as const;

export interface UnstructuredHealthResult {
  ok: boolean;
  service?: string;
  unstructured_available?: boolean;
  error?: string;
}

export interface UnstructuredChunk {
  text: string;
  start: number;
  end: number;
  index: number;
}

export interface UnstructuredIngestResult {
  ok: boolean;
  filename?: string;
  strategy?: string;
  chunks?: UnstructuredChunk[];
  error?: string;
}

export interface UnstructuredChunksResult {
  ok: boolean;
  chunk_count?: number;
  chunks?: UnstructuredChunk[];
  error?: string;
}

async function postUnstructured<T>(path: string, body: unknown, base: string, timeoutMs: number): Promise<T> {
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
      return { ok: false, error: `unstructured sidecar HTTP ${res.status}` } as T;
    }
    return (await res.json()) as T;
  } catch (err: any) {
    return { ok: false, error: err?.name === 'AbortError' ? `unstructured sidecar timed out after ${timeoutMs}ms` : err?.message || 'unstructured sidecar unreachable' } as T;
  } finally {
    clearTimeout(timer);
  }
}

async function getUnstructured<T>(path: string, base: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}${path}`, { signal: controller.signal });
    if (!res.ok) return { ok: false, error: `unstructured sidecar HTTP ${res.status}` } as T;
    return (await res.json()) as T;
  } catch (err: any) {
    return { ok: false, error: err?.name === 'AbortError' ? `unstructured sidecar timed out after ${timeoutMs}ms` : err?.message || 'unstructured sidecar unreachable' } as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function unstructuredSidecarHealth(base?: string, timeoutMs = 2000): Promise<UnstructuredHealthResult> {
  const resolved = unstructuredSidecarBase(base);
  if (!resolved) return { ...NOT_CONFIGURED };
  return getUnstructured<UnstructuredHealthResult>('/health', resolved, timeoutMs);
}

export async function unstructuredIngest(
  dataBase64: string,
  opts: { filename?: string; strategy?: string; timeoutMs?: number; base?: string } = {},
): Promise<UnstructuredIngestResult> {
  const { filename, strategy = 'auto', timeoutMs = 30000 } = opts;
  const resolved = unstructuredSidecarBase(opts.base);
  if (!resolved) return { ...NOT_CONFIGURED };
  return postUnstructured<UnstructuredIngestResult>('/unstructured/ingest', { data_base64: dataBase64, filename, strategy }, resolved, timeoutMs);
}

export async function unstructuredChunks(
  text: string,
  opts: { chunkSize?: number; overlap?: number; timeoutMs?: number; base?: string } = {},
): Promise<UnstructuredChunksResult> {
  const { chunkSize = 1000, overlap = 200, timeoutMs = 5000 } = opts;
  const resolved = unstructuredSidecarBase(opts.base);
  if (!resolved) return { ...NOT_CONFIGURED };
  return postUnstructured<UnstructuredChunksResult>('/unstructured/chunks', { text, chunk_size: chunkSize, overlap }, resolved, timeoutMs);
}
