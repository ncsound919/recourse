/**
 * Overlay Global Lens bridge — Recourse → Global Lens `/api/publish`.
 *
 * The direct connection that turns Recourse research into published outlet
 * articles/papers. Global Lens runs on :3090 (fleet dev) and exposes
 * `POST /api/publish` for Overlay365 agents; the endpoint is idempotent
 * (sha256 over source+title+body → INSERT OR IGNORE) and REQUIRES the
 * `GL_PUBLISH_KEY` bearer token.
 *
 * Honesty contract (mirrors the rest of Recourse):
 *   - Fail-closed: when `GL_PUBLISH_KEY` is not configured the bridge refuses
 *     to publish (`ok:false`, never a fabricated "sent"). A deployment that
 *     cannot authenticate is never allowed to impersonate verified research.
 *   - When Global Lens is unreachable the bridge reports ok:false with the
 *     real error — it never claims a publish that did not happen.
 *   - Health checks are real GETs; a non-2xx is reported verbatim.
 */

export const GLOBAL_LENS_DEFAULT_URL = 'http://127.0.0.1:3090';

/** Base URL of the Global Lens outlet, trailing slashes stripped. */
export function globalLensBaseUrl(): string {
  return (process.env.GLOBAL_LENS_URL || GLOBAL_LENS_DEFAULT_URL).replace(/\/+$/, '');
}

/** The publish bearer token. Empty when unset (fail-closed publish). */
export function globalLensPublishKey(): string {
  return process.env.GL_PUBLISH_KEY || '';
}

/** True only when a publish key is configured (the endpoint can authenticate). */
export function globalLensConfigured(): boolean {
  return globalLensPublishKey().trim() !== '';
}

export interface GlobalLensHealth {
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

/** Probe Global Lens `/api/health` — real GET, never fabricated. */
export async function globalLensHealth(timeoutMs = 3000): Promise<GlobalLensHealth> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch(`${globalLensBaseUrl()}/api/health`, { signal: controller.signal });
    if (!res.ok) {
      return { ok: false, latencyMs: Date.now() - t0, error: `global lens /api/health HTTP ${res.status}` };
    }
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - t0, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Publish contract accepted by Global Lens `POST /api/publish`. Mirrors the
 * server's destructured body: title/body/category/source_name/url/image_url,
 * structured chain outputs (insights/digest/trends), and the optional paper
 * attachment + oncology findings/finding_of_day.
 */
export interface GlobalLensPublishInput {
  title: string;
  body: string;
  category?: string;
  source_name?: string;
  url?: string;
  image_url?: string;
  insights?: unknown;
  digest?: unknown;
  trends?: unknown;
  paper?: Record<string, unknown>;
  findings?: unknown[];
  finding_of_day?: unknown[];
}

export interface GlobalLensPublishResult {
  ok: boolean;
  httpStatus?: number;
  /** True when the article row was newly inserted (idempotent re-publish → false). */
  inserted?: boolean;
  url_hash?: string;
  error?: string;
}

/**
 * Publish one article/paper to Global Lens. Fail-closed on missing key, real
 * on the wire. Never resolves ok:true for a request that did not succeed.
 */
export async function publishToGlobalLens(
  input: GlobalLensPublishInput,
  timeoutMs = 30_000,
): Promise<GlobalLensPublishResult> {
  const key = globalLensPublishKey();
  if (!key) {
    return { ok: false, error: 'publish disabled: GL_PUBLISH_KEY not configured (fail-closed)' };
  }
  if (!input || typeof input.title !== 'string' || !input.title.trim()) {
    return { ok: false, error: 'title is required' };
  }
  if (typeof input.body !== 'string' || !input.body.trim()) {
    return { ok: false, error: 'body is required' };
  }

  let res: Response;
  try {
    res = await fetch(`${globalLensBaseUrl()}/api/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        title: input.title,
        body: input.body,
        category: input.category,
        source_name: input.source_name,
        url: input.url,
        image_url: input.image_url,
        insights: input.insights,
        digest: input.digest,
        trends: input.trends,
        paper: input.paper,
        findings: input.findings,
        finding_of_day: input.finding_of_day,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    return { ok: false, error: `global lens unreachable: ${err instanceof Error ? err.message : String(err)}` };
  }

  const httpStatus = res.status;
  try {
    const json: any = await res.json();
    if (!res.ok) {
      return { ok: false, httpStatus, error: json?.detail || `HTTP ${httpStatus}` };
    }
    return {
      ok: true,
      httpStatus,
      inserted: json?.inserted === true,
      url_hash: typeof json?.url_hash === 'string' ? json.url_hash : undefined,
    };
  } catch {
    return { ok: false, httpStatus, error: `HTTP ${httpStatus} (non-JSON response)` };
  }
}