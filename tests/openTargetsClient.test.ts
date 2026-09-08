import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import {
  otSearch,
  otDiseaseAssociations,
  otTargetInfo,
  otHealth,
  OPEN_TARGETS_GRAPHQL_URL,
  clearLiveEvidenceCache,
} from '../src/lib/openTargetsClient';

afterEach(() => {
  vi.unstubAllGlobals();
  clearLiveEvidenceCache();
});

beforeEach(() => {
  clearLiveEvidenceCache();
});

const mockGql = (data: unknown) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify({ data }), { status: 200 }));

describe('open targets client - parsing', () => {
  it('parses disease associations into targets with real scores', async () => {
    const body = {
      disease: {
        id: 'MONDO_0005233',
        name: 'non-small cell lung carcinoma',
        associatedTargets: {
          count: 12475,
          rows: [
            { target: { id: 'ENSG00000146648', approvedSymbol: 'EGFR', approvedName: 'epidermal growth factor receptor' }, score: 0.888 },
            { target: { id: 'ENSG00000133703', approvedSymbol: 'KRAS', approvedName: 'KRas proto-oncogene, GTPase' }, score: 0.833 },
          ],
        },
      },
    };
    vi.stubGlobal('fetch', mockGql(body));
    const r = await otDiseaseAssociations('MONDO_0005233', 5);
    expect(r.ok).toBe(true);
    expect(r.data?.diseaseId).toBe('MONDO_0005233');
    expect(r.data?.targets).toHaveLength(2);
    expect(r.data?.targets[0]).toMatchObject({ approvedSymbol: 'EGFR', score: 0.888 });
  });

  it('parses target tractability labels', async () => {
    const body = {
      target: {
        id: 'ENSG00000133703',
        approvedSymbol: 'KRAS',
        approvedName: 'KRas proto-oncogene, GTPase',
        biotype: 'protein_coding',
        tractability: [{ label: 'Approved Drug' }, { label: 'High-Quality Pocket' }],
      },
    };
    vi.stubGlobal('fetch', mockGql(body));
    const r = await otTargetInfo('ENSG00000133703');
    expect(r.ok).toBe(true);
    expect(r.data?.tractability).toContain('Approved Drug');
    expect(r.data?.biotype).toBe('protein_coding');
  });

  it('parses search hits by entity type', async () => {
    const body = { search: { total: 8, hits: [{ id: 'ENSG00000133703', entity: 'target' }] } };
    vi.stubGlobal('fetch', mockGql(body));
    const r = await otSearch('KRAS', ['target'], 5);
    expect(r.ok).toBe(true);
    expect(r.data).toHaveLength(1);
    expect(r.data?.[0]).toMatchObject({ id: 'ENSG00000133703', entity: 'target' });
  });
});

describe('open targets client - honest failures', () => {
  it('returns ok:false on network failure (no fabricated scores)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const r = await otDiseaseAssociations('MONDO_0005233');
    expect(r.ok).toBe(false);
    expect(r.data).toBeNull();
    expect(r.error).toBeTruthy();
  });

  it('returns ok:false on GraphQL errors reported by the API', async () => {
    const body = { errors: [{ message: 'Cannot query field' }] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })));
    const r = await otTargetInfo('ENSG00000000000');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Cannot query field');
  });

  it('returns ok:false when the API resolves no disease data', async () => {
    vi.stubGlobal('fetch', mockGql({ disease: null }));
    const r = await otDiseaseAssociations('MONDO_NOPE');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('no disease');
  });

  it('health probe reports honest ok on mock 200 and ok:false on failure', async () => {
    vi.stubGlobal('fetch', mockGql({ target: { id: 'ENSG00000133703', approvedSymbol: 'KRAS', tractability: [] } }));
    const okHealth = await otHealth();
    expect(okHealth.ok).toBe(true);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const badHealth = await otHealth();
    expect(badHealth.ok).toBe(false);
  });

  it('defaults the GraphQL URL to the public Open Targets endpoint', () => {
    expect(OPEN_TARGETS_GRAPHQL_URL).toContain('opentargets.org');
  });
});