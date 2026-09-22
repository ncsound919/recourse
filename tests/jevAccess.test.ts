import { describe, expect, it, afterEach } from 'vitest';
import { resolveJevPublic, setJevPublic, readJevPublicFromKeywire, resetJevPublicCache, TOGGLE_KEY } from '../src/lib/jevAccess';

const saved: Record<string, string | undefined> = {
  RECOURSE_JEV_PUBLIC: process.env.RECOURSE_JEV_PUBLIC,
  KEYWIRE_URL: process.env.KEYWIRE_URL,
  KEYWIRE_SERVICE_TOKEN: process.env.KEYWIRE_SERVICE_TOKEN,
  KEYWIRE_JEV_PROJECT: process.env.KEYWIRE_JEV_PROJECT,
  KEYWIRE_JEV_ENV: process.env.KEYWIRE_JEV_ENV,
  KEYWIRE_JEV_TTL_MS: process.env.KEYWIRE_JEV_TTL_MS,
};

afterEach(() => {
  resetJevPublicCache();
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('resolveJevPublic', () => {
  it('honors the static env override first (no Keywire call)', async () => {
    process.env.RECOURSE_JEV_PUBLIC = '1';
    const spy = { calls: 0, fn: (async () => {
      spy.calls += 1;
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch };
    expect(await resolveJevPublic(process.env, spy.fn)).toBe('1');
    expect(spy.calls).toBe(0);
  });

  it('falls back to the Keywire vault value when env is unset', async () => {
    delete process.env.RECOURSE_JEV_PUBLIC;
    delete process.env.KEYWIRE_SERVICE_TOKEN;
    const fetchImpl = (async () => new Response(JSON.stringify({ [TOGGLE_KEY]: '1' }), { status: 200 })) as typeof fetch;
    expect(await resolveJevPublic(process.env, fetchImpl)).toBe('1');
  });

  it('returns undefined (CLOSED) when Keywire is unreachable', async () => {
    delete process.env.RECOURSE_JEV_PUBLIC;
    const fetchImpl = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    expect(await resolveJevPublic(process.env, fetchImpl)).toBeUndefined();
  });
});

describe('readJevPublicFromKeywire', () => {
  it('parses the toggle from the vault export', async () => {
    delete process.env.KEYWIRE_SERVICE_TOKEN;
    const fetchImpl = (async () => new Response(JSON.stringify({ [TOGGLE_KEY]: '0', OTHER: 'x' }), { status: 200 })) as typeof fetch;
    expect(await readJevPublicFromKeywire(process.env, fetchImpl)).toBe('0');
  });

  it('returns undefined on a non-2xx', async () => {
    const fetchImpl = (async () => new Response('nope', { status: 503 })) as typeof fetch;
    expect(await readJevPublicFromKeywire(process.env, fetchImpl)).toBeUndefined();
  });
});

describe('setJevPublic', () => {
  it('writes the toggle to the vault and caches it', async () => {
    delete process.env.KEYWIRE_SERVICE_TOKEN;
    const fetchImpl = (async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as typeof fetch;
    const r = await setJevPublic('0', process.env, fetchImpl);
    expect(r.ok).toBe(true);
  });

  it('reports honestly when the vault write is rejected', async () => {
    const fetchImpl = (async () => new Response('denied', { status: 403 })) as typeof fetch;
    const r = await setJevPublic('1', process.env, fetchImpl);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(403);
  });
});