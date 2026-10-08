/**
 * Thin, honest HTTP client for the Recourse API.
 *
 * Three properties matter more than features here:
 *
 * 1. **Cancellation is forwarded.** A tool body that ignores `exec.signal`
 *    keeps the harness waiting after the user has already moved on. Every
 *    request combines the caller's signal with its own deadline.
 * 2. **Failures are reported, never disguised.** Recourse's guarded routes
 *    answer 503 when the secret is unset and 401 when it is wrong. Those are
 *    operator-actionable facts, so they surface verbatim in the thrown message
 *    instead of collapsing into "request failed".
 * 3. **No silent reshaping.** Responses are returned as parsed JSON. The
 *    context-economy projections live in `tools.ts`, where they are explicit
 *    and reviewable, rather than smeared through the transport.
 */

/** JSON value, as produced by `JSON.parse`. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** A non-2xx or unparseable answer from Recourse. */
export class RecourseApiError extends Error {
  readonly status: number | undefined;
  readonly path: string;

  constructor(message: string, path: string, status?: number) {
    super(message);
    this.name = 'RecourseApiError';
    this.path = path;
    this.status = status;
  }
}

/** Resolved transport settings. */
export interface RecourseApiOptions {
  readonly baseUrl: string;
  readonly secret: string;
  readonly defaultTimeoutMs: number;
}

/** Turn a secret into operator-actionable advice for the common auth failures. */
function secretHint(status: number, secretConfigured: boolean): string {
  if (!secretConfigured && (status === 401 || status === 503)) {
    return (
      ' RECOURSE_API_SECRET is not configured for the harness, so Recourse is failing' +
      ' closed on its guarded routes. Set it in the DSH process environment' +
      ' (start-all.ps1 lifts it out of recourse\\.env).'
    );
  }
  if (status === 401) {
    return ' RECOURSE_API_SECRET is configured but was rejected; check it against recourse\\.env.';
  }
  if (status === 503) {
    return ' Recourse reports its guarded routes unavailable.';
  }
  return '';
}

/** Best-effort extraction of a human message from a Recourse error body. */
function upstreamMessage(body: Json): string | undefined {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined;
  const record = body as Record<string, Json>;
  for (const key of ['error', 'message', 'detail'] as const) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

/** Client for one Recourse origin. Holds no sockets and no global state. */
export class RecourseApi {
  readonly baseUrl: string;
  readonly hasSecret: boolean;
  readonly defaultTimeoutMs: number;
  readonly #secret: string;

  constructor(options: RecourseApiOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.#secret = options.secret;
    this.hasSecret = this.#secret.length > 0;
    this.defaultTimeoutMs = options.defaultTimeoutMs;
  }

  /** Auth + content headers. Recourse's config-gated GETs authenticate when a secret exists. */
  #headers(hasBody: boolean): Record<string, string> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (hasBody) headers['content-type'] = 'application/json';
    if (this.hasSecret) headers.authorization = `Bearer ${this.#secret}`;
    return headers;
  }

  /** Public accessor for the secret (used by EcoShorthand client). */
  getSecret(): string { return this.#secret; }

  /** Join the caller's cancellation with our own deadline. */
  #deadline(caller: AbortSignal | undefined, timeoutMs: number): AbortSignal {
    const timeout = AbortSignal.timeout(timeoutMs);
    return caller === undefined ? timeout : AbortSignal.any([caller, timeout]);
  }

  async #request(
    method: 'GET' | 'POST',
    path: string,
    body: Json | undefined,
    caller: AbortSignal | undefined,
    timeoutMs: number,
  ): Promise<Json> {
    const signal = this.#deadline(caller, timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: this.#headers(body !== undefined),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal,
      });
    } catch (error) {
      // "the user cancelled" and "Recourse is down" need different reactions,
      // so they must not collapse into one message.
      if (caller?.aborted === true) {
        throw new RecourseApiError('Call cancelled by the harness before Recourse answered.', path);
      }
      const reason = error instanceof Error ? error.message : String(error);
      throw new RecourseApiError(
        `Recourse is unreachable at ${this.baseUrl} (${reason}). Is the service up? It listens on port 3050.`,
        path,
      );
    }

    const raw = await response.text();
    let parsed: Json;
    try {
      parsed = raw.length === 0 ? null : (JSON.parse(raw) as Json);
    } catch {
      throw new RecourseApiError(
        `Recourse ${path} returned HTTP ${response.status} with a non-JSON body: ${raw.slice(0, 300)}`,
        path,
        response.status,
      );
    }

    if (!response.ok) {
      const detail = upstreamMessage(parsed);
      throw new RecourseApiError(
        `Recourse ${path} -> HTTP ${response.status}` +
          (detail === undefined ? '' : `: ${detail}`) +
          secretHint(response.status, this.hasSecret),
        path,
        response.status,
      );
    }

    return parsed;
  }

  /** GET a route. */
  get(path: string, caller?: AbortSignal, timeoutMs?: number): Promise<Json> {
    return this.#request('GET', path, undefined, caller, timeoutMs ?? this.defaultTimeoutMs);
  }

  /** POST a route with a JSON body. Guarded routes need a configured secret. */
  post(path: string, body: Json | undefined, caller?: AbortSignal, timeoutMs?: number): Promise<Json> {
    return this.#request('POST', path, body ?? {}, caller, timeoutMs ?? this.defaultTimeoutMs);
  }
}