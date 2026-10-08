/**
 * fleetRegistry.ts — the one place Recourse learns where the other fleet
 * services live, and the one fail-soft HTTP call used to reach them.
 *
 * Before this existed every bridge hard-coded its own default URL and its own
 * copy of the timeout/abort/JSON dance. The drift was real: the Draymond bridge
 * defaulted to :3000 (Keywire) instead of :3444, so it sent its bearer secret to
 * the wrong service. Ports here mirror Draymond-Orchestrator/fleet-manifest.js
 * and Uplift/ECOSYSTEM_INTEGRATIONS.md §4; if they disagree with the live
 * manifest, the manifest wins — change them here.
 *
 * Honesty contract: `fleetCall` never fabricates. Unreachable, timed-out, non-2xx
 * and non-JSON are all reported as such (`ok:false` / `available:false`).
 */

export type FleetServiceId =
  | 'keywire'
  | 'openhub'
  | 'omniresearch'
  | 'axiom'
  | 'draymond'
  | 'devbrain'
  | 'litellm'
  | 'globalLens';

interface FleetServiceDef {
  label: string;
  /** Env vars checked in order for a base-URL override. */
  env: readonly string[];
  port: number;
  /** Cheap GET that proves the process is up. */
  health: string;
}

export const FLEET_SERVICES: Readonly<Record<FleetServiceId, FleetServiceDef>> = {
  keywire:      { label: 'Keywire',      env: ['KEYWIRE_URL'],                      port: 4700, health: '/api/health' },
  openhub:      { label: 'OpenHub',      env: ['OPENHUB_URL'],                      port: 3010, health: '/api/health' },
  omniresearch: { label: 'OmniResearch', env: ['OMNIRESEARCH_URL'],                 port: 3012, health: '/api/health' },
  axiom:        { label: 'Axiom',        env: ['AXIOM_URL'],                        port: 3198, health: '/api/health' },
  draymond:     { label: 'Draymond',     env: ['DRAYMOND_URL', 'DRAYMOND_OPS_URL'], port: 3444, health: '/' },
  devbrain:     { label: 'Dev-Brain',    env: ['DEV_BRAIN_URL'],                    port: 3450, health: '/api/status' },
  litellm:      { label: 'LiteLLM',      env: ['LITELLM_URL'],                      port: 4100, health: '/v1/models' },
  globalLens:   { label: 'Global Lens',  env: ['GLOBAL_LENS_URL'],                  port: 3090, health: '/api/health' },
};

export const FLEET_SERVICE_IDS = Object.keys(FLEET_SERVICES) as FleetServiceId[];

/** Base URL for a fleet service: first set env override, else loopback default. No trailing slash. */
export function fleetBaseUrl(id: FleetServiceId, env: NodeJS.ProcessEnv = process.env): string {
  const def = FLEET_SERVICES[id];
  for (const k of def.env) {
    const v = (env[k] ?? '').trim();
    if (v) return v.replace(/\/+$/, '');
  }
  return `http://127.0.0.1:${def.port}`;
}

export interface BridgeCall<T> {
  ok: boolean;
  /** True only when the call returned 2xx AND a JSON body. */
  available: boolean;
  status: number;
  data: T | null;
  error?: string;
  latencyMs: number;
}

export interface FleetCallOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Override the registry URL (tests, one-off targets). */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/** Fail-soft JSON call to a fleet service. Never throws. */
export async function fleetCall<T = unknown>(
  id: FleetServiceId,
  path: string,
  opts: FleetCallOptions = {},
): Promise<BridgeCall<T>> {
  const label = FLEET_SERVICES[id].label.toLowerCase();
  const base = (opts.baseUrl ?? fleetBaseUrl(id)).replace(/\/+$/, '');
  const timeoutMs = opts.timeoutMs ?? 8000;
  const method = opts.method ?? 'GET';
  const doFetch = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await doFetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
      ...(method === 'POST' ? { body: JSON.stringify(opts.body ?? {}) } : {}),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    const data = (await res.json().catch(() => null)) as T | null;
    if (!res.ok) {
      return { ok: false, available: false, status: res.status, data, latencyMs, error: `${label} HTTP ${res.status} ${path}` };
    }
    return { ok: true, available: data !== null, status: res.status, data, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - started;
    return {
      ok: false,
      available: false,
      status: 0,
      data: null,
      latencyMs,
      error: err instanceof Error && err.name === 'AbortError'
        ? `${label} timed out after ${timeoutMs}ms`
        : err instanceof Error ? err.message : `${label} unreachable`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export interface FleetServiceHealth {
  id: FleetServiceId;
  label: string;
  url: string;
  /** True when the URL came from an env override rather than the registry default. */
  overridden: boolean;
  reachable: boolean;
  status: number;
  latencyMs: number;
  error?: string;
}

/**
 * Probe fleet services in parallel. "reachable" = got any HTTP response below
 * 500 (a 401 still proves the process is up); it says nothing about auth.
 */
export async function fleetHealth(
  ids: readonly FleetServiceId[] = FLEET_SERVICE_IDS,
  opts: { timeoutMs?: number; env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {},
): Promise<FleetServiceHealth[]> {
  const env = opts.env ?? process.env;
  return Promise.all(ids.map(async (id) => {
    const def = FLEET_SERVICES[id];
    const url = fleetBaseUrl(id, env);
    const r = await fleetCall<unknown>(id, def.health, { baseUrl: url, timeoutMs: opts.timeoutMs ?? 6000, fetchImpl: opts.fetchImpl });
    return {
      id,
      label: def.label,
      url,
      overridden: def.env.some((k) => (env[k] ?? '').trim() !== ''),
      reachable: r.status > 0 && r.status < 500,
      status: r.status,
      latencyMs: r.latencyMs,
      ...(r.status > 0 && r.status < 500 ? {} : { error: r.error }),
    };
  }));
}
