// api/recourse/_guard.ts — shared request guards for the serverless surface.
//
// These routes were previously fully public. Fail-closed policy:
//   * Read-only (GET/HEAD/OPTIONS) stays open — it does not mutate state.
//   * Every other method requires RECOURSE_API_SECRET. If the secret is not
//     configured the route returns 503 (disabled), never silently open.
//   * Scheduler/cron targets additionally require their own secret to be SET
//     (503 when missing) and present on the request (401 on mismatch).
//
// Secrets are compared in constant time (timingSafeEqual) so a timing probe
// cannot leak the token.

import crypto from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const MUTATION_SECRET_ENV = 'RECOURSE_API_SECRET';

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** Pull a presented secret from Authorization: Bearer or x-api-secret /
 *  x-dream-secret headers (empty when none). */
export function presentedSecret(req: VercelRequest): string {
  const authz = req.headers['authorization'];
  if (typeof authz === 'string' && /^bearer\s+/i.test(authz)) {
    return authz.replace(/^bearer\s+/i, '').trim();
  }
  for (const name of ['x-api-secret', 'x-dream-secret']) {
    const h = req.headers[name];
    if (typeof h === 'string' && h.trim()) return h.trim();
  }
  return '';
}

/**
 * Gate for mutating methods. Returns true when the request may proceed;
 * otherwise it writes the response (401/503) and returns false.
 */
export function requireMutationAuth(req: VercelRequest, res: VercelResponse): boolean {
  const method = (req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;

  const secret = process.env[MUTATION_SECRET_ENV];
  if (!secret || secret.trim() === '') {
    res.status(503).json({
      success: false,
      error: `mutating API disabled: ${MUTATION_SECRET_ENV} not configured (fail-closed)`,
    });
    return false;
  }
  const presented = presentedSecret(req);
  if (!presented || !safeEqual(presented, secret.trim())) {
    res.status(401).json({ success: false, error: 'unauthorized' });
    return false;
  }
  return true;
}

/**
 * Fail-closed gate for scheduler/cron targets. The secret must be configured
 * (else 503) and matched on the request (else 401). Returns true when allowed.
 */
export function requireCronSecret(
  req: VercelRequest,
  res: VercelResponse,
  envName = 'DREAM_CRON_SECRET'
): boolean {
  const secret = process.env[envName];
  if (!secret || secret.trim() === '') {
    res.status(503).json({
      success: false,
      error: `${envName} not configured — cron disabled (fail-closed)`,
    });
    return false;
  }
  const presented = presentedSecret(req);
  if (!presented || !safeEqual(presented, secret.trim())) {
    res.status(401).json({ success: false, error: 'unauthorized' });
    return false;
  }
  return true;
}

/**
 * Log the full server-side error and reply with a generic message + a
 * correlation ref. Never leaks internal paths / upstream detail to clients.
 */
export function serverError(
  res: VercelResponse,
  err: unknown,
  ctx: string
): VercelResponse {
  const ref = crypto.randomBytes(6).toString('hex');
  console.error(`[${ctx}] ref=${ref}`, err instanceof Error ? err.stack || err.message : err);
  return res.status(500).json({ success: false, error: 'internal error', ref });
}
