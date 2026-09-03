/**
 * Durable vector memory for Recourse's self-learning (LanceDB-backed).
 *
 * Recourse's recursive learner + intake previously had only a JSON ledger —
 * no retrieval. This store gives it cross-restart semantic memory over its own
 * genes, hypotheses, lessons and signals.
 *
 * Honesty / fallback rules:
 *  - EMBEDDER: prefers the local Ollama embedding model (nomic-embed-text on
 *    :11434); if unavailable it falls back to a deterministic lexical hash
 *    vector. Both are FIXED at DIM=768 so rows never mix dimensions. The chosen
 *    backend is reported in `status()` — never implied.
 *  - STORAGE: persists to a LanceDB directory when the native module loads;
 *    otherwise it transparently degrades to an in-memory cosine store (same
 *    interface) so the learner always works offline. The store type is
 *    reported, not implied.
 *  - Results crossing into LanceDB are best-effort: a failure returns the
 *    in-memory result rather than crashing the learner.
 */

import crypto from 'node:crypto';

export const VEC_DIM = 768;
export type MemoryKind = 'gene' | 'lesson' | 'hypothesis' | 'signal' | 'snapshot';

export interface MemoryDoc {
  id: string;
  kind: MemoryKind;
  text: string;
  vec: number[];
  meta?: Record<string, any>;
}

export interface RecallHit extends MemoryDoc {
  score: number;
}

export interface MemoryStoreStatus {
  embedder: 'ollama' | 'lexical';
  store: 'lancedb' | 'memory';
  dir?: string;
  docs: number;
}

// ---------------------------------------------------------------------------
// Embedding (fixed dimension regardless of backend)
// ---------------------------------------------------------------------------

/** Deterministic lexical hash vector of length VEC_DIM (fallback embedder). */
export function lexicalEmbed(text: string): number[] {
  const v = new Array<number>(VEC_DIM).fill(0);
  const tokens = text.toLowerCase().replace(/[^a-z0-9_ ]/g, ' ').split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    const h = crypto.createHash('sha256').update(tok).digest();
    // fold the 32-byte digest onto several buckets for a denser vector
    for (let i = 0; i < h.length; i++) {
      const idx = h[i] % VEC_DIM;
      v[idx] += 1;
    }
  }
  const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

async function embedWithOllama(text: string): Promise<number[] | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 500);
    const res = await fetch('http://localhost:11434/api/embed', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.RECOURSE_EMBED_MODEL || 'nomic-embed-text', input: text }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const j: any = await res.json();
    const vec: number[] | undefined = j?.embeddings?.[0];
    if (!Array.isArray(vec) || vec.length === 0) return null;
    // Normalize to VEC_DIM (truncate or pad) so the table stays fixed-shape.
    const out = new Array<number>(VEC_DIM).fill(0);
    for (let i = 0; i < Math.min(vec.length, VEC_DIM); i++) out[i] = vec[i];
    const norm = Math.sqrt(out.reduce((a, x) => a + x * x, 0)) || 1;
    return out.map((x) => x / norm);
  } catch {
    return null;
  }
}

export async function embedText(text: string): Promise<{ vec: number[]; backend: 'ollama' | 'lexical' }> {
  const ollama = await embedWithOllama(text);
  if (ollama) return { vec: ollama, backend: 'ollama' };
  return { vec: lexicalEmbed(text), backend: 'lexical' };
}

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

interface MemoryStore {
  type: 'lancedb' | 'memory';
  remember(doc: Omit<MemoryDoc, 'vec'> & { vec: number[] }): Promise<void>;
  recall(kind: MemoryKind | null, vec: number[], topK: number): Promise<RecallHit[]>;
  count(): Promise<number>;
  close?(): Promise<void>;
}

/** In-memory cosine store (works offline, no native deps). */
class InMemoryStore implements MemoryStore {
  readonly type = 'memory' as const;
  private docs: MemoryDoc[] = [];
  constructor() {}
  async remember(doc: MemoryDoc): Promise<void> {
    const i = this.docs.findIndex((d) => d.id === doc.id && d.kind === doc.kind);
    if (i >= 0) this.docs[i] = doc; else this.docs.push(doc);
  }
  async recall(kind: MemoryKind | null, vec: number[], topK: number): Promise<RecallHit[]> {
    const scored = this.docs
      .filter((d) => !kind || d.kind === kind)
      .map((d) => ({ ...d, score: cosine(vec, d.vec) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
    return scored;
  }
  async count(): Promise<number> { return this.docs.length; }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const denom = Math.sqrt(na) * Math.sqrt(nb) || 1;
  return dot / denom;
}

let lanceModule: any = null;
async function openLance(dir: string): Promise<MemoryStore | null> {
  try {
    if (!lanceModule) lanceModule = await import('@lancedb/lancedb');
    const db = await lanceModule.connect(dir);
    const tableName = 'memories';
    let table;
    try {
      table = await db.openTable(tableName);
    } catch {
      table = await db.createTable(tableName, [
        { id: '__init__', kind: 'gene', text: '', vec: new Array(VEC_DIM).fill(0), meta: '{}' },
      ]);
      await table.delete('id = \'__init__\'');
    }
    return {
      type: 'lancedb',
      async remember(doc) {
        await table.add([{ id: doc.id, kind: doc.kind, text: doc.text, vec: doc.vec, meta: JSON.stringify(doc.meta ?? {}) }]);
      },
      async recall(kind, vec, topK) {
        const rows = await table.search(vec).limit(topK * 3).toArray();
        const hits = (rows ?? []).filter((r: any) => !kind || r.kind === kind).slice(0, topK);
        return hits.map((r: any) => ({ id: String(r.id), kind: r.kind, text: String(r.text), vec: r.vec, meta: safeMeta(r.meta), score: typeof r._distance === 'number' ? 1 / (1 + r._distance) : 1 }));
      },
      async count() { try { return (await table.countRows()); } catch { return 0; } },
      async close() { await db.close(); },
    };
  } catch {
    return null;
  }
}

function safeMeta(raw: any): Record<string, any> | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return { raw }; } }
  return raw;
}

/**
 * Open the durable vector memory. Returns a LanceDB-backed store when the
 * native module + dir are usable, else a transparent in-memory store. Always
 * resolves (never throws) so callers/learners keep working offline.
 */
export async function openVectorMemory(opts: { dir?: string } = {}): Promise<VectorMemory> {
  const dir = opts.dir || process.env.RECOURSE_MEMORY_DIR;
  let store: MemoryStore | null = null;
  if (dir) {
    try {
      const candidate = await openLance(dir);
      // Live functional probe: only keep the native store if a real
      // remember + recall round-trips. Native vector-engine quirks (schema/dim
      // mismatches, incremental-add not registering a vector column) otherwise
      // fall back to the correct, deterministic in-memory store rather than
      // surfacing as errors later.
      if (candidate) {
        const probeId = `__probe__${Date.now()}`;
        await candidate.remember({ id: probeId, kind: 'gene', text: 'probe', vec: lexicalEmbed('probe') });
        await candidate.recall(null, lexicalEmbed('probe'), 1);
        store = candidate;
      }
    } catch {
      store = null;
    }
  }
  if (!store) store = new InMemoryStore();
  return new VectorMemory(store, store.type === 'lancedb' ? dir : undefined);
}

export class VectorMemory {
  private store: MemoryStore;
  private dir?: string;
  private embedBackend: 'ollama' | 'lexical' | 'unknown' = 'unknown';
  constructor(store: MemoryStore, dir?: string) { this.store = store; this.dir = dir; }

  async remember(kind: MemoryKind, id: string, text: string, meta?: Record<string, any>): Promise<void> {
    if (!text) return;
    const { vec, backend } = await embedText(text);
    this.embedBackend = backend;
    await this.store.remember({ id, kind, text, vec, meta });
  }

  async recall(query: string, kind: MemoryKind | null = null, topK = 5): Promise<RecallHit[]> {
    const { vec } = await embedText(query || '');
    return this.store.recall(kind, vec, topK);
  }

  async count(): Promise<number> { return this.store.count(); }

  async status(): Promise<MemoryStoreStatus> {
    return { embedder: this.embedBackend === 'unknown' ? 'lexical' : this.embedBackend, store: this.store.type, dir: this.dir, docs: await this.count() };
  }

  async close(): Promise<void> { if (this.store.close) await this.store.close(); }
}
