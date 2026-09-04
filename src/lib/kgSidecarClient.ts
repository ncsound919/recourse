/**
 * Recourse Knowledge-Graph sidecar client.
 *
 * Talks to the Python NetworkX sidecar (`python/kg_service/main.py`) over HTTP.
 * The sidecar is STATELESS: Recourse sends the graph (nodes+edges) in every
 * request and the sidecar returns real networkx metrics over that data. The
 * single source of truth for ontology data stays here in TypeScript
 * (`src/lib/biotechKnowledgeGraph.ts`) �?" the sidecar never owns a copy, so
 * there is no drift.
 *
 * Honesty contract (mirrors `src/intake/*`): every call is guarded by a
 * timeout and returns `ok:false` with the underlying error when the sidecar is
 * unreachable or rejects. It NEVER fabricates a graph metric or pretends the
 * analysis ran when the service is down.
 *
 * Env: KG_SIDECAR_URL (default http://127.0.0.1:8500). Optionally pass a base
 * url to any fn for tests/overrides.
 */

import { CANONICAL_ONCOLOGY_KG } from './biotechKnowledgeGraph';

export const KG_SIDECAR_DEFAULT_URL = process.env.KG_SIDECAR_URL || 'http://127.0.0.1:8500';

export interface KgNode {
  id: string;
  attrs: Record<string, unknown>;
}
export interface KgEdge {
  source: string;
  target: string;
  relation?: string;
  weight?: number;
}
export interface KgPayload {
  nodes: KgNode[];
  edges: KgEdge[];
}

export interface KgMetricRow {
  id: string;
  degree: number;
  betweenness: number;
  closeness: number;
  pagerank: number;
  evidence_tier: number;
  isolated: boolean;
}
export interface KgCentralityResult {
  ok: boolean;
  node_count?: number;
  edge_count?: number;
  connected_components?: number;
  hubs?: KgMetricRow[];
  ranked?: KgMetricRow[];
  by_metric?: Record<'betweenness' | 'closeness' | 'pagerank', KgMetricRow[]>;
  error?: string;
  latencyMs?: number;
}

export interface KgNeighbor {
  id: string;
  relation?: string;
  evidence_tier: number;
  leg?: string;
  targetProtein?: string;
}
export interface KgNeighborhoodResult {
  ok: boolean;
  target?: string;
  target_tier?: number;
  degree?: number;
  neighbors?: KgNeighbor[];
  proven_neighbors?: KgNeighbor[];
  connected_to_proven?: boolean;
  error?: string;
  latencyMs?: number;
}

export interface KgBridgeResult {
  ok: boolean;
  from?: string;
  to?: string;
  to_proven_hub?: string | null;
  reached_proven?: boolean;
  paths?: string[][];
  bridges?: Array<{ hub: string; hub_tier: number; paths: string[][] }>;
  error?: string;
  latencyMs?: number;
}

export interface KgHealthResult {
  ok: boolean;
  service?: string;
  networkx?: string;
  error?: string;
  latencyMs?: number;
}

export interface KgSidecarCall<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
  latencyMs: number;
}

async function callKg<T>(
  path: string,
  body: unknown,
  base: string,
  timeoutMs: number,
): Promise<KgSidecarCall<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { ok: false, status: res.status, data: null, latencyMs, error: `kg sidecar HTTP ${res.status}` };
    }
    const data = (await res.json()) as T;
    return { ok: true, status: res.status, data, latencyMs };
  } catch (err: any) {
    const latencyMs = Date.now() - started;
    return {
      ok: false,
      status: 0,
      data: null,
      latencyMs,
      error: err?.name === 'AbortError' ? `kg sidecar timed out after ${timeoutMs}ms` : err?.message || 'kg sidecar unreachable',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function getKg<T>(path: string, base: string, timeoutMs: number): Promise<KgSidecarCall<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}${path}`, { signal: controller.signal });
    const latencyMs = Date.now() - started;
    if (!res.ok) return { ok: false, status: res.status, data: null, latencyMs, error: `kg sidecar HTTP ${res.status}` };
    const data = (await res.json()) as T;
    return { ok: true, status: res.status, data, latencyMs };
  } catch (err: any) {
    const latencyMs = Date.now() - started;
    return {
      ok: false,
      status: 0,
      data: null,
      latencyMs,
      error: err?.name === 'AbortError' ? `kg sidecar timed out after ${timeoutMs}ms` : err?.message || 'kg sidecar unreachable',
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Health check �?" used by the status route so the UI can report sidecar online/offline honestly. */
export async function kgSidecarHealth(base = KG_SIDECAR_DEFAULT_URL, timeoutMs = 2000): Promise<KgHealthResult> {
  const call = await getKg<KgHealthResult>('/health', base, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  return { ok: true, service: call.data.service, networkx: call.data.networkx, latencyMs: call.latencyMs };
}

export async function kgCentrality(payload: KgPayload, base = KG_SIDECAR_DEFAULT_URL, timeoutMs = 10000): Promise<KgCentralityResult> {
  const call = await callKg<KgCentralityResult>('/kg/centrality', payload, base, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  return { ...call.data, latencyMs: call.latencyMs };
}

export async function kgNeighborhood(
  payload: KgPayload,
  target: string,
  base = KG_SIDECAR_DEFAULT_URL,
  timeoutMs = 5000,
): Promise<KgNeighborhoodResult> {
  const call = await callKg<KgNeighborhoodResult>(`/kg/neighborhood?target=${encodeURIComponent(target)}`, payload, base, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  return { ...call.data, latencyMs: call.latencyMs };
}

export async function kgBridges(
  payload: KgPayload,
  fromId: string,
  toId?: string,
  base = KG_SIDECAR_DEFAULT_URL,
  timeoutMs = 10000,
): Promise<KgBridgeResult> {
  const q = toId ? `?from_id=${encodeURIComponent(fromId)}&to_id=${encodeURIComponent(toId)}` : `?from_id=${encodeURIComponent(fromId)}`;
  const call = await callKg<KgBridgeResult>(`/kg/bridges${q}`, payload, base, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  return { ...call.data, latencyMs: call.latencyMs };
}

// ---------------------------------------------------------------------------
// Oncology KG -> graph projection (single source of truth stays in TS).
// ---------------------------------------------------------------------------
/**
 * Projects the canonical oncology KG into {nodes, edges} for the sidecar.
 * Edges mean "these two assets are related through a shared target protein or a
 * shared biomarker" �?" the raw material for real graph analytics.
 * This is pure/deterministic so it is unit-testable with no network.
 */
export function oncologyKgToGraph(): KgPayload {
  const entries = Object.entries(CANONICAL_ONCOLOGY_KG);
  const nodes: KgNode[] = entries.map(([id, e]) => ({
    id,
    attrs: {
      leg: e.leg,
      evidence_tier: e.evidenceTier,
      targetProtein: e.targetProtein,
      drugClass: e.drugClass,
      clinicalIndication: e.clinicalIndication,
      mechanism: e.mechanism,
    },
  }));

  const edgeSet = new Map<string, KgEdge>();
  const addEdge = (a: string, b: string, relation: string) => {
    if (a === b) return;
    const key = [a, b].sort().join('||');
    if (!edgeSet.has(key)) edgeSet.set(key, { source: a, target: b, relation });
  };

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [aId, a] = entries[i];
      const [bId, b] = entries[j];
      if (a.targetProtein && a.targetProtein === b.targetProtein) addEdge(aId, bId, 'shared_target');
      const sharedBio = (a.biomarkers ?? []).filter((m) => (b.biomarkers ?? []).includes(m));
      for (const m of sharedBio) addEdge(aId, bId, `shared_biomarker:${m}`);
    }
  }

  return { nodes, edges: [...edgeSet.values()] };
}

/** Convenience: true when the live oncology graph has at least one edge (i.e. networkx analysis is meaningful). */
export function oncologyGraphHasRelationships(): boolean {
  return oncologyKgToGraph().edges.length > 0;
}
