/**
 * infisicalLane.ts — Infisical access for Recourse (the vault that replaced Keywire).
 *
 * Recourse's secret dependencies (the Jev gateway key via keywireSecret, the
 * `RECOURSE_JEV_PUBLIC` toggle, the autopilot GitHub token) were Keywire-only.
 * Since 2026-10-15 the fleet's values live in Infisical (project o365), so this
 * module gives Recourse the same lane the rest of the fleet uses — with its own
 * injectable `fetch` so Recourse's tests stay hermetic (no live vault in a unit run).
 *
 * Credentials come from ONE place, the same file the CLI/MCP lane uses:
 *   .secrets/mach1.env  (CLIENT_ID / CLIENT_SECRET) under INFRASTRUCTURE/infisical,
 * or INFISICAL_MACH1_CLIENT_ID / INFISICAL_MACH1_CLIENT_SECRET in the environment.
 *
 * Honesty contract: a read never throws and never fabricates (undefined on any
 * failure); a write reports { ok:false, status?, error } honestly. No value is
 * ever logged. The 30-day universal-auth token is cached in-process only.
 */

import fs from 'node:fs';
import path from 'node:path';

export const INFISICAL_DEFAULT_URL = 'http://localhost:8081';
export const INFISICAL_TARGET_PROJECT_ID = '0d640b29-e93d-47ed-9447-d29365affb8a'; // o365
export const INFISICAL_DEFAULT_PATH = '/overlay365-fleet/prod';
export const INFISICAL_DEFAULT_ENV = 'prod';

const CRED_FILE =
  process.env.RECOURSE_INFISICAL_CRED_FILE ||
  path.join('C:', 'Users', 'User', 'Downloads', 'BUSINESS', 'INFRASTRUCTURE', 'infisical', '.secrets', 'mach1.env');

interface LaneConfig {
  url: string;
  secretPath: string;
  envSlug: string;
  clientId: string;
  clientSecret: string;
}

function readCredFile(): { id: string; secret: string } {
  try {
    if (fs.readFileSync(CRED_FILE).subarray(0, 2).toString('hex') === 'fffe') return { id: '', secret: '' }; // UTF-16 junk
    const m = Object.fromEntries(
      fs.readFileSync(CRED_FILE, 'utf8')
        .split(/\r?\n/)
        .filter((l) => l && !l.startsWith('#'))
        .map((l) => {
          const i = l.indexOf('=');
          return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
        }),
    );
    return { id: m.CLIENT_ID ?? '', secret: m.CLIENT_SECRET ?? '' };
  } catch {
    return { id: '', secret: '' };
  }
}

function config(env: NodeJS.ProcessEnv = process.env): LaneConfig {
  const file = readCredFile();
  return {
    url: (env.RECOURSE_INFISICAL_URL || env.INFISICAL_URL || INFISICAL_DEFAULT_URL).replace(/\/+$/, ''),
    secretPath: env.RECOURSE_INFISICAL_PATH || INFISICAL_DEFAULT_PATH,
    envSlug: env.RECOURSE_INFISICAL_ENV || INFISICAL_DEFAULT_ENV,
    clientId: env.INFISICAL_MACH1_CLIENT_ID || file.id,
    clientSecret: env.INFISICAL_MACH1_CLIENT_SECRET || file.secret,
  };
}

/** Are usable credentials present? (Resolution is skipped when they are not.) */
export function infisicalConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const c = config(env);
  return Boolean(c.clientId && c.clientSecret);
}

let tokenCache: { at: number; token: string } | null = null;
const TOKEN_TTL_MS = Number(process.env.RECOURSE_INFISICAL_TOKEN_TTL_MS) || 20 * 60 * 60 * 1000; // 20h < 30d token

async function login(c: LaneConfig, fetchImpl: typeof fetch, timeoutMs: number): Promise<string> {
  try {
    const r = await fetchImpl(`${c.url}/api/v1/auth/universal-auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: c.clientId, clientSecret: c.clientSecret }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return '';
    const j = (await r.json().catch(() => null)) as { accessToken?: unknown } | null;
    return typeof j?.accessToken === 'string' ? j.accessToken : '';
  } catch {
    return '';
  }
}

async function bearer(c: LaneConfig, fetchImpl: typeof fetch, timeoutMs: number): Promise<string> {
  const now = Date.now();
  if (tokenCache && now - tokenCache.at < TOKEN_TTL_MS) return tokenCache.token;
  const token = await login(c, fetchImpl, timeoutMs);
  if (token) tokenCache = { at: now, token };
  return token;
}

/** Reset the cached token (tests). */
export function resetInfisicalLaneCache(): void {
  tokenCache = null;
}

/**
 * Resolve one secret VALUE from Infisical. Never throws; `undefined` on any
 * failure (unconfigured, unreachable, absent). Values are never logged.
 */
export async function resolveInfisicalSecret(
  key: string,
  opts: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch; timeoutMs?: number; secretPath?: string; envSlug?: string } = {},
): Promise<string | undefined> {
  const env = opts.env ?? process.env;
  const c = config(env);
  if (!c.clientId || !c.clientSecret) return undefined;
  if (env.RECOURSE_DISABLE_INFISICAL === '1') return undefined;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 6000;
  const secretPath = opts.secretPath ?? c.secretPath;
  const envSlug = opts.envSlug ?? c.envSlug;
  try {
    const token = await bearer(c, fetchImpl, timeoutMs);
    if (!token) return undefined;
    const q = new URLSearchParams({
      workspaceId: INFISICAL_TARGET_PROJECT_ID,
      environment: envSlug,
      secretPath,
      viewSecretValue: 'true',
    });
    const r = await fetchImpl(`${c.url}/api/v3/secrets/raw/${encodeURIComponent(key)}?${q}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return undefined;
    const j = (await r.json().catch(() => null)) as { secret?: { secretValue?: unknown } } | null;
    const v = j?.secret?.secretValue;
    return typeof v === 'string' && v.length > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Write one secret into Infisical (the folder must already exist). Honest:
 * { ok:false, status?, error } on any failure.
 */
export async function setInfisicalSecret(
  key: string,
  value: string,
  opts: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch; timeoutMs?: number; secretPath?: string; envSlug?: string; comment?: string } = {},
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const env = opts.env ?? process.env;
  const c = config(env);
  if (!c.clientId || !c.clientSecret) return { ok: false, error: 'Infisical credentials not configured' };
  if (env.RECOURSE_DISABLE_INFISICAL === '1') return { ok: false, error: 'Infisical disabled (RECOURSE_DISABLE_INFISICAL=1)' };
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const secretPath = opts.secretPath ?? c.secretPath;
  const envSlug = opts.envSlug ?? c.envSlug;
  try {
    const token = await bearer(c, fetchImpl, timeoutMs);
    if (!token) return { ok: false, error: 'Infisical login failed' };
    const r = await fetchImpl(`${c.url}/api/v3/secrets/raw/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: INFISICAL_TARGET_PROJECT_ID,
        environment: envSlug,
        secretPath,
        secretValue: value,
        secretComment: opts.comment ?? 'set by Recourse',
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await r.text().catch(() => '');
    if (r.ok) return { ok: true, status: r.status };
    return { ok: false, status: r.status, error: `HTTP ${r.status}: ${text.slice(0, 160)}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unreachable' };
  }
}
