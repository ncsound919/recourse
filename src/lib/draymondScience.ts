/**
 * draymondScience.ts — pure converters between Draymond's science/TID payloads
 * and Recourse's trend + synergy contracts.
 *
 * Draymond exposes science grades, a learning store with drift metrics, and
 * (via the read routes added alongside this module) TID signals/insights. This
 * module turns those real payloads into `TrendSeries` so Recourse's
 * *deterministic* engine can scan the fleet's own operational history — and
 * turns Recourse's unified cross-domain links back into Draymond
 * `science_insights` reports so Draymond's TID engine harvests them as signals.
 *
 * Honesty contract: every point comes from a real numeric field with a real
 * parsable timestamp; nothing is interpolated, fabricated, or defaulted. A
 * payload with no usable series yields `[]`, never a synthetic one. Only
 * candidates/links whose domains map to a real Draymond domain are exported
 * when `requireDraymondDomain` is set; otherwise the original sector id is used
 * and kept verbatim in the report's extra fields.
 */
import type { TrendSeries, SeriesPoint } from './trendEngine.js';
import type { TransferCandidate } from './synergy/types.js';
import type { CrossDomainLink } from './crossDomainGraph.js';
import { canonicalDomain, canonicalForDraymond, draymondPrimaryFor } from './crossDomainVocabulary.js';

// ---------------------------------------------------------------------------
// Draymond payload shapes (loose — only the fields we actually read)
// ---------------------------------------------------------------------------

export interface DraymondTidSignal {
  id: string;
  source: string;
  category: string;
  component?: string | null;
  metric: string;
  value: number;
  context?: Record<string, unknown>;
  created_at: string;
}

export interface DraymondTidInsight {
  id: string;
  type: string;
  title: string;
  detail: string;
  confidence: number;
  evidence?: { signalIds?: string[]; sampleSize?: number; [k: string]: unknown };
  suggested_action?: unknown;
  status: string;
  created_at: string;
}

export interface DraymondResearchGrade {
  goalId?: string;
  domain?: string;
  area?: string;
  title?: string;
  score?: number;
  breakthroughClass?: string;
  dimensions?: { novelty?: number; testability?: number; evidence?: number; impact?: number; maturity?: number; crossDomain?: number };
  evidenceTier?: string;
  gradedAt?: string;
  [k: string]: unknown;
}

export interface DraymondLearningStore {
  driftMetrics?: Array<Record<string, unknown>>;
  outcomes?: Array<Record<string, unknown>>;
  discoveries?: Array<Record<string, unknown>>;
  [k: string]: unknown;
}

/** A Draymond `science_insights` report (shape `POST /v1/science/insights/persist` requires). */
export interface DraymondScienceInsightReport {
  from_domain: string;
  to_domain: string;
  translated_metrics: Array<{ name: string; value: number | string; note?: string }>;
  confidence: number;
  evidence_tier?: string;
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// Payload -> TrendSeries
// ---------------------------------------------------------------------------

/** Parse a timestamp to epoch ms, or null when absent/invalid. Pure. */
export function timestampToMs(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

function seriesFromPoints(id: string, name: string, domain: string, points: SeriesPoint[]): TrendSeries | null {
  const clean = points
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.value))
    .sort((a, b) => a.t - b.t);
  if (clean.length === 0) return null;
  return { id, name, domain, points: clean };
}

/**
 * Group TID signals into one series per `(component, metric)`. Domain is the
 * canonicalized component (so `oncology`/`aging`/`sports` land on their sector).
 */
export function tidSignalsToTrendSeries(signals: DraymondTidSignal[]): TrendSeries[] {
  const groups = new Map<string, { component: string; metric: string; points: SeriesPoint[] }>();
  for (const s of signals) {
    if (!s || typeof s.metric !== 'string' || !Number.isFinite(s.value)) continue;
    const t = timestampToMs(s.created_at);
    if (t === null) continue;
    const component = String(s.component ?? 'fleet');
    const key = `${component}\u0000${s.metric}`;
    const g = groups.get(key) ?? { component, metric: s.metric, points: [] };
    g.points.push({ t, value: Number(s.value) });
    groups.set(key, g);
  }
  const out: TrendSeries[] = [];
  for (const g of groups.values()) {
    const id = `draymond:tid:${g.component}:${g.metric}`;
    const series = seriesFromPoints(id, `${g.component} ${g.metric}`, canonicalDomain(g.component), g.points);
    if (series) out.push(series);
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const GRADE_DIMENSIONS = ['novelty', 'testability', 'evidence', 'impact', 'maturity', 'crossDomain'] as const;

/**
 * One series per `(domain, metric)` over a list of research grades. Metrics are
 * the breakthrough `score` plus each real dimension present. Grades without a
 * parsable `gradedAt` are skipped (no fabricated time axis).
 */
export function researchGradesToTrendSeries(grades: DraymondResearchGrade[]): TrendSeries[] {
  const groups = new Map<string, { domain: string; metric: string; points: SeriesPoint[] }>();
  const add = (domain: string, metric: string, value: unknown, t: number) => {
    if (!Number.isFinite(value)) return;
    const key = `${domain}\u0000${metric}`;
    const g = groups.get(key) ?? { domain, metric, points: [] };
    g.points.push({ t, value: Number(value) });
    groups.set(key, g);
  };
  for (const gr of grades) {
    const t = timestampToMs(gr.gradedAt);
    if (t === null) continue;
    const domain = canonicalDomain(String(gr.domain ?? 'fleet'));
    add(domain, 'breakthrough_score', gr.score, t);
    for (const dim of GRADE_DIMENSIONS) add(domain, `dim_${dim}`, gr.dimensions?.[dim], t);
  }
  const out: TrendSeries[] = [];
  for (const g of groups.values()) {
    const id = `draymond:grade:${g.domain}:${g.metric}`;
    const series = seriesFromPoints(id, `${g.domain} ${g.metric}`, g.domain, g.points);
    if (series) out.push(series);
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const TIMESTAMP_KEYS = new Set(['at', 'created_at', 'createdAt', 'timestamp', 'updatedAt', 'updated_at', 'gradedAt', 'graded_at']);

/**
 * Flatten the learning store's drift metrics / outcomes into series. Each
 * record contributes its numeric fields (except timestamp/id-like keys) as
 * points on a `(domain, metric)` series. Defensive by design: a record with no
 * numeric field or no timestamp contributes nothing.
 */
export function learningStoreToTrendSeries(store: DraymondLearningStore): TrendSeries[] {
  const groups = new Map<string, { domain: string; metric: string; points: SeriesPoint[] }>();
  const records = [
    ...(Array.isArray(store.driftMetrics) ? store.driftMetrics : []),
    ...(Array.isArray(store.outcomes) ? store.outcomes : []),
  ];
  for (const rec of records) {
    if (!rec || typeof rec !== 'object') continue;
    const r = rec as Record<string, unknown>;
    let t: number | null = null;
    for (const k of TIMESTAMP_KEYS) {
      t = timestampToMs(r[k]);
      if (t !== null) break;
    }
    if (t === null) continue;
    const domain = canonicalDomain(String(r.domain ?? r.component ?? 'fleet'));
    for (const [k, v] of Object.entries(r)) {
      if (TIMESTAMP_KEYS.has(k) || typeof v !== 'number' || !Number.isFinite(v)) continue;
      const metric = `drift_${k}`;
      const key = `${domain}\u0000${metric}`;
      const g = groups.get(key) ?? { domain, metric, points: [] };
      g.points.push({ t, value: v });
      groups.set(key, g);
    }
  }
  const out: TrendSeries[] = [];
  for (const g of groups.values()) {
    const id = `draymond:learning:${g.domain}:${g.metric}`;
    const series = seriesFromPoints(id, `${g.domain} ${g.metric}`, g.domain, g.points);
    if (series) out.push(series);
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** All Draymond payloads -> de-duplicated series list (by id). */
export function draymondToTrendSeries(input: {
  signals?: DraymondTidSignal[];
  grades?: DraymondResearchGrade[];
  learning?: DraymondLearningStore | null;
}): TrendSeries[] {
  const byId = new Map<string, TrendSeries>();
  for (const s of tidSignalsToTrendSeries(input.signals ?? [])) byId.set(s.id, s);
  for (const s of researchGradesToTrendSeries(input.grades ?? [])) byId.set(s.id, s);
  if (input.learning) for (const s of learningStoreToTrendSeries(input.learning)) byId.set(s.id, s);
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Recourse findings -> Draymond science_insights
// ---------------------------------------------------------------------------

function draymondDomainFor(canonical: string, require: boolean): string | null {
  const mapped = draymondPrimaryFor(canonical);
  if (mapped) return mapped;
  if (require) return null;
  return canonical;
}

export interface ExportOptions {
  /** When true, skip anything with no real Draymond domain (default true). */
  requireDraymondDomain?: boolean;
  evidenceTier?: string;
}

/**
 * Convert a synergy transfer candidate into a Draymond InsightReport. Returns
 * null when a domain mapping is required and unavailable (honest: not exported
 * rather than exported under a wrong domain).
 */
export function synergyCandidateToScienceInsight(
  candidate: TransferCandidate,
  opts: ExportOptions = {},
): DraymondScienceInsightReport | null {
  const require = opts.requireDraymondDomain !== false;
  const from = draymondDomainFor(canonicalDomain(candidate.fromDomain), require);
  const to = draymondDomainFor(canonicalDomain(candidate.toDomain), require);
  if (!from || !to) return null;
  return {
    from_domain: from,
    to_domain: to,
    confidence: round3(Math.max(0, Math.min(1, candidate.score))),
    evidence_tier: opts.evidenceTier ?? 'E3',
    source: 'recourse-synergy',
    translated_metrics: candidate.bridges.slice(0, 6).map((b) => ({
      name: b.term,
      value: round3(b.score),
      note: `wAB=${round3(b.weightAB)} wBC=${round3(b.weightBC)} docs=${b.docs}`,
    })),
    recourse_candidate_id: candidate.id,
    recourse_from_sector: candidate.fromDomain,
    recourse_to_sector: candidate.toDomain,
    method_id: candidate.methodId,
    problem_id: candidate.problemId,
    engine_version: candidate.engineVersion,
    ...(typeof candidate.farTransfer === 'number' ? { far_transfer: round3(candidate.farTransfer) } : {}),
  };
}

/**
 * Convert a unified cross-domain link into a Draymond InsightReport, carrying
 * both evidence channels so TID can act on the temporal and structural signal.
 */
export function crossDomainLinkToScienceInsight(
  link: CrossDomainLink,
  opts: ExportOptions = {},
): DraymondScienceInsightReport | null {
  const require = opts.requireDraymondDomain !== false;
  const from = draymondDomainFor(link.from, require);
  const to = draymondDomainFor(link.to, require);
  if (!from || !to) return null;
  const translated_metrics: DraymondScienceInsightReport['translated_metrics'] = [
    { name: 'combined_evidence', value: link.combined, note: `channels=${link.evidence.join('+')}` },
  ];
  if (link.temporal) {
    translated_metrics.push({
      name: 'temporal_correlation',
      value: link.temporal.correlation,
      note: `lag=${link.temporal.bestLag} ${link.temporal.a}->${link.temporal.b}${typeof link.temporal.n === 'number' ? ` n=${link.temporal.n}` : ''}`,
    });
  }
  if (link.structural) {
    translated_metrics.push({
      name: 'structural_transfer_score',
      value: link.structural.score,
      note: `${link.structural.methodId} -> ${link.structural.problemId} (support ${link.structural.support})`,
    });
  }
  return {
    from_domain: from,
    to_domain: to,
    confidence: round3(Math.max(0, Math.min(1, link.combined))),
    evidence_tier: opts.evidenceTier ?? 'E3',
    source: 'recourse-cross-domain',
    translated_metrics,
    recourse_from_sector: link.from,
    recourse_to_sector: link.to,
    recourse_evidence: link.evidence,
    ...(link.structural ? { candidate_id: link.structural.candidateId } : {}),
  };
}

/**
 * Draymond cross-domain reports -> Recourse `knownPairs` (the `from->to` sector
 * pairs the synergy novelty filter recognizes). Used to import fleet-known
 * pairs so Recourse does not re-propose what Draymond already explored.
 */
export function draymondInsightsToKnownPairs(
  reports: Array<Pick<DraymondScienceInsightReport, 'from_domain' | 'to_domain'>>,
): string[] {
  const pairs = new Set<string>();
  for (const r of reports) {
    if (!r || typeof r.from_domain !== 'string' || typeof r.to_domain !== 'string') continue;
    const froms = canonicalForDraymond(r.from_domain);
    const tos = canonicalForDraymond(r.to_domain);
    for (const f of froms) for (const t of tos) {
      if (f !== t) pairs.add(`${f}->${t}`);
    }
    // Preserve the literal report pair too (a sector may already be canonical).
    if (r.from_domain !== r.to_domain) pairs.add(`${r.from_domain}->${r.to_domain}`);
  }
  return [...pairs].sort();
}
