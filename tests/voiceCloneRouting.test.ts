import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// Integration test for the CORE promise of the voice-clone feature: `speak()`
// must route narration through cloned synthesis when a profile is active, and
// fall back to Web Speech when cloning is off, fails, or is in cooldown.
//
// `voice.ts` reads localStorage at import time, so every test installs the
// browser globals THEN imports the module fresh (vi.resetModules).

const saved: Record<string, unknown> = {};

interface LoadOptions {
  cloneEnabled: boolean;
  profileId: string | null;
  fetchImpl?: (...args: any[]) => Promise<any>;
  playbackOk?: boolean;
}

async function loadVoice(opts: LoadOptions) {
  const store = new Map<string, string>([['recourse_voice_narration', 'true']]);
  if (opts.cloneEnabled) store.set('recourse_voice_clone_enabled', 'true');
  if (opts.profileId) store.set('recourse_voice_clone_profile', opts.profileId);

  const localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  };
  const speak = vi.fn();
  (globalThis as any).window = {
    localStorage,
    speechSynthesis: { cancel: vi.fn(), speak, getVoices: vi.fn(() => []) },
  };
  (globalThis as any).localStorage = localStorage;
  (globalThis as any).SpeechSynthesisUtterance = class {
    constructor(public text: string) {}
  };
  (globalThis as any).fetch = opts.fetchImpl ?? vi.fn();
  (globalThis as any).Audio = class {
    constructor(public src: string) {}
    play = vi.fn(async () => {
      if (opts.playbackOk === false) throw new Error('autoplay blocked');
    });
    pause = vi.fn();
  };
  (URL as any).createObjectURL = () => 'blob:mock';
  (URL as any).revokeObjectURL = () => undefined;

  vi.resetModules();
  const voice = await import('../src/lib/voice');
  return { voice, speak };
}

const okFetch = () =>
  vi.fn(async (_url: string, _init?: unknown) => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, audioBase64: 'QUJD', mime: 'audio/wav' }),
  }));

const failFetch = () =>
  vi.fn(async (_url: string, _init?: unknown) => ({
    ok: false,
    status: 503,
    json: async () => ({ success: false, error: 'sidecar down' }),
  }));

beforeEach(() => {
  // The fallback path intentionally logs a warning; keep test output clean.
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  saved.window = (globalThis as any).window;
  saved.speech = (globalThis as any).SpeechSynthesisUtterance;
  saved.fetch = (globalThis as any).fetch;
  saved.Audio = (globalThis as any).Audio;
});

afterEach(() => {
  (globalThis as any).window = saved.window;
  (globalThis as any).SpeechSynthesisUtterance = saved.speech;
  (globalThis as any).fetch = saved.fetch;
  (globalThis as any).Audio = saved.Audio;
  vi.restoreAllMocks();
});

describe('speak() clone routing', () => {
  it('uses cloned synthesis (not Web Speech) when a profile is active', async () => {
    const fetchImpl = okFetch();
    const { voice, speak } = await loadVoice({ cloneEnabled: true, profileId: 'p1', fetchImpl });

    voice.speak('hello');
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/recourse/voice/speak');

    await new Promise((r) => setTimeout(r, 25));
    expect(speak).not.toHaveBeenCalled();
  });

  it('falls back to Web Speech when cloned synthesis fails', async () => {
    const { voice, speak } = await loadVoice({ cloneEnabled: true, profileId: 'p1', fetchImpl: failFetch() });

    voice.speak('hello');
    await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
  });

  it('falls back when cloned playback is blocked, without entering cooldown', async () => {
    const { voice, speak } = await loadVoice({
      cloneEnabled: true,
      profileId: 'p1',
      fetchImpl: okFetch(),
      playbackOk: false,
    });

    voice.speak('hello');
    await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(1));

    // A second call still attempts the clone (playback was the problem, not the service).
    const clone = await import('../src/lib/voiceClone');
    expect(clone.cloneReady()).toBe(true);
  });

  it('uses Web Speech with no network call when cloning is disabled', async () => {
    const fetchImpl = okFetch();
    const { voice, speak } = await loadVoice({ cloneEnabled: false, profileId: 'p1', fetchImpl });

    voice.speak('hello');
    expect(speak).toHaveBeenCalledTimes(1);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('stops hitting a dead sidecar after the first failure (cooldown)', async () => {
    const fetchImpl = failFetch();
    const { voice, speak } = await loadVoice({ cloneEnabled: true, profileId: 'p1', fetchImpl });

    voice.speak('first');
    await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // Subsequent narration goes straight to Web Speech — no repeated failing fetch.
    voice.speak('second');
    voice.speak('third');
    await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(3));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
