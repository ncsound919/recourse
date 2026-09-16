import { describe, it, expect, afterEach, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createV1Router } from '../src/routes/v1';
import { openUsageMeter } from '../src/lib/usageMeter';
import { openTenantStore } from '../src/lib/auth/tenants';
import { openApiKeyStore } from '../src/lib/auth/apikeys';
import { openOutcomeLedger } from '../src/lib/outcomeFeedback';

const dirs: string[] = [];
const servers: http.Server[] = [];
function freshDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-v1-'));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

async function setup() {
  const dir = freshDir();
  const tenants = openTenantStore(path.join(dir, 'tenants.json'));
  const keys = openApiKeyStore(path.join(dir, 'keys.json'));
  const meter = openUsageMeter(path.join(dir, 'usage.jsonl'));
  const outcome = openOutcomeLedger(path.join(dir, 'outcomes.json'));
  const runLearnerEpisode = vi.fn(async (score?: number) => ({ score }));

  const tenant = tenants.create({ name: 'Acme', planId: 'pro' });
  const admin = keys.create({ tenantId: tenant.id, scopes: ['admin', 'billing', 'read', 'write'], name: 'admin' });
  const readOnly = keys.create({ tenantId: tenant.id, scopes: ['read'], name: 'ro' });

  const router = createV1Router({
    meter, keys, tenants, outcome, runLearnerEpisode,
    planDir: path.join(process.cwd(), 'data', 'plans'),
    statusInfo: () => ({ version: 'test' }),
  });
  const app = express();
  app.use(express.json({
    verify: (req, _res, buf) => { (req as any).rawBody = buf.toString('utf-8'); },
  }));
  app.use('/v1', router);
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  return { base, tenant, admin, readOnly, meter, tenants, outcome, runLearnerEpisode };
}

const get = (base: string, p: string, key?: string) =>
  fetch(`${base}${p}`, { headers: key ? { 'x-api-key': key } : {} });
const post = (base: string, p: string, body: unknown, key?: string) =>
  fetch(`${base}${p}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { 'x-api-key': key } : {}) },
    body: JSON.stringify(body),
  });

describe('v1 router', () => {
  it('serves public status and plans without a key', async () => {
    const { base } = await setup();
    const status = await (await get(base, '/v1/status')).json();
    expect(status.success).toBe(true);
    expect(status.api).toBe('v1');
    expect(status.version).toBe('test');
    expect(status.plans).toContain('pro');

    const plans = await (await get(base, '/v1/plans')).json();
    expect(plans.plans.map((p: any) => p.id)).toContain('free');
  });

  it('requires a key and returns the tenant identity', async () => {
    const { base, tenant, admin } = await setup();
    expect((await get(base, '/v1/me')).status).toBe(401);

    const res = await get(base, '/v1/me', admin.raw);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenant.id).toBe(tenant.id);
    expect(body.plan.id).toBe('pro');
    expect(body.scopes).toContain('admin');
  });

  it('enforces scopes on key management', async () => {
    const { base, admin, readOnly } = await setup();
    const created = await post(base, '/v1/keys', { name: 'new', scopes: ['read'] }, admin.raw);
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.raw).toMatch(/^rck_/);
    expect(createdBody.key.name).toBe('new');

    const forbidden = await post(base, '/v1/keys', { name: 'nope' }, readOnly.raw);
    expect(forbidden.status).toBe(403);
  });

  it('rotates and revokes keys', async () => {
    const { base, admin } = await setup();
    const created = await (await post(base, '/v1/keys', { name: 'victim', scopes: ['read'] }, admin.raw)).json();
    const rotate = await post(base, `/v1/keys/${created.key.id}/rotate`, {}, admin.raw);
    expect(rotate.status).toBe(200);
    const rotated = await rotate.json();
    expect(rotated.raw).toMatch(/^rck_/);

    // The rotated-from key is now revoked.
    expect((await get(base, '/v1/me', created.raw)).status).toBe(403);

    const del = await fetch(`${base}/v1/keys/${rotated.key.id}`, { method: 'DELETE', headers: { 'x-api-key': admin.raw } });
    expect(del.status).toBe(200);
    expect((await del.json()).key.revokedAt).toBeTruthy();
  });

  it('reports usage for the tenant', async () => {
    const { base, admin } = await setup();
    const res = await get(base, '/v1/usage', admin.raw);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.report.tenantId).toBeTruthy();
    expect(body.report.period.label).toMatch(/^\d{4}-\d{2}$/);
    const bad = await get(base, '/v1/usage?period=bogus', admin.raw);
    expect(bad.status).toBe(400);
  });

  it('records and reads outcome signals', async () => {
    const { base, admin } = await setup();
    const created = await post(base, '/v1/outcome', { scorecardDelta: 100, revenueDeltaCents: 5000, targetRevenueCents: 10000 }, admin.raw);
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body.signal.reward).toBeCloseTo(0.75, 4); // (0.75 scorecard + 0.75 revenue)/2

    const latest = await (await get(base, '/v1/outcome', admin.raw)).json();
    expect(latest.latest.scorecardDelta).toBe(100);
  });

  it('runs a learner episode with the outcome reward', async () => {
    const { base, admin, runLearnerEpisode } = await setup();
    await post(base, '/v1/outcome', { revenueDeltaCents: 10000, targetRevenueCents: 10000 }, admin.raw);
    const res = await post(base, '/v1/learner/episode', {}, admin.raw);
    expect(res.status).toBe(200);
    expect(runLearnerEpisode).toHaveBeenCalledTimes(1);
    expect(runLearnerEpisode.mock.calls[0][0]).toBe(1);
  });

  it('returns 503 for checkout when stripe is unconfigured', async () => {
    const { base, admin } = await setup();
    const res = await post(base, '/v1/billing/checkout', { planId: 'pro' }, admin.raw);
    expect(res.status).toBe(503);
  });

  it('verifies stripe webhooks and applies subscription changes', async () => {
    const { base, tenant, tenants } = await setup();
    expect((await post(base, '/v1/billing/webhook', {})).status).toBe(503);

    const secret = 'whsec_test';
    process.env.STRIPE_WEBHOOK_SECRET = secret;
    const payload = JSON.stringify({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { metadata: { tenantId: tenant.id, planId: 'free' }, customer: 'cus_1' } },
    });
    expect((await post(base, '/v1/billing/webhook', JSON.parse(payload))).status).toBe(400);

    const t = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
    const res = await fetch(`${base}/v1/billing/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': `t=${t},v1=${sig}` },
      body: payload,
    });
    expect(res.status).toBe(200);
    expect(tenants.get(tenant.id)!.planId).toBe('free');
  });
});
