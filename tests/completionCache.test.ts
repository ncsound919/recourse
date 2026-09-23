import { describe, it, expect } from 'vitest';
import { CompletionCache } from '../src/lib/completionCache';

const msgs = (s: string) => [{ role: 'user', content: s }];

describe('CompletionCache — exact + semantic completion cache', () => {
  it('returns an exact hit and counts it', () => {
    const c = new CompletionCache();
    c.store(msgs('write fib'), { temperature: 0.1 }, 'function fib(){}', 'api-model');
    const hit = c.lookup(msgs('write fib'), { temperature: 0.1 });
    expect(hit?.value).toBe('function fib(){}');
    expect(hit?.exact).toBe(true);
    expect(hit?.model).toBe('api-model');
    expect(c.stats().hits).toBe(1);
  });

  it('misses on a different prompt/options and counts the miss', () => {
    const c = new CompletionCache();
    c.store(msgs('write fib'), {}, 'x', 'm');
    expect(c.lookup(msgs('totally different task'), {})).toBeNull();
    expect(c.lookup(msgs('write fib'), { temperature: 0.9 })).toBeNull();
    expect(c.stats().misses).toBe(2);
  });

  it('serves a near-duplicate prompt via token similarity, but never across variants', () => {
    const c = new CompletionCache({ similarity: 0.5 });
    c.store(msgs('implement a stable dedupe of an array keeping first order'), {}, 'source-A', 'm');
    const hit = c.lookup(msgs('implement dedupe of an array keeping the first occurrence order stable'), {});
    expect(hit?.value).toBe('source-A');
    expect(hit?.exact).toBe(false);
    expect(hit?.similarity).toBeGreaterThanOrEqual(0.5);
    // A different temperature is a different request, not a paraphrase.
    expect(c.lookup(msgs('implement a stable dedupe of an array keeping first order'), { temperature: 0.9 })).toBeNull();
  });

  it('does not cache blank values', () => {
    const c = new CompletionCache();
    c.store(msgs('x'), {}, '   ', 'm');
    expect(c.size).toBe(0);
    expect(c.lookup(msgs('x'), {})).toBeNull();
  });

  it('is bounded (LRU eviction)', () => {
    const c = new CompletionCache({ max: 2 });
    c.store(msgs('a'), {}, '1', 'm');
    c.store(msgs('b'), {}, '2', 'm');
    c.store(msgs('c'), {}, '3', 'm');
    expect(c.size).toBe(2);
    expect(c.stats().evictions).toBe(1);
    // 'a' (oldest) was evicted
    expect(c.lookup(msgs('a'), {})).toBeNull();
  });

  it('expires entries past the TTL', () => {
    const c = new CompletionCache({ ttlMs: 1000 });
    c.store(msgs('a'), {}, '1', 'm', 0);
    expect(c.lookup(msgs('a'), {}, 500)?.value).toBe('1');
    expect(c.lookup(msgs('a'), {}, 2000)).toBeNull();
    expect(c.stats().expired).toBe(1);
  });
});
