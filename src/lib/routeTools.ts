/**
 * routeTools — auto-registers Recourse's live REST operations (from the OpenAPI
 * index) as model-callable agent tools.
 *
 * This makes every bridge/sidecar route reachable by the model without bespoke
 * wiring. It is deliberately generic: an operation is invoked as
 * `{ params?, query?, body? }`, and `mutating` operations are flagged so the
 * loop can gate them on mutation authorization. Honest HTTP errors are returned
 * verbatim; nothing is fabricated.
 */
import { listOperations, type OpenApiSpec, type OperationIndexEntry } from './openapi.js';
import type { AgentToolProvider } from './agentTools.js';

export interface RouteToolProviderOptions {
  spec: OpenApiSpec;
  /** Base URL of this Recourse server, e.g. http://127.0.0.1:3050 */
  baseUrl: string;
  /** Mutation secret sent as Bearer on mutating calls. */
  secret?: string;
  /** Path prefixes to skip (e.g. the agent route itself, to avoid recursion). */
  excludePrefixes?: string[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxTools?: number;
}

const ROUTE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    params: { type: 'object', description: 'Path parameters (e.g. {"id": "..."}).' },
    query: { type: 'object', description: 'Query-string parameters.' },
    body: { type: 'object', description: 'JSON request body (for POST/PUT/PATCH).' },
  },
  additionalProperties: false,
};

function routeToolName(op: OperationIndexEntry): string {
  const slug = op.path
    .replace(/^\/+/, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${op.method.toLowerCase()}_${slug}`.slice(0, 60);
}

export function createRouteToolProvider(opts: RouteToolProviderOptions): AgentToolProvider {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 20000;
  const maxTools = opts.maxTools ?? 300;
  const exclude = (opts.excludePrefixes ?? ['/api/recourse/agent/tools']).map((p) => p.replace(/\/+$/, ''));

  const operations = listOperations(opts.spec)
    .filter((op) => op.method !== 'HEAD' && op.method !== 'OPTIONS')
    .filter((op) => !exclude.some((p) => op.path === p || op.path.startsWith(`${p}/`)))
    .slice(0, maxTools);

  const byTarget = new Map<string, OperationIndexEntry>();
  const specs = operations.map((op) => {
    const target = `${op.method} ${op.path}`;
    byTarget.set(target, op);
    return {
      name: routeToolName(op),
      description: `${op.summary || `${op.method} ${op.path}`} (${op.method} ${op.path})${op.mutating ? ' [mutating]' : ''}`,
      parameters: ROUTE_SCHEMA,
      target,
      mutating: op.mutating,
    };
  });

  return {
    source: 'route',
    async list() {
      return specs;
    },

    async invoke(target, args) {
      const op = byTarget.get(target);
      if (!op) return { ok: false, error: `unknown route operation "${target}"` };

      let path = op.path;
      const params = (args.params && typeof args.params === 'object' ? args.params : {}) as Record<string, unknown>;
      // OpenAPI uses {name}; Express uses :name. Support both, globally.
      const paramPattern = /\{([A-Za-z0-9_]+)\}|:([A-Za-z0-9_]+)/g;
      const missing: string[] = [];
      path = path.replace(paramPattern, (_m, braceName, colonName) => {
        const key = braceName || colonName;
        const value = params[key] ?? (args as Record<string, unknown>)[key];
        if (value === undefined) { missing.push(key); return _m; }
        return encodeURIComponent(String(value));
      });
      if (missing.length) return { ok: false, error: `missing path parameter(s): ${missing.join(', ')}` };

      let url: URL;
      try {
        url = new URL(`${opts.baseUrl.replace(/\/+$/, '')}${path}`);
      } catch {
        return { ok: false, error: `invalid request URL for ${path}` };
      }
      const query = args.query && typeof args.query === 'object' ? (args.query as Record<string, unknown>) : {};
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }

      const headers: Record<string, string> = {};
      const init: RequestInit = { method: op.method, headers };
      const body = args.body;
      if (op.method !== 'GET' && body !== undefined) {
        headers['content-type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
      // Send the secret on every call when configured: some GET routes are
      // secret-guarded, and mutating routes require it. Harmless for open routes.
      if (opts.secret) headers.Authorization = `Bearer ${opts.secret}`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchImpl(url.toString(), { ...init, signal: controller.signal });
        const text = await res.text().catch(() => '');
        let data: unknown = text;
        try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}${text ? `: ${text.slice(0, 300)}` : ''}` };
        return { ok: true, result: data };
      } catch (err: any) {
        const aborted = err?.name === 'AbortError';
        return { ok: false, error: aborted ? `route call timed out after ${timeoutMs}ms` : err?.message || String(err) };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
