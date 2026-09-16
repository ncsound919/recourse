/**
 * paywall.ts — article entitlements and the signed reader-access tokens that
 * let an anonymous, paying subscriber read `subscriber`-visibility articles.
 *
 * Entitlement is checked against the Wave-1 plan catalogue: any plan with a
 * non-zero price is a subscriber plan. Reader tokens are HMAC-signed and carry
 * a tenant + plan + expiry, so a paywall decision needs no session store.
 *
 * Honesty: with no signing secret configured, no token can be issued or
 * verified — the paywall fails closed rather than granting access.
 */
import crypto from 'node:crypto';
import { getPlan, loadPlans, type Plan } from '../billing/plans.js';
import type { PublicArticle } from './articles.js';

export interface Viewer {
  tenantId?: string;
  planId?: string;
  scopes?: string[];
}

export interface Entitlement {
  canView: boolean;
  reason: string;
  requiredPlanId?: string;
}

export function isAdmin(viewer: Viewer | undefined): boolean {
  return Boolean(viewer?.scopes?.includes('admin') || viewer?.scopes?.includes('subscriber'));
}

export function isPaidPlan(plan: Plan): boolean {
  return plan.priceCents > 0 || Boolean(plan.stripePriceId);
}

/** Cheapest paid plan — what a subscriber article requires. */
export function cheapestPaidPlan(planDir?: string): Plan | undefined {
  return loadPlans(planDir)
    .filter(isPaidPlan)
    .sort((a, b) => a.priceCents - b.priceCents)[0];
}

export function canViewArticle(article: PublicArticle, viewer?: Viewer, planDir?: string): Entitlement {
  if (article.visibility === 'public') return { canView: true, reason: 'public article' };
  if (article.visibility === 'private') {
    return isAdmin(viewer)
      ? { canView: true, reason: 'admin access' }
      : { canView: false, reason: 'private article requires admin access' };
  }
  // subscriber
  if (isAdmin(viewer)) return { canView: true, reason: 'admin access' };
  const required = cheapestPaidPlan(planDir);
  if (viewer?.planId) {
    const plan = getPlan(viewer.planId, planDir);
    if (isPaidPlan(plan)) return { canView: true, reason: `plan "${plan.id}" is a subscriber plan` };
  }
  return {
    canView: false,
    reason: required ? `subscriber article requires a paid plan (e.g. "${required.id}")` : 'subscriber article requires a paid plan',
    requiredPlanId: required?.id,
  };
}

// ---------------------------------------------------------------------------
// Reader access tokens
// ---------------------------------------------------------------------------

export interface AccessTokenPayload {
  sub: 'reader';
  tenantId: string;
  planId: string;
  iat: number;
  exp: number;
}

export const DEFAULT_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function publishAccessSecret(): string {
  return (process.env.RECOURSE_PUBLISH_ACCESS_SECRET || process.env.RECOURSE_API_SECRET || '').trim();
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function sign(data: string, secret: string): string {
  return b64url(crypto.createHmac('sha256', secret).update(data, 'utf-8').digest());
}

export interface SignTokenOptions {
  secret?: string;
  ttlMs?: number;
  now?: number;
}

/** Issue an HMAC-signed reader token. Throws when no secret is configured. */
export function signAccessToken(
  input: { tenantId: string; planId: string },
  opts: SignTokenOptions = {},
): string {
  const secret = opts.secret ?? publishAccessSecret();
  if (!secret) throw new Error('publish access secret not configured (set RECOURSE_PUBLISH_ACCESS_SECRET or RECOURSE_API_SECRET)');
  if (!input.tenantId || !input.planId) throw new Error('tenantId and planId are required');
  const now = opts.now ?? Date.now();
  const payload: AccessTokenPayload = {
    sub: 'reader',
    tenantId: input.tenantId,
    planId: input.planId,
    iat: now,
    exp: now + (opts.ttlMs ?? DEFAULT_TOKEN_TTL_MS),
  };
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf-8'));
  return `${body}.${sign(body, secret)}`;
}

export type TokenFailure = 'malformed' | 'bad_signature' | 'expired' | 'no_secret';

export interface VerifiedToken {
  ok: boolean;
  payload?: AccessTokenPayload;
  reason?: TokenFailure;
}

export function verifyAccessToken(token: string, opts: SignTokenOptions = {}): VerifiedToken {
  const secret = opts.secret ?? publishAccessSecret();
  if (!secret) return { ok: false, reason: 'no_secret' };
  const parts = String(token ?? '').split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' };
  const expected = sign(parts[0], secret);
  const a = Buffer.from(parts[1]);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'bad_signature' };
  let payload: AccessTokenPayload;
  try {
    payload = JSON.parse(fromB64url(parts[0]).toString('utf-8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof payload.exp !== 'number' || (opts.now ?? Date.now()) >= payload.exp) {
    return { ok: false, reason: 'expired' };
  }
  if (payload.sub !== 'reader' || typeof payload.tenantId !== 'string' || typeof payload.planId !== 'string') {
    return { ok: false, reason: 'malformed' };
  }
  return { ok: true, payload };
}

/** Build a Viewer from a reader token, or undefined when invalid. */
export function viewerFromToken(token: string | undefined, opts: SignTokenOptions = {}): Viewer | undefined {
  if (!token) return undefined;
  const verified = verifyAccessToken(token, opts);
  if (!verified.ok || !verified.payload) return undefined;
  return { tenantId: verified.payload.tenantId, planId: verified.payload.planId };
}
