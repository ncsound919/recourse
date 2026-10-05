/**
 * Durable vector memory for Recourse's self-learning (LanceDB-backed).
 *
 * Recourse's recursive learner + intake previously had only a JSON ledger —
 * no retrieval. This store gives it cross-restart semantic memory over its own
 * genes, hypotheses, lessons and signals.
 *
 * Honesty / fallback rules:
 *  - EMBEDDER: prefers the configured API embedding model (`EMBEDDING_MODEL` on
 *    `EMBEDDING_BASE_URL || API_MODEL_BASE_URL`); if unset/unavailable it falls
 *    back to a deterministic lexical hash vector. Both are FIXED at DIM=768 so
 *    rows never mix dimensions. The chosen backend is reported in `status()` —
 *    never implied. No localhost probe is ever made.
 *  - STORAGE: persists to a LanceDB directory when the native module loads;
 *    otherwise it transparently degrades to an in-memory cosine store (same
 *    interface) so the learner always works offline. The store type is
 *    reported, not implied.
 *  - Results crossing into LanceDB are best-effort: a failure returns the
 *    in-memory result rather than crashing the learner.
 */

import crypto from 'node:crypto';

export const VEC_DIM = 768;
export const MEMORY_KINDS = ['gene', 'lesson', 'hypothesis', 'signal', 'snapshot'] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

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
  /** 'unknown' until the first remember/recall actually embeds something —
   *  honest, never an implied backend. */
  embedder: 'api' | 'lexical' | 'unknown';
  store: 'lancedb' | 'memory';
  dir?: string;
  docs: number;
  /**
   * True when the store holds rows embedded by DIFFERENT backends.
   *
   * Cosine between an API embedding and a lexical-hash vector is meaningless, so
   * a corpus written before `EMBEDDING_MODEL` was configured cannot be searched
   * with it. Recall filters to the active backend only, and this flag makes the
   * split visible instead of silently degrading ranking.
   *
   * Detection samples a bounded number of rows, so it is a WARNING, not an exact
   * census. An exact count would need a full table scan on every status read.
   */
  mixedEmbedders: boolean;
}

// ---------------------------------------------------------------------------
// Embedding (fixed dimension regardless of backend)
// ---------------------------------------------------------------------------

/** Deterministic lexical hash vector of length VEC_DIM (fallback embedder). */
export function lexicalEmbed(text: string): number[] {
  const v = Array.from({ length: VEC_DIM }, () => 0);
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

/**
 * Task prefixes for models trained with them (nomic-embed and friends).
 *
 * `search_document:` must prefix text being STORED and `search_query:` text being
 * SEARCHED, and the two live in deliberately different regions of the embedding
 * space. Omitting both is the single biggest cause of poor recall on these
 * models — the vectors are still valid, they are just not in the region the
 * retrieval head was trained on. Unset (or an empty value) disables prefixing,
 * so a provider that does not want them is unaffected.
 */
function embedPrefix(purpose: 'query' | 'doc'): string {
  const raw = purpose === 'query'
    ? process.env.EMBED_QUERY_PREFIX
    : process.env.EMBED_DOC_PREFIX;
  if (typeof raw !== 'string') return '';
  return raw.trim() ? `${raw.trim()} ` : '';
}

/**
 * Max characters sent to an API embedder in one request.
 *
 * nomic-embed-text-v1.5 has a TRAINED context of 2048 tokens (~2,800 chars of
 * English prose). Sending more does not degrade gracefully — llama.cpp rejects it
 * outright with HTTP 500 `input (N tokens) is too large to process` or HTTP 400
 * `larger than the max context size`, `embedWithApi` catches that, returns null,
 * and the document is silently stored with a LEXICAL vector instead. Measured on
 * this fleet: every lesson (median 3,110 chars, max 8,086) exceeded the limit, so
 * enabling "semantic" embeddings changed nothing at all while reporting success.
 *
 * 2,400 chars leaves generous headroom under the token limit for prose. Truncation
 * is deliberate and unavoidable for a single-vector-per-document store; chunking
 * would preserve the tail but needs multiple rows per document and is a schema
 * change.
 */
const EMBED_MAX_CHARS = 2400;

function embedInput(text: string, purpose: 'query' | 'doc'): string {
  return text.length > EMBED_MAX_CHARS ? text.slice(0, EMBED_MAX_CHARS) : text;
}

async function embedWithApi(text: string, purpose: 'query' | 'doc'): Promise<number[] | null> {
  const model = process.env.EMBEDDING_MODEL;
  if (!model) return null;
  const base = (process.env.EMBEDDING_BASE_URL || process.env.API_MODEL_BASE_URL || process.env.MODEL_BASE_URL || '').replace(/\/+$/, '');
  if (!base) return null;
  const key = process.env.API_MODEL_API_KEY || process.env.MODEL_API_KEY || '';
  const ctrl = new AbortController();
  // 2s was a reachability-sized budget. Embedding a few hundred tokens on CPU
  // takes seconds, and an over-tight abort looks identical to "provider down":
  // both return null and fall back to lexical.
  const budgetMs = Number(process.env.EMBEDDING_TIMEOUT_MS) > 0 ? Number(process.env.EMBEDDING_TIMEOUT_MS) : 30_000;
  const timer = setTimeout(() => ctrl.abort(), budgetMs);
  try {
    const res = await fetch(`${base}/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ model, input: embedPrefix(purpose) + embedInput(text, purpose) }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const j: any = await res.json();
    const vec: number[] | undefined = j?.data?.[0]?.embedding ?? j?.embeddings?.[0];
    if (!Array.isArray(vec) || vec.length === 0) return null;
    const out = Array.from({ length: VEC_DIM }, () => 0);
    for (let i = 0; i < Math.min(vec.length, VEC_DIM); i++) out[i] = vec[i];
    const norm = Math.sqrt(out.reduce((s, x) => s + x * x, 0)) || 1;
    return out.map((x) => x / norm);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function embedText(
  text: string,
  purpose: 'query' | 'doc' = 'doc',
): Promise<{ vec: number[]; backend: 'api' | 'lexical' }> {
  const api = await embedWithApi(text, purpose);
  if (api) return { vec: api, backend: 'api' };
  return { vec: lexicalEmbed(text), backend: 'lexical' };
}

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

interface MemoryStore {
  type: 'lancedb' | 'memory';
  remember(doc: Omit<MemoryDoc, 'vec'> & { vec: number[] }): Promise<void>;
  recall(kind: MemoryKind | null, vec: number[], topK: number, embedder?: 'api' | 'lexical'): Promise<RecallHit[]>;
  count(): Promise<number>;
  remove(id: string): Promise<void>;
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
  async recall(kind: MemoryKind | null, vec: number[], topK: number, embedder?: 'api' | 'lexical'): Promise<RecallHit[]> {
    const scored = this.docs
      .filter((d) => !kind || d.kind === kind)
      .map((d) => ({ ...d, score: cosine(vec, d.vec) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
    return scored;
  }
  async count(): Promise<number> { return this.docs.length; }
  async remove(id: string): Promise<void> { this.docs = this.docs.filter((d) => d.id !== id); }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const denom = Math.sqrt(na) * Math.sqrt(nb) || 1;
  return dot / denom;
}

function safeMeta(raw: any): Record<string, any> | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return { raw }; } }
  return raw;
}

/**
 * Normalize whatever the storage engine hands back for a fixed-size-list vector
 * column into a plain `number[]`.
 *
 * LanceDB does NOT return a JS Array. The column decodes to an Arrow `Vector`,
 * and `Vector.toArray()` yields a TypedArray (Float32Array) — `Array.isArray()`
 * is false for BOTH. A guard of `Array.isArray(v) ? v : []` therefore silently
 * substituted `[]` for every stored row, making `cosine()` return NaN for every
 * candidate: recall still returned rows (LanceDB's own ANN order), but every
 * score was NaN, so the JS re-ranking/sort was meaningless. `Array.from` is the
 * one conversion that is correct for Array, TypedArray, Arrow Vector and
 * array-like alike.
 */
function toNumberArray(raw: any): number[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map(Number);
  if (typeof raw.toArray === 'function') return Array.from(raw.toArray() as ArrayLike<number>, Number);
  if (typeof raw.length === 'number') return Array.from(raw as ArrayLike<number>, Number);
  return [];
}

/** Quote an identifier for a LanceDB SQL filter (single quotes doubled). */
function sqlStr(s: string): string {
  return `'${String(s).replace(/'/g, "''")}'`;
}

let lanceModule: any = null;
async function openLance(dir: string): Promise<MemoryStore | null> {
  try {
    if (!lanceModule) lanceModule = await import('@lancedb/lancedb');
    const db = await lanceModule.connect(dir);
    const tableName = 'memories';
    // The vector column MUST be declared. Inferred `Array<number>` becomes a
    // plain List, so `search()` fails ("No vector column found to match with the
    // query vector dimension") and the whole store silently falls back to
    // memory. Declaring `vec` as a fixed-size float vector is what makes LanceDB
    // actually persist and be searchable.
    const arrow = (rows: Array<Record<string, unknown>>): unknown =>
      lanceModule.makeArrowTable(rows, { vectorColumns: { vec: new lanceModule.VectorColumnOptions() } });
    const seed = (): Array<Record<string, unknown>> => [
      { id: '__init__', kind: 'gene', text: '', vec: Array.from({ length: VEC_DIM }).fill(0), meta: '{}', embedder: 'lexical' },
    ];

    let table;
    try {
      table = await db.openTable(tableName);
      // Repair a table written by the old schema-inferring code (vec as a plain
      // List): search cannot use it. Recreate with the explicit vector column.
      // Rows are re-indexed from live state, so the incompatible table holds
      // nothing that cannot be rebuilt.
      try {
        await table.search(lexicalEmbed('probe')).limit(1).toArray();
      } catch {
        try { await db.dropTable(tableName); } catch { /* best-effort */ }
        table = await db.createTable(tableName, arrow(seed()));
        await table.delete('id = \'__init__\'');
      }
    } catch {
      table = await db.createTable(tableName, arrow(seed()));
      await table.delete('id = \'__init__\'');
    }

    // Non-destructive migration: add the `embedder` column so the ANN search can
    // itself be restricted to one embedding space via a SQL predicate.
    //
    // Filtering AFTER the vector search is not sufficient. Candidates are chosen
    // by ANN across whatever rows exist, so when only a small share of the corpus
    // shares the active embedder, the candidate window is almost entirely foreign
    // rows. Measured: switching on API embeddings against a store written
    // lexically left 35 of 1094 rows (3.2%) usable, so a 50-row window held ~1.6
    // of them and recall fell from 6/8 to 1/8. Restricting the SEARCH is what
    // makes a mixed store behave correctly.
    //
    // Existing rows become 'lexical': tagging postdates them and lexical was the
    // only backend available at the time.
    let hasEmbedderColumn = false;
    try {
      // `(await ...)` is required: `await table.schema().fields` awaits the PROMISE's
      // `.fields`, which is undefined, and the next `.some()` throws.
      const cols = (await table.schema()).fields ?? [];
      if (!cols.some((f: any) => f.name === 'embedder')) {
        // Pass a plain ARRAY of AddColumnsSql. The three near-miss forms and why
        // each is wrong, all verified against this lancedb build:
        //   [{ name, type }]              -> "Invalid input type for addColumns"
        //   { computed: [{ name, valueSql }] } -> adds a VIRTUAL column; every
        //        later write fails with "column 'embedder' is computed; its
        //        values come from refresh and cannot be written directly"
        //   new Field(...) from apache-arrow -> not `instanceof` lancedb's own
        //        arrow Field, so it also falls through to the same error
        // The array form is the one that hits `inner.addColumns`, which
        // MATERIALIZES the column and fills existing rows with the SQL value.
        await table.addColumns([{ name: 'embedder', valueSql: "'lexical'" }]);
        hasEmbedderColumn = true;
      } else {
        hasEmbedderColumn = true;
      }
    } catch (err) {
      /* Older lancedb, or an incompatible schema. The JS-side filter still
         prevents cross-space comparison; it just cannot restrict the ANN
         window, so recall over a heavily mixed store stays degraded.
         Logged rather than swallowed: a silent downgrade to in-memory is exactly
         the failure mode that made durable memory look healthy for months. */
      hasEmbedderColumn = false;
      console.warn('[vectorMemory] embedder column migration failed; ANN window cannot be restricted by space:', err instanceof Error ? err.message : String(err));
    }
    return {
      type: 'lancedb',
      // Upsert by (id, kind) — same semantics as the in-memory store — so both
      // backends produce the same store state for the same call sequence.
      async remember(doc) {
        await table.delete(`id = ${sqlStr(doc.id)} AND kind = ${sqlStr(doc.kind)}`);
        // The embedder is a real column (not just meta) so the ANN search can be
        // restricted with a SQL predicate.
        const embedder = String((doc.meta as Record<string, any> | undefined)?.embedder ?? 'lexical');
        // Only include the column when the migration actually added it. Writing an
        // unknown field makes `add` throw, and a throw here propagates out of
        // openVectorMemory's functional probe — which silently downgrades the
        // WHOLE store to in-memory while the caller still sees "success".
        const row: Record<string, unknown> = { id: doc.id, kind: doc.kind, text: doc.text, vec: doc.vec, meta: JSON.stringify(doc.meta ?? {}) };
        if (hasEmbedderColumn) row.embedder = embedder;
        await table.add(arrow([row]));
      },
      async remove(id) {
        await table.delete(`id = ${sqlStr(id)}`);
      },
async recall(kind, vec, topK, embedder) {
        // Restrict the SEARCH to one embedding space. Filtering after the ANN
        // window is not enough: candidates are picked across all rows, so a
        // small same-space minority never survives the window.
        //
        // `kind` and `embedder` both go into the predicate, so the window holds
        // only rows that can actually be returned. Without the kind predicate the
        // old window let other kinds evict every match (the S9 bug).
        const want = Math.max(1, topK);
        const clauses: string[] = [];
        if (kind) clauses.push(`kind = ${sqlStr(kind)}`);
        if (embedder && hasEmbedderColumn) clauses.push(`embedder = ${sqlStr(embedder)}`);
        // `.where('')` throws, so only apply a predicate when there is one. The
        // unfiltered path is also what openVectorMemory's functional probe
        // exercises, so it must work with no arguments at all.
        let query = table.search(vec);
        if (clauses.length) query = query.where(clauses.join(' AND '));
        const rows = await query.limit(Math.max(want * 4, 20)).toArray();
        // Re-score with cosine in JS so scores share the in-memory store's
        // semantics (higher = more similar, cosine in [-1, 1]) regardless of the
        // engine's native distance metric.
        const scored = (rows ?? [])
          .filter((r: any) => !kind || r.kind === kind)
          .filter((r: any) => !embedder || String(r.embedder ?? 'lexical') === embedder)
          .map((r: any) => {
            const stored = toNumberArray(r.vec);
            return {
              id: String(r.id), kind: r.kind, text: String(r.text),
              vec: stored, meta: safeMeta(r.meta),
              // A row whose vector is missing/wrong-width cannot be scored honestly.
              score: stored.length === vec.length ? cosine(vec, stored) : Number.NEGATIVE_INFINITY,
            };
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, want);
        return scored;
      },
      async count() { try { return (await table.countRows()); } catch { return 0; } },
      async close() { await db.close(); },
    };
  } catch {
    return null;
  }
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
        // Remove the probe row so it never pollutes count()/recall results.
        await candidate.remove(probeId);
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
  private embedBackend: 'api' | 'lexical' | 'unknown' = 'unknown';
  constructor(store: MemoryStore, dir?: string) { this.store = store; this.dir = dir; }

  async remember(kind: MemoryKind, id: string, text: string, meta?: Record<string, any>): Promise<void> {
    if (!text) return;
    // Documents get the DOCUMENT prefix; queries get the QUERY prefix. They live
    // in different regions of the space, so the purpose must not be guessed.
    const { vec, backend } = await embedText(text, 'doc');
    this.embedBackend = backend;
    // Tag the row with the backend that produced its vector. Without this, a store
    // written lexically and later searched with API embeddings compares two
    // unrelated spaces and returns confident nonsense.
    await this.store.remember({ id, kind, text, vec, meta: { ...(meta ?? {}), embedder: backend } });
  }

  async recall(query: string, kind: MemoryKind | null = null, topK = 5): Promise<RecallHit[]> {
    const { vec, backend } = await embedText(query || '', 'query');
    this.embedBackend = backend;
    // Only ever compare WITHIN one embedding space. An untagged row predates
    // tagging, when lexical was the only option, so it counts as lexical — it
    // must NOT match an API query.
    //
    // The first version of this guard was `tag === undefined || tag === backend`,
    // which let every untagged row through unconditionally and re-introduced the
    // exact cross-space comparison it was meant to prevent. Measured effect: an
    // API query scored meaningless-but-nonzero cosine against 1059 lexical
    // vectors, those occupied the whole candidate window, and recall collapsed
    // from 6/8 to 1/8 after enabling real embeddings.
    const active = backend;
    // `embedder` goes into the store query so the ANN candidate window is drawn
    // from the active space only.
    const hits = await this.store.recall(kind, vec, topK, active);
    const same = hits.filter((h) => {
      const tag = (h.meta as Record<string, any> | undefined)?.embedder;
      return (tag === undefined ? 'lexical' : String(tag)) === active;
    });
    if (same.length > 0 || hits.length === 0) return same;
    // Every candidate was from another space. Return nothing rather than
    // cross-space neighbours sorted by a meaningless score.
    return [];
  }

  async count(): Promise<number> { return this.store.count(); }

  async status(): Promise<MemoryStoreStatus> {
    const docs = await this.count();
    // Ask the store about each space directly rather than sampling one ANN
    // window: a single window is dominated by whichever space the probe vector
    // happens to sit near, so sampling reported "not mixed" for a store that held
    // both. Two bounded queries are exact enough to be trustworthy.
    const probe = lexicalEmbed('probe');
    const [apiRows, lexicalRows] = await Promise.all([
      this.store.recall(null, probe, 1, 'api'),
      this.store.recall(null, probe, 1, 'lexical'),
    ]);
    return {
      embedder: this.embedBackend,
      store: this.store.type,
      dir: this.dir,
      docs,
      mixedEmbedders: apiRows.length > 0 && lexicalRows.length > 0,
    };
  }

  async close(): Promise<void> { if (this.store.close) await this.store.close(); }
}
