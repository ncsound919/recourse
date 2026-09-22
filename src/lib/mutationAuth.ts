/**
 * Shared mutation-auth guard for Express routes (both the server.ts monolith
 * and the extracted routers under src/routes/). Any mutating route that
 * writes to disk or the registry must sit behind this so a caller who can
 * reach the port cannot mutate Recourse without the secret.
 *
 * Fail-closed: when RECOURSE_API_SECRET is unset the mutating route is
 * disabled (503) rather than silently open. GET/HEAD/OPTIONS are never gated.
 */
import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { resolveJevPublic } from './jevAccess.js';

export const MUTATION_SECRET_ENV = 'RECOURSE_API_SECRET';

function presentedSecret(req: Request): string {
  const auth = req.headers.authorization;
  if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
  const h = req.headers['x-api-secret'];
  if (typeof h === 'string') return h.trim();
  return '';
}

function secretsEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf-8');
  const bb = Buffer.from(b, 'utf-8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Boolean-only credential check (no response side effects). Fail-closed: returns
 * true ONLY when a secret is configured AND the presented secret matches — an
 * unconfigured secret yields false (not "open"). Used by protocol surfaces (A2A,
 * MCP-HTTP) that decide their own error envelope and scope grants, so an
 * unauthenticated caller never receives write scope.
 */
export function hasValidMutationSecret(req: Request): boolean {
  const secret = process.env[MUTATION_SECRET_ENV];
  if (!secret || secret.trim() === '') return false;
  const presented = presentedSecret(req);
  return Boolean(presented) && secretsEqual(presented, secret.trim());
}

/** Returns true when the request is allowed to proceed; on refusal it has
 *  already written the error response. */
export function requireMutationAuth(req: Request, res: Response): boolean {
  const method = (req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  const secret = process.env[MUTATION_SECRET_ENV];
  if (!secret || secret.trim() === '') {
    res.status(503).json({ success: false, error: `mutating API disabled: ${MUTATION_SECRET_ENV} not configured (fail-closed)` });
    return false;
  }
  const presented = presentedSecret(req);
  if (!presented || !secretsEqual(presented, secret.trim())) {
    res.status(401).json({ success: false, error: 'unauthorized' });
    return false;
  }
  return true;
}

/**
 * Config-gated variant for routes the mission-control UI also drives. When
 * RECOURSE_API_SECRET is UNSET the route stays open (backward compatible with
 * default local runs); when it IS set the route is enforced — so MCP/scripts
 * can authenticate full-loop writes without breaking an unconfigured local
 * dashboard. Prefer `requireMutationAuth` (always fail-closed) for routes that
 * must never be open (skills import/export, patch revert).
 */
export function requireMutationAuthIfConfigured(req: Request, res: Response): boolean {
  const secret = process.env[MUTATION_SECRET_ENV];
  if (!secret || secret.trim() === '') return true;
  return requireMutationAuth(req, res);
}

/**
 * Guard for READ routes that trigger PAID model calls (Jev advisories). Each
 * hit can bill the provider, so by default these require RECOURSE_API_SECRET
 * even on GET. The public/closed switch is Keywire-backed (a vault secret
 * `RECOURSE_JEV_PUBLIC=1` flips them open "as needed"; see src/lib/jevAccess.ts);
 * a static `RECOURSE_JEV_PUBLIC` env still wins when set. An unconfigured
 * secret (plain local dev) stays open, matching `requireMutationAuthIfConfigured`.
 */
export async function requireJevAdvisoryAuth(req: Request, res: Response): Promise<boolean> {
  const secret = process.env[MUTATION_SECRET_ENV];
  if (!secret || secret.trim() === '') return true;
  const publicValue = await resolveJevPublic();
  if (publicValue === '1') return true;
  const presented = presentedSecret(req);
  if (!presented || !secretsEqual(presented, secret.trim())) {
    res.status(401).json({
      success: false,
      error: `unauthorized: Jev advisory routes require ${MUTATION_SECRET_ENV} (set RECOURSE_JEV_PUBLIC=1 in Keywire or env to expose)`,
    });
    return false;
  }
  return true;
}
