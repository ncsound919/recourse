/**
 * keywireClient.ts — the autopilot's GitHub token.
 *
 * HISTORY, 2026-10-15 audit: this fetched
 * `GET {url}/api/secrets/{owner}/github-token` — a route Keywire never
 * registered (its 122-route inventory has no `/api/secrets/`). The unit test
 * passed only because it stubbed fetch, so the loop's PR path could never
 * actually have obtained a token. It now resolves from Infisical (primary since
 * the migration): `GITHUB_PAT_<OWNER>` when present, else `GITHUB_TOKEN`.
 *
 * The token is used by the caller and never persisted here, and no value is logged.
 */

import { resolveInfisicalSecret } from '../lib/infisicalLane.js';

/** LEGACY Keywire config — kept for compatibility (and its env-derived default);
 *  token resolution no longer uses it. */
export interface KeywireConfig {
  url: string;
  apiKey: string;
  /** Timeout ms for the token fetch (a hung vault must not wedge the loop). */
  timeoutMs?: number;
}

export const DEFAULT_KEYWIRE_CONFIG: KeywireConfig = {
  url: process.env.KEYWIRE_URL || 'http://localhost:4700',
  apiKey: process.env.KEYWIRE_SERVICE_TOKEN || '',
  timeoutMs: 10_000,
};

export class KeywireError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeywireError';
  }
}

/** Candidate secret names for an owner, most specific first. */
export function githubTokenCandidates(owner: string): string[] {
  const slug = owner.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return slug ? [`GITHUB_PAT_${slug}`, 'GITHUB_TOKEN'] : ['GITHUB_TOKEN'];
}

export async function fetchGitHubToken(
  owner: string,
  config: KeywireConfig = DEFAULT_KEYWIRE_CONFIG,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const timeoutMs = config.timeoutMs ?? 10_000;
  for (const name of githubTokenCandidates(owner)) {
    const value = await resolveInfisicalSecret(name, { fetchImpl, timeoutMs });
    if (value) return value;
  }
  throw new KeywireError(
    `GitHub token unavailable from Infisical for '${owner}' (tried ${githubTokenCandidates(owner).join(', ')})`,
  );
}
