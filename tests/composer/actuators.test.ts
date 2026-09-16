import { describe, it, expect } from 'vitest';
import { compose } from '../../src/lib/composer/composer';
import { renderTrackToWav, renderStemToWav, renderStems } from '../../src/lib/composer/encode/wav';
import { trackToMidiMessages } from '../../src/lib/composer/encode/webmidi';

const track = compose({ style: 'jasper-ballad', seed: 7, bars: 4 });

function ascii(bytes: Uint8Array, off: number, len: number): string {
  return Array.from(bytes.slice(off, off + len)).map((b) => String.fromCharCode(b)).join('');
}

describe('offline WAV renderer', () => {
  it('produces a valid, deterministic stereo PCM WAV', () => {
    const a = renderTrackToWav(track, { sampleRate: 8000, maxSeconds: 20 });
    const b = renderTrackToWav(track, { sampleRate: 8000, maxSeconds: 20 });
    expect(ascii(a, 0, 4)).toBe('RIFF');
    expect(ascii(a, 8, 4)).toBe('WAVE');
    expect(ascii(a, 36, 4)).toBe('data');
    expect(a.byteLength).toBeGreaterThan(44);
    // Bit-for-bit deterministic.
    expect(Array.from(a)).toEqual(Array.from(b));
    // Real audio, not silence.
    expect(a.slice(44).some((x) => x !== 0)).toBe(true);
  });

  it('renders per-part stems and a drum stem that actually sounds', () => {
    const stems = renderStems(track, { sampleRate: 8000, maxSeconds: 20 });
    expect(stems.length).toBeGreaterThan(0);
    const drums = renderStemToWav(track, 'drums', { sampleRate: 8000, maxSeconds: 20 });
    expect(ascii(drums, 0, 4)).toBe('RIFF');
    expect(drums.slice(44).some((x) => x !== 0)).toBe(true);
  });

  it('a silent (no-events) stem is still a valid WAV', () => {
    const empty = { ...track, events: [] };
    const wav = renderTrackToWav(empty, { sampleRate: 8000, maxSeconds: 2 });
    expect(ascii(wav, 0, 4)).toBe('RIFF');
    expect(wav.byteLength).toBeGreaterThanOrEqual(44);
    expect(wav.slice(44).every((x) => x === 0)).toBe(true);
  });
});

describe('Web MIDI message scheduling (pure)', () => {
  it('emits sorted note-on/note-off pairs deterministically', () => {
    const msgs = trackToMidiMessages(track);
    expect(msgs.length).toBe(track.events.length * 2);
    for (let i = 1; i < msgs.length; i++) {
      expect(msgs[i].timeMs).toBeGreaterThanOrEqual(msgs[i - 1].timeMs);
    }
    // Note-offs (order 0) sort before note-ons (order 1) at equal time.
    const firstOn = msgs.find((m) => m.order === 1)!;
    expect(firstOn.data[0] & 0xf0).toBe(0x90);
    expect(trackToMidiMessages(track)).toEqual(msgs);
  });
});
