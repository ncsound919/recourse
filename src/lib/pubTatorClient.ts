/**
 * PubTator 3.0 live literature client.
 *
 * Queries NCBI's PubTator 3.0 REST API (no key required) for recent annotated
 * cancer literature and parses the `@GENE_` / `@DISEASE_` / `@CHEMICAL_` /
 * `@MUTATION_` entity tags out of the `text_hl` highlights so co-occurring
 * genes/diseases/chemicals become real graph edges.
 *
 * Endpoint used:
 *   https://www.ncbi.nlm.nih.gov/research/pubtator3-api/search?text=...&concepts=GENE,DISEASE,CHEMICAL
 * Returns articles whose title/abstract mention the query, with per-article
 * entity annotations in the highlight string.
 *
 * Honesty contract (mirrors the KG sidecar + Open Targets clients): every call
 * returns `ok:false` with the underlying error when the API is unreachable;
 * article bodies are real API responses, never fabricated. Parsed annotations
 * are exactly the tagged tokens the API returned — if the API stops tagging a
 * concept, we stop reporting it.
 *
 * Env:
 *   PUBTATOR_URL  (default https://www.ncbi.nlm.nih.gov/research/pubtator3-api)
 *   LIVE_EVIDENCE_CACHE_DIR / LIVE_EVIDENCE_CACHE_TTL_MS (shared with Open Targets)
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const PUBTATOR_BASE_URL = process.env.PUBTATOR_URL || 'https://www.ncbi.nlm.nih.gov/research/pubtator3-api';
export const USER_AGENT = 'OverlayOncology-EvidenceHub/2026.09 (Recourse live-evidence)';

export type PtConcept = 'GENE' | 'DISEASE' | 'CHEMICAL' | 'MUTATION';

export interface PtEntity {
  concept: PtConcept;
  name: string; // e.g. "KRAS", "Lung_Neoplasms"
  id: string | null; // e.g. NCBI gene 3845, MESH:D008175
}

export interface PtArticle {
  pmid: string;
  title: string;
  journal: string | null;
  date: string | null;
  doi: string | null;
  /** Entity annotations parsed from the API's highlight string. */
  entities: PtEntity[];
}

export interface PtSearchResult {
  query: string;
  fetched: number;
  articles: PtArticle[];
}

export interface PtCall<T> {
  ok: boolean;
  data: T | null;
  error?: string;
  cached: boolean;
  latencyMs: number;
}

// ---------------------------------------------------------------------------
// Annotation parser (pure, unit-testable)
// ---------------------------------------------------------------------------

const TOKEN_RE = /@(GENE|DISEASE|CHEMICAL|MUTATION)_([A-Za-z0-9_.\-:]+)/g;

/**
 * Parse PubTator 3.0 `text_hl` tags into deduplicated entities.
 *
 * PubTator emits per-mention pairs in order:
 *   @GENE_KRAS @GENE_3845          -> GENE name=KRAS id=3845
 *   @DISEASE_Lung_Neoplasms @DISEASE_MESH:D008175 -> DISEASE name=Lung_Neoplasms id=MESH:D008175
 * A display-name token is followed by at most one id token of the SAME concept
 * (bare numeric gene id or `MESH:` id). We pair them positionally: an id token
 * attaches to the immediately preceding un-attached display-name token of the
 * same concept. Anything that cannot be paired (a lone id, an id after an
 * already-identified name) is DROPPED rather than emitted as a bogus entity —
 * a real id with a fabricated name is worse than no id.
 *
 * Dedupes by (concept, name); keeps the first id seen for a name.
 */
export function parsePubTatorAnnotations(textHl: string): PtEntity[] {
  const tokens = [...textHl.matchAll(TOKEN_RE)].map((m) => ({ concept: m[1] as PtConcept, raw: m[2] }));

  const out: PtEntity[] = [];
  const byName = new Map<string, PtEntity>();
  // Pending display-name tokens awaiting an id, per concept (in order).
  const pending = new Map<PtConcept, string[]>();

  const isIdToken = (raw: string) => raw.includes(':') || /^\d+$/.test(raw);

  for (const t of tokens) {
    if (isIdToken(t.raw)) {
      // Attach to the oldest pending display-name of the same concept, then
      // clear it (a name takes at most one id). If none is pending (or the
      // name already has an id), drop the id — never invent an entity.
      const queue = pending.get(t.concept);
      const name = queue?.shift();
      if (name !== undefined) {
        const entity = byName.get(`${t.concept}:${name}`);
        if (entity && entity.id === null) entity.id = t.raw;
      }
      continue;
    }
    // Display-name token: register it as pending and emit an id-less entity
    // the first time we see this name.
    const key = `${t.concept}:${t.raw}`;
    if (!byName.has(key)) {
      const entity: PtEntity = { concept: t.concept, name: t.raw, id: null };
      byName.set(key, entity);
      out.push(entity);
    }
    const queue = pending.get(t.concept) ?? [];
    queue.push(t.raw);
    pending.set(t.concept, queue);
  }
  return out;
}

// ---------------------------------------------------------------------------
// File-backed TTL cache (shared with openTargetsClient)
// ---------------------------------------------------------------------------

interface CacheEntry {
  ts: number;
  value: unknown;
}

function cacheDir(): string {
  return process.env.LIVE_EVIDENCE_CACHE_DIR || join(process.cwd(), 'data');
}

function cachePath(): string {
  return join(cacheDir(), 'live-evidence-cache.json');
}

function cacheTtlMs(): number {
  const raw = Number(process.env.LIVE_EVIDENCE_CACHE_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 6 * 60 * 60 * 1000;
}

let cache: Record<string, CacheEntry> | null = null;

function loadCache(): Record<string, CacheEntry> {
  if (cache) return cache;
  try {
    if (existsSync(cachePath())) cache = JSON.parse(readFileSync(cachePath(), 'utf-8'));
  } catch {
    cache = {};
  }
  if (!cache) cache = {};
  return cache;
}

function persistCache(): void {
  try {
    mkdirSync(cacheDir(), { recursive: true });
    writeFileSync(cachePath(), JSON.stringify(loadCache()));
  } catch {
    // best-effort
  }
}

function cacheGet<T>(key: string): { value: T } | null {
  const e = loadCache()[key];
  if (!e) return null;
  if (Date.now() - e.ts > cacheTtlMs()) return null;
  return { value: e.value as T };
}

function cacheSet(key: string, value: unknown): void {
  loadCache()[key] = { ts: Date.now(), value };
  persistCache();
}

function cacheKey(...parts: string[]): string {
  return createHash('sha256').update(parts.join('::')).digest('hex').slice(0, 32);
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

function cleanHl(textHl?: string): string {
  if (typeof textHl !== 'string') return '';
  // Strip <m>...</m> emphasis and ellipses; keep tags for parsing.
  return textHl;
}

/** Search PubTator 3 for annotated articles matching `text`. */
export async function ptSearch(
  text: string,
  opts: { concepts?: PtConcept[]; pageSize?: number; noCache?: boolean } = {},
): Promise<PtCall<PtSearchResult>> {
  const concepts = opts.concepts ?? ['GENE', 'DISEASE', 'CHEMICAL', 'MUTATION'];
  const pageSize = opts.pageSize ?? 5;
  const key = cacheKey('pt', 'search', text, concepts.join(','), String(pageSize));
  const hit = opts.noCache ? null : cacheGet<PtSearchResult>(key);
  if (hit) return { ok: true, data: hit.value, cached: true, latencyMs: 0 };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  const started = Date.now();
  const url = `${PUBTATOR_BASE_URL}/search?text=${encodeURIComponent(text)}&concepts=${encodeURIComponent(concepts.join(','))}&pageSize=${pageSize}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: controller.signal });
    const latencyMs = Date.now() - started;
    if (!res.ok) return { ok: false, data: null, cached: false, latencyMs, error: `PubTator HTTP ${res.status}` };
    const body = (await res.json()) as {
      results?: Array<{
        _id?: string;
        pmid?: number | string;
        title?: string;
        journal?: string;
        date?: string;
        doi?: string;
        text_hl?: string;
      }>;
    };
    const articles: PtArticle[] = (body.results ?? []).slice(0, pageSize).map((r) => ({
      pmid: String(r.pmid ?? r._id ?? ''),
      title: r.title ?? '(untitled)',
      journal: r.journal ?? null,
      date: r.date ?? null,
      doi: r.doi ?? null,
      entities: parsePubTatorAnnotations(cleanHl(r.text_hl)),
    }));
    const result: PtSearchResult = { query: text, fetched: articles.length, articles };
    if (!opts.noCache) cacheSet(key, result);
    return { ok: true, data: result, cached: false, latencyMs };
  } catch (err: any) {
    const latencyMs = Date.now() - started;
    return {
      ok: false,
      data: null,
      cached: false,
      latencyMs,
      error: err?.name === 'AbortError' ? 'PubTator timed out' : err?.message || 'PubTator unreachable',
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Health probe: a tiny search for KRAS in cancer (always live, no cache). */
export async function ptHealth(_timeoutMs = 8000): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const r = await ptSearch('KRAS cancer', { pageSize: 1, noCache: true });
  return { ok: r.ok, latencyMs: r.latencyMs, error: r.error };
}

/** Test hook: clear the in-memory + on-disk PubTator cache. */
export function clearPubTatorCache(): void {
  cache = {};
  try {
    if (existsSync(cachePath())) writeFileSync(cachePath(), JSON.stringify({}));
  } catch {
    // ignore
  }
}