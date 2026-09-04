import { describe, expect, it } from 'vitest';
import { composeArrangement, toMidiBytes, compose } from '../../src/lib/composer';

describe('arrangement mode (non-loop, written-out arc)', () => {
  it('builds a linear multi-section arc with the jasper final key-lift', () => {
    const t = composeArrangement({ style: 'jasper-ballad', seed: 11, bars: 16 });
    expect(t.mode).toBe('arr');
    expect(t.sections).toBeDefined();
    const names = t.sections!.map((s) => s.name);
    expect(names).toEqual(['intro', 'A', 'bridge', 'final', 'outro']);
    // Bars = 2+4+4+4+2 = 16; one chord per bar.
    expect(t.bars).toBe(16);
    expect(t.chords).toHaveLength(16);
    // The final chorus is lifted a whole step (signature device): its closing
    // chord (tonic-resolved, then lifted) now sits a whole step above the key.
    const finalSec = t.sections!.find((s) => s.name === 'final')!;
    expect(finalSec.lift).toBe(2);
    const lastFinalBar = finalSec.startBar + finalSec.bars - 1;
    expect(t.chords[lastFinalBar].rootPc).toBe((t.key + 2) % 12);
    // Intro/outro vamps hold the tonic.
    const outro = t.sections!.find((s) => s.name === 'outro')!;
    expect(t.chords[outro.startBar].rootPc).toBe(t.key);
  });

  it('steely-dan arrangement keeps a distinct (open) bridge and encodes to MIDI', () => {
    const t = composeArrangement({ style: 'steely-dan', seed: 42, bars: 16 });
    expect(t.mode).toBe('arr');
    expect(t.sections!.some((s) => s.name === 'bridge')).toBe(true);
    const bytes = toMidiBytes(t);
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it('is deterministic for the same seed', () => {
    const a = composeArrangement({ style: 'steely-dan', seed: 5 });
    const b = composeArrangement({ style: 'steely-dan', seed: 5 });
    expect(a.events).toEqual(b.events);
    expect(a.sections).toEqual(b.sections);
  });

  it('loop mode (compose) is unaffected and still closes', () => {
    const t = compose({ style: 'jasper-ballad', seed: 11, bars: 8 });
    expect(t.mode).toBeUndefined();
    expect(t.sections).toBeUndefined();
    expect(t.chords[t.chords.length - 1].rootPc).toBe(t.key); // loop-closed
  });
});
