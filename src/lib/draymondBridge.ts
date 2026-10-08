/**
 * draymondBridge.ts — fail-soft HTTP client for Draymond-Orchestrator.
 *
 * Recourse already receives calls FROM Draymond (`src/lib/mathx/recourse.ts`
 * inside Draymond calls Recourse's synergy map, verify, repair, tick, ...).
 * This is the reverse edge: Recourse reading Draymond's science/TID data and
 * writing Recourse's cross-domain findings back as `science_insights`, which
 * Draymond's TID collectors harvest into signals → insights → discoveries.
 *
 * Honesty contract (mirrors the other bridge clients): every call is guarded by
 * a timeout and returns `{ ok:false, error }` when Draymond is unreachable or
 * rejects. It never fabricates a grade, signal, insight, or a successful write.
 *
 * Env:
 *   DRAYMOND_URL / DRAYMOND_OPS_URL   base URL (default http://127.0.0.1:3444)
 *   DRAYMOND_CRON_SECRET / CRON_SECRET  Bearer token (required by Draymond)
 *   DRAYMOND_TIMEOUT_MS               per-call timeout (default 8000)
 */

import { fleetCall, fleetBaseUrl, type BridgeCall } from './fleetRegistry.js';

export const DRAYMOND_DEFAULT_URL = fleetBaseUrl('draymond');

export function draymondConfig(): { baseUrl: string; secret: string; timeoutMs: number } {
  return {
    baseUrl: fleetBaseUrl('draymond'),
    secret: process.env.DRAYMOND_CRON_SECRET || process.env.CRON_SECRET || '',
    timeoutMs: Math.max(1000, Number(process.env.DRAYMOND_TIMEOUT_MS) || 8000),
  };
}

export type { BridgeCall } from './fleetRegistry.js';

function call<T>(
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
  opts: { baseUrl?: string; timeoutMs?: number } = {},
): Promise<BridgeCall<T>> {
  const cfg = draymondConfig();
  return fleetCall<T>('draymond', path, {
    method: init.method,
    body: init.body,
    baseUrl: opts.baseUrl ?? cfg.baseUrl,
    timeoutMs: opts.timeoutMs ?? cfg.timeoutMs,
    headers: cfg.secret ? { Authorization: `Bearer ${cfg.secret}` } : {},
  });
}

// -- Health -------------------------------------------------------------------

/** Cheap reachability probe (Draymond's root route). */
export async function draymondHealth(base?: string, timeoutMs = 2500): Promise<{ ok: boolean; status: number; error?: string; latencyMs: number }> {
  const r = await call<unknown>('/', { method: 'GET' }, { baseUrl: base, timeoutMs });
  return { ok: r.ok, status: r.status, error: r.error, latencyMs: r.latencyMs };
}

// -- Read: science + learning -------------------------------------------------

export interface ScienceGradeResponse {
  ok?: boolean;
  discoveries?: Array<Record<string, unknown>>;
}
export function fetchScienceGrades(base?: string, timeoutMs?: number) {
  return call<ScienceGradeResponse>('/api/v1/science/grade', { method: 'GET' }, { baseUrl: base, timeoutMs });
}

export function fetchScienceGoals(base?: string, timeoutMs?: number) {
  return call<Record<string, unknown>>('/api/v1/science/goals', { method: 'GET' }, { baseUrl: base, timeoutMs });
}

export function fetchLearningStore(base?: string, timeoutMs?: number) {
  return call<Record<string, unknown>>('/api/ops/learning/store', { method: 'GET' }, { baseUrl: base, timeoutMs });
}

export function fetchScienceInsights(opts: { source?: string; limit?: number; base?: string; timeoutMs?: number } = {}) {
  const q = new URLSearchParams();
  if (opts.source) q.set('source', opts.source);
  if (opts.limit) q.set('limit', String(opts.limit));
  const qs = q.toString();
  return call<{ ok?: boolean; insights?: Array<Record<string, unknown>> }>(
    `/api/v1/science/insights${qs ? `?${qs}` : ''}`,
    { method: 'GET' },
    { baseUrl: opts.base, timeoutMs: opts.timeoutMs },
  );
}

// -- Read: TID (routes added to Draymond alongside this bridge) ----------------

export interface TidListQuery {
  source?: string;
  category?: string;
  status?: string;
  type?: string;
  component?: string;
  metric?: string;
  limit?: number;
  base?: string;
  timeoutMs?: number;
}

function tidQuery(opts: TidListQuery): string {
  const q = new URLSearchParams();
  for (const k of ['source', 'category', 'status', 'type', 'component', 'metric'] as const) {
    const v = opts[k];
    if (v) q.set(k, v);
  }
  if (opts.limit) q.set('limit', String(opts.limit));
  const qs = q.toString();
  return qs ? `?${qs}` : '';
}

export function fetchTidSignals(opts: TidListQuery = {}) {
  return call<{ ok?: boolean; signals?: Array<Record<string, unknown>> }>(
    `/api/ops/tid/signals${tidQuery(opts)}`,
    { method: 'GET' },
    { baseUrl: opts.base, timeoutMs: opts.timeoutMs },
  );
}

export function fetchTidInsights(opts: TidListQuery = {}) {
  return call<{ ok?: boolean; insights?: Array<Record<string, unknown>> }>(
    `/api/ops/tid/insights${tidQuery(opts)}`,
    { method: 'GET' },
    { baseUrl: opts.base, timeoutMs: opts.timeoutMs },
  );
}

export function fetchTidTrends(opts: TidListQuery = {}) {
  return call<{ ok?: boolean; trends?: Array<Record<string, unknown>> }>(
    `/api/ops/tid/trends${tidQuery(opts)}`,
    { method: 'GET' },
    { baseUrl: opts.base, timeoutMs: opts.timeoutMs },
  );
}

export function fetchTidDiscoveries(opts: TidListQuery = {}) {
  return call<{ ok?: boolean; discoveries?: Array<Record<string, unknown>> }>(
    `/api/ops/tid/discoveries${tidQuery(opts)}`,
    { method: 'GET' },
    { baseUrl: opts.base, timeoutMs: opts.timeoutMs },
  );
}

// -- Write: science insights + learning discovery -----------------------------

export interface PersistInsightMeta {
  source?: string;
  sessionId?: string;
  domain?: string;
  evidenceTier?: string;
  generatedAt?: string;
}

/** POST a Recourse cross-domain finding so Draymond's TID science collector harvests it. */
export function persistScienceInsight(
  report: Record<string, unknown>,
  meta: PersistInsightMeta = {},
  opts: { base?: string; timeoutMs?: number } = {},
) {
  const body: Record<string, unknown> = { report };
  if (meta.source) body.source = meta.source;
  if (meta.sessionId) body.session_id = meta.sessionId;
  if (meta.domain) body.domain = meta.domain;
  if (meta.evidenceTier) body.evidence_tier = meta.evidenceTier;
  if (meta.generatedAt) body.generated_at = meta.generatedAt;
  return call<{ ok?: boolean; id?: string; duplicate?: boolean; error?: string }>(
    '/api/v1/science/insights/persist',
    { method: 'POST', body },
    { baseUrl: opts.base, timeoutMs: opts.timeoutMs },
  );
}

/** POST a research-grade discovery so Draymond's TID learning collector harvests it. */
export function postLearningDiscovery(discovery: Record<string, unknown>, opts: { base?: string; timeoutMs?: number } = {}) {
  return call<{ ok?: boolean; error?: string }>(
    '/api/ops/learning/discovery',
    { method: 'POST', body: { discovery } },
    { baseUrl: opts.base, timeoutMs: opts.timeoutMs },
  );
}
