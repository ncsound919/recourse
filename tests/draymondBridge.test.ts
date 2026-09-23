import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  draymondHealth,
  fetchTidSignals,
  fetchScienceGrades,
  persistScienceInsight,
  draymondConfig,
} from '../src/lib/draymondBridge';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.DRAYMOND_URL;
  delete process.env.DRAYMOND_CRON_SECRET;
  delete process.env.CRON_SECRET;
});

describe('draymondBridge — fail-soft, honest HTTP client', () => {
  it('reads config from env with a sane default', () => {
    process.env.DRAYMOND_URL = 'http://dray.local:4000/';
    process.env.DRAYMOND_CRON_SECRET = 'sekret';
    const cfg = draymondConfig();
    expect(cfg.baseUrl).toBe('http://dray.local:4000');
    expect(cfg.secret).toBe('sekret');
  });

  it('GETs TID signals with the bearer token and returns parsed data', async () => {
    process.env.DRAYMOND_URL = 'http://dray.local:4000';
    process.env.DRAYMOND_CRON_SECRET = 'sekret';
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse({ ok: true, signals: [{ id: 's1' }] });
    });
    const res = await fetchTidSignals({ limit: 5 });
    expect(res.ok).toBe(true);
    expect(res.data?.signals).toEqual([{ id: 's1' }]);
    expect(calls[0].url).toContain('/api/ops/tid/signals?limit=5');
    expect(calls[0].init?.headers).toMatchObject({ Authorization: 'Bearer sekret' });
  });

  it('POSTs a science insight with the report body', async () => {
    process.env.DRAYMOND_URL = 'http://dray.local:4000';
    process.env.DRAYMOND_CRON_SECRET = 'sekret';
    let captured: { url: string; init?: RequestInit } | null = null;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      captured = { url, init };
      return jsonResponse({ ok: true, id: 'si_1', duplicate: false });
    });
    const report = { from_domain: 'biotech', to_domain: 'sports', translated_metrics: [], confidence: 0.6 };
    const res = await persistScienceInsight(report, { source: 'recourse-cross-domain', evidenceTier: 'E3' });
    expect(res.ok).toBe(true);
    expect(res.data?.id).toBe('si_1');
    expect(captured!.url).toContain('/api/v1/science/insights/persist');
    expect(captured!.init?.method).toBe('POST');
    expect(JSON.parse(String(captured!.init?.body))).toMatchObject({
      report, source: 'recourse-cross-domain', evidence_tier: 'E3',
    });
  });

  it('reports failure honestly when Draymond is unreachable (never fabricated)', async () => {
    process.env.DRAYMOND_URL = 'http://dray.local:4000';
    vi.stubGlobal('fetch', async () => { throw new Error('ECONNREFUSED'); });
    const health = await draymondHealth();
    expect(health.ok).toBe(false);
    const grades = await fetchScienceGrades();
    expect(grades.ok).toBe(false);
    expect(grades.data).toBeNull();
    expect(grades.error).toBeTruthy();
  });
});
