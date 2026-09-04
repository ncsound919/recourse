/**
 * AgentBrowser connector — lets Recourse download/fetch from the web through the
 * ecosystem's real browser service (AgentBrowser, port 3700).
 *
 * Two real surfaces (contracts read from AgentBrowser source):
 *   - GET  /api/proxy?url=            plain fetch/download of a public http(s)
 *     URL (SSRF-guarded, 15s, ~10MB). Auth: X-Agent-Auth.
 *   - POST /api/browser-task          drives the real browser: action
 *     extract | reader | search | screenshot | monitor | browser_use.
 *
 * Honesty contract:
 *   - Requires AGENTBROWSER_URL + AGENTBROWSER_API_KEY. Unset/offline/401 => an
 *     explicit error — never a fabricated download.
 *   - Only http/https targets; the proxy enforces SSRF on its side too.
 *
 * Transport note: AgentBrowser terminates Node's undici `fetch` connections
 * ('terminated'), so calls go through node:http/https and localhost is pinned to
 * 127.0.0.1 — verified stable against the live service.
 */

import http from 'node:http';
import https from 'node:https';

export type AgentBrowserMode = 'download' | 'reader' | 'extract' | 'search';
export type AgentBrowserTaskAction = 'extract' | 'reader' | 'search' | 'screenshot';

export interface AgentBrowserConfig {
  baseUrl: string;
  configured: boolean;
}

export interface AgentBrowserResult {
  ok: boolean;
  mode: AgentBrowserMode;
  text?: string;
  contentType?: string;
  httpStatus?: number;
  error?: string;
}

interface HttpResult {
  status: number;
  headers: http.IncomingHttpHeaders;
  text: string;
}

function agentBrowserBase(): string {
  return (process.env.AGENTBROWSER_URL || 'http://localhost:3700').replace(/\/+$/, '');
}

export function agentBrowserConfig(): AgentBrowserConfig {
  const base = agentBrowserBase();
  return { baseUrl: base, configured: Boolean(process.env.AGENTBROWSER_API_KEY) };
}

function agentBrowserKey(): string {
  return process.env.AGENTBROWSER_API_KEY || '';
}

/** node:http/https request helper (bypasses undici's 'terminated' quirk). */
function httpRequest(
  urlStr: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number } = {},
): Promise<HttpResult> {
  const u = new URL(urlStr);
  const mod = u.protocol === 'https:' ? https : http;
  const hostname = u.hostname === 'localhost' || u.hostname === '::1' ? '127.0.0.1' : u.hostname;
  const port = u.port || (u.protocol === 'https:' ? 443 : 80);
  return new Promise((resolve, reject) => {
    const req = mod.request(
      {
        method: opts.method || 'GET',
        hostname,
        port: Number(port),
        path: u.pathname + u.search,
        headers: opts.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
      },
    );
    req.on('error', (err) => reject(err));
    if (opts.timeoutMs) req.setTimeout(opts.timeoutMs, () => req.destroy(new Error('request timed out')));
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

/** True when AgentBrowser's open /api/health answers. No auth required. */
export async function agentBrowserOnline(timeoutMs = 4000): Promise<boolean> {
  try {
    const r = await httpRequest(`${agentBrowserBase()}/api/health`, { method: 'GET', timeoutMs });
    return r.status >= 200 && r.status < 300;
  } catch {
    return false;
  }
}

function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const MAX_TEXT = 2 * 1024 * 1024;

/** The proxy GET request shape (exposed for tests). */
export function agentBrowserProxyRequest(url: string): { url: string; headers: Record<string, string> } | null {
  if (!isValidHttpUrl(url)) return null;
  return {
    url: `${agentBrowserBase()}/api/proxy?url=${encodeURIComponent(url)}`,
    headers: {
      'X-Agent-Auth': agentBrowserKey(),
      Accept: 'text/html,application/xhtml+xml,application/json,text/plain,*/*;q=0.8',
    },
  };
}

/** The browser-task POST body shape (exposed for tests). */
export function agentBrowserTaskBody(action: AgentBrowserTaskAction, url: string, selectors?: string[]) {
  return { action, url, selectors: selectors && selectors.length ? selectors : undefined };
}

/**
 * Fetch a web URL through AgentBrowser.
 *  - mode 'download': plain proxy fetch -> raw text content.
 *  - mode 'reader' | 'extract' | 'search': drive the real browser task.
 */
export async function agentBrowserFetch(opts: {
  url: string;
  mode?: AgentBrowserMode;
  selectors?: string[];
  timeoutMs?: number;
}): Promise<AgentBrowserResult> {
  const mode: AgentBrowserMode = opts.mode ?? 'download';
  const url = opts.url;
  if (!isValidHttpUrl(url)) return { ok: false, mode, error: 'Only http/https URLs are supported' };
  if (!agentBrowserKey()) return { ok: false, mode, error: 'AgentBrowser not configured (AGENTBROWSER_API_KEY unset)' };
  if (!(await agentBrowserOnline(opts.timeoutMs))) return { ok: false, mode, error: `AgentBrowser unreachable at ${agentBrowserBase()}` };
  const timeoutMs = opts.timeoutMs ?? 60_000;

  if (mode === 'download') {
    try {
      const req = agentBrowserProxyRequest(url);
      if (!req) return { ok: false, mode, error: 'Invalid URL' };
      const r = await httpRequest(req.url, { method: 'GET', headers: req.headers, timeoutMs });
      const contentType = (r.headers['content-type'] as string) ?? undefined;
      if (r.status < 200 || r.status >= 300) return { ok: false, mode, httpStatus: r.status, error: `proxy HTTP ${r.status}` };
      return { ok: true, mode, text: r.text.slice(0, MAX_TEXT), contentType, httpStatus: r.status };
    } catch (err) {
      return { ok: false, mode, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // Real browser task: reader / extract / search.
  const action: AgentBrowserTaskAction = mode === 'search' ? 'search' : mode === 'extract' ? 'extract' : 'reader';
  try {
    const body = agentBrowserTaskBody(action, url, opts.selectors);
    const r = await httpRequest(`${agentBrowserBase()}/api/browser-task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Auth': agentBrowserKey() },
      body: JSON.stringify(body),
      timeoutMs,
    });
    if (r.status < 200 || r.status >= 300) return { ok: false, mode, httpStatus: r.status, error: `browser-task HTTP ${r.status}` };
    const data = JSON.parse(r.text) as { success?: boolean; content?: string; error?: string; taskId?: string };
    if (data.success === false || (!data.content && data.error)) {
      return { ok: false, mode, error: data.error || 'browser task failed' };
    }
    return { ok: true, mode, text: (data.content ?? '').slice(0, MAX_TEXT), httpStatus: r.status };
  } catch (err) {
    return { ok: false, mode, error: err instanceof Error ? err.message : String(err) };
  }
}
