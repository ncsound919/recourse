import { describe, it, expect } from 'vitest';
import { isNovel, dedupeNovel, bestSimilarity, jaccard } from '../src/lib/novelty';

describe('novelty rejection sampling (phase 2 #8)', () => {
  it('rejects a near-duplicate against the pool', () => {
    const pool = ['build a bloom filter over hashed tokens'];
    const near = 'build a bloom filter for hashed tokens';
    const verdict = isNovel(near, pool, 0.6);
    expect(verdict.novel).toBe(false);
    expect(verdict.mostSimilar).toBe(pool[0]);
    expect(verdict.bestScore).toBeGreaterThanOrEqual(0.6);
  });

  it('accepts a genuinely different idea', () => {
    const pool = ['merkle root over provenance leaves'];
    const verdict = isNovel('landing page with pricing tiers', pool, 0.6);
    expect(verdict.novel).toBe(true);
  });

  it('empty pool is always novel', () => {
    expect(isNovel('anything', []).novel).toBe(true);
    expect(isNovel('anything', []).mostSimilar).toBeNull();
  });

  it('jaccard is in [0,1] and identical strings score 1', () => {
    expect(jaccard('a b c', 'a b c')).toBe(1);
    expect(jaccard('a b c', 'x y z')).toBe(0);
    expect(jaccard('', '')).toBe(1);
  });

  it('bestSimilarity returns the closest pool member', () => {
    const { item } = bestSimilarity('bloom filter', ['red blue', 'bloom filter set']);
    expect(item).toBe('bloom filter set');
  });

  it('dedupeNovel keeps only mutually-novel items', () => {
    const items = [
      'k nearest neighbors with ball tree',
      'k nearest neighbors using a ball tree',
      'generate an invoice as csv',
    ];
    const out = dedupeNovel(items, 0.6);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(items[0]);
    expect(out[out.length - 1]).toBe(items[2]);
  });
});
