/**
 * Research-integrity bridge — stateless HTTP client for the Biotech
 * research-integrity FastAPI (default http://127.0.0.1:8025).
 *
 * The integrity service is an EXTERNAL process. This module never owns its
 * data and never invents results: every fetch is guarded by a timeout and
 * returns `ok:false` with the underlying error when the service is down or
 * rejects, mirroring the honesty contract in
 * `src/lib/prometheusBridge.ts` and `src/lib/kgSidecarClient.ts`.
 *
 * Endpoint convention:
 *   POST {base}/api/v1/tools/research-integrity/reproducibility-track
 *   POST {base}/api/v1/tools/research-integrity/cross-validation
 *   POST {base}/api/v1/tools/research-integrity/accountability-log
 *   POST {base}/api/v1/tools/research-integrity/verification
 *   GET  {base}/api/v1/tools/research-integrity/status
 *
 * Env: INTEGRITY_URL (default http://127.0.0.1:8025).
 */

export const INTEGRITY_DEFAULT_URL =
  process.env.INTEGRITY_URL || 'http://127.0.0.1:8025';

export interface IntegrityResult {
  ok: boolean;
  /** Raw payload when the service answered (parsed JSON). */
  data?: unknown;
  error?: string;
  latencyMs: number;
}

export interface IntegrityStatusResult {
  ok: boolean;
  status?: unknown;
  error?: string;
  latencyMs: number;
}

function stripTrailingSlash(base: string): string {
  return base.replace(/\/$/, '');
}

async function postJson(
  path: string,
  body: Record<string, unknown>,
  base: string,
  timeoutMs: number,
  label: string,
): Promise<IntegrityResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`${stripTrailingSlash(base)}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { ok: false, latencyMs, error: `${label} HTTP ${res.status}` };
    }
    const data: unknown = await res.json();
    return { ok: true, data, latencyMs };
  } catch (err: unknown) {
    const latencyMs = Date.now() - started;
    const timedOut = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      latencyMs,
      error: timedOut
        ? `${label} timed out after ${timeoutMs}ms`
        : err instanceof Error
          ? err.message
          : `${label} unreachable`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET the integrity service status. Guarded: timeout via AbortController,
 * non-2xx → ok:false, network error → ok:false. NEVER throws and NEVER
 * returns fabricated status.
 */
export async function integrityStatus(
  base: string = INTEGRITY_DEFAULT_URL,
  timeoutMs = 5000,
): Promise<IntegrityStatusResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(
      `${stripTrailingSlash(base)}/api/v1/tools/research-integrity/status`,
      { signal: controller.signal },
    );
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { ok: false, latencyMs, error: `integrity status HTTP ${res.status}` };
    }
    const status: unknown = await res.json();
    return { ok: true, status, latencyMs };
  } catch (err: unknown) {
    const latencyMs = Date.now() - started;
    const timedOut = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      latencyMs,
      error: timedOut
        ? `integrity status timed out after ${timeoutMs}ms`
        : err instanceof Error
          ? err.message
          : 'integrity unreachable',
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST reproducibility-track. Body is passed through verbatim — this client
 * never supplies default experiment fields. Guarded, non-2xx → ok:false.
 */
export async function trackReproducibility(
  params: Record<string, unknown>,
  base: string = INTEGRITY_DEFAULT_URL,
  timeoutMs = 5000,
): Promise<IntegrityResult> {
  return postJson(
    '/api/v1/tools/research-integrity/reproducibility-track',
    params,
    base,
    timeoutMs,
    'integrity reproducibility-track',
  );
}

/**
 * POST cross-validation. Body passed through verbatim. Guarded.
 */
export async function crossValidate(
  payload: Record<string, unknown>,
  base: string = INTEGRITY_DEFAULT_URL,
  timeoutMs = 5000,
): Promise<IntegrityResult> {
  return postJson(
    '/api/v1/tools/research-integrity/cross-validation',
    payload,
    base,
    timeoutMs,
    'integrity cross-validation',
  );
}

/**
 * POST accountability-log. Body passed through verbatim. Guarded.
 */
export async function logAccountability(
  entry: Record<string, unknown>,
  base: string = INTEGRITY_DEFAULT_URL,
  timeoutMs = 5000,
): Promise<IntegrityResult> {
  return postJson(
    '/api/v1/tools/research-integrity/accountability-log',
    entry,
    base,
    timeoutMs,
    'integrity accountability-log',
  );
}

/**
 * POST verification. Body passed through verbatim. Guarded.
 */
export async function verifyWork(
  payload: Record<string, unknown>,
  base: string = INTEGRITY_DEFAULT_URL,
  timeoutMs = 5000,
): Promise<IntegrityResult> {
  return postJson(
    '/api/v1/tools/research-integrity/verification',
    payload,
    base,
    timeoutMs,
    'integrity verification',
  );
}
