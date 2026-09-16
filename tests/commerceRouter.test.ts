import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Request, Response } from 'express';
import { createCommerceRouter } from '../src/routes/commerce';
import { openUsageMeter } from '../src/lib/usageMeter';
import { openTenantStore } from '../src/lib/auth/tenants';
import { openApiKeyStore } from '../src/lib/auth/apikeys';
import { openOutcomeLedger } from '../src/lib/outcomeFeedback';

const dirs: string[] = [];
const servers: http.Server[] = [];
function freshDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-commerce-'));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

async function setup() {
  const dir = freshDir();
  const tenants = openTenantStore(path.join(dir, 'tenants.json'));
  const keys = openApiKeyStore(path.join(dir, 'keys.json'));
  const meter = openUsageMeter(path.join(dir, 'usage.jsonl'));
  const outcome = openOutcomeLedger(path.join(dir, 'outcomes.json'));
  const guard = (req: Request, res: Response) => {
    if (req.headers['x-secret'] === 's') return true;
    res.status(401).json({ success: false, error: 'unauthorized' });
    return false;
  };
  const app = express();
  app.use(express.json());
  app.use('/api/recourse/commerce', createCommerceRouter({ tenants, keys, meter, outcome, requireMutationAuth: guard }));
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  return { base, tenants, keys };
}

const post = (url: string, body: unknown, secret?: string) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(secret ? { 'x-secret': secret } : {}) }, body: JSON.stringify(body) });

describe('commerce control plane', () => {
  it('bootstraps a tenant and mints a key behind the guard', async () => {
    const { base } = await setup();
    expect((await (await fetch(`${base}/api/recourse/commerce/plans`)).json()).plans.length).toBeGreaterThan(0);

    const denied = await post(`${base}/api/recourse/commerce/tenants`, { name: 'x' });
    expect(denied.status).toBe(401);

    const created = await (await post(`${base}/api/recourse/commerce/tenants`, { name: 'Acme', planId: 'pro' }, 's')).json();
    expect(created.tenant.planId).toBe('pro');

    const keyRes = await post(`${base}/api/recourse/commerce/keys`, { tenantId: created.tenant.id, name: 'ops', scopes: ['admin'] }, 's');
    expect(keyRes.status).toBe(201);
    const keyBody = await keyRes.json();
    expect(keyBody.raw).toMatch(/^rck_/);

    const keys = await (await fetch(`${base}/api/recourse/commerce/keys?tenantId=${created.tenant.id}`)).json();
    expect(keys.keys).toHaveLength(1);
  });

  it('404s a key for an unknown tenant', async () => {
    const { base } = await setup();
    const res = await post(`${base}/api/recourse/commerce/keys`, { tenantId: 'ghost' }, 's');
    expect(res.status).toBe(404);
  });

  it('returns a usage report and records outcomes', async () => {
    const { base, tenants } = await setup();
    const t = tenants.create({ name: 'Acme' });
    const report = await (await fetch(`${base}/api/recourse/commerce/usage?tenantId=${t.id}`)).json();
    expect(report.report.tenantId).toBe(t.id);

    const bad = await fetch(`${base}/api/recourse/commerce/usage?tenantId=ghost`);
    expect(bad.status).toBe(404);

    const outcomeRes = await post(`${base}/api/recourse/commerce/outcome`, { scorecardDelta: 200, notes: 'shipped' }, 's');
    expect(outcomeRes.status).toBe(201);
    expect((await outcomeRes.json()).signal.reward).toBe(1);

    const listed = await (await fetch(`${base}/api/recourse/commerce/outcome`)).json();
    expect(listed.signals).toHaveLength(1);
    expect(listed.reward).toBe(1);
  });
});
