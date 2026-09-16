import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { Request, Response } from 'express';
import { createSecurityRouter, type SecurityBridge } from '../src/routes/security';

const servers: http.Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

function bridge(overrides: Partial<SecurityBridge> = {}): SecurityBridge {
  return {
    health: async () => ({ ok: true, available: true }),
    catalog: async (o: any) => ({ ok: true, count: 0, tools: [], opts: o }),
    categories: async () => ({ ok: true, categories: [] }),
    recommend: async (goal: string) => ({ ok: true, goal, tools: [] }),
    scopeCheck: async (target: string) => ({ ok: true, target, inScope: true }),
    engagement: async (o: any) => ({ ok: true, authorized: o.authorized }),
    engageEnabled: () => false,
    ...overrides,
  } as SecurityBridge;
}

async function setup(b: SecurityBridge, authed = true) {
  const guard = (req: Request, res: Response) => {
    if (req.headers['x-secret'] === 's') return true;
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return false;
  };
  const app = express();
  app.use(express.json());
  app.use('/api/recourse/security', createSecurityRouter({ requireMutationAuth: guard, bridge: b }));
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const headers = authed ? { 'Content-Type': 'application/json', 'x-secret': 's' } : { 'Content-Type': 'application/json' };
  return { base, headers };
}

describe('security router (extracted)', () => {
  it('serves health and catalog', async () => {
    const { base } = await setup(bridge());
    expect(((await (await fetch(`${base}/api/recourse/security/hackingtool/health`)).json()) as any).ok).toBe(true);
    const catalog = (await (await fetch(`${base}/api/recourse/security/hackingtool/catalog?search=recon`)).json()) as any;
    expect(catalog.ok).toBe(true);
    expect(catalog.opts.search).toBe('recon');
  });

  it('requires a goal / target for recommend and scope-check', async () => {
    const { base } = await setup(bridge());
    expect((await fetch(`${base}/api/recourse/security/hackingtool/recommend`)).status).toBe(400);
    expect((await fetch(`${base}/api/recourse/security/hackingtool/scope-check`)).status).toBe(400);
    const r = (await (await fetch(`${base}/api/recourse/security/hackingtool/recommend?goal=scan`)).json()) as any;
    expect(r.goal).toBe('scan');
  });

  it('fail-closes the engagement route without the secret', async () => {
    const { base, headers } = await setup(bridge(), false);
    const res = await fetch(`${base}/api/recourse/security/hackingtool/engagement`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ authorized: true, targets: ['example.com'] }),
    });
    expect(res.status).toBe(401);
  });

  it('maps engagement outcomes to status codes honestly', async () => {
    for (const [result, expected] of [
      [{ ok: true }, 200],
      [{ ok: false, refused: true }, 403],
      [{ ok: false }, 503],
    ] as const) {
      const { base, headers } = await setup(bridge({ engagement: async () => result as any }));
      const res = await fetch(`${base}/api/recourse/security/hackingtool/engagement`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ authorized: true, targets: ['example.com'] }),
      });
      expect(res.status).toBe(expected);
      expect(((await res.json()) as any).engageEnabled).toBe(false);
    }
  });
});
