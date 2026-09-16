/**
 * publishing.ts — the public publishing + paywall router.
 *
 * Public reads serve published `public` articles; `subscriber` articles require
 * a paid plan, proven either by an operator-written access token or by a Stripe
 * checkout session that can be claimed for a token. Operator writes (create,
 * publish, targets, issue access) sit behind the shared mutation secret.
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  canViewArticle,
  isPaidPlan,
  publishAllPublished,
  publishArticle,
  signAccessToken,
  viewerFromToken,
  type ArticleStore,
  type DeliveryLog,
  type PublishTargetStore,
  type PublicArticle,
  type Viewer,
} from '../lib/publishing/index.js';
import type { TenantStore } from '../lib/auth/tenants.js';
import { hasValidMutationSecret } from '../lib/mutationAuth.js';
import { getPlan, loadPlans } from '../lib/billing/plans.js';
import { createCheckoutSession, retrieveCheckoutSession, stripeConfigured } from '../lib/billing/stripe.js';
import type { PublishContext, FetchLike } from '../lib/publishing/targets.js';

export interface PublishingRouterDeps {
  store: ArticleStore;
  targets: PublishTargetStore;
  log: DeliveryLog;
  tenants: TenantStore;
  requireMutationAuth: (req: Request, res: Response) => boolean;
  globalLensPublish?: PublishContext['globalLensPublish'];
  fetchImpl?: FetchLike;
  planDir?: string;
}

function presentedToken(req: Request): string | undefined {
  const header = req.headers['x-access-token'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  if (typeof req.query.token === 'string' && req.query.token) return req.query.token;
  return undefined;
}

function viewerOf(req: Request): Viewer | undefined {
  if (hasValidMutationSecret(req)) return { scopes: ['admin'] };
  return viewerFromToken(presentedToken(req));
}

function publicView(a: PublicArticle) {
  return {
    slug: a.slug,
    title: a.title,
    summary: a.summary,
    tags: a.tags,
    visibility: a.visibility,
    publishedAt: a.publishedAt,
    updatedAt: a.updatedAt,
    contentHash: a.contentHash,
    author: a.author,
  };
}

export function createPublishingRouter(deps: PublishingRouterDeps): Router {
  const router = Router();
  const ctx: PublishContext = { fetchImpl: deps.fetchImpl, globalLensPublish: deps.globalLensPublish };

  // --- Public reads -------------------------------------------------------
  router.get('/articles', (_req, res) => {
    res.json({ success: true, articles: deps.store.publicList().map(publicView) });
  });

  router.get('/articles/:slug', (req, res) => {
    const article = deps.store.get(req.params.slug);
    if (!article || article.publishedAt === undefined) {
      res.status(404).json({ success: false, error: 'article not found' });
      return;
    }
    const viewer = viewerOf(req);
    const entitlement = canViewArticle(article, viewer, deps.planDir);
    if (!entitlement.canView) {
      res.status(402).json({
        success: false,
        error: entitlement.reason,
        requiredPlanId: entitlement.requiredPlanId,
        visibility: article.visibility,
      });
      return;
    }
    res.json({ success: true, article });
  });

  // --- Public paywall: subscribe + claim a reader token -------------------
  router.get('/plans', (_req, res) => {
    const plans = loadPlans(deps.planDir)
      .filter(isPaidPlan)
      .map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        priceCents: p.priceCents,
        currency: p.currency,
        interval: p.interval,
        features: p.features,
        purchasable: Boolean(p.stripePriceId),
      }));
    res.json({ success: true, plans });
  });

  router.post('/subscribe', async (req, res) => {
    const body = req.body ?? {};
    const plan = getPlan(String(body.planId ?? ''), deps.planDir);
    if (!isPaidPlan(plan) || !plan.stripePriceId) {
      res.status(400).json({ success: false, error: `plan "${plan.id}" is not a purchasable subscriber plan` });
      return;
    }
    if (!stripeConfigured()) {
      res.status(503).json({ success: false, error: 'stripe not configured (STRIPE_SECRET_KEY unset)' });
      return;
    }
    let tenant = typeof body.tenantId === 'string' ? deps.tenants.get(body.tenantId) : undefined;
    if (!tenant) tenant = deps.tenants.create({ name: String(body.email ?? 'subscriber'), planId: 'free' });
    const base = process.env.RECOURSE_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    const result = await createCheckoutSession({
      tenantId: tenant.id,
      plan,
      successUrl: String(body.successUrl || `${base}/publishing/success?session_id={CHECKOUT_SESSION_ID}`),
      cancelUrl: String(body.cancelUrl || `${base}/publishing/cancel`),
      customerEmail: body.email ? String(body.email) : undefined,
      stripeCustomerId: tenant.stripeCustomerId,
    });
    if (!result.ok) {
      res.status(502).json({ success: false, error: result.error });
      return;
    }
    res.json({ success: true, tenantId: tenant.id, sessionId: result.id, url: result.url });
  });

  router.get('/access', (req, res) => {
    const token = presentedToken(req);
    const viewer = viewerFromToken(token, {});
    if (!viewer) {
      res.status(401).json({ success: false, error: 'invalid or expired access token' });
      return;
    }
    res.json({ success: true, viewer });
  });

  router.post('/access/claim', async (req, res) => {
    if (!stripeConfigured()) {
      res.status(503).json({ success: false, error: 'stripe not configured' });
      return;
    }
    const sessionId = String(req.body?.sessionId ?? '');
    if (!sessionId) {
      res.status(400).json({ success: false, error: 'sessionId is required' });
      return;
    }
    const result = await retrieveCheckoutSession(sessionId, { fetchImpl: deps.fetchImpl });
    if (!result.ok || !result.session) {
      res.status(502).json({ success: false, error: result.error || 'could not retrieve checkout session' });
      return;
    }
    if (result.session.paymentStatus !== 'paid') {
      res.status(402).json({ success: false, error: `checkout not paid (status ${result.session.paymentStatus ?? 'unknown'})` });
      return;
    }
    const { tenantId, planId } = result.session;
    if (!tenantId || !planId) {
      res.status(400).json({ success: false, error: 'checkout session is missing tenant/plan metadata' });
      return;
    }
    try {
      const token = signAccessToken({ tenantId, planId });
      res.json({ success: true, token, tenantId, planId });
    } catch (e: any) {
      res.status(503).json({ success: false, error: e?.message || 'access token signing unavailable' });
    }
  });

  // --- Operator writes ----------------------------------------------------
  router.post('/articles', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    try {
      const article = deps.store.save(req.body ?? {});
      res.status(201).json({ success: true, article });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  router.post('/articles/:slug/publish', async (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const run = await publishArticle(req.params.slug, { store: deps.store, targets: deps.targets, log: deps.log, ctx });
    if (!run) {
      res.status(404).json({ success: false, error: 'article not found' });
      return;
    }
    res.json({ success: run.failed === 0, run });
  });

  router.post('/articles/publish-all', async (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const runs = await publishAllPublished({ store: deps.store, targets: deps.targets, log: deps.log, ctx });
    res.json({ success: true, runs });
  });

  router.delete('/articles/:slug', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    res.json({ success: true, removed: deps.store.remove(req.params.slug) });
  });

  router.get('/targets', (_req, res) => {
    res.json({ success: true, targets: deps.targets.list() });
  });

  router.post('/targets', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    try {
      const target = deps.targets.upsert(req.body ?? {});
      res.status(201).json({ success: true, target });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  router.post('/targets/:id/toggle', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const target = deps.targets.setEnabled(req.params.id, Boolean(req.body?.enabled));
    if (!target) {
      res.status(404).json({ success: false, error: 'target not found' });
      return;
    }
    res.json({ success: true, target });
  });

  router.delete('/targets/:id', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    res.json({ success: true, removed: deps.targets.remove(req.params.id) });
  });

  router.get('/deliveries', (req, res) => {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 50));
    const slug = typeof req.query.slug === 'string' ? req.query.slug : undefined;
    res.json({ success: true, deliveries: slug ? deps.log.forArticle(slug) : deps.log.recent(limit) });
  });

  return router;
}
