import { describe, expect, it } from 'vitest';
import { compose } from '../../src/lib/composer';
import { STYLE_LEXICONS } from '../../src/lib/composer/lexicons';
import type { PartName } from '../../src/lib/composer/types';

function partsOf(events: Array<{ part: PartName }>): Set<PartName> {
  return new Set(events.map((e) => e.part));
}

describe('style signature nuances in the creation process', () => {
  it('steely-dan carries written-chart horn stabs and bg-vox accents', () => {
    const t = compose({ style: 'steely-dan', seed: 42, bars: 8 });
    const parts = partsOf(t.events);
    expect(parts.has('horns')).toBe(true);
    expect(parts.has('bgvox')).toBe(true);
  });

  it('jasper-ballad carries a sustained strings wash + bg-vox', () => {
    const t = compose({ style: 'jasper-ballad', seed: 7, bars: 8 });
    const parts = partsOf(t.events);
    expect(parts.has('strings')).toBe(true);
    expect(parts.has('bgvox')).toBe(true);
  });

  it("d'angelo-glasper lays harmonic/melodic parts behind the beat", () => {
    const t = compose({ style: 'dangelo-glasper', seed: 3, bars: 8 });
    const laidBack = t.events.find((e) => e.part !== 'drums' && e.tick % 120 !== 0);
    expect(laidBack).toBeTruthy(); // a non-drum note nudged off the 16th grid
    // Drums stay tight on the grid.
    const drumsOffGrid = t.events.find((e) => e.part === 'drums' && e.tick % 120 !== 0);
    expect(drumsOffGrid).toBeUndefined();
  });

  it('airplane swells louder across the loop (build-and-release dynamics)', () => {
    const t = compose({ style: 'airplane', seed: 9, bars: 8 });
    const barLen = 4 * 480;
    const mid = barLen * 4;
    const nonDrum = t.events.filter((e) => e.part !== 'drums');
    const first = nonDrum.filter((e) => e.tick < mid);
    const second = nonDrum.filter((e) => e.tick >= mid);
    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBeGreaterThan(0);
    const avg = (xs: typeof first) => xs.reduce((s, e) => s + e.velocity, 0) / xs.length;
    expect(avg(second)).toBeGreaterThan(avg(first)); // second half is louder
  });

  it('lexicons declare their intended nuance set', () => {
    expect(STYLE_LEXICONS['steely-dan'].nuance?.horns).toBe(true);
    expect(STYLE_LEXICONS['jasper-ballad'].nuance?.strings).toBe(true);
    expect(STYLE_LEXICONS['dangelo-glasper'].nuance?.behindBeat).toBeGreaterThan(0);
    expect(STYLE_LEXICONS['airplane'].nuance?.dynamics).toBeGreaterThan(0);
  });
});
