import { describe, expect, it, vi, afterEach } from 'vitest';
import { createBridgesRouter } from '../src/routes/bridges';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('bridges router (extracted from server monolith)', () => {
  it('registers all seven bridge clusters', () => {
    const router = createBridgesRouter();
    const paths = ((router as any).stack ?? [])
      .map((l: any) => l?.route?.path)
      .filter(Boolean)
      .sort();
    for (const p of ['/integrity/status', '/studies/health', '/studies', '/folding/status', '/folding/fold', '/pathosphere/contracts', '/pathosphere/bounty', '/umoe/status', '/umoe/run', '/chemlab/status', '/chemlab/molecule/similarity', '/foresight/status', '/foresight/simulate', '/foresight/backtest']) {
      expect(paths).toContain(p);
    }
  });

  it('pathosphere contracts returns real contract list (no network)', async () => {
    const router = createBridgesRouter();
    const layer = ((router as any).stack ?? []).find((l: any) => l?.route?.path === '/pathosphere/contracts');
    const handler = layer.route.stack[0].handle;
    const res = { json: vi.fn() } as any;
    await handler({} as any, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.count).toBeGreaterThan(0);
    expect(Array.isArray(payload.contracts)).toBe(true);
  });

  it('pathosphere bounty validates input and returns 400 on bad payload', async () => {
    const router = createBridgesRouter();
    const layer = ((router as any).stack ?? []).find((l: any) => l?.route?.path === '/pathosphere/bounty');
    const handler = layer.route.stack[0].handle;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    await handler({ body: { title: '' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toContain('invalid payload');
  });

  it('bridges handlers report status honestly when downstream is down (mock reject)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const router = createBridgesRouter();
    for (const p of ['/integrity/status', '/folding/status', '/umoe/status', '/chemlab/status', '/foresight/status', '/studies/health']) {
      const layer = ((router as any).stack ?? []).find((l: any) => l?.route?.path === p);
      const handler = layer.route.stack[0].handle;
      const res = { json: vi.fn() } as any;
      await handler({} as any, res);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.success).toBe(true);
      expect(payload.online).toBe(false);
      expect(typeof payload.error).toBe('string');
    }
  });
});