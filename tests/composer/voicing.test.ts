import { describe, expect, it } from 'vitest';
import { voiceMuChord, voiceRootless, DOMINANT_QUALITIES, CHORD_TONES } from '../../src/lib/composer/theory';
import { getLexicon, STYLE_LEXICONS } from '../../src/lib/composer/lexicons';
import { compose } from '../../src/lib/composer';

function adjacentWholeTone(notes: number[]): boolean {
  const s = [...notes].sort((a, b) => a - b);
  for (let i = 1; i < s.length; i++) if (s[i] - s[i - 1] === 2) return true;
  return false;
}

describe('steely-dan deepening — mu(add2) voicing rule', () => {
  it('keeps the added 2nd adjacent (whole tone) to the 3rd for any root', () => {
    for (let rootPc = 0; rootPc < 12; rootPc++) {
      const v = voiceMuChord(rootPc);
      expect(adjacentWholeTone(v)).toBe(true); // the identifying mu sound
      expect(v.length).toBeGreaterThanOrEqual(3);
      const asc = [...v].sort((a, b) => a - b);
      expect(asc).toEqual(v); // ascending
    }
  });

  it('mu tone set contains root, add2, 3rd, 5th', () => {
    expect(CHORD_TONES.mu).toEqual([0, 2, 4, 7]);
  });
});

describe('steely-dan deepening — rootless dominant voicings', () => {
  it('omits the chord root so extensions ring (bass owns the root)', () => {
    for (const q of ['7b9', '7#11', '7b13', '9', '13', '7']) {
      const rootPc = 2; // D
      const v = voiceRootless(rootPc, q as any);
      expect(v.length).toBeGreaterThan(0);
      for (const n of v) expect(((n % 12) + 12) % 12).not.toBe(rootPc); // no root
    }
  });

  it('classifies the dominant/altered family', () => {
    expect(DOMINANT_QUALITIES.has('7b9')).toBe(true);
    expect(DOMINANT_QUALITIES.has('7#11')).toBe(true);
    expect(DOMINANT_QUALITIES.has('mu')).toBe(false);
    expect(DOMINANT_QUALITIES.has('maj7')).toBe(false);
  });
});

describe('steely-dan deepening — lexicon + determinism', () => {
  it('steely-dan lexicon opts into the steely voicer; others do not', () => {
    expect(STYLE_LEXICONS['steely-dan'].voicer).toBe('steely');
    expect(STYLE_LEXICONS['jasper-ballad'].voicer).toBeUndefined();
    expect(getLexicon('steely-dan').voicer).toBe('steely');
  });

  it('steely-dan composition stays deterministic and structurally valid after deepening', () => {
    const a = compose({ style: 'steely-dan', seed: 42, bars: 8 });
    const b = compose({ style: 'steely-dan', seed: 42, bars: 8 });
    expect(a.events).toEqual(b.events);
    expect(a.events.length).toBeGreaterThan(0);
    expect(a.chords).toHaveLength(8);
  });
});
