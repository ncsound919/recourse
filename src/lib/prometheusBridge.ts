/**
 * Prometheus engine bridge — stateless HTTP client for the Prometheus
 * engine's export API.
 *
 * The Prometheus engine is an EXTERNAL process (default
 * http://127.0.0.1:3001). This module never owns its data and never invents
 * hypotheses: every fetch is guarded by a timeout and returns `ok:false`
 * with the underlying error when the engine is down or rejects, mirroring
 * the honesty contract in `src/lib/kgSidecarClient.ts`.
 *
 * Export endpoint convention: GET {base}/export/{entity}?format={format}
 * where entity ∈ hypotheses | breakthroughs | signals and
 * format ∈ json | csv. If the engine is unreachable the caller gets
 * `{ ok: false, ... }` — never fabricated rows.
 *
 * Env: PROMETHEUS_URL (default http://127.0.0.1:3001).
 */

export const PROMETHEUS_DEFAULT_URL =
  process.env.PROMETHEUS_URL || 'http://127.0.0.1:3001';

export type PrometheusEntity = 'hypotheses' | 'breakthroughs' | 'signals';
export type PrometheusFormat = 'json' | 'csv';

export interface PrometheusHypothesis {
  id: string;
  title: string;
  summary: string;
  domains: string[];
  novelty: number;
  impact: number;
}

export interface PrometheusExportResult {
  ok: boolean;
  entity: PrometheusEntity;
  format: PrometheusFormat;
  /** Raw payload when the engine answered (json parsed, csv as text). */
  data?: unknown;
  /** Normalized rows — only populated for hypotheses + json. */
  rows?: PrometheusHypothesis[];
  error?: string;
  latencyMs: number;
}

/**
 * RawSource-compatible row for the deterministic researcher
 * (`deteministic researcher/deterministic-web-researcher.ts` RawSource).
 * Structural clone on purpose: that file lives outside `src/` (and its
 * directory name contains a space), so we do NOT import it here — any row
 * produced by `toResearchSources` is assignable to RawSource by shape.
 */
export interface PrometheusResearchSource {
  id: string;
  title: string;
  url: string;
  domain: string;
  contentPreview: string;
  metadata: {
    publishedAt?: number;
    authors?: string[];
    doi?: string;
    accessibilityStatus: 'open' | 'paywalled' | 'restricted';
  };
  fetchedAt: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function toNumber(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && x.length > 0);
  if (typeof v === 'string' && v.length > 0) return [v];
  return [];
}

/**
 * Normalize an unknown Prometheus payload into hypotheses.
 * Defensive guards: non-objects → []; unknown envelope shapes accepted
 * (`[]`, `{hypotheses: []}`, `{data: []}`, `{rows: []}`); rows without a
 * usable id+title are SKIPPED (never fabricated); numeric fields coerce
 * with fallback 0 and are clamped to [0, 1].
 */
export function parsePrometheusHypotheses(json: unknown): PrometheusHypothesis[] {
  let list: unknown = json;
  if (isRecord(json)) {
    if (Array.isArray(json.hypotheses)) list = json.hypotheses;
    else if (Array.isArray(json.data)) list = json.data;
    else if (Array.isArray(json.rows)) list = json.rows;
    else return [];
  }
  if (!Array.isArray(list)) return [];
  const out: PrometheusHypothesis[] = [];
  for (const row of list) {
    if (!isRecord(row)) continue;
    const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : null;
    const title = typeof row.title === 'string' && row.title.trim() ? row.title.trim() : null;
    if (!id || !title) continue; // skip, never invent
    const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
    out.push({
      id,
      title,
      summary: typeof row.summary === 'string' ? row.summary : typeof row.description === 'string' ? row.description : '',
      domains: toStringArray(row.domains ?? row.domain),
      novelty: clamp01(toNumber(row.novelty, 0)),
      impact: clamp01(toNumber(row.impact, 0)),
    });
  }
  return out;
}

/**
 * Map normalized hypotheses into RawSource-compatible rows for the
 * deterministic researcher. Pure/deterministic. Provenance is preserved:
 * rows are marked `restricted` (unverified engine output) and carry a
 * `prometheus:` url scheme so downstream consumers can see they did not
 * come from a fetched web page.
 */
export function toResearchSources(hyps: PrometheusHypothesis[]): PrometheusResearchSource[] {
  const now = Date.now();
  return hyps.map((h) => ({
    id: `prometheus:${h.id}`,
    title: h.title,
    url: `prometheus:hypothesis/${encodeURIComponent(h.id)}`,
    domain: 'prometheus-engine',
    contentPreview: h.summary || h.title,
    metadata: { accessibilityStatus: 'restricted' as const },
    fetchedAt: now,
  }));
}

/**
 * Fetch one export from the Prometheus engine. Guarded: timeout via
 * AbortController, non-2xx → ok:false, network error → ok:false.
 * NEVER throws and NEVER returns fabricated rows.
 */
export async function fetchExport(
  entity: PrometheusEntity,
  format: PrometheusFormat = 'json',
  base: string = PROMETHEUS_DEFAULT_URL,
  timeoutMs = 5000,
): Promise<PrometheusExportResult> {
  if (entity !== 'hypotheses' && entity !== 'breakthroughs' && entity !== 'signals') {
    return { ok: false, entity: entity as PrometheusEntity, format, latencyMs: 0, error: `unknown entity "${String(entity)}"` };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const url = `${base.replace(/\/$/, '')}/export/${entity}?format=${format}`;
    const res = await fetch(url, { signal: controller.signal });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { ok: false, entity, format, latencyMs, error: `prometheus HTTP ${res.status}` };
    }
    if (format === 'csv') {
      const text = await res.text();
      return { ok: true, entity, format, data: text, latencyMs };
    }
    const data: unknown = await res.json();
    const rows = entity === 'hypotheses' ? parsePrometheusHypotheses(data) : undefined;
    return { ok: true, entity, format, data, rows, latencyMs };
  } catch (err: unknown) {
    const latencyMs = Date.now() - started;
    const msg = err instanceof Error ? err.message : 'prometheus unreachable';
    const timedOut = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      entity,
      format,
      latencyMs,
      error: timedOut ? `prometheus timed out after ${timeoutMs}ms` : msg,
    };
  } finally {
    clearTimeout(timer);
  }
}
