/**
 * Recourse Trend Engine sidecar client.
 *
 * Talks to the Python trend service (`python/trend_service/main.py`) over
 * HTTP. The sidecar is STATELESS: Recourse sends series data in every request
 * and the sidecar returns real statsmodels/ruptures/scipy computation over
 * that input (STL decomposition, PELT changepoints, burst automaton, σ-bands,
 * lagged cross-correlation). It never owns a copy of the ledger, so there is
 * no drift.
 *
 * Honesty contract (mirrors `src/lib/kgSidecarClient.ts` and the other
 * sidecars): every call is guarded by a timeout and returns `ok:false` with
 * the underlying error when the sidecar is unreachable or rejects. It NEVER
 * fabricates a decomposition, changepoint, or burst, and never pretends the
 * analysis ran when the service is down.
 *
 * Env: TREND_SIDECAR_URL (default http://127.0.0.1:8810).
 *
 * Port 8810, NOT 8800. Three services claimed 8800: this sidecar, an external
 * `sympy_service.py` (which actually holds it), and `KAG_SIDECAR_DEFAULT_URL`
 * in kagSidecarClient.ts. Only one can bind, so the trend sidecar could never
 * start — and because `trendHealth` used to accept any HTTP 200, the unrelated
 * service answering on 8800 made the trend engine look ONLINE. Keep this in sync
 * with `python/trend_service/main.py`.
 */

export const TREND_SIDECAR_DEFAULT_URL =
  process.env.TREND_SIDECAR_URL || 'http://127.0.0.1:8810';

export interface TrendSeriesInput {
  id: string;
  name: string;
  domain: string;
  points: Array<{ t: number; value: number }>;
}

export interface TrendCall<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
  latencyMs: number;
}

export interface TrendSidecarResult {
  ok: boolean;
  error?: string;
  latencyMs?: number;
}

export interface TrendHealthResult extends TrendSidecarResult {
  status?: string;
  service?: string;
  statsmodels?: boolean;
  ruptures?: boolean;
}

export interface DecomposeResult extends TrendSidecarResult {
  series_id?: string;
  trend?: number[];
  seasonal?: number[];
  remainder?: number[];
  period?: number;
}

export interface BurstResult extends TrendSidecarResult {
  series_id?: string;
  bursts?: Array<{ start: number; end: number; strength: number; peak_t: number }>;
}

export interface ChangepointResult extends TrendSidecarResult {
  series_id?: string;
  method?: string;
  library?: string;
  changepoints?: number[];
}

export interface AnomalyResult extends TrendSidecarResult {
  series_id?: string;
  anomalies?: Array<{ t: number; type: 'spike' | 'drop'; score: number; value: number; remainder: number; sigma: number }>;
}

export interface CrossCorrResult extends TrendSidecarResult {
  a?: string;
  b?: string;
  best_lag?: number;
  correlation?: number;
  significant?: boolean;
}

export interface MomentumResult extends TrendSidecarResult {
  series_id?: string;
  last_value?: number;
  prev_value?: number;
  wow_delta?: number;
  z_acceleration?: number;
}

export interface ScanResult extends TrendSidecarResult {
  anomalies?: Array<{ series_id: string; t: number; type: string; score: number; value: number }>;
  bursts?: Array<{ series_id: string; start: number; end: number; strength: number; peak_t: number }>;
  momentum?: Array<{ series_id: string; z_acceleration: number }>;
  cross_domain?: Array<{ a: string; b: string; best_lag: number; correlation: number; significant: boolean }>;
  libraries?: { statsmodels: boolean; ruptures: boolean };
}

async function callTrend<T>(
  path: string,
  body: unknown,
  base: string,
  timeoutMs: number,
  method: 'POST' | 'GET' = 'POST',
): Promise<TrendCall<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { ok: false, status: res.status, data: null, latencyMs, error: `trend sidecar HTTP ${res.status}` };
    }
    const data = (await res.json()) as T;
    return { ok: true, status: res.status, data, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - started;
    return {
      ok: false,
      status: 0,
      data: null,
      latencyMs,
      error: err instanceof Error && err.name === 'AbortError'
        ? `trend sidecar timed out after ${timeoutMs}ms`
        : err instanceof Error ? err.message : 'trend sidecar unreachable',
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Health check — used by status routes so the UI can report sidecar online.
 *
 * Identity is verified, not assumed. A bare HTTP 200 is NOT sufficient evidence
 * that the trend engine is reachable: this default port is contested, and at the
 * time of writing `GET /health` on 8800 answered
 * `{ status: "ok", service: "sympy", sympy_version: "1.14.0" }` — a different
 * sidecar entirely, with neither statsmodels nor ruptures. Returning ok on that
 * made every status route report the trend engine online and defeated the
 * `if (!h.ok) return` fail-soft guard in tests/trendEngine.test.ts, which then
 * failed deep inside `trendDecompose` instead of skipping.
 *
 * So: the payload must claim to be the trend service, and the two libraries the
 * engine actually calls must be present. Anything else is reported unavailable
 * with the reason, never as healthy.
 */
export async function trendHealth(base = TREND_SIDECAR_DEFAULT_URL, timeoutMs = 2000): Promise<TrendHealthResult> {
  const call = await callTrend<TrendHealthResult>('/health', null, base, timeoutMs, 'GET');
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };

  const d = call.data as Partial<TrendHealthResult> & { service?: string; statsmodels?: unknown; ruptures?: unknown };
  const service = typeof d.service === 'string' ? d.service : '';
  if (service && !/trend/i.test(service)) {
    return {
      ok: false,
      error: `wrong service on ${base}: /health answered service="${service}", expected the trend service`,
      latencyMs: call.latencyMs,
    };
  }
  if (d.status !== undefined && d.status !== 'ok') {
    return { ok: false, error: `trend sidecar status="${String(d.status)}"`, latencyMs: call.latencyMs };
  }
  // Absent keys mean the sidecar never reported its libraries; treat that as
  // "capability unknown" rather than assuming both are importable.
  const missing: string[] = [];
  if (!d.statsmodels) missing.push('statsmodels');
  if (!d.ruptures) missing.push('ruptures');
  if (missing.length) {
    return {
      ok: false,
      error: `trend sidecar at ${base} cannot serve ${missing.join(' and ')} (not reported by /health)`,
      latencyMs: call.latencyMs,
    };
  }

  return {
    ok: true,
    status: call.data.status,
    service: call.data.service,
    statsmodels: call.data.statsmodels,
    ruptures: call.data.ruptures,
    latencyMs: call.latencyMs,
  };
}

export async function trendDecompose(series: TrendSeriesInput, period = 7, base?: string, timeoutMs = 10000): Promise<DecomposeResult> {
  const call = await callTrend<DecomposeResult>('/trend/decompose', { series, period }, base ?? TREND_SIDECAR_DEFAULT_URL, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  if (call.data.ok === false) return { ok: false, error: call.data.error, latencyMs: call.latencyMs };
  return { ...call.data, ok: true, latencyMs: call.latencyMs };
}

export async function trendBurst(series: TrendSeriesInput, gamma = 2.0, persistence = 2, base?: string, timeoutMs = 10000): Promise<BurstResult> {
  const call = await callTrend<BurstResult>('/trend/burst', { series, gamma, persistence }, base ?? TREND_SIDECAR_DEFAULT_URL, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  if (call.data.ok === false) return { ok: false, error: call.data.error, latencyMs: call.latencyMs };
  return { ...call.data, ok: true, latencyMs: call.latencyMs };
}

export async function trendChangepoint(series: TrendSeriesInput, penalty = 5.0, minSegment = 3, base?: string, timeoutMs = 10000): Promise<ChangepointResult> {
  const call = await callTrend<ChangepointResult>('/trend/changepoint', { series, penalty, min_segment: minSegment }, base ?? TREND_SIDECAR_DEFAULT_URL, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  if (call.data.ok === false) return { ok: false, error: call.data.error, latencyMs: call.latencyMs };
  return { ...call.data, ok: true, latencyMs: call.latencyMs };
}

export async function trendAnomaly(series: TrendSeriesInput, period = 7, base?: string, timeoutMs = 10000): Promise<AnomalyResult> {
  const call = await callTrend<AnomalyResult>('/trend/anomaly', { series, period }, base ?? TREND_SIDECAR_DEFAULT_URL, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  if (call.data.ok === false) return { ok: false, error: call.data.error, latencyMs: call.latencyMs };
  return { ...call.data, ok: true, latencyMs: call.latencyMs };
}

export async function trendCrossCorr(a: TrendSeriesInput, b: TrendSeriesInput, maxLag = 7, base?: string, timeoutMs = 10000): Promise<CrossCorrResult> {
  const call = await callTrend<CrossCorrResult>('/trend/crosscorr', { a, b, max_lag: maxLag }, base ?? TREND_SIDECAR_DEFAULT_URL, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  if (call.data.ok === false) return { ok: false, error: call.data.error, latencyMs: call.latencyMs };
  return { ...call.data, ok: true, latencyMs: call.latencyMs };
}

export async function trendMomentum(series: TrendSeriesInput, base?: string, timeoutMs = 10000): Promise<MomentumResult> {
  const call = await callTrend<MomentumResult>('/trend/momentum', series, base ?? TREND_SIDECAR_DEFAULT_URL, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  if (call.data.ok === false) return { ok: false, error: call.data.error, latencyMs: call.latencyMs };
  return { ...call.data, ok: true, latencyMs: call.latencyMs };
}

export async function trendScan(series: TrendSeriesInput[], base?: string, timeoutMs = 20000): Promise<ScanResult> {
  const call = await callTrend<ScanResult>('/trend/scan', { series }, base ?? TREND_SIDECAR_DEFAULT_URL, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  if (call.data.ok === false) return { ok: false, error: call.data.error, latencyMs: call.latencyMs };
  return { ...call.data, ok: true, latencyMs: call.latencyMs };
}