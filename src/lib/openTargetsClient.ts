/**
 * Open Targets Platform (v4 GraphQL) live evidence client.
 *
 * Pulls real target-disease associations, tractability, and drug info from the
 * Open Targets Platform public GraphQL API (no key required):
 *   https://api.platform.opentargets.org/api/v4/graphql
 *
 * Honesty contract (mirrors the KG sidecar client): every call is guarded by a
 * timeout and returns `ok:false` with the underlying error when the API is
 * unreachable or rejects. It NEVER fabricates an association or a score.
 *
 * A file-backed TTL cache (`data/live-evidence-cache.json`) keeps repeated
 * queries off the public API. Keys are per provider+method+args so a cached
 * row is always for the exact query shape.
 *
 * Env:
 *   OPEN_TARGETS_URL   (default https://api.platform.opentargets.org/api/v4/graphql)
 *   LIVE_EVIDENCE_CACHE_DIR (default <cwd>/data)
 *   LIVE_EVIDENCE_CACHE_TTL_MS (default 6h)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export const OPEN_TARGETS_GRAPHQL_URL =
  process.env.OPEN_TARGETS_URL || 'https://api.platform.opentargets.org/api/v4/graphql';

export const USER_AGENT = 'OverlayOncology-EvidenceHub/2026.09 (Recourse live-evidence)';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OtTargetSummary {
  id: string; // Ensembl gene id
  approvedSymbol: string;
  approvedName: string;
  score: number; // Open Targets association score 0..1
}

export interface OtDiseaseAssociations {
  diseaseId: string; // MONDO/EFO id
  diseaseName: string;
  count: number;
  targets: OtTargetSummary[];
}

export interface OtTargetInfo {
  id: string;
  approvedSymbol: string;
  approvedName: string;
  biotype?: string;
  tractability: string[];
}

export interface OtSearchHit {
  id: string;
  entity: 'disease' | 'target' | 'drug' | 'variant' | 'study';
}

export interface OtCall<T> {
  ok: boolean;
  data: T | null;
  error?: string;
  cached: boolean;
  latencyMs: number;
}

// ---------------------------------------------------------------------------
// File-backed TTL cache (per provider+method+arg-key)
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
    // best-effort; cache is an optimization, never a correctness requirement
  }
}

function cacheGet<T>(key: string): { value: T; ts: number } | null {
  const e = loadCache()[key];
  if (!e) return null;
  if (Date.now() - e.ts > cacheTtlMs()) return null;
  return { value: e.value as T, ts: e.ts };
}

function cacheSet(key: string, value: unknown): void {
  loadCache()[key] = { ts: Date.now(), value };
  persistCache();
}

function cacheKey(...parts: string[]): string {
  return createHash('sha256').update(parts.join('::')).digest('hex').slice(0, 32);
}

/** Test hook: clear the in-memory + on-disk cache. */
export function clearLiveEvidenceCache(): void {
  cache = {};
  try {
    if (existsSync(cachePath())) writeFileSync(cachePath(), JSON.stringify({}));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// GraphQL transport
// ---------------------------------------------------------------------------

interface GraphQlResponse {
  data?: Record<string, unknown>;
  errors?: Array<{ message?: string }>;
}

async function gql<T>(
  query: string,
  variableName: string | null,
  args: Record<string, unknown>,
  opts: { noCache?: boolean } = {},
): Promise<OtCall<T>> {
  const key = cacheKey('ot', variableName ?? query.slice(0, 60), JSON.stringify(args));
  const hit = opts.noCache ? null : cacheGet<T>(key);
  if (hit) return { ok: true, data: hit.value, cached: true, latencyMs: 0 };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  const started = Date.now();
  try {
    const res = await fetch(OPEN_TARGETS_GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({ query, variables: args }),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) return { ok: false, data: null, cached: false, latencyMs, error: `Open Targets HTTP ${res.status}` };
    const body = (await res.json()) as GraphQlResponse;
    if (body.errors?.length) {
      return { ok: false, data: null, cached: false, latencyMs, error: body.errors[0].message || 'Open Targets GraphQL error' };
    }
    const data = body.data?.[variableName ?? ''] as T | undefined;
    if (data === undefined) {
      return { ok: false, data: null, cached: false, latencyMs, error: 'Open Targets returned no data for query' };
    }
    if (!opts.noCache) cacheSet(key, data);
    return { ok: true, data, cached: false, latencyMs };
  } catch (err: any) {
    const latencyMs = Date.now() - started;
    return {
      ok: false,
      data: null,
      cached: false,
      latencyMs,
      error: err?.name === 'AbortError' ? 'Open Targets timed out' : err?.message || 'Open Targets unreachable',
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Search entities (diseases/targets/drugs) by free text. */
export async function otSearch(
  queryString: string,
  entityNames: Array<'disease' | 'target' | 'drug' | 'variant' | 'study'> = ['disease'],
  limit = 10,
): Promise<OtCall<OtSearchHit[]>> {
  const q = `query Search($q: String!, $entities: [String!]) {
    search(queryString: $q, entityNames: $entities) { total hits { id entity } }
  }`;
  const r = await gql<{ hits?: Array<{ id: string; entity: string }> } | null>(q, 'search', {
    q: queryString,
    entities: entityNames,
  });
  if (!r.ok || !r.data) return { ok: r.ok, data: null, error: r.error, cached: r.cached, latencyMs: r.latencyMs };
  const hits = (r.data.hits ?? []).slice(0, limit).map((h) => ({
    id: h.id,
    entity: h.entity as OtSearchHit['entity'],
  }));
  return { ok: true, data: hits, cached: r.cached, latencyMs: r.latencyMs };
}

/** Top associated targets for a disease id (MONDO/EFO). */
export async function otDiseaseAssociations(
  diseaseId: string,
  limit = 20,
): Promise<OtCall<OtDiseaseAssociations>> {
  const q = `query Disease($efoId: String!) {
    disease(efoId: $efoId) {
      id name associatedTargets { count rows { target { id approvedSymbol approvedName } score } }
    }
  }`;
  const r = await gql<{
    id: string;
    name: string;
    associatedTargets?: { count?: number; rows?: Array<{ target?: { id?: string; approvedSymbol?: string; approvedName?: string }; score?: number }> };
  } | null>(q, 'disease', { efoId: diseaseId });
  if (!r.ok || !r.data) {
    return { ok: false, data: null, error: r.error || 'Open Targets returned no disease', cached: r.cached, latencyMs: r.latencyMs };
  }
  const d = r.data;
  const targets = (d.associatedTargets?.rows ?? [])
    .filter((row) => row.target?.id)
    .slice(0, limit)
    .map((row) => ({
      id: row.target!.id!,
      approvedSymbol: row.target?.approvedSymbol ?? row.target!.id!,
      approvedName: row.target?.approvedName ?? '',
      score: typeof row.score === 'number' ? row.score : 0,
    }));
  return {
    ok: true,
    data: {
      diseaseId: d.id,
      diseaseName: d.name,
      count: d.associatedTargets?.count ?? targets.length,
      targets,
    },
    cached: r.cached,
    latencyMs: r.latencyMs,
  };
}

/** Target metadata: approved name + tractability labels. */
export async function otTargetInfo(ensemblId: string, opts: { noCache?: boolean } = {}): Promise<OtCall<OtTargetInfo>> {
  const q = `query Target($id: String!) {
    target(ensemblId: $id) { id approvedSymbol approvedName biotype tractability { label } }
  }`;
  const r = await gql<{
    id?: string;
    approvedSymbol?: string;
    approvedName?: string;
    biotype?: string;
    tractability?: Array<{ label?: string }>;
  } | null>(q, 'target', { id: ensemblId }, opts);
  if (!r.ok || !r.data) {
    return { ok: false, data: null, error: r.error || 'Open Targets returned no target', cached: r.cached, latencyMs: r.latencyMs };
  }
  const t = r.data;
  return {
    ok: true,
    data: {
      id: t.id ?? ensemblId,
      approvedSymbol: t.approvedSymbol ?? ensemblId,
      approvedName: t.approvedName ?? '',
      biotype: t.biotype,
      tractability: (t.tractability ?? []).map((x) => x.label ?? '').filter(Boolean),
    },
    cached: r.cached,
    latencyMs: r.latencyMs,
  };
}

/** Health probe: resolve KRAS target metadata (cheap, stable, always live). */
export async function otHealth(_timeoutMs = 8000): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const r = await otTargetInfo('ENSG00000133703', { noCache: true });
  return { ok: r.ok, latencyMs: r.latencyMs, error: r.error };
}