import { describe, it, expect } from 'vitest';
import {
  buildComposerTrainingRows,
  composerEpisodeFeatures,
  isComposerTrainingSet,
  COMPOSER_FEATURE_NAMES,
} from '../src/lib/composerTraining';
import type { Episode } from '../src/lib/composer/learner';

function ep(over: Partial<Episode> = {}): Episode {
  return {
    id: 'x-1-8',
    style: 'steely-dan' as Episode['style'],
    brief: { style: 'steely-dan' as Episode['style'], seed: 1, bars: 8, key: 0, major: true, bpm: 84 },
    chords: ['G7#9', 'E7#11', 'Amaj7', 'Cmaj7#11'],
    rootMoves: [-3, 5, 3],
    qualities: ['7#9', '7#11', 'maj7'],
    rating: 5,
    ts: 1,
    ...over,
  };
}

describe('composerEpisodeFeatures', () => {
  it('produces one finite number per declared feature, in order', () => {
    const f = composerEpisodeFeatures(ep());
    expect(f).toHaveLength(COMPOSER_FEATURE_NAMES.length);
    expect(f.every((v) => Number.isFinite(v))).toBe(true);
    // bars, bpm, chordCount come straight from the episode.
    expect(f[0]).toBe(8);
    expect(f[1]).toBe(84);
    expect(f[2]).toBe(4);
    // meanAbsRootMove of [-3,5,3] = 11/3
    expect(f[4]).toBeCloseTo(11 / 3, 6);
  });

  it('is deterministic for the same episode', () => {
    expect(composerEpisodeFeatures(ep())).toEqual(composerEpisodeFeatures(ep()));
  });

  it('counts accidental qualities (# and b)', () => {
    const f = composerEpisodeFeatures(ep({ qualities: ['7#9', 'm7', 'maj7#11', '13'] }));
    // 7#9 and maj7#11 contain '#'
    expect(f[7]).toBe(2);
  });
});

describe('buildComposerTrainingRows', () => {
  it('builds a set only when rows and rating variance are sufficient', () => {
    const episodes = [ep({ rating: 5 }), ep({ id: 'a', rating: 4 }), ep({ id: 'b', rating: 2 }), ep({ id: 'c', rating: 3 })];
    const r = buildComposerTrainingRows(episodes);
    expect(isComposerTrainingSet(r)).toBe(true);
    if (!isComposerTrainingSet(r)) return;
    expect(r.rows).toHaveLength(4);
    expect(r.rows[0]).toHaveLength(COMPOSER_FEATURE_NAMES.length);
    expect(r.target).toEqual([5, 4, 2, 3]);
    expect(r.distinctRatings).toBe(4);
  });

  it('refuses a constant target rather than shipping a degenerate set (the testbiz failure)', () => {
    const episodes = [ep({ rating: 5 }), ep({ id: 'a', rating: 5 }), ep({ id: 'b', rating: 5 }), ep({ id: 'c', rating: 5 })];
    const r = buildComposerTrainingRows(episodes);
    expect(isComposerTrainingSet(r)).toBe(false);
    if (isComposerTrainingSet(r)) return;
    expect(r.reason).toMatch(/no signal/i);
  });

  it('refuses below the minimum row count', () => {
    const r = buildComposerTrainingRows([ep({ rating: 5 }), ep({ id: 'a', rating: 1 })]);
    expect(isComposerTrainingSet(r)).toBe(false);
    if (isComposerTrainingSet(r)) return;
    expect(r.reason).toMatch(/need >= 4/);
  });

  it('drops episodes with no chords or a non-finite rating', () => {
    const episodes = [
      ep({ rating: 5 }),
      ep({ id: 'a', rating: 4 }),
      ep({ id: 'b', rating: 2 }),
      ep({ id: 'c', rating: 3 }),
      ep({ id: 'nochords', chords: [], rating: 1 }),
      ep({ id: 'nan', rating: NaN as unknown as number }),
    ];
    const r = buildComposerTrainingRows(episodes);
    expect(isComposerTrainingSet(r)).toBe(true);
    if (!isComposerTrainingSet(r)) return;
    expect(r.rows).toHaveLength(4);
  });
});
