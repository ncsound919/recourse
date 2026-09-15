import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  keywireHealth,
  keywireSummary,
  keywireCallService,
  keywireBrainTask,
  keywireAxiomTest,
  keywirePm2Status,
  keywireServers,
  keywireAuthStatus,
} from '../src/lib/keywireBridge.js';

const KW = 'http://kw.test/';

function okJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function abortError(): Error & { name: string } {
  const e = new Error('The operation was aborted');
  e.name = 'AbortError';
  return e;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('keywireBridge — summary parsing (no auth)', () => {
  it('parses a full summary including string-number coercion', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        okJson({
          servers: { total: '3', taken: '1', open: '2' },
          sync: { pendingJobs: '0', failedJobs: '1', driftCount: 0 },
          tasks: { total: 9, done: 4 },
          health: 'ok',
          checkedAt: '2026-01-01T00:00:00.000Z',
        }),
      ),
    );
    const r = await keywireHealth(KW, 1000);
    expect(r.ok).toBe(true);
    expect(r.summary).toMatchObject({
      servers: { total: 3, taken: 1, open: 2 },
      sync: { pendingJobs: 0, failedJobs: 1, driftCount: 0 },
      tasks: { total: 9, done: 4 },
      health: 'ok',
      checkedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('omits absent sub-sections and drops invalid health strings', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ servers: { total: 1, taken: 0, open: 1 } })));
    const r = await keywireHealth(KW, 1000);
    expect(r.ok).toBe(true);
    expect(r.summary?.servers).toEqual({ total: 1, taken: 0, open: 1 });
    expect(r.summary?.sync).toBeUndefined();
    expect(r.summary?.health).toBeUndefined();
  });

  it('reports ok:false with an extracted server error on a 500 with JSON error body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ error: 'vault locked' }, 500)));
    const r = await keywireHealth(KW, 1000);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('keywire HTTP 500: vault locked');
  });

  it('reports the 401 guidance when authentication is required', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 401 })));
    const r = await keywireHealth(KW, 1000);
    expect(r.ok).toBe(false);
    expect(r.error).toBe(
      'keywire HTTP 401: authentication required (set KEYWIRE_SERVICE_TOKEN)',
    );
  });

  it('reports a plain HTTP status when the body carries no JSON error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 503 })));
    const r = await keywireHealth(KW, 1000);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('keywire HTTP 503');
  });

  it('reports the plain HTTP status when the error body is empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    const r = await keywireHealth(KW, 1000);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('keywire HTTP 500');
  });

  it('fails honestly when the 2xx body is not a JSON object', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson(['not', 'an', 'object'])));
    const r = await keywireHealth(KW, 1000);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('keywire summary returned no JSON object');
  });

  it('fails honestly when the 2xx body is raw text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('plain text', { status: 200 })));
    const r = await keywireHealth(KW, 1000);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('keywire summary returned no JSON object');
  });

  it('fails honestly when the 2xx body is empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })));
    const r = await keywireHealth(KW, 1000);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('keywire summary returned no JSON object');
  });

  it('returns the underlying message on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const r = await keywireHealth(KW, 1000);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('ECONNREFUSED');
  });

  it('reports a timeout when the fetch aborts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError()));
    const r = await keywireHealth(KW, 1000);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('keywire timed out after 1000ms');
  });

  it('uses keywire unreachable for a non-Error rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('bang'));
    const r = await keywireHealth(KW, 1000);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('keywire unreachable');
  });

  it('fires the abort timer when keywire never answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => new Promise((_res, rej) => {
        init?.signal?.addEventListener('abort', () => rej(abortError()));
      })),
    );
    const r = await keywireHealth(KW, 50);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('keywire timed out after 50ms');
  });

  it('tolerates a body read failure without throwing', async () => {
    const res = new Response('ignored');
    res.text = () => Promise.reject(new Error('read failed'));
    vi.stubGlobal('fetch', vi.fn(async () => res));
    const r = await keywireHealth(KW, 1000);
    expect(r.ok).toBe(false);
    expect(typeof r.error).toBe('string');
  });
});

describe('keywireBridge — keywireSummary', () => {
  it('flattens a healthy summary into the envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        okJson({ servers: { total: 1, taken: 0, open: 1 }, sync: { pendingJobs: 0, failedJobs: 0, driftCount: 0 }, tasks: { total: 2, done: 1 }, health: 'ok' }),
      ),
    );
    const r = await keywireSummary(KW, 1000);
    expect(r.ok).toBe(true);
    expect(r.servers).toEqual({ total: 1, taken: 0, open: 1 });
    expect(r.sync).toEqual({ pendingJobs: 0, failedJobs: 0, driftCount: 0 });
    expect(r.tasks).toEqual({ total: 2, done: 1 });
    expect(r.health).toBe('ok');
  });

  it('propagates a transport failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const r = await keywireSummary(KW, 1000);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('down');
  });

  it('fails honestly when the flattened summary is not an object', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson('nope')));
    const r = await keywireSummary(KW, 1000);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('keywire summary returned no JSON object');
  });
});

describe('keywireBridge — callService', () => {
  it('rejects a blank or non-string id before any network', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const a = await keywireCallService('', KW, 1000);
    expect(a.ok).toBe(false);
    expect(a.error).toBe('keywire call requires a service id');
    const b = await keywireCallService(42 as unknown as string, KW, 1000);
    expect(b.ok).toBe(false);
    expect(b.error).toBe('keywire call requires a service id');
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('returns the parsed service on a successful call', async () => {
    const mock = vi.fn(async () =>
      okJson({ id: 'draymond', name: 'Draymond', url: 'http://x', port: 4000, status: 'online', pm2Name: 'draymond' }),
    );
    vi.stubGlobal('fetch', mock);
    const r = await keywireCallService('draymond', KW, 1000);
    expect(r.ok).toBe(true);
    expect(r.service).toMatchObject({ id: 'draymond', name: 'Draymond', port: 4000, status: 'online', pm2Name: 'draymond' });
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${KW.replace(/\/$/, '')}/api/v1/ecosystem/call`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ id: 'draymond' });
  });

  it('propagates a transport failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('refused')));
    const r = await keywireCallService('draymond', KW, 1000);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('refused');
  });

  it('fails honestly when the service payload is unusable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ name: 'no id' })));
    const r = await keywireCallService('draymond', KW, 1000);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('keywire call returned no service payload');
  });

  it('fails honestly when the service payload is not an object', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson(['not', 'an', 'object'])));
    const r = await keywireCallService('draymond', KW, 1000);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('keywire call returned no service payload');
  });
});

describe('keywireBridge — brainTask and axiomTest', () => {
  it('passes the brain payload through verbatim', async () => {
    const mock = vi.fn(async () => okJson({ outcome: 'ok', details: [1, 2] }));
    vi.stubGlobal('fetch', mock);
    const r = await keywireBrainTask({ task: 'think', ctx: { a: 1 } }, KW, 1000);
    expect(r.ok).toBe(true);
    expect(r.data).toEqual({ outcome: 'ok', details: [1, 2] });
    const [, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ task: 'think', ctx: { a: 1 } });
  });

  it('propagates a brain-task transport failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const r = await keywireBrainTask({ task: 'x' }, KW, 1000);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('down');
  });

  it('returns the parsed probe for axiom/test', async () => {
    const mock = vi.fn(async () => okJson({ probe: { ok: true, status: 200, latencyMs: 12, error: undefined } }));
    vi.stubGlobal('fetch', mock);
    const r = await keywireAxiomTest(KW, 1000);
    expect(r.ok).toBe(true);
    expect(r.probe).toEqual({ ok: true, status: 200, latencyMs: 12 });
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${KW.replace(/\/$/, '')}/api/v1/ecosystem/axiom/test`);
    expect(init.method).toBe('POST');
  });

  it('coerces a malformed probe field defensively', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ probe: { ok: 'yes', status: 'n/a' } })));
    const r = await keywireAxiomTest(KW, 1000);
    expect(r.ok).toBe(true);
    expect(r.probe).toEqual({ ok: false });
  });

  it('fails honestly when axiom/test has no probe payload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({})));
    const r = await keywireAxiomTest(KW, 1000);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('keywire axiom/test returned no probe payload');
  });

  it('propagates an axiom/test transport failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const r = await keywireAxiomTest(KW, 1000);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('down');
  });
});

describe('keywireBridge — pm2 status', () => {
  it('parses the process table and skips malformed rows', async () => {
    const rows = [
      { name: 'draymond', pm_id: 0, status: 'online', uptime: 100, restarts: 1, cpu: 1.2, mem: 5, port: 3000 },
      'garbage',
      { name: 'brain' },
    ];
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ procs: rows, ok: true })));
    const r = await keywirePm2Status(KW, 1000);
    expect(r.ok).toBe(true);
    expect(r.processes).toEqual([
      { name: 'draymond', pm_id: 0, status: 'online', uptime: 100, restarts: 1, cpu: 1.2, mem: 5, port: 3000 },
      { name: 'brain' },
    ]);
  });

  it('surfaces the server error when keywire reports pm2 down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ ok: false, error: 'pm2 daemon unreachable' })));
    const r = await keywirePm2Status(KW, 1000);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('pm2 daemon unreachable');
  });

  it('uses a default message when pm2 down carries no error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ ok: false })));
    const r = await keywirePm2Status(KW, 1000);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('pm2 status not available');
  });

  it('fails honestly when no process table is present', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ ok: true })));
    const r = await keywirePm2Status(KW, 1000);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('keywire pm2/status returned no process table');
  });

  it('propagates a pm2 transport failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const r = await keywirePm2Status(KW, 1000);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('down');
  });
});

describe('keywireBridge — servers manifest', () => {
  it('parses the manifest and skips entries without a usable id', async () => {
    const servers = [
      { id: 'draymond', name: 'Draymond', group: 'core', port: 3000, host: 'h', url: 'u', description: 'd', pm2Name: 'p', status: 'online', latencyMs: 3, lastChecked: 't', error: undefined },
      'junk',
      { name: 'no id here' },
    ];
    vi.stubGlobal('fetch', vi.fn(async () => okJson({ servers })));
    const r = await keywireServers(KW, 1000);
    expect(r.ok).toBe(true);
    expect(r.servers).toHaveLength(1);
    expect(r.servers?.[0]).toMatchObject({ id: 'draymond', name: 'Draymond', group: 'core', port: 3000 });
  });

  it('fails honestly when no manifest is present', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okJson({})));
    const r = await keywireServers(KW, 1000);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('keywire servers returned no manifest');
  });

  it('propagates a servers transport failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const r = await keywireServers(KW, 1000);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('down');
  });
});

describe('keywireBridge — auth flow (service-token exchange)', () => {
  async function loadAuthBridge() {
    vi.resetModules();
    vi.stubEnv('KEYWIRE_SERVICE_TOKEN', 'kw_st_live_test');
    vi.stubEnv('KEYWIRE_URL', KW);
    return import('../src/lib/keywireBridge.js');
  }

  function route(handlers: Record<string, (init?: RequestInit) => Response | Promise<Response>>) {
    return vi.fn(async (url: string, init?: RequestInit) => {
      for (const [suffix, h] of Object.entries(handlers)) {
        if (url.endsWith(suffix)) return h(init);
      }
      return okJson({});
    });
  }

  it('exchanges the token and attaches the Bearer header to the request', async () => {
    const mock = route({
      '/auth/service-token/exchange': () => okJson({ accessToken: 'jwt-abc', expiresIn: 900 }),
      '/api/v1/ecosystem/summary': () => okJson({ servers: { total: 1, taken: 0, open: 1 }, health: 'ok' }),
    });
    vi.stubGlobal('fetch', mock);
    const bridge = await loadAuthBridge();
    const r = await bridge.keywireHealth(KW, 1000);
    expect(r.ok).toBe(true);
    const exchange = mock.mock.calls.find(([u]) => u.endsWith('/auth/service-token/exchange'));
    expect(exchange).toBeDefined();
    const [exchangeUrl, exchangeInit] = exchange as [string, RequestInit];
    expect(exchangeInit.method).toBe('POST');
    expect(JSON.parse(exchangeInit.body as string)).toEqual({ token: 'kw_st_live_test' });
    const summaryCall = mock.mock.calls.find(([u]) => u.endsWith('/api/v1/ecosystem/summary')) as [string, RequestInit];
    expect((summaryCall[1].headers as Record<string, string>).Authorization).toBe('Bearer jwt-abc');
    const status = bridge.keywireAuthStatus();
    expect(status.configured).toBe(true);
    expect(status.jwtCached).toBe(true);
    expect(typeof status.jwtExpiresAt).toBe('number');
  });

  it('reuses the cached JWT on a second request', async () => {
    const mock = route({
      '/auth/service-token/exchange': () => okJson({ accessToken: 'jwt-abc', expiresIn: 900 }),
      '/api/v1/ecosystem/summary': () => okJson({ servers: { total: 1, taken: 0, open: 1 } }),
      '/api/v1/ecosystem/servers': () => okJson({ servers: [{ id: 'x' }] }),
    });
    vi.stubGlobal('fetch', mock);
    const bridge = await loadAuthBridge();
    await bridge.keywireHealth(KW, 1000);
    await bridge.keywireServers(KW, 1000);
    const exchangeCalls = mock.mock.calls.filter(([u]) => u.endsWith('/auth/service-token/exchange'));
    expect(exchangeCalls).toHaveLength(1);
  });

  it('refreshes an expired JWT (expiresIn 0) on the next request', async () => {
    const mock = route({
      '/auth/service-token/exchange': () => okJson({ accessToken: 'jwt-expired', expiresIn: 0 }),
      '/api/v1/ecosystem/summary': () => okJson({ servers: { total: 1, taken: 0, open: 1 } }),
    });
    vi.stubGlobal('fetch', mock);
    const bridge = await loadAuthBridge();
    await bridge.keywireHealth(KW, 1000);
    await bridge.keywireHealth(KW, 1000);
    const exchangeCalls = mock.mock.calls.filter(([u]) => u.endsWith('/auth/service-token/exchange'));
    expect(exchangeCalls).toHaveLength(2);
  });

  it('proceeds unauthenticated when the exchange answers non-2xx', async () => {
    const mock = route({
      '/auth/service-token/exchange': () => new Response('denied', { status: 403 }),
      '/api/v1/ecosystem/summary': () => okJson({ servers: { total: 1, taken: 0, open: 1 } }),
    });
    vi.stubGlobal('fetch', mock);
    const bridge = await loadAuthBridge();
    const r = await bridge.keywireHealth(KW, 1000);
    expect(r.ok).toBe(true);
    const summaryCall = mock.mock.calls.find(([u]) => u.endsWith('/api/v1/ecosystem/summary')) as [string, RequestInit];
    expect(summaryCall[1].headers).not.toHaveProperty('Authorization');
  });

  it('proceeds unauthenticated when the exchange body has no accessToken', async () => {
    const mock = route({
      '/auth/service-token/exchange': () => okJson({ nope: true }),
      '/api/v1/ecosystem/summary': () => okJson({ servers: { total: 1, taken: 0, open: 1 } }),
    });
    vi.stubGlobal('fetch', mock);
    const bridge = await loadAuthBridge();
    const r = await bridge.keywireHealth(KW, 1000);
    expect(r.ok).toBe(true);
  });

  it('proceeds unauthenticated when the exchange throws', async () => {
    const mock = vi.fn(async (url: string) => {
      if (url.endsWith('/auth/service-token/exchange')) throw new Error('exchange down');
      return okJson({ servers: { total: 1, taken: 0, open: 1 } });
    });
    vi.stubGlobal('fetch', mock);
    const bridge = await loadAuthBridge();
    const r = await bridge.keywireHealth(KW, 1000);
    expect(r.ok).toBe(true);
  });

  it('aborts the exchange on its own timeout and proceeds unauthenticated', async () => {
    const abortErr = () => {
      const e = new Error('The operation was aborted');
      e.name = 'AbortError';
      return e;
    };
    const mock = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/service-token/exchange')) {
        return new Promise((_res, rej) => {
          init?.signal?.addEventListener('abort', () => rej(abortErr()));
        });
      }
      return Promise.resolve(okJson({ servers: { total: 1, taken: 0, open: 1 } }));
    });
    vi.stubGlobal('fetch', mock);
    const bridge = await loadAuthBridge();
    const r = await bridge.keywireHealth(KW, 50);
    expect(r.ok).toBe(true);
  });

  it('reports auth status as configured-but-uncached before any exchange', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const bridge = await loadAuthBridge();
    const status = bridge.keywireAuthStatus();
    expect(status.configured).toBe(true);
    expect(status.jwtCached).toBe(false);
    expect(status.jwtExpiresAt).toBeNull();
  });
});