/**
 * jevAccess.ts — Infisical-backed public/closed toggle for the Jev advisory
 * routes (which trigger PAID provider calls).
 *
 * The operator controls exposure from the vault: a secret named
 * `RECOURSE_JEV_PUBLIC` (value "1" = public, anything else = closed). Recourse
 * reads it with a short TTL cache so the switch flips open "as needed" and
 * closed "when not in use" without a restart. A static env override
 * (`RECOURSE_JEV_PUBLIC`) still wins — the vault is the default control plane.
 *
 * 2026-10-15: the vault is Infisical (Keywire retired ecosystem-wide); this
 * module is Infisical-only.
 *
 * Honesty contract: a down/unauthorized vault never blocks a decision — the
 * resolver returns undefined and the guard falls back to CLOSED.
 */

const TOGGLE_KEY = 'RECOURSE_JEV_PUBLIC';
const TTL_MS = Number(process.env.RECOURSE_JEV_TTL_MS) || 30_000;

let cache: { value: string | undefined; at: number } = { value: undefined, at: 0 };

/** Resolved toggle: static env override wins; otherwise Infisical; otherwise
 *  undefined (CLOSED). The injected fetchImpl is threaded into the lane so tests
 *  stay hermetic. */
export async function resolveJevPublic(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<string | undefined> {
  const envValue = (env.RECOURSE_JEV_PUBLIC || '').trim();
  if (envValue === '1' || envValue === '0') return envValue;

  const now = Date.now();
  if (cache.value !== undefined && now - cache.at < TTL_MS) return cache.value;

  const { resolveInfisicalSecret } = await import('./infisicalLane.js');
  const viaLane = await resolveInfisicalSecret(TOGGLE_KEY, { env, fetchImpl });
  cache = { value: viaLane, at: now };
  return viaLane;
}

/** Write the toggle so operators flip it "as needed". Infisical only (the one
 *  vault); honest `ok:false` when the write fails. */
export async function setJevPublic(
  value: '1' | '0',
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; error?: string; status?: number }> {
  const { setInfisicalSecret } = await import('./infisicalLane.js');
  const lane = await setInfisicalSecret(TOGGLE_KEY, value, { env, fetchImpl, comment: 'Recourse Jev public/closed toggle' });
  if (lane.ok) {
    cache = { value, at: Date.now() };
    return { ok: true };
  }
  return { ok: false, status: lane.status, error: lane.error ?? 'Infisical write failed' };
}

export { TOGGLE_KEY };

/** Test seam: clear the cached toggle so a fresh read happens. */
export function resetJevPublicCache(): void {
  cache = { value: undefined, at: 0 };
}
