/**
 * jevAccess.ts — Keywire-backed public/closed toggle for the Jev advisory
 * routes (which trigger PAID provider calls).
 *
 * The operator controls exposure from the Keywire vault: a secret named
 * `RECOURSE_JEV_PUBLIC` in the configured project/environment (value "1" =
 * public, anything else = closed). Recourse reads it with a short TTL cache so
 * the switch flips open "as needed" and closed "when not in use" without a
 * restart. A static env override (`RECOURSE_JEV_PUBLIC`) still wins when set —
 * the vault is the default control plane.
 *
 * Honesty contract: a down/unauthorized Keywire never blocks a decision — the
 * resolver returns undefined and the guard falls back to CLOSED.
 */

const KEYWIRE_DEFAULT_URL = 'http://127.0.0.1:3000';
const KEYWIRE_DEFAULT_PROJECT = 'prj-mt7jrul1'; // Overlay365 Fleet
const KEYWIRE_DEFAULT_ENV = 'production';
const KEYWIRE_DEFAULT_TTL_MS = 30_000;
const TOGGLE_KEY = 'RECOURSE_JEV_PUBLIC';

let cache: { value: string | undefined; at: number } = { value: undefined, at: 0 };

function config(env: NodeJS.ProcessEnv = process.env): { url: string; project: string; envSlug: string; token: string; ttlMs: number } {
  return {
    url: (env.KEYWIRE_URL || KEYWIRE_DEFAULT_URL).replace(/\/+$/, ''),
    project: env.KEYWIRE_JEV_PROJECT || KEYWIRE_DEFAULT_PROJECT,
    envSlug: env.KEYWIRE_JEV_ENV || KEYWIRE_DEFAULT_ENV,
    token: (env.KEYWIRE_SERVICE_TOKEN || '').trim(),
    ttlMs: Number(env.KEYWIRE_JEV_TTL_MS) || KEYWIRE_DEFAULT_TTL_MS,
  };
}

/** Read the toggle from the Keywire vault export (decrypted values). Honest:
 *  any failure returns undefined, never a fabricated value. */
export async function readJevPublicFromKeywire(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<string | undefined> {
  const c = config(env);
  const now = Date.now();
  if (cache.value !== undefined && now - cache.at < c.ttlMs) return cache.value;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (c.token) headers.Authorization = `Bearer ${c.token}`;
  try {
    const res = await fetchImpl(`${c.url}/api/v1/projects/${c.project}/envs/${c.envSlug}/export?format=json`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      cache = { value: undefined, at: now };
      return undefined;
    }
    const body = (await res.json()) as Record<string, unknown>;
    const raw = typeof body[TOGGLE_KEY] === 'string' ? (body[TOGGLE_KEY] as string).trim() : undefined;
    cache = { value: raw, at: now };
    return raw;
  } catch {
    cache = { value: undefined, at: now };
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** Resolved toggle: static env override wins; otherwise the (cached) Keywire
 *  vault value; otherwise undefined (CLOSED). */
export async function resolveJevPublic(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<string | undefined> {
  const envValue = (env.RECOURSE_JEV_PUBLIC || '').trim();
  if (envValue === '1' || envValue === '0') return envValue;
  return readJevPublicFromKeywire(env, fetchImpl);
}

/** Write the toggle into the Keywire vault so operators flip it "as needed".
 *  Returns ok:false honestly when Keywire is down or the write is rejected. */
export async function setJevPublic(
  value: '1' | '0',
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; error?: string; status?: number }> {
  const c = config(env);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (c.token) headers.Authorization = `Bearer ${c.token}`;
  try {
    const res = await fetchImpl(`${c.url}/api/v1/projects/${c.project}/envs/${c.envSlug}/secrets`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ key: TOGGLE_KEY, value }),
      signal: controller.signal,
    });
    const text = await res.text().catch(() => '');
    if (res.ok) {
      cache = { value, at: Date.now() };
      return { ok: true };
    }
    return { ok: false, status: res.status, error: `HTTP ${res.status}: ${text.slice(0, 160)}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

export { TOGGLE_KEY };

/** Test seam: clear the cached Keywire toggle so a fresh read happens. */
export function resetJevPublicCache(): void {
  cache = { value: undefined, at: 0 };
}