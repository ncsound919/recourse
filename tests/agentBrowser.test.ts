import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import {
  agentBrowserProxyRequest,
  agentBrowserTaskBody,
  agentBrowserFetch,
} from '../src/lib/agentBrowser';

const ENV_KEYS = ['AGENTBROWSER_URL', 'AGENTBROWSER_API_KEY'] as const;
function stashEnv() {
  const prev: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) { prev[k] = process.env[k]; }
  return prev;
}
function restoreEnv(prev: Record<string, string | undefined>) {
  for (const k of ENV_KEYS) {
    if (prev[k] === undefined) delete process.env[k];
    else process.env[k] = prev[k];
  }
}
let prev: Record<string, string | undefined> = {};
beforeEach(() => { prev = stashEnv(); });
afterEach(() => restoreEnv(prev));

describe('AgentBrowser connector', () => {
  it('builds the proxy GET request with auth header', () => {
    process.env.AGENTBROWSER_URL = 'http://localhost:3700';
    process.env.AGENTBROWSER_API_KEY = 'sekret';
    const req = agentBrowserProxyRequest('https://example.com/page?x=1');
    expect(req).not.toBeNull();
    expect(req!.url).toContain('/api/proxy?url=');
    expect(req!.url).toContain(encodeURIComponent('https://example.com/page?x=1'));
    expect(req!.headers['X-Agent-Auth']).toBe('sekret');
  });

  it('refuses non-http(s) URLs in the proxy request', () => {
    process.env.AGENTBROWSER_URL = 'http://localhost:3700';
    expect(agentBrowserProxyRequest('file:///etc/passwd')).toBeNull();
    expect(agentBrowserProxyRequest('ftp://x')).toBeNull();
    expect(agentBrowserProxyRequest('not a url')).toBeNull();
  });

  it('builds the browser-task body per action', () => {
    expect(agentBrowserTaskBody('reader', 'https://a.b')).toEqual({ action: 'reader', url: 'https://a.b', selectors: undefined });
    expect(agentBrowserTaskBody('extract', 'https://a.b', ['h1', '.x'])).toEqual({ action: 'extract', url: 'https://a.b', selectors: ['h1', '.x'] });
  });

  it('fails honestly when not configured (no key)', async () => {
    process.env.AGENTBROWSER_URL = 'http://localhost:3700';
    delete process.env.AGENTBROWSER_API_KEY;
    const res = await agentBrowserFetch({ url: 'https://example.com' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/AGENTBROWSER_API_KEY/);
  });

  it('rejects a bad URL before any network call', async () => {
    process.env.AGENTBROWSER_API_KEY = 'sekret';
    const res = await agentBrowserFetch({ url: 'gopher://x' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Only http\/https/);
  });

  it('fails honestly when AgentBrowser is unreachable', async () => {
    process.env.AGENTBROWSER_URL = 'http://127.0.0.1:59997';
    process.env.AGENTBROWSER_API_KEY = 'sekret';
    const res = await agentBrowserFetch({ url: 'https://example.com', timeoutMs: 4000 });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/unreachable/);
  });
});
