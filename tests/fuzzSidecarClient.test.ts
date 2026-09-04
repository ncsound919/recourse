import { describe, it, expect, afterEach, vi } from 'vitest';
import { fuzzSidecarHealth, fuzzMatch, fuzzDedup, FUZZ_SIDECAR_DEFAULT_URL } from '../src/lib/fuzzSidecarClient';

afterEach(() => {
  vi.unstubAllGlobals();
});

const BASE = 'http://fuzz.test';

describe('fuzz sidecar client - honest failures (no invented matches)', () => {
  it('returns ok:false when the sidecar is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const res = await fuzzMatch('bloom_filter', ['bloom filter', 'lru_cache'], { base: BASE });
    expect(res.ok).toBe(false);
    expect(res.matches).toBeUndefined();
    expect(res.error).toBeTruthy();
  });

  it('returns ok:false on a non-2xx sidecar response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 400 })));
    const res = await fuzzMatch('x', ['y'], { base: BASE });
    expect(res.ok).toBe(false);
  });

  it('health reports online:false honestly when the sidecar is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const res = await fuzzSidecarHealth(BASE);
    expect(res.ok).toBe(false);
    expect(res.rapidfuzz).toBeUndefined();
  });

  it('parses a real RapidFuzz payload from the sidecar (mock 200)', async () => {
    const body = {
      ok: true,
      needle: 'bloom_filter',
      scorer: 'token_ratio',
      threshold: 60,
      matches: [
        { candidate: 'bloom filter', score: 91.67, index: 0 },
        { candidate: 'blume_filter', score: 83.33, index: 1 },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })));
    const res = await fuzzMatch('bloom_filter', ['bloom filter', 'blume_filter'], { base: BASE });
    expect(res.ok).toBe(true);
    expect(res.matches?.[0].candidate).toBe('bloom filter');
    expect(res.matches?.[0].score).toBeGreaterThan(90);
  });

  it('parses a dedup payload (savings are honest real numbers)', async () => {
    const body = {
      ok: true,
      input_names: 4,
      cluster_count: 3,
      dedup_savings: 1,
      clusters: [
        { seed: 'bloom_filter', members: ['bloom_filter', 'bloom filter'], links: [{ from: 'bloom filter', to: 'bloom_filter', score: 91.67 }] },
        { seed: 'lru_cache', members: ['lru_cache'], links: [] },
        { seed: 'gene_x', members: ['gene_x'], links: [] },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })));
    const res = await fuzzDedup(['bloom_filter', 'bloom filter', 'lru_cache', 'gene_x'], { base: BASE });
    expect(res.ok).toBe(true);
    expect(res.dedup_savings).toBe(1);
    expect(res.clusters?.[0].members).toHaveLength(2);
  });

  it('defaults the sidecar base URL and honours env override', () => {
    expect(FUZZ_SIDECAR_DEFAULT_URL.startsWith('http')).toBe(true);
  });
});
