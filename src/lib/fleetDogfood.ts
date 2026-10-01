/**
 * fleetDogfood.ts — the bidirectional Recourse <-> Draymond loop.
 *
 * One cycle:
 *   INGEST   pull Draymond's TID signals/insights + science grades + learning
 *            store over HTTP (read routes) and turn them into TrendSeries.
 *   ANALYZE  run Recourse's deterministic trend engine (bursts, anomalies,
 *            lagged cross-domain correlations) over the fleet's real history,
 *            and append the resulting hypotheses to the hash-chained ledger.
 *   UNIFY    merge the temporal evidence with the synergy engine's structural
 *            transfer candidates into one cross-domain graph on a shared
 *            vocabulary.
 *   EXPORT   publish the graph's links (and, when there is no temporal data,
 *            the top synergy candidates) back to Draymond as `science_insights`
 *            so its TID engine harvests them as first-class signals.
 *
 * Everything is fail-soft and honest: Draymond unreachable → the local graph is
 * still built from the synergy map, and every ingest/export report says exactly
 * what happened. No fabricated series, no invented write.
 */
import path from 'node:path';
import { readJsonFile, writeJsonFile } from './durableJson.js';
import { runTrendScan, type TrendSeries } from './trendEngine.js';
import { appendInsight } from './trendLedger.js';
import { readSynergyMap } from './synergy/store.js';
import { buildCrossDomainGraph, type CrossDomainGraphResult, type CrossDomainLink } from './crossDomainGraph.js';
import {
  draymondToTrendSeries,
  crossDomainLinkToScienceInsight,
  synergyCandidateToScienceInsight,
  draymondInsightsToKnownPairs,
  type DraymondScienceInsightReport,
  type DraymondTidSignal,
  type DraymondResearchGrade,
  type DraymondLearningStore,
} from './draymondScience.js';
import {
  draymondConfig,
  draymondHealth,
  fetchTidSignals,
  fetchTidInsights,
  fetchScienceGrades,
  fetchLearningStore,
  fetchScienceInsights,
  persistScienceInsight,
} from './draymondBridge.js';

export interface FleetDogfoodSnapshot {
  version: 1;
  at: number;
  draymond: { baseUrl: string; online: boolean; secretConfigured: boolean; error?: string; latencyMs: number };
  ingest: {
    signals: number;
    insights: number;
    grades: number;
    learningRecords: number;
    series: number;
    correlations: number;
    hypotheses: number;
    ledgerInsights: number;
    knownPairs: number;
  };
  graph: {
    links: number;
    temporal: number;
    structural: number;
    merged: number;
    domains: string[];
    manifestHash: string;
  };
  export: { attempted: number; persisted: number; duplicates: number; skipped: number; errors: string[] };
  /** Top links (capped) so the status/graph route can render them without rereading. */
  links: CrossDomainLink[];
  /** Draymond-known cross-domain pairs (capped) imported for the synergy novelty gate. */
  knownPairList: string[];
  steps: string[];
}

const MAX_LINKS_KEPT = 200;

export function fleetDogfoodPath(): string {
  return process.env.FLEET_DOGFOOD_FILE || path.join(process.cwd(), 'data', 'fleet-dogfood.json');
}

export function readFleetDogfood(): FleetDogfoodSnapshot | null {
  return readJsonFile<FleetDogfoodSnapshot | null>(fleetDogfoodPath(), null);
}

function asArray<T>(x: unknown): T[] {
  return Array.isArray(x) ? (x as T[]) : [];
}

export interface DogfoodOptions {
  /** Max findings exported to Draymond per cycle (default 10). */
  exportLimit?: number;
  /** Max TID signals ingested (default 800). */
  signalLimit?: number;
  /** Skip network ingest/export (local-only graph); default false. */
  localOnly?: boolean;
}

/**
 * Run one dogfood cycle. Never throws: a failure is captured in the returned
 * report / snapshot. Exported so the scheduler and the route share one path.
 */
export async function runFleetDogfoodCycle(opts: DogfoodOptions = {}): Promise<FleetDogfoodSnapshot> {
  const cfg = draymondConfig();
  const steps: string[] = [];
  const exportLimit = Math.max(1, Math.min(50, opts.exportLimit ?? 10));
  const signalLimit = Math.max(1, Math.min(2000, opts.signalLimit ?? 800));

  const health = opts.localOnly
    ? { ok: false, status: 0, latencyMs: 0, error: 'local-only run' }
    : await draymondHealth().catch((e) => ({ ok: false, status: 0, latencyMs: 0, error: String(e) }));
  const online = health.ok;
  steps.push(online ? `draymond online (${health.latencyMs}ms)` : `draymond unavailable: ${health.error ?? health.status}`);

  // ---- INGEST ------------------------------------------------------------
  let signals: DraymondTidSignal[] = [];
  let tidInsights: Array<Record<string, unknown>> = [];
  let grades: DraymondResearchGrade[] = [];
  let learning: DraymondLearningStore | null = null;
  if (online) {
    const [sig, ins, gr, ls] = await Promise.all([
      fetchTidSignals({ limit: signalLimit }).catch((e) => ({ ok: false, data: null, error: String(e) })),
      fetchTidInsights({ limit: 200 }).catch((e) => ({ ok: false, data: null, error: String(e) })),
      fetchScienceGrades().catch((e) => ({ ok: false, data: null, error: String(e) })),
      fetchLearningStore().catch((e) => ({ ok: false, data: null, error: String(e) })),
    ]);
    if (sig.ok && sig.data) signals = asArray<DraymondTidSignal>(sig.data.signals);
    if (ins.ok && ins.data) tidInsights = asArray<Record<string, unknown>>(ins.data.insights);
    if (gr.ok && gr.data) grades = asArray<DraymondResearchGrade>(gr.data.discoveries);
    if (ls.ok && ls.data) learning = ls.data as DraymondLearningStore;
    steps.push(`ingest: ${signals.length} signals, ${tidInsights.length} insights, ${grades.length} grades, learning=${learning ? 'yes' : 'no'}`);
  } else {
    steps.push('ingest: skipped (offline)');
  }

  const learningRecords =
    (Array.isArray(learning?.driftMetrics) ? learning!.driftMetrics!.length : 0) +
    (Array.isArray(learning?.outcomes) ? learning!.outcomes!.length : 0);
  const series: TrendSeries[] = draymondToTrendSeries({ signals, grades, learning });

  // ---- ANALYZE -----------------------------------------------------------
  const scan = series.length ? runTrendScan(series, { stationarize: true }) : null;
  let ledgerInsights = 0;
  if (scan) {
    for (const h of scan.hypotheses.slice(0, 5)) {
      const rec = appendInsight({
        createdRun: `dogfood:${scan.manifestHash}`,
        hypothesisId: h.id,
        templateId: h.templateId,
        statement: h.statement,
        confidence: Math.max(0, Math.min(1, h.scores.total / 5)),
        provenanceRoot: scan.manifestHash,
        payload: { source: 'fleet-dogfood', scores: h.scores, anomalyIds: h.anomalyIds, draymond: cfg.baseUrl },
      });
      if (rec) ledgerInsights += 1;
    }
    steps.push(`analyze: ${series.length} series, ${scan.crossDomain.length} significant cross-domain pairs, ${scan.hypotheses.length} hypotheses, ${ledgerInsights} ledgered`);
  } else {
    steps.push('analyze: no series to scan');
  }

  // ---- UNIFY -------------------------------------------------------------
  let map: ReturnType<typeof readSynergyMap> | null = null;
  try { map = readSynergyMap(); } catch { map = null; }
  const candidates = map?.candidates ?? [];
  const graph: CrossDomainGraphResult = buildCrossDomainGraph({
    correlations: scan?.crossDomain ?? [],
    series: series.map((s) => ({ id: s.id, domain: s.domain })),
    candidates,
  });
  steps.push(`unify: ${graph.links.length} links (${graph.counts.temporal} temporal, ${graph.counts.structural} structural, ${graph.counts.merged} merged)`);

  // ---- IMPORT fleet-known pairs -----------------------------------------
  let knownPairs: string[] = [];
  if (online) {
    const si = await fetchScienceInsights({ limit: 200 }).catch(() => ({ ok: false, data: null }));
    if (si.ok && si.data) {
      const reports = asArray<Record<string, unknown>>(si.data.insights)
        .map((i) => (i && typeof i.report === 'object' ? (i.report as Record<string, unknown>) : i))
        .filter((r): r is { from_domain: string; to_domain: string } =>
          !!r && typeof r.from_domain === 'string' && typeof r.to_domain === 'string');
      knownPairs = draymondInsightsToKnownPairs(reports);
    }
  }

  // ---- EXPORT ------------------------------------------------------------
  const attemptedReports: DraymondScienceInsightReport[] = [];
  let skipped = 0;
  for (const link of graph.links.slice(0, exportLimit)) {
    const report = crossDomainLinkToScienceInsight(link);
    if (report) attemptedReports.push(report);
    else skipped += 1;
  }
  // No temporal data this cycle: fall back to the structural candidates so the
  // fleet still sees Recourse's transfer discoveries.
  if (attemptedReports.length === 0) {
    for (const c of candidates.slice(0, exportLimit)) {
      const report = synergyCandidateToScienceInsight(c);
      if (report) attemptedReports.push(report);
      else skipped += 1;
    }
  }

  let persisted = 0;
  let duplicates = 0;
  const errors: string[] = [];
  if (online) {
    for (const report of attemptedReports) {
      const res = await persistScienceInsight(report, {
        source: 'recourse-cross-domain',
        evidenceTier: 'E3',
      }).catch((e) => ({ ok: false, data: null, error: String(e) }));
      if (res.ok && res.data?.ok !== false) {
        persisted += 1;
        if (res.data?.duplicate) duplicates += 1;
      } else {
        errors.push(res.error ?? res.data?.error ?? 'persist failed');
      }
    }
    steps.push(`export: ${persisted}/${attemptedReports.length} persisted (${duplicates} duplicate)${skipped ? `, ${skipped} unmapped skipped` : ''}`);
  } else {
    steps.push(`export: skipped (offline); ${attemptedReports.length} findings ready`);
  }

  const snapshot: FleetDogfoodSnapshot = {
    version: 1,
    at: Date.now(),
    draymond: {
      baseUrl: cfg.baseUrl,
      online,
      secretConfigured: Boolean(cfg.secret),
      ...(health.error ? { error: health.error } : {}),
      latencyMs: health.latencyMs,
    },
    ingest: {
      signals: signals.length,
      insights: tidInsights.length,
      grades: grades.length,
      learningRecords,
      series: series.length,
      correlations: scan?.crossDomain.length ?? 0,
      hypotheses: scan?.hypotheses.length ?? 0,
      ledgerInsights,
      knownPairs: knownPairs.length,
    },
    graph: {
      links: graph.links.length,
      temporal: graph.counts.temporal,
      structural: graph.counts.structural,
      merged: graph.counts.merged,
      domains: graph.domains,
      manifestHash: graph.manifestHash,
    },
    export: { attempted: attemptedReports.length, persisted, duplicates, skipped, errors: errors.slice(0, 10) },
    links: graph.links.slice(0, MAX_LINKS_KEPT),
    knownPairList: knownPairs.slice(0, 200),
    steps,
  };

  try {
    writeJsonFile(fleetDogfoodPath(), snapshot);
  } catch (err) {
    steps.push(`persist snapshot failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  return snapshot;
}
