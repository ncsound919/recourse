import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  brainBaseUrl,
  toKaggleSignal,
  toNewsSignal,
  mapKaggleItems,
  mapNewsItems,
  pollBrainKaggle,
  pollBrainNews,
} from '../src/intake/brain.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const calls: string[] = [];

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(String(url));
      return jsonResponse({});
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('brainBaseUrl', () => {
  it('strips trailing slashes from an explicit url', () => {
    expect(brainBaseUrl('http://brain.test:3210///')).toBe('http://brain.test:3210');
  });

  it('falls back to BRAIN_URL and strips slashes', () => {
    vi.stubEnv('BRAIN_URL', 'http://env-brain:3210/');
    expect(brainBaseUrl()).toBe('http://env-brain:3210');
  });

  it('returns an empty string when nothing is configured', () => {
    vi.stubEnv('BRAIN_URL', '');
    expect(brainBaseUrl()).toBe('');
  });
});

describe('toKaggleSignal', () => {
  it('builds a canonical URL from a ref and uses it as the title fallback', () => {
    const s = toKaggleSignal({ ref: 'owner/data', tags: ['oncology'] }, 'query');
    expect(s).not.toBeNull();
    expect(s!.url).toBe('https://www.kaggle.com/datasets/owner/data');
    expect(s!.title).toBe('owner/data');
    expect(s!.source).toBe('kaggle');
    expect(s!.topics).toContain('query');
    expect(s!.topics).toContain('oncology');
  });

  it('accepts datasetRef as a fallback for ref', () => {
    const s = toKaggleSignal({ datasetRef: 'o/d2', title: 'D2' }, 'q');
    expect(s!.url).toBe('https://www.kaggle.com/datasets/o/d2');
    expect(s!.title).toBe('D2');
  });

  it('prefers an explicit url and falls back to description for the summary', () => {
    const s = toKaggleSignal({ url: 'https://x.test/a', title: 'T', description: 'desc text' }, 'q');
    expect(s!.url).toBe('https://x.test/a');
    expect(s!.summary).toBe('desc text');
  });

  it('returns null when there is neither a usable ref nor an explicit url', () => {
    expect(toKaggleSignal({ title: 'Only a title' }, 'q')).toBeNull();
    expect(toKaggleSignal({}, 'q')).toBeNull();
  });

  it('normalizes tags (strings, {name} objects, nulls) and includes owner', () => {
    const s = toKaggleSignal(
      { ref: 'o/d', title: 'T', owner: 'alice', tags: ['a', { name: 'b' }, null, 3] },
      'q',
    );
    expect(s!.topics).toEqual(expect.arrayContaining(['q', 'alice', 'a', 'b', '3']));
  });

  it('omits empty query/owner/tag topics', () => {
    const s = toKaggleSignal({ ref: 'o/d', title: 'T', tags: [''] }, '');
    expect(s!.topics).toEqual([]);
  });

  it('forwards last_updated as publishedAt', () => {
    const s = toKaggleSignal({ ref: 'o/d', title: 'T', last_updated: '2026-01-01' }, 'q');
    expect(s!.publishedAt).toBe('2026-01-01');
  });
});

describe('toNewsSignal', () => {
  it('maps a full item with category/source/tags topics', () => {
    const s = toNewsSignal({
      title: 'Headline',
      url: 'https://n.test/a',
      summary: 'sum',
      category: 'science',
      source: 'Feed',
      tags: ['oncology'],
      published: '2026-05-01',
    });
    expect(s!.source).toBe('news');
    expect(s!.url).toBe('https://n.test/a');
    expect(s!.topics).toEqual(expect.arrayContaining(['science', 'Feed', 'oncology']));
    expect(s!.publishedAt).toBe('2026-05-01');
  });

  it('uses the title as the url when only a title is present', () => {
    const s = toNewsSignal({ title: 'Title only' });
    expect(s!.url).toBe('Title only');
    expect(s!.title).toBe('Title only');
  });

  it('uses the url as the title when only a url is present', () => {
    const s = toNewsSignal({ url: 'https://n.test/b' });
    expect(s!.title).toBe('https://n.test/b');
  });

  it('returns null when both url and title are missing', () => {
    expect(toNewsSignal({ summary: 'x', category: 'c' })).toBeNull();
  });

  it('ignores a non-array tags field', () => {
    const s = toNewsSignal({ title: 'T', tags: 'not-an-array' as unknown as string[] });
    expect(s!.topics).toEqual([]);
  });
});

describe('map*Items', () => {
  it('maps kaggle items and drops unmappable ones', () => {
    const out = mapKaggleItems(
      [{ ref: 'o/a', title: 'A' }, { title: 'no anchor' }, { ref: 'o/b' }],
      'q',
    );
    expect(out.map((s) => s.title)).toEqual(['A', 'o/b']);
  });

  it('maps news items and drops unmappable ones', () => {
    const out = mapNewsItems([{ title: 'A' }, { summary: 'none' }, { url: 'https://n/x' }]);
    expect(out).toHaveLength(2);
    expect(out.every((s) => s.source === 'news')).toBe(true);
  });
});

describe('pollBrainKaggle', () => {
  it('reports not-configured without a base url', async () => {
    vi.stubEnv('BRAIN_URL', '');
    const { signals, result } = await pollBrainKaggle({ url: '', queries: ['q'] });
    expect(signals).toEqual([]);
    expect(result).toMatchObject({ source: 'kaggle', ok: false, count: 0 });
    expect(result.error).toMatch(/not configured/i);
  });

  it('reports an honest error when no queries are given', async () => {
    const { signals, result } = await pollBrainKaggle({ url: 'http://brain.test' });
    expect(signals).toEqual([]);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no kaggle queries/i);
  });

  it('maps datasets returned for each query', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(String(url));
        return jsonResponse({ datasets: [{ ref: 'o/a', title: 'A' }] });
      }),
    );
    const { signals, result } = await pollBrainKaggle({
      url: 'http://brain.test/',
      queries: ['one', 'two'],
      perPage: 3,
      sortBy: 'votes',
    });
    expect(result).toMatchObject({ source: 'kaggle', ok: true, count: 2 });
    expect(signals).toHaveLength(2);
    expect(calls[0]).toContain('/kaggle/datasets/search');
    expect(calls[0]).toContain('per_page=3');
    expect(calls[0]).toContain('sort_by=votes');
  });

  it('clamps a zero per_page up to 1 and defaults sort_by to hottest', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(String(url));
        return jsonResponse({ datasets: [] });
      }),
    );
    await pollBrainKaggle({ url: 'http://brain.test', queries: ['q'], perPage: 0 });
    expect(calls[0]).toContain('per_page=1');
    expect(calls[0]).toContain('sort_by=hottest');
  });

  it('treats a missing datasets array as zero signals but still ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ total: 0 })));
    const { signals, result } = await pollBrainKaggle({ url: 'http://brain.test', queries: ['q'] });
    expect(signals).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.count).toBe(0);
  });

  it('keeps partial success: one query fails, another succeeds', async () => {
    let n = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        n += 1;
        if (n === 1) throw new Error('boom');
        return jsonResponse({ datasets: [{ ref: 'o/a', title: 'A' }] });
      }),
    );
    const { signals, result } = await pollBrainKaggle({ url: 'http://brain.test', queries: ['bad', 'good'] });
    expect(signals).toHaveLength(1);
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('reports failure when every query fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 502 })));
    const { signals, result } = await pollBrainKaggle({ url: 'http://brain.test', queries: ['q'] });
    expect(signals).toEqual([]);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/HTTP 502/);
  });

  it('throws an honest error when the body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => { throw new Error('bad'); } })));
    const { result } = await pollBrainKaggle({ url: 'http://brain.test', queries: ['q'] });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/returned no JSON/);
  });
});

describe('pollBrainNews', () => {
  it('reports not-configured without a base url', async () => {
    vi.stubEnv('BRAIN_URL', '');
    const { signals, result } = await pollBrainNews({ url: '' });
    expect(signals).toEqual([]);
    expect(result).toMatchObject({ source: 'news', ok: false, count: 0 });
  });

  it('maps news items and honors a positive limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ items: [{ title: 'A' }, { title: 'B' }, { title: 'C' }] })),
    );
    const { signals, result } = await pollBrainNews({ url: 'http://brain.test', limit: 2 });
    expect(result).toMatchObject({ ok: true, count: 2 });
    expect(signals.map((s) => s.title)).toEqual(['A', 'B']);
  });

  it('a limit of 0 is treated as "all items"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [{ title: 'A' }, { title: 'B' }] })));
    const { signals } = await pollBrainNews({ url: 'http://brain.test', limit: 0 });
    expect(signals).toHaveLength(2);
  });

  it('a missing items array yields zero signals but ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ count: 0 })));
    const { signals, result } = await pollBrainNews({ url: 'http://brain.test' });
    expect(signals).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('reports an honest error on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    const { result } = await pollBrainNews({ url: 'http://brain.test' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/ECONNREFUSED/);
  });
});
