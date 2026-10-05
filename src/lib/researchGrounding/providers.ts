/**
 * providers.ts — HTTP clients for the two research services, and the trust
 * registry that decides what may be quoted.
 *
 * ## Client contract
 *
 * Copied from `keywireBridge.ts:354-413`, which states the house rule: *"No
 * function ever throws."* Every call is timeout-bounded and returns
 * `{ ok, data, error, latencyMs }`. A research service being down is an ordinary
 * operating condition, not an exception — and a forge cycle must not die because
 * arXiv is slow.
 *
 * ## The trust registry
 *
 * This is the part that matters. Each provider is classified once, by what its
 * implementation actually fetches, and the classification is asserted against
 * the live service in `tests/researchGrounding.test.ts`. A provider whose rule
 * changes is a one-line edit here plus a test update — which is the point: the
 * judgement is recorded in code, reviewable in a diff, rather than buried in a
 * prompt.
 */

import type { EvidenceTrust, GroundingSource, ProviderStatus } from './types';

/** A JSON value, as produced by `JSON.parse`. */
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

interface ServiceCall<T> {
  ok: boolean;
  data: T | null;
  error: string;
  latencyMs: number;
  /** True when the failure was reaching the service at all. */
  down: boolean;
}

/** One provider's classification, and the sentence that justifies it. */
export interface ProviderRule {
  readonly service: 'synthbook' | 'omniresearch';
  readonly provider: string;
  readonly trust: EvidenceTrust;
  /** Why this level, in one sentence. Quoted into the trustReason field. */
  readonly why: string;
}

/**
 * Trust levels, established by probing each live endpoint rather than by
 * reading its docs — Synthbook's `/api/external` ships no schema and the README
 * documents a different service entirely.
 *
 * `pubmed` is the cautionary one. It looks like a real literature lookup: the id
 * is a genuine PMC identifier and the URL resolves. But the title is
 * `"Biomedical Research (PMC<id>): <your query>"` and the span is a fixed
 * template with the query spliced in. Only the identifier is real.
 */
export const PROVIDER_RULES: readonly ProviderRule[] = [
  { service: 'synthbook', provider: 'arxiv', trust: 'retrieved', why: 'fetches the real arXiv abstract for each hit' },
  { service: 'synthbook', provider: 'wikipedia', trust: 'retrieved', why: 'fetches the real article extract (may be truncated, may carry encoding damage)' },
  { service: 'synthbook', provider: 'crossref', trust: 'metadata', why: 'real DOI, title and authors; the span is composed from the record rather than fetched' },
  { service: 'synthbook', provider: 'open_library', trust: 'metadata', why: 'real ISBN/title/authors; the span is a description, not the book text' },
  { service: 'synthbook', provider: 'github', trust: 'metadata', why: 'real repository and path; the span is a description of the repo' },
  { service: 'synthbook', provider: 'science_news', trust: 'metadata', why: 'real article URLs; the span is derived from the headline' },
  { service: 'synthbook', provider: 'hacker_news', trust: 'metadata', why: 'real HN item ids; the span is the item text, not a primary source' },
  { service: 'synthbook', provider: 'pubmed', trust: 'unverified', why: 'only the PMC id is real; title and span are templated from the query string' },
  { service: 'omniresearch', provider: 'baseline-sources', trust: 'retrieved', why: 'a curated registry of vetted sources with authority scores, not generated prose' },
  { service: 'omniresearch', provider: 'multi-harvest', trust: 'retrieved', why: 'the fan-out lane itself; trust is decided per sub-provider, not by this row' },

  // Sub-providers of OmniResearch's multi-harvest lane. These are keyed
  // separately from the synthbook rows of the same name because the two services
  // reach them differently: omniresearch proxies the real ArXiv / Wikipedia
  // APIs and returns their payloads, whereas synthbook/pubmed synthesises.
  { service: 'omniresearch', provider: 'arxiv', trust: 'retrieved', why: 'proxies the real ArXiv API and returns its own record' },
  { service: 'omniresearch', provider: 'wikipedia', trust: 'retrieved', why: 'proxies the real Wikipedia API and returns its own extract' },
  { service: 'omniresearch', provider: 'openalex', trust: 'retrieved', why: 'proxies the real OpenAlex API and returns its own record' },
  { service: 'omniresearch', provider: 'pubmed', trust: 'metadata', why: 'real identifiers via the PubMed API; the summary field is the API abstract, so treat as metadata not a full retrieved text' },
];

const RULE_BY_KEY = new Map(PROVIDER_RULES.map((r) => [`${r.service}/${r.provider}`, r]));

export function providerRule(service: string, provider: string): ProviderRule | undefined {
  return RULE_BY_KEY.get(`${service}/${provider}`);
}

/**
 * Classify a response item.
 *
 * The registry decides. That is deliberate: an unknown provider defaults to
 * `unverified` rather than being trusted, so adding a provider upstream cannot
 * silently promote it into quotable evidence without a deliberate edit here.
 */
export function classify(service: string, provider: string): { trust: EvidenceTrust; trustReason: string } {
  const rule = providerRule(service, provider);
  if (rule) return { trust: rule.trust, trustReason: rule.why };
  return {
    trust: 'unverified',
    trustReason: `${service}/${provider} is not in the trust registry, so its output is not quotable`,
  };
}

// --- configuration ---------------------------------------------------------

function envUrl(name: string, fallback: string): string {
  const raw = process.env[name]?.trim();
  return (raw ? raw : fallback).replace(/\/+$/, '');
}

function envTimeout(name: string, fallback: number): number {
  const raw = Number(process.env[name]?.trim());
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

/** Synthbook. Port 3020, not 3000: Grafana owns 3000 and answers /api/health. */
export function synthbookUrl(): string {
  return envUrl('SYNTHBOOK_URL', 'http://127.0.0.1:3020');
}

/** OmniResearch. */
export function omniresearchUrl(): string {
  return envUrl('OMNIRESEARCH_URL', 'http://127.0.0.1:3012');
}

function timeoutFor(service: 'synthbook' | 'omniresearch'): number {
  return service === 'synthbook'
    ? envTimeout('SYNTHBOOK_TIMEOUT_MS', 20_000)
    : envTimeout('OMNIRESEARCH_TIMEOUT_MS', 20_000);
}

/** Set `GROUNDING_SERVICES=0` to disable grounding entirely (advisory, so this is safe). */
export function groundingEnabled(): boolean {
  return process.env.GROUNDING_SERVICES?.trim() !== '0';
}

/**
 * One JSON call to a research service.
 *
 * Mirrors `keywireBridge.request`: AbortController + a cleared timer in `finally`,
 * a non-2xx turned into an honest message rather than a thrown Error, and a
 * connection failure distinguished from a timeout because they need different
 * operator responses.
 */
async function call<T>(
  service: 'synthbook' | 'omniresearch',
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<ServiceCall<T>> {
  const base = service === 'synthbook' ? synthbookUrl() : omniresearchUrl();
  const timeoutMs = timeoutFor(service);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      signal: controller.signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const latencyMs = Date.now() - started;
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      return {
        ok: false,
        data: null,
        down: false,
        latencyMs,
        error: `${service} ${path} -> HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`,
      };
    }
    try {
      return { ok: true, data: JSON.parse(text) as T, error: '', latencyMs, down: false };
    } catch {
      return { ok: false, data: null, down: false, latencyMs, error: `${service} ${path} returned non-JSON` };
    }
  } catch (err) {
    const latencyMs = Date.now() - started;
    const timedOut = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      data: null,
      down: true,
      latencyMs,
      error: timedOut
        ? `${service} timed out after ${timeoutMs}ms`
        : `${service} is unreachable at ${base}: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A minimal health probe. Cheap enough to run before deciding to gather.
 *
 * "Up" means the service answered at all — a non-JSON 200 is still up. The
 * previous version required a JSON body, so a healthy service serving
 * `text/plain` at `/api/health` read as offline, and because it was up-but-
 * unparsed the gatherer emitted a misleading `returned non-JSON` per-provider
 * error instead of the single honest "unreachable".
 */
export async function serviceHealth(service: 'synthbook' | 'omniresearch'): Promise<ProviderStatus> {
  const res = await call<Json>(service, 'GET', '/api/health');
  return {
    service,
    provider: 'health',
    ok: res.ok,
    count: 0,
    latencyMs: res.latencyMs,
    // Only a genuine failure carries an error string; a reachable service with a
    // non-JSON body is up, so it must not read as down.
    error: res.ok ? '' : res.error,
    // `down` already means "could not be reached", which includes a timeout. A
    // timeout is not an outage, so it is reported as an error without claiming
    // the service is gone.
    ...(res.down ? { serviceDown: true } : {}),
  };
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Query one Synthbook provider.
 *
 * `/api/external` needs no credentials, which is what makes it the only research
 * lane that survives this machine's LiteLLM outage — the model-backed routes
 * (`/api/synthesize`, `/api/booksynth`) all return 500 without a gateway.
 */
export async function synthbookExternal(provider: string, query: string): Promise<{ status: ProviderStatus; items: GroundingSource[] }> {
  const res = await call<Json>('synthbook', 'POST', '/api/external', { provider, query });
  if (!res.ok) {
    return {
      status: {
        service: 'synthbook',
        provider,
        ok: false,
        count: 0,
        error: res.error,
        latencyMs: res.latencyMs,
        ...(res.down ? { serviceDown: true } : {}),
      },
      items: [],
    };
  }
  const results =
    typeof res.data === 'object' && res.data !== null && Array.isArray((res.data as Record<string, unknown>).results)
      ? ((res.data as Record<string, unknown>).results as unknown[])
      : [];
  const { trust, trustReason } = classify('synthbook', provider);
  const items: GroundingSource[] = [];
  for (const raw of results) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const r = raw as Record<string, unknown>;
    const title = str(r.title);
    const url = str(r.source_url);
    // An item with neither a title nor a link cannot be followed or checked,
    // so it is not worth carrying.
    if (!title && !url) continue;
    items.push({
      id: str(r.id) || `${provider}:${url || title}`,
      service: 'synthbook',
      provider,
      trust,
      trustReason,
      title,
      author: str(r.author),
      year: str(r.year),
      url,
      span: str(r.text_span),
    });
  }
  return {
    status: { service: 'synthbook', provider, ok: true, count: items.length, error: '', latencyMs: res.latencyMs },
    items,
  };
}

/**
 * OmniResearch's curated baseline-sources registry.
 *
 * A list of vetted sources with authority scores, so it is genuinely
 * `retrieved`-class evidence — but it is a *registry of where to look*, not
 * findings. The gatherer treats it that way.
 */
export async function omniresearchBaseline(query: string): Promise<{ status: ProviderStatus; items: GroundingSource[] }> {
  const res = await call<Json>('omniresearch', 'GET', `/api/agent/baseline-sources?query=${encodeURIComponent(query)}`);
  if (!res.ok) {
    return {
      status: {
        service: 'omniresearch',
        provider: 'baseline-sources',
        ok: false,
        count: 0,
        error: res.error,
        latencyMs: res.latencyMs,
        ...(res.down ? { serviceDown: true } : {}),
      },
      items: [],
    };
  }
  const sites =
    typeof res.data === 'object' && res.data !== null && Array.isArray((res.data as Record<string, unknown>).sites)
      ? ((res.data as Record<string, unknown>).sites as unknown[])
      : [];
  const { trust, trustReason } = classify('omniresearch', 'baseline-sources');
  const items: GroundingSource[] = [];
  for (const raw of sites) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const s = raw as Record<string, unknown>;
    const url = str(s.url);
    const name = str(s.name) || str(s.title);
    if (!url && !name) continue;
    items.push({
      id: url || name,
      service: 'omniresearch',
      provider: 'baseline-sources',
      trust,
      trustReason,
      title: name,
      author: str(s.category),
      year: '',
      url,
      span: str(s.description),
    });
  }
  return {
    status: { service: 'omniresearch', provider: 'baseline-sources', ok: true, count: items.length, error: '', latencyMs: res.latencyMs },
    items,
  };
}

/**
 * OmniResearch's keyless fan-out over ArXiv / OpenAlex / PubMed / Wikipedia.
 *
 * It proxies the real APIs and returns their payloads, so it is a genuinely
 * useful second lane when that service is up. When it is down — which is the
 * current state of this machine — the gatherer records that rather than
 * pretending the search was narrower than it was.
 */
export async function omniresearchHarvest(query: string): Promise<{ status: ProviderStatus; items: GroundingSource[] }> {
  const res = await call<Json>('omniresearch', 'POST', '/api/integrations/multi-harvest', { query, maxPerSource: 4 });
  if (!res.ok) {
    return {
      status: {
        service: 'omniresearch',
        provider: 'multi-harvest',
        ok: false,
        count: 0,
        error: res.error,
        latencyMs: res.latencyMs,
        ...(res.down ? { serviceDown: true } : {}),
      },
      items: [],
    };
  }
  const sources =
    typeof res.data === 'object' && res.data !== null && Array.isArray((res.data as Record<string, unknown>).sources)
      ? ((res.data as Record<string, unknown>).sources as unknown[])
      : [];
  const items: GroundingSource[] = [];
  for (const entry of sources) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const group = entry as Record<string, unknown>;
    const providerName = str(group.provider) || str(group.source) || 'unknown';
    // Classify the SUB-provider, not the lane. `multi-harvest` is a fan-out over
    // ArXiv / OpenAlex / PubMed / Wikipedia, and PubMed's synthesised spans are
    // exactly what the trust registry exists to keep out of a prompt. Stamping
    // the lane's level onto every child would let a response field — not a
    // registry edit — promote unverified evidence to quotable.
    const { trust, trustReason } = classify('omniresearch', providerName);
    const results = Array.isArray(group.results) ? (group.results as unknown[]) : [];
    for (const raw of results) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const r = raw as Record<string, unknown>;
      const url = str(r.url) || str(r.link) || str(r.source_url);
      const title = str(r.title);
      if (!title && !url) continue;
      items.push({
        id: str(r.id) || url || title,
        service: 'omniresearch',
        provider: providerName,
        trust,
        trustReason,
        title,
        author: str(r.author) || str(r.authors),
        year: str(r.year) || str(r.published),
        url,
        span: str(r.summary) || str(r.abstract) || str(r.text),
      });
    }
  }
  return {
    status: { service: 'omniresearch', provider: 'multi-harvest', ok: true, count: items.length, error: '', latencyMs: res.latencyMs },
    items,
  };
}

/** Every provider worth asking for a code-generation grounding query. */
export function defaultSynthbookProviders(): string[] {
  return (process.env.GROUNDING_SYNTHBOOK_PROVIDERS?.trim() || 'arxiv,wikipedia,crossref,pubmed')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}