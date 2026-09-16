import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Request, Response } from 'express';
import {
  openArticleStore,
  validateArticleInput,
  slugifyTitle,
  articleContentHash,
  renderArticleMarkdown,
  openPublishTargetStore,
  openDeliveryLog,
  deliverToTarget,
  publishArticleToTargets,
  canViewArticle,
  cheapestPaidPlan,
  isPaidPlan,
  signAccessToken,
  verifyAccessToken,
  viewerFromToken,
} from '../src/lib/publishing/index';
import { getPlan } from '../src/lib/billing/plans';
import { createPublishingRouter } from '../src/routes/publishing';

const dirs: string[] = [];
const servers: http.Server[] = [];
function freshDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-pub-'));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
  delete process.env.RECOURSE_API_SECRET;
  delete process.env.RECOURSE_PUBLISH_ACCESS_SECRET;
});

const sample = { title: 'Hello World', body: 'Body text', summary: 'sum', tags: ['b', 'a'] };

describe('article store', () => {
  it('validates input and derives a slug + content hash', () => {
    expect(slugifyTitle('Hello, World!')).toBe('hello-world');
    expect(validateArticleInput({ title: '', body: '' }).errors).toHaveLength(2);
    const v = validateArticleInput(sample);
    expect(v.ok).toBe(true);
    expect(v.article!.slug).toBe('hello-world');
    const h1 = articleContentHash(sample);
    const h2 = articleContentHash({ ...sample, body: 'changed' });
    expect(h1).not.toBe(h2);
    // tag order does not matter
    expect(h1).toBe(articleContentHash({ ...sample, tags: ['a', 'b'] }));
  });

  it('saves drafts, publishes explicitly and lists public articles', () => {
    const store = openArticleStore(freshDir());
    const draft = store.save(sample);
    expect(draft.publishedAt).toBeUndefined();
    expect(store.publicList()).toHaveLength(0);

    const published = store.publish(draft.slug)!;
    expect(published.publishedAt).toBeTypeOf('number');
    expect(store.publicList()).toHaveLength(1);

    const updated = store.save({ ...sample, body: 'v2' });
    expect(updated.id).toBe(draft.id);
    expect(updated.publishedAt).toBe(published.publishedAt);
    expect(store.get(draft.slug)!.contentHash).not.toBe(published.contentHash);

    expect(renderArticleMarkdown(updated)).toContain('# Hello World');
    expect(store.remove(draft.slug)).toBe(true);
  });
});

describe('publish targets', () => {
  it('validates and manages targets', () => {
    const store = openPublishTargetStore(path.join(freshDir(), 'targets.json'));
    expect(() => store.upsert({ kind: 'webhook' })).toThrow(/config.url/);
    const file = store.upsert({ kind: 'file', name: 'blog', config: { dir: freshDir() } });
    expect(file.enabled).toBe(true);
    expect(store.enabled()).toHaveLength(1);
    store.setEnabled(file.id, false);
    expect(store.enabled()).toHaveLength(0);
    expect(store.remove(file.id)).toBe(true);
  });

  it('delivers to a file target and records idempotency', async () => {
    const out = freshDir();
    const store = openArticleStore(freshDir());
    const article = store.publish(store.save(sample).slug)!;
    const target = { id: 't1', kind: 'file' as const, name: 'blog', enabled: true, config: { dir: out }, createdAt: 0 };
    const delivery = await deliverToTarget(target, article);
    expect(delivery.ok).toBe(true);
    expect(fs.readFileSync(path.join(out, 'hello-world.md'), 'utf-8')).toContain('# Hello World');

    const log = openDeliveryLog(path.join(freshDir(), 'deliveries.jsonl'));
    log.record(delivery);
    const run = await publishArticleToTargets(article, [target], log, {});
    expect(run.skipped).toBe(1);
    expect(run.delivered).toBe(0);
  });

  it('delivers to a webhook honestly', async () => {
    const store = openArticleStore(freshDir());
    const article = store.publish(store.save(sample).slug)!;
    const target = { id: 'w1', kind: 'webhook' as const, name: 'cms', enabled: true, config: { url: 'http://cms' }, createdAt: 0 };
    const okFetch = (async () => ({ ok: true, status: 201, text: async () => JSON.stringify({ id: 'row1' }) })) as unknown as typeof fetch;
    const ok = await deliverToTarget(target, article, { fetchImpl: okFetch });
    expect(ok.ok).toBe(true);
    expect(ok.externalId).toBe('row1');

    const badFetch = (async () => ({ ok: false, status: 500, text: async () => 'boom' })) as unknown as typeof fetch;
    const bad = await deliverToTarget(target, article, { fetchImpl: badFetch });
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/HTTP 500/);
  });

  it('refuses global lens without a publisher', async () => {
    const store = openArticleStore(freshDir());
    const article = store.publish(store.save(sample).slug)!;
    const target = { id: 'g1', kind: 'global_lens' as const, name: 'gl', enabled: true, config: {}, createdAt: 0 };
    const without = await deliverToTarget(target, article);
    expect(without.ok).toBe(false);
    const withPub = await deliverToTarget(target, article, { globalLensPublish: async () => ({ ok: true, inserted: true }) });
    expect(withPub.ok).toBe(true);
  });
});

describe('paywall entitlements', () => {
  const article = (visibility: 'public' | 'subscriber' | 'private') => ({
    id: 'a', slug: 'a', title: 't', summary: '', body: 'b', tags: [], visibility,
    createdAt: 0, updatedAt: 0, publishedAt: 0, contentHash: 'x',
  });

  it('gates by visibility and plan', () => {
    expect(canViewArticle(article('public') as any).canView).toBe(true);
    expect(canViewArticle(article('private') as any).canView).toBe(false);
    expect(canViewArticle(article('private') as any, { scopes: ['admin'] }).canView).toBe(true);
    expect(canViewArticle(article('subscriber') as any).canView).toBe(false);
    expect(canViewArticle(article('subscriber') as any, { planId: 'free' }).canView).toBe(false);
    expect(canViewArticle(article('subscriber') as any, { planId: 'pro' }).canView).toBe(true);
    expect(cheapestPaidPlan()!.id).toBe('pro');
    expect(isPaidPlan(getPlan('free'))).toBe(false);
  });

  it('signs and verifies reader tokens', () => {
    const secret = 'test-secret';
    const token = signAccessToken({ tenantId: 't1', planId: 'pro' }, { secret, now: 1000, ttlMs: 100 });
    expect(verifyAccessToken(token, { secret, now: 1001 }).ok).toBe(true);
    expect(verifyAccessToken(token + 'x', { secret, now: 1001 }).ok).toBe(false);
    expect(verifyAccessToken(token, { secret, now: 2000 }).reason).toBe('expired');
    expect(verifyAccessToken(token, {}).reason).toBe('no_secret');
    expect(viewerFromToken(token, { secret, now: 1001 })!.planId).toBe('pro');
  });
});

describe('publishing router', () => {
  async function setup() {
    process.env.RECOURSE_API_SECRET = 's';
    const dir = freshDir();
    const store = openArticleStore(path.join(dir, 'articles'));
    const targets = openPublishTargetStore(path.join(dir, 'targets.json'));
    const log = openDeliveryLog(path.join(dir, 'deliveries.jsonl'));
    const guard = (req: Request, res: Response) => {
      if (req.headers['x-secret'] === 's') return true;
      res.status(401).json({ success: false, error: 'unauthorized' });
      return false;
    };
    const router = createPublishingRouter({
      store, targets, log,
      tenants: (await import('../src/lib/auth/tenants')).openTenantStore(path.join(dir, 'tenants.json')),
      requireMutationAuth: guard,
    });
    const app = express();
    app.use(express.json());
    app.use('/api/recourse/publishing', router);
    const server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    servers.push(server);
    const base = `http://127.0.0.1:${(server.address() as any).port}`;
    return { base, store };
  }

  it('serves public articles and enforces the paywall', async () => {
    const { base, store } = await setup();
    const created = await fetch(`${base}/api/recourse/publishing/articles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-secret': 's' },
      body: JSON.stringify({ title: 'Paid piece', body: 'secret', visibility: 'subscriber' }),
    });
    expect(created.status).toBe(201);
    const slug = (await created.json()).article.slug;

    // Not published yet -> 404
    expect((await fetch(`${base}/api/recourse/publishing/articles/${slug}`)).status).toBe(404);

    await fetch(`${base}/api/recourse/publishing/articles/${slug}/publish`, { method: 'POST', headers: { 'x-secret': 's' } });
    // Subscriber article without entitlement -> 402
    const denied = await fetch(`${base}/api/recourse/publishing/articles/${slug}`);
    expect(denied.status).toBe(402);
    // Operator (mutation secret) -> allowed
    const allowed = await fetch(`${base}/api/recourse/publishing/articles/${slug}`, { headers: { 'x-api-secret': 's' } });
    expect(allowed.status).toBe(200);

    // Public article appears in the list once published
    await fetch(`${base}/api/recourse/publishing/articles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-secret': 's' },
      body: JSON.stringify({ title: 'Free piece', body: 'public', visibility: 'public' }),
    });
    await fetch(`${base}/api/recourse/publishing/articles/free-piece/publish`, { method: 'POST', headers: { 'x-secret': 's' } });
    const list = await (await fetch(`${base}/api/recourse/publishing/articles`)).json();
    expect(list.articles.some((a: any) => a.slug === 'free-piece')).toBe(true);
    expect(store.get(slug)).toBeTruthy();
  });

  it('guards operator writes', async () => {
    const { base } = await setup();
    const res = await fetch(`${base}/api/recourse/publishing/articles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'x', body: 'y' }),
    });
    expect(res.status).toBe(401);
  });
});
