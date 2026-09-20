/**
 * v1.ts — the versioned, API-key-authenticated, quota-metered commercial router.
 *
 * Wiring order matters and is deliberate:
 *   public (status / plans) -> Stripe-signed webhook -> auth -> quota -> routes.
 * The webhook is reachable without an API key because Stripe authenticates it
 * with its own signature; everything else requires a scoped key and is charged
 * against the tenant's monthly quota.
 *
 * All dependencies are injected so the surface is testable without booting the
 * monolith (see `tests/v1Router.test.ts`).
 */
import { Router } from 'express';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { UsageMeter } from '../lib/usageMeter.js';
import type { ApiKeyStore } from '../lib/auth/apikeys.js';
import { hasScope } from '../lib/auth/apikeys.js';
import type { TenantStore } from '../lib/auth/tenants.js';
import type { Wallet } from '../lib/wallet.js';
import type { OutcomeLedger } from '../lib/outcomeFeedback.js';
import { computeOutcomeReward } from '../lib/outcomeFeedback.js';
import {
  authContext,
  createAuthMiddleware,
  createQuotaMiddleware,
  periodForLabel,
  usageReport,
} from '../lib/metering.js';
import { loadPlans, getPlan } from '../lib/billing/plans.js';
import {
  createCheckoutSession,
  applyStripeOutcome,
  parseStripeEvent,
  stripeConfigured,
  stripeEventOutcome,
  stripeWebhookSecret,
  verifyStripeSignature,
} from '../lib/billing/stripe.js';
import { buildV1OpenApi, V1_ROUTES } from '../lib/openapiV1.js';

export interface V1RouterDeps {
  meter: UsageMeter;
  keys: ApiKeyStore;
  tenants: TenantStore;
  wallet?: Wallet;
  planDir?: string;
  outcome?: OutcomeLedger;
  /** Runs one learner episode against an optional external reward. */
  runLearnerEpisode?: (externalScore?: number) => Promise<unknown>;
  /** Extra status fields (version, uptime) supplied by the host. */
  statusInfo?: () => Record<string, unknown>;
}

function requireScope(scope: string): RequestHandler {
  return (_req: Request, res: Response, next: NextFunction) => {
    const ctx = authContext(res);
    if (!ctx) {
      res.status(500).json({ success: false, error: 'scope middleware requires auth middleware' });
      return;
    }
    if (!hasScope(ctx.key, scope)) {
      res.status(403).json({ success: false, error: `api key lacks required scope "${scope}"` });
      return;
    }
    next();
  };
}

function rawBodyOf(req: Request): string {
  const withRaw = req as Request & { rawBody?: string };
  if (typeof withRaw.rawBody === 'string' && withRaw.rawBody.length) return withRaw.rawBody;
  try {
    return JSON.stringify(req.body ?? {});
  } catch {
    return '';
  }
}

function ownsKey(deps: V1RouterDeps, tenantId: string, keyId: string): boolean {
  const key = deps.keys.get(keyId);
  return Boolean(key && key.tenantId === tenantId);
}

export function createV1Router(deps: V1RouterDeps): Router {
  const router = Router();

  const auth = createAuthMiddleware({ keys: deps.keys, tenants: deps.tenants, planDir: deps.planDir });
  const quota = createQuotaMiddleware({ meter: deps.meter });

  // --- Public -------------------------------------------------------------
  router.get('/status', (_req, res) => {
    res.json({
      success: true,
      api: 'v1',
      stripeConfigured: stripeConfigured(),
      plans: loadPlans(deps.planDir).map((p) => p.id),
      routes: V1_ROUTES.length,
      ...(deps.statusInfo ? deps.statusInfo() : {}),
    });
  });

  router.get('/plans', (_req, res) => {
    res.json({ success: true, plans: loadPlans(deps.planDir) });
  });

  router.get('/openapi.json', (req, res) => {
    const base = process.env.RECOURSE_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    res.json(buildV1OpenApi(base));
  });

  // --- Stripe webhook (signature-authenticated) ---------------------------
  router.post('/billing/webhook', (req, res) => {
    const secret = stripeWebhookSecret();
    if (!secret) {
      res.status(503).json({ success: false, error: 'STRIPE_WEBHOOK_SECRET not configured (fail-closed)' });
      return;
    }
    const raw = rawBodyOf(req);
    const sig = req.headers['stripe-signature'];
    if (!verifyStripeSignature(raw, typeof sig === 'string' ? sig : undefined, secret)) {
      res.status(400).json({ success: false, error: 'invalid stripe signature' });
      return;
    }
    const event = parseStripeEvent(raw);
    if (!event) {
      res.status(400).json({ success: false, error: 'malformed stripe event' });
      return;
    }
    const plans = loadPlans(deps.planDir);
    const outcome = stripeEventOutcome(event, plans);
    const result = applyStripeOutcome(outcome, { tenants: deps.tenants, wallet: deps.wallet, plans });
    res.json({ success: true, received: true, outcome: result });
  });

  // --- Bot chat shim pass-through ----------------------------------------
  // /v1/chat/completions is served by the OpenAI-compatible shim registered at
  // the app level (server.ts, near the provider/chat route). Skip the rest of
  // THIS router (the API-key gate below) and return to the app so that shim runs.
  router.use('/chat/completions', (_req, _res, next) => next('router'));

  // --- Authenticated + metered -------------------------------------------
  router.use(auth);
  router.use(quota);

  router.get('/me', requireScope('read'), (_req, res) => {
    const ctx = authContext(res)!;
    res.json({
      success: true,
      tenant: ctx.tenant,
      key: ctx.key,
      plan: ctx.plan,
      scopes: ctx.key.scopes,
    });
  });

  router.get('/usage', requireScope('read'), (req, res) => {
    const ctx = authContext(res)!;
    const period = periodForLabel(typeof req.query.period === 'string' ? req.query.period : undefined);
    if (!period) {
      res.status(400).json({ success: false, error: 'period must be current, previous, or YYYY-MM' });
      return;
    }
    res.json({ success: true, report: usageReport(deps.meter, ctx.tenant.id, ctx.plan, Date.now(), period) });
  });

  // --- Keys ---------------------------------------------------------------
  router.get('/keys', requireScope('admin'), (_req, res) => {
    const ctx = authContext(res)!;
    res.json({ success: true, keys: deps.keys.list(ctx.tenant.id) });
  });

  router.post('/keys', requireScope('admin'), (req, res) => {
    const ctx = authContext(res)!;
    const body = req.body ?? {};
    const scopes = Array.isArray(body.scopes) ? body.scopes.map(String) : undefined;
    const expiresAt = Number(body.expiresAt);
    const created = deps.keys.create({
      tenantId: ctx.tenant.id,
      name: body.name,
      scopes,
      expiresAt: Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : undefined,
    });
    res.status(201).json({ success: true, key: created.record, raw: created.raw, warning: 'store the raw key now; it is not shown again' });
  });

  router.post('/keys/:id/rotate', requireScope('admin'), (req, res) => {
    const ctx = authContext(res)!;
    if (!ownsKey(deps, ctx.tenant.id, req.params.id)) {
      res.status(404).json({ success: false, error: 'key not found for tenant' });
      return;
    }
    const rotated = deps.keys.rotate(req.params.id);
    if (!rotated) {
      res.status(409).json({ success: false, error: 'key already revoked' });
      return;
    }
    res.json({ success: true, key: rotated.record, raw: rotated.raw, warning: 'store the raw key now; it is not shown again' });
  });

  router.delete('/keys/:id', requireScope('admin'), (req, res) => {
    const ctx = authContext(res)!;
    if (!ownsKey(deps, ctx.tenant.id, req.params.id)) {
      res.status(404).json({ success: false, error: 'key not found for tenant' });
      return;
    }
    const revoked = deps.keys.revoke(req.params.id);
    res.json({ success: true, key: revoked });
  });

  // --- Billing ------------------------------------------------------------
  router.post('/billing/checkout', requireScope('billing'), async (req, res) => {
    const ctx = authContext(res)!;
    if (!stripeConfigured()) {
      res.status(503).json({ success: false, error: 'stripe not configured (STRIPE_SECRET_KEY unset)' });
      return;
    }
    const body = req.body ?? {};
    const plan = getPlan(String(body.planId ?? ''), deps.planDir);
    if (!plan.stripePriceId) {
      res.status(400).json({ success: false, error: `plan "${plan.id}" is not purchasable (no stripePriceId)` });
      return;
    }
    const base = process.env.RECOURSE_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    const result = await createCheckoutSession({
      tenantId: ctx.tenant.id,
      plan,
      successUrl: String(body.successUrl || `${base}/billing/success`),
      cancelUrl: String(body.cancelUrl || `${base}/billing/cancel`),
      customerEmail: body.email ? String(body.email) : undefined,
      stripeCustomerId: ctx.tenant.stripeCustomerId,
    });
    if (!result.ok) {
      res.status(502).json({ success: false, error: result.error });
      return;
    }
    res.json({ success: true, sessionId: result.id, url: result.url });
  });

  // --- Outcome feedback -> learner ---------------------------------------
  router.get('/outcome', requireScope('read'), (_req, res) => {
    const latest = deps.outcome?.latest();
    res.json({
      success: true,
      latest: latest ?? null,
      reward: deps.outcome?.reward(5) ?? null,
    });
  });

  router.post('/outcome', requireScope('write'), (req, res) => {
    const ctx = authContext(res)!;
    if (!deps.outcome) {
      res.status(503).json({ success: false, error: 'outcome ledger not configured' });
      return;
    }
    const body = req.body ?? {};
    const scorecardDelta = Number(body.scorecardDelta);
    const revenueDeltaCents = Number(body.revenueDeltaCents);
    const components = computeOutcomeReward({
      scorecardDelta: Number.isFinite(scorecardDelta) ? scorecardDelta : undefined,
      revenueDeltaCents: Number.isFinite(revenueDeltaCents) ? revenueDeltaCents : undefined,
      targetRevenueCents: Number(body.targetRevenueCents) || undefined,
    });
    const signal = deps.outcome.record({
      source: typeof body.source === 'string' ? body.source : 'manual',
      reward: components.reward,
      scorecardDelta: Number.isFinite(scorecardDelta) ? scorecardDelta : undefined,
      revenueDeltaCents: Number.isFinite(revenueDeltaCents) ? revenueDeltaCents : undefined,
      tenantId: ctx.tenant.id,
      notes: body.notes ? String(body.notes) : undefined,
    });
    res.status(201).json({ success: true, signal, components });
  });

  router.post('/learner/episode', requireScope('write'), async (req, res) => {
    if (!deps.runLearnerEpisode) {
      res.status(503).json({ success: false, error: 'learner not configured' });
      return;
    }
    const body = req.body ?? {};
    const explicit = Number(body.externalScore);
    const externalScore = Number.isFinite(explicit) ? explicit : deps.outcome?.reward(5);
    const report = await deps.runLearnerEpisode(externalScore);
    res.json({ success: true, externalScore: externalScore ?? null, report });
  });

  return router;
}
