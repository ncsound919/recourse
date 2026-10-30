import { registerChunk, isChunkRegistered } from './chunks.js';

const LRU_BODY = `  private capacity: number;
  private cache: Map<string, { value: any; expiresAt: number }>;
  private hits: number = 0;
  private misses: number = 0;

  constructor(capacity = {{capacity}}) {
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

  public set(key: string, value: any, ttlMs: number = {{ttlMs}}): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
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
      hitRatio: total > 0 ? this.hits / total : 1.0,
    };
  }`;

const TOKEN_BUCKET_BODY = `  private capacity: number = {{burstCapacity}};
  private refillRate: number = {{refillRatePerSec}};
  private tokens: number = {{burstCapacity}};
  private lastRefill: number = Date.now();

  constructor(capacity = {{burstCapacity}}, refillRate = {{refillRatePerSec}}) {
    this.capacity = Math.max(1, capacity);
    this.refillRate = Math.max(0.1, refillRate);
    this.tokens = this.capacity;
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSec = Math.max(0, (now - this.lastRefill) / 1000);
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillRate);
    this.lastRefill = now;
  }

  public tryAcquire(requested: number = 1): boolean {
    if (requested <= 0) return true;
    this.refill();
    if (this.tokens >= requested) {
      this.tokens -= requested;
      return true;
    }
    return false;
  }

  public getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }`;

const HMAC_BODY = `  public static constantTimeCompare(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a[i] ^ b[i];
    }
    return diff === 0;
  }

  public static sanitizeBuffer(input: Uint8Array): Uint8Array {
    const clean = new Uint8Array(input.length);
    for (let i = 0; i < input.length; i++) {
      clean[i] = input[i] & 0xFF;
    }
    return clean;
  }`;

export function registerBuiltinChunks(): void {
  if (!isChunkRegistered('chk_lru_cache_core')) {
    registerChunk({
      id: 'chk_lru_cache_core',
      language: 'ts',
      body: LRU_BODY,
      test: `const c = new {{entrypointName}}(2);
c.set('k1', 100);
c.set('k2', 200);
assert c.get('k1') === 100;
c.set('k3', 300);
assert c.get('k2') === undefined;`,
      provenance: { source: 'recourse/componentTemplates (migrated)', commit: 'factory-v1' }
    });
  }
  if (!isChunkRegistered('chk_token_bucket_core')) {
    registerChunk({
      id: 'chk_token_bucket_core',
      language: 'ts',
      body: TOKEN_BUCKET_BODY,
      test: `const tb = new {{entrypointName}}(10, 5);
assert tb.tryAcquire(5) === true;
assert tb.tryAcquire(5) === true;
assert tb.tryAcquire(1) === false;`,
      provenance: { source: 'recourse/componentTemplates (migrated)', commit: 'factory-v1' }
    });
  }
  if (!isChunkRegistered('chk_hmac_sanitizer_core')) {
    registerChunk({
      id: 'chk_hmac_sanitizer_core',
      language: 'ts',
      body: HMAC_BODY,
      test: `const b1 = new Uint8Array([10, 20, 30, 40]);
const b2 = new Uint8Array([10, 20, 30, 40]);
const b3 = new Uint8Array([10, 20, 30, 41]);
assert {{entrypointName}}.constantTimeCompare(b1, b2) === true;
assert {{entrypointName}}.constantTimeCompare(b1, b3) === false;`,
      provenance: { source: 'recourse/componentTemplates (migrated)', commit: 'factory-v1' }
    });
  }
}
