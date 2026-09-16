import { describe, it, expect, afterEach } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadPlans, getPlan, defaultPaidPlan, FREE_PLAN, type Plan } from '../src/lib/billing/plans';
import {
  encodeStripeForm,
  verifyStripeSignature,
  parseStripeEvent,
  stripeEventOutcome,
  applyStripeOutcome,
  createCheckoutSession,
  handleStripeWebhook,
  type StripeEvent,
} from '../src/lib/billing/stripe';
import { openTenantStore } from '../src/lib/auth/tenants';
import { openWallet } from '../src/lib/wallet';

const dirs: string[] = [];
function freshDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-billing-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

const PLANS: Plan[] = [
  { ...FREE_PLAN },
  { ...FREE_PLAN, id: 'pro', name: 'Pro', priceCents: 4900, stripePriceId: 'price_pro', scopes: ['read', 'write', 'billing'] },
];

describe('plans', () => {
  it('loads the shipped plan catalogue', () => {
    const plans = loadPlans();
    const ids = plans.map((p) => p.id);
    expect(ids).toContain('free');
    expect(ids).toContain('pro');
    expect(defaultPaidPlan()!.id).toBe('pro');
  });

  it('falls back to the free plan when the directory is missing or empty', () => {
    expect(loadPlans(path.join(freshDir(), 'nope'))).toEqual([FREE_PLAN]);
    expect(loadPlans(freshDir())).toEqual([FREE_PLAN]);
    expect(getPlan('nope').id).toBe('free');
  });

  it('normalizes malformed plan files', () => {
    const dir = freshDir();
    fs.writeFileSync(path.join(dir, 'bad.json'), '{ not json', 'utf-8');
    fs.writeFileSync(path.join(dir, 'custom.json'), JSON.stringify({ id: 'custom', name: 'C', quotas: {} }), 'utf-8');
    const plans = loadPlans(dir);
    expect(plans).toHaveLength(1);
    expect(plans[0].id).toBe('custom');
    expect(plans[0].quotas.requestsPerMonth).toBe(FREE_PLAN.quotas.requestsPerMonth);
  });
});

describe('stripe form encoding', () => {
  it('encodes nested objects and arrays with bracket notation', () => {
    const form = encodeStripeForm({ mode: 'subscription', line_items: [{ price: 'p', quantity: 1 }], metadata: { a: 'b' } });
    expect(form).toContain('mode=subscription');
    expect(form).toContain('line_items%5B0%5D%5Bprice%5D=p');
    expect(form).toContain('metadata%5Ba%5D=b');
  });
});

describe('stripe signature verification', () => {
  const secret = 'whsec_test';
  function sign(payload: string, t: number): string {
    const sig = crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
    return `t=${t},v1=${sig}`;
  }

  it('accepts a valid signature and rejects tampering', () => {
    const payload = JSON.stringify({ id: 'evt_1', type: 'invoice.paid' });
    const header = sign(payload, 1000);
    expect(verifyStripeSignature(payload, header, secret, { now: 1000 })).toBe(true);
    expect(verifyStripeSignature(payload + 'x', header, secret, { now: 1000 })).toBe(false);
  });

  it('enforces tolerance and fails closed without a secret', () => {
    const payload = '{}';
    const header = sign(payload, 1000);
    expect(verifyStripeSignature(payload, header, secret, { now: 1000 + 301 })).toBe(false);
    expect(verifyStripeSignature(payload, header, '', { now: 1000 })).toBe(false);
    expect(verifyStripeSignature(payload, undefined, secret)).toBe(false);
    expect(verifyStripeSignature(payload, 'garbage', secret)).toBe(false);
  });
});

describe('stripe events', () => {
  it('parses valid events and rejects malformed bodies', () => {
    expect(parseStripeEvent('{"type":"x","data":{"object":{}}}')!.type).toBe('x');
    expect(parseStripeEvent('nope')).toBeNull();
    expect(parseStripeEvent('{"type":"x"}')).toBeNull();
  });

  it('maps each supported event type', () => {
    const checkout: StripeEvent = { id: 'e1', type: 'checkout.session.completed', data: { object: { metadata: { tenantId: 't1', planId: 'pro' }, customer: 'cus_1', subscription: 'sub_1' } } };
    expect(stripeEventOutcome(checkout, PLANS)).toMatchObject({ kind: 'subscription_activated', tenantId: 't1', planId: 'pro' });

    const updated: StripeEvent = { id: 'e2', type: 'customer.subscription.updated', data: { object: { items: { data: [{ price: { id: 'price_pro' } }] }, customer: 'cus_1', id: 'sub_1', metadata: { tenantId: 't1' } } } };
    expect(stripeEventOutcome(updated, PLANS)).toMatchObject({ kind: 'subscription_updated', planId: 'pro', tenantId: 't1' });

    const canceled: StripeEvent = { id: 'e3', type: 'customer.subscription.deleted', data: { object: { items: { data: [{ price: { id: 'price_pro' } }] }, metadata: { tenantId: 't1' } } } };
    expect(stripeEventOutcome(canceled, PLANS)).toMatchObject({ kind: 'subscription_canceled', planId: 'pro' });

    const paid: StripeEvent = { id: 'e4', type: 'invoice.paid', data: { object: { amount_paid: 4900, metadata: { tenantId: 't1' } } } };
    expect(stripeEventOutcome(paid, PLANS)).toMatchObject({ kind: 'invoice_paid', amountCents: 4900, tenantId: 't1' });

    const failed: StripeEvent = { id: 'e5', type: 'invoice.payment_failed', data: { object: { amount_due: 4900, metadata: { tenantId: 't1' } } } };
    expect(stripeEventOutcome(failed, PLANS)).toMatchObject({ kind: 'invoice_failed', amountCents: 4900 });

    const ignored: StripeEvent = { id: 'e6', type: 'customer.created', data: { object: {} } };
    expect(stripeEventOutcome(ignored, PLANS).kind).toBe('ignored');
  });

  it('applies outcomes to tenants and the wallet', () => {
    const dir = freshDir();
    const tenants = openTenantStore(path.join(dir, 'tenants.json'));
    const wallet = openWallet(path.join(dir, 'wallet.jsonl'));
    const t = tenants.create({ name: 'Acme' });

    const activated = stripeEventOutcome({ id: 'e', type: 'checkout.session.completed', data: { object: { metadata: { tenantId: t.id, planId: 'pro' }, customer: 'cus_9' } } }, PLANS);
    const r = applyStripeOutcome(activated, { tenants, wallet, plans: PLANS });
    expect(r.applied).toBe(true);
    expect(tenants.get(t.id)!.planId).toBe('pro');
    expect(tenants.get(t.id)!.stripeCustomerId).toBe('cus_9');

    const paid = stripeEventOutcome({ id: 'e2', type: 'invoice.paid', data: { object: { amount_paid: 4900, metadata: { tenantId: t.id } } } }, PLANS);
    applyStripeOutcome(paid, { tenants, wallet, plans: PLANS });
    expect(wallet.balance(`tenant:${t.id}`).capCents).toBe(4900);

    const canceled = stripeEventOutcome({ id: 'e3', type: 'customer.subscription.deleted', data: { object: { metadata: { tenantId: t.id }, items: { data: [] } } } }, PLANS);
    applyStripeOutcome(canceled, { tenants, wallet, plans: PLANS });
    expect(tenants.get(t.id)!.planId).toBe('free');
  });

  it('handleStripeWebhook parses + applies, returning null for garbage', () => {
    const dir = freshDir();
    const tenants = openTenantStore(path.join(dir, 'tenants.json'));
    const t = tenants.create({ name: 'Acme' });
    const raw = JSON.stringify({ id: 'e', type: 'checkout.session.completed', data: { object: { metadata: { tenantId: t.id, planId: 'pro' } } } });
    const result = handleStripeWebhook(raw, { tenants, plans: PLANS });
    expect(result!.applied).toBe(true);
    expect(handleStripeWebhook('garbage', { tenants, plans: PLANS })).toBeNull();
  });
});

describe('checkout sessions', () => {
  it('refuses a plan with no stripe price', async () => {
    const res = await createCheckoutSession({ tenantId: 't1', plan: FREE_PLAN, successUrl: 's', cancelUrl: 'c', secretKey: 'sk' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/no stripePriceId/);
  });

  it('creates a session via the configured endpoint using injected fetch', async () => {
    let capturedUrl = '';
    let capturedBody = '';
    const fakeFetch = (async (url: string, init: any) => {
      capturedUrl = String(url);
      capturedBody = String(init.body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' }),
      } as any;
    }) as unknown as typeof fetch;
    const res = await createCheckoutSession({
      tenantId: 't1',
      plan: PLANS[1],
      successUrl: 'https://app/success',
      cancelUrl: 'https://app/cancel',
      secretKey: 'sk_test',
      fetchImpl: fakeFetch,
      apiBase: 'https://api.stripe.test/v1',
    });
    expect(res.ok).toBe(true);
    expect(res.url).toBe('https://checkout.stripe.test/cs_1');
    expect(capturedUrl).toBe('https://api.stripe.test/v1/checkout/sessions');
    expect(capturedBody).toContain('metadata%5BtenantId%5D=t1');
    expect(capturedBody).toContain('line_items%5B0%5D%5Bprice%5D=price_pro');
  });

  it('reports an error when stripe is unreachable', async () => {
    const fakeFetch = (async () => { throw new Error('boom'); }) as unknown as typeof fetch;
    const res = await createCheckoutSession({
      tenantId: 't1', plan: PLANS[1], successUrl: 's', cancelUrl: 'c', secretKey: 'sk', fetchImpl: fakeFetch,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/boom/);
  });
});
