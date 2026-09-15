import { describe, expect, it, vi, afterEach } from 'vitest';
import { createKgRouter } from '../src/routes/kg';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('kg router (extracted from server monolith)', () => {
  it('exposes the live-evidence and pipeline routes under /api/recourse/kg', () => {
    const router = createKgRouter();
    // Express Router has .stack with registered layers
    expect(router).toBeTruthy();
    const stack = (router as any).stack ?? [];
    expect(stack.length).toBeGreaterThan(0);
    // capture the paths the router handles
    const paths = stack
      .map((l: any) => l?.route?.path)
      .filter(Boolean)
      .sort();
    expect(paths).toContain('/sidecar');
    expect(paths).toContain('/sidecar/centrality');
    expect(paths).toContain('/live/status');
    expect(paths).toContain('/live/ode-params');
    expect(paths).toContain('/live/optimize');
    expect(paths).toContain('/live/pipeline');
  });

  it('live/status handler returns provider status honestly (mock 200)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 })));
    const router = createKgRouter();
    const layer = (router as any).stack.find((l: any) => l?.route?.path === '/live/status');
    expect(layer).toBeTruthy();
    const handler = layer.route.stack[0].handle;
    const req = {} as any;
    const res = { json: vi.fn() } as any;
    await handler(req, res);
    expect(res.json).toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.providers).toBeTruthy();
  });

  it('live/annotate parses PubTator tags locally (no network)', async () => {
    const router = createKgRouter();
    const layer = (router as any).stack.find((l: any) => l?.route?.path === '/live/annotate');
    const handler = layer.route.stack[0].handle;
    const req = { body: { text: '@GENE_KRAS @GENE_3845 @DISEASE_Lung_Neoplasms @DISEASE_MESH:D008175' } } as any;
    const res = { json: vi.fn() } as any;
    await handler(req, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.entities.some((e: any) => e.concept === 'GENE' && e.name === 'KRAS')).toBe(true);
  });

  it('live/search validates input (rejects empty query)', async () => {
    const router = createKgRouter();
    const layer = (router as any).stack.find((l: any) => l?.route?.path === '/live/search');
    const handler = layer.route.stack[0].handle;
    const req = { body: { query: '   ' } } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toContain('query');
  });
});