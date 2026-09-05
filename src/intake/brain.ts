/**
 * Deterministic-brain intake providers — Kaggle datasets + news media.
 *
 * Recourse polls these through the deterministic brain (the Deep, BRAIN_URL
 * default :3210) rather than talking to Kaggle/news APIs directly. The brain
 * holds the real credentials and serves normalized JSON:
 *   GET /kaggle/datasets/search?q=&per_page=&sort_by=  -> {datasets, total, query}
 *   GET /news (cached)                                  -> {items, count}
 *
 * Honesty contract (matches every other intake source):
 *  - Each signal carries a real URL (Kaggle refs become their canonical
 *    kaggle.com URL; news items carry the brain's url). No fabricated entries.
 *  - Brain unreachable / not configured / non-2xx => an honest ok:false
 *    SourcePollResult, never fake datasets or headlines.
 *  - Signals drop into the normal SignalStore, so grounding + dreams consume
 *    them exactly like arXiv/GitHub/HN signals.
 */

import type { ExternalSignal, SourcePollResult } from './types';
import { makeSignal } from './util';

export function brainBaseUrl(url?: string): string {
  return (url ?? process.env.BRAIN_URL ?? '').replace(/\/+$/, '');
}

// ---------------------------------------------------------------------------
// Pure mappers (unit-testable, no network)
// ---------------------------------------------------------------------------

export interface KaggleDatasetItem {
  ref?: string;
  datasetRef?: string;
  title?: string;
  owner?: string;
  subtitle?: string;
  description?: string;
  tags?: unknown[];
  last_updated?: string;
  url?: string;
}

/** Normalize one Kaggle dataset item from the brain into an ExternalSignal. */
export function toKaggleSignal(item: KaggleDatasetItem, query: string): ExternalSignal | null {
  const ref = String(item.ref || item.datasetRef || '').trim();
  const title = String(item.title || '').trim();
  const explicitUrl = String(item.url || '').trim();
  const url = explicitUrl || (ref ? `https://www.kaggle.com/datasets/${ref}` : '');
  if (!url || (!title && !ref)) return null;
  const subtitle = String(item.subtitle || item.description || '').trim();
  const tags: string[] = [];
  for (const t of item.tags ?? []) {
    if (t == null) continue;
    const s = String((t as { name?: unknown }).name ?? t).trim();
    if (s) tags.push(s);
  }
  const owner = String(item.owner || '').trim();
  const topics = [query, ...(owner ? [owner] : []), ...tags].filter(Boolean);
  return makeSignal('kaggle', url, title || ref, subtitle, topics, item.last_updated || undefined);
}

export interface NewsItem {
  title?: string;
  url?: string;
  summary?: string;
  source?: string;
  published?: string;
  sentiment?: number;
  category?: string;
  tags?: string[];
}

/** Normalize one news item from the brain into an ExternalSignal. */
export function toNewsSignal(item: NewsItem): ExternalSignal | null {
  const url = String(item.url || '').trim();
  const title = String(item.title || '').trim();
  if (!url && !title) return null;
  const topics = [
    String(item.category || '').trim(),
    String(item.source || '').trim(),
    ...(Array.isArray(item.tags) ? item.tags.map((t) => String(t).trim()) : []),
  ].filter(Boolean);
  return makeSignal('news', url || title, title || url, String(item.summary || '').trim(), topics, item.published || undefined);
}

export function mapKaggleItems(items: KaggleDatasetItem[], query: string): ExternalSignal[] {
  return items.map((it) => toKaggleSignal(it, query)).filter((s): s is ExternalSignal => s !== null);
}

export function mapNewsItems(items: NewsItem[]): ExternalSignal[] {
  return items.map((it) => toNewsSignal(it)).filter((s): s is ExternalSignal => s !== null);
}

// ---------------------------------------------------------------------------
// Brain-fetch helpers
// ---------------------------------------------------------------------------

async function brainJson(base: string, pathWithQuery: string, timeoutMs: number): Promise<unknown> {
  const res = await fetch(`${base}${pathWithQuery}`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`brain ${pathWithQuery} HTTP ${res.status}`);
  const data = (await res.json().catch(() => null)) as unknown;
  if (data == null) throw new Error(`brain ${pathWithQuery} returned no JSON`);
  return data;
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

/** Poll the brain for Kaggle datasets matching each query. */
export async function pollBrainKaggle(opts: {
  url?: string;
  queries?: string[];
  perQuery?: number;
  perPage?: number;
  sortBy?: string;
}): Promise<{ signals: ExternalSignal[]; result: SourcePollResult }> {
  const base = brainBaseUrl(opts.url);
  if (!base) return { signals: [], result: { source: 'kaggle', ok: false, count: 0, error: 'BRAIN_URL not configured' } };
  const queries = (opts.queries ?? []).filter(Boolean);
  if (queries.length === 0) return { signals: [], result: { source: 'kaggle', ok: false, count: 0, error: 'no kaggle queries' } };
  const perPage = Math.max(1, opts.perPage ?? opts.perQuery ?? 6);
  const sortBy = opts.sortBy ?? 'hottest';
  const signals: ExternalSignal[] = [];
  let lastError: string | undefined;
  try {
    for (const q of queries) {
      try {
        const data = (await brainJson(base, `/kaggle/datasets/search?q=${encodeURIComponent(q)}&per_page=${perPage}&sort_by=${encodeURIComponent(sortBy)}`, 25_000)) as {
          datasets?: KaggleDatasetItem[];
        };
        signals.push(...mapKaggleItems(Array.isArray(data.datasets) ? data.datasets : [], q));
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
  } catch (err) {
    return { signals: [], result: { source: 'kaggle', ok: false, count: 0, error: err instanceof Error ? err.message : String(err) } };
  }
  return {
    signals,
    result: { source: 'kaggle', ok: signals.length > 0 || !lastError, count: signals.length, ...(lastError && !signals.length ? { error: lastError } : {}) },
  };
}

/** Poll the brain's news feed (cached server-side for 120s). */
export async function pollBrainNews(opts: { url?: string; limit?: number }): Promise<{ signals: ExternalSignal[]; result: SourcePollResult }> {
  const base = brainBaseUrl(opts.url);
  if (!base) return { signals: [], result: { source: 'news', ok: false, count: 0, error: 'BRAIN_URL not configured' } };
  try {
    const data = (await brainJson(base, '/news', 20_000)) as { items?: NewsItem[] };
    const items = Array.isArray(data.items) ? data.items : [];
    const limit = Math.max(0, opts.limit ?? items.length);
    const signals = mapNewsItems(items.slice(0, limit || items.length));
    return { signals, result: { source: 'news', ok: true, count: signals.length } };
  } catch (err) {
    return { signals: [], result: { source: 'news', ok: false, count: 0, error: err instanceof Error ? err.message : String(err) } };
  }
}
