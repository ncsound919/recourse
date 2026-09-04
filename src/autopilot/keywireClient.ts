/**
 * keywireClient.ts — fetches a GitHub token from the Keywire zero-trust vault
 * at PR-create time.
 *
 * The token is fetched once, used immediately by the caller, and never
 * persisted by this module. This client only ever READS the vault: it never
 * writes, never falls back to a locally stored token, and refuses to run
 * without an explicit service token configured.
 */

export interface KeywireConfig {
  url: string;
  apiKey: string;
}

export const DEFAULT_KEYWIRE_CONFIG: KeywireConfig = {
  url: process.env.KEYWIRE_URL || 'http://localhost:3000',
  apiKey: process.env.KEYWIRE_SERVICE_TOKEN || '',
};

export class KeywireError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeywireError';
  }
}

export async function fetchGitHubToken(
  owner: string,
  config: KeywireConfig = DEFAULT_KEYWIRE_CONFIG,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (!config.apiKey) {
    throw new KeywireError('KEYWIRE_SERVICE_TOKEN not configured');
  }

  const url = `${config.url}/api/secrets/${encodeURIComponent(owner)}/github-token`;

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: 'application/json',
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new KeywireError(`Keywire token fetch unreachable: ${detail}`);
  }

  if (!res.ok) {
    throw new KeywireError(`Keywire token fetch failed: ${res.status}`);
  }

  const data = (await res.json()) as { token: string };
  return data.token;
}
