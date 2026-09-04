import type { ExternalSignal, SourceKind } from './types';
import { createHash } from 'node:crypto';

/** Stable id from the canonical (url + title) tuple. */
export function signalId(url: string, title: string): string {
  return createHash('sha256').update(`${url}\n${title}`).digest('hex').slice(0, 32);
}

/** Fetch helper with a hard timeout. Throws on network/timeout/HTTP errors —
 *  callers convert to a failed SourcePollResult, never to fake content. */
export async function timedFetch(url: string, timeoutMs = 15000): Promise<Response> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res;
}

/** Build a normalized signal from source pieces. */
export function makeSignal(
  source: SourceKind,
  url: string,
  title: string,
  summary: string,
  topics: string[],
  publishedAt?: string,
): ExternalSignal {
  const cleanTitle = (title || '').trim().slice(0, 300);
  const cleanSummary = (summary || '').trim().slice(0, 1200);
  return {
    id: signalId(url, cleanTitle || url),
    source,
    url,
    title: cleanTitle || url,
    summary: cleanSummary,
    topics: (topics || []).map((t) => String(t).trim()).filter(Boolean).slice(0, 12),
    publishedAt: publishedAt ? String(publishedAt).slice(0, 60) : undefined,
    fetchedAt: Date.now(),
    consumed: false,
  };
}

/** Split on word/space boundaries (used for RSS + generic keyword extraction). */
export function splitWords(s: string): string[] {
  return (s || '').toLowerCase().split(/[^a-z0-9+#.-]+/).filter(Boolean);
}
