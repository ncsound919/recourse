/**
 * Overlay Oncology engine bridge — stateless HTTP client for the Overlay
 * Oncology Next app's math/simulate/synthesis API.
 *
 * The Oncology app is an EXTERNAL process (fleet registry: Overlay Oncology
 * on http://127.0.0.1:3070, pm2 "overlay-oncology"). The old :3000 default
 * pointed at Keywire's SPA (HTML, not JSON) — every manifest call failed
 * with "invalid JSON". This module never owns its data and never invents
 * results: every fetch is guarded by a timeout and returns `ok:false`
 * with the underlying error when the app is down or rejects, mirroring
 * the honesty contract in `src/lib/kgSidecarClient.ts` and
 * `src/lib/prometheusBridge.ts`.
 *
 * Env: ONCOLOGY_URL (default http://127.0.0.1:3070).
 */

export const ONCOLOGY_DEFAULT_URL =
  process.env.ONCOLOGY_URL || 'http://127.0.0.1:3070';

export interface OncologyManifestResult {
  ok: boolean;
  manifest?: unknown;
  error?: string;
  latencyMs: number;
}

export interface OncologySimulateResult {
  ok: boolean;
  result?: unknown;
  error?: string;
  latencyMs: number;
}

export interface OncologySynthesisResult {
  ok: boolean;
  synthesis?: unknown;
  error?: string;
  latencyMs: number;
}

function baseUrl(base: string): string {
  return base.replace(/\/$/, '');
}

async function getJson(
  path: string,
  base: string,
  timeoutMs: number,
  label: string,
): Promise<{ ok: boolean; status: number; data: unknown | null; error?: string; latencyMs: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`${baseUrl(base)}${path}`, { signal: controller.signal });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { ok: false, status: res.status, data: null, latencyMs, error: `${label} HTTP ${res.status}` };
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return { ok: false, status: res.status, data: null, latencyMs, error: `${label} invalid JSON` };
    }
    return { ok: true, status: res.status, data, latencyMs };
  } catch (err: unknown) {
    const latencyMs = Date.now() - started;
    const timedOut = err instanceof Error && err.name === 'AbortError';
    const msg = err instanceof Error ? err.message : `${label} unreachable`;
    return {
      ok: false,
      status: 0,
      data: null,
      latencyMs,
      error: timedOut ? `${label} timed out after ${timeoutMs}ms` : msg,
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
  label: string,
): Promise<{ ok: boolean; status: number; data: unknown | null; error?: string; latencyMs: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`${baseUrl(base)}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { ok: false, status: res.status, data: null, latencyMs, error: `${label} HTTP ${res.status}` };
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return { ok: false, status: res.status, data: null, latencyMs, error: `${label} invalid JSON` };
    }
    return { ok: true, status: res.status, data, latencyMs };
  } catch (err: unknown) {
    const latencyMs = Date.now() - started;
    const timedOut = err instanceof Error && err.name === 'AbortError';
    const msg = err instanceof Error ? err.message : `${label} unreachable`;
    return {
      ok: false,
      status: 0,
      data: null,
      latencyMs,
      error: timedOut ? `${label} timed out after ${timeoutMs}ms` : msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET /api/math/manifest. Guarded: timeout via AbortController,
 * non-2xx → ok:false, invalid JSON → ok:false. NEVER throws and NEVER
 * fabricates a manifest.
 */
export async function oncologyManifest(
  base: string = ONCOLOGY_DEFAULT_URL,
  timeoutMs = 5000,
): Promise<OncologyManifestResult> {
  const call = await getJson('/api/math/manifest', base, timeoutMs, 'oncology manifest');
  if (!call.ok) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  return { ok: true, manifest: call.data, latencyMs: call.latencyMs };
}

/**
 * POST /api/simulate with JSON body. Guarded: timeout via
 * AbortController, non-2xx → ok:false, invalid JSON → ok:false.
 * NEVER throws and NEVER fabricates a result.
 */
export async function oncologySimulate(
  input: Record<string, unknown>,
  base: string = ONCOLOGY_DEFAULT_URL,
  timeoutMs = 15000,
): Promise<OncologySimulateResult> {
  const call = await postJson('/api/simulate', input, base, timeoutMs, 'oncology simulate');
  if (!call.ok) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  return { ok: true, result: call.data, latencyMs: call.latencyMs };
}

/**
 * GET /api/research/synthesis. Guarded: timeout via AbortController,
 * non-2xx → ok:false, invalid JSON → ok:false. NEVER throws and NEVER
 * fabricates synthesis output.
 */
export async function oncologySynthesis(
  base: string = ONCOLOGY_DEFAULT_URL,
  timeoutMs = 5000,
): Promise<OncologySynthesisResult> {
  const call = await getJson('/api/research/synthesis', base, timeoutMs, 'oncology synthesis');
  if (!call.ok) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  return { ok: true, synthesis: call.data, latencyMs: call.latencyMs };
}

// ===========================================================================
// AGGREGATE SURFACE — Overlay Oncology already orchestrates Decon, QLCCE,
// ATTEC, ctDNA/MRD, Oncograph, HelixForge and daraxonrasib in its lib/ and
// exposes them through these routes. Recourse reaches all of them through
// THIS one client instead of building a bridge per subsystem. Every contract
// below was verified against the route's source (method + payload shape) —
// not guessed.
// ===========================================================================

export interface OncologyCallResult<T = unknown> {
  ok: boolean;
  data?: T;
  status?: number;
  error?: string;
  latencyMs: number;
}

function wrap<T>(call: { ok: boolean; status: number; data: unknown | null; error?: string; latencyMs: number }, label: string): OncologyCallResult<T> {
  if (!call.ok) return { ok: false, status: call.status || undefined, error: call.error ?? `${label} failed`, latencyMs: call.latencyMs };
  return { ok: true, data: call.data as T, status: call.status, latencyMs: call.latencyMs };
}

/** GET /api/calibration/state — the real calibrated values the simulator
 *  consumes (nulls when nothing calibrated; never fabricated). */
export async function oncologyCalibrationState(
  base: string = ONCOLOGY_DEFAULT_URL,
  timeoutMs = 4000,
): Promise<OncologyCallResult<{ updatedAtIso: string | null }>> {
  const call = await getJson('/api/calibration/state', base, timeoutMs, 'oncology calibration state');
  return wrap(call, 'oncology calibration state');
}

/** JSON health probe: the calibration-state route answers JSON when the host
 *  is genuinely up (unlike `/`, which serves HTML). */
export async function oncologyHealth(
  base: string = ONCOLOGY_DEFAULT_URL,
  timeoutMs = 4000,
): Promise<OncologyCallResult<{ updatedAtIso: string | null }>> {
  return oncologyCalibrationState(base, timeoutMs);
}

/** GET /api/calibration/datasets — calibration registry (datasets + targets). */
export async function oncologyCalibrationDatasets(
  base: string = ONCOLOGY_DEFAULT_URL,
  timeoutMs = 5000,
): Promise<OncologyCallResult> {
  const call = await getJson('/api/calibration/datasets', base, timeoutMs, 'oncology calibration datasets');
  return wrap(call, 'oncology calibration datasets');
}

/** GET /api/validation/scorecard — the real-data credibility surface
 *  (C-index vs Cox on real TCGA-LUAD, bootstrap CI, verification suite).
 *  HEAVY: runs the actual benchmark; give it a generous timeout. */
export async function oncologyValidationScorecard(
  base: string = ONCOLOGY_DEFAULT_URL,
  timeoutMs = 90_000,
): Promise<OncologyCallResult> {
  const call = await getJson('/api/validation/scorecard', base, timeoutMs, 'oncology validation scorecard');
  return wrap(call, 'oncology validation scorecard');
}

/** GET /api/validation/matrix — the honest generalization matrix
 *  (?train=LUAD,BRCA&valid=PAAD,GBM,...). */
export async function oncologyValidationMatrix(
  opts: { train?: string[]; valid?: string[]; base?: string; timeoutMs?: number } = {},
): Promise<OncologyCallResult> {
  const params = new URLSearchParams();
  if (opts.train?.length) params.set('train', opts.train.join(','));
  if (opts.valid?.length) params.set('valid', opts.valid.join(','));
  const qs = params.toString();
  const call = await getJson(`/api/validation/matrix${qs ? `?${qs}` : ''}`, opts.base ?? ONCOLOGY_DEFAULT_URL, opts.timeoutMs ?? 120_000, 'oncology validation matrix');
  return wrap(call, 'oncology validation matrix');
}

export interface OncologyHypothesis {
  id: string;
  claim: string;
  targetGene?: string;
  mechanism?: string;
}

/** POST /api/discovery/screen — screen hypotheses through the discovery
 *  screening queue (deterministic; same seed -> same ranking). */
export async function oncologyDiscoveryScreen(
  hypotheses: OncologyHypothesis[],
  opts: { seed?: number; useQueue?: boolean; base?: string; timeoutMs?: number } = {},
): Promise<OncologyCallResult> {
  const body = { hypotheses, seed: opts.seed ?? 20260902, useQueue: opts.useQueue ?? false };
  const call = await postJson('/api/discovery/screen', body, opts.base ?? ONCOLOGY_DEFAULT_URL, opts.timeoutMs ?? 30_000, 'oncology discovery screen');
  return wrap(call, 'oncology discovery screen');
}

/** GET /api/discovery/ledger — the persistent wet-lab results ledger. */
export async function oncologyDiscoveryLedger(
  base: string = ONCOLOGY_DEFAULT_URL,
  timeoutMs = 5000,
): Promise<OncologyCallResult<{ count: number }>> {
  const call = await getJson('/api/discovery/ledger', base, timeoutMs, 'oncology discovery ledger');
  return wrap(call, 'oncology discovery ledger');
}

/** GET /api/evidence — versioned cohort snapshots (all cohorts when no cohort
 *  given; per-gene expression when cohort+gene supplied). */
export async function oncologyEvidence(
  opts: { cohort?: string; gene?: string; base?: string; timeoutMs?: number } = {},
): Promise<OncologyCallResult> {
  const params = new URLSearchParams();
  if (opts.cohort) params.set('cohort', opts.cohort.toUpperCase());
  if (opts.gene) params.set('gene', opts.gene.toUpperCase());
  const qs = params.toString();
  const call = await getJson(`/api/evidence${qs ? `?${qs}` : ''}`, opts.base ?? ONCOLOGY_DEFAULT_URL, opts.timeoutMs ?? 15_000, 'oncology evidence');
  return wrap(call, 'oncology evidence');
}

/** GET /api/research/unified — the latest checked-in full-system report
 *  artifact (honest 404 with the replay command when none exists). */
export async function oncologyResearchUnified(
  base: string = ONCOLOGY_DEFAULT_URL,
  timeoutMs = 10_000,
): Promise<OncologyCallResult> {
  const call = await getJson('/api/research/unified', base, timeoutMs, 'oncology research unified');
  return wrap(call, 'oncology research unified');
}

export interface OncologyPipelineStudy {
  topic: string;
  cancerType?: string;
  target?: string;
  mechanism?: string;
  seeds?: number[];
  ticks?: number;
  dose?: number;
  runCycle?: boolean;
  runSim?: boolean;
  runBacktest?: boolean;
  crossReference?: boolean;
  publish?: boolean;
}

/** POST /api/research/pipeline — run the multi-engine research study
 *  (CureMind cycle -> simulation -> backtest -> cross-reference -> verify ->
 *  contract). publish=true requires the oncology app's approval key and is
 *  refused upstream without it; Recourse never sets publish implicitly. */
export async function oncologyResearchPipeline(
  study: OncologyPipelineStudy,
  opts: { base?: string; timeoutMs?: number } = {},
): Promise<OncologyCallResult> {
  const call = await postJson('/api/research/pipeline', { ...study, publish: study.publish ?? false }, opts.base ?? ONCOLOGY_DEFAULT_URL, opts.timeoutMs ?? 300_000, 'oncology research pipeline');
  return wrap(call, 'oncology research pipeline');
}

/** GET /api/mechanism-fusion — the MechanismFusionEngine report (registered
 *  mechanism DAGs + cross-domain alignments). */
export async function oncologyMechanismFusion(
  base: string = ONCOLOGY_DEFAULT_URL,
  timeoutMs = 30_000,
): Promise<OncologyCallResult> {
  const call = await getJson('/api/mechanism-fusion', base, timeoutMs, 'oncology mechanism fusion');
  return wrap(call, 'oncology mechanism fusion');
}

/** POST /api/predict — evidence-backed patient prediction. The upstream route
 *  honestly returns 422 (insufficient data) or 501 (no validated model
 *  configured) — both surface here as ok:false with the real status. */
export async function oncologyPredict(
  body: Record<string, unknown>,
  base: string = ONCOLOGY_DEFAULT_URL,
  timeoutMs = 20_000,
): Promise<OncologyCallResult> {
  const call = await postJson('/api/predict', body, base, timeoutMs, 'oncology predict');
  return wrap(call, 'oncology predict');
}
