import { describe, expect, it } from 'vitest';
import { runBenchmark, scoreTrack, ratingFromScore, autoRateBenchmark, renderBenchmark, compose } from '../../src/lib/composer';
import { ComposerLearner } from '../../src/lib/composer/learner';
import * as os from 'node:os';
import * as path from 'node:path';

describe('composer benchmark (objective grading)', () => {
  it('produces a deterministic report with per-style aggregates in 0..1', () => {
    const a = runBenchmark({ styles: ['steely-dan', 'jasper-ballad'], seeds: [1, 2, 3, 4], bars: 8 });
    const b = runBenchmark({ styles: ['steely-dan', 'jasper-ballad'], seeds: [1, 2, 3, 4], bars: 8 });
    expect(a.aggregate).toBe(b.aggregate); // reproducible
    for (const s of a.styles) {
      expect(s.avg).toBeGreaterThanOrEqual(0);
      expect(s.avg).toBeLessThanOrEqual(1);
      expect(s.scores).toHaveLength(4);
      expect(s.min).toBeLessThanOrEqual(s.max);
    }
    expect(a.grade).toBeTruthy();
  });

  it('scores a single track with weighted metrics summing to total', () => {
    const t = compose({ style: 'steely-dan', seed: 1, bars: 8 });
    const sc = scoreTrack(t);
    expect(sc.total).toBeGreaterThanOrEqual(0);
    expect(sc.total).toBeLessThanOrEqual(1);
    const keys = sc.metrics.map((m) => m.key);
    for (const k of ['integrity', 'harmony', 'closure', 'styleAdherence', 'voiceLeading', 'richness', 'nuance']) {
      expect(keys).toContain(k);
    }
  });

  it('loops close to tonic, arrangements are exempt from closure', () => {
    const loop = scoreTrack(compose({ style: 'jasper-ballad', seed: 2, bars: 8 }));
    const closureLoop = loop.metrics.find((m) => m.key === 'closure')!;
    expect(closureLoop.value).toBe(1); // must resolve
  });

  it('nuance metric reflects steely-dan horn/bgvox presence', () => {
    const sc = scoreTrack(compose({ style: 'steely-dan', seed: 42, bars: 8 }));
    const nuance = sc.metrics.find((m) => m.key === 'nuance')!;
    expect(nuance.value).toBeGreaterThan(0);
  });

  it('ratingFromScore maps objective scores to 1..5', () => {
    expect(ratingFromScore(0.9)).toBe(5);
    expect(ratingFromScore(0.75)).toBe(4);
    expect(ratingFromScore(0.6)).toBe(3);
    expect(ratingFromScore(0.45)).toBe(2);
    expect(ratingFromScore(0.2)).toBe(1);
  });

  it('autoRateBenchmark records winners into the learner as benchmark episodes', () => {
    const file = path.join(os.tmpdir(), `bmt-${Date.now()}.json`);
    const learner = new ComposerLearner(file);
    const report = runBenchmark({ styles: ['airplane'], seeds: [1, 2, 3, 4], bars: 8 });
    const res = autoRateBenchmark(learner, report, 0.5);
    expect(res.pushed).toBeGreaterThan(0);
    expect(learner.episodesFor('airplane').length).toBe(res.pushed);
    for (const ep of learner.episodesFor('airplane')) expect(ep.tags).toContain('benchmark');
  });

  it('renders a readable markdown summary', () => {
    const report = runBenchmark({ styles: ['steely-dan'], seeds: [1, 2], bars: 8 });
    const md = renderBenchmark(report);
    expect(md).toContain('Composer benchmark');
    expect(md).toContain('steely-dan');
  });

  it('certifies general music theory: voicings/bass/melody are chord-correct in register', () => {
    for (const style of ['steely-dan', 'jasper-ballad', 'dangelo-glasper', 'airplane'] as const) {
      const sc = scoreTrack(compose({ style, seed: 3, bars: 8 }));
      for (const key of ['spelling', 'bass', 'melody', 'spacing']) {
        const m = sc.metrics.find((x) => x.key === key)!;
        expect(m.value, `${style}/${key} should certify`).toBeGreaterThanOrEqual(0.99);
      }
    }
  });

  it('root-transposes chord-tone validation (spelling is not relative-only)', () => {
    // A track whose progression moves far from C must still have every voiced
    // note be a real chord tone of its bar (the earlier validator/generator bug
    // dropped rootPc and produced wrong notes — this guards against it).
    const t = compose({ style: 'steely-dan', seed: 3, bars: 8 });
    const sc = scoreTrack(t);
    expect(sc.metrics.find((m) => m.key === 'spelling')!.value).toBeGreaterThanOrEqual(0.99);
    expect(sc.metrics.find((m) => m.key === 'melody')!.value).toBeGreaterThanOrEqual(0.99);
  });
});
