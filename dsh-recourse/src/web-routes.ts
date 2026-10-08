/**
 * The authenticated web proxy that the in-harness panel reads from.
 *
 * ## Why a proxy and not a direct fetch from the browser
 *
 * The panel runs on the harness origin (`127.0.0.1:3080`) and Recourse lives on
 * a different one (`127.0.0.1:3050`). A browser fetch across those is a
 * cross-origin request, which would force one of two bad outcomes: loosening
 * Recourse's CORS policy so any page on the machine can read the whole system
 * state, or shipping `RECOURSE_API_SECRET` to the browser. Both are worse than
 * one small server-side route.
 *
 * So the panel fetches `/plugins/dsh-recourse/api/...` and this handler
 * forwards it, adding the secret on the way out and never returning it.
 *
 * ## Why the auth gate is mandatory, not advisory
 *
 * `webServer.register` routes do NOT inherit the web app's authentication --
 * `dsh-teams-x/lib/web-routes.js` says so explicitly and wraps every handler in
 * `connection.requestRejection(req)`. A route registered without that gate would
 * hand Recourse's full state, and its guarded mutations, to any process that can
 * open a local socket. `resolveCapabilities` therefore refuses to mount at all
 * when no connection gate is present.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

import type { Json, RecourseApi } from './api.js';
import type { ConnectionLike, WebServerLike } from './compat.js';

/** Route prefix. Namespaced under `/plugins/` to match the shipped convention. */
export const PROXY_PREFIX = '/plugins/dsh-recourse/api';

/** Only these upstream verbs are forwarded. Anything else is refused, not proxied. */
const ALLOWED_METHODS = new Set(['GET', 'POST']);

/** Recourse keeps its HTTP surface under `/api/`; refuse to relay anything else. */
const REQUIRED_UPSTREAM_PREFIX = '/api/';

const NO_STORE = { 'cache-control': 'no-store' } as const;

/** Write a JSON error with the given status. */
function fail(res: ServerResponse, status: number, error: string): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...NO_STORE });
  res.end(JSON.stringify({ success: false, error }));
}

/** Read a request body, bounded so a hostile client cannot exhaust memory. */
async function readBody(req: IncomingMessage, limitBytes: number): Promise<Buffer | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;

  const chunks: Buffer[] = [];
  let total = 0;

  return new Promise<Buffer | undefined>((resolve, reject) => {
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > limitBytes) {
        reject(new Error(`request body exceeded ${limitBytes} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', (error: Error) => reject(error));
  });
}

/**
 * Map a harness request onto a Recourse path.
 *
 * Returns `undefined` when the request must not be relayed. This is the
 * security-relevant function: it is what stops the proxy from becoming an open
 * relay into whatever else answers on Recourse's port.
 */
function upstreamPath(pathname: string): string | undefined {
  if (!pathname.startsWith(PROXY_PREFIX)) return undefined;

  const remainder = pathname.slice(PROXY_PREFIX.length);
  // A trailing-slash-only remainder keeps the well-formed `/api` case explicit
  // rather than letting it collapse to the origin root.
  const candidate = remainder.length === 0 || remainder === '/' ? REQUIRED_UPSTREAM_PREFIX : remainder;

  if (!candidate.startsWith(REQUIRED_UPSTREAM_PREFIX)) return undefined;
  // Traversal can only be attempted after the prefix check, so this is a
  // belt-and-braces guard rather than the primary defence.
  if (candidate.includes('..') || candidate.includes('\\') || candidate.includes('\0')) return undefined;
  return candidate;
}

/**
 * Register the proxy route. The returned function unregisters it.
 *
 * @param webServer - host web server, already known to exist.
 * @param connection - host auth gate, already known to exist.
 * @param api - configured Recourse client (its secret is attached here, not in the browser).
 * @param requestTimeoutMs - deadline applied to one relayed request.
 * @param maxBodyBytes - ceiling on a relayed request body.
 */
export function mountProxy(
  webServer: WebServerLike,
  connection: ConnectionLike,
  api: RecourseApi,
  requestTimeoutMs: number,
  maxBodyBytes = 1_048_576,
): () => void {
  return webServer.register({
    kind: 'prefix',
    path: PROXY_PREFIX,
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      // 1. Authenticate before anything else touches the request.
      const rejection = connection.requestRejection(req);
      if (rejection !== undefined) {
        res.writeHead(rejection, { 'content-type': 'application/json; charset=utf-8', ...NO_STORE });
        res.end(
          JSON.stringify({
            success: false,
            error:
              rejection === 503
                ? 'authentication unavailable'
                : rejection === 401
                  ? 'unauthorized'
                  : 'forbidden',
          }),
        );
        return;
      }

      // 2. Only GET/POST is relayed.
      const method = (req.method ?? 'GET').toUpperCase();
      if (!ALLOWED_METHODS.has(method)) {
        res.writeHead(405, { allow: [...ALLOWED_METHODS].join(', '), ...NO_STORE });
        res.end();
        return;
      }

      // 3. Resolve and validate the upstream path.
      const url = new URL(req.url ?? '/', 'http://harness.invalid');
      const target = upstreamPath(url.pathname);
      if (target === undefined) {
        fail(res, 404, `no recourse route for ${url.pathname}`);
        return;
      }

      // 4. Read the body with a ceiling.
      let body: Buffer | undefined;
      try {
        body = await readBody(req, maxBodyBytes);
      } catch (error) {
        fail(res, 413, error instanceof Error ? error.message : 'request body rejected');
        return;
      }

      // 5. Relay, forwarding the secret server-side only.
      const suffix = url.search.length > 0 ? url.search : '';
      try {
        const upstream = await fetch(`${api.baseUrl}${target}${suffix}`, {
          method,
          headers: body === undefined ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' },
          ...(body === undefined ? {} : { body: body.toString('utf8') }),
          signal: AbortSignal.timeout(requestTimeoutMs),
        });

        const text = await upstream.text();
        res.writeHead(upstream.status, {
          'content-type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
          ...NO_STORE,
        });
        res.end(text);
      } catch (error) {
        // The upstream message may mention the secret's presence; it never
        // contains the secret itself, so relaying the text is safe and far more
        // useful than a generic 502 to whoever is debugging the panel.
        const reason = error instanceof Error ? error.message : String(error);
        fail(res, 502, `Recourse is unreachable at ${api.baseUrl}: ${reason}`);
      }
    },
  });
}

/** Exposed for the panel's own diagnostics endpoint. */
export const proxyInfo = (api: RecourseApi): Json => ({
  prefix: PROXY_PREFIX,
  upstream: api.baseUrl,
  authenticated: true,
  secretForwardedServerSide: api.hasSecret,
  allowedMethods: [...ALLOWED_METHODS],
});