import type { ExternalSignal, SourcePollResult } from './types';
import { timedFetch, makeSignal } from './util';

/**
 * Hacker News — real story search via the Algolia API (no key required).
 * Endpoint: https://hn.algolia.com/api/v1/search?query=...&tags=story
 * Honest: failures return a failed SourcePollResult, never fabricated stories.
 */
export async function pollHackerNews(
  query: string,
  maxResults = 8,
): Promise<{ signals: ExternalSignal[]; result: SourcePollResult }> {
  try {
    const url =
      `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}` +
      `&tags=story&hitsPerPage=${maxResults}`;
    const res = await timedFetch(url, 15000);
    const data = await res.json();

    const hits = Array.isArray(data?.hits) ? data.hits : [];
    const signals: ExternalSignal[] = hits
      .filter((h: any) => h && h.title && (h.url || h.objectID))
      .map((h: any) => {
        const storyUrl = h.url || `https://news.ycombinator.com/item?id=${h.objectID}`;
        const points = h.points ? `${h.points} points` : '';
        const comments = h.num_comments ? `${h.num_comments} comments` : '';
        const summary = [h.title, points && `(${points})`, comments && `(${comments})`].filter(Boolean).join(' ');
        return makeSignal('hackernews', storyUrl, h.title, summary, query.split(/\s+/), h.created_at);
      });

    return { signals, result: { source: 'hackernews', ok: true, count: signals.length } };
  } catch (err: any) {
    return { signals: [], result: { source: 'hackernews', ok: false, count: 0, error: err?.message || 'hackernews poll failed' } };
  }
}
