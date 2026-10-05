import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * "Online" must mean "a completion can be produced", and a reachability probe
 * must never overwrite that verdict.
 *
 * The online cache had one `online` field written by BOTH probe tiers with no
 * record of which wrote it, so:
 *  - the hot-path shallow probe (consulted before every completion) overwrote a
 *    deep `false` verdict within the TTL, re-reporting an unkeyed provider as
 *    online;
 *  - `providerStatus().online` could not say whether it meant "reachable" or
 *    "produced a completion".
 *
 * The module's own docstring names the cost: 58 forge attempts failed against a
 * provider `GET /models` answered 200 for while `/chat/completions` returned
 * 401, with the dashboard calling it healthy.
 *
 * The provider module is imported dynamically per test because its cache is
 * module-level state keyed on the configured env.
 */

interface Fake {
  url: string;
  chatCalls: () => number;
  close: () => Promise<void>;
}

/** /models answers 200 (reachable); /chat/completions answers 401 (unusable). */
async function serveReachableButUnusable(): Promise<Fake> {
  let chat = 0;
  const srv = http.createServer((req, res) => {
    if (req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'fake-model' }] }));
      return;
    }
    if (req.url === '/v1/chat/completions') {
      chat++;
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'plan tier does not include API access' } }));
      return;
    }
    res.writeHead(404); res.end();
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const port = (srv.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}/v1`,
    chatCalls: () => chat,
    close: () => new Promise<void>((r) => srv.close(() => r())),
  };
}

const ENV_KEYS = ['API_MODEL_BASE_URL', 'API_MODEL_NAME', 'API_MODEL_API_KEY', 'LOCAL_MODEL_BASE_URL'] as const;
let saved: Record<string, string | undefined> = {};
let fake: Fake | null = null;

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  fake = null;
});

afterEach(async () => {
  if (fake) await fake.close();
  fake = null;
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
});

/** Fresh module instance each call so the module-level online cache starts empty. */
async function freshProvider() {
  vi.resetModules();
  return import('../src/lib/modelProvider.js');
}

describe('modelProvider online-probe depth', () => {
  it('a deep probe detects a reachable-but-unusable provider', async () => {
    fake = await serveReachableButUnusable();
    process.env.API_MODEL_BASE_URL = fake.url;
    process.env.API_MODEL_NAME = 'fake';
    process.env.API_MODEL_API_KEY = 'k';
    const mp = await freshProvider();

    expect(await mp.checkOnline(true, 'api', { deep: true })).toBe(false);
    const st = mp.providerStatus('api');
    expect(st.verified).toBe('deep');
    // The provider's own words are the actionable part.
    expect(st.lastError).toContain('plan tier does not include API access');
  }, 60_000);

  it('a shallow probe cannot overwrite a deep verdict', async () => {
    fake = await serveReachableButUnusable();
    process.env.API_MODEL_BASE_URL = fake.url;
    process.env.API_MODEL_NAME = 'fake';
    process.env.API_MODEL_API_KEY = 'k';
    const mp = await freshProvider();

    expect(await mp.checkOnline(true, 'api', { deep: true })).toBe(false);
    const afterDeep = fake.chatCalls();

    // Hot path: cheap reachability check inside the TTL.
    expect(await mp.checkOnline(false, 'api')).toBe(false);
    expect(mp.providerStatus('api').verified).toBe('deep');
    // ...and it must not have re-probed, or the "cheap" path costs a token.
    expect(fake.chatCalls()).toBe(afterDeep);
  }, 60_000);

  it('labels a reachability-only true as reachability, never as healthy', async () => {
    fake = await serveReachableButUnusable();
    process.env.API_MODEL_BASE_URL = fake.url;
    process.env.API_MODEL_NAME = 'fake';
    process.env.API_MODEL_API_KEY = 'k';
    const mp = await freshProvider();

    expect(await mp.checkOnline(true, 'api')).toBe(true); // /models answered 200
    const st = mp.providerStatus('api');
    expect(st.verified).toBe('reachability');
  }, 60_000);

  it('a deep request re-probes rather than inheriting a weaker cached claim', async () => {
    fake = await serveReachableButUnusable();
    process.env.API_MODEL_BASE_URL = fake.url;
    process.env.API_MODEL_NAME = 'fake';
    process.env.API_MODEL_API_KEY = 'k';
    const mp = await freshProvider();

    expect(await mp.checkOnline(true, 'api')).toBe(true);           // shallow: true
    const before = fake.chatCalls();
    expect(await mp.checkOnline(false, 'api', { deep: true })).toBe(false); // must not trust the shallow true
    expect(fake.chatCalls()).toBeGreaterThan(before);
    expect(mp.providerStatus('api').verified).toBe('deep');
  }, 60_000);

  it('reports verified=none before anything has been probed', async () => {
    const mp = await freshProvider();
    const st = mp.providerStatus('api');
    expect(st.verified).toBe('none');
    expect(st.online).toBe(false);
  }, 60_000);

  it('an unreachable endpoint is a definitive negative at any depth', async () => {
    process.env.API_MODEL_BASE_URL = 'http://127.0.0.1:1/v1';
    process.env.API_MODEL_NAME = 'fake';
    process.env.API_MODEL_API_KEY = 'k';
    const mp = await freshProvider();

    expect(await mp.checkOnline(true, 'api', { deep: true })).toBe(false);
    const st = mp.providerStatus('api');
    // /models failing proves nothing is reachable, so this may be reused as a
    // strong answer rather than downgraded to a reachability claim.
    expect(st.verified).toBe('deep');
    expect(st.lastError).toBeTruthy();
  }, 60_000);
});