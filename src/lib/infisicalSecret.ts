/**
 * infisicalSecret.ts — vault-first secret resolution for Recourse.
 *
 * 2026-10-15: the fleet's secrets live in Infisical (project o365; identity
 * mach1) and Keywire was retired ecosystem-wide. This module is Infisical-only:
 * resolution is Infisical FIRST, `process.env` LAST.
 *
 * Honesty contract: never throws, never logs a value, returns source:'none' on
 * total failure. Pass `{ preferVault: false }` for env-first.
 */
export interface ResolvedSecret {
  value: string;
  source: 'infisical' | 'env' | 'none';
}

export async function resolveSecret(key: string, opts: { preferVault?: boolean } = {}): Promise<ResolvedSecret> {
  const preferVault = opts.preferVault !== false;
  const envValue = (process.env[key] || '').trim();

  if (!preferVault && envValue) return { value: envValue, source: 'env' };

  const { resolveInfisicalSecret } = await import('./infisicalLane.js');
  const infValue = ((await resolveInfisicalSecret(key)) ?? '').trim();
  if (infValue) return { value: infValue, source: 'infisical' };

  if (envValue) return { value: envValue, source: 'env' };
  return { value: '', source: 'none' };
}

/** Test/reset hook — clears the Infisical lane cache. */
export async function resetSecretCache(): Promise<void> {
  const { resetInfisicalLaneCache } = await import('./infisicalLane.js');
  resetInfisicalLaneCache();
}
