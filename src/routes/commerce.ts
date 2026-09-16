/**
 * commerce.ts — operator surface for the commercial layer. Where `/v1` is the
 * customer-facing, API-key-authenticated product, this router is the internal
 * control plane (guarded by the shared mutation secret) used to bootstrap the
 * first tenant, mint/rotate keys, inspect usage and view plans.
 *
 * Reads are left open like the other operator routers; every write goes behind
 * the injected `requireMutationAuth` guard.
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import type { UsageMeter } from '../lib/usageMeter.js';
import type { ApiKeyStore } from '../lib/auth/apikeys.js';
import type { TenantStore } from '../lib/auth/tenants.js';
import type { OutcomeLedger } from '../lib/outcomeFeedback.js';
import { computeOutcomeReward } from '../lib/outcomeFeedback.js';
import { periodForLabel, usageReport } from '../lib/metering.js';
import { getPlan, loadPlans } from '../lib/billing/plans.js';

export interface CommerceRouterDeps {
  tenants: TenantStore;
  keys: ApiKeyStore;
  meter: UsageMeter;
  outcome?: OutcomeLedger;
  planDir?: string;
  requireMutationAuth: (req: Request, res: Response) => boolean;
}

export function createCommerceRouter(deps: CommerceRouterDeps): Router {
  const router = Router();

  router.get('/plans', (_req, res) => {
    res.json({ success: true, plans: loadPlans(deps.planDir) });
  });

  router.get('/tenants', (_req, res) => {
    res.json({
      success: true,
      tenants: deps.tenants.list().map((t) => ({ ...t, plan: getPlan(t.planId, deps.planDir).name })),
    });
  });

  router.post('/tenants', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const body = req.body ?? {};
    const tenant = deps.tenants.create({ name: body.name, planId: body.planId });
    res.status(201).json({ success: true, tenant });
  });

  router.get('/keys', (req, res) => {
    const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : undefined;
    res.json({ success: true, keys: deps.keys.list(tenantId) });
  });

  router.post('/keys', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const body = req.body ?? {};
    const tenantId = String(body.tenantId ?? '');
    if (!deps.tenants.get(tenantId)) {
      res.status(404).json({ success: false, error: `tenant not found: ${tenantId}` });
      return;
    }
    const scopes = Array.isArray(body.scopes) ? body.scopes.map(String) : undefined;
    const expiresAt = Number(body.expiresAt);
    const created = deps.keys.create({
      tenantId,
      name: body.name,
      scopes,
      expiresAt: Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : undefined,
    });
    res.status(201).json({ success: true, key: created.record, raw: created.raw, warning: 'store the raw key now; it is not shown again' });
  });

  router.post('/keys/:id/rotate', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const rotated = deps.keys.rotate(req.params.id);
    if (!rotated) {
      res.status(409).json({ success: false, error: 'key not found or already revoked' });
      return;
    }
    res.json({ success: true, key: rotated.record, raw: rotated.raw, warning: 'store the raw key now; it is not shown again' });
  });

  router.delete('/keys/:id', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const revoked = deps.keys.revoke(req.params.id);
    if (!revoked) {
      res.status(404).json({ success: false, error: 'key not found' });
      return;
    }
    res.json({ success: true, key: revoked });
  });

  router.get('/usage', (req, res) => {
    const tenantId = String(req.query.tenantId ?? '');
    const tenant = deps.tenants.get(tenantId);
    if (!tenant) {
      res.status(404).json({ success: false, error: `tenant not found: ${tenantId}` });
      return;
    }
    const period = periodForLabel(typeof req.query.period === 'string' ? req.query.period : undefined);
    if (!period) {
      res.status(400).json({ success: false, error: 'period must be current, previous, or YYYY-MM' });
      return;
    }
    res.json({ success: true, report: usageReport(deps.meter, tenant.id, getPlan(tenant.planId, deps.planDir), Date.now(), period) });
  });

  router.get('/outcome', (req, res) => {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 20));
    res.json({ success: true, signals: deps.outcome?.history(limit) ?? [], reward: deps.outcome?.reward(5) ?? null });
  });

  router.post('/outcome', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
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
      notes: body.notes ? String(body.notes) : undefined,
    });
    res.status(201).json({ success: true, signal, components });
  });

  return router;
}
