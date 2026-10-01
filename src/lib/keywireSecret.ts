/**
 * keywireSecret.ts — Keywire-first secret resolution for Recourse.
 *
 * Shared fleet credentials (the TypeSafe/Jev gateway key `AI_GATEWAY_API_KEY`,
 * etc.) live in the Keywire zero-trust vault — project `prj-mt7jrul1`
 * (overlay365-fleet) / env `production` — NOT in committed env files. This module
 * resolves a secret from Keywire FIRST and falls back to `process.env` only when
 * the vault is unavailable or does not hold the key.
 *
 * Auth chain (mirrors Axiom's src/server/fleet.ts — the proven path):
 *   1. POST {KEYWIRE_URL}/api/v1/auth/service-token/exchange { token: KEYWIRE_SERVICE_TOKEN }
 *      -> { accessToken }   (short-lived vault JWT)
 *   2. GET  {KEYWIRE_URL}/api/v1/projects/:project/envs/:env/secrets?unmask=true
 *      with `Authorization: Bearer <accessToken>` -> [{ key, value }, ...]
 *
 * Honesty contract: never throws, never logs a value, returns `source:'none'`
 * on total failure so callers can keep their own deterministic fallback. The
 * vault is the source of truth: with the default `preferKeywire`, a vault value
 * WINS over the same key in env (pass `{ preferKeywire: false }` for env-first).
 */

const DEFAULT_URL = 'http://127.0.0.1:3000';
const DEFAULT_PROJECT = 'prj-mt7jrul1'; // overlay365-fleet
const DEFAULT_ENV = 'production';

function cfg(): { url: string; token: string; project: string; env: string } {
  return {
    url: (process.env.KEYWIRE_URL || DEFAULT_URL).replace(/\/+$/, ''),
    token: (process.env.KEYWIRE_SERVICE_TOKEN || '').trim(),
    project: process.env.KEYWIRE_PROJECT_ID || DEFAULT_PROJECT,
    env: process.env.KEYWIRE_ENV_SLUG || DEFAULT_ENV,
  };
}

const CACHE_TTL_MS = Number(process.env.KEYWIRE_SECRET_TTL_MS) || 10 * 60_000;

let secretsCache: { at: number; secrets: Record<string, string> } | null = null;

/** Is a Keywire service token configured? (resolution is skipped without one). */
export function keywireConfigured(): boolean {
  return Boolean(cfg().token);
}

async function exchangeToken(): Promise<string> {
  const c = cfg();
  if (!c.token) return '';
  try {
    const r = await fetch(`${c.url}/api/v1/auth/service-token/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: c.token }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return '';
    const j = (await r.json().catch(() => null)) as { accessToken?: unknown } | null;
    return typeof j?.accessToken === 'string' ? j.accessToken : '';
  } catch {
    return '';
  }
}

/** How long a failed vault fetch is remembered before retrying (avoids paying the
 *  token-exchange + fetch timeouts on every resolveSecret call while Keywire is down). */
const NEGATIVE_TTL_MS = Number(process.env.KEYWIRE_NEGATIVE_TTL_MS) || 60_000;
let failedAt = 0;
let inflight: Promise<Record<string, string>> | null = null;

async function fetchAllSecretsUncached(): Promise<Record<string, string> | null> {
  const c = cfg();
  const bearer = await exchangeToken();
  if (!bearer) return null;
  try {
    const url = `${c.url}/api/v1/projects/${encodeURIComponent(c.project)}/envs/${encodeURIComponent(c.env)}/secrets?unmask=true`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${bearer}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return null;
    const rows = (await r.json().catch(() => null)) as Array<{ key?: unknown; value?: unknown }> | null;
    if (!Array.isArray(rows)) return null;
    const secrets: Record<string, string> = {};
    for (const row of rows) {
      const k = row?.key;
      const v = row?.value;
      if (!k || v === undefined || v === null) continue;
      secrets[String(k)] = String(v);
    }
    return secrets;
  } catch {
    return null;
  }
}

/** Fetch every vault secret value for the configured project/env (cached,
 *  single-flight, negatively cached on failure). */
async function fetchAllSecrets(): Promise<Record<string, string>> {
  const now = Date.now();
  if (secretsCache && now - secretsCache.at < CACHE_TTL_MS) return secretsCache.secrets;
  if (!cfg().token) return {};
  if (failedAt && now - failedAt < NEGATIVE_TTL_MS) return secretsCache?.secrets ?? {};
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const secrets = await fetchAllSecretsUncached();
      if (secrets) {
        secretsCache = { at: Date.now(), secrets };
        failedAt = 0;
        return secrets;
      }
      failedAt = Date.now();
      // Serve the last known-good snapshot rather than dropping to env mid-run.
      return secretsCache?.secrets ?? {};
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export interface ResolvedSecret {
  value: string;
  source: 'keywire' | 'env' | 'none';
}

/**
 * Resolve a secret Keywire-FIRST, env fallback. Cached for `KEYWIRE_SECRET_TTL_MS`
 * (default 10m). Pass `{ preferKeywire: false }` to force env-first. Never throws.
 */
export async function resolveSecret(key: string, opts: { preferKeywire?: boolean } = {}): Promise<ResolvedSecret> {
  const preferKeywire = opts.preferKeywire !== false;
  const envValue = (process.env[key] || '').trim();

  if (!preferKeywire && envValue) return { value: envValue, source: 'env' };

  const secrets = await fetchAllSecrets();
  const kwValue = (secrets[String(key)] || '').trim();
  if (kwValue) return { value: kwValue, source: 'keywire' };
  if (envValue) return { value: envValue, source: 'env' };
  return { value: '', source: 'none' };
}

/** Test/reset hook — clears the in-memory vault cache. */
export function resetKeywireSecretCache(): void {
  secretsCache = null;
  failedAt = 0;
  inflight = null;
}
