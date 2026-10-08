import { describe, it, expect } from 'vitest';
import { fleetBaseUrl, fleetCall, fleetHealth, FLEET_SERVICES } from '../src/lib/fleetRegistry';
import { draymondConfig } from '../src/lib/draymondBridge';

const json = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;

describe('fleetRegistry', () => {
  it('defaults to the canonical loopback ports', () => {
    expect(fleetBaseUrl('draymond', {})).toBe('http://127.0.0.1:3444');
    expect(fleetBaseUrl('keywire', {})).toBe('http://127.0.0.1:3000');
    expect(fleetBaseUrl('openhub', {})).toBe('http://127.0.0.1:3010');
    expect(fleetBaseUrl('axiom', {})).toBe('http://127.0.0.1:3198');
  });

  it('regression: Draymond must never default to the Keywire port', () => {
    expect(FLEET_SERVICES.draymond.port).not.toBe(FLEET_SERVICES.keywire.port);
    expect(draymondConfig().baseUrl).not.toMatch(/:3000$/);
  });

  it('honours env override, first var wins, trailing slashes stripped', () => {
    expect(fleetBaseUrl('draymond', { DRAYMOND_URL: 'http://h:1///', DRAYMOND_OPS_URL: 'http://x:2' })).toBe('http://h:1');
    expect(fleetBaseUrl('draymond', { DRAYMOND_OPS_URL: 'http://x:2' })).toBe('http://x:2');
    expect(fleetBaseUrl('draymond', { DRAYMOND_URL: '   ' })).toBe('http://127.0.0.1:3444');
  });

  it('fleetCall reports 2xx JSON as available, non-2xx as not ok, never throws', async () => {
    const ok = await fleetCall<{ a: number }>('axiom', '/x', { fetchImpl: json({ a: 1 }) });
    expect(ok).toMatchObject({ ok: true, available: true, status: 200, data: { a: 1 } });
    const bad = await fleetCall('axiom', '/x', { fetchImpl: json({ e: 1 }, 401) });
    expect(bad).toMatchObject({ ok: false, available: false, status: 401 });
    expect(bad.error).toContain('axiom HTTP 401');
    const down = await fleetCall('axiom', '/x', { fetchImpl: (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch });
    expect(down).toMatchObject({ ok: false, available: false, status: 0, data: null, error: 'ECONNREFUSED' });
  });

  it('fleetCall times out and says so', async () => {
    const slow = ((_u: string, init: RequestInit) => new Promise((_r, rej) => {
      init.signal!.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); });
    })) as unknown as typeof fetch;
    const r = await fleetCall('draymond', '/', { fetchImpl: slow, timeoutMs: 20 });
    expect(r.error).toBe('draymond timed out after 20ms');
  });

  it('fleetHealth: a 401 still counts as reachable; a refused connection does not', async () => {
    const mixed = (async (u: string) => {
      if (u.includes(':3198')) return new Response('{}', { status: 401 });
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const h = await fleetHealth(['axiom', 'openhub'], { env: {}, fetchImpl: mixed, timeoutMs: 200 });
    expect(h.find((s) => s.id === 'axiom')).toMatchObject({ reachable: true, status: 401, overridden: false });
    expect(h.find((s) => s.id === 'openhub')).toMatchObject({ reachable: false, status: 0, error: 'ECONNREFUSED' });
  });
});
