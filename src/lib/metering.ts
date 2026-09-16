/**
 * metering.ts — billing-period aggregation, quota enforcement and the Express
 * middleware that turns an API key into an attributed, quota-checked request.
 *
 * This is the bridge between `usageMeter` (what was consumed) and `plans` (what
 * is allowed). Every authenticated `/v1` request is attributed to a tenant and
 * key, checked against the tenant's monthly quota, and recorded as an
 * `api_request` usage event — so the free tier is bounded and paid tiers are
 * measurable.
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { UsageMeter, UsageSummary } from './usageMeter.js';
import type { ApiKeyStore, ApiKeyRecord } from './auth/apikeys.js';
import type { TenantStore, Tenant } from './auth/tenants.js';
import type { Plan } from './billing/plans.js';
import { getPlan } from './billing/plans.js';

export interface BillingPeriod {
  start: number;
  end: number;
  /** Calendar label, e.g. "2026-09". */
  label: string;
}

/** Calendar-month billing period in UTC, containing `now`. */
export function currentPeriod(now: number = Date.now()): BillingPeriod {
  const d = new Date(now);
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  const label = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  return { start, end, label };
}

/** The billing period immediately before `currentPeriod(now)`. */
export function previousPeriod(now: number = Date.now()): BillingPeriod {
  const d = new Date(now);
  const prev = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1);
  return currentPeriod(prev);
}

/** Resolve a period by label ("current", "previous", or "YYYY-MM"). */
export function periodForLabel(label: string | undefined, now: number = Date.now()): BillingPeriod | null {
  const key = (label ?? 'current').trim().toLowerCase();
  if (!key || key === 'current') return currentPeriod(now);
  if (key === 'previous') return previousPeriod(now);
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  const start = Date.UTC(year, month - 1, 1);
  const end = Date.UTC(year, month, 1);
  return { start, end, label: `${year}-${String(month).padStart(2, '0')}` };
}

export interface QuotaStatus {
  allowed: boolean;
  reason: string;
  planId: string;
  used: { requests: number; tokens: number; cents: number };
  limits: { requests: number; tokens: number; cents: number };
}

/** Pure quota decision over a period summary plus the in-flight request. */
export function checkQuota(plan: Plan, used: UsageSummary, inFlightRequests = 1): QuotaStatus {
  const u = {
    requests: used.requests + (inFlightRequests > 0 ? inFlightRequests : 0),
    tokens: used.totalTokens,
    cents: used.cents,
  };
  const limits = {
    requests: plan.quotas.requestsPerMonth,
    tokens: plan.quotas.tokensPerMonth,
    cents: plan.quotas.centsPerMonth,
  };
  const base = { planId: plan.id, used: u, limits };
  if (limits.requests > 0 && u.requests > limits.requests) {
    return { allowed: false, reason: `request quota exceeded (${u.requests}/${limits.requests} this month)`, ...base };
  }
  if (limits.tokens > 0 && u.tokens > limits.tokens) {
    return { allowed: false, reason: `token quota exceeded (${u.tokens}/${limits.tokens} this month)`, ...base };
  }
  if (limits.cents > 0 && u.cents > limits.cents) {
    return { allowed: false, reason: `spend quota exceeded (${u.cents}c/${limits.cents}c this month)`, ...base };
  }
  return { allowed: true, reason: 'within quota', ...base };
}

export function periodUsage(meter: UsageMeter, tenantId: string, period: BillingPeriod): UsageSummary {
  return meter.summary({ tenantId, since: period.start, until: period.end });
}

/** The full per-tenant usage report surfaced by GET /v1/usage. */
export interface UsageReport {
  tenantId: string;
  planId: string;
  period: BillingPeriod;
  summary: UsageSummary;
  quota: QuotaStatus;
  remaining: { requests: number; tokens: number; cents: number };
}

export function usageReport(
  meter: UsageMeter,
  tenantId: string,
  plan: Plan,
  now: number = Date.now(),
  period?: BillingPeriod,
): UsageReport {
  const p = period ?? currentPeriod(now);
  const summary = periodUsage(meter, tenantId, p);
  const quota = checkQuota(plan, summary, 0);
  return {
    tenantId,
    planId: plan.id,
    period: p,
    summary,
    quota,
    remaining: {
      requests: Math.max(0, plan.quotas.requestsPerMonth - summary.requests),
      tokens: Math.max(0, plan.quotas.tokensPerMonth - summary.totalTokens),
      cents: Number((plan.quotas.centsPerMonth - summary.cents).toFixed(6)),
    },
  };
}

/** Pull the presented API key from `x-api-key` or an `rck_` Bearer token. */
export function apiKeyFromRequest(req: Request): string {
  const header = req.headers['x-api-key'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  const auth = req.headers.authorization;
  if (auth && /^Bearer\s+/i.test(auth)) {
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    if (token) return token;
  }
  return '';
}

export interface AuthenticatedContext {
  tenant: Tenant;
  key: ApiKeyRecord;
  plan: Plan;
}

export interface AuthResult {
  ok: boolean;
  status: number;
  error?: string;
  context?: AuthenticatedContext;
}

/** Authenticate a presented raw key against the key + tenant stores. */
export function authenticateRequest(
  raw: string,
  deps: { keys: ApiKeyStore; tenants: TenantStore; planDir?: string; now?: number },
): AuthResult {
  const verified = deps.keys.verify(raw, deps.now);
  if (!verified.ok || !verified.record) {
    const reason = verified.reason ?? 'unknown';
    const status = reason === 'malformed' || reason === 'unknown' ? 401 : 403;
    return { ok: false, status, error: `api key ${reason}` };
  }
  const tenant = deps.tenants.get(verified.record.tenantId);
  if (!tenant) return { ok: false, status: 403, error: 'tenant not found for key' };
  if (tenant.status !== 'active') return { ok: false, status: 403, error: `tenant ${tenant.status}` };
  return {
    ok: true,
    status: 200,
    context: { tenant, key: verified.record, plan: getPlan(tenant.planId, deps.planDir) },
  };
}

/** Attach `res.locals.auth` (see `AuthenticatedContext`) or fail with 401/403. */
export function createAuthMiddleware(deps: {
  keys: ApiKeyStore;
  tenants: TenantStore;
  planDir?: string;
}): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const raw = apiKeyFromRequest(req);
    if (!raw) {
      res.status(401).json({ success: false, error: 'missing api key (x-api-key or Authorization: Bearer)' });
      return;
    }
    const result = authenticateRequest(raw, deps);
    if (!result.ok || !result.context) {
      res.status(result.status).json({ success: false, error: result.error ?? 'unauthorized' });
      return;
    }
    res.locals.auth = result.context;
    deps.keys.touch(result.context.key.id);
    next();
  };
}

/** Read the authenticated context set by `createAuthMiddleware`. */
export function authContext(res: Response): AuthenticatedContext | undefined {
  return res.locals.auth as AuthenticatedContext | undefined;
}

/**
 * Enforce the tenant's monthly quota. Records one `api_request` event for the
 * in-flight request when it is admitted. Downstream routes record their own
 * model/tool usage against the same tenant.
 */
export function createQuotaMiddleware(deps: { meter: UsageMeter }): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const ctx = authContext(res);
    if (!ctx) {
      res.status(500).json({ success: false, error: 'quota middleware requires auth middleware' });
      return;
    }
    const summary = periodUsage(deps.meter, ctx.tenant.id, currentPeriod());
    const decision = checkQuota(ctx.plan, summary, 1);
    if (!decision.allowed) {
      res.status(429).json({
        success: false,
        error: decision.reason,
        planId: decision.planId,
        used: decision.used,
        limits: decision.limits,
      });
      return;
    }
    try {
      deps.meter.record({
        tenantId: ctx.tenant.id,
        apiKeyId: ctx.key.id,
        kind: 'api_request',
        description: `${req.method} ${req.path}`,
        metadata: { method: req.method, path: req.path },
      });
    } catch {
      // Metering must never take down a request it just admitted.
    }
    next();
  };
}
