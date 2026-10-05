import { describe, expect, it, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openVectorMemory, VEC_DIM } from '../src/lib/vectorMemory';

/**
 * LanceDB-backed recall.
 *
 * Every pre-existing vector-memory test opens the store with `dir: ''`, which
 * deliberately forces the in-memory backend. So the whole suite exercised only
 * the fallback path, and two real defects lived exclusively in the LanceDB path
 * unnoticed:
 *
 *  1. `cosine()` returned NaN for EVERY candidate. The column decodes to an
 *     Arrow `Vector`, and `Vector.toArray()` yields a Float32Array —
 *     `Array.isArray()` is false for both, so `Array.isArray(v) ? v : []` passed
 *     `[]` for every row. Recall still returned rows (LanceDB's own ANN order)
 *     and every score was NaN, so the JS re-ranking was inert.
 *  2. The kind filter ran AFTER the vector LIMIT, so a large population of
 *     higher-scoring rows of another kind could push every matching row out of
 *     the candidate window — contradicting the in-memory backend's
 *     filter -> sort -> slice order.
 *
 * These tests need a real on-disk store, so they are slower than the rest of the
 * file and use a temp dir per test.
 */

const dirs: string[] = [];

function tmpDir(): string {
  // A fresh dir each time: a leftover table from a previous run would make
  // doc-count assertions pass or fail for the wrong reason.
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lance-test-'));
  dirs.push(d);
  return d;
}

afterAll(() => {
  for (const d of dirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

const LONG = 120_000;

describe('VectorMemory (LanceDB backend)', () => {
  it('actually uses lancedb when given a writable dir', async () => {
    const mem = await openVectorMemory({ dir: tmpDir() });
    try {
      const st = await mem.status();
      expect(st.store).toBe('lancedb');
      expect(st.docs).toBe(0);
    } finally { await mem.close(); }
  }, LONG);

  it('returns finite, non-NaN cosine scores', async () => {
    const mem = await openVectorMemory({ dir: tmpDir() });
    try {
      await mem.remember('lesson', 'l1', 'merkle tree root over provenance leaves for integrity');
      await mem.remember('lesson', 'l2', 'fast fourier transform over real valued signals');

      const hits = await mem.recall('merkle provenance integrity', 'lesson', 5);
      expect(hits.length).toBe(2);
      for (const h of hits) {
        expect(Number.isFinite(h.score)).toBe(true);
        expect(Number.isNaN(h.score)).toBe(false);
      }
      expect(hits[0].id).toBe('l1');
      expect(hits[0].score).toBeGreaterThan(hits[1].score);
    } finally { await mem.close(); }
  }, LONG);

  it('returns the stored vector as a plain Array of full width', async () => {
    const mem = await openVectorMemory({ dir: tmpDir() });
    try {
      await mem.remember('gene', 'g1', 'a vector that must survive the round trip intact');
      const hits = await mem.recall('vector round trip', 'gene', 1);
      expect(hits).toHaveLength(1);
      // The regression: this was an Arrow Vector, so Array.isArray was false.
      expect(Array.isArray(hits[0].vec)).toBe(true);
      expect(hits[0].vec).toHaveLength(VEC_DIM);
      hits[0].vec.forEach((n) => {
        expect(typeof n).toBe('number');
        expect(Number.isFinite(n)).toBe(true);
      });
    } finally { await mem.close(); }
  }, LONG);

  it('filters by kind BEFORE the candidate limit, so a kind is never crowded out', async () => {
    const dir = tmpDir();
    const mem = await openVectorMemory({ dir });
    try {
      // Many 'gene' docs that all match the query strongly, plus one 'lesson'.
      // With the old order (limit then filter) the lesson falls outside the
      // window and the kind-filtered recall comes back empty.
      for (let i = 0; i < 60; i++) {
        await mem.remember('gene', `gene-${i}`, `merkle tree provenance leaf ${i} integrity root`);
      }
      await mem.remember('lesson', 'the-one-lesson', 'merkle tree provenance leaf integrity lesson');

      const lessons = await mem.recall('merkle tree provenance leaf integrity', 'lesson', 5);
      expect(lessons.length).toBeGreaterThan(0);
      expect(lessons.map((l) => l.id)).toContain('the-one-lesson');
      expect(lessons.every((l) => l.kind === 'lesson')).toBe(true);
    } finally { await mem.close(); }
  }, LONG);

  it('survives a close/reopen cycle — the reason the store is durable at all', async () => {
    const dir = tmpDir();
    const first = await openVectorMemory({ dir });
    await first.remember('lesson', 'persisted', 'durable memory lesson about verification anchors');
    await first.remember('gene', 'persisted-gene', 'durable memory gene about provenance');
    expect((await first.status()).docs).toBe(2);
    await first.close();

    const second = await openVectorMemory({ dir });
    try {
      expect((await second.status()).store).toBe('lancedb');
      expect((await second.status()).docs).toBe(2);
      const hits = await second.recall('verification anchors', 'lesson', 3);
      expect(hits.map((h) => h.id)).toContain('persisted');
      expect(Number.isFinite(hits[0].score)).toBe(true);
    } finally { await second.close(); }
  }, LONG);

  it('upserts by (id, kind) rather than duplicating rows', async () => {
    const mem = await openVectorMemory({ dir: tmpDir() });
    try {
      await mem.remember('lesson', 'same', 'first description of the thing');
      await mem.remember('lesson', 'same', 'second description of the thing');
      expect(await mem.count()).toBe(1);
      const hits = await mem.recall('description thing', 'lesson', 1);
      expect(hits[0].text).toContain('second');
    } finally { await mem.close(); }
  }, LONG);
});