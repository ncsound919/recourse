import type { ExternalSignal, SourcePollResult } from './types';
import { timedFetch, makeSignal } from './util';

/**
 * RSS/Atom — real feed parser for web/forums/news/blogs.
 * Handles both RSS 2.0 (<item>) and Atom (<entry>) shapes with a single
 * lenient regex pass. Honest: failures return a failed SourcePollResult, never
 * invented headlines.
 */
export interface RssFeedSpec {
  url: string;
  topics: string[];
}

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRssBody(xml: string): Array<{ title: string; link: string; summary: string; pubDate: string }> {
  const out: Array<{ title: string; link: string; summary: string; pubDate: string }> = [];
  const itemRe = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml))) {
    const block = m[1];
    const grab = (tag: string) => {
      const mm = block.match(new RegExp(`<${tag}(?:[^>]*)>([\\s\\S]*?)<\\/${tag}>`));
      return mm ? decodeXml(mm[1]) : '';
    };
    const title = grab('title');
    const link = (block.match(/<(?:link|guid)(?:[^>]*?)>\s*(https?:\/\/[^<\s]+)\s*<\//) || [])[1] ||
      (block.match(/<link\s+(?:[^>]*?)href\s*=\s*"([^"]+)"/) || [])[1] || '';
    const summary = grab('description') || grab('summary') || grab('content:encoded');
    const pubDate = grab('pubDate') || grab('published') || grab('updated');
    if (title && link) out.push({ title, link, summary, pubDate });
  }
  return out;
}

export async function pollRssFeed(
  feed: RssFeedSpec,
  maxResults = 8,
): Promise<{ signals: ExternalSignal[]; result: SourcePollResult }> {
  try {
    const res = await timedFetch(feed.url, 15000);
    const xml = await res.text();
    const items = parseRssBody(xml).slice(0, maxResults);
    const signals = items.map((it) => makeSignal('rss', it.link, it.title, it.summary, feed.topics, it.pubDate));
    return { signals, result: { source: 'rss', ok: true, count: signals.length } };
  } catch (err: any) {
    return { signals: [], result: { source: 'rss', ok: false, count: 0, error: err?.message || `rss poll failed: ${feed.url}` } };
  }
}

export async function pollRssFeeds(
  feeds: RssFeedSpec[],
  maxPerFeed = 6,
): Promise<{ signals: ExternalSignal[]; results: SourcePollResult[] }> {
  const settled = await Promise.all(feeds.map((f) => pollRssFeed(f, maxPerFeed)));
  const signals = settled.flatMap((s) => s.signals);
  const results = settled.map((s) => s.result);
  return { signals, results };
}
