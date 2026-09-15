import { describe, it, expect, vi, afterEach, beforeEach, beforeAll } from 'vitest';
import type { MockInstance } from 'vitest';

// narration.ts imports ./voice.ts. Both are browser-oriented modules whose
// module-level state is read from localStorage at import time and whose
// functions guard on `window`. In vitest's isolated node realm a direct
// `globalThis.window` assignment propagates into imported modules (vi.stubGlobal
// does not), so we install the browser globals directly before the first
// dynamic import.
let voice: any;
let narration: any;
let utterances: any[];
let oscs: any[];
let speech: { cancel: MockInstance; speak: MockInstance; getVoices: MockInstance };
let storage: { getItem: MockInstance; setItem: MockInstance; removeItem: MockInstance };

function makeStorage(seed: Record<string, string>) {
  const store = new Map<string, string>(Object.entries(seed));
  return {
    store,
    getItem: vi.fn((k: string) => (store.has(k) ? store.get(k)! : null)),
    setItem: vi.fn((k: string, v: string) => void store.set(k, String(v))),
    removeItem: vi.fn((k: string) => void store.delete(k)),
  };
}

function installWindow() {
  utterances = [];
  oscs = [];
  storage = makeStorage({});
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
    speechSynthesis: {
      cancel: vi.fn(),
      speak: vi.fn(),
      getVoices: vi.fn(() => [] as any[]),
    },
    AudioContext,
  };
  speech = w.speechSynthesis;
  (globalThis as any).window = w;
  (globalThis as any).SpeechSynthesisUtterance = FakeUtterance;
  (globalThis as any).localStorage = storage;
  return w;
}

function clearGlobals() {
  (globalThis as any).window = undefined;
  (globalThis as any).SpeechSynthesisUtterance = undefined;
  (globalThis as any).localStorage = undefined;
}

const REAL_NOW = Date.now();
let testTick = 0;

beforeAll(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(REAL_NOW);
  // First import in this file's registry: seed a stored narration level of
  // "quiet" so the module-restore path of the level variable is exercised.
  const seed = makeStorage({ recourse_narration_level: 'quiet', recourse_voice_narration: 'false' });
  (globalThis as any).window = {
    localStorage: seed,
    speechSynthesis: { cancel: vi.fn(), speak: vi.fn(), getVoices: vi.fn(() => []) },
    AudioContext: class {
      currentTime = 100;
      destination = {};
      createOscillator() {
        return { type: '', frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
      }
      createGain() {
        return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() };
      }
    },
  };
  (globalThis as any).localStorage = seed;
  voice = await import('../src/lib/voice');
  narration = await import('../src/lib/narration');
  // The persisted level ("quiet") was restored from localStorage at import time;
  // beforeEach resets it afterwards for the other tests.
  expect(narration.getNarrationLevel()).toBe('quiet');
});

beforeEach(() => {
  clearGlobals();
  vi.useFakeTimers();
  vi.setSystemTime(REAL_NOW + testTick++ * 120_000); // strictly increasing per test → stale per-kind throttle records never interfere
  installWindow();
  voice.setVoiceEnabled(false);
  narration.setNarrationLevel('normal');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  clearGlobals();
});

// Advance fake time past every per-kind minimum gap (max 45_000ms).
function letGapElapse() {
  vi.advanceTimersByTime(60_000);
}

describe('narration level management', () => {
  it('setNarrationLevel updates the level and persists it', () => {
    narration.setNarrationLevel('verbose');
    expect(narration.getNarrationLevel()).toBe('verbose');
    expect(storage.setItem).toHaveBeenCalledWith('recourse_narration_level', 'verbose');
    narration.setNarrationLevel('quiet');
    expect(narration.getNarrationLevel()).toBe('quiet');
    narration.setNarrationLevel('normal');
    expect(narration.getNarrationLevel()).toBe('normal');
  });

  it('narrationLevelLabel maps each level to its badge string', () => {
    expect(narration.narrationLevelLabel('quiet')).toBe('QUIET');
    expect(narration.narrationLevelLabel('verbose')).toBe('VERBOSE');
    expect(narration.narrationLevelLabel('normal')).toBe('NORMAL');
  });
});

describe('announce — verbosity gating', () => {
  it('quiet level allows only critical + major events', () => {
    narration.setNarrationLevel('quiet');
    voice.setVoiceEnabled(true);
    letGapElapse();
    narration.announce('minor', 'minor event');
    expect(speech.speak).not.toHaveBeenCalled();
    letGapElapse();
    narration.announce('milestone', 'milestone event');
    expect(speech.speak).not.toHaveBeenCalled();
    letGapElapse();
    narration.announce('major', 'major event');
    expect(speech.speak).toHaveBeenCalledTimes(1);
    letGapElapse();
    narration.announce('critical', 'critical event');
    expect(speech.speak).toHaveBeenCalledTimes(2);
  });

  it('normal level (default) allows minor but not milestone', () => {
    voice.setVoiceEnabled(true);
    letGapElapse();
    narration.announce('milestone', 'milestone event');
    expect(speech.speak).not.toHaveBeenCalled();
    letGapElapse();
    narration.announce('minor', 'minor event');
    expect(speech.speak).toHaveBeenCalledTimes(1);
    narration.announce('major', 'major event');
    expect(speech.speak).toHaveBeenCalledTimes(2);
  });

  it('verbose level allows milestone announcements too', () => {
    narration.setNarrationLevel('verbose');
    voice.setVoiceEnabled(true);
    letGapElapse();
    narration.announce('milestone', 'a milestone happened');
    expect(speech.speak).toHaveBeenCalledTimes(1);
  });
});

describe('announce — master mute and force', () => {
  it('silences everything while the master voice mute is on', () => {
    voice.setVoiceEnabled(false);
    letGapElapse();
    narration.announce('critical', 'should be silent');
    expect(speech.speak).not.toHaveBeenCalled();
  });

  it('force bypasses the mute (user-initiated read-aloud)', () => {
    voice.setVoiceEnabled(false);
    narration.announce('critical', 'read this aloud', { force: true });
    expect(speech.speak).toHaveBeenCalledTimes(1);
    expect(utterances[0].text).toBe('read this aloud');
  });
});

describe('announce — per-kind throttle', () => {
  it('drops repeats within the minimum inter-announcement gap for a kind', () => {
    voice.setVoiceEnabled(true);
    narration.setNarrationLevel('verbose');
    // No gap elapsed: the second minor announcement within 8s must be dropped.
    narration.announce('minor', 'first tick');
    expect(speech.speak).toHaveBeenCalledTimes(1);
    narration.announce('minor', 'second tick');
    expect(speech.speak).toHaveBeenCalledTimes(1);
    // After the gap the same kind flows again.
    letGapElapse();
    narration.announce('minor', 'third tick');
    expect(speech.speak).toHaveBeenCalledTimes(2);
  });

  it('force ignores the throttle window', () => {
    voice.setVoiceEnabled(true);
    letGapElapse();
    narration.announce('minor', 'one');
    expect(speech.speak).toHaveBeenCalledTimes(1);
    narration.announce('minor', 'two', { force: true });
    expect(speech.speak).toHaveBeenCalledTimes(2);
  });
});

describe('announce — chirp selection', () => {
  it('chooses a chirp per kind and honours an explicit chirp override', () => {
    voice.setVoiceEnabled(true);
    narration.setNarrationLevel('verbose');

    letGapElapse();
    narration.announce('critical', 'boom'); // default: alert → square
    expect(oscs[oscs.length - 1].type).toBe('square');

    letGapElapse();
    narration.announce('major', 'green light'); // default: success → sine @ 523.25
    expect(oscs[oscs.length - 1].type).toBe('sine');

    letGapElapse();
    narration.announce('milestone', 'level up'); // default: synthesize → triangle
    expect(oscs[oscs.length - 1].type).toBe('triangle');

    letGapElapse();
    narration.announce('minor', 'tick'); // default: loop_tick → sine @ 800
    expect(oscs[oscs.length - 1].type).toBe('sine');
    expect(oscs[oscs.length - 1].frequency.setValueAtTime).toHaveBeenCalledWith(800, 100);

    letGapElapse();
    narration.announce('critical', 'explicit failure chirp', { chirp: 'failure' });
    expect(oscs[oscs.length - 1].type).toBe('sawtooth');
  });
});

describe('speakBrief', () => {
  it('speaks a non-empty brief with force even while muted', () => {
    voice.setVoiceEnabled(false);
    narration.speakBrief('   ');
    expect(speech.speak).not.toHaveBeenCalled();
    narration.speakBrief('Targeting insulin resistance via PI3K.');
    expect(speech.speak).toHaveBeenCalledTimes(1);
    expect(utterances).toHaveLength(1);
    expect(utterances[0].text).toBe('Targeting insulin resistance via PI3K.');
  });
});
