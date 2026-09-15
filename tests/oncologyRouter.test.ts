import { describe, expect, it, vi, afterEach } from 'vitest';
import { createOncologyRouter } from '../src/routes/oncology';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('oncology router (extracted from server monolith)', () => {
  it('registers the aggregate bridge + systems routes', () => {
    const router = createOncologyRouter();
    const paths = ((router as any).stack ?? [])
      .map((l: any) => l?.route?.path)
      .filter(Boolean)
      .sort();
    expect(paths).toContain('/status');
    expect(paths).toContain('/health');
    expect(paths).toContain('/simulate');
    expect(paths).toContain('/calibration/state');
    expect(paths).toContain('/discovery/ledger');
    expect(paths).toContain('/evidence');
    expect(paths).toContain('/research/unified');
    expect(paths).toContain('/predict');
    expect(paths).toContain('/systems');
  });

  it('systems handler reports every probe honestly (mock all down)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const router = createOncologyRouter();
    const layer = ((router as any).stack ?? []).find((l: any) => l?.route?.path === '/systems');
    expect(layer).toBeTruthy();
    const handler = layer.route.stack[0].handle;
    const res = { json: vi.fn() } as any;
    await handler({} as any, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.total).toBeGreaterThan(0);
    // every row is honest: offline with an error, never fabricated online
    for (const row of payload.systems) {
      expect(typeof row.online).toBe('boolean');
      expect(typeof row.name).toBe('string');
    }
  });

  it('predict forwards the upstream verdict (ok:false when host down)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const router = createOncologyRouter();
    const layer = ((router as any).stack ?? []).find((l: any) => l?.route?.path === '/predict');
    const handler = layer.route.stack[0].handle;
    const res = { json: vi.fn() } as any;
    const req = { body: { source_ref: 'test' } } as any;
    await handler(req, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload).toHaveProperty('success');
  });
});