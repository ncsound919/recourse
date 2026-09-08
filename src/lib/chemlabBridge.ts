/**
 * Overlay-Chemlab Express bridge — stateless HTTP client for the
 * Overlay-Chemlab Express service (`components/Overlay-Chemlab/server.js`
 * plus `src/api/routes.js`).
 *
 * Chemlab is an EXTERNAL process (default http://127.0.0.1:8096, pm2
 * "onco-chemlab" — the old :3000 default collided with Keywire's SPA).
 * This module never owns its data and never invents chemistry:
 * every fetch is guarded by a timeout and returns `ok:false` with the
 * underlying error when the service is down or rejects, mirroring the
 * honesty contract in `src/lib/prometheusBridge.ts`.
 *
 * Route convention (all routes under /api):
 *   GET  {base}/api/health
 *   GET  {base}/api/molecule/properties?smiles=
 *   GET  {base}/api/molecule/fingerprint?smiles=
 *   GET  {base}/api/molecule/similarity?smiles1=&smiles2=
 *   GET  {base}/api/molecule/druglikeness?smiles=
 *   POST {base}/api/molecule/risk              → { smiles | embedding }
 *   POST {base}/api/simulate/kinetics          → { temperature, totalTime, ... }
 *   POST {base}/api/reaction/parse             → { reaction }
 *   POST {base}/api/simulate/esterification    → { temperature, time, ... }
 *
 * Env: CHEMLAB_URL (default http://127.0.0.1:8096).
 */

export const CHEMLAB_DEFAULT_URL =
  process.env.CHEMLAB_URL || 'http://127.0.0.1:8096';

export interface ChemlabBridgeResult {
  ok: boolean;
  /** Raw payload when the service answered (parsed JSON). */
  data?: unknown;
  error?: string;
  latencyMs: number;
}

function stripBase(base: string): string {
  return base.replace(/\/$/, '');
}

async function getJson(path: string, base: string, timeoutMs: number): Promise<ChemlabBridgeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`${stripBase(base)}${path}`, { signal: controller.signal });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { ok: false, latencyMs, error: `chemlab HTTP ${res.status}` };
    }
    const data: unknown = await res.json();
    return { ok: true, data, latencyMs };
  } catch (err: unknown) {
    const latencyMs = Date.now() - started;
    const msg = err instanceof Error ? err.message : 'chemlab unreachable';
    const timedOut = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      latencyMs,
      error: timedOut ? `chemlab timed out after ${timeoutMs}ms` : msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function postJson(
  path: string,
  body: unknown,
  base: string,
  timeoutMs: number,
): Promise<ChemlabBridgeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`${stripBase(base)}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { ok: false, latencyMs, error: `chemlab HTTP ${res.status}` };
    }
    const data: unknown = await res.json();
    return { ok: true, data, latencyMs };
  } catch (err: unknown) {
    const latencyMs = Date.now() - started;
    const msg = err instanceof Error ? err.message : 'chemlab unreachable';
    const timedOut = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      latencyMs,
      error: timedOut ? `chemlab timed out after ${timeoutMs}ms` : msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

function requireSmiles(smiles: string): ChemlabBridgeResult | null {
  if (!smiles || !smiles.trim()) {
    return { ok: false, latencyMs: 0, error: 'chemlab requires a smiles string' };
  }
  return null;
}

/**
 * GET /api/health. Guarded: timeout via AbortController, non-2xx → ok:false,
 * network error → ok:false. NEVER throws and NEVER fabricates.
 */
export async function chemlabHealth(
  base: string = CHEMLAB_DEFAULT_URL,
  timeoutMs = 10000,
): Promise<ChemlabBridgeResult> {
  return getJson('/api/health', base, timeoutMs);
}

/**
 * GET /api/molecule/properties?smiles=. Guarded, never throws, never fabricates.
 */
export async function moleculeProperties(
  smiles: string,
  base: string = CHEMLAB_DEFAULT_URL,
  timeoutMs = 10000,
): Promise<ChemlabBridgeResult> {
  const missing = requireSmiles(smiles);
  if (missing) return missing;
  return getJson(`/api/molecule/properties?smiles=${encodeURIComponent(smiles)}`, base, timeoutMs);
}

/**
 * GET /api/molecule/similarity?smiles1=&smiles2=.
 * Guarded, never throws, never fabricates.
 */
export async function moleculeSimilarity(
  smiles1: string,
  smiles2: string,
  base: string = CHEMLAB_DEFAULT_URL,
  timeoutMs = 10000,
): Promise<ChemlabBridgeResult> {
  const missing1 = requireSmiles(smiles1);
  if (missing1) return missing1;
  const missing2 = requireSmiles(smiles2);
  if (missing2) return missing2;
  return getJson(
    `/api/molecule/similarity?smiles1=${encodeURIComponent(smiles1)}&smiles2=${encodeURIComponent(smiles2)}`,
    base,
    timeoutMs,
  );
}

/**
 * GET /api/molecule/druglikeness?smiles=. Guarded, never throws, never fabricates.
 */
export async function moleculeDruglikeness(
  smiles: string,
  base: string = CHEMLAB_DEFAULT_URL,
  timeoutMs = 10000,
): Promise<ChemlabBridgeResult> {
  const missing = requireSmiles(smiles);
  if (missing) return missing;
  return getJson(`/api/molecule/druglikeness?smiles=${encodeURIComponent(smiles)}`, base, timeoutMs);
}

/**
 * POST /api/molecule/risk with { smiles | embedding, ... }.
 * Body is passed through verbatim (schema lives upstream).
 * Guarded, never throws, never fabricates.
 */
export async function moleculeRisk(
  body: Record<string, unknown>,
  base: string = CHEMLAB_DEFAULT_URL,
  timeoutMs = 10000,
): Promise<ChemlabBridgeResult> {
  return postJson('/api/molecule/risk', body, base, timeoutMs);
}

/**
 * POST /api/simulate/kinetics with { temperature, totalTime, ... }.
 * Simulations can take a while, so the default timeout is 60s.
 * Body is passed through verbatim (schema lives upstream).
 * Guarded, never throws, never fabricates.
 */
export async function simulateKinetics(
  body: Record<string, unknown>,
  base: string = CHEMLAB_DEFAULT_URL,
  timeoutMs = 60000,
): Promise<ChemlabBridgeResult> {
  return postJson('/api/simulate/kinetics', body, base, timeoutMs);
}

/**
 * POST /api/reaction/parse with { reaction }.
 * Guarded, never throws, never fabricates.
 */
export async function parseReaction(
  reaction: string,
  base: string = CHEMLAB_DEFAULT_URL,
  timeoutMs = 10000,
): Promise<ChemlabBridgeResult> {
  if (!reaction || !reaction.trim()) {
    return { ok: false, latencyMs: 0, error: 'chemlab requires a reaction string' };
  }
  return postJson('/api/reaction/parse', { reaction }, base, timeoutMs);
}
