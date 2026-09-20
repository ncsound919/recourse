import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RatingStore } from '../../src/lib/rating/store';
import { hashParams } from '../../src/lib/rating/hash';

const dirs: string[] = [];
function tmpLedger(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-rating-'));
  dirs.push(dir);
  return path.join(dir, 'rating-ledger.jsonl');
}
afterEach(() => {
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

describe('RatingStore', () => {
  it('fingerprints params deterministically and deduplicates', () => {
    const store = new RatingStore(tmpLedger());
    const a1 = store.registerVariation({ source: 'chordstudio', params: { tempo: 120, key: 'C' } });
    const a2 = store.registerVariation({ source: 'chordstudio', params: { key: 'C', tempo: 120 } });
    expect(a1.paramHash).toBe(a2.paramHash);
    expect(a1.paramHash).toBe(hashParams({ tempo: 120, key: 'C' }));
    expect(store.variations()).toHaveLength(1);
    expect(store.count).toBe(1);

    store.registerVariation({ source: 'chordstudio', params: { tempo: 121, key: 'C' } });
    expect(store.variations()).toHaveLength(2);
  });

  it('requires variations to be registered before a pair is recorded', () => {
    const store = new RatingStore(tmpLedger());
    expect(() => store.recordPair({ source: 'chordstudio', aHash: 'x', bHash: 'y', winner: 'A' })).toThrow();
  });

  it('recomputes standings from recorded choices and persists across reload', () => {
    const file = tmpLedger();
    const store = new RatingStore(file);
    const a = store.registerVariation({ source: 'chordstudio', params: { v: 1 }, label: 'A' });
    const b = store.registerVariation({ source: 'chordstudio', params: { v: 2 }, label: 'B' });
    store.recordPair({ source: 'chordstudio', aHash: a.paramHash, bHash: b.paramHash, winner: 'B' });

    const standings = store.standings({ source: 'chordstudio' });
    expect(standings).toHaveLength(2);
    expect(standings[0].paramHash).toBe(b.paramHash);
    expect(standings[0].wins).toBe(1);

    const reloaded = new RatingStore(file);
    expect(reloaded.verify().valid).toBe(true);
    expect(reloaded.count).toBe(3);
    expect(reloaded.standings()[0].paramHash).toBe(b.paramHash);
  });

  it('detects tampering with a past record', () => {
    const file = tmpLedger();
    const store = new RatingStore(file);
    const a = store.registerVariation({ source: 'chordstudio', params: { v: 1 } });
    const b = store.registerVariation({ source: 'chordstudio', params: { v: 2 } });
    store.recordPair({ source: 'chordstudio', aHash: a.paramHash, bHash: b.paramHash, winner: 'A' });

    const lines = fs.readFileSync(file, 'utf-8').trim().split('\n');
    const tampered = lines.map((l, i) => (i === 0 ? l.replace('"chordstudio"', '"evil-tamper"') : l));
    fs.writeFileSync(file, `${tampered.join('\n')}\n`, 'utf-8');

    const reloaded = new RatingStore(file);
    const v = reloaded.verify();
    expect(v.valid).toBe(false);
    expect(v.brokenAt).toBe(0);
  });

  it('picks a deterministic next pair and prefers unplayed matchups', () => {
    const store = new RatingStore(tmpLedger());
    const a = store.registerVariation({ source: 'chordstudio', params: { v: 1 } });
    const b = store.registerVariation({ source: 'chordstudio', params: { v: 2 } });
    const c = store.registerVariation({ source: 'chordstudio', params: { v: 3 } });
    store.recordPair({ source: 'chordstudio', aHash: a.paramHash, bHash: b.paramHash, winner: 'A' });

    const first = store.nextPair({ source: 'chordstudio' });
    const second = store.nextPair({ source: 'chordstudio' });
    expect(first).not.toBeNull();
    expect(first).toEqual(second);
    expect(first!.a.paramHash).not.toBe(first!.b.paramHash);
    expect([a.paramHash, b.paramHash, c.paramHash]).toContain(first!.a.paramHash);
  });
});
