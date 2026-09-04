import type { ExternalSignal, SourceKind, SourcePollResult, IntakeSnapshot } from './types';
import { pollArxiv } from './arxiv';
import { pollHackerNews } from './hackernews';
import { pollRssFeeds, type RssFeedSpec } from './rss';
import { pollGitHub } from './github';
import { createHash } from 'node:crypto';

/**
 * Signal store — the dedupe ledger for everything intake pulled.
 * Pure in-memory + persistence hook (server passes a save callback). No
 * network here: this is the durable memory between poll cycles.
 */
export class SignalStore {
  private signals: ExternalSignal[] = [];

  constructor(
    private onSave?: (signals: ExternalSignal[]) => void,
    initial: ExternalSignal[] = [],
  ) {
    this.signals = initial;
  }

  ingest(signals: ExternalSignal[]): { added: number; dupes: number; signals: ExternalSignal[] } {
    const seen = new Set(this.signals.map((s) => s.id));
    let added = 0;
    let dupes = 0;
    for (const sig of signals) {
      if (!sig || !sig.id || seen.has(sig.id)) {
        dupes++;
        continue;
      }
      seen.add(sig.id);
      this.signals.push(sig);
      added++;
    }
    // newest-first so consumers see the freshest signals.
    this.signals.sort((a, b) => b.fetchedAt - a.fetchedAt);
    if (added > 0) this.persist();
    return { added, dupes, signals: this.signals };
  }

  list(limit = 50): ExternalSignal[] {
    return this.signals.slice(0, limit);
  }

  /** Oldest unconsumed signal (FIFO by fetchedAt asc), for deterministic grounding. */
  nextUnconsumed(): ExternalSignal | undefined {
    return [...this.signals]
      .filter((s) => !s.consumed)
      .sort((a, b) => a.fetchedAt - b.fetchedAt)[0];
  }

  all(): ExternalSignal[] {
    return this.signals;
  }

  markConsumed(id: string, groundedTool?: string): boolean {
    const sig = this.signals.find((s) => s.id === id);
    if (!sig || sig.consumed) return false;
    sig.consumed = true;
    sig.consumedAt = Date.now();
    if (groundedTool) sig.groundedTool = groundedTool;
    this.persist();
    return true;
  }

  get(id: string): ExternalSignal | undefined {
    return this.signals.find((s) => s.id === id);
  }

  snapshot(lastPollResults: SourcePollResult[], lastGroundAt: number | null, lastGroundSummary: string | null): IntakeSnapshot {
    const bySource: Record<string, number> = {};
    for (const s of this.signals) bySource[s.source] = (bySource[s.source] ?? 0) + 1;
    return {
      total: this.signals.length,
      unconsumed: this.signals.filter((s) => !s.consumed).length,
      consumed: this.signals.filter((s) => s.consumed).length,
      bySource,
      lastPollAt: lastPollResults.length ? this.signals[0]?.fetchedAt ?? null : null,
      lastPollResults,
      lastGroundAt,
      lastGroundSummary,
      groundedTools: this.signals.filter((s) => s.groundedTool).map((s) => s.groundedTool!) as string[],
    };
  }

  private persist(): void {
    if (this.onSave) this.onSave(this.signals);
  }

  static mergeDeduped(a: ExternalSignal[], b: ExternalSignal[]): ExternalSignal[] {
    const map = new Map<string, ExternalSignal>();
    for (const s of [...a, ...b]) map.set(s.id, s);
    return [...map.values()].sort((x, y) => y.fetchedAt - x.fetchedAt);
  }
}

/** sha256 content-id for a string (used for persisted-file integrity tags). */
export function contentTag(obj: unknown): string {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 16);
}

export interface TopicSet {
  name: string;
  queries: string[];
  feeds: RssFeedSpec[];
}

export const DEFAULT_TOPIC_QUERIES: string[] = [
  'reinforcement learning mathematics',
  'deterministic algorithm verification',
  'cancer drug resistance mechanism',
  'formal proof assistant',
  'quantum error correction',
  'secure code review static analysis',
];

export const DEFAULT_RSS_FEEDS: RssFeedSpec[] = [
  { url: 'https://lobste.rs/rss', topics: ['programming', 'systems'] },
  { url: 'https://www.reddit.com/r/machinelearning/.rss', topics: ['machine learning', 'ai'] },
  { url: 'https://www.reddit.com/r/math/.rss', topics: ['mathematics'] },
  { url: 'https://www.reddit.com/r/compsci/.rss', topics: ['computer science'] },
  { url: 'https://blog.research.google/feeds/posts/default', topics: ['research', 'google'] },
];

const SOURCES: SourceKind[] = ['arxiv', 'github', 'hackernews', 'agentbrowser'];

export function topicsForName(name: string): string[] {
  return name.toLowerCase().split(/[\s,_-]+/).filter(Boolean);
}
