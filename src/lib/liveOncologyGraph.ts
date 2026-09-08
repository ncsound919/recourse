/**
 * LIVE ONCOLOGY GRAPH — Evidence-to-Graph pipeline.
 *
 * Phase 1 of the "closed-loop evolutionary falsification" program: replaces the
 * static 6-node curated oncology KG's *evidence dead-end* with a live,
 * provider-grounded graph. This module:
 *
 *  1. Pulls top target-disease associations from Open Targets Platform for a
 *     configurable set of oncology diseases (real GraphQL data, real scores).
 *  2. Pulls annotated gene/disease/chemical co-occurrence from PubTator 3.0 for
 *     a set of oncology topics (real API results, real entity tags).
 *  3. Merges both with the canonical curated KG (biotechKnowledgeGraph.ts).
 *  4. Produces a standard `KgPayload` the NetworkX sidecar can analyze, plus an
 *     honest provenance ledger of exactly which provider each node/edge came
 *     from — nothing is ever asserted without a source.
 *
 * Honesty contract:
 *  - Each provider is probed independently. A provider that is down contributes
 *    nothing and is reported `ok:false` — never a fabricated score or edge.
 *  - Node/edge `provenance` fields record `canonical` | `open_targets` |
 *    `pubtator`. Edges carry the real weight where the provider gives one
 *    (Open Targets association score), or a deterministic co-occurrence count
 *    (PubTator) — both labeled.
 *  - The canonical KG remains the single source of truth for the *curated*
 *    layer; live data only adds a *grounded* layer on top.
 *
 * Env:
 *   LIVE_ONCOLOGY_DISEASES  (comma-separated MONDO/EFO ids; defaults to a
 *                            validated oncology set)
 *   LIVE_ONCOLOGY_TOPICS    (comma-separated PubTator search topics)
 *   LIVE_KG_MAX_TARGETS_PER_DISEASE (default 10)
 *   LIVE_KG_MAX_ARTICLES    (default 4 per topic)
 */

import {
  otDiseaseAssociations,
  otTargetInfo,
} from './openTargetsClient';
import { ptSearch, type PtConcept } from './pubTatorClient';
import { CANONICAL_ONCOLOGY_KG, type OncologyEntity } from './biotechKnowledgeGraph';
import type { KgPayload } from './kgSidecarClient';

// ---------------------------------------------------------------------------
// Defaults (validated against the live Open Targets API on 2026-09-07)
// ---------------------------------------------------------------------------

export const DEFAULT_ONCOLOGY_DISEASES = [
  'MONDO_0005575', // colorectal cancer
  'MONDO_0005233', // non-small cell lung carcinoma
  'MONDO_0007254', // breast cancer
  'MONDO_0005105', // melanoma
  'MONDO_0005192', // pancreatic cancer
  'MONDO_0018177', // glioblastoma
];

export const DEFAULT_ONCOLOGY_TOPICS = [
  'KRAS resistance cancer',
  'PD-1 PD-L1 checkpoint resistance',
  'tumor microenvironment immunotherapy',
  'EGFR mutation targeted therapy',
  'HER2 breast cancer',
];

export type Provenance = 'canonical' | 'open_targets' | 'pubtator';

export interface LiveKgNode {
  id: string;
  attrs: Record<string, unknown>;
  provenance: Provenance;
}

export interface LiveKgEdge {
  source: string;
  target: string;
  relation: string;
  weight?: number;
  provenance: Provenance;
  evidence?: string;
}

export interface ProviderStatus {
  openTargets: { ok: boolean; partial?: boolean; error?: string; latencyMs?: number };
  pubTator: { ok: boolean; partial?: boolean; error?: string; latencyMs?: number };
}

export interface LiveGraphResult {
  ok: boolean;
  error?: string;
  nodes: LiveKgNode[];
  edges: LiveKgEdge[];
  payload: KgPayload;
  providers: ProviderStatus;
  counts: {
    canonicalNodes: number;
    openTargetsNodes: number;
    pubTatorNodes: number;
    openTargetsEdges: number;
    pubTatorEdges: number;
  };
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Canonical layer
// ---------------------------------------------------------------------------

function canonicalNodes(): LiveKgNode[] {
  return Object.entries(CANONICAL_ONCOLOGY_KG).map(([id, e]) => ({
    id,
    attrs: {
      label: e.targetProtein,
      drugClass: e.drugClass,
      mechanism: e.mechanism,
      leg: e.leg,
      evidenceTier: e.evidenceTier,
      clinicalIndication: e.clinicalIndication,
      biomarkers: e.biomarkers,
      source: 'canonical-curated',
    },
    provenance: 'canonical' as const,
  }));
}

function canonicalEdges(): LiveKgEdge[] {
  const entries = Object.entries(CANONICAL_ONCOLOGY_KG);
  const edges: LiveKgEdge[] = [];
  const seen = new Set<string>();
  const push = (a: string, b: string, relation: string) => {
    const key = [a, b, relation].sort().join('||');
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ source: a, target: b, relation, provenance: 'canonical' });
  };
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [aId, a] = entries[i];
      const [bId, b] = entries[j];
      if (a.targetProtein && a.targetProtein === b.targetProtein) push(aId, bId, 'shared_target');
      const shared = (a.biomarkers ?? []).filter((m) => (b.biomarkers ?? []).includes(m));
      for (const m of shared) push(aId, bId, `shared_biomarker:${m}`);
    }
  }
  return edges;
}

// ---------------------------------------------------------------------------
// Open Targets layer
// ---------------------------------------------------------------------------

function otDiseaseId(name: string): string {
  return `ot:disease:${name}`;
}
function otTargetId(ensembl: string): string {
  return `ot:target:${ensembl}`;
}

async function buildOpenTargetsLayer(
  diseases: string[],
  maxTargetsPerDisease: number,
): Promise<{ nodes: LiveKgNode[]; edges: LiveKgEdge[]; error?: string }> {
  const nodes = new Map<string, LiveKgNode>();
  const edges: LiveKgEdge[] = [];
  const errors: string[] = [];
  const targetsToEnrich: Array<{ key: string; ensembl: string }> = [];

  for (const diseaseId of diseases) {
    const assoc = await otDiseaseAssociations(diseaseId, maxTargetsPerDisease);
    if (!assoc.ok || !assoc.data) {
      errors.push(`disease ${diseaseId}: ${assoc.error ?? 'no data'}`);
      continue;
    }
    const d = assoc.data;
    const dKey = otDiseaseId(d.diseaseId);
    if (!nodes.has(dKey)) {
      nodes.set(dKey, {
        id: dKey,
        attrs: { label: d.diseaseName, entityType: 'disease', diseaseId: d.diseaseId, source: 'open-targets' },
        provenance: 'open_targets',
      });
    }
    for (const t of d.targets) {
      const tKey = otTargetId(t.id);
      if (!nodes.has(tKey)) {
        nodes.set(tKey, {
          id: tKey,
          attrs: { label: t.approvedSymbol, approvedName: t.approvedName, entityType: 'target', ensemblId: t.id, source: 'open-targets' },
          provenance: 'open_targets',
        });
        targetsToEnrich.push({ key: tKey, ensembl: t.id });
      }
      edges.push({
        source: tKey,
        target: dKey,
        relation: 'associates_disease',
        weight: t.score,
        provenance: 'open_targets',
        evidence: `Open Targets association score ${t.score.toFixed(3)} (${d.diseaseName})`,
      });
    }
  }

  // Enrich tractability with bounded concurrency (4 at a time) — a slow or
  // rate-limited provider must not stall the whole layer. Failures are honest
  // omissions (no tractability attr), never fabricated.
  const CONCURRENCY = 4;
  let cursor = 0;
  const worker = async () => {
    while (cursor < targetsToEnrich.length) {
      const next = targetsToEnrich[cursor++]!;
      const info = await otTargetInfo(next.ensembl);
      if (info.ok && info.data) {
        nodes.get(next.key)!.attrs.tractability = info.data.tractability;
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  return { nodes: [...nodes.values()], edges, error: errors.length ? errors.join('; ') : undefined };
}

// ---------------------------------------------------------------------------
// PubTator layer
// ---------------------------------------------------------------------------

function ptEntityId(concept: PtConcept, name: string): string {
  return `pt:${concept.toLowerCase()}:${name}`;
}

async function buildPubTatorLayer(topics: string[], maxArticles: number): Promise<{ nodes: LiveKgNode[]; edges: LiveKgEdge[]; error?: string }> {
  const nodes = new Map<string, LiveKgNode>();
  const edges: LiveKgEdge[] = [];
  const cooc = new Map<string, { a: string; b: string; relation: string; count: number; pmids: string[] }>();
  const errors: string[] = [];

  const addCooc = (a: string, b: string, relation: string, pmid: string) => {
    const key = [a, b].sort().join('||');
    const entry = cooc.get(key);
    if (entry) {
      entry.count++;
      if (!entry.pmids.includes(pmid)) entry.pmids.push(pmid);
    } else {
      cooc.set(key, { a, b, relation, count: 1, pmids: [pmid] });
    }
  };

  for (const topic of topics) {
    const r = await ptSearch(topic, { concepts: ['GENE', 'DISEASE', 'CHEMICAL'], pageSize: maxArticles });
    if (!r.ok || !r.data) {
      errors.push(`topic "${topic}": ${r.error ?? 'no data'}`);
      continue;
    }
    for (const article of r.data.articles) {
      const genes = article.entities.filter((e) => e.concept === 'GENE');
      const diseases = article.entities.filter((e) => e.concept === 'DISEASE');
      const chemicals = article.entities.filter((e) => e.concept === 'CHEMICAL');
      const addNode = (concept: PtConcept, name: string, id: string | null) => {
        const key = ptEntityId(concept, name);
        if (!nodes.has(key)) {
          nodes.set(key, {
            id: key,
            attrs: { label: name, entityType: concept.toLowerCase(), source: 'pubtator', externalId: id ?? null },
            provenance: 'pubtator',
          });
        }
      };
      for (const g of genes) addNode('GENE', g.name, g.id);
      for (const d of diseases) addNode('DISEASE', d.name, d.id);
      for (const c of chemicals) addNode('CHEMICAL', c.name, c.id);
      for (const g of genes) for (const d of diseases) addCooc(ptEntityId('GENE', g.name), ptEntityId('DISEASE', d.name), 'cooccurs_with_disease', article.pmid);
      for (const g of genes) for (const c of chemicals) addCooc(ptEntityId('GENE', g.name), ptEntityId('CHEMICAL', c.name), 'cooccurs_with_chemical', article.pmid);
      for (const d of diseases) for (const c of chemicals) addCooc(ptEntityId('DISEASE', d.name), ptEntityId('CHEMICAL', c.name), 'chemical_in_disease', article.pmid);
    }
  }

  for (const entry of cooc.values()) {
    edges.push({
      source: entry.a,
      target: entry.b,
      relation: entry.relation,
      weight: entry.count,
      provenance: 'pubtator',
      evidence: `PubTator co-occurrence across ${entry.count} article(s) (PMID ${entry.pmids.slice(0, 3).join(', ')})`,
    });
  }

  return { nodes: [...nodes.values()], edges, error: errors.length ? errors.join('; ') : undefined };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export interface LiveGraphOptions {
  diseases?: string[];
  topics?: string[];
  maxTargetsPerDisease?: number;
  maxArticles?: number;
}

/**
 * Build the full live oncology graph. Providers are probed in parallel; each
 * failure is recorded in `providers` and simply contributes nothing (honest).
 */
export async function buildLiveOncologyGraph(opts: LiveGraphOptions = {}): Promise<LiveGraphResult> {
  const diseases = opts.diseases ?? process.env.LIVE_ONCOLOGY_DISEASES?.split(',').filter(Boolean) ?? DEFAULT_ONCOLOGY_DISEASES;
  const topics = opts.topics ?? process.env.LIVE_ONCOLOGY_TOPICS?.split(',').filter(Boolean) ?? DEFAULT_ONCOLOGY_TOPICS;
  const maxTargetsPerDisease = opts.maxTargetsPerDisease ?? Number(process.env.LIVE_KG_MAX_TARGETS_PER_DISEASE ?? 10);
  const maxArticles = opts.maxArticles ?? Number(process.env.LIVE_KG_MAX_ARTICLES ?? 4);

  const [canonical, otLayer, ptLayer] = await Promise.all([
    Promise.resolve({ nodes: canonicalNodes(), edges: canonicalEdges() }),
    buildOpenTargetsLayer(diseases, maxTargetsPerDisease),
    buildPubTatorLayer(topics, maxArticles),
  ]);

  const nodesById = new Map<string, LiveKgNode>();
  for (const n of [...canonical.nodes, ...otLayer.nodes, ...ptLayer.nodes]) {
    // canonical first, then providers — never overwrite a curated node
    if (!nodesById.has(n.id)) nodesById.set(n.id, n);
  }

  const edges: LiveKgEdge[] = [...canonical.edges, ...otLayer.edges, ...ptLayer.edges];

  const payload: KgPayload = {
    nodes: [...nodesById.values()].map((n) => ({ id: n.id, attrs: n.attrs })),
    edges: edges.map((e) => ({
      source: e.source,
      target: e.target,
      relation: e.relation,
      weight: e.weight,
    })),
  };

  return {
    ok: true,
    nodes: [...nodesById.values()],
    edges,
    payload,
    providers: {
      openTargets: {
        ok: otLayer.nodes.length > 0,
        partial: otLayer.nodes.length > 0 && !!otLayer.error,
        error: otLayer.nodes.length > 0 ? otLayer.error : (otLayer.error ?? 'no Open Targets data'),
      },
      pubTator: {
        ok: ptLayer.nodes.length > 0,
        partial: ptLayer.nodes.length > 0 && !!ptLayer.error,
        error: ptLayer.nodes.length > 0 ? ptLayer.error : (ptLayer.error ?? 'no PubTator data'),
      },
    },
    counts: {
      canonicalNodes: canonical.nodes.length,
      openTargetsNodes: otLayer.nodes.length,
      pubTatorNodes: ptLayer.nodes.length,
      openTargetsEdges: otLayer.edges.length,
      pubTatorEdges: ptLayer.edges.length,
    },
    generatedAt: new Date().toISOString(),
  };
}

/** Convenience: probe both providers' health without building the graph. */
export async function liveEvidenceHealth(): Promise<ProviderStatus> {
  const [ot, pt] = await Promise.all([
    import('./openTargetsClient').then((m) => m.otHealth()),
    import('./pubTatorClient').then((m) => m.ptHealth()),
  ]);
  return {
    openTargets: { ok: ot.ok, error: ot.error, latencyMs: ot.latencyMs },
    pubTator: { ok: pt.ok, error: pt.error, latencyMs: pt.latencyMs },
  };
}

/** Merge the live graph's payload with the canonical oncology payload (drop-in for oncologyKgToGraph). */
export function liveGraphToKgPayload(result: LiveGraphResult): KgPayload {
  return result.payload;
}

export { CANONICAL_ONCOLOGY_KG };
export type { OncologyEntity };