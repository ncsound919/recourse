import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ComposerLearner } from '../../src/lib/composer/learner';
import { composeWithLearner } from '../../src/lib/composer';
import { getLexicon } from '../../src/lib/composer/lexicons';

function tmp(): string {
  return path.join(fsTmp(), `cl-${Date.now()}-${Math.floor(Math.random() * 1e6)}.json`);
}
function fsTmp(): string {
  return os.tmpdir();
}

describe('composer learner loop', () => {
  it('records an episode with a canonical reproducible brief', () => {
    const file = tmp();
    const lr = new ComposerLearner(file);
    const ep = lr.rate({ style: 'jasper-ballad', seed: 5, bars: 8 }, 5, ['lush'], 'loved the lift');
    expect(ep.id).toBe('jasper-ballad-5-8');
    expect(ep.chords).toHaveLength(8);
    expect(ep.rootMoves).toHaveLength(7);
    expect(lr.episodesFor('jasper-ballad')).toHaveLength(1);
  });

  it('updates rather than duplicates the same composition', () => {
    const file = tmp();
    const lr = new ComposerLearner(file);
    lr.rate({ style: 'steely-dan', seed: 3, bars: 4 }, 2, ['boring']);
    lr.rate({ style: 'steely-dan', seed: 3, bars: 4 }, 5, ['complex']);
    expect(lr.episodesFor('steely-dan')).toHaveLength(1);
    expect(lr.episodesFor('steely-dan')[0].rating).toBe(5);
  });

  it('derives a quality bias from ratings and applies it to the lexicon', () => {
    const file = tmp();
    const lr = new ComposerLearner(file);
    // Rate a track highly; then force-look at a specific quality present in it.
    const ep = lr.rate({ style: 'dangelo-glasper', seed: 9, bars: 8 }, 5, ['love'], '');
    expect(ep.qualities.length).toBeGreaterThan(0);
    const adj = lr.adjustmentsFor('dangelo-glasper');
    const boostedQ = Object.keys(adj.qualities)[0];
    expect(boostedQ).toBeTruthy();
    const base = getLexicon('dangelo-glasper');
    const adjusted = lr.adjustedLexicon('dangelo-glasper');
    const baseW = base.qualityWeights.find((x) => x.q === boostedQ)!.w;
    const adjW = adjusted.qualityWeights.find((x) => x.q === boostedQ)!.w;
    expect(adjW).toBeGreaterThan(baseW); // boosted above baseline
  });

  it('suggests fresh briefs to explore near liked seeds', () => {
    const file = tmp();
    const lr = new ComposerLearner(file);
    lr.rate({ style: 'steely-dan', seed: 100, bars: 8 }, 5);
    const suggestions = lr.suggestNext('steely-dan', 4, 8);
    expect(suggestions.length).toBe(4);
    for (const s of suggestions) {
      expect(s.style).toBe('steely-dan');
      expect(s.seed).not.toBe(100); // not the already-rated seed
    }
  });

  it('persists and reloads across instances', () => {
    const file = tmp();
    new ComposerLearner(file).rate({ style: 'airplane', seed: 7, bars: 4 }, 4);
    const lr2 = new ComposerLearner(file);
    expect(lr2.episodesFor('airplane')).toHaveLength(1);
    expect(lr2.episodesFor('airplane')[0].rating).toBe(4);
  });

  it('leaderboard reports style averages and top episode', () => {
    const file = tmp();
    const lr = new ComposerLearner(file);
    lr.rate({ style: 'steely-dan', seed: 1, bars: 8 }, 4);
    lr.rate({ style: 'steely-dan', seed: 2, bars: 8 }, 5);
    const lb = lr.leaderboard();
    const row = lb.find((r) => r.style === 'steely-dan')!;
    expect(row.n).toBe(2);
    expect(row.avg).toBe(4.5);
    expect(row.top!.rating).toBe(5);
  });

  it('composeWithLearner runs end-to-end with learned biases', () => {
    const file = tmp();
    const lr = new ComposerLearner(file);
    lr.rate({ style: 'jasper-ballad', seed: 5, bars: 8 }, 5);
    const t = composeWithLearner({ style: 'jasper-ballad', seed: 5, bars: 8 }, lr);
    expect(t.events.length).toBeGreaterThan(0);
  });

  it('rejects invalid input', () => {
    const lr = new ComposerLearner(tmp());
    expect(() => lr.rate({ style: 'steely-dan', seed: 1, bars: 4 } as any, 9)).toThrow();
    expect(() => lr.rate({ style: 'steely-dan', seed: 1, bars: 13 as any }, 3)).toThrow();
  });
});
