import { describe, expect, it, vi, afterEach } from 'vitest';
import { createToolsRouter } from '../src/routes/tools';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tools router (extracted from server monolith)', () => {
  it('registers pdf/fuzz/grant/research/prometheus/bfr routes', () => {
    const router = createToolsRouter();
    const paths = ((router as any).stack ?? [])
      .map((l: any) => l?.route?.path)
      .filter(Boolean)
      .sort();
    for (const p of ['/pdf/sidecar', '/pdf/extract-url', '/fuzz/sidecar', '/fuzz/match', '/grant/problems', '/grant/hypotheses', '/grant/package', '/research/execute', '/prometheus/export', '/bfr/aging', '/bfr/sat', '/bfr/riemann']) {
      expect(paths).toContain(p);
    }
  });

  it('grant/problems returns real problems (no network, no LLM)', async () => {
    const router = createToolsRouter();
    const layer = ((router as any).stack ?? []).find((l: any) => l?.route?.path === '/grant/problems');
    const handler = layer.route.stack[0].handle;
    const res = { json: vi.fn() } as any;
    await handler({} as any, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.count).toBeGreaterThan(0);
    expect(Array.isArray(payload.problems)).toBe(true);
    expect(payload.problems[0]).toHaveProperty('problem_id');
  });

  it('bfr/riemann runs a deterministic seeded sweep', async () => {
    const router = createToolsRouter();
    const layer = ((router as any).stack ?? []).find((l: any) => l?.route?.path === '/bfr/riemann');
    const handler = layer.route.stack[0].handle;
    const res = { json: vi.fn() } as any;
    await handler({ body: { tStart: 14, tEnd: 100, points: 8, seed: 3 } } as any, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.sweep).toBeTruthy();
  });

  it('prometheus/status reports the configured url (no network)', async () => {
    const router = createToolsRouter();
    const layer = ((router as any).stack ?? []).find((l: any) => l?.route?.path === '/prometheus/status');
    const handler = layer.route.stack[0].handle;
    const res = { json: vi.fn() } as any;
    await handler({} as any, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(typeof payload.url).toBe('string');
  });
});