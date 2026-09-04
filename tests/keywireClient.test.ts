import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DEFAULT_KEYWIRE_CONFIG,
  KeywireError,
  fetchGitHubToken,
} from '../src/autopilot/keywireClient';

afterEach(() => {
  vi.unstubAllEnvs();
});

function okJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('fetchGitHubToken — zero-trust token fetch', () => {
  it('throws KeywireError (and makes no network call) when apiKey is missing', async () => {
    const fetchImpl = vi.fn();
    const config = { url: 'http://keywire.test', apiKey: '' };
    await expect(fetchGitHubToken('acme', config, fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      KeywireError,
    );
    await expect(
      fetchGitHubToken('acme', config, fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/KEYWIRE_SERVICE_TOKEN not configured/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fetches the token and sends Bearer auth + owner secret path', async () => {
    const fetchImpl = vi.fn(async () => okJson({ token: 'gh_x' }));
    const config = { url: 'https://keywire.test', apiKey: 'svc-secret' };

    const token = await fetchGitHubToken('acme-inc', config, fetchImpl as unknown as typeof fetch);

    expect(token).toBe('gh_x');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const args = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const [url, init] = args;
    expect(url).toBe('https://keywire.test/api/secrets/acme-inc/github-token');
    expect(url).toContain('acme-inc');
    expect(url).toContain('/github-token');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer svc-secret');
  });

  it('throws KeywireError with the status on a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => okJson({ message: 'nope' }, 500));
    const config = { url: 'http://keywire.test', apiKey: 'svc-secret' };
    await expect(
      fetchGitHubToken('acme', config, fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/Keywire token fetch failed: 500/);
    await expect(
      fetchGitHubToken('acme', config, fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(KeywireError);
  });

  it('wraps a network failure in a KeywireError mentioning unreachable', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const config = { url: 'http://keywire.test', apiKey: 'svc-secret' };
    await expect(
      fetchGitHubToken('acme', config, fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/unreachable/);
  });

  it('derives DEFAULT_KEYWIRE_CONFIG from env at module load', async () => {
    vi.stubEnv('KEYWIRE_URL', 'https://keywire.internal');
    vi.stubEnv('KEYWIRE_SERVICE_TOKEN', 'env-token');
    vi.resetModules();

    const fresh = await import('../src/autopilot/keywireClient');
    expect(fresh.DEFAULT_KEYWIRE_CONFIG.url).toBe('https://keywire.internal');
    expect(fresh.DEFAULT_KEYWIRE_CONFIG.apiKey).toBe('env-token');
  });

  it('keeps the out-of-box default host when env is unset', () => {
    expect(DEFAULT_KEYWIRE_CONFIG.url).toBe('http://localhost:3000');
  });
});
