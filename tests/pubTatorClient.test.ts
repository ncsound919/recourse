import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { parsePubTatorAnnotations, ptSearch, ptHealth, PUBTATOR_BASE_URL, clearPubTatorCache } from '../src/lib/pubTatorClient';

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  // Never let a live cache from a prior run (or another test) leak into these
  // tests: ptSearch's health path reads the shared on-disk cache.
  clearPubTatorCache();
});

describe('pubTator annotation parser (pure)', () => {
  it('parses gene + disease + chemical tags out of a real text_hl payload', () => {
    const hl = '...@GENE_KRAS @GENE_3845 @@@<m>KRAS</m>@@@ <m>mutation</m> directed @DISEASE_Lung_Neoplasms @DISEASE_MESH:D008175 @@@<m>lung</m> <m>cancer</m>@@@ therapies @CHEMICAL_Cisplatin @CHEMICAL_MESH:D002945';
    const entities = parsePubTatorAnnotations(hl);
    const genes = entities.filter((e) => e.concept === 'GENE').map((e) => e.name);
    const diseases = entities.filter((e) => e.concept === 'DISEASE').map((e) => e.name);
    const chemicals = entities.filter((e) => e.concept === 'CHEMICAL').map((e) => e.name);
    expect(genes).toContain('KRAS');
    expect(diseases).toContain('Lung_Neoplasms');
    expect(chemicals).toContain('Cisplatin');
    // identifiers attach to their display-name entity
    const kras = entities.find((e) => e.concept === 'GENE' && e.name === 'KRAS');
    expect(kras?.id).toBe('3845');
    const lung = entities.find((e) => e.concept === 'DISEASE' && e.name === 'Lung_Neoplasms');
    expect(lung?.id).toBe('MESH:D008175');
  });

  it('dedupes repeated tags and returns no entities for empty/garbage input', () => {
    const hl = '@GENE_TP53 @GENE_TP53 @GENE_7157';
    const entities = parsePubTatorAnnotations(hl);
    expect(entities.filter((e) => e.concept === 'GENE' && e.name === 'TP53')).toHaveLength(1);
    expect(parsePubTatorAnnotations('')).toHaveLength(0);
    expect(parsePubTatorAnnotations('no tags here')).toHaveLength(0);
  });

  it('pairs ids positionally and never fabricates an entity for a lone/unpaired id', () => {
    // repeated KRAS mention with a new id: first id wins, second id is dropped
    const repeated = parsePubTatorAnnotations('@GENE_KRAS @GENE_3845 @GENE_KRAS @GENE_3846');
    expect(repeated).toHaveLength(1);
    expect(repeated[0]).toEqual({ concept: 'GENE', name: 'KRAS', id: '3845' });
    // lone id with no preceding name: dropped, not emitted as a fake entity
    const lone = parsePubTatorAnnotations('@GENE_3845');
    expect(lone).toHaveLength(0);
    // mixed concepts pair independently
    const mixed = parsePubTatorAnnotations('@GENE_EGFR @GENE_1956 @CHEMICAL_Gefitinib @CHEMICAL_MESH:D019992');
    expect(mixed).toEqual([
      { concept: 'GENE', name: 'EGFR', id: '1956' },
      { concept: 'CHEMICAL', name: 'Gefitinib', id: 'MESH:D019992' },
    ]);
  });

  it('treats non-colon tokens as display names with no id', () => {
    const entities = parsePubTatorAnnotations('@GENE_BRAF @DISEASE_Melanoma');
    const braf = entities.find((e) => e.concept === 'GENE');
    expect(braf?.name).toBe('BRAF');
    expect(braf?.id).toBeNull();
  });
});

describe('pubTator search client - honest failures', () => {
  it('returns ok:false when the API is unreachable (no fabricated articles)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const r = await ptSearch('KRAS cancer');
    expect(r.ok).toBe(false);
    expect(r.data).toBeNull();
    expect(r.error).toBeTruthy();
  });

  it('returns ok:false on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 503 })));
    const r = await ptSearch('KRAS cancer');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('503');
  });

  it('parses a real search payload (mock 200) and maps entities per article', async () => {
    const body = {
      results: [
        {
          pmid: 34918209,
          title: 'Untangling the KRAS mutated lung cancer subsets',
          journal: 'Mol Biomed',
          date: '2021-12-17T00:00:00Z',
          doi: '10.1186/s43556-021-00061-0',
          text_hl: '@GENE_KRAS @GENE_3845 @DISEASE_Lung_Neoplasms @DISEASE_MESH:D008175',
        },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })));
    const r = await ptSearch('KRAS cancer', { pageSize: 1 });
    expect(r.ok).toBe(true);
    expect(r.data?.articles).toHaveLength(1);
    const a = r.data!.articles[0]!;
    expect(a.pmid).toBe('34918209');
    expect(a.title).toContain('KRAS');
    expect(a.entities.some((e) => e.concept === 'GENE' && e.name === 'KRAS')).toBe(true);
    expect(a.entities.some((e) => e.concept === 'DISEASE' && e.name === 'Lung_Neoplasms')).toBe(true);
  });

  it('honours the env base URL default', () => {
    expect(PUBTATOR_BASE_URL).toBeTruthy();
    expect(PUBTATOR_BASE_URL.startsWith('http')).toBe(true);
  });

  it('health probe reports honest ok on a mock 200 and ok:false on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 })));
    const okHealth = await ptHealth();
    expect(okHealth.ok).toBe(true);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const badHealth = await ptHealth();
    expect(badHealth.ok).toBe(false);
  });
});