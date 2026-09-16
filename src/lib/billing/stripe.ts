/**
 * stripe.ts — payment processor integration, implemented over the Stripe REST
 * API with `fetch` rather than the vendor SDK. That keeps the dependency
 * surface unchanged (this repo ships no Stripe SDK) while giving real checkout
 * sessions and real, signature-verified webhooks.
 *
 * Honesty contract: when STRIPE_SECRET_KEY is unset the module reports
 * `configured: false` and checkout returns `ok:false` — it never fabricates a
 * session URL or pretends a payment succeeded. Webhook signature verification
 * fails closed on a missing secret.
 *
 * The mapping logic (`stripeEventOutcome`, `applyStripeEvent`) is pure over
 * injected stores, so the billing lifecycle is unit-testable without network.
 */
import crypto from 'node:crypto';
import type { Wallet } from '../wallet.js';
import type { TenantStore } from '../auth/tenants.js';
import type { Plan } from './plans.js';

export const STRIPE_API_BASE = (): string => (process.env.STRIPE_API_BASE || 'https://api.stripe.com/v1').replace(/\/+$/, '');

export function stripeSecretKey(): string {
  return (process.env.STRIPE_SECRET_KEY || '').trim();
}

export function stripeWebhookSecret(): string {
  return (process.env.STRIPE_WEBHOOK_SECRET || '').trim();
}

export function stripeConfigured(): boolean {
  return stripeSecretKey() !== '';
}

export type FetchLike = typeof fetch;

/** Encode a params object as Stripe's `application/x-www-form-urlencoded`
 *  bracket notation (nested objects + arrays). */
export function encodeStripeForm(params: Record<string, unknown>, prefix = ''): string {
  const parts: string[] = [];
  const push = (key: string, value: unknown): void => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => push(`${key}[${i}]`, v));
      return;
    }
    if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        push(`${key}[${k}]`, v);
      }
      return;
    }
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  };
  for (const [k, v] of Object.entries(params)) push(prefix ? `${prefix}[${k}]` : k, v);
  return parts.join('&');
}

async function stripeRequest(
  path: string,
  params: Record<string, unknown>,
  opts: { secretKey?: string; fetchImpl?: FetchLike; apiBase?: string; method?: 'POST' | 'GET' } = {},
): Promise<{ ok: boolean; status: number; body: any; error?: string }> {
  const secret = opts.secretKey ?? stripeSecretKey();
  if (!secret) return { ok: false, status: 0, body: null, error: 'STRIPE_SECRET_KEY not configured' };
  const fetchImpl = opts.fetchImpl ?? fetch;
  const apiBase = (opts.apiBase ?? STRIPE_API_BASE()).replace(/\/+$/, '');
  const method = opts.method ?? 'POST';
  const url = method === 'GET' ? `${apiBase}/${path}?${encodeStripeForm(params)}` : `${apiBase}/${path}`;
  try {
    const res = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: method === 'POST' ? encodeStripeForm(params) : undefined,
    });
    const text = await res.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 500) };
    }
    if (!res.ok) {
      return { ok: false, status: res.status, body, error: body?.error?.message || `stripe HTTP ${res.status}` };
    }
    return { ok: true, status: res.status, body };
  } catch (err: any) {
    return { ok: false, status: 0, body: null, error: err?.message || 'stripe request failed' };
  }
}

export interface CheckoutInput {
  tenantId: string;
  plan: Plan;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  stripeCustomerId?: string;
  secretKey?: string;
  fetchImpl?: FetchLike;
  apiBase?: string;
}

export interface CheckoutResult {
  ok: boolean;
  id?: string;
  url?: string;
  error?: string;
}

/** Create a subscription Checkout Session for a tenant + plan. */
export async function createCheckoutSession(input: CheckoutInput): Promise<CheckoutResult> {
  if (!input.plan.stripePriceId) {
    return { ok: false, error: `plan "${input.plan.id}" has no stripePriceId configured` };
  }
  const params: Record<string, unknown> = {
    mode: 'subscription',
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    line_items: [{ price: input.plan.stripePriceId, quantity: 1 }],
    client_reference_id: input.tenantId,
    metadata: { tenantId: input.tenantId, planId: input.plan.id },
    subscription_data: { metadata: { tenantId: input.tenantId, planId: input.plan.id } },
  };
  if (input.stripeCustomerId) params.customer = input.stripeCustomerId;
  else if (input.customerEmail) params.customer_email = input.customerEmail;

  const res = await stripeRequest('checkout/sessions', params, {
    secretKey: input.secretKey,
    fetchImpl: input.fetchImpl,
    apiBase: input.apiBase,
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, id: res.body?.id, url: res.body?.url };
}

/**
 * Verify a Stripe webhook signature. Header format: `t=<ts>,v1=<hex>[,v1=...]`.
 * The signed payload is `${t}.${rawBody}`, HMAC-SHA256 with the webhook secret.
 * Fails closed when the secret is unset. `toleranceSec` guards replay.
 */
export function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string = stripeWebhookSecret(),
  opts: { toleranceSec?: number; now?: number } = {},
): boolean {
  if (!secret.trim()) return false;
  if (!signatureHeader) return false;
  const parts = signatureHeader.split(',');
  let timestamp = '';
  const signatures: string[] = [];
  for (const part of parts) {
    const [k, v] = part.split('=');
    if (k === 't') timestamp = v;
    else if (k === 'v1' && v) signatures.push(v);
  }
  if (!timestamp || signatures.length === 0) return false;
  const ts = Number(timestamp);
  const tolerance = opts.toleranceSec ?? 300;
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > tolerance) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf-8').digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  for (const sig of signatures) {
    let candidate: Buffer;
    try {
      candidate = Buffer.from(sig, 'hex');
    } catch {
      continue;
    }
    if (candidate.length === expectedBuf.length && crypto.timingSafeEqual(candidate, expectedBuf)) return true;
  }
  return false;
}

/**
 * Retrieve a Checkout Session by id. Used to confirm a completed payment before
 * issuing a public subscriber access token (the success redirect carries the
 * session id, but only Stripe can prove it was paid).
 */
export async function retrieveCheckoutSession(
  id: string,
  opts: { secretKey?: string; fetchImpl?: FetchLike; apiBase?: string } = {},
): Promise<{ ok: boolean; session?: { id: string; tenantId?: string; planId?: string; customerId?: string; paymentStatus?: string }; error?: string }> {
  if (!id) return { ok: false, error: 'session id is required' };
  const res = await stripeRequest(`checkout/sessions/${encodeURIComponent(id)}`, {}, { ...opts, method: 'GET' });
  if (!res.ok) return { ok: false, error: res.error };
  const metadata = (res.body?.metadata as Record<string, unknown> | undefined) ?? {};
  const tenantId = typeof metadata.tenantId === 'string' ? metadata.tenantId : undefined;
  const planId = typeof metadata.planId === 'string' ? metadata.planId : undefined;
  return {
    ok: true,
    session: {
      id: String(res.body?.id ?? id),
      tenantId,
      planId,
      customerId: typeof res.body?.customer === 'string' ? res.body.customer : undefined,
      paymentStatus: typeof res.body?.payment_status === 'string' ? res.body.payment_status : undefined,
    },
  };
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export function parseStripeEvent(rawBody: string): StripeEvent | null {
  try {
    const parsed = JSON.parse(rawBody) as StripeEvent;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') return null;
    if (!parsed.data || typeof parsed.data !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export type StripeOutcomeKind =
  | 'subscription_activated'
  | 'subscription_updated'
  | 'subscription_canceled'
  | 'invoice_paid'
  | 'invoice_failed'
  | 'ignored';

export interface StripeOutcome {
  kind: StripeOutcomeKind;
  eventId: string;
  eventType: string;
  tenantId?: string;
  planId?: string;
  customerId?: string;
  subscriptionId?: string;
  amountCents?: number;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function planIdForPrice(priceId: string | undefined, plans: Plan[]): string | undefined {
  if (!priceId) return undefined;
  return plans.find((p) => p.stripePriceId && p.stripePriceId === priceId)?.id;
}

/** Map a Stripe event to a provider-neutral billing outcome (pure). */
export function stripeEventOutcome(event: StripeEvent, plans: Plan[] = []): StripeOutcome {
  const obj = event.data?.object ?? {};
  const metadata = (obj.metadata as Record<string, unknown> | undefined) ?? {};
  const tenantId = str(metadata.tenantId) ?? str(obj.client_reference_id);
  const base = { eventId: event.id, eventType: event.type, tenantId };
  switch (event.type) {
    case 'checkout.session.completed': {
      return {
        ...base,
        kind: 'subscription_activated',
        planId: str(metadata.planId),
        customerId: str(obj.customer),
        subscriptionId: str(obj.subscription),
      };
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const items = (obj.items as { data?: Array<{ price?: { id?: string } }> } | undefined)?.data ?? [];
      const priceId = str(items[0]?.price?.id);
      return {
        ...base,
        kind: 'subscription_updated',
        planId: planIdForPrice(priceId, plans),
        customerId: str(obj.customer),
        subscriptionId: str(obj.id),
        tenantId: tenantId ?? str(metadata.tenantId),
      };
    }
    case 'customer.subscription.deleted': {
      const items = (obj.items as { data?: Array<{ price?: { id?: string } }> } | undefined)?.data ?? [];
      return {
        ...base,
        kind: 'subscription_canceled',
        planId: planIdForPrice(str(items[0]?.price?.id), plans) ?? 'free',
        customerId: str(obj.customer),
        subscriptionId: str(obj.id),
      };
    }
    case 'invoice.paid': {
      const amount = Number(obj.amount_paid ?? obj.amount_due ?? 0);
      const sub = str(obj.subscription);
      return {
        ...base,
        kind: 'invoice_paid',
        tenantId: tenantId ?? str(metadata.tenantId),
        customerId: str(obj.customer),
        subscriptionId: sub,
        amountCents: Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0,
      };
    }
    case 'invoice.payment_failed': {
      const amount = Number(obj.amount_due ?? 0);
      return {
        ...base,
        kind: 'invoice_failed',
        tenantId: tenantId ?? str(metadata.tenantId),
        customerId: str(obj.customer),
        subscriptionId: str(obj.subscription),
        amountCents: Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0,
      };
    }
    default:
      return { ...base, kind: 'ignored' };
  }
}

export interface ApplyStripeDeps {
  tenants: TenantStore;
  wallet?: Wallet;
  plans: Plan[];
  /** Wallet token credited on invoice.paid. Default `tenant:<id>`. */
  walletTokenFor?: (tenantId: string) => string;
}

export interface ApplyStripeResult {
  outcome: StripeOutcome;
  applied: boolean;
  notes: string[];
}

/**
 * Apply a mapped outcome to the tenant store (and wallet credits). Returns a
 * description of what changed; every branch is idempotent-by-intent (re-issuing
 * the same plan/credit is harmless) so a re-delivered webhook is safe.
 */
export function applyStripeOutcome(outcome: StripeOutcome, deps: ApplyStripeDeps): ApplyStripeResult {
  const notes: string[] = [];
  let applied = false;
  const tokenFor = deps.walletTokenFor ?? ((id: string) => `tenant:${id}`);

  switch (outcome.kind) {
    case 'subscription_activated':
    case 'subscription_updated': {
      if (outcome.tenantId && outcome.planId) {
        deps.tenants.setPlan(outcome.tenantId, outcome.planId);
        notes.push(`tenant ${outcome.tenantId} -> plan ${outcome.planId}`);
        applied = true;
      }
      if (outcome.tenantId && outcome.customerId) {
        deps.tenants.setStripeCustomer(outcome.tenantId, outcome.customerId);
      }
      if (outcome.tenantId && outcome.kind === 'subscription_activated') {
        deps.tenants.setStatus(outcome.tenantId, 'active');
      }
      break;
    }
    case 'subscription_canceled': {
      if (outcome.tenantId) {
        deps.tenants.setPlan(outcome.tenantId, 'free');
        notes.push(`tenant ${outcome.tenantId} downgraded to free`);
        applied = true;
      }
      break;
    }
    case 'invoice_paid': {
      if (outcome.tenantId && deps.wallet && outcome.amountCents && outcome.amountCents > 0) {
        const token = tokenFor(outcome.tenantId);
        deps.wallet.setBudget(token, outcome.amountCents, `stripe invoice ${outcome.eventId}`, undefined);
        notes.push(`credited wallet ${token} with ${outcome.amountCents}c`);
        applied = true;
      } else if (outcome.amountCents && outcome.amountCents > 0) {
        notes.push('invoice.paid had no tenantId; skipped wallet credit');
      }
      break;
    }
    case 'invoice_failed':
      notes.push(`invoice payment failed for tenant ${outcome.tenantId ?? '(unknown)'}`);
      break;
    case 'ignored':
    default:
      notes.push(`ignored event type ${outcome.eventType}`);
      break;
  }
  return { outcome, applied, notes };
}

/** Convenience: parse + map + apply in one call. */
export function handleStripeWebhook(rawBody: string, deps: ApplyStripeDeps): ApplyStripeResult | null {
  const event = parseStripeEvent(rawBody);
  if (!event) return null;
  return applyStripeOutcome(stripeEventOutcome(event, deps.plans), deps);
}
