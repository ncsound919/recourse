import type { ExternalSignal, SourcePollResult, SourceKind } from './types';
import { pollArxiv } from './arxiv';
import { pollHackerNews } from './hackernews';
import { pollRssFeeds, type RssFeedSpec } from './rss';
import { pollGitHub } from './github';
import { pollAgentBrowserUrl } from './agentbrowser';

/**
 * Poll orchestrator — fans out a set of topic queries + RSS feeds across the
 * real sources. Honest budget: every source failure is recorded in its own
 * SourcePollResult; a poll never blocks the whole cycle on one slow source.
 */
export async function pollAllSources(opts: {
  queries?: string[];
  feeds?: RssFeedSpec[];
  perQuery?: number;
  webUrls?: string[];
}): Promise<{ signals: ExternalSignal[]; results: SourcePollResult[] }> {
  const queries = (opts.queries ?? []).filter(Boolean);
  const feeds = opts.feeds ?? [];
  const perQuery = opts.perQuery ?? 4;
  const webUrls = (opts.webUrls ?? []).filter((u) => /^https?:\/\//i.test(u.trim()));
  const results: SourcePollResult[] = [];
  const signals: ExternalSignal[] = [];

  const jobs: Promise<void>[] = [];
  const run = (fn: () => Promise<void>) => jobs.push(Promise.resolve().then(fn).catch(() => {}));

  // arxiv is slowest + most valuable for science grounding — poll it first.
  for (const q of queries) {
    run(async () => {
      const { signals: s, result } = await pollArxiv(q, perQuery);
      results.push(result);
      signals.push(...s);
    });
  }
  for (const q of queries) {
    run(async () => {
      const { signals: s, result } = await pollHackerNews(q, perQuery);
      results.push(result);
      signals.push(...s);
    });
  }
  for (const q of queries) {
    run(async () => {
      const { signals: s, result } = await pollGitHub(q, perQuery);
      results.push(result);
      signals.push(...s);
    });
  }

  // Optional web URLs downloaded through AgentBrowser (configured via env).
  for (const url of webUrls) {
    run(async () => {
      const { signals: s, result } = await pollAgentBrowserUrl(url);
      results.push(result);
      signals.push(...s);
    });
  }

  await Promise.all(jobs);
  if (feeds.length) {
    const { signals: feedSignals, results: feedResults } = await pollRssFeeds(feeds, Math.max(3, perQuery));
    signals.push(...feedSignals);
    results.push(...feedResults);
  }

  return { signals, results };
}

export type { SourceKind };
