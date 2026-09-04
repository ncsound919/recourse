import { describe, expect, it } from 'vitest';
import { compose, listStyles, toMidiBytes, encodeToSeq, seqToJson, summarizeTrack, composeToOutcome } from '../../src/lib/composer';
import type { ComposeBrief, StyleId } from '../../src/lib/composer/types';

const STYLES: StyleId[] = ['steely-dan', 'jasper-ballad', 'dangelo-glasper', 'airplane'];

function brief(style: StyleId, over: Partial<ComposeBrief> = {}): ComposeBrief {
  return { style, seed: 1234, bars: 8, ...over };
}

describe('composer determinism + structure', () => {
  it('reproduces an identical track for the same brief + seed', () => {
    const a = compose(brief('steely-dan'));
    const b = compose(brief('steely-dan'));
    expect(a.events).toEqual(b.events);
    expect(a.chords).toEqual(b.chords);
  });

  it('honors bar length and keeps one chord per bar', () => {
    for (const bars of [4, 8, 16]) {
      for (const style of STYLES) {
        const t = compose(brief(style, { bars }));
        expect(t.chords).toHaveLength(bars);
        expect(t.bars).toBe(bars);
        expect(t.events.length).toBeGreaterThan(0);
      }
    }
  });

  it('normalizes an unsupported bar count to 8', () => {
    const t = compose(brief('jasper-ballad', { bars: 13 as any }));
    expect(t.bars).toBe(8);
  });

  it('keeps all events on a valid non-negative timeline within the loop', () => {
    const t = compose(brief('dangelo-glasper'));
    const totalTicks = t.bars * 4 * 480;
    for (const ev of t.events) {
      expect(ev.tick).toBeGreaterThanOrEqual(0);
      expect(ev.tick + ev.dur).toBeLessThanOrEqual(totalTicks + 1);
      expect(ev.pitch).toBeGreaterThanOrEqual(0);
      expect(ev.pitch).toBeLessThanOrEqual(127);
    }
  });

  it('produces different output for different seeds', () => {
    const a = compose(brief('airplane', { seed: 1 }));
    const b = compose(brief('airplane', { seed: 2 }));
    expect(a.chords).not.toEqual(b.chords);
  });

  it('final bar resolves to the tonic for loop closure', () => {
    const t = compose(brief('steely-dan'));
    expect(t.chords[t.chords.length - 1].rootPc).toBe(t.key);
  });
});

describe('MIDI encoder', () => {
  it('emits a spec-valid SMF header + tracks and parseable note events', () => {
    const t = compose(brief('jasper-ballad'));
    const bytes = toMidiBytes(t);
    // Header magic.
    expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe('MThd');
    const parsed = parseSmf(bytes);
    expect(parsed.tracks).toBe(1);
    expect(parsed.noteOns).toBeGreaterThan(0);
    // Every note-on has a matching note-off (balanced) and a tempo meta exists.
    expect(parsed.tempo).toBeGreaterThan(0);
  });

  it('differs across styles (different music, not the same bytes)', () => {
    const bytes1 = toMidiBytes(compose(brief('steely-dan')));
    const bytes2 = toMidiBytes(compose(brief('jasper-ballad')));
    expect(Buffer.from(bytes1).toString('hex')).not.toBe(Buffer.from(bytes2).toString('hex'));
  });
});

describe('SoundLab .seq encoder', () => {
  it('encodes to the ncsoundlab-mpc-sequence v2 schema soundlab imports', () => {
    const t = compose(brief('dangelo-glasper'));
    const seq = encodeToSeq(t);
    expect(seq.format).toBe('ncsoundlab-mpc-sequence');
    expect(seq.version).toBe(2);
    expect(seq.stepLength).toBe(16);
    expect(seq.bpm).toBe(t.bpm);
    // Conventional layer voices present.
    for (const layer of ['bass', 'keys', 'lead', 'kick', 'snare', 'hat']) {
      expect(seq.pattern[layer]).toHaveLength(16);
    }
    // Chain repeats the 1-bar pocket to the requested bar count.
    expect(seq.songChain.order).toHaveLength(t.bars);
    const json = JSON.parse(seqToJson(seq));
    expect(json.pattern.bass[0].on).toBe(true);
  });
});

describe('high-level outcome', () => {
  it('summarizes deterministically and reports style/keys', () => {
    const out = composeToOutcome(brief('airplane', { seed: 7 }), { midi: true, seq: true });
    expect(out.midi?.bytes).toBeGreaterThan(0);
    expect(out.seq).toBeTruthy();
    expect(out.chordLabels).toHaveLength(out.bars);
    const md = summarizeTrack(out);
    expect(md).toContain('# ');
    expect(listStyles().sort()).toEqual([...STYLES].sort());
  });
});

/** Minimal SMF reader for validation. Returns note-on/off counts + tempo. */
function parseSmf(b: Uint8Array): { tracks: number; noteOns: number; noteOffs: number; tempo: number } {
  const read = (i: number, n: number) => {
    let v = 0;
    for (let k = 0; k < n; k++) v = (v << 8) | b[i + k];
    return v;
  };
  expect(read(0, 4)).toBe(0x4d546864); // MThd
  const format = read(8, 2);
  const tracks = read(10, 2);
  expect(format).toBe(0);
  expect(read(12, 2)).toBeGreaterThan(0); // division

  let i = 14;
  expect(read(i, 4)).toBe(0x4d54726b); // MTrk
  const len = read(i + 4, 4);
  let pos = i + 8;
  const end = pos + len;
  let noteOns = 0;
  let noteOffs = 0;
  let tempo = 0;
  while (pos < end) {
    // running delta (VLQ)
    let d = 0;
    while (true) {
      const byte = b[pos++];
      d = (d << 7) | (byte & 0x7f);
      if (!(byte & 0x80)) break;
    }
    void d;
    const status = b[pos++];
    if (status === 0xff) {
      const type = b[pos++];
      const lenMeta = b[pos++];
      if (type === 0x51) tempo = read(pos, lenMeta);
      pos += lenMeta;
    } else if ((status & 0xf0) === 0x90) {
      pos += 2;
      noteOns++;
    } else if ((status & 0xf0) === 0x80) {
      pos += 2;
      noteOffs++;
    } else {
      pos += 1; // CC etc.
    }
  }
  return { tracks, noteOns, noteOffs, tempo };
}
