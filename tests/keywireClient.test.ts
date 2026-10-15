// keywireClient.test.ts — the autopilot's GitHub token, now resolved from
// Infisical. The previous version of this file pinned a Keywire route that does
// not exist (`/api/secrets/:owner/github-token`), so it validated a fiction:
// the loop's PR path could never have obtained a token. These cases exercise the
// real contract, with the lane's fetch injected so no live vault is touched.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  DEFAULT_KEYWIRE_CONFIG,
  KeywireError,
  fetchGitHubToken,
  githubTokenCandidates,
} from '../src/autopilot/keywireClient';
import { resetInfisicalLaneCache } from '../src/lib/infisicalLane';

beforeEach(() => {
  resetInfisicalLaneCache();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetInfisicalLaneCache();
});

function okJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** A lane stub: login succeeds, and secrets resolve from `values` by name. */
function laneFetch(values: Record<string, string>): { fn: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/api/v1/auth/universal-auth/login')) return okJson({ accessToken: 'jwt-1' });
    const m = url.match(/\/api\/v3\/secrets\/raw\/([^?]+)/);
    const name = m ? decodeURIComponent(m[1]) : '';
    if (values[name] !== undefined) return okJson({ secret: { secretValue: values[name] } });
    return okJson({ message: 'not found' }, 404);
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('fetchGitHubToken — resolves from Infisical', () => {
  it('returns a per-owner PAT when one exists, trying it before GITHUB_TOKEN', async () => {
    const { fn, calls } = laneFetch({ GITHUB_PAT_ACME_INC: 'pat_y', GITHUB_TOKEN: 'gh_x' });
    const token = await fetchGitHubToken('acme-inc', DEFAULT_KEYWIRE_CONFIG, fn);
    expect(token).toBe('pat_y');
    const secretCalls = calls.filter((u) => u.includes('/api/v3/secrets/raw/'));
    expect(secretCalls[0]).toContain('GITHUB_PAT_ACME_INC');
  });

  it('falls back to GITHUB_TOKEN when the owner has no PAT', async () => {
    const { fn } = laneFetch({ GITHUB_TOKEN: 'gh_x' });
    await expect(fetchGitHubToken('nowhere', DEFAULT_KEYWIRE_CONFIG, fn)).resolves.toBe('gh_x');
  });

  it('caches the lane token across calls (one login for two fetches)', async () => {
    const { fn, calls } = laneFetch({ GITHUB_TOKEN: 'gh_x' });
    await fetchGitHubToken('a', DEFAULT_KEYWIRE_CONFIG, fn);
    await fetchGitHubToken('b', DEFAULT_KEYWIRE_CONFIG, fn);
    expect(calls.filter((u) => u.includes('/auth/universal-auth/login'))).toHaveLength(1);
  });

  it('throws KeywireError naming the candidates when the vault yields nothing', async () => {
    const { fn } = laneFetch({}); // login ok, both secrets 404
    await expect(fetchGitHubToken('acme', DEFAULT_KEYWIRE_CONFIG, fn)).rejects.toThrow(KeywireError);
    await expect(fetchGitHubToken('acme', DEFAULT_KEYWIRE_CONFIG, fn)).rejects.toThrow(
      /GitHub token unavailable from Infisical/,
    );
  });

  it('throws KeywireError when the lane is disabled (no vault configured)', async () => {
    vi.stubEnv('RECOURSE_DISABLE_INFISICAL', '1');
    const { fn } = laneFetch({ GITHUB_TOKEN: 'gh_x' });
    await expect(fetchGitHubToken('acme', DEFAULT_KEYWIRE_CONFIG, fn)).rejects.toThrow(KeywireError);
  });

  it('derives candidate names from the owner, sanitized', () => {
    expect(githubTokenCandidates('Acme-Inc.io')).toEqual(['GITHUB_PAT_ACME_INC_IO', 'GITHUB_TOKEN']);
    expect(githubTokenCandidates('')).toEqual(['GITHUB_TOKEN']);
  });
});

describe('DEFAULT_KEYWIRE_CONFIG (legacy export, kept for compatibility)', () => {
  it('derives from env at module load', async () => {
    vi.stubEnv('KEYWIRE_URL', 'https://keywire.internal');
    vi.stubEnv('KEYWIRE_SERVICE_TOKEN', 'env-token');
    vi.resetModules();

    const fresh = await import('../src/autopilot/keywireClient');
    expect(fresh.DEFAULT_KEYWIRE_CONFIG.url).toBe('https://keywire.internal');
    expect(fresh.DEFAULT_KEYWIRE_CONFIG.apiKey).toBe('env-token');
  });

  it('keeps the out-of-box default host when env is unset', () => {
    expect(DEFAULT_KEYWIRE_CONFIG.url).toBe('http://localhost:4700');
  });
});
