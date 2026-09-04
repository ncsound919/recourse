import type { ExternalSignal, SourcePollResult } from './types';
import { timedFetch, makeSignal } from './util';

/**
 * arXiv API — real search over scientific papers.
 * Endpoint: http://export.arxiv.org/api/query?search_query=...&sortBy=submittedDate
 * Returns Atom XML; we parse it leniently. Honest: any HTTP/network/parse
 * failure returns a failed SourcePollResult — never invented papers.
 */
export async function pollArxiv(
  query: string,
  maxResults = 8,
): Promise<{ signals: ExternalSignal[]; result: SourcePollResult }> {
  try {
    const url =
      `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}` +
      `&start=0&max_results=${maxResults}&sortBy=submittedDate&sortOrder=descending`;
    const res = await timedFetch(url, 20000);
    const xml = await res.text();

    const entries: Array<{ title: string; summary: string; url: string; published: string }> = [];
    const re = /<entry>([\s\S]*?)<\/entry>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) {
      const block = m[1];
      const strip = (tag: string) => {
        const mm = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
        if (!mm) return '';
        return mm[1]
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim();
      };
      const title = strip('title');
      const summary = strip('summary').replace(/\s+/g, ' ').trim();
      const urlMatch = block.match(/<id>\s*(https?:\/\/[^<\s]+)/);
      const pubMatch = block.match(/<published>\s*([^<\s]+)/);
      if (title && urlMatch) {
        entries.push({ title, summary, url: urlMatch[1], published: pubMatch ? pubMatch[1] : '' });
      }
    }

    const signals = entries.map((e) => makeSignal('arxiv', e.url, e.title, e.summary, query.split(/\s+/), e.published));
    return { signals, result: { source: 'arxiv', ok: true, count: signals.length } };
  } catch (err: any) {
    return { signals: [], result: { source: 'arxiv', ok: false, count: 0, error: err?.message || 'arxiv poll failed' } };
  }
}
