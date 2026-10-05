import { describe, expect, it, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createMemoryRouter } from '../src/routes/memory';

/**
 * Guards on the memory router.
 *
 * `POST /memory/index` calls `indexSystemMemory()`, which deletes and rewrites
 * the durable store's `gene:*` and `snap:*` rows. It was the ONLY mutation in
 * this router without `requireMutationAuth` — its three siblings
 * (`/memory/consolidate`, `/memory/promote-skills`, `/fleet/memory`) were all
 * guarded — so anyone who could reach the port could rewrite them.
 *
 * Both fail-closed directions are asserted, because they are different failures:
 * an UNCONFIGURED secret must disable the route (503), and a WRONG presented
 * secret must be rejected (401). Treating "no secret set" as "open" is the bug
 * this class of guard exists to prevent.
 */

const ENV_KEY = 'RECOURSE_API_SECRET';

function buildApp() {
  const app = express();
  app.use('/api/recourse', createMemoryRouter({
    ensureVectorMemory: async () => ({
      status: async () => ({ embedder: 'lexical' as const, store: 'memory' as const, docs: 3 }),
      recall: async () => [],
      remember: async () => {},
    }),
    indexSystemMemory: async () => ({ indexed: 999, status: {} }),
    openhubFleetSignal: async () => ({
      beliefs: [], auditSignals: [], degraded: false, reportAt: null, health: null,
    }),
  }));
  return app;
}

async function withServer(fn: (base: string) => Promise<void>): Promise<void> {
  const server = http.createServer(buildApp());
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  try { await fn(`http://127.0.0.1:${port}`); }
  finally { await new Promise<void>((r) => server.close(() => r())); }
}

describe('mutation auth on the memory router', () => {
  const saved = process.env[ENV_KEY];
  afterEach(() => {
    if (saved === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = saved;
  });

  it('refuses POST /memory/index when no secret is configured (disabled, not open)', async () => {
    delete process.env[ENV_KEY];
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/recourse/memory/index`, { method: 'POST' });
      expect(res.status).toBe(503);
      const body = await res.json() as any;
      expect(body.success).toBe(false);
      expect(String(body.error)).toContain('fail-closed');
    });
  }, 60_000);

  it('refuses POST /memory/index with a wrong secret', async () => {
    process.env[ENV_KEY] = 'the-real-secret';
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/recourse/memory/index`, {
        method: 'POST', headers: { 'x-api-secret': 'wrong' },
      });
      expect(res.status).toBe(401);
    });
  }, 60_000);

  it('refuses POST /memory/index with no credentials at all', async () => {
    process.env[ENV_KEY] = 'the-real-secret';
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/recourse/memory/index`, { method: 'POST' });
      expect(res.status).toBe(401);
    });
  }, 60_000);

  it('refuses POST /fleet/memory unauthenticated', async () => {
    process.env[ENV_KEY] = 'the-real-secret';
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/recourse/fleet/memory`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'lesson', id: 'x', text: 'y' }),
      });
      expect(res.status).toBe(401);
    });
  }, 60_000);

  it('still serves GET /memory/status without auth (reads are never gated)', async () => {
    process.env[ENV_KEY] = 'the-real-secret';
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/recourse/memory/status`);
      expect(res.ok).toBe(true);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
      expect(body.status.docs).toBe(3);
    });
  }, 60_000);
});