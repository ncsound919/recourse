/**
 * fleetSignal.ts — turn an external fleet self-report into a learner signal.
 *
 * OpenHub pushes `kind: 'openhub-self-report'` into Recourse's fleet memory
 * (stored as a `snapshot` with `meta.topic = 'openhub-self-report'` and the
 * report preserved in `meta.data`). This module reads that real report and
 * derives:
 *   - a `GeneBelief`-shaped signal in the `systemic` domain, so the recursive
 *     learner's generation planner treats fleet health as evidence; and
 *   - audit signals, so audit depth can never be shallower than the fleet's own
 *     reported health demands.
 *
 * Honesty contract: only fields actually present in the report contribute
 * evidence. A report with no usable signals yields `null`, never a neutral
 * belief invented to look like data. Pure: no clock, no I/O, no model.
 */
import type { GeneBelief, LearnerState } from '../dream/learner-types.js';

export const OPENHUB_SELF_REPORT_TOPIC = 'openhub-self-report';

/** Loose view of the OpenHub self-report payload (only fields we actually use). */
export interface OpenHubSelfReportView {
  at?: string;
  identity?: { uptimeSec?: number };
  activity?: { total?: number; passRate?: number | null; byOutcome?: Record<string, number> };
  incidents?: { recent?: unknown[]; bySeverity?: Record<string, number> };
  runs?: { active?: number; total?: number };
  bridges?: {
    axiom?: { ok?: boolean; online?: boolean };
    recourse?: { ok?: boolean; available?: boolean };
  };
}

/** Pull the OpenHub report out of a fleet-memory snapshot doc's meta. */
export function reportFromMeta(meta: unknown): OpenHubSelfReportView | null {
  if (!meta || typeof meta !== 'object') return null;
  const m = meta as { topic?: unknown; data?: unknown };
  if (m.topic !== OPENHUB_SELF_REPORT_TOPIC) return null;
  return m.data && typeof m.data === 'object' ? (m.data as OpenHubSelfReportView) : null;
}

/** The most recent OpenHub self-report across a set of memory docs, or null. */
export function latestReportFromDocs(docs: Array<{ meta?: unknown }>): OpenHubSelfReportView | null {
  const reports = docs
    .map((d) => reportFromMeta(d.meta))
    .filter((r): r is OpenHubSelfReportView => !!r);
  if (!reports.length) return null;
  return reports.reduce((newest, r) => {
    const n = Date.parse(newest.at ?? '') || 0;
    const c = Date.parse(r.at ?? '') || 0;
    return c > n ? r : newest;
  });
}

export interface FleetHealth {
  alpha: number;
  beta: number;
  healthy: string[];
  degraded: string[];
}

/** Count the real healthy vs degraded signals in a report. */
export function updateOpenHubHealth(report: OpenHubSelfReportView): FleetHealth {
  const healthy: string[] = [];
  const degraded: string[] = [];

  const passRate = report.activity?.passRate;
  if (typeof passRate === 'number' && Number.isFinite(passRate)) {
    (passRate >= 0.8 ? healthy : degraded).push('activity-pass-rate');
  } else if (typeof report.activity?.total === 'number' && report.activity.total === 0) {
    degraded.push('no-activity');
  }

  const incidentCount = Array.isArray(report.incidents?.recent) ? report.incidents!.recent!.length : undefined;
  if (typeof incidentCount === 'number') {
    (incidentCount === 0 ? healthy : degraded).push('incidents');
  }

  const axiom = report.bridges?.axiom;
  if (axiom && typeof axiom.online === 'boolean') (axiom.online ? healthy : degraded).push('bridge-axiom');

  const recourse = report.bridges?.recourse;
  if (recourse && typeof recourse.available === 'boolean') (recourse.available ? healthy : degraded).push('bridge-recourse');

  if (typeof report.runs?.active === 'number') {
    (report.runs.active === 0 ? healthy : degraded).push('runs-active');
  }

  return { alpha: healthy.length, beta: degraded.length, healthy, degraded };
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * A learner signal for the `systemic` domain derived from the fleet report, or
 * null when the report carries no usable evidence. `meanReward` is the observed
 * healthy fraction; `alpha`/`beta` are real counts, so UCB/uncertainty treat it
 * like any other gene belief.
 */
export function deriveOpenHubBelief(
  report: OpenHubSelfReportView,
  opts: { geneName?: string } = {},
): GeneBelief | null {
  const { alpha, beta } = updateOpenHubHealth(report);
  const attempts = alpha + beta;
  if (attempts === 0) return null;
  const meanReward = alpha / attempts;
  const geneName = opts.geneName ?? 'fleet:openhub';
  return {
    geneId: 'fleet:openhub',
    geneName,
    domain: 'systemic',
    alpha,
    beta,
    attempts,
    meanReward: round3(meanReward),
    weight: round3(meanReward),
    lastEpisode: 0,
  };
}

/** Audit signals from the report, for `depthFromSignals`. Null when no evidence. */
export function deriveOpenHubAuditSignals(
  report: OpenHubSelfReportView,
): { uncertainty: number; meanReward: number; attempts: number } | null {
  const { alpha, beta } = updateOpenHubHealth(report);
  const attempts = alpha + beta;
  if (attempts === 0) return null;
  return { uncertainty: round3(beta / attempts), meanReward: round3(alpha / attempts), attempts };
}

/**
 * Merge external (fleet) beliefs into a learner state slice. Fleet beliefs
 * replace-by-id, so re-reading the same report never double-counts evidence.
 * Returns the original object unchanged when there is nothing to merge.
 */
export function mergeFleetBeliefs<T extends Pick<LearnerState, 'geneBeliefs' | 'directives'>>(
  state: T,
  beliefs: Array<GeneBelief | null>,
): T {
  const usable = beliefs.filter((b): b is GeneBelief => !!b);
  if (!usable.length) return state;
  const geneBeliefs = { ...state.geneBeliefs };
  for (const b of usable) geneBeliefs[b.geneId] = b;
  return { ...state, geneBeliefs };
}
