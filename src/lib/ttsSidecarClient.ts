/**
 * Voice-clone sidecar client (Python zero-shot TTS).
 *
 * The sidecar (`python/tts_service/main.py`) is STATELESS: Recourse sends the
 * text to synthesize plus the reference voice clip on every call and gets WAV
 * audio back. Honesty contract (mirrors `transcribeSidecarClient.ts` and the
 * other sidecars): every call is timeout-guarded and returns `ok:false` with
 * the underlying reason when the sidecar is down or no TTS backend is
 * installed — it never substitutes a different voice and calls it a clone.
 *
 * Env: TTS_SIDECAR_URL (default http://127.0.0.1:8910).
 */

export const TTS_SIDECAR_DEFAULT_URL = process.env.TTS_SIDECAR_URL || 'http://127.0.0.1:8910';

export interface TtsHealthResult {
  ok: boolean;
  service?: string;
  engines?: string[];
  ttsAvailable?: boolean;
  defaultEngine?: string | null;
  device?: string;
  error?: string;
  latencyMs?: number;
}

export interface ReferenceProbeResult {
  ok: boolean;
  suitable?: boolean;
  reason?: string | null;
  bytes?: number;
  duration_sec?: number | null;
  sample_rate?: number | null;
  channels?: number | null;
  error?: string;
  latencyMs?: number;
}

export interface CloneResult {
  ok: boolean;
  engine?: string;
  language?: string;
  mime?: string;
  sampleRate?: number;
  durationSec?: number;
  chars?: number;
  audioBase64?: string;
  reason?: string;
  error?: string;
  latencyMs?: number;
}

interface SidecarCall<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
  latencyMs: number;
}

async function callJson<T>(
  path: string,
  body: unknown,
  base: string,
  timeoutMs: number,
  method: 'POST' | 'GET' = 'POST',
): Promise<SidecarCall<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false, status: res.status, data: null, latencyMs, error: `tts sidecar HTTP ${res.status}${detail ? `: ${detail}` : ''}` };
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
      error: err?.name === 'AbortError' ? `tts sidecar timed out after ${timeoutMs}ms` : err?.message || 'tts sidecar unreachable',
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function ttsSidecarHealth(
  base = TTS_SIDECAR_DEFAULT_URL,
  timeoutMs = 2000,
): Promise<TtsHealthResult> {
  const call = await callJson<any>('/health', null, base, timeoutMs, 'GET');
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  return {
    ok: true,
    service: call.data.service,
    engines: Array.isArray(call.data.engines) ? call.data.engines : [],
    ttsAvailable: Boolean(call.data.tts_available),
    defaultEngine: call.data.default_engine ?? null,
    device: call.data.device,
    latencyMs: call.latencyMs,
  };
}

/** Check that a reference clip is long/clean enough to clone from. */
export async function validateReferenceVoice(
  referenceBase64: string,
  opts: { filename?: string; timeoutMs?: number; base?: string } = {},
): Promise<ReferenceProbeResult> {
  const { filename, timeoutMs = 30000, base = TTS_SIDECAR_DEFAULT_URL } = opts;
  const body: Record<string, unknown> = { reference_base64: referenceBase64 };
  if (filename) body.reference_filename = filename;
  const call = await callJson<any>('/voice/validate', body, base, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  return { ...call.data, ok: call.data.ok !== false, latencyMs: call.latencyMs };
}

/** Synthesize `text` in the voice of `referenceBase64`. */
export async function cloneSpeech(
  text: string,
  referenceBase64: string,
  opts: {
    referenceFilename?: string;
    referenceText?: string;
    language?: string;
    engine?: string;
    speed?: number;
    timeoutMs?: number;
    base?: string;
  } = {},
): Promise<CloneResult> {
  const { referenceFilename, referenceText, language, engine, speed, timeoutMs = 300000, base = TTS_SIDECAR_DEFAULT_URL } = opts;
  const body: Record<string, unknown> = { text, reference_base64: referenceBase64 };
  if (referenceFilename) body.reference_filename = referenceFilename;
  if (referenceText) body.reference_text = referenceText;
  if (language) body.language = language;
  if (engine) body.engine = engine;
  if (typeof speed === 'number') body.speed = speed;

  const call = await callJson<any>('/voice/clone', body, base, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  if (call.data.ok === false) return { ok: false, reason: call.data.reason ?? 'synthesis refused', latencyMs: call.latencyMs };
  // A 200 with no audio is still a failure: never let the caller play nothing
  // and report success.
  if (typeof call.data.audio_base64 !== 'string' || !call.data.audio_base64) {
    return { ok: false, reason: 'tts sidecar returned success without audio', latencyMs: call.latencyMs };
  }
  return {
    ok: true,
    engine: call.data.engine,
    language: call.data.language,
    mime: call.data.mime ?? 'audio/wav',
    sampleRate: call.data.sample_rate,
    durationSec: call.data.duration_sec,
    chars: call.data.chars,
    audioBase64: call.data.audio_base64,
    latencyMs: call.latencyMs,
  };
}
