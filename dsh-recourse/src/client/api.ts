/**
 * Panel data access.
 *
 * Every read goes through this plugin's own web proxy rather than Recourse
 * directly. That is deliberate, and the reason is in `web-routes.ts`: the panel
 * runs on the harness origin and Recourse on another, so a direct fetch would be
 * cross-origin. The alternatives were loosening Recourse's CORS policy (so any
 * page on the machine could read the whole system) or shipping
 * RECOURSE_API_SECRET to the browser. The proxy does neither, and the harness's
 * connection gate authenticates the caller.
 */

/** Proxy mount point; must match `PROXY_PREFIX` in `web-routes.ts`. */
const PROXY = '/plugins/dsh-recourse/api';

/** How often the panel re-reads. Fast enough to feel live, slow enough to be cheap. */
const POLL_MS = 5000;

/** One polled endpoint. */
export interface PollSpec<T> {
  readonly path: string;
  readonly select: (body: unknown) => T;
}

/** Raised when an endpoint could not be read. */
export class PanelFetchError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'PanelFetchError';
    this.status = status;
  }
}

/**
 * Fetch one Recourse route through the proxy.
 *
 * Uses a same-origin relative URL so the browser attaches the harness's auth
 * cookie automatically. An explicit `cache: 'no-store'` matters here: these are
 * live counters, and a cached status strip is worse than no status strip.
 */
export async function read<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${PROXY}${path}`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (error) {
    if (signal?.aborted === true) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    throw new PanelFetchError(
      `Could not reach the Recourse proxy. Is Recourse running and the harness up? (${reason})`,
    );
  }

  const raw = await response.text();
  let body: unknown;
  try {
    body = raw.length === 0 ? null : JSON.parse(raw);
  } catch {
    throw new PanelFetchError(
      `Recourse ${path} returned HTTP ${response.status} with a non-JSON body.`,
      response.status,
    );
  }

  if (!response.ok) {
    const detail =
      typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string'
        ? `: ${(body as { error: string }).error}`
        : '';
    throw new PanelFetchError(`Recourse ${path} -> HTTP ${response.status}${detail}`, response.status);
  }
  return body as T;
}

/**
 * POST a guarded mutation through the proxy.
 *
 * Used by the panel's loop controls. Failures are surfaced verbatim rather than
 * collapsed, because "503 because the harness has no secret" and "400 because
 * the forge rejected it" call for completely different operator responses.
 */
export async function write(path: string, payload: unknown, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(`${PROXY}${path}`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(payload ?? {}),
    ...(signal === undefined ? {} : { signal }),
  });
  const raw = await response.text();
  let body: unknown;
  try {
    body = raw.length === 0 ? null : JSON.parse(raw);
  } catch {
    throw new PanelFetchError(`Recourse ${path} returned HTTP ${response.status} with a non-JSON body.`, response.status);
  }
  if (!response.ok) {
    const detail =
      typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string'
        ? `: ${(body as { error: string }).error}`
        : '';
    throw new PanelFetchError(`Recourse ${path} -> HTTP ${response.status}${detail}`, response.status);
  }
  return body;
}

/** Poll interval used by the panel's effect loop. Exported so tests can shorten it. */
export const PANEL_POLL_MS = POLL_MS;

/** Structural reader for a parsed JSON object. */
export function rec(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Read a nested numeric field. */
export function num(value: unknown, ...path: readonly string[]): number | undefined {
  let cursor: unknown = value;
  for (const key of path) {
    const record = rec(cursor);
    if (record === undefined) return undefined;
    cursor = record[key];
  }
  return typeof cursor === 'number' ? cursor : undefined;
}

/** Read a nested boolean field. */
export function bool(value: unknown, ...path: readonly string[]): boolean | undefined {
  let cursor: unknown = value;
  for (const key of path) {
    const record = rec(cursor);
    if (record === undefined) return undefined;
    cursor = record[key];
  }
  return typeof cursor === 'boolean' ? cursor : undefined;
}

/** Read a nested string field. */
export function str(value: unknown, ...path: readonly string[]): string | undefined {
  let cursor: unknown = value;
  for (const key of path) {
    const record = rec(cursor);
    if (record === undefined) return undefined;
    cursor = record[key];
  }
  return typeof cursor === 'string' ? cursor : undefined;
}

/** Read a nested record field. */
export function obj(value: unknown, ...path: readonly string[]): Record<string, unknown> | undefined {
  let cursor: unknown = value;
  for (const key of path) {
    const record = rec(cursor);
    if (record === undefined) return undefined;
    cursor = record[key];
  }
  return rec(cursor);
}

/** Read a nested array field. */
export function arr(value: unknown, ...path: readonly string[]): unknown[] | undefined {
  let cursor: unknown = value;
  for (const key of path) {
    const record = rec(cursor);
    if (record === undefined) return undefined;
    cursor = record[key];
  }
  return Array.isArray(cursor) ? cursor : undefined;
}