import { describe, it, expect } from 'vitest';
import {
  theoryScore,
  theoryMetrics,
  gradeRun,
  gradeLetter,
  weakestMetric,
  randomTheoryProgression,
  fromChordStudioProgression,
  fromComposerTrack,
  pcFromNoteName,
  novelty,
  emergentStyles,
  conventionalReference,
  EXPLORATION_WEIGHT,
  type TheoryProgression,
} from '../src/lib/theoryComparison';

/** A well-formed progression: functional roots with near-constant voicings. */
function good(key: number, roots: number[]): TheoryProgression {
  return {
    id: 'g',
    source: 'composer',
    keyPc: key,
    bars: roots.length,
    chords: roots.map((r, i) => ({ rootPc: r, quality: 'min7', notes: [48 + (i % 2), 55 + (i % 2), 59 + (i % 3), 62] })),
  };
}

describe('pcFromNoteName', () => {
  it('parses naturals, sharps and flats', () => {
    expect(pcFromNoteName('C')).toBe(0);
    expect(pcFromNoteName('G')).toBe(7);
    expect(pcFromNoteName('A#')).toBe(10);
    expect(pcFromNoteName('Db')).toBe(1);
    expect(pcFromNoteName('')).toBeUndefined();
    expect(pcFromNoteName('H')).toBeUndefined();
  });
});

describe('theoryScore', () => {
  it('scores a functional, tonic-resolving, smooth progression above a random walk', () => {
    const smooth = theoryScore(good(0, [2, 7, 0, 9, 2, 7, 0]));
    // Random progressions come from an LCG; several seeds to be representative.
    const rngRuns = [theoryScore(randomTheoryProgression(() => 0.1, 7)), theoryScore(randomTheoryProgression(() => 0.63, 7))];
    expect(smooth).toBeGreaterThan(0.7);
    expect(smooth).toBeGreaterThan(Math.max(...rngRuns));
  });

  it('reports the five theory metrics', () => {
    const keys = theoryMetrics(good(0, [2, 7, 0])).map((m) => m.key).sort();
    expect(keys).toEqual(['closure', 'functionalMotion', 'register', 'variety', 'voiceLeading']);
  });

  it('closure is 1 only when the last root is the tonic', () => {
    const resolves = theoryMetrics(good(0, [2, 7, 0])).find((m) => m.key === 'closure')!.value;
    const notResolves = theoryMetrics(good(0, [2, 7, 5])).find((m) => m.key === 'closure')!.value;
    expect(resolves).toBe(1);
    expect(notResolves).toBe(0);
  });
});

describe('randomTheoryProgression', () => {
  it('is deterministic for a given rng sequence', () => {
    const a = randomTheoryProgression(() => 0.42, 4);
    const b = randomTheoryProgression(() => 0.42, 4);
    expect(a.chords).toEqual(b.chords);
  });
});

describe('gradeRun', () => {
  it('grads a well-formed run as IMPROVED over the random baseline, with a real CI', () => {
    const run = [2, 7, 0, 9, 2, 7, 0, 4, 9, 2, 5, 0].map((r) => good(0, [r, r + 5, (r + 5) % 12]));
    const g = gradeRun(run, { source: 'composer', seed: 7 });
    expect(g.verdict).toBe('improved');
    expect(g.ciLow).toBeGreaterThan(0);
    expect(g.effectSize).toBeGreaterThan(0);
    expect(g.pValue).toBeLessThan(0.05);
    expect(g.grade).toBeGreaterThan(g.baselineMean);
    expect(g.letter).toMatch(/^[A-F]$/);
  });

  it('does NOT claim improvement for a run drawn from the same random distribution', () => {
    const rng = (() => {
      let s = 99;
      return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    })();
    const run = Array.from({ length: 30 }, () => randomTheoryProgression(rng, 8));
    const g = gradeRun(run, { source: 'random', seed: 5 });
    expect(g.verdict).not.toBe('improved');
  });

  it('is deterministic and records the delta vs the previous run', () => {
    const run = [good(0, [2, 7, 0])];
    const a = gradeRun(run, { source: 'composer', seed: 11 });
    const b = gradeRun(run, { source: 'composer', seed: 11 });
    expect(b.grade).toBe(a.grade);
    expect(b.pValue).toBe(a.pValue);
    const c = gradeRun(run, { source: 'composer', seed: 11, prev: a });
    expect(c.deltaVsPrev).toBeCloseTo(0, 10);
    expect(c.prevId).toBe(a.id);
  });

  it('names the weakest metric (the axis the next run should attack)', () => {
    const g = gradeRun([good(0, [2, 7, 0]), good(0, [9, 2, 7])], { source: 'composer' });
    const w = weakestMetric(g);
    expect(Object.keys(g.metrics)).toContain(w.key);
    expect(w.value).toBe(Math.min(...Object.values(g.metrics)));
  });
});

describe('gradeLetter', () => {
  it('maps score bands to letters', () => {
    expect(gradeLetter(0.9)).toBe('A');
    expect(gradeLetter(0.72)).toBe('B');
    expect(gradeLetter(0.3)).toBe('F');
  });
});

describe('adaptors', () => {
  it('maps a ChordStudio progression, deriving root from the lowest note', () => {
    const p = fromChordStudioProgression({
      name: 'G thing',
      rootNote: 'G',
      scale: 'Major',
      chords: [{ name: 'G7', role: 'Root', notes: [55, 59, 62, 65], bass: 43 }],
      score: 90,
    });
    expect(p.source).toBe('chordstudio');
    expect(p.keyPc).toBe(7);
    expect(p.chords[0].rootPc).toBe(7);
    expect(p.chords[0].bass).toBe(43);
  });

  it('maps a composer track, collecting voicing notes per bar', () => {
    const BAR = 4 * 480;
    const t = fromComposerTrack({
      style: 'steely-dan',
      seed: 1,
      bars: 2,
      key: 0,
      chords: [{ rootPc: 2, quality: 'min7' }, { rootPc: 7, quality: 'dom7' }],
      events: [
        { tick: 0, pitch: 50, part: 'keys' },
        { tick: 0, pitch: 53, part: 'bass' }, // excluded from voicing
        { tick: BAR, pitch: 55, part: 'keys' },
      ],
    });
    expect(t.source).toBe('composer');
    expect(t.chords[0].notes).toEqual([50]);
    expect(t.chords[1].notes).toEqual([55]);
    expect(t.keyPc).toBe(0);
  });
});

/** Coherent (functional, in-register) but stylistically off the conventional map. */
function novelCoherent(i: number): TheoryProgression {
  return {
    id: 'nc' + i,
    source: 'composer',
    keyPc: 0,
    bars: 4,
    chords: [0, 5, 10, 0].map((r) => ({ rootPc: r, quality: '13', notes: [55 + (r % 5), 59 + (r % 5), 62 + (r % 5), 66] })),
  };
}

describe('exploration / novelty attribution', () => {
  const ref = conventionalReference();

  it('builds a deterministic conventional reference', () => {
    expect(ref.length).toBe(60);
    expect(ref[0].chords.length).toBeGreaterThan(1);
  });

  it('scores a progression equal to the convention as ~zero novelty', () => {
    const n = novelty(ref[0], ref);
    expect(n).toBeLessThan(0.05);
  });

  it('scores a divergent coherent progression as novel', () => {
    const n = novelty(novelCoherent(1), ref);
    expect(n).toBeGreaterThan(0.3);
  });

  it('credits coherent novelty: a novel run grades above its own conformance', () => {
    const run = Array.from({ length: 8 }, (_, i) => novelCoherent(i));
    const g = gradeRun(run, { source: 'composer', reference: ref, seed: 3 });
    expect(g.novelty).toBeGreaterThan(0);
    expect(g.exploration).toBeGreaterThan(0);
    expect(g.conformance).toBeGreaterThan(0.6); // still coherent
    expect(g.grade).toBeGreaterThan(g.conformance); // novelty boosted it
    expect(g.grade - g.conformance).toBeLessThanOrEqual(EXPLORATION_WEIGHT + 1e-9);
  });

  it('does not credit a conventional run (novelty ~0 leaves the grade at conformance)', () => {
    const run = ref.slice(0, 8);
    const g = gradeRun(run, { source: 'composer', reference: ref, seed: 3 });
    expect(g.novelty).toBeLessThan(0.1);
    expect(g.grade).toBeCloseTo(g.conformance, 5);
  });

  it('leaves the grade untouched when no reference is supplied (back-compat)', () => {
    const run = Array.from({ length: 8 }, (_, i) => novelCoherent(i));
    const g = gradeRun(run, { source: 'composer', seed: 3 });
    expect(g.novelty).toBeNull();
    expect(g.grade).toBeCloseTo(g.conformance, 10);
  });

  it('surfaces emergent styles: a coherent novel cluster is reported with a label', () => {
    const run = Array.from({ length: 8 }, (_, i) => novelCoherent(i));
    const styles = emergentStyles(run, ref);
    expect(styles.length).toBeGreaterThanOrEqual(1);
    expect(styles[0].size).toBeGreaterThanOrEqual(2);
    expect(styles[0].label).toMatch(/register/);
    expect(styles[0].novelty).toBeGreaterThan(0.3);
  });
});
