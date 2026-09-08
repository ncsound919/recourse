/**
 * Recourse BioSim sidecar client.
 *
 * Talks to the Python Monte Carlo tumor/CAR-T + sequencing sidecar
 * (`python/biosim_service/main.py`) over HTTP. The sidecar is STATELESS:
 * Recourse sends simulation parameters in every request and the sidecar
 * returns real numpy/scipy computation over that input (BioSimEngine v0.3 +
 * SeqLayer P_ERR / detect_prob / lod95, ported from bisim and abm/).
 *
 * Honesty contract (mirrors `src/lib/kgSidecarClient.ts` and `src/intake/*`):
 * every call is guarded by a timeout and returns `ok:false` with the
 * underlying error when the sidecar is unreachable or rejects. It NEVER
 * fabricates a trial outcome, cure rate, or detection probability, and never
 * pretends the simulation ran when the service is down.
 *
 * Env: BIOSIM_SIDECAR_URL (default http://127.0.0.1:8503). Optionally pass a
 * base url to any fn for tests/overrides.
 */

export const BIOSIM_SIDECAR_DEFAULT_URL =
  process.env.BIOSIM_SIDECAR_URL || 'http://127.0.0.1:8503';

export interface BiosimTrialParams {
  gens?: number;
  growth?: number;
  mu_driver?: number;
  driver_boost?: number;
  car_t_dose?: number;
  kill_rate?: number;
  t_start?: number;
  seed?: number;
}

export interface BiosimTrialOutcome {
  final: number;
  extinct: number | null;
  recurred: number | null;
  agneg: number;
  mu: number;
  nadir: number | null;
  dose: number;
}

export interface BiosimTrialResult {
  ok: boolean;
  seed?: number;
  trial?: BiosimTrialOutcome;
  error?: string;
  latencyMs?: number;
}

export interface BiosimMontecarloParams {
  n_trials: number;
  dose: number;
  seed?: number;
  gens?: number;
  growth?: number;
  mu_driver?: number;
  driver_boost?: number;
  kill_rate?: number;
  t_start?: number;
}

export interface BiosimMontecarloResult {
  ok: boolean;
  seed?: number;
  dose?: number;
  n_trials?: number;
  cure_rate?: number;
  recurrence_rate?: number;
  mean_final_burden?: number;
  trials?: BiosimTrialOutcome[];
  truncated?: boolean;
  error?: string;
  latencyMs?: number;
}

export interface BiosimSequenceParams {
  agneg: number;
  depth: number;
  platform: string;
  seed?: number;
}

export interface BiosimSequenceResult {
  ok: boolean;
  vaf?: number;
  depth?: number;
  platform?: string;
  p_detect?: number;
  detected?: boolean;
  error?: string;
  latencyMs?: number;
}

export interface BiosimLod95Params {
  platform: string;
  depth: number;
}

export interface BiosimLod95Result {
  ok: boolean;
  platform?: string;
  depth?: number;
  lod95_vaf?: number | null;
  reached?: boolean;
  note?: string;
  error?: string;
  latencyMs?: number;
}

export interface BiosimHealthResult {
  ok: boolean;
  service?: string;
  numpy?: string;
  error?: string;
  latencyMs?: number;
}

export interface BiosimSidecarCall<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
  latencyMs: number;
}

async function callBiosim<T>(
  path: string,
  body: unknown,
  base: string,
  timeoutMs: number,
): Promise<BiosimSidecarCall<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { ok: false, status: res.status, data: null, latencyMs, error: `biosim sidecar HTTP ${res.status}` };
    }
    const data = (await res.json()) as T;
    return { ok: true, status: res.status, data, latencyMs };
  } catch (err: any) {
    const latencyMs = Date.now() - started;
    return {
      ok: false,
      status: 0,
      data: null,
      latencyMs,
      error: err?.name === 'AbortError' ? `biosim sidecar timed out after ${timeoutMs}ms` : err?.message || 'biosim sidecar unreachable',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function getBiosim<T>(path: string, base: string, timeoutMs: number): Promise<BiosimSidecarCall<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}${path}`, { signal: controller.signal });
    const latencyMs = Date.now() - started;
    if (!res.ok) return { ok: false, status: res.status, data: null, latencyMs, error: `biosim sidecar HTTP ${res.status}` };
    const data = (await res.json()) as T;
    return { ok: true, status: res.status, data, latencyMs };
  } catch (err: any) {
    const latencyMs = Date.now() - started;
    return {
      ok: false,
      status: 0,
      data: null,
      latencyMs,
      error: err?.name === 'AbortError' ? `biosim sidecar timed out after ${timeoutMs}ms` : err?.message || 'biosim sidecar unreachable',
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Health check — used by status routes so the UI can report sidecar online/offline honestly. */
export async function biosimHealth(base = BIOSIM_SIDECAR_DEFAULT_URL, timeoutMs = 2000): Promise<BiosimHealthResult> {
  const call = await getBiosim<BiosimHealthResult>('/health', base, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  return { ok: true, service: call.data.service, numpy: call.data.numpy, latencyMs: call.latencyMs };
}

export async function biosimTrial(
  params: BiosimTrialParams,
  base = BIOSIM_SIDECAR_DEFAULT_URL,
  timeoutMs = 10000,
): Promise<BiosimTrialResult> {
  const call = await callBiosim<BiosimTrialResult>('/biosim/trial', params, base, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  return { ...call.data, latencyMs: call.latencyMs };
}

export async function biosimMontecarlo(
  params: BiosimMontecarloParams,
  base = BIOSIM_SIDECAR_DEFAULT_URL,
  timeoutMs = 30000,
): Promise<BiosimMontecarloResult> {
  const call = await callBiosim<BiosimMontecarloResult>('/biosim/montecarlo', params, base, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  return { ...call.data, latencyMs: call.latencyMs };
}

export async function biosimSequence(
  params: BiosimSequenceParams,
  base = BIOSIM_SIDECAR_DEFAULT_URL,
  timeoutMs = 10000,
): Promise<BiosimSequenceResult> {
  const call = await callBiosim<BiosimSequenceResult>('/biosim/sequence', params, base, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  return { ...call.data, latencyMs: call.latencyMs };
}

export async function biosimLod95(
  params: BiosimLod95Params,
  base = BIOSIM_SIDECAR_DEFAULT_URL,
  timeoutMs = 10000,
): Promise<BiosimLod95Result> {
  const call = await callBiosim<BiosimLod95Result>('/biosim/lod95', params, base, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  return { ...call.data, latencyMs: call.latencyMs };
}
