import { describe, expect, it } from 'vitest';
import { compose, encodeSoundlabPiece, validatePiece } from '../../src/lib/composer';

describe('SoundLab piece emitter', () => {
  it('emits a deterministic, chord-correct 1-bar piece from a loop', () => {
    for (const style of ['steely-dan', 'jasper-ballad', 'dangelo-glasper', 'airplane'] as const) {
      const track = compose({ style, seed: 3, bars: 8 });
      const piece = encodeSoundlabPiece(track);
      expect(piece.format).toBe('recourse-soundlab-piece');
      expect(piece.version).toBe(1);
      expect(piece.bpm).toBe(track.bpm);
      expect(piece.chainBars).toBe(8);
      expect(validatePiece(piece)).toEqual([]); // every voiced note is a chord tone; bass is the root

      const ids = new Set(piece.layers.map((l) => l.id));
      expect(ids.has('bass')).toBe(true);
      expect(piece.layers.some((l) => l.role === 'keysVoice')).toBe(true);
      expect(piece.layers.some((l) => l.role === 'kick')).toBe(true);
      // All rows are 16 steps.
      for (const l of piece.layers) expect(piece.pattern[l.id]).toHaveLength(16);
    }
  });

  it('is deterministic for the same track', () => {
    const a = encodeSoundlabPiece(compose({ style: 'airplane', seed: 5, bars: 4 }));
    const b = encodeSoundlabPiece(compose({ style: 'airplane', seed: 5, bars: 4 }));
    expect(a).toEqual(b);
  });

  it('spells the head chord across simultaneous voice layers', () => {
    const track = compose({ style: 'jasper-ballad', seed: 3, bars: 8 });
    const piece = encodeSoundlabPiece(track);
    const voiceLayers = piece.layers.filter((l) => l.role === 'keysVoice');
    expect(voiceLayers.length).toBeGreaterThanOrEqual(3);
    const voicesAtStep0 = voiceLayers.map((l) => piece.pattern[l.id][0].note).sort((x: number, y: number) => x - y);
    expect(voicesAtStep0.every((n: number) => typeof n === 'number')).toBe(true);
    expect(new Set(voicesAtStep0).size).toBe(voicesAtStep0.length); // distinct chord tones
  });
});
