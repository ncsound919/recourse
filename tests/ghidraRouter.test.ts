import { describe, expect, it, vi, afterEach } from 'vitest';
import { createGhidraRouter } from '../src/routes/ghidra';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RECOURSE_API_SECRET;
});

function layers(router: any) {
  return (router as any).stack ?? [];
}

describe('ghidra router (extracted pattern)', () => {
  it('registers the reverse-engineering routes', () => {
    const router = createGhidraRouter();
    const paths = layers(router)
      .map((l: any) => l?.route?.path)
      .filter(Boolean)
      .sort();
    expect(paths).toContain('/sidecar');
    expect(paths).toContain('/formats');
    expect(paths).toContain('/analyze');
    expect(paths).toContain('/entropy');
    expect(paths).toContain('/learn');
  });

  it('sidecar status honestly reports offline/unavailable (mock failure)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const router = createGhidraRouter();
    const layer = layers(router).find((l: any) => l?.route?.path === '/sidecar');
    const handler = layer.route.stack[0].handle;
    const res = { json: vi.fn() } as any;
    await handler({} as any, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.online).toBe(false);
    expect(payload.available).toBe(false);
  });

  it('analyze rejects an invalid payload with 400 before calling the sidecar', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const router = createGhidraRouter();
    const layer = layers(router).find((l: any) => l?.route?.path === '/analyze');
    const handler = layer.route.stack[0].handle;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    await handler({ body: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('learn reports honestly when no learning sink is wired', async () => {
    const router = createGhidraRouter();
    const layer = layers(router).find((l: any) => l?.route?.path === '/learn');
    const handler = layer.route.stack[0].handle;
    const body = {
      binaryName: 'sample.bin',
      findings: { riskScore: 10, indicatorCount: 0, indicators: [] },
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    await handler({ body, method: 'POST', headers: {} } as any, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.ok).toBe(false);
    expect(payload.error).toContain('not wired');
  });

  it('learn forwards a valid payload to the injected sink', async () => {
    const sink = vi.fn().mockResolvedValue({ binaryName: 'sample.bin', domain: 'cyber_defense', reward: 0.9, tools: [], signals: [], repairRows: [], remediations: [], summary: 's' });
    const router = createGhidraRouter({ learnFromAnalysis: sink });
    const layer = layers(router).find((l: any) => l?.route?.path === '/learn');
    const handler = layer.route.stack[0].handle;
    const body = {
      binaryName: 'sample.bin',
      findings: { riskScore: 80, indicatorCount: 1, indicators: [{ kind: 'rwx_section', severity: 'high', detail: 'x' }] },
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    await handler({ body, method: 'POST', headers: {} } as any, res);
    expect(sink).toHaveBeenCalledTimes(1);
    const payload = res.json.mock.calls[0][0];
    expect(payload.ok).toBe(true);
    expect(payload.reward).toBe(0.9);
  });
});
