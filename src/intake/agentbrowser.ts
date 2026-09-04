import type { ExternalSignal, SourcePollResult } from './types';
import { makeSignal } from './util';
import { agentBrowserFetch } from '../lib/agentBrowser';

/**
 * AgentBrowser web source — downloads a web page through AgentBrowser and
 * turns it into an unconsumed external signal (so grounding/forge can consume
 * it). Honest: a failed/unreachable/unauth'd download yields a failed
 * SourcePollResult, never a fabricated page.
 */
export async function pollAgentBrowserUrl(
  url: string,
): Promise<{ signals: ExternalSignal[]; result: SourcePollResult }> {
  if (!/^https?:\/\//i.test(url.trim())) {
    return { signals: [], result: { source: 'agentbrowser', ok: false, count: 0, error: 'invalid url' } };
  }
  try {
    const res = await agentBrowserFetch({ url: url.trim(), mode: 'download' });
    if (!res.ok || !res.text) {
      return { signals: [], result: { source: 'agentbrowser', ok: false, count: 0, error: res.error || 'download failed' } };
    }
    const text = res.text;
    const lines = text
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const title = (lines.slice(0, 120) || url).trim();
    const summary = lines.slice(0, 2000);
    const topics = title.toLowerCase().split(/[\s,_\-]+/).filter((w) => w.length > 3).slice(0, 8);
    const signal = makeSignal('agentbrowser', url, title, summary, topics);
    return { signals: [signal], result: { source: 'agentbrowser', ok: true, count: 1 } };
  } catch (err: any) {
    return { signals: [], result: { source: 'agentbrowser', ok: false, count: 0, error: err?.message || 'agentbrowser download failed' } };
  }
}
