import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  oncologyHealth,
  oncologyCalibrationDatasets,
  oncologyDiscoveryLedger,
  oncologyEvidence,
  oncologyResearchUnified,
  oncologyResearchPipeline,
  oncologyMechanismFusion,
  oncologyPredict,
} from '../src/lib/oncologyEngineBridge';
import { buildOncologyEvidenceSources } from '../src/lib/scienceConductor';
import { oncologyDiscoveryScreenReq } from '../src/lib/contracts';

afterEach(() => {
  vi.unstubAllGlobals();
});

const BASE = 'http://oncology.test';

describe('oncology aggregate bridge - honest failures (no fabricated results)', () => {
  it('health returns ok:false when the host is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const res = await oncologyHealth(BASE);
    expect(res.ok).toBe(false);
    expect(res.data).toBeUndefined();
    expect(res.error).toBeTruthy();
  });

  it('health returns ok:false on non-2xx (HTML root must never pass)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<!doctype html>', { status: 200 })));
    // JSON parse of HTML fails -> honest ok:false (the :3000 root serves HTML).
    const res = await oncologyCalibrationDatasets(BASE);
    expect(res.ok).toBe(false);
  });

  it('discoveryScreen contract rejects a >200 hypothesis batch (upstream cap)', () => {
    const many = Array.from({ length: 201 }, (_, i) => ({ id: `h${i}`, claim: 'c' }));
    expect(oncologyDiscoveryScreenReq.safeParse({ hypotheses: many }).success).toBe(false);
    const ok = Array.from({ length: 200 }, (_, i) => ({ id: `h${i}`, claim: 'c' }));
    expect(oncologyDiscoveryScreenReq.safeParse({ hypotheses: ok }).success).toBe(true);
  });

  it('predict surfaces the upstream honest 501 as ok:false with status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'not_implemented' }), { status: 501 }),
    ));
    const res = await oncologyPredict({ features: {} }, BASE);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(501);
  });

  it('researchUnified surfaces an honest 404 (no artifact) as ok:false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'unavailable' }), { status: 404 }),
    ));
    const res = await oncologyResearchUnified(BASE);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(404);
  });

  it('parses a real calibration-state payload (mock 200)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ updatedAtIso: '2026-09-01T00:00:00Z', potency: { medianIc50: 0.8 } }), { status: 200 }),
    ));
    const res = await oncologyHealth(BASE);
    expect(res.ok).toBe(true);
    expect(res.data?.updatedAtIso).toBe('2026-09-01T00:00:00Z');
  });

  it('discoveryLedger parses count (mock 200)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: [], count: 0 }), { status: 200 }),
    ));
    const res = await oncologyDiscoveryLedger(BASE);
    expect(res.ok).toBe(true);
    expect(res.data?.count).toBe(0);
  });

  it('evidence appends cohort+gene query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await oncologyEvidence({ cohort: 'luad', gene: 'kras', base: BASE });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/api/evidence?cohort=LUAD&gene=KRAS');
  });

  it('researchPipeline never sets publish implicitly', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await oncologyResearchPipeline({ topic: 'KRAS resistance' }, { base: BASE });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body ?? '{}'));
    expect(body.publish).toBe(false);
    expect(body.topic).toBe('KRAS resistance');
  });

  it('mechanismFusion parses the registry report (mock 200)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'operational', registered_mechanisms: [], alignments: [] }), { status: 200 }),
    ));
    const res = await oncologyMechanismFusion(BASE);
    expect(res.ok).toBe(true);
    expect((res.data as { status?: string })?.status).toBe('operational');
  });
});

describe('buildOncologyEvidenceSources (science-loop evidence injection)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('turns real oncology aggregate payloads into RawSource rows', async () => {
    let call = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      call += 1;
      if (String(url).includes('/api/evidence')) {
        return new Response(JSON.stringify({ cohorts: ['BRCA', 'LUAD'], all: ['BRCA', 'LUAD'] }), { status: 200 });
      }
      if (String(url).includes('/api/mechanism-fusion')) {
        return new Response(JSON.stringify({ status: 'operational', registered_mechanisms: [{ id: 'm1', name: 'AKT', domain: 'resistance', node_count: 5, edge_count: 4 }] }), { status: 200 });
      }
      if (String(url).includes('/api/calibration/state')) {
        return new Response(JSON.stringify({ potency: { medianIc50: 11.8, n: 392, provenance: { dataHash: 'abcd1234' } } }), { status: 200 });
      }
      if (String(url).includes('/api/discovery/ledger')) {
        return new Response(JSON.stringify({ results: [], count: 3 }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }));
    const { sources, skipped } = await buildOncologyEvidenceSources(4000);
    expect(sources.length).toBe(5); // 2 cohorts + 1 mechanism + calibration + ledger
    expect(sources[0].domain).toBe('oncology.local');
    expect(sources[0].url).toBe('oncology://aggregate');
    expect(sources.map((s) => s.id)).toContain('onc_cohort_BRCA');
    expect(sources.map((s) => s.id)).toContain('onc_calibration');
    expect(skipped).toEqual([]);
  });

  it('skips honestly with a reason when the host errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('err', { status: 502 })));
    const { sources, skipped } = await buildOncologyEvidenceSources(4000);
    expect(sources).toEqual([]);
    expect(skipped.length).toBe(4); // one reason per unavailable route
    expect(skipped.every((s) => s.includes('oncology '))).toBe(true);
  });
});
