/**
 * Keywire ecosystem command-plane bridge — stateless HTTP client for the
 * Keywire zero-trust vault's `/api/v1/ecosystem/*` routes.
 *
 * RETIREMENT STATUS (2026-10-15): this is the ONE coupling Keywire's retirement
 * does not have a replacement for. Recourse's secret dependencies (keywireSecret,
 * the Jev toggle, the autopilot GitHub token) now resolve from Infisical via
 * `src/lib/infisicalLane.ts`, and `fleetRegistry` carries Infisical as a fleet
 * node. This bridge's routes — fleet summary, bringing a service up, pm2 status,
 * the server manifest, brain tasks, the Axiom probe — have no Infisical
 * equivalent at any tier. When Keywire is stopped these calls degrade per the
 * honesty contract below (`ok:false` with the reason), and the fleet-dashboard
 * panel they feed goes dark. Re-home them deliberately or accept the loss.
 *
 * Keywire is an EXTERNAL process (default http://127.0.0.1:4700). This module
 * never owns fleet state and never invents it: every fetch is guarded by a
 * timeout and returns `ok:false` with the underlying error when Keywire is
 * down, rejects, or answers with a non-2xx — mirroring the honesty contract in
 * `src/lib/prometheusBridge.ts` and `src/lib/kgSidecarClient.ts`. No function
 * ever throws.
 *
 * Routes (verified against Keywire/src/ecosystem.ts):
 *   GET  /api/v1/ecosystem/summary        → fleet + sync + tasks snapshot
 *   POST /api/v1/ecosystem/call {id}      → bring one fleet service up
 *   POST /api/v1/ecosystem/brain/task     → proxy to deterministic-brain /task
 *   POST /api/v1/ecosystem/axiom/test     → Axiom routing probe
 *   GET  /api/v1/ecosystem/pm2/status     → pm2 jlist process table
 *   GET  /api/v1/ecosystem/servers        → fleet server manifest
 *
 * Env: KEYWIRE_URL (default http://127.0.0.1:4700). The same env name is used
 * by `src/autopilot/keywireClient.ts`.
 */

import { fleetBaseUrl } from './fleetRegistry.js';

export const KEYWIRE_DEFAULT_URL = fleetBaseUrl('keywire');
/** OpenHub's registry is the current fleet's source of truth (see fleetRegistryHealth). */
export const OPENHUB_REGISTRY_DEFAULT_URL = fleetBaseUrl('openhub');

// ---------------------------------------------------------------------------
// Shapes (mirror Keywire/src/ecosystem.ts response payloads).
// ---------------------------------------------------------------------------

export interface KeywireServersSummary {
  total: number;
  taken: number;
  open: number;
}

export interface KeywireSyncSummary {
  pendingJobs: number;
  failedJobs: number;
  driftCount: number;
}

export interface KeywireTasksSummary {
  total: number;
  done: number;
}

export interface KeywireSummaryPayload {
  servers?: KeywireServersSummary;
  sync?: KeywireSyncSummary;
  tasks?: KeywireTasksSummary;
  health?: string;
  checkedAt?: string;
}

export interface KeywireServiceInfo {
  id: string;
  name?: string;
  url?: string;
  port?: number;
  status?: string;
  pm2Name?: string;
}

export interface KeywireAxiomProbe {
  ok: boolean;
  status?: number;
  latencyMs?: number;
  error?: string;
}

export interface KeywirePm2Process {
  name?: string;
  pm_id?: number;
  status?: string;
  uptime?: number;
  restarts?: number;
  cpu?: number;
  mem?: number;
  port?: number;
}

export interface KeywireEcosystemServer {
  id: string;
  name?: string;
  group?: string;
  port?: number;
  host?: string;
  url?: string;
  description?: string;
  pm2Name?: string;
  status?: string;
  latencyMs?: number;
  lastChecked?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Result envelopes (every fn returns one of these — never throws).
// ---------------------------------------------------------------------------

/** Which system answered a fleet-state call (2026-10-15: OpenHub's registry is
 *  the current fleet's source of truth; Keywire's manifest describes the
 *  pre-Uplift fleet, so it is the fallback, not the primary). */
export type FleetStateSource = 'openhub' | 'keywire';

/** OpenHub registry snapshot (totals + ranking), passed through unreshaped. */
export interface FleetRegistrySnapshot {
  totals?: unknown;
  ranking?: unknown;
  summary?: string;
}

export interface KeywireHealthResult {
  ok: boolean;
  source?: FleetStateSource;
  summary?: KeywireSummaryPayload;
  /** Present only when OpenHub answered (`source: 'openhub'`). */
  registry?: FleetRegistrySnapshot;
  error?: string;
  latencyMs: number;
}

export interface KeywireSummaryResult {
  ok: boolean;
  source?: FleetStateSource;
  servers?: KeywireServersSummary;
  sync?: KeywireSyncSummary;
  tasks?: KeywireTasksSummary;
  health?: string;
  /** Present only when OpenHub answered (`source: 'openhub'`). */
  registry?: FleetRegistrySnapshot;
  error?: string;
  latencyMs: number;
}

export interface KeywireCallResult {
  ok: boolean;
  service?: KeywireServiceInfo;
  error?: string;
  latencyMs: number;
}

export interface KeywireBrainTaskResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  latencyMs: number;
}

export interface KeywireAxiomTestResult {
  ok: boolean;
  probe?: KeywireAxiomProbe;
  error?: string;
  latencyMs: number;
}

export interface KeywirePm2StatusResult {
  ok: boolean;
  processes?: KeywirePm2Process[];
  error?: string;
  latencyMs: number;
}

export interface KeywireServersResult {
  ok: boolean;
  servers?: KeywireEcosystemServer[];
  error?: string;
  latencyMs: number;
}

// ---------------------------------------------------------------------------
// Guards + coercion (defensive, never fabricates).
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function toNumber(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function toOptionalNumber(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function toOptionalString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function parseSummary(json: unknown): KeywireSummaryPayload | null {
  if (!isRecord(json)) return null;
  const servers = isRecord(json.servers)
    ? {
        total: toNumber(json.servers.total, 0),
        taken: toNumber(json.servers.taken, 0),
        open: toNumber(json.servers.open, 0),
      }
    : undefined;
  const sync = isRecord(json.sync)
    ? {
        pendingJobs: toNumber(json.sync.pendingJobs, 0),
        failedJobs: toNumber(json.sync.failedJobs, 0),
        driftCount: toNumber(json.sync.driftCount, 0),
      }
    : undefined;
  const tasks = isRecord(json.tasks)
    ? {
        total: toNumber(json.tasks.total, 0),
        done: toNumber(json.tasks.done, 0),
      }
    : undefined;
  return {
    servers,
    sync,
    tasks,
    health: toOptionalString(json.health),
    checkedAt: toOptionalString(json.checkedAt),
  };
}

function parseService(json: unknown): KeywireServiceInfo | null {
  if (!isRecord(json)) return null;
  const id = toOptionalString(json.id);
  if (!id) return null;
  return {
    id,
    name: toOptionalString(json.name),
    url: toOptionalString(json.url),
    port: toOptionalNumber(json.port),
    status: toOptionalString(json.status),
    pm2Name: toOptionalString(json.pm2Name),
  };
}

function parseProbe(json: unknown): KeywireAxiomProbe | undefined {
  if (!isRecord(json)) return undefined;
  return {
    ok: typeof json.ok === 'boolean' ? json.ok : false,
    status: toOptionalNumber(json.status),
    latencyMs: toOptionalNumber(json.latencyMs),
    error: toOptionalString(json.error),
  };
}

function parseProcesses(json: unknown): KeywirePm2Process[] | undefined {
  if (!isRecord(json) || !Array.isArray(json.procs)) return undefined;
  const out: KeywirePm2Process[] = [];
  for (const p of json.procs) {
    if (!isRecord(p)) continue;
    out.push({
      name: toOptionalString(p.name),
      pm_id: toOptionalNumber(p.pm_id),
      status: toOptionalString(p.status),
      uptime: toOptionalNumber(p.uptime),
      restarts: toOptionalNumber(p.restarts),
      cpu: toOptionalNumber(p.cpu),
      mem: toOptionalNumber(p.mem),
      port: toOptionalNumber(p.port),
    });
  }
  return out;
}

function parseServers(json: unknown): KeywireEcosystemServer[] | undefined {
  if (!isRecord(json) || !Array.isArray(json.servers)) return undefined;
  const out: KeywireEcosystemServer[] = [];
  for (const s of json.servers) {
    if (!isRecord(s)) continue;
    const id = toOptionalString(s.id);
    if (!id) continue;
    out.push({
      id,
      name: toOptionalString(s.name),
      group: toOptionalString(s.group),
      port: toOptionalNumber(s.port),
      host: toOptionalString(s.host),
      url: toOptionalString(s.url),
      description: toOptionalString(s.description),
      pm2Name: toOptionalString(s.pm2Name),
      status: toOptionalString(s.status),
      latencyMs: toOptionalNumber(s.latencyMs),
      lastChecked: toOptionalString(s.lastChecked),
      error: toOptionalString(s.error),
    });
  }
  return out;
}

/** Best-effort `error` field from a non-2xx body, if it is JSON. */
function extractErrorMessage(text: string): string | undefined {
  if (!text) return undefined;
  try {
    const j: unknown = JSON.parse(text);
    if (isRecord(j)) return toOptionalString(j.error);
  } catch {
    /* not json — no server error to surface */
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Transport — timeout-guarded, never throws.
// ---------------------------------------------------------------------------

interface KeywireRawCall {
  ok: boolean;
  status: number;
  data: unknown;
  error?: string;
  latencyMs: number;
}

// ---------------------------------------------------------------------------
// Auth — service-token exchange with a short-lived JWT cache.
//
// Keywire runs with auth ON by default (pm2 production posture): every
// /api/v1 call needs `Authorization: Bearer <jwt>`. Raw `kw_st_live_*` service
// tokens are NOT JWTs — they are exchanged via POST /auth/service-token/exchange
// for a 15-minute JWT. This module performs the exchange lazily, caches the
// JWT in memory (never persisted), refreshes when it expires, and attaches the
// Bearer header to every request. When KEYWIRE_SERVICE_TOKEN is unset we still
// try unauthenticated (loopback dev bypass) and report the 401 honestly.
// ---------------------------------------------------------------------------

const KEYWIRE_SERVICE_TOKEN = process.env.KEYWIRE_SERVICE_TOKEN || '';

interface JwtCache {
  token: string;
  expiresAt: number; // ms epoch; refresh ~60s before expiry
}

let jwtCache: JwtCache | null = null;

function isServiceTokenConfigured(): boolean {
  return KEYWIRE_SERVICE_TOKEN.length > 0;
}

/**
 * Exchange the raw service token for a JWT (lazy, cached, never persisted).
 * Returns the token or null on failure (no throw).
 */
async function obtainJwt(base: string, timeoutMs: number): Promise<string | null> {
  const now = Date.now();
  if (jwtCache && now < jwtCache.expiresAt - 60_000) return jwtCache.token;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/v1/auth/service-token/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: KEYWIRE_SERVICE_TOKEN }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const j: unknown = await res.json();
    if (!isRecord(j) || typeof j.accessToken !== 'string') return null;
    const expiresIn = toNumber(j.expiresIn, 900) * 1000;
    jwtCache = { token: j.accessToken, expiresAt: now + expiresIn };
    return j.accessToken;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function request(
  method: 'GET' | 'POST',
  path: string,
  base: string,
  timeoutMs: number,
  body?: unknown,
): Promise<KeywireRawCall> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (isServiceTokenConfigured()) {
      const jwt = await obtainJwt(base, timeoutMs);
      if (jwt) headers['Authorization'] = `Bearer ${jwt}`;
    }
    const init: RequestInit = { method, signal: controller.signal, headers };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await fetch(`${base.replace(/\/$/, '')}${path}`, init);
    const latencyMs = Date.now() - started;
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      const serverError = extractErrorMessage(text);
      return {
        ok: false,
        status: res.status,
        data: null,
        latencyMs,
        error: serverError
          ? `keywire HTTP ${res.status}: ${serverError}`
          : res.status === 401
            ? 'keywire HTTP 401: authentication required (set KEYWIRE_SERVICE_TOKEN)'
            : `keywire HTTP ${res.status}`,
      };
    }
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    return { ok: true, status: res.status, data, latencyMs };
  } catch (err: unknown) {
    const latencyMs = Date.now() - started;
    const timedOut = err instanceof Error && err.name === 'AbortError';
    const msg = err instanceof Error && err.message ? err.message : 'keywire unreachable';
    return {
      ok: false,
      status: 0,
      data: null,
      latencyMs,
      error: timedOut ? `keywire timed out after ${timeoutMs}ms` : msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

/**
 * Auth configuration status — tells callers whether a service token is
 * configured and whether a JWT is currently cached (and when it expires).
 * Never reveals the token itself.
 */
export function keywireAuthStatus(): { configured: boolean; jwtCached: boolean; jwtExpiresAt: number | null } {
  return {
    configured: isServiceTokenConfigured(),
    jwtCached: jwtCache !== null,
    jwtExpiresAt: jwtCache ? jwtCache.expiresAt : null,
  };
}

/** OpenHub's machine-surface credential — same convention as auditAdapters.ts. */
export function openHubInternalSecret(env: NodeJS.ProcessEnv = process.env): string {
  return (env.RECOURSE_OPENHUB_SECRET || env.OPENHUB_INTERNAL_SECRET || '').trim();
}

/**
 * The CURRENT fleet view: OpenHub's machine surface
 * (`GET /api/internal/ecosystem/registry/summary`, Bearer = the shared internal
 * secret — the interactive registry routes are session-guarded and answer 403 to
 * a machine). Never throws.
 */
export async function fleetRegistryHealth(
  base: string = OPENHUB_REGISTRY_DEFAULT_URL,
  timeoutMs = 5000,
): Promise<{ ok: boolean; latencyMs: number; registry?: FleetRegistrySnapshot; error?: string }> {
  const started = Date.now();
  const secret = openHubInternalSecret();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/api/internal/ecosystem/registry/summary`, {
      headers: secret ? { Authorization: `Bearer ${secret}` } : {},
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      const detail = res.status === 503 ? 'internal surface disabled (OPENHUB_INTERNAL_SECRET unset)' : `HTTP ${res.status}`;
      return { ok: false, error: `registry summary ${detail}`, latencyMs };
    }
    const d = (await res.json().catch(() => null)) as { ok?: unknown; summary?: unknown; totals?: unknown; ranking?: unknown } | null;
    if (!d || d.ok !== true) return { ok: false, error: 'registry summary returned no JSON object', latencyMs };
    return {
      ok: true,
      latencyMs,
      registry: { totals: d.totals, ranking: d.ranking, summary: typeof d.summary === 'string' ? d.summary : undefined },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unreachable', latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fleet state. OpenHub's registry first (the current fleet); Keywire's
 * `/api/v1/ecosystem/summary` only as a fallback. The OpenHub attempt is skipped
 * when a caller passes an explicit non-default `base` — so tests and deliberate
 * overrides keep their deterministic direct path.
 */
export async function keywireHealth(
  base: string = KEYWIRE_DEFAULT_URL,
  timeoutMs = 5000,
): Promise<KeywireHealthResult> {
  if (base === KEYWIRE_DEFAULT_URL) {
    const reg = await fleetRegistryHealth(OPENHUB_REGISTRY_DEFAULT_URL, timeoutMs);
    if (reg.ok && reg.registry) return { ok: true, source: 'openhub', registry: reg.registry, latencyMs: reg.latencyMs };
  }
  const call = await request('GET', '/api/v1/ecosystem/summary', base, timeoutMs);
  if (!call.ok) return { ok: false, source: 'keywire', error: call.error, latencyMs: call.latencyMs };
  const summary = parseSummary(call.data);
  if (!summary) return { ok: false, source: 'keywire', error: 'keywire summary returned no JSON object', latencyMs: call.latencyMs };
  return { ok: true, source: 'keywire', summary, latencyMs: call.latencyMs };
}

/**
 * Same state, flattened. OpenHub first (registry snapshot instead of the Keywire
 * server/sync/task shape, because those numbers do not exist in the registry and
 * are not invented here); Keywire's flattened shape when it is the answering lane.
 */
export async function keywireSummary(
  base: string = KEYWIRE_DEFAULT_URL,
  timeoutMs = 5000,
): Promise<KeywireSummaryResult> {
  if (base === KEYWIRE_DEFAULT_URL) {
    const reg = await fleetRegistryHealth(OPENHUB_REGISTRY_DEFAULT_URL, timeoutMs);
    if (reg.ok && reg.registry) return { ok: true, source: 'openhub', registry: reg.registry, latencyMs: reg.latencyMs };
  }
  const call = await request('GET', '/api/v1/ecosystem/summary', base, timeoutMs);
  if (!call.ok) return { ok: false, source: 'keywire', error: call.error, latencyMs: call.latencyMs };
  const summary = parseSummary(call.data);
  if (!summary) return { ok: false, source: 'keywire', error: 'keywire summary returned no JSON object', latencyMs: call.latencyMs };
  return {
    ok: true,
    source: 'keywire',
    servers: summary.servers,
    sync: summary.sync,
    tasks: summary.tasks,
    health: summary.health,
    latencyMs: call.latencyMs,
  };
}

/**
 * POST /api/v1/ecosystem/call — bring one fleet service up. Timeout is
 * generous (45s) because Keywire waits for the port to open (up to ~30s).
 * `id` ∈ draymond | keywire | dsh | brain | claw | aetherdesk | bookbridge | ...
 */
export async function keywireCallService(
  id: string,
  base: string = KEYWIRE_DEFAULT_URL,
  timeoutMs = 45000,
): Promise<KeywireCallResult> {
  if (!id || typeof id !== 'string') {
    return { ok: false, error: 'keywire call requires a service id', latencyMs: 0 };
  }
  const call = await request('POST', '/api/v1/ecosystem/call', base, timeoutMs, { id });
  if (!call.ok) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  const service = parseService(call.data);
  if (!service) return { ok: false, error: 'keywire call returned no service payload', latencyMs: call.latencyMs };
  return { ok: true, service, latencyMs: call.latencyMs };
}

/**
 * POST /api/v1/ecosystem/brain/task — proxy to the deterministic brain /task.
 * `data` is the raw (opaque) brain payload; it is never reshaped or guessed.
 */
export async function keywireBrainTask(
  payload: Record<string, unknown>,
  base: string = KEYWIRE_DEFAULT_URL,
  timeoutMs = 20000,
): Promise<KeywireBrainTaskResult> {
  const call = await request('POST', '/api/v1/ecosystem/brain/task', base, timeoutMs, payload);
  if (!call.ok) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  return { ok: true, data: call.data, latencyMs: call.latencyMs };
}

/**
 * POST /api/v1/ecosystem/axiom/test — Axiom routing probe. `probe.ok` mirrors
 * the server's own probe result; the envelope `ok` reflects the HTTP call.
 */
export async function keywireAxiomTest(
  base: string = KEYWIRE_DEFAULT_URL,
  timeoutMs = 8000,
): Promise<KeywireAxiomTestResult> {
  const call = await request('POST', '/api/v1/ecosystem/axiom/test', base, timeoutMs, {});
  if (!call.ok) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  const probe = isRecord(call.data) ? parseProbe(call.data.probe) : undefined;
  if (!probe) return { ok: false, error: 'keywire axiom/test returned no probe payload', latencyMs: call.latencyMs };
  return { ok: true, probe, latencyMs: call.latencyMs };
}

/**
 * GET /api/v1/ecosystem/pm2/status — live pm2 process table. If Keywire
 * itself reports `ok:false` (fallback mode, pm2 down), we surface `ok:false`
 * with the server's error rather than inventing a process list.
 */
export async function keywirePm2Status(
  base: string = KEYWIRE_DEFAULT_URL,
  timeoutMs = 12000,
): Promise<KeywirePm2StatusResult> {
  const call = await request('GET', '/api/v1/ecosystem/pm2/status', base, timeoutMs);
  if (!call.ok) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  if (isRecord(call.data) && call.data.ok === false) {
    const serverError = toOptionalString(call.data.error) ?? 'pm2 status not available';
    return { ok: false, error: serverError, latencyMs: call.latencyMs };
  }
  const processes = parseProcesses(call.data);
  if (!processes) return { ok: false, error: 'keywire pm2/status returned no process table', latencyMs: call.latencyMs };
  return { ok: true, processes, latencyMs: call.latencyMs };
}

/**
 * GET /api/v1/ecosystem/servers — fleet server manifest (id, group, port,
 * pm2Name, live status...). Servers without a usable id are skipped, never
 * invented.
 */
export async function keywireServers(
  base: string = KEYWIRE_DEFAULT_URL,
  timeoutMs = 10000,
): Promise<KeywireServersResult> {
  const call = await request('GET', '/api/v1/ecosystem/servers', base, timeoutMs);
  if (!call.ok) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  const servers = parseServers(call.data);
  if (!servers) return { ok: false, error: 'keywire servers returned no manifest', latencyMs: call.latencyMs };
  return { ok: true, servers, latencyMs: call.latencyMs };
}