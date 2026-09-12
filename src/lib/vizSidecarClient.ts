/**
 * Recourse Data Visualizer sidecar client (Python/matplotlib).
 *
 * The sidecar (`python/viz_service/main.py`) is STATELESS: it renders a curated
 * subset of the Data_Visualization-main teaching scripts (3D math / physics /
 * statistics surfaces, waveforms, vector fields) with the matplotlib Agg
 * backend and returns a base64 PNG artifact + derived metrics. Recourse never
 * sends state, so nothing drifts.
 *
 * Honesty contract: every PNG is real matplotlib output over real math. When
 * the sidecar is down, /api/recourse/viz/* reports ok:false with the real
 * error — never a fabricated image.
 *
 * Env: VIZ_SIDECAR_URL (default http://127.0.0.1:8505).
 */

export const VIZ_SIDECAR_DEFAULT_URL = process.env.VIZ_SIDECAR_URL || 'http://127.0.0.1:8505';

export interface VizSceneMeta {
  id: string;
  title: string;
  category: string;
  source: string;
  adapted: boolean;
  note: string;
  default_params: Record<string, unknown>;
}

export interface VizHealthResult {
  ok: boolean;
  service?: string;
  matplotlib?: string;
  numpy?: string;
  error?: string;
  latencyMs?: number;
}

export interface VizCatalogResult {
  ok: boolean;
  count?: number;
  scenes?: VizSceneMeta[];
  error?: string;
  latencyMs?: number;
}

export interface VizRenderResult {
  ok: boolean;
  id?: string;
  title?: string;
  category?: string;
  source?: string;
  adapted?: boolean;
  note?: string;
  width?: number;
  height?: number;
  image?: string; // base64 PNG
  metrics?: Record<string, unknown>;
  error?: string;
  latencyMs?: number;
}

export interface VizSidecarCall<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
  latencyMs: number;
}

async function getViz<T>(path: string, base: string, timeoutMs: number): Promise<VizSidecarCall<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}${path}`, { signal: controller.signal });
    const latencyMs = Date.now() - started;
    if (!res.ok) return { ok: false, status: res.status, data: null, latencyMs, error: `viz sidecar HTTP ${res.status}` };
    const data = (await res.json()) as T;
    return { ok: true, status: res.status, data, latencyMs };
  } catch (err: any) {
    const latencyMs = Date.now() - started;
    return {
      ok: false,
      status: 0,
      data: null,
      latencyMs,
      error: err?.name === 'AbortError' ? `viz sidecar timed out after ${timeoutMs}ms` : err?.message || 'viz sidecar unreachable',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function postViz<T>(path: string, body: unknown, base: string, timeoutMs: number): Promise<VizSidecarCall<T>> {
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
      const detail = await res.text().catch(() => '');
      return { ok: false, status: res.status, data: null, latencyMs, error: `viz sidecar HTTP ${res.status}${detail ? `: ${detail}` : ''}` };
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
      error: err?.name === 'AbortError' ? `viz sidecar timed out after ${timeoutMs}ms` : err?.message || 'viz sidecar unreachable',
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function vizHealth(base = VIZ_SIDECAR_DEFAULT_URL, timeoutMs = 2000): Promise<VizHealthResult> {
  const call = await getViz<VizHealthResult>('/health', base, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  return { ok: true, service: call.data.service, matplotlib: call.data.matplotlib, numpy: call.data.numpy, latencyMs: call.latencyMs };
}

export async function vizCatalog(
  opts: { timeoutMs?: number; base?: string } = {},
): Promise<VizCatalogResult> {
  const { timeoutMs = 5000, base = VIZ_SIDECAR_DEFAULT_URL } = opts;
  const call = await getViz<VizCatalogResult>('/viz/catalog', base, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  return { ...call.data, latencyMs: call.latencyMs };
}

export async function vizRender(
  id: string,
  opts: { width?: number; height?: number; params?: Record<string, unknown>; timeoutMs?: number; base?: string } = {},
): Promise<VizRenderResult> {
  const { width, height, params, timeoutMs = 30000, base = VIZ_SIDECAR_DEFAULT_URL } = opts;
  const body: Record<string, unknown> = { id };
  if (width) body.width = width;
  if (height) body.height = height;
  if (params && Object.keys(params).length > 0) body.params = params;
  const call = await postViz<VizRenderResult>('/viz/render', body, base, timeoutMs);
  if (!call.ok || !call.data) return { ok: false, error: call.error, latencyMs: call.latencyMs };
  return { ...call.data, latencyMs: call.latencyMs };
}