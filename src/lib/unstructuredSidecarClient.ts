// src/lib/unstructuredSidecarClient.ts
//
// Unstructured sidecar client — document ingestion and chunking.
// Stateless HTTP service; honest when unavailable.

export const UNSTRUCTURED_SIDECAR_DEFAULT_URL = process.env.UNSTRUCTURED_SIDECAR_URL || 'http://127.0.0.1:8820';

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

export async function unstructuredSidecarHealth(base = UNSTRUCTURED_SIDECAR_DEFAULT_URL, timeoutMs = 2000): Promise<UnstructuredHealthResult> {
  return getUnstructured<UnstructuredHealthResult>('/health', base, timeoutMs);
}

export async function unstructuredIngest(
  dataBase64: string,
  opts: { filename?: string; strategy?: string; timeoutMs?: number; base?: string } = {},
): Promise<UnstructuredIngestResult> {
  const { filename, strategy = 'auto', timeoutMs = 30000, base = UNSTRUCTURED_SIDECAR_DEFAULT_URL } = opts;
  return postUnstructured<UnstructuredIngestResult>('/unstructured/ingest', { data_base64: dataBase64, filename, strategy }, base, timeoutMs);
}

export async function unstructuredChunks(
  text: string,
  opts: { chunkSize?: number; overlap?: number; timeoutMs?: number; base?: string } = {},
): Promise<UnstructuredChunksResult> {
  const { chunkSize = 1000, overlap = 200, timeoutMs = 5000, base = UNSTRUCTURED_SIDECAR_DEFAULT_URL } = opts;
  return postUnstructured<UnstructuredChunksResult>('/unstructured/chunks', { text, chunk_size: chunkSize, overlap }, base, timeoutMs);
}
