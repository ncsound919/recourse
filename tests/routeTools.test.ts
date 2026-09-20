import { describe, it, expect, vi } from 'vitest';
import { createRouteToolProvider } from '../src/lib/routeTools.js';

const SPEC = {
  paths: {
    '/api/things/{id}': { get: { summary: 'Get a thing', tags: ['things'], mutating: false } },
    '/api/legacy/:id': { get: { summary: 'Legacy thing', tags: ['things'], mutating: false } },
    '/api/things': { post: { summary: 'Create a thing', tags: ['things'], mutating: true } },
    '/api/recourse/agent/tools': { post: { summary: 'agent route', tags: ['agent'], mutating: true } },
  },
} as any;

function provider(fetchImpl: any, secret?: string) {
  return createRouteToolProvider({ spec: SPEC, baseUrl: 'http://127.0.0.1:3050', fetchImpl, secret });
}

const okFetch = (body: unknown = { success: true }) =>
  vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify(body) }));

describe('createRouteToolProvider', () => {
  it('lists operations (excluding the agent route) with mutating flags', async () => {
    const specs = await provider(okFetch()).list();
    const names = specs.map((s) => s.name).sort();
    expect(names).toContain('get_api_things_id');
    expect(names).toContain('post_api_things');
    expect(names.some((n) => n.includes('agent_tools'))).toBe(false);
    expect(specs.find((s) => s.name === 'post_api_things')?.mutating).toBe(true);
  });

  it('substitutes both {name} (OpenAPI) and :name (Express) path params + query', async () => {
    const brace = okFetch({ id: '42' });
    const p1 = provider(brace);
    await p1.invoke('GET /api/things/{id}', { params: { id: 42 }, query: { full: '1' } });
    expect(String((brace.mock.calls[0] as any)[0])).toBe('http://127.0.0.1:3050/api/things/42?full=1');

    const colon = okFetch();
    const p2 = provider(colon);
    await p2.invoke('GET /api/legacy/:id', { params: { id: 'a b' } });
    expect(String((colon.mock.calls[0] as any)[0])).toBe('http://127.0.0.1:3050/api/legacy/a%20b');
  });

  it('invokes POST with a JSON body and authorizes mutating calls', async () => {
    const fetchImpl = okFetch();
    const p = provider(fetchImpl, 's3cret');
    const res = await p.invoke('POST /api/things', { body: { name: 'x' } });
    expect(res.ok).toBe(true);
    const init = (fetchImpl.mock.calls[0] as any)[1];
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
    expect(init.headers.Authorization).toBe('Bearer s3cret');
    expect(init.body).toBe('{"name":"x"}');
  });

  it('reports missing path params and HTTP errors honestly', async () => {
    const missing = await provider(okFetch()).invoke('GET /api/things/{id}', {});
    expect(missing.ok).toBe(false);
    expect(missing.error).toMatch(/missing path parameter\(s\): id/);

    const errFetch = vi.fn(async () => ({ ok: false, status: 503, text: async () => 'down' }));
    const err = await provider(errFetch).invoke('GET /api/things/{id}', { params: { id: 1 } });
    expect(err.ok).toBe(false);
    expect(err.error).toMatch(/HTTP 503/);
  });

  it('rejects unknown operations', async () => {
    const res = await provider(okFetch()).invoke('GET /nope', {});
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/unknown route operation/);
  });
});
