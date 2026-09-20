/**
 * Autonomously Synthesized Component: learner_coding_lru_cache_2332
 * Blueprint: tpl_lru_cache (Capacity: 20, TTL: 60000ms)
 * Self-Healing Guards: ACTIVE
 */
export class learner_coding_lru_cache_2332 {
  private capacity: number;
  private cache: Map<string, { value: any; expiresAt: number }>;
  private hits: number = 0;
  private misses: number = 0;

  constructor(capacity = 20) {
    this.capacity = Math.max(1, capacity);
    this.cache = new Map();
  }

  public get(key: string): any {
    if (!this.cache.has(key)) {
      this.misses++;
      return undefined;
    }
    const entry = this.cache.get(key)!;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }
    this.cache.delete(key);
    this.cache.set(key, entry);
    this.hits++;
    return entry.value;
  }

  public set(key: string, value: any, ttlMs: number = 60000): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    // Invariant self-healing guard: enforce strict size ceiling
    if (this.cache.size > this.capacity) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  public getTelemetry(): { size: number; capacity: number; hits: number; misses: number; hitRatio: number } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      capacity: this.capacity,
      hits: this.hits,
      misses: this.misses,
      hitRatio: total > 0 ? this.hits / total : 1.0
    };
  }
}