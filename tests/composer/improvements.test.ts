import { describe, expect, it } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { compose, encodeToSeq } from '../../src/lib/composer';
import { ComposerLearner } from '../../src/lib/composer/learner';
import { CHORD_TONES, DOMINANT_QUALITIES } from '../../src/lib/composer/theory';
import type { Track } from '../../src/lib/composer/types';

const BAR = 4 * 480;

function keysAt(track: Track, bar: number): number[] {
  return track.events
    .filter((e) => e.part === 'keys' && e.tick >= bar * BAR && e.tick < (bar + 1) * BAR)
    .map((e) => e.pitch)
    .sort((a, b) => a - b);
}

const tonePcs = (pc: number, q: keyof typeof CHORD_TONES) =>
  new Set(CHORD_TONES[q].map((t) => (((pc + t) % 12) + 12) % 12));

describe('brief resolution honors partial key / major', () => {
  it('honors an explicit key even when major is omitted', () => {
    for (const key of [0, 5, 7, 11]) {
      const t = compose({ style: 'steely-dan', key, bars: 8, seed: 3 });
      expect(t.key).toBe(key);
    }
  });

  it('honors an explicit color even when the key is omitted', () => {
    const minor = compose({ style: 'airplane', major: false, bars: 8, seed: 3 });
    expect(minor.major).toBe(false);
    const major = compose({ style: 'airplane', major: true, bars: 8, seed: 3 });
    expect(major.major).toBe(true);
  });

  it('honors both when supplied, and stays deterministic', () => {
    const a = compose({ style: 'dangelo-glasper', key: 2, major: false, bars: 8, seed: 4 });
    const b = compose({ style: 'dangelo-glasper', key: 2, major: false, bars: 8, seed: 4 });
    expect(a.key).toBe(2);
    expect(a.major).toBe(false);
    expect(a.chords).toEqual(b.chords);
  });
});

describe('steely-dan voicing DNA is actually applied', () => {
  it('voices mu chords with the identifying adjacent whole tone (2nd next to 3rd)', () => {
    let checked = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const t = compose({ style: 'steely-dan', seed, bars: 8 });
      t.chords.forEach((chord, bar) => {
        if (chord.quality !== 'mu') return;
        const notes = keysAt(t, bar);
        if (notes.length < 3) return;
        const pcs = tonePcs(chord.rootPc, 'mu');
        for (const n of notes) expect(pcs.has(((n % 12) + 12) % 12), `mu voicing note ${n}`).toBe(true);
        const gaps = notes.slice(1).map((n, k) => n - notes[k]);
        expect(gaps, `mu bar must contain a whole-tone adjacency`).toContain(2);
        checked++;
      });
    }
    expect(checked, 'expected at least one mu bar across seeds').toBeGreaterThan(0);
  });

  it('voices dominants rootless (the bass owns the root)', () => {
    let checked = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const t = compose({ style: 'steely-dan', seed, bars: 8 });
      t.chords.forEach((chord, bar) => {
        if (!DOMINANT_QUALITIES.has(chord.quality)) return;
        const notes = keysAt(t, bar);
        if (notes.length < 3) return;
        for (const n of notes) expect(((n % 12) + 12) % 12, `dominant voicing must omit root ${chord.rootPc}`).not.toBe(chord.rootPc);
        checked++;
      });
    }
    expect(checked, 'expected at least one dominant bar across seeds').toBeGreaterThan(0);
  });
});

describe('holdBarChance is applied', () => {
  it("d'angelo-glasper holds bars (0.5 chance) instead of always moving", () => {
    let held = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const t = compose({ style: 'dangelo-glasper', seed, bars: 8 });
      for (let i = 1; i < t.bars; i++) {
        if (t.chords[i].rootPc === t.chords[i - 1].rootPc && t.chords[i].quality === t.chords[i - 1].quality) held++;
      }
    }
    expect(held).toBeGreaterThan(0);
  });

  it('never holds the closing bar, so the loop still resolves', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const t = compose({ style: 'steely-dan', seed, bars: 8 });
      expect(t.chords[t.chords.length - 1].rootPc).toBe(t.key);
    }
  });
});

describe('SoundLab .seq derives from the realized track', () => {
  it('carries the realized bar-0 bass pitch and drum hits', () => {
    const t = compose({ style: 'steely-dan', seed: 3, bars: 8 });
    const seq = encodeToSeq(t);
    const bar0 = t.events.filter((e) => e.tick < 1920);
    const bass0 = bar0.filter((e) => e.part === 'bass').sort((a, b) => a.tick - b.tick)[0];
    expect(bass0).toBeTruthy();
    expect(seq.pattern.bass[0]).toMatchObject({ on: true, note: bass0.pitch });

    const kickHits = bar0.filter((e) => e.part === 'drums' && e.drum === 36).length;
    const kickCells = seq.pattern.kick.filter((c) => c.on).length;
    expect(kickCells).toBeGreaterThan(0);
    // Monophonic collapse can only reduce the number of cells, never invent hits.
    expect(kickCells).toBeLessThanOrEqual(kickHits);
  });

  it('splits chord voices across keys layers so the voicing survives', () => {
    const t = compose({ style: 'jasper-ballad', seed: 5, bars: 8 });
    const seq = encodeToSeq(t);
    const keysLayers = Object.keys(seq.pattern).filter((k) => k.startsWith('keys'));
    const bar0Keys = new Set(
      t.events.filter((e) => e.tick < 1920 && e.part === 'keys').map((e) => e.pitch),
    );
    expect(keysLayers.length).toBe(bar0Keys.size);

    const head = t.chords[0];
    const pcs = new Set(CHORD_TONES[head.quality].map((x) => (((head.rootPc + x) % 12) + 12) % 12));
    for (const layer of keysLayers) {
      for (const cell of seq.pattern[layer]) {
        if (cell.on && typeof cell.note === 'number') {
          expect(pcs.has(((cell.note % 12) + 12) % 12)).toBe(true);
        }
      }
    }
  });
});

describe('learner suggestions are deterministic', () => {
  it('returns identical suggestions for unchanged learner state', () => {
    const file = path.join(os.tmpdir(), `cl-det-${Date.now()}-${Math.floor(Math.random() * 1e6)}.json`);
    const lr = new ComposerLearner(file);
    lr.rate({ style: 'steely-dan', seed: 5, bars: 8 }, 5);
    const a = lr.suggestNext('steely-dan', 4, 8);
    const b = lr.suggestNext('steely-dan', 4, 8);
    expect(a).toEqual(b);
    expect(a).toHaveLength(4);
  });
});
