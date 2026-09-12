import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import type { MockInstance } from 'vitest';

// voice.ts is browser-oriented: its module-level state is read from
// localStorage at import time and its functions guard on `window`. Vitest's
// node environment has no window, and vi.stubGlobal does NOT propagate into the
// isolated module realm — but a direct `globalThis.window` assignment does.
// So we assign window/utterance globals directly and import dynamically.
let voice: any;
let utterances: any[];
let oscs: any[];
let speech: { cancel: MockInstance; speak: MockInstance; getVoices: MockInstance };

interface WindowOptions {
  voices?: Array<{ name: string; lang: string }>;
  storedNarration?: string | null;
  withSpeechSynthesis?: boolean;
  audioMode?: 'ok' | 'missing' | 'webkit' | 'throw';
  cancelThrows?: boolean;
  speakThrows?: boolean;
}

function makeStorage(storedNarration: string | null) {
  const store = new Map<string, string>();
  if (storedNarration !== null) store.set('recourse_voice_narration', storedNarration);
  return {
    store,
    getItem: vi.fn((k: string) => (store.has(k) ? store.get(k)! : null)),
    setItem: vi.fn((k: string, v: string) => void store.set(k, String(v))),
    removeItem: vi.fn((k: string) => void store.delete(k)),
  };
}

function installWindow(opts: WindowOptions = {}) {
  utterances = [];
  oscs = [];
  const storage = makeStorage(opts.storedNarration ?? null);

  class FakeUtterance {
    voice: any = null;
    pitch = 0;
    rate = 0;
    constructor(public text: string) {
      utterances.push(this);
    }
  }

  function makeOsc() {
    const o: any = {
      type: '',
      frequency: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    oscs.push(o);
    return o;
  }
  function makeGain() {
    return {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
  }
  class AudioContext {
    currentTime = 100;
    destination = {};
    createOscillator() {
      return makeOsc();
    }
    createGain() {
      return makeGain();
    }
  }

  const w: any = {
    localStorage: storage,
    speechSynthesis: opts.withSpeechSynthesis === false ? undefined : {
      cancel: vi.fn(() => {
        if (opts.cancelThrows) throw new Error('cancel failed');
      }),
      speak: vi.fn(() => {
        if (opts.speakThrows) throw new Error('speak failed');
      }),
      getVoices: vi.fn(() => opts.voices ?? []),
    },
  };
  if (opts.audioMode !== 'missing') w.AudioContext = AudioContext;
  if (opts.audioMode === 'webkit') {
    delete w.AudioContext;
    w.webkitAudioContext = AudioContext;
  }
  if (opts.audioMode === 'throw') {
    w.AudioContext = class {
      constructor() {
        throw new Error('audio context denied');
      }
    };
  }

  speech = w.speechSynthesis;
  (globalThis as any).window = w;
  (globalThis as any).SpeechSynthesisUtterance = FakeUtterance;
  (globalThis as any).localStorage = storage;
  return { window: w, storage };
}

function clearGlobals() {
  (globalThis as any).window = undefined;
  (globalThis as any).SpeechSynthesisUtterance = undefined;
  (globalThis as any).localStorage = undefined;
}

beforeEach(() => {
  clearGlobals();
});

afterEach(() => {
  vi.restoreAllMocks();
  clearGlobals();
});

describe('voice.ts module init (localStorage at import)', () => {
  it('reads the stored narration flag at module load', async () => {
    installWindow({ storedNarration: 'true' });
    voice = await import('../src/lib/voice');
    expect(voice.isVoiceEnabled()).toBe(true);
  });

  it('stays disabled when storage access throws (defensive catch)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (globalThis as any).window = {
      localStorage: {
        getItem: () => {
          throw new Error('storage denied');
        },
        setItem: () => {
          throw new Error('storage denied');
        },
      },
    };
    (globalThis as any).localStorage = {
      getItem: () => {
        throw new Error('storage denied');
      },
      setItem: () => {
        throw new Error('storage denied');
      },
    };
    // @ts-expect-error query suffix busts the module cache at runtime; TS cannot resolve it.
    const v = await import('../src/lib/voice?init-storage-throw');
    expect(v.isVoiceEnabled()).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});

describe('isVoiceEnabled / setVoiceEnabled', () => {
  it('reflects the module state after toggling', async () => {
    voice = await import('../src/lib/voice');
    voice.setVoiceEnabled(true);
    expect(voice.isVoiceEnabled()).toBe(true);
    voice.setVoiceEnabled(false);
    expect(voice.isVoiceEnabled()).toBe(false);
  });

  it('persists the flag to localStorage when a window is present', async () => {
    voice = await import('../src/lib/voice');
    const { storage } = installWindow();
    voice.setVoiceEnabled(true);
    expect(storage.setItem).toHaveBeenCalledWith('recourse_voice_narration', 'true');
    voice.setVoiceEnabled(false);
    expect(storage.setItem).toHaveBeenCalledWith('recourse_voice_narration', 'false');
  });

  it('swallows localStorage write failures (catch path)', async () => {
    voice = await import('../src/lib/voice');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (globalThis as any).window = {
      localStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error('quota exceeded');
        },
      },
    };
    (globalThis as any).localStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
    };
    voice.setVoiceEnabled(true);
    expect(voice.isVoiceEnabled()).toBe(true);
    expect(warn).toHaveBeenCalled();
  });
});

describe('speak', () => {
  it('no-ops when there is no window (server-side)', async () => {
    voice = await import('../src/lib/voice');
    clearGlobals();
    expect(() => voice.speak('hello')).not.toThrow();
  });

  it('no-ops when speechSynthesis is unavailable', async () => {
    voice = await import('../src/lib/voice');
    installWindow({ withSpeechSynthesis: false });
    voice.setVoiceEnabled(true);
    expect(() => voice.speak('hello')).not.toThrow();
    expect(utterances).toHaveLength(0);
  });

  it('no-ops while muted unless forced', async () => {
    voice = await import('../src/lib/voice');
    installWindow({ voices: [{ name: 'Google US English', lang: 'en-US' }] });
    voice.setVoiceEnabled(false);
    voice.speak('silent');
    expect(utterances).toHaveLength(0);
    voice.speak('forced', true);
    expect(utterances).toHaveLength(1);
  });

  it('cancels prior speech and prefers a Google/Natural/en-US English voice', async () => {
    voice = await import('../src/lib/voice');
    installWindow({
      voices: [
        { name: 'Deutsch', lang: 'de-DE' },
        { name: 'Google US English', lang: 'en-US' },
        { name: 'Microsoft Zira', lang: 'en-US' },
      ],
    });
    voice.setVoiceEnabled(true);
    voice.speak('telemetry');
    expect(speech.cancel).toHaveBeenCalledTimes(1);
    expect(speech.speak).toHaveBeenCalledTimes(1);
    expect(utterances).toHaveLength(1);
    expect(utterances[0].text).toBe('telemetry');
    expect(utterances[0].voice.name).toBe('Google US English');
    expect(utterances[0].pitch).toBe(0.95);
    expect(utterances[0].rate).toBe(1.05);
  });

  it('falls back to voices[0] when no preferred voice matches', async () => {
    voice = await import('../src/lib/voice');
    installWindow({ voices: [{ name: 'Only Voice', lang: 'xx-XX' }] });
    voice.setVoiceEnabled(true);
    voice.speak('fallback');
    expect(utterances[0].voice.name).toBe('Only Voice');
  });

  it('leaves the voice unset when getVoices() is empty', async () => {
    voice = await import('../src/lib/voice');
    installWindow({ voices: [] });
    voice.setVoiceEnabled(true);
    voice.speak('no voices');
    expect(utterances[0].voice).toBeNull();
  });

  it('surfaces cancel() and speak() errors to console without throwing', async () => {
    voice = await import('../src/lib/voice');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    installWindow({ voices: [{ name: 'Google US English', lang: 'en-US' }], cancelThrows: true, speakThrows: true });
    voice.setVoiceEnabled(true);
    expect(() => voice.speak('trouble')).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe('playChirp', () => {
  it('no-ops without a window, without AudioContext, or while muted', async () => {
    voice = await import('../src/lib/voice');
    voice.setVoiceEnabled(true);
    clearGlobals();
    expect(() => voice.playChirp('success')).not.toThrow();

    installWindow({ audioMode: 'missing' });
    voice.setVoiceEnabled(true);
    expect(() => voice.playChirp('alert')).not.toThrow();
    expect(oscs).toHaveLength(0);

    voice.setVoiceEnabled(false);
    installWindow(); // audio present again
    voice.playChirp('alert');
    expect(oscs).toHaveLength(0);
  });

  it('uses the webkitAudioContext fallback when AudioContext is absent', async () => {
    // NOTE: the guard at voice.ts:69 (`!window.AudioContext`) returns before the
    // `window.webkitAudioContext` fallback at line 73 can ever run, so the
    // fallback line is genuinely unreachable. This test documents the guard
    // behavior (no chirp, no crash) rather than asserting on the fallback.
    voice = await import('../src/lib/voice');
    installWindow({ audioMode: 'webkit' });
    voice.setVoiceEnabled(true);
    expect(() => voice.playChirp('loop_tick')).not.toThrow();
    expect(oscs).toHaveLength(0);
  });

  it('synthesizes each chirp envelope on the real Web Audio graph', async () => {
    voice = await import('../src/lib/voice');
    installWindow();
    voice.setVoiceEnabled(true);

    voice.playChirp('success');
    let osc = oscs[oscs.length - 1];
    expect(osc.type).toBe('sine');
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(523.25, 100);
    expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(1046.5, 100.15);
    expect(osc.stop).toHaveBeenCalledWith(100.2);

    voice.playChirp('failure');
    osc = oscs[oscs.length - 1];
    expect(osc.type).toBe('sawtooth');
    expect(osc.frequency.linearRampToValueAtTime).toHaveBeenCalledWith(110, 100.25);
    expect(osc.stop).toHaveBeenCalledWith(100.3);

    voice.playChirp('synthesize');
    osc = oscs[oscs.length - 1];
    expect(osc.type).toBe('triangle');
    expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(880, 100.2);
    expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(440, 100.35);
    expect(osc.stop).toHaveBeenCalledWith(100.4);

    voice.playChirp('loop_tick');
    osc = oscs[oscs.length - 1];
    expect(osc.type).toBe('sine');
    expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(1200, 100.05);
    expect(osc.stop).toHaveBeenCalledWith(100.08);

    voice.playChirp('alert');
    osc = oscs[oscs.length - 1];
    expect(osc.type).toBe('square');
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(660, 100);
    expect(osc.frequency.linearRampToValueAtTime).toHaveBeenCalledWith(330, 100.12);
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(440, 100.16);
    expect(osc.stop).toHaveBeenCalledWith(100.32);

    expect(oscs).toHaveLength(5);
    for (const o of oscs) {
      expect(o.connect).toHaveBeenCalled();
      expect(o.start).toHaveBeenCalled();
    }
  });

  it('logs Web Audio failures at debug level instead of throwing', async () => {
    voice = await import('../src/lib/voice');
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    installWindow({ audioMode: 'throw' });
    voice.setVoiceEnabled(true);
    expect(() => voice.playChirp('success')).not.toThrow();
    expect(debug).toHaveBeenCalled();
  });
});
