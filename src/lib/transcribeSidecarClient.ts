/**
 * Transcription sidecar client (Python/faster-whisper).
 *
 * The sidecar (`python/transcribe_service/main.py`) is STATELESS: Recourse sends
 * an audio/video URL or bytes and gets a transcript back. Honesty contract
 * (mirrors the PDF/KG sidecars): every call is timeout-guarded and returns
 * `ok:false` with the underlying error when the sidecar is down or the ASR
 * backend is not installed — it never fabricates a transcript.
 *
 * Env: TRANSCRIBE_SIDECAR_URL (default http://127.0.0.1:8900).
 */

export const TRANSCRIBE_SIDECAR_DEFAULT_URL = process.env.TRANSCRIBE_SIDECAR_URL || 'http://127.0.0.1:8900';

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscribeResult {
  ok: boolean;
  language?: string;
  duration?: number;
  segments?: TranscriptSegment[];
  text?: string;
  chars?: number;
  reason?: string;
  error?: string;
  latencyMs?: number;
}

export interface TranscribeHealthResult {
  ok: boolean;
  service?: string;
  whisper_available?: boolean;
  default_model?: string;
  error?: string;
  latencyMs?: number;
}

export interface SidecarCall<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
  latencyMs: number;
}

async function postJson<T>(path: string, body: unknown, base: string, timeoutMs: number): Promise<SidecarCall<T>> {
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
      return { ok: false, status: res.status, data: null, latencyMs, error: `transcribe sidecar HTTP ${res.status}${detail ? `: ${detail}` : ''}` };
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
      error: err?.name === 'AbortError' ? `transcribe sidecar timed out after ${timeoutMs}ms` : err?.message || 'transcribe sidecar unreachable',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function getJson<T>(path: string, base: string, timeoutMs: number): Promise<SidecarCall<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}${path}`, { signal: controller.signal });
    const latencyMs = Date.now() - started;
    if (!res.ok) return { ok: false, status: res.status, data: null, latencyMs, error: `transcribe sidecar HTTP ${res.status}` };
    const data = (await res.json()) as T;
    return { ok: true, status: res.status, data, latencyMs };
  } catch (err: any) {
    const latencyMs = Date.now() - started;
    return {
      ok: false,
      status: 0,
      data: null,
      latencyMs,
      error: err?.name === 'AbortError' ? `transcribe sidecar timed out after ${timeoutMs}ms` : err?.message || 'transcribe sidecar unreachable',
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function transcribeSidecarHealth(
  base = TRANSCRIBE_SIDECAR_DEFAULT_URL,
  timeoutMs = 2000,
): Promise<TranscribeHealthResult> {
  const call = await getJson<any>('/health', base, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  return {
    ok: true,
    service: call.data.service,
    whisper_available: Boolean(call.data.whisper_available),
    default_model: call.data.default_model,
    latencyMs: call.latencyMs,
  };
}

export async function transcribeBytes(
  dataBase64: string,
  opts: { filename?: string; language?: string; model?: string; timeoutMs?: number; base?: string } = {},
): Promise<TranscribeResult> {
  const { filename, language, model, timeoutMs = 300000, base = TRANSCRIBE_SIDECAR_DEFAULT_URL } = opts;
  const body: Record<string, unknown> = { data_base64: dataBase64 };
  if (filename) body.filename = filename;
  if (language) body.language = language;
  if (model) body.model = model;
  const call = await postJson<TranscribeResult>('/transcribe/bytes', body, base, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  return { ...call.data, latencyMs: call.latencyMs };
}

export async function transcribeUrl(
  url: string,
  opts: { language?: string; model?: string; timeoutMs?: number; base?: string } = {},
): Promise<TranscribeResult> {
  const { language, model, timeoutMs = 300000, base = TRANSCRIBE_SIDECAR_DEFAULT_URL } = opts;
  const body: Record<string, unknown> = { url };
  if (language) body.language = language;
  if (model) body.model = model;
  const call = await postJson<TranscribeResult>('/transcribe/url', body, base, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  return { ...call.data, latencyMs: call.latencyMs };
}
