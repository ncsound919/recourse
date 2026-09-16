import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openUsageMeter } from '../src/lib/usageMeter';
import { openTenantStore } from '../src/lib/auth/tenants';
import { openApiKeyStore } from '../src/lib/auth/apikeys';
import {
  currentPeriod,
  previousPeriod,
  periodForLabel,
  checkQuota,
  usageReport,
  authenticateRequest,
  createAuthMiddleware,
  createQuotaMiddleware,
  apiKeyFromRequest,
} from '../src/lib/metering';
import { FREE_PLAN, type Plan } from '../src/lib/billing/plans';

const dirs: string[] = [];
function freshDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-metering-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

function mockRes() {
  const res: any = {
    locals: {},
    statusCode: 200,
    body: undefined,
    status(code: number) { res.statusCode = code; return res; },
    json(payload: unknown) { res.body = payload; return res; },
  };
  return res;
}

const PLAN: Plan = { ...FREE_PLAN, quotas: { requestsPerMonth: 3, tokensPerMonth: 100, centsPerMonth: 10 } };

describe('billing periods', () => {
  it('computes the UTC calendar month and previous month', () => {
    const now = Date.UTC(2026, 8, 16, 12, 0, 0); // 2026-09-16
    const p = currentPeriod(now);
    expect(p.label).toBe('2026-09');
    expect(p.start).toBe(Date.UTC(2026, 8, 1));
    expect(p.end).toBe(Date.UTC(2026, 9, 1));
    expect(previousPeriod(now).label).toBe('2026-08');
  });

  it('resolves period labels', () => {
    const now = Date.UTC(2026, 0, 15);
    expect(periodForLabel(undefined, now)!.label).toBe('2026-01');
    expect(periodForLabel('current', now)!.label).toBe('2026-01');
    expect(periodForLabel('previous', now)!.label).toBe('2025-12');
    expect(periodForLabel('2026-03', now)!.label).toBe('2026-03');
    expect(periodForLabel('2026-13', now)).toBeNull();
    expect(periodForLabel('nonsense', now)).toBeNull();
  });
});

describe('quota decisions', () => {
  const summary = (over: Partial<any> = {}) => ({
    events: 0, requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, cents: 0, estimatedEvents: 0, ...over,
  });

  it('admits within quota and rejects each exceeded dimension', () => {
    expect(checkQuota(PLAN, summary({ requests: 1, totalTokens: 50, cents: 1 }), 1).allowed).toBe(true);

    const reqOver = checkQuota(PLAN, summary({ requests: 3 }), 1);
    expect(reqOver.allowed).toBe(false);
    expect(reqOver.reason).toMatch(/request quota/);

    const tokOver = checkQuota(PLAN, summary({ totalTokens: 101 }), 0);
    expect(tokOver.allowed).toBe(false);
    expect(tokOver.reason).toMatch(/token quota/);

    const spendOver = checkQuota(PLAN, summary({ cents: 11 }), 0);
    expect(spendOver.allowed).toBe(false);
    expect(spendOver.reason).toMatch(/spend quota/);
  });

  it('treats a zero limit as unlimited', () => {
    const unlimited: Plan = { ...PLAN, quotas: { requestsPerMonth: 0, tokensPerMonth: 0, centsPerMonth: 0 } };
    expect(checkQuota(unlimited, summary({ requests: 9999, totalTokens: 9_999_999, cents: 9999 }), 1).allowed).toBe(true);
  });
});

describe('usage report', () => {
  it('summarizes a tenant period and computes remaining allowance', () => {
    const meter = openUsageMeter(path.join(freshDir(), 'usage.jsonl'));
    const now = Date.UTC(2026, 8, 16);
    meter.record({ tenantId: 't1', kind: 'api_request', at: now });
    meter.record({ tenantId: 't1', kind: 'model_call', inputTokens: 10, outputTokens: 10, cents: 2, at: now });
    const report = usageReport(meter, 't1', PLAN, now);
    expect(report.period.label).toBe('2026-09');
    expect(report.summary.requests).toBe(1);
    expect(report.summary.totalTokens).toBe(20);
    expect(report.remaining.requests).toBe(2);
    expect(report.remaining.tokens).toBe(80);
    expect(report.quota.allowed).toBe(true);
  });
});

describe('request authentication', () => {
  it('extracts keys from x-api-key or a Bearer header', () => {
    expect(apiKeyFromRequest({ headers: { 'x-api-key': 'abc' } } as any)).toBe('abc');
    expect(apiKeyFromRequest({ headers: { authorization: 'Bearer xyz' } } as any)).toBe('xyz');
    expect(apiKeyFromRequest({ headers: {} } as any)).toBe('');
  });

  it('authenticates a valid key and rejects bad/suspended', () => {
    const dir = freshDir();
    const tenants = openTenantStore(path.join(dir, 'tenants.json'));
    const keys = openApiKeyStore(path.join(dir, 'keys.json'));
    const tenant = tenants.create({ name: 'Acme' });
    const { raw } = keys.create({ tenantId: tenant.id });

    const ok = authenticateRequest(raw, { keys, tenants });
    expect(ok.ok).toBe(true);
    expect(ok.context!.tenant.id).toBe(tenant.id);

    expect(authenticateRequest('bogus', { keys, tenants }).status).toBe(401);

    tenants.setStatus(tenant.id, 'suspended');
    const suspended = authenticateRequest(raw, { keys, tenants });
    expect(suspended.ok).toBe(false);
    expect(suspended.status).toBe(403);
    expect(suspended.error).toMatch(/suspended/);
  });

  it('marks a key with no tenant as forbidden', () => {
    const dir = freshDir();
    const tenants = openTenantStore(path.join(dir, 'tenants.json'));
    const keys = openApiKeyStore(path.join(dir, 'keys.json'));
    const { raw } = keys.create({ tenantId: 'ghost' });
    const result = authenticateRequest(raw, { keys, tenants });
    expect(result.status).toBe(403);
    expect(result.error).toMatch(/tenant not found/);
  });
});

describe('middleware', () => {
  it('rejects a request with no key', () => {
    const dir = freshDir();
    const mw = createAuthMiddleware({
      keys: openApiKeyStore(path.join(dir, 'keys.json')),
      tenants: openTenantStore(path.join(dir, 'tenants.json')),
    });
    const res = mockRes();
    const next = vi.fn();
    mw({ headers: {} } as any, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches auth context and records an api_request within quota', () => {
    const dir = freshDir();
    const tenants = openTenantStore(path.join(dir, 'tenants.json'));
    const keys = openApiKeyStore(path.join(dir, 'keys.json'));
    const meter = openUsageMeter(path.join(dir, 'usage.jsonl'));
    const tenant = tenants.create({ name: 'Acme' });
    const { raw } = keys.create({ tenantId: tenant.id });
    tenants.setPlan(tenant.id, 'pro');

    const auth = createAuthMiddleware({ keys, tenants, planDir: path.join(process.cwd(), 'data', 'plans') });
    const quota = createQuotaMiddleware({ meter });
    const res = mockRes();
    const next = vi.fn();
    auth({ headers: { 'x-api-key': raw } } as any, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.locals.auth.tenant.id).toBe(tenant.id);

    quota({ method: 'POST', path: '/v1/outcome' } as any, res, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(meter.summary({ tenantId: tenant.id }).requests).toBe(1);
  });

  it('returns 429 when the request would exceed the plan quota', () => {
    const dir = freshDir();
    const planDir = freshDir();
    fs.writeFileSync(
      path.join(planDir, 'tiny.json'),
      JSON.stringify({ id: 'tiny', name: 'Tiny', priceCents: 0, quotas: { requestsPerMonth: 1, tokensPerMonth: 10, centsPerMonth: 1 } }),
      'utf-8',
    );
    const tenants = openTenantStore(path.join(dir, 'tenants.json'));
    const keys = openApiKeyStore(path.join(dir, 'keys.json'));
    const meter = openUsageMeter(path.join(dir, 'usage.jsonl'));
    const tenant = tenants.create({ name: 'Acme', planId: 'tiny' });
    const { raw } = keys.create({ tenantId: tenant.id });
    // The tiny plan allows exactly 1 request/month; burn it directly.
    meter.record({ tenantId: tenant.id, kind: 'api_request' });

    const auth = createAuthMiddleware({ keys, tenants, planDir });
    const quota = createQuotaMiddleware({ meter });
    const res = mockRes();
    const next = vi.fn();
    auth({ headers: { 'x-api-key': raw } } as any, res, next);
    quota({ method: 'GET', path: '/v1/usage' } as any, res, next);
    expect(res.statusCode).toBe(429);
    expect(next).toHaveBeenCalledTimes(1); // auth only
  });

  it('quota middleware without auth fails loudly', () => {
    const meter = openUsageMeter(path.join(freshDir(), 'usage.jsonl'));
    const quota = createQuotaMiddleware({ meter });
    const res = mockRes();
    quota({ method: 'GET', path: '/x' } as any, res, vi.fn());
    expect(res.statusCode).toBe(500);
  });
});
