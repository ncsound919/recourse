/**
 * Recourse PDF/paper text-extraction sidecar client (Python/PyMuPDF).
 *
 * The sidecar (`python/pdf_service/main.py`) is STATELESS: Recourse sends a
 * PDF URL or bytes and gets extracted text back. It never stores content, so
 * there is no copy to drift.
 *
 * Honesty contract (mirrors `src/intake/*` and the KG sidecar): every call is
 * timeout-guarded and returns `ok:false` with the underlying error when the
 * sidecar is down or rejects. It never fabricates text. A scanned/image-only
 * PDF is honestly reported with `scanned_only_image_pdf:true` and empty text -
 * never invented prose.
 *
 * Env: PDF_SIDECAR_URL (default http://127.0.0.1:8600).
 */

export const PDF_SIDECAR_DEFAULT_URL = process.env.PDF_SIDECAR_URL || 'http://127.0.0.1:8600';

export interface PdfPage {
  page: number;
  chars: number;
  text: string;
}

export interface PdfExtractResult {
  ok: boolean;
  page_count?: number;
  pages_extracted?: number;
  total_chars?: number;
  metadata?: Record<string, string>;
  scanned_only_image_pdf?: boolean;
  pages?: PdfPage[];
  text?: string;
  error?: string;
  latencyMs?: number;
}

export interface PdfHealthResult {
  ok: boolean;
  service?: string;
  pymupdf?: string;
  error?: string;
  latencyMs?: number;
}

export interface PdfSidecarCall<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
  latencyMs: number;
}

async function postPdf<T>(path: string, body: unknown, base: string, timeoutMs: number): Promise<PdfSidecarCall<T>> {
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
      return { ok: false, status: res.status, data: null, latencyMs, error: `pdf sidecar HTTP ${res.status}${detail ? `: ${detail}` : ''}` };
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
      error: err?.name === 'AbortError' ? `pdf sidecar timed out after ${timeoutMs}ms` : err?.message || 'pdf sidecar unreachable',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function getPdf<T>(path: string, base: string, timeoutMs: number): Promise<PdfSidecarCall<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}${path}`, { signal: controller.signal });
    const latencyMs = Date.now() - started;
    if (!res.ok) return { ok: false, status: res.status, data: null, latencyMs, error: `pdf sidecar HTTP ${res.status}` };
    const data = (await res.json()) as T;
    return { ok: true, status: res.status, data, latencyMs };
  } catch (err: any) {
    const latencyMs = Date.now() - started;
    return {
      ok: false,
      status: 0,
      data: null,
      latencyMs,
      error: err?.name === 'AbortError' ? `pdf sidecar timed out after ${timeoutMs}ms` : err?.message || 'pdf sidecar unreachable',
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function pdfSidecarHealth(base = PDF_SIDECAR_DEFAULT_URL, timeoutMs = 2000): Promise<PdfHealthResult> {
  const call = await getPdf<PdfHealthResult>('/health', base, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  return { ok: true, service: call.data.service, pymupdf: call.data.pymupdf, latencyMs: call.latencyMs };
}

export async function pdfExtractUrl(
  url: string,
  opts: { maxPages?: number; timeoutMs?: number; base?: string } = {},
): Promise<PdfExtractResult> {
  const { maxPages, timeoutMs = 60000, base = PDF_SIDECAR_DEFAULT_URL } = opts;
  const body = maxPages ? { url, max_pages: maxPages } : { url };
  const call = await postPdf<PdfExtractResult>('/pdf/url', body, base, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  return { ...call.data, latencyMs: call.latencyMs };
}

export async function pdfExtractBytes(
  dataBase64: string,
  opts: { filename?: string; maxPages?: number; timeoutMs?: number; base?: string } = {},
): Promise<PdfExtractResult> {
  const { filename, maxPages, timeoutMs = 60000, base = PDF_SIDECAR_DEFAULT_URL } = opts;
  const body: Record<string, unknown> = { data_base64: dataBase64 };
  if (filename) body.filename = filename;
  if (maxPages) body.max_pages = maxPages;
  const call = await postPdf<PdfExtractResult>('/pdf/bytes', body, base, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  return { ...call.data, latencyMs: call.latencyMs };
}
