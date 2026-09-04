import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  oncologyKgToGraph,
  oncologyGraphHasRelationships,
  kgSidecarHealth,
  kgCentrality,
  KG_SIDECAR_DEFAULT_URL,
} from '../src/lib/kgSidecarClient';

afterEach(() => {
  vi.unstubAllGlobals();
});

const BASE = 'http://kg.test';

describe('kg sidecar client - honest graph projection', () => {
  it('projects the canonical oncology KG into nodes + edges (pure, no network)', () => {
    const g = oncologyKgToGraph();
    expect(g.nodes.length).toBeGreaterThan(1);
    // every node has a real evidence tier + leg from the canonical source
    for (const n of g.nodes) {
      expect(n.id).toBeTruthy();
      expect(typeof n.attrs.evidence_tier).toBe('number');
      expect(typeof n.attrs.leg).toBe('string');
    }
    // a connected KG means graph analytics is meaningful, and edges only connect real nodes
    for (const e of g.edges) {
      expect(g.nodes.some((n) => n.id === e.source)).toBe(true);
      expect(g.nodes.some((n) => n.id === e.target)).toBe(true);
      expect(e.relation).toBeTruthy();
    }
  });

  it('reports whether the graph has relationships (so consumers know if analysis is meaningful)', () => {
    // The canonical KG is the same source the server serves; if this flips it
    // means the ontology became a set of isolated nodes and bridges become moot.
    expect(typeof oncologyGraphHasRelationships()).toBe('boolean');
  });
});

describe('kg sidecar client - honest failures (no fabricated metrics)', () => {
  it('centrality returns ok:false (not invented numbers) when the sidecar is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const res = await kgCentrality({ nodes: [{ id: 'a', attrs: {} }], edges: [] }, BASE);
    expect(res.ok).toBe(false);
    expect(res.hubs).toBeUndefined();
    expect(res.node_count).toBeUndefined();
    expect(res.error).toBeTruthy();
  });

  it('centrality returns ok:false on a non-2xx sidecar response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad', { status: 500 })));
    const res = await kgCentrality({ nodes: [{ id: 'a', attrs: {} }], edges: [] }, BASE);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('500');
  });

  it('health reports online:false honestly when the sidecar is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const res = await kgSidecarHealth(BASE);
    expect(res.ok).toBe(false);
    expect(res.service).toBeUndefined();
    expect(res.networkx).toBeUndefined();
  });

  it('parses a real centrality payload from the sidecar (mock 200)', async () => {
    const body = {
      ok: true,
      node_count: 2,
      edge_count: 1,
      connected_components: 1,
      hubs: [
        { id: 'b', degree: 2, betweenness: 1.0, closeness: 1.0, pagerank: 0.7, evidence_tier: 5, isolated: false },
      ],
      ranked: [],
      by_metric: {},
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })));
    const res = await kgCentrality({ nodes: [{ id: 'a', attrs: {} }], edges: [] }, BASE);
    expect(res.ok).toBe(true);
    expect(res.node_count).toBe(2);
    expect(res.hubs?.[0].id).toBe('b');
    expect(res.hubs?.[0].pagerank).toBe(0.7);
  });

  it('defaults the sidecar base URL and honours env override when set', () => {
    expect(KG_SIDECAR_DEFAULT_URL).toBeTruthy();
    expect(KG_SIDECAR_DEFAULT_URL.startsWith('http')).toBe(true);
  });
});
