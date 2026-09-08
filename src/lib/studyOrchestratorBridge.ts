/**
 * Study-orchestrator bridge — stateless HTTP client for the
 * research-orchestrator Express service (default http://127.0.0.1:8099).
 *
 * The orchestrator is an EXTERNAL process. This module never owns its data
 * and never invents studies, runs, or claims: every fetch is guarded by a
 * timeout and returns `ok:false` with the underlying error when the service
 * is down or rejects, mirroring the honesty contract in
 * `src/lib/prometheusBridge.ts` and `src/lib/kgSidecarClient.ts`.
 *
 * Route convention:
 *   GET  {base}/api/health
 *   GET  {base}/api/systems
 *   POST {base}/api/study
 *   GET  {base}/api/runs
 *   GET  {base}/api/runs/:runId?verify=1
 *   GET  {base}/api/claims
 *   GET  {base}/api/validity
 *
 * Env: ORCHESTRATOR_URL (default http://127.0.0.1:8099).
 */

export const ORCHESTRATOR_DEFAULT_URL =
  process.env.ORCHESTRATOR_URL || 'http://127.0.0.1:8099';

export interface OrchestratorResult {
  ok: boolean;
  /** Raw payload when the service answered (parsed JSON). */
  data?: unknown;
  error?: string;
  latencyMs: number;
}

export interface StudyDirective {
  objective: string;
  hypothesis?: string;
  questions?: string[];
  direction?: string;
}

function stripTrailingSlash(base: string): string {
  return base.replace(/\/$/, '');
}

async function getJson(
  path: string,
  base: string,
  timeoutMs: number,
  label: string,
): Promise<OrchestratorResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`${stripTrailingSlash(base)}${path}`, {
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
 * GET /api/health. Guarded, non-2xx → ok:false. NEVER throws.
 */
export async function orchestratorHealth(
  base: string = ORCHESTRATOR_DEFAULT_URL,
  timeoutMs = 5000,
): Promise<OrchestratorResult> {
  return getJson('/api/health', base, timeoutMs, 'orchestrator health');
}

/**
 * GET /api/systems. Guarded, non-2xx → ok:false. NEVER throws.
 */
export async function listSystems(
  base: string = ORCHESTRATOR_DEFAULT_URL,
  timeoutMs = 5000,
): Promise<OrchestratorResult> {
  return getJson('/api/systems', base, timeoutMs, 'orchestrator systems');
}

/**
 * POST /api/study. The orchestrator's study schema REQUIRES `query`
 * (min 3 chars) alongside `directive.objective` (min 10 chars); the only
 * mapping this client performs is `query = directive.objective` and a
 * default `title` derived from the objective. No other inputs are invented —
 * stageBInputs/stageCInputs must be supplied by the caller via `extra`.
 * Studies run inline server-side, so the default timeout is long (120s).
 * Guarded, non-2xx → ok:false. NEVER throws.
 */
export async function submitStudy(
  directive: StudyDirective,
  base: string = ORCHESTRATOR_DEFAULT_URL,
  timeoutMs = 120000,
  extra?: Record<string, unknown>,
): Promise<OrchestratorResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  const label = 'orchestrator submit-study';
  try {
    const objective =
      typeof directive.objective === 'string' ? directive.objective : '';
    const body: Record<string, unknown> = {
      title: objective.slice(0, 200) || 'Ad-hoc research study',
      query: objective,
      directive: {
        objective: directive.objective,
        ...(directive.hypothesis !== undefined
          ? { hypothesis: directive.hypothesis }
          : {}),
        questions: directive.questions ?? [],
        direction: directive.direction ?? 'exploratory',
      },
      ...extra,
    };
    const res = await fetch(`${stripTrailingSlash(base)}/api/study`, {
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
 * GET /api/runs. Guarded, non-2xx → ok:false. NEVER throws.
 */
export async function listRuns(
  base: string = ORCHESTRATOR_DEFAULT_URL,
  timeoutMs = 5000,
): Promise<OrchestratorResult> {
  return getJson('/api/runs', base, timeoutMs, 'orchestrator runs');
}

/**
 * GET /api/runs/:runId?verify=1. The `verify=1` flag asks the orchestrator
 * to include its ledger integrity check alongside the manifest. Guarded,
 * non-2xx (including 404 run-not-found) → ok:false. NEVER throws.
 */
export async function getRun(
  runId: string,
  base: string = ORCHESTRATOR_DEFAULT_URL,
  timeoutMs = 5000,
): Promise<OrchestratorResult> {
  return getJson(
    `/api/runs/${encodeURIComponent(runId)}?verify=1`,
    base,
    timeoutMs,
    'orchestrator get-run',
  );
}

/**
 * GET /api/claims. Guarded, non-2xx → ok:false. NEVER throws.
 */
export async function listClaims(
  base: string = ORCHESTRATOR_DEFAULT_URL,
  timeoutMs = 5000,
): Promise<OrchestratorResult> {
  return getJson('/api/claims', base, timeoutMs, 'orchestrator claims');
}

/**
 * GET /api/validity. Guarded, non-2xx → ok:false. NEVER throws.
 */
export async function getValidity(
  base: string = ORCHESTRATOR_DEFAULT_URL,
  timeoutMs = 5000,
): Promise<OrchestratorResult> {
  return getJson('/api/validity', base, timeoutMs, 'orchestrator validity');
}
