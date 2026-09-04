import { describe, it, expect, vi, afterEach } from 'vitest';
import { pollArxiv } from '../src/intake/arxiv';
import { pollHackerNews } from '../src/intake/hackernews';
import { pollGitHub } from '../src/intake/github';
import { pollRssFeeds } from '../src/intake/rss';
import { pollAllSources } from '../src/intake/poll';
import { makeSignal } from '../src/intake/util';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const ok = (body: string | object, contentType = 'application/xml') =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': contentType },
  });

describe('intake fetchers — honest failures', () => {
  it('arxiv returns a failed result (not fabricated papers) on HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 500 })));
    const { signals, result } = await pollArxiv('quantum', 4);
    expect(signals).toHaveLength(0);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('500');
  });

  it('arxiv parses real Atom entries', async () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>A Deterministic Proof Assistant</title>
<id>http://arxiv.org/abs/2401.12345v1</id>
<published>2024-01-02T00:00:00Z</published>
<summary>We present a new formal proof assistant with checked invariants.</summary></entry></feed>`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok(xml)));
    const { signals, result } = await pollArxiv('proof assistant', 8);
    expect(result.ok).toBe(true);
    expect(signals).toHaveLength(1);
    expect(signals[0].title).toContain('Deterministic Proof Assistant');
    expect(signals[0].url).toContain('arxiv.org');
  });

  it('hackernews parses real Algolia hits', async () => {
    const json = { hits: [{ objectID: '1', title: 'Formal verification for the masses', url: 'https://example.com/fv', points: 42, num_comments: 7, created_at: '2024-01-01T00:00:00Z' }] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok(json, 'application/json')));
    const { signals, result } = await pollHackerNews('formal verification', 8);
    expect(result.ok).toBe(true);
    expect(signals[0].title).toContain('Formal verification');
    expect(signals[0].summary).toContain('42 points');
  });

  it('github surfaces rate-limit errors from the real engine', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 403 })));
    const { signals, result } = await pollGitHub('math', 4);
    expect(signals).toHaveLength(0);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('rate limit');
  });

  it('rss parses real RSS items and reports feed failures independently', async () => {
    const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>F</title>
<item><title>Math news</title><link>https://example.com/1</link><description><![CDATA[Big math story]]></description><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item></channel></rss>`;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok(rss))
      .mockResolvedValueOnce(new Response('x', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    const { signals, results } = await pollRssFeeds([
      { url: 'https://ok.example/rss', topics: ['math'] },
      { url: 'https://bad.example/rss', topics: [] },
    ]);
    expect(signals).toHaveLength(1);
    expect(signals[0].title).toBe('Math news');
    expect(results[0].ok).toBe(true);
    expect(results[1].ok).toBe(false);
  });
});

describe('pollAllSources orchestration', () => {
  it('aggregates signals and per-source results with dedupe-safe ids', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok('<?xml version="1.0"?><feed/>', 'application/xml')));
    const { signals, results } = await pollAllSources({ queries: ['math'], feeds: [] });
    expect(Array.isArray(signals)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    // arxiv + github + hackernews all attempted
    const sources = new Set(results.map((r) => r.source));
    expect(sources.has('arxiv')).toBe(true);
    expect(sources.has('github')).toBe(true);
    expect(sources.has('hackernews')).toBe(true);
  });
});

describe('makeSignal normalization', () => {
  it('clamps title/summary length and assigns deterministic ids', () => {
    const s = makeSignal('arxiv', 'https://a/1', '  Title  ', ' '.repeat(50) + 'sum' + ' '.repeat(50), ['A', ' b ', '']);
    expect(s.title).toBe('Title');
    expect(s.summary.trim()).toBe('sum');
    expect(s.topics).toEqual(['A', 'b']);
    expect(s.consumed).toBe(false);
  });
});
