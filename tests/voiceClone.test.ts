import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  clearCloneCache,
  cloneCooldownMs,
  cloneReady,
  encodeBase64,
  encodeWav16,
  resetCloneCooldown,
  setCloneProfileId,
  setVoiceCloneEnabled,
  speakCloned,
} from '../src/lib/voiceClone';

interface ParsedWav {
  riff: string;
  wave: string;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataSize: number;
  samples: number[];
}

function parseWav(bytes: Uint8Array): ParsedWav {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (o: number, n: number) =>
    Array.from({ length: n }, (_, i) => String.fromCharCode(view.getUint8(o + i))).join('');
  const dataSize = view.getUint32(40, true);
  const samples: number[] = [];
  for (let o = 44; o + 1 < 44 + dataSize; o += 2) samples.push(view.getInt16(o, true));
  return {
    riff: ascii(0, 4),
    wave: ascii(8, 4),
    channels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    bitsPerSample: view.getUint16(34, true),
    dataSize,
    samples,
  };
}

const savedGlobals: Record<string, unknown> = {};

beforeEach(() => {
  const store = new Map<string, string>();
  savedGlobals.window = (globalThis as any).window;
  savedGlobals.localStorage = (globalThis as any).localStorage;
  savedGlobals.Audio = (globalThis as any).Audio;
  savedGlobals.fetch = (globalThis as any).fetch;
  savedGlobals.createObjectURL = (URL as any).createObjectURL;
  savedGlobals.revokeObjectURL = (URL as any).revokeObjectURL;

  (globalThis as any).window = globalThis;
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  (URL as any).createObjectURL = () => 'blob:mock';
  (URL as any).revokeObjectURL = () => undefined;
  resetCloneCooldown();
  clearCloneCache();
});

afterEach(() => {
  clearCloneCache();
  resetCloneCooldown();
  (globalThis as any).window = savedGlobals.window;
  (globalThis as any).localStorage = savedGlobals.localStorage;
  (globalThis as any).Audio = savedGlobals.Audio;
  (globalThis as any).fetch = savedGlobals.fetch;
  (URL as any).createObjectURL = savedGlobals.createObjectURL;
  (URL as any).revokeObjectURL = savedGlobals.revokeObjectURL;
  vi.restoreAllMocks();
});

describe('encodeWav16', () => {
  it('writes a valid mono 16-bit PCM RIFF/WAVE header', () => {
    const pcm = new Float32Array([0, 0.5, -0.5, 1]);
    const wav = parseWav(encodeWav16(pcm, 16000));
    expect(wav.riff).toBe('RIFF');
    expect(wav.wave).toBe('WAVE');
    expect(wav.channels).toBe(1);
    expect(wav.sampleRate).toBe(16000);
    expect(wav.bitsPerSample).toBe(16);
    expect(wav.dataSize).toBe(pcm.length * 2);
    expect(wav.samples).toHaveLength(pcm.length);
  });

  it('round-trips sample values within 16-bit quantization error', () => {
    const pcm = new Float32Array([0, 0.25, -0.25, 0.75, -0.75]);
    const wav = parseWav(encodeWav16(pcm, 8000));
    wav.samples.forEach((s, i) => {
      expect(s / 32768).toBeCloseTo(pcm[i], 4);
    });
  });

  it('clamps samples outside [-1, 1] instead of wrapping', () => {
    const wav = parseWav(encodeWav16(new Float32Array([5, -5]), 16000));
    expect(wav.samples[0]).toBe(32767);
    expect(wav.samples[1]).toBe(-32768);
  });

  it('encodes an empty buffer without a malformed header', () => {
    const wav = parseWav(encodeWav16(new Float32Array([]), 16000));
    expect(wav.riff).toBe('RIFF');
    expect(wav.dataSize).toBe(0);
  });
});

describe('encodeBase64', () => {
  it('matches Node base64 for a realistic payload', () => {
    const bytes = encodeWav16(new Float32Array([0.1, -0.2, 0.3]), 16000);
    expect(encodeBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });

  it('handles payloads larger than the spread chunk size', () => {
    const bytes = new Uint8Array(100_000).fill(7);
    expect(encodeBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });
});

describe('clone readiness + failure cooldown', () => {
  it('is not ready unless both the toggle and a profile are set', () => {
    expect(cloneReady()).toBe(false);
    setVoiceCloneEnabled(true);
    expect(cloneReady()).toBe(false);
    setCloneProfileId('p1');
    expect(cloneReady()).toBe(true);
    setVoiceCloneEnabled(false);
    expect(cloneReady()).toBe(false);
  });

  it('does not attempt synthesis when not ready', async () => {
    const fetchSpy = vi.fn();
    (globalThis as any).fetch = fetchSpy;
    setVoiceCloneEnabled(true);
    setCloneProfileId(null);
    await expect(speakCloned('hello')).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('goes into cooldown after a failed synthesis and recovers on reset', async () => {
    setVoiceCloneEnabled(true);
    setCloneProfileId('p1');
    (globalThis as any).fetch = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({ success: false, error: 'sidecar down' }),
    }));

    await expect(speakCloned('hello')).rejects.toThrow('sidecar down');
    expect(cloneCooldownMs()).toBeGreaterThan(0);
    expect(cloneReady()).toBe(false);

    resetCloneCooldown();
    expect(cloneCooldownMs()).toBe(0);
    expect(cloneReady()).toBe(true);
  });

  it('plays synthesized audio and stays healthy on success', async () => {
    setVoiceCloneEnabled(true);
    setCloneProfileId('p1');
    const play = vi.fn(async () => undefined);
    (globalThis as any).Audio = class {
      constructor(public src: string) {}
      play = play;
      pause = vi.fn();
    };
    (globalThis as any).fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, audioBase64: 'QUJD', mime: 'audio/wav' }),
    }));

    await expect(speakCloned('hello')).resolves.toBe(true);
    expect(play).toHaveBeenCalled();
    expect(cloneCooldownMs()).toBe(0);
    expect(cloneReady()).toBe(true);
  });

  it('does not enter cooldown when playback (not the service) is blocked', async () => {
    setVoiceCloneEnabled(true);
    setCloneProfileId('p1');
    (globalThis as any).Audio = class {
      constructor(public src: string) {}
      play = vi.fn(async () => {
        throw new Error('autoplay blocked');
      });
      pause = vi.fn();
    };
    (globalThis as any).fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, audioBase64: 'QUJD' }),
    }));

    await expect(speakCloned('hello')).rejects.toThrow('autoplay blocked');
    expect(cloneCooldownMs()).toBe(0);
    expect(cloneReady()).toBe(true);
  });
});
