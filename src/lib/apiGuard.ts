/**
 * Global API guard — a default-deny floor under every mutating route.
 *
 * Why: the server listened on 0.0.0.0 and ~150 POST/PUT/DELETE routes had no
 * per-route auth (code execution, tool deletion, provider switching, forge
 * runs, Keywire calls, chaos injection ...). Anyone on the LAN — or any web page
 * the operator visited, via a simple cross-site form POST or DNS rebinding —
 * could drive them. Per-route `requireMutationAuth` remains the stricter layer;
 * this middleware only adds a floor so a forgotten route is never wide open.
 *
 * Policy for requests under /api/ (mutating methods):
 *  1. A valid RECOURSE_API_SECRET (Bearer or x-api-secret) always passes.
 *  2. A same-machine browser/UI call passes WITHOUT the secret only when it is
 *     provably local: loopback peer address, a local Host header (defeats DNS
 *     rebinding), no cross-site Origin / Sec-Fetch-Site (defeats CSRF).
 *     This keeps the mission-control UI working without shipping the secret.
 *  3. Everything else is refused: 401 when a secret is configured, 403 when it
 *     is not (remote mutation with no secret configured is never allowed).
 *
 * Reads (GET/HEAD/OPTIONS) from a loopback peer with a non-local Host header
 * are also refused — that combination is the DNS-rebinding signature.
 *
 * Paths with their own authentication or that are public by design (Stripe
 * webhook, signed federation inbox, A2A/MCP scope negotiation, lead capture,
 * unsubscribe) are exempt and keep their existing handlers' checks.
 */
import type { NextFunction, Request, Response } from 'express';
import { hasValidMutationSecret, MUTATION_SECRET_ENV } from './mutationAuth.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Routes that authenticate themselves or are intentionally public. */
export const DEFAULT_PUBLIC_MUTATION_PATHS: RegExp[] = [
  /^\/api\/a2a\/?$/, // scope-gated inside handler (secret => write)
  /^\/api\/mcp\/?$/, // scope-gated inside handler (secret => write)
  /^\/api\/recourse\/federation\/inbox\/?$/, // signed peer envelopes
  /^\/api\/recourse\/growth\/outbound\/unsubscribe\/?$/,
  /^\/api\/recourse\/growth\/leads\/?$/,
  /^\/api\/recourse\/publishing\/subscribe\/?$/,
  /^\/api\/recourse\/publishing\/access\/claim\/?$/,
];

export function isLoopbackAddress(addr: string | undefined | null): boolean {
  if (!addr) return false;
  const a = addr.trim().toLowerCase();
  return a === '::1' || a === '127.0.0.1' || a.startsWith('127.') || a.startsWith('::ffff:127.');
}

/** Hostname (no port, no brackets) from a Host header / URL host. */
function hostnameOf(hostHeader: string): string {
  const h = hostHeader.trim().toLowerCase();
  if (h.startsWith('[')) return h.slice(1, h.indexOf(']') > 0 ? h.indexOf(']') : undefined);
  return h.split(':')[0];
}

export function isLocalHostname(host: string | undefined | null, extraAllowed: string[] = []): boolean {
  if (!host) return false;
  const name = hostnameOf(host);
  if (!name) return false;
  if (name === 'localhost' || name.endsWith('.localhost')) return true;
  if (name === '::1' || name === '127.0.0.1' || name.startsWith('127.')) return true;
  return extraAllowed.map((x) => x.trim().toLowerCase()).filter(Boolean).includes(name);
}

export function isLocalOrigin(origin: string | undefined | null, extraAllowed: string[] = []): boolean {
  if (!origin) return true; // non-browser client (curl, server-to-server)
  if (origin === 'null') return false; // sandboxed iframe / file:// — never trusted
  try {
    return isLocalHostname(new URL(origin).host, extraAllowed);
  } catch {
    return false;
  }
}

export interface ApiGuardOptions {
  /** Path prefixes the guard applies to (default ['/api/']). */
  prefixes?: string[];
  publicPaths?: RegExp[];
  /** Extra hostnames treated as local (RECOURSE_ALLOWED_HOSTS, comma-separated). */
  allowedHosts?: string[];
  /** Extra peer addresses treated like loopback, e.g. the Docker bridge
   *  gateway (RECOURSE_TRUSTED_PEERS, comma-separated exact addresses). */
  trustedPeers?: string[];
}

export type ApiGuardVerdict =
  | { allow: true; reason: 'safe-method' | 'public' | 'secret' | 'local' | 'out-of-scope' }
  | { allow: false; status: 401 | 403; error: string };

/** Pure decision (exported for tests). */
export function apiGuardDecision(
  req: Pick<Request, 'method' | 'path' | 'headers'> & { socket?: { remoteAddress?: string } },
  opts: ApiGuardOptions & { secretValid: boolean; secretConfigured: boolean },
): ApiGuardVerdict {
  const prefixes = opts.prefixes ?? ['/api/'];
  const path = req.path || '/';
  if (!prefixes.some((p) => path.startsWith(p))) return { allow: true, reason: 'out-of-scope' };

  const method = (req.method || 'GET').toUpperCase();
  const allowed = opts.allowedHosts ?? [];
  const peer = String(req.socket?.remoteAddress ?? '').trim().toLowerCase();
  const trusted = (opts.trustedPeers ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const peerLoopback = isLoopbackAddress(peer) || trusted.includes(peer) || trusted.includes(peer.replace(/^::ffff:/, ''));
  const host = typeof req.headers.host === 'string' ? req.headers.host : '';
  const hostLocal = isLocalHostname(host, allowed);

  if (SAFE_METHODS.has(method)) {
    // DNS-rebinding signature: browser on this machine, attacker's hostname.
    if (peerLoopback && host && !hostLocal && !opts.secretValid) {
      return { allow: false, status: 403, error: 'forbidden: non-local Host header on a loopback request (set RECOURSE_ALLOWED_HOSTS to allow a hostname)' };
    }
    return { allow: true, reason: 'safe-method' };
  }

  if ((opts.publicPaths ?? DEFAULT_PUBLIC_MUTATION_PATHS).some((re) => re.test(path))) {
    return { allow: true, reason: 'public' };
  }
  if (opts.secretValid) return { allow: true, reason: 'secret' };

  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
  const fetchSite = String(req.headers['sec-fetch-site'] ?? '').toLowerCase();
  const crossSite = fetchSite === 'cross-site';
  if (peerLoopback && hostLocal && isLocalOrigin(origin, allowed) && !crossSite) {
    return { allow: true, reason: 'local' };
  }
  if (opts.secretConfigured) {
    return { allow: false, status: 401, error: `unauthorized: mutating API calls from outside this machine require ${MUTATION_SECRET_ENV}` };
  }
  return {
    allow: false,
    status: 403,
    error: `forbidden: remote mutating API calls are disabled until ${MUTATION_SECRET_ENV} is configured (fail-closed)`,
  };
}

function csvEnv(value: string | undefined): string[] {
  return String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function allowedHostsFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  return csvEnv(env.RECOURSE_ALLOWED_HOSTS);
}

export function trustedPeersFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  return csvEnv(env.RECOURSE_TRUSTED_PEERS);
}

export function createApiGuard(opts: ApiGuardOptions = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const secret = process.env[MUTATION_SECRET_ENV];
    const verdict = apiGuardDecision(req, {
      ...opts,
      allowedHosts: opts.allowedHosts ?? allowedHostsFromEnv(),
      trustedPeers: opts.trustedPeers ?? trustedPeersFromEnv(),
      secretConfigured: Boolean(secret && secret.trim()),
      secretValid: hasValidMutationSecret(req),
    });
    if (verdict.allow) return next();
    const denied = verdict as Extract<ApiGuardVerdict, { allow: false }>;
    res.status(denied.status).json({ success: false, error: denied.error });
  };
}

/** Listen address: loopback by default; set RECOURSE_HOST=0.0.0.0 to expose. */
export function resolveListenHost(env: NodeJS.ProcessEnv = process.env): string {
  const h = String(env.RECOURSE_HOST ?? '').trim();
  return h || '127.0.0.1';
}
