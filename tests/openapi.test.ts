import { describe, it, expect, vi } from 'vitest';
import { buildOpenApiSpec, listOperations } from '../src/lib/openapi';
import { createRecourseSdk } from '../src/lib/recourseSdk';

describe('OpenAPI spec', () => {
  it('has a valid 3.1 shape and trimmed servers', () => {
    const spec = buildOpenApiSpec('http://localhost:3050/');
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.servers[0].url).toBe('http://localhost:3050');
    expect(Object.keys(spec.paths).length).toBeGreaterThan(20);
  });

  it('indexes operations sorted with mutating flags', () => {
    const ops = listOperations(buildOpenApiSpec('http://x'));
    const paths = ops.map((o) => `${o.method} ${o.path}`);
    expect(paths).toContain('GET /api/recourse/status');
    expect(paths).toContain('POST /api/recourse/wallet/budget');
    expect(paths).toContain('POST /api/a2a');
    // Sorted by path.
    const sorted = [...ops].sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
    expect(ops.map((o) => `${o.method} ${o.path}`)).toEqual(sorted.map((o) => `${o.method} ${o.path}`));
    expect(ops.find((o) => o.path === '/api/recourse/wallet/budget')?.mutating).toBe(true);
    expect(ops.find((o) => o.path === '/api/recourse/status')?.mutating).toBe(false);
  });
});

describe('typed SDK', () => {
  it('parses a successful JSON response', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, status: { generation: 3 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const sdk = createRecourseSdk({ baseUrl: 'http://x', fetchImpl: fetchImpl as unknown as typeof fetch });
    const r = await sdk.status();
    expect(r.ok).toBe(true);
    expect(r.data.status.generation).toBe(3);
    expect(fetchImpl).toHaveBeenCalledWith('http://x/api/recourse/status', expect.objectContaining({ method: 'GET' }));
  });

  it('sends the secret on mutating calls only', async () => {
    const calls: Array<{ url: string; headers: any }> = [];
    const fetchImpl = (async (url: string, init: any) => {
      calls.push({ url, headers: init.headers });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as unknown as typeof fetch;
    const sdk = createRecourseSdk({ baseUrl: 'http://x', secret: 's3cr3t', fetchImpl });
    await sdk.status();
    await sdk.setWalletBudget('merge', 500);
    expect(calls[0].headers['x-api-secret']).toBeUndefined();
    expect(calls[1].headers['x-api-secret']).toBe('s3cr3t');
  });

  it('reports an honest failure on network error without fabricating data', async () => {
    const fetchImpl = (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
    const sdk = createRecourseSdk({ baseUrl: 'http://x', fetchImpl });
    const r = await sdk.wallet();
    expect(r.ok).toBe(false);
    expect(r.status).toBe(0);
    expect(r.data).toBeNull();
    expect(r.error).toContain('ECONNREFUSED');
  });
});
