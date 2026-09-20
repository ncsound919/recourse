// src/lib/voiceClone.ts — record a reference clip, then speak in that voice.
//
// WHY THIS REPLACES WEB SPEECH RATHER THAN WRAPPING IT: the Web Speech API's
// `speechSynthesis` offers no way to register a custom voice and no way to
// capture the audio it renders (it goes straight to the output device — no
// MediaStream, no AudioWorklet tap). So there is nothing to "wrap" a clone
// around. Instead we record a reference clip, have the zero-shot TTS sidecar
// synthesize real audio from the text, and play that. `voice.ts` still uses
// `speechSynthesis` as the fallback when cloning is off or unavailable.

const ENABLED_KEY = 'recourse_voice_clone_enabled';
const PROFILE_KEY = 'recourse_voice_clone_profile';
const MIN_RECORD_MS = 3000;
const MAX_RECORD_MS = 60000;
const TARGET_SAMPLE_RATE = 16000;
const CACHE_LIMIT = 24;

export interface RecordedReference {
  base64: string;
  durationSec: number;
  sampleRate: number;
  filename: string;
}

export interface VoiceProfileSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  language: string;
  bytes: number;
  durationSec?: number;
  sampleRate?: number;
}

export interface VoiceSidecarStatus {
  online: boolean;
  ttsAvailable: boolean;
  engines: string[];
  defaultEngine: string | null;
  device: string | null;
  latencyMs: number | null;
  error: string | null;
}

function readFlag(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function isVoiceCloneEnabled(): boolean {
  return readFlag(ENABLED_KEY) === 'true';
}

export function setVoiceCloneEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ENABLED_KEY, String(enabled));
  } catch {
    /* ignore */
  }
}

export function getCloneProfileId(): string | null {
  return readFlag(PROFILE_KEY);
}

export function setCloneProfileId(id: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (id) localStorage.setItem(PROFILE_KEY, id);
    else localStorage.removeItem(PROFILE_KEY);
  } catch {
    /* ignore */
  }
}

// --- recording ------------------------------------------------------------

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  return candidates.find((m) => {
    try {
      return MediaRecorder.isTypeSupported(m);
    } catch {
      return false;
    }
  });
}

async function blobToMonoPcm(blob: Blob): Promise<Float32Array> {
  const buffer = await blob.arrayBuffer();
  const Ctx: typeof AudioContext =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  const decodeCtx = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(buffer.slice(0));
  } finally {
    // close() returns a promise that can reject; an unhandled rejection here
    // would surface as a console error on every recording.
    decodeCtx.close().catch(() => undefined);
  }

  const frames = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE));
  const off = new OfflineAudioContext(1, frames, TARGET_SAMPLE_RATE);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  return rendered.getChannelData(0);
}

/** Encode mono samples as 16-bit PCM WAV. Exported for direct testing. */
export function encodeWav16(pcm: Float32Array, sampleRate: number): Uint8Array {
  const bytesPerSample = 2;
  const dataSize = pcm.length * bytesPerSample;
  const view = new DataView(new ArrayBuffer(44 + dataSize));

  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < pcm.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(view.buffer);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Encode raw bytes as base64. Exported for direct testing. */
export function encodeBase64(bytes: Uint8Array): string {
  return bytesToBase64(bytes);
}

/**
 * Record a reference clip from the microphone and return it as mono 16 kHz PCM
 * WAV (base64). Downsampling here keeps the payload small and guarantees the
 * sidecar can decode it without ffmpeg. Rejects if the mic is unavailable or the
 * take is too short to clone from.
 */
export async function recordReference(options: {
  durationMs?: number;
  onProgress?: (elapsedMs: number) => void;
} = {}): Promise<RecordedReference> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('microphone recording is not available in this browser');
  }
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder is not available in this browser');
  }

  const durationMs = Math.min(Math.max(options.durationMs ?? 15000, MIN_RECORD_MS), MAX_RECORD_MS);
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  // From here on the mic is live: every exit path must stop the tracks or the
  // browser keeps the recording indicator on.
  let recorder: MediaRecorder;
  const mimeType = pickRecorderMime();
  try {
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    throw e instanceof Error ? e : new Error('could not start the audio recorder');
  }
  const chunks: Blob[] = [];

  const stopped = new Promise<void>((resolve) => {
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => resolve();
  });

  const startedAt = Date.now();
  const ticker = options.onProgress
    ? setInterval(() => options.onProgress!(Date.now() - startedAt), 250)
    : null;

  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    recorder.start();
    timer = setTimeout(() => {
      try {
        recorder.stop();
      } catch {
        /* already stopping */
      }
    }, durationMs);
    await stopped;
  } finally {
    if (timer) clearTimeout(timer);
    if (ticker) clearInterval(ticker);
    stream.getTracks().forEach((t) => t.stop());
  }

  if (chunks.length === 0) throw new Error('no audio was captured');

  const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
  const pcm = await blobToMonoPcm(blob);
  const durationSec = pcm.length / TARGET_SAMPLE_RATE;
  if (durationSec < MIN_RECORD_MS / 1000) {
    throw new Error(`recording was only ${durationSec.toFixed(1)}s; ${MIN_RECORD_MS / 1000}s+ is needed`);
  }

  return {
    base64: bytesToBase64(encodeWav16(pcm, TARGET_SAMPLE_RATE)),
    durationSec: Math.round(durationSec * 1000) / 1000,
    sampleRate: TARGET_SAMPLE_RATE,
    filename: 'reference.wav',
  };
}

// --- server sync ----------------------------------------------------------

export async function fetchVoiceStatus(): Promise<{ sidecar: VoiceSidecarStatus; profiles: VoiceProfileSummary[] }> {
  const res = await fetch('/api/recourse/voice/status');
  const json = await res.json();
  if (!json?.success) throw new Error(json?.error || 'voice status unavailable');
  return { sidecar: json.sidecar, profiles: json.profiles ?? [] };
}

export async function saveVoiceProfile(input: {
  name: string;
  reference: RecordedReference;
  language?: string;
  referenceText?: string;
}): Promise<{ profile: VoiceProfileSummary; suitable: boolean | null; reason: string | null }> {
  const res = await fetch('/api/recourse/voice/profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      referenceBase64: input.reference.base64,
      filename: input.reference.filename,
      durationSec: input.reference.durationSec,
      sampleRate: input.reference.sampleRate,
      ...(input.language ? { language: input.language } : {}),
      ...(input.referenceText ? { referenceText: input.referenceText } : {}),
    }),
  });
  const json = await res.json();
  if (!json?.success) throw new Error(json?.error || 'failed to save voice profile');
  return { profile: json.profile, suitable: json.suitable ?? null, reason: json.validationReason ?? null };
}

export async function deleteVoiceProfile(id: string): Promise<void> {
  const res = await fetch(`/api/recourse/voice/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) throw new Error(json?.error || `delete failed (${res.status})`);
}

// --- synthesis + playback -------------------------------------------------

// When the sidecar is down or has no TTS backend, every narration event would
// otherwise fire a failing request. A short cooldown makes `cloneReady()` go
// false so `speak()` falls straight back to Web Speech instead of hammering a
// dead service from a 24/7 tick stream.
const COOLDOWN_MS = 60000;
let cooldownUntil = 0;

/** True when cloned narration should be attempted for the next utterance. */
export function cloneReady(): boolean {
  if (Date.now() < cooldownUntil) return false;
  return isVoiceCloneEnabled() && Boolean(getCloneProfileId());
}

/** Remaining cooldown in ms (0 when healthy) — used for honest UI messaging. */
export function cloneCooldownMs(): number {
  return Math.max(0, cooldownUntil - Date.now());
}

/** Clear a failure cooldown (e.g. after the user records a fresh profile). */
export function resetCloneCooldown(): void {
  cooldownUntil = 0;
}

interface CacheEntry {
  url: string;
  usedAt: number;
}
const audioCache = new Map<string, CacheEntry>();
let currentKey: string | null = null;

function cacheKey(profileId: string, text: string): string {
  return `${profileId}::${text}`;
}

function rememberInCache(key: string, url: string): void {
  audioCache.set(key, { url, usedAt: Date.now() });
  if (audioCache.size <= CACHE_LIMIT) return;
  // Never revoke the blob URL that is playing right now.
  const candidates = [...audioCache.entries()]
    .filter(([k]) => k !== currentKey && k !== key)
    .sort((a, b) => a[1].usedAt - b[1].usedAt);
  const oldest = candidates[0];
  if (oldest) {
    URL.revokeObjectURL(oldest[1].url);
    audioCache.delete(oldest[0]);
  }
}

export function clearCloneCache(): void {
  for (const entry of audioCache.values()) URL.revokeObjectURL(entry.url);
  audioCache.clear();
}

let currentAudio: HTMLAudioElement | null = null;

/** Stop any cloned playback in progress. */
export function stopClonedSpeech(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  currentKey = null;
}

/**
 * Synthesize `text` in the selected reference voice and play it.
 *
 * Returns `true` when the utterance was synthesized and playback started, and
 * `false` when cloning was not attempted (disabled, no profile, or within a
 * failure cooldown) — so `speak()` knows to use Web Speech instead. Throws only
 * when synthesis was attempted and failed, carrying the sidecar's real reason.
 */
export async function speakCloned(
  text: string,
  options: { profileId?: string; engine?: string; speed?: number } = {},
): Promise<boolean> {
  const profileId = options.profileId ?? getCloneProfileId();
  if (!profileId || !text.trim()) return false;
  if (typeof window === 'undefined') return false;

  const key = cacheKey(profileId, text);
  let url = audioCache.get(key)?.url;

  if (!url) {
    let json: any;
    let ok = false;
    try {
      const res = await fetch('/api/recourse/voice/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          profileId,
          ...(options.engine ? { engine: options.engine } : {}),
          ...(typeof options.speed === 'number' ? { speed: options.speed } : {}),
        }),
      });
      json = await res.json().catch(() => ({}));
      ok = res.ok && json?.success !== false && Boolean(json?.audioBase64);
      if (!ok) {
        throw new Error(json?.error || `voice synthesis failed (${res.status})`);
      }
    } catch (err) {
      cooldownUntil = Date.now() + COOLDOWN_MS;
      throw err;
    }
    const bytes = Uint8Array.from(atob(json.audioBase64), (c) => c.charCodeAt(0));
    url = URL.createObjectURL(new Blob([bytes], { type: json.mime || 'audio/wav' }));
    rememberInCache(key, url);
  } else {
    audioCache.get(key)!.usedAt = Date.now();
  }

  stopClonedSpeech();
  const audio = new Audio(url);
  currentAudio = audio;
  currentKey = key;
  cooldownUntil = 0;
  try {
    await audio.play();
  } catch (err) {
    // Autoplay policy / missing output device: not a sidecar fault, so do not
    // apply the cooldown — just let the caller fall back.
    stopClonedSpeech();
    throw err instanceof Error ? err : new Error('audio playback was blocked');
  }
  return true;
}
