/**
 * Trend ingestion adapters — Phase 1 of the blueprint.
 *
 * 1. Wikipedia Pageviews (official, free, keyless): real daily view series
 *    per article. Guarded fetch, ok:false when offline — never fabricated.
 * 2. Seeded deterministic corpus: clearly labeled `SIMULATED`, for tests and
 *    offline demonstration of the analysis stack. Never mixed with real data.
 *
 * The rest of the blueprint's ingestion grid (HN / Reddit / RSS / arXiv /
 * GitHub) already exists in `src/intake/*` — this module focuses on the
 * time-series input the trend/anomaly engine needs.
 */

export interface PageviewsResult {
  ok: boolean;
  article: string;
  points: Array<{ t: number; value: number }>;
  error?: string;
  latencyMs: number;
}

export const TREND_TERMS = {
  oncology: ['PD-1_inhibitor', 'CAR_T', 'ctDNA', 'immunotherapy', 'Oncology', 'cancer_biomarker'],
  aging: ['senescence', 'rapamycin', 'metformin', 'longevity', 'telomere'],
  ai_health: ['biomarker', 'precision_medicine', 'AlphaFold', 'drug_discovery'],
} as const;

export type TrendDomain = keyof typeof TREND_TERMS;

/** Fetch daily pageviews for an article over [fromMs, toMs] (inclusive, ~90d max). */
export async function fetchWikipediaPageviews(
  article: string,
  fromMs: number,
  toMs: number,
  opts?: { timeoutMs?: number },
): Promise<PageviewsResult> {
  const timeoutMs = opts?.timeoutMs ?? 8000;
  const start = new Date(fromMs).toISOString().slice(0, 10).replace(/-/g, '');
  const end = new Date(toMs).toISOString().slice(0, 10).replace(/-/g, '');
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(article)}/daily/${start}/${end}`;
  const began = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      return { ok: false, article, points: [], latencyMs: Date.now() - began, error: `HTTP ${res.status}` };
    }
    const j = (await res.json()) as { items?: Array<{ timestamp: string; views: number }> };
    const items = j.items ?? [];
    const points = items.map((it) => ({
      // Parse YYYYMMDD00 into a day ordinal (safe numeric t).
      t: Number(it.timestamp.slice(0, 8)),
      value: Number(it.views) || 0,
    }));
    return { ok: true, article, points, latencyMs: Date.now() - began };
  } catch (err) {
    return { ok: false, article, points: [], latencyMs: Date.now() - began, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Fetch a whole domain's term set in parallel; returns per-term results. */
export async function fetchDomainPageviews(
  domain: TrendDomain,
  fromMs: number,
  toMs: number,
): Promise<PageviewsResult[]> {
  const terms = TREND_TERMS[domain];
  return Promise.all(terms.map((t) => fetchWikipediaPageviews(t, fromMs, toMs)));
}

/**
 * Deterministic SIMULATED corpus — same seed always yields the same series.
 * Used ONLY for tests / offline demonstration; every series is tagged with
 * domain prefix `SIM_` and callers must keep it out of real ledgers unless
 * explicitly labeled.
 */
export function generateSeededCorpus(
  terms: string[],
  seed = 1,
  days = 30,
  base = 100,
): TrendSeries[] {
  function rng(seedN: number): () => number {
    let a = seedN >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const startT = 20260901;
  const out: TrendSeries[] = [];
  terms.forEach((term, idx) => {
    const r = rng(seed + idx * 7919);
    const points: SeriesPoint[] = [];
    for (let d = 0; d < days; d++) {
      const drift = 1 + Math.sin(d / 5) * 0.2 + (r() - 0.5) * 0.4;
      const burst = d > days - 8 && idx === seed % terms.length ? 2.5 : 1;
      points.push({ t: startT + d, value: Math.round(base * drift * burst) });
    }
    out.push({ id: `SIM_${term}_${seed}`, name: `SIM:${term}`, domain: 'simulated', points });
  });
  return out;
}

import type { TrendSeries, SeriesPoint } from './trendEngine.js';

export type { TrendSeries, SeriesPoint };