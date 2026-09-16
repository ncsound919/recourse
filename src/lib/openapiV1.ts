/**
 * openapiV1.ts — the versioned (`/v1`) public API contract.
 *
 * This is a single route table that drives THREE artifacts, so they can never
 * drift:
 *   1. the OpenAPI 3.1 document served at `/v1/openapi.json`,
 *   2. the generated TypeScript client (`v1Client.generated.ts`), and
 *   3. the reference the `src/routes/v1.ts` router implements.
 *
 * The `/v1` surface is the commercial, API-key-authenticated, quota-metered
 * product. It is intentionally distinct from the internal `/api/recourse`
 * routes, which remain the operator/UI surface.
 */
/** A structural OpenAPI 3.1 document (looser than `OpenApiSpec` so operations
 *  can carry `operationId`, `security` and `requestBody`). */
export interface V1OpenApiSpec {
  openapi: '3.1.0';
  info: { title: string; version: string; description: string };
  servers: Array<{ url: string }>;
  tags: Array<{ name: string; description: string }>;
  components: { securitySchemes: Record<string, Record<string, unknown>> };
  paths: Record<string, Record<string, Record<string, unknown>>>;
}

export interface V1Route {
  /** Client method name; dotted names become nested method groups. */
  name: string;
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  summary: string;
  tags: string[];
  mutating?: boolean;
  /** Required API-key scope. `read` unless stated. */
  scope: string;
  /** False for Stripe-signed endpoints that carry their own auth. */
  auth?: boolean;
  /** Path parameter names, in route order. */
  pathParams?: string[];
  /** Query parameter names accepted by the route. */
  queryParams?: string[];
  /** JSON body parameter names the route accepts. */
  bodyParams?: string[];
}

export const V1_ROUTES: V1Route[] = [
  {
    name: 'status',
    method: 'GET',
    path: '/v1/status',
    summary: 'Liveness + version of the commercial API',
    tags: ['system'],
    scope: 'read',
    auth: false,
  },
  {
    name: 'me',
    method: 'GET',
    path: '/v1/me',
    summary: 'Authenticated tenant, key scopes and plan',
    tags: ['account'],
    scope: 'read',
  },
  {
    name: 'plans',
    method: 'GET',
    path: '/v1/plans',
    summary: 'Pricing catalogue',
    tags: ['billing'],
    scope: 'read',
    auth: false,
  },
  {
    name: 'usage',
    method: 'GET',
    path: '/v1/usage',
    summary: 'Period usage, quotas and remaining allowance',
    tags: ['metering'],
    scope: 'read',
    queryParams: ['period'],
  },
  {
    name: 'keys.list',
    method: 'GET',
    path: '/v1/keys',
    summary: 'List API keys for the tenant',
    tags: ['keys'],
    scope: 'admin',
  },
  {
    name: 'keys.create',
    method: 'POST',
    path: '/v1/keys',
    summary: 'Mint a new API key (raw key returned once)',
    tags: ['keys'],
    scope: 'admin',
    mutating: true,
    bodyParams: ['name', 'scopes', 'expiresAt'],
  },
  {
    name: 'keys.rotate',
    method: 'POST',
    path: '/v1/keys/{id}/rotate',
    summary: 'Rotate a key, revoking the old one',
    tags: ['keys'],
    scope: 'admin',
    mutating: true,
    pathParams: ['id'],
  },
  {
    name: 'keys.revoke',
    method: 'DELETE',
    path: '/v1/keys/{id}',
    summary: 'Revoke an API key',
    tags: ['keys'],
    scope: 'admin',
    mutating: true,
    pathParams: ['id'],
  },
  {
    name: 'billing.checkout',
    method: 'POST',
    path: '/v1/billing/checkout',
    summary: 'Create a Stripe Checkout session for a plan',
    tags: ['billing'],
    scope: 'billing',
    mutating: true,
    bodyParams: ['planId', 'successUrl', 'cancelUrl', 'email'],
  },
  {
    name: 'billing.webhook',
    method: 'POST',
    path: '/v1/billing/webhook',
    summary: 'Stripe webhook receiver (signature-verified)',
    tags: ['billing'],
    scope: 'read',
    mutating: true,
    auth: false,
  },
  {
    name: 'outcome.record',
    method: 'POST',
    path: '/v1/outcome',
    summary: 'Record a real-world outcome signal (scorecard/revenue delta)',
    tags: ['learner'],
    scope: 'write',
    mutating: true,
    bodyParams: ['scorecardDelta', 'revenueDeltaCents', 'source', 'notes'],
  },
  {
    name: 'outcome.latest',
    method: 'GET',
    path: '/v1/outcome',
    summary: 'Latest recorded outcome signal and derived reward',
    tags: ['learner'],
    scope: 'read',
  },
  {
    name: 'learner.episode',
    method: 'POST',
    path: '/v1/learner/episode',
    summary: 'Run one learning episode against the latest external reward',
    tags: ['learner'],
    scope: 'write',
    mutating: true,
    bodyParams: ['externalScore'],
  },
];

export function buildV1OpenApi(baseUrl: string): V1OpenApiSpec {
  const b = baseUrl.replace(/\/$/, '');
  const paths: Record<string, Record<string, any>> = {};
  for (const r of V1_ROUTES) {
    const parameters: any[] = [];
    for (const p of r.pathParams ?? []) {
      parameters.push({ name: p, in: 'path', required: true, schema: { type: 'string' } });
    }
    for (const q of r.queryParams ?? []) {
      parameters.push({ name: q, in: 'query', required: false, schema: { type: 'string' } });
    }
    const operation: Record<string, any> = {
      operationId: r.name.replace(/\./g, '_'),
      summary: r.summary,
      tags: r.tags,
      parameters,
      responses: {
        '200': { description: 'OK' },
        ...(r.auth === false ? {} : { '401': { description: 'Missing/invalid API key' } }),
        '429': { description: 'Quota exceeded' },
      },
    };
    if (r.auth !== false) operation.security = [{ apiKey: [] }];
    else operation.security = [];
    if (r.mutating && r.bodyParams?.length) {
      operation.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: Object.fromEntries(r.bodyParams.map((p) => [p, { type: 'string' }])),
            },
          },
        },
      };
    }
    paths[r.path] ??= {};
    paths[r.path][r.method.toLowerCase()] = operation;
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Recourse API (v1)',
      version: '1.0.0',
      description:
        'Versioned, API-key-authenticated, metered commercial surface. Mutating routes require a scoped key; quotas are enforced per tenant per calendar month.',
    },
    servers: [{ url: b }],
    tags: [
      { name: 'system', description: 'Status' },
      { name: 'account', description: 'Tenant + key identity' },
      { name: 'metering', description: 'Usage and quotas' },
      { name: 'keys', description: 'API key lifecycle' },
      { name: 'billing', description: 'Plans, checkout and Stripe webhooks' },
      { name: 'learner', description: 'Outcome feedback into the learner' },
    ],
    components: {
      securitySchemes: {
        apiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' },
      },
    },
    paths,
  };
}

export interface V1OperationEntry {
  method: string;
  path: string;
  summary: string;
  tags: string[];
  scope: string;
  auth: boolean;
}

export function listV1Operations(): V1OperationEntry[] {
  return V1_ROUTES.map((r) => ({
    method: r.method,
    path: r.path,
    summary: r.summary,
    tags: r.tags,
    scope: r.scope,
    auth: r.auth !== false,
  })).sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

interface MethodSpec {
  group: string | null;
  leaf: string;
  method: string;
  path: string;
  pathParams: string[];
  queryParams: string[];
  bodyParams: string[];
}

function methodSpecs(): MethodSpec[] {
  return V1_ROUTES.map((r) => {
    const [group, leaf] = r.name.includes('.') ? r.name.split('.') : [null, r.name];
    return {
      group,
      leaf,
      method: r.method,
      path: r.path,
      pathParams: r.pathParams ?? [],
      queryParams: r.queryParams ?? [],
      bodyParams: r.mutating && r.bodyParams ? r.bodyParams : [],
    };
  });
}

const HEADER = `/**
 * v1Client.generated.ts — GENERATED by \`src/lib/openapiV1.ts\`.
 *
 * DO NOT EDIT BY HAND. Regenerate with \`npx tsx scripts/gen-v1-client.ts\`.
 * The client is derived from V1_ROUTES, so it stays in lockstep with the
 * served OpenAPI document and the router.
 */
`;

/** The generated TypeScript type for a method's single arguments object. */
function argsType(s: MethodSpec): string {
  const fields: string[] = [];
  for (const p of s.pathParams) fields.push(`${p}: string`);
  if (s.queryParams.length) fields.push('query?: Record<string, string | number | boolean | undefined>');
  if (s.bodyParams.length) fields.push('body?: Record<string, unknown>');
  return `{ ${fields.join('; ')} }`;
}

function signature(s: MethodSpec): string {
  const hasArgs = s.pathParams.length > 0 || s.queryParams.length > 0 || s.bodyParams.length > 0;
  if (!hasArgs) return '() => Promise<V1Response>';
  return s.pathParams.length > 0
    ? `(args: ${argsType(s)}) => Promise<V1Response>`
    : `(args?: ${argsType(s)}) => Promise<V1Response>`;
}

function implementation(s: MethodSpec): string {
  const hasArgs = s.pathParams.length > 0 || s.queryParams.length > 0 || s.bodyParams.length > 0;
  const urlExpr = s.path.replace(/\{(\w+)\}/g, (_, p) => `\${encodeURIComponent(String(args.${p}))}`);
  const queryArg = s.queryParams.length ? 'args?.query' : 'undefined';
  const bodyArg = s.bodyParams.length ? 'args?.body' : 'undefined';
  const head = hasArgs ? `(args) =>` : '() =>';
  return `${head} request('${s.method}', \`${urlExpr}\`, ${bodyArg}, ${queryArg})`;
}

/** Emit the TypeScript source of the typed /v1 client. */
export function generateV1ClientSource(): string {
  const specs = methodSpecs();
  const roots = specs.filter((s) => s.group === null);
  const groups = new Map<string, MethodSpec[]>();
  for (const s of specs) {
    if (s.group === null) continue;
    const list = groups.get(s.group) ?? [];
    list.push(s);
    groups.set(s.group, list);
  }
  const groupEntries = Array.from(groups.entries());

  const interfaceLines = [
    ...roots.map((s) => `  ${s.leaf}: ${signature(s)};`),
    ...groupEntries.map(
      ([g, list]) => `  ${g}: {\n${list.map((s) => `    ${s.leaf}: ${signature(s)};`).join('\n')}\n  };`,
    ),
  ].join('\n');

  const bodyLines = [
    ...roots.map((s) => `    ${s.leaf}: ${implementation(s)},`),
    ...groupEntries.map(
      ([g, list]) => `    ${g}: {\n${list.map((s) => `      ${s.leaf}: ${implementation(s)},`).join('\n')}\n    },`,
    ),
  ].join('\n');

  return `${HEADER}
export interface V1ClientOptions {
  baseUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export interface V1Response<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
}

export interface V1Client {
${interfaceLines}
}

function buildUrl(baseUrl: string, path: string): string {
  return baseUrl.replace(/\\/+$/, '') + path;
}

export function createV1Client(options: V1ClientOptions): V1Client {
  const fetchImpl = options.fetchImpl ?? fetch;

  const request = async (
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, unknown>,
  ): Promise<V1Response> => {
    let url = buildUrl(options.baseUrl, path);
    if (query) {
      const search = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) search.set(k, String(v));
      }
      const qs = search.toString();
      if (qs) url += (url.includes('?') ? '&' : '?') + qs;
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options.apiKey) headers['x-api-key'] = options.apiKey;
    const res = await fetchImpl(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data: unknown = null;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { ok: res.ok, status: res.status, data };
  };

  return {
${bodyLines}
  };
}
`;
}
