/**
 * completionCache.ts — exact + semantic cache for model completions (P0.3).
 *
 * Research basis: semantic response caching (the GPTCache line of work) and
 * prompt-level dedupe. The self-improvement loops re-issue near-identical
 * generation prompts across cycles (the forge regenerating a spec, the dream
 * re-deriving a hypothesis, the open-ended engine re-solving a problem type).
 * Caching the verified completion by a deterministic key — and by token
 * similarity for paraphrased prompts — removes those calls entirely.
 *
 * Honesty contract: a hit returns the *exact* text a model previously produced
 * for that prompt (recorded with the model that produced it); it never
 * synthesizes or edits. The caller must still apply its own verification gate —
 * a cached completion is only as good as the gate that first accepted it. The
 * cache is bounded (LRU), optionally time-limited, and fully observable.
 */
import { jaccard } from './novelty.js';
import { sha256Hex } from './synergy/manifest.js';

export interface CacheMessage {
  role: string;
  content: string;
}

export interface CacheKeyOptions {
  temperature?: number;
  json?: boolean;
  /** Distinguishes logically different caches that share a prompt shape. */
  namespace?: string;
}

export interface CacheEntry {
  key: string;
  /** normalized prompt text, used for semantic lookup */
  text: string;
  /** namespace|temperature|json — semantic hits never cross variants */
  variant: string;
  value: string;
  /** the model that actually produced `value` */
  model: string;
  at: number;
  hits: number;
}

export interface CacheHit {
  value: string;
  model: string;
  exact: boolean;
  similarity: number;
  key: string;
  ageMs: number;
}

export interface CacheOptions {
  /** Max entries (default 500). */
  max?: number;
  /** Token-Jaccard similarity threshold for a semantic hit (default 0.97). */
  similarity?: number;
  /** Entry TTL in ms; 0 disables expiry (default 0). */
  ttlMs?: number;
}

export interface CacheStats {
  size: number;
  max: number;
  hits: number;
  misses: number;
  stores: number;
  evictions: number;
  expired: number;
  /** hits / (hits + misses), rounded to 4 dp; 0 when no lookups yet. */
  hitRate: number;
}

const round4 = (n: number): number => Math.round(n * 10000) / 10000;

function normalizeMessages(messages: CacheMessage[]): { text: string; key: string } {
  const text = messages
    .map((m) => `${String(m.role ?? '').trim().toLowerCase()}: ${String(m.content ?? '').trim().replace(/\s+/g, ' ')}`)
    .join('\n');
  return { text, key: text };
}

/** Options that make a cached completion semantically incompatible (a different
 *  temperature or namespace is a different request, not a paraphrase). */
function variantFor(opts: CacheKeyOptions): string {
  return `${opts.namespace ?? ''}|${typeof opts.temperature === 'number' ? opts.temperature : ''}|${Boolean(opts.json)}`;
}

/**
 * Bounded exact+semantic completion cache. Deterministic given the same
 * messages/options/clock; safe to persist is NOT assumed (in-memory only).
 */
export class CompletionCache {
  private entries = new Map<string, CacheEntry>();
  private readonly max: number;
  private readonly similarity: number;
  private readonly ttlMs: number;
  private hits = 0;
  private misses = 0;
  private stores = 0;
  private evictions = 0;
  private expired = 0;

  constructor(opts: CacheOptions = {}) {
    this.max = Math.max(1, Math.floor(opts.max ?? 500));
    this.similarity = Math.max(0, Math.min(1, opts.similarity ?? 0.97));
    this.ttlMs = Math.max(0, Number(opts.ttlMs) || 0);
  }

  /** Deterministic cache key for a prompt under a set of options. */
  keyFor(messages: CacheMessage[], opts: CacheKeyOptions = {}): string {
    const { key } = normalizeMessages(messages);
    return sha256Hex(JSON.stringify({
      ns: opts.namespace ?? '',
      temp: typeof opts.temperature === 'number' ? opts.temperature : null,
      json: Boolean(opts.json),
      key,
    })).slice(0, 32);
  }

  private isExpired(entry: CacheEntry, now: number): boolean {
    return this.ttlMs > 0 && now - entry.at > this.ttlMs;
  }

  /** Look up an exact match first, then the most-similar non-expired entry. */
  lookup(messages: CacheMessage[], opts: CacheKeyOptions = {}, now = Date.now()): CacheHit | null {
    const { text } = normalizeMessages(messages);
    const keyHash = this.keyFor(messages, opts);
    const exact = this.entries.get(keyHash);
    if (exact && !this.isExpired(exact, now)) {
      exact.hits += 1;
      this.hits += 1;
      // refresh LRU position
      this.entries.delete(keyHash);
      this.entries.set(keyHash, exact);
      return { value: exact.value, model: exact.model, exact: true, similarity: 1, key: keyHash, ageMs: now - exact.at };
    }
    if (exact && this.isExpired(exact, now)) {
      this.entries.delete(keyHash);
      this.expired += 1;
    }

    const variant = variantFor(opts);
    let best: CacheEntry | null = null;
    let bestSim = 0;
    for (const entry of this.entries.values()) {
      if (entry.variant !== variant) continue;
      if (this.isExpired(entry, now)) continue;
      const sim = jaccard(text, entry.text);
      if (sim >= this.similarity && sim > bestSim) {
        best = entry;
        bestSim = sim;
      }
    }
    if (!best) {
      this.misses += 1;
      return null;
    }
    best.hits += 1;
    this.hits += 1;
    return { value: best.value, model: best.model, exact: false, similarity: round4(bestSim), key: best.key, ageMs: now - best.at };
  }

  /** Store a real completion. A blank value is never cached. */
  store(messages: CacheMessage[], opts: CacheKeyOptions, value: string, model: string, now = Date.now()): void {
    if (typeof value !== 'string' || value.trim().length === 0) return;
    const key = this.keyFor(messages, opts);
    const { text } = normalizeMessages(messages);
    const existing = this.entries.get(key);
    if (existing) {
      existing.value = value;
      existing.model = model;
      existing.at = now;
      this.entries.delete(key);
      this.entries.set(key, existing);
      this.stores += 1;
      return;
    }
    this.entries.set(key, { key, text, variant: variantFor(opts), value, model, at: now, hits: 0 });
    this.stores += 1;
    while (this.entries.size > this.max) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
      this.evictions += 1;
    }
  }

  get size(): number {
    return this.entries.size;
  }

  stats(): CacheStats {
    const lookups = this.hits + this.misses;
    return {
      size: this.entries.size,
      max: this.max,
      hits: this.hits,
      misses: this.misses,
      stores: this.stores,
      evictions: this.evictions,
      expired: this.expired,
      hitRate: lookups ? round4(this.hits / lookups) : 0,
    };
  }

  clear(): void {
    this.entries.clear();
  }
}
