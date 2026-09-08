import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { buildLiveOncologyGraph, liveEvidenceHealth, DEFAULT_ONCOLOGY_DISEASES } from '../src/lib/liveOncologyGraph';
import { clearLiveEvidenceCache } from '../src/lib/openTargetsClient';
import { clearPubTatorCache } from '../src/lib/pubTatorClient';

afterEach(() => {
  vi.unstubAllGlobals();
  clearLiveEvidenceCache();
  clearPubTatorCache();
});

beforeEach(() => {
  clearLiveEvidenceCache();
  clearPubTatorCache();
});

/** Build a fetch stub that answers Open Targets (POST /graphql) and PubTator (GET /search). */
function stubProviders(opts: { otDown?: boolean; ptDown?: boolean } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (opts.otDown) return new Response('bad gateway', { status: 502 });
    if (opts.ptDown) return new Response('bad gateway', { status: 502 });

    if (url.includes('opentargets.org')) {
      if (method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        const q = body.query ?? '';
        if (q.includes('disease(efoId')) {
          const vars = body.variables ?? {};
          return new Response(
            JSON.stringify({
              data: {
                disease: {
                  id: vars.efoId,
                  name: 'non-small cell lung carcinoma',
                  associatedTargets: {
                    count: 2,
                    rows: [
                      { target: { id: 'ENSG00000146648', approvedSymbol: 'EGFR', approvedName: 'epidermal growth factor receptor' }, score: 0.888 },
                      { target: { id: 'ENSG00000133703', approvedSymbol: 'KRAS', approvedName: 'KRas proto-oncogene, GTPase' }, score: 0.833 },
                    ],
                  },
                },
              },
            }),
            { status: 200 },
          );
        }
        if (q.includes('target(ensemblId')) {
          return new Response(
            JSON.stringify({
              data: {
                target: {
                  id: (body.variables?.id as string) ?? 'ENSG00000133703',
                  approvedSymbol: 'KRAS',
                  approvedName: 'KRas proto-oncogene, GTPase',
                  biotype: 'protein_coding',
                  tractability: [{ label: 'Approved Drug' }, { label: 'High-Quality Pocket' }],
                },
              },
            }),
            { status: 200 },
          );
        }
      }
      return new Response(JSON.stringify({ data: { search: { total: 0, hits: [] } } }), { status: 200 });
    }

    if (url.includes('pubtator3-api')) {
      return new Response(
        JSON.stringify({
          results: [
            {
              pmid: 34918209,
              title: 'KRAS mutated lung cancer subsets',
              journal: 'Mol Biomed',
              date: '2021-12-17T00:00:00Z',
              doi: '10.1186/s43556-021-00061-0',
              text_hl: '@GENE_KRAS @GENE_3845 @DISEASE_Lung_Neoplasms @DISEASE_MESH:D008175',
            },
          ],
        }),
        { status: 200 },
      );
    }

    return new Response(JSON.stringify({}), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('live oncology graph - evidence-to-graph pipeline', () => {
  it('merges canonical + Open Targets + PubTator layers into a provenance-tagged payload', async () => {
    stubProviders();
    const result = await buildLiveOncologyGraph({ diseases: ['MONDO_0005233'], topics: ['KRAS cancer'], maxTargetsPerDisease: 2, maxArticles: 1 });

    expect(result.ok).toBe(true);
    // canonical curated nodes (tebentafusp, sotorasib, ...) are always present
    expect(result.counts.canonicalNodes).toBeGreaterThan(0);
    // Open Targets disease + target nodes
    expect(result.counts.openTargetsNodes).toBeGreaterThanOrEqual(3); // 1 disease + 2 targets
    expect(result.counts.openTargetsEdges).toBe(2); // 2 target->disease edges
    // PubTator gene + disease + chemical co-occurrence
    expect(result.counts.pubTatorNodes).toBeGreaterThanOrEqual(2);
    expect(result.counts.pubTatorEdges).toBeGreaterThanOrEqual(1);

    // payload is a valid KgPayload (no dangling edges)
    const ids = new Set(result.payload.nodes.map((n) => n.id));
    for (const e of result.payload.edges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
    }

    // provenance ledger: every node carries a source
    for (const n of result.nodes) {
      expect(['canonical', 'open_targets', 'pubtator']).toContain(n.provenance);
    }
  });

  it('reports providers ok:true when both answered', async () => {
    stubProviders();
    const result = await buildLiveOncologyGraph({ diseases: ['MONDO_0005233'], topics: ['KRAS cancer'] });
    expect(result.providers.openTargets.ok).toBe(true);
    expect(result.providers.pubTator.ok).toBe(true);
  });

  it('still returns the canonical layer and reports ok:false when both providers are down', async () => {
    stubProviders({ otDown: true, ptDown: true });
    const result = await buildLiveOncologyGraph({ diseases: ['MONDO_0005233'], topics: ['KRAS cancer'] });
    expect(result.providers.openTargets.ok).toBe(false);
    expect(result.providers.pubTator.ok).toBe(false);
    // canonical nodes are still present — no fabricated live data
    expect(result.counts.canonicalNodes).toBeGreaterThan(0);
    expect(result.counts.openTargetsNodes).toBe(0);
    expect(result.counts.pubTatorNodes).toBe(0);
  });

  it('uses the validated default oncology disease set when none supplied', () => {
    expect(DEFAULT_ONCOLOGY_DISEASES.length).toBeGreaterThan(0);
    expect(DEFAULT_ONCOLOGY_DISEASES[0]).toMatch(/^MONDO_|^EFO_/);
  });
});

describe('live evidence health probe', () => {
  it('reports provider health honestly (both up / both down)', async () => {
    stubProviders();
    const both = await liveEvidenceHealth();
    expect(both.openTargets.ok).toBe(true);
    expect(both.pubTator.ok).toBe(true);

    stubProviders({ otDown: true, ptDown: true });
    const none = await liveEvidenceHealth();
    expect(none.openTargets.ok).toBe(false);
    expect(none.pubTator.ok).toBe(false);
  });
});