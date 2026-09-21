/**
 * auditDepth.ts — let the recursive learner set how deep the audit team goes.
 *
 * The autopilot's audit team (grader / reporank / deep / codegang / olympics,
 * see `auditRunner.ts`) was fixed-membership: every run paid for every auditor
 * regardless of how well-understood the work was. This module derives an audit
 * *depth* from the learner's real domain beliefs — auditing hardest where the
 * learner is least certain or worst-performing, and triaging where it is
 * already confident — and maps that depth onto a tier of auditors.
 *
 * Pure and deterministic: the same beliefs always yield the same depth, so the
 * schedule is auditable and replayable. `depthFromSignals` is documented as a
 * policy, not a measured property.
 */
import { AUDITOR_IDS, type AuditorIdT } from './loopTypes.js';
import type { LearnerState } from '../dream/learner-types.js';
import type { ToolDomain } from '../dream/types.js';
import { TOOL_DOMAINS, summarizeBeliefsByDomain } from '../lib/learnerGenerationPlan.js';

/** Deeper = more auditors, more cost, more scrutiny. */
export type AuditDepth = 1 | 2 | 3 | 4;

/** Additive tiers over the real auditor ids, ordered least→most intensive.
 *  Depth 4 is the FULL team (it equals the no-learner default), so a cold or
 *  unsure learner never audits *less* than the pre-existing behavior.
 *  Membership is what matters; `auditorsForDepth` returns them in canonical
 *  `AUDITOR_IDS` order. */
export const AUDIT_DEPTH_TIERS: Readonly<Record<AuditDepth, readonly AuditorIdT[]>> = {
  1: ['grader'],
  2: ['grader', 'reporank'],
  3: ['grader', 'reporank', 'deep'],
  4: ['grader', 'reporank', 'codegang', 'deep', 'olympics'],
};

export interface AuditSignals {
  /** Failure-rate posterior in [0,1]. */
  uncertainty: number;
  /** Attempt-weighted mean reward in [0,1]. */
  meanReward: number;
  /** Total evaluations behind the signal. */
  attempts: number;
}

/**
 * Policy: a domain that is barely evaluated, or whose posterior is uncertain /
 * low-reward, gets audited deeply; a well-evidenced, high-reward domain is
 * triaged. This is a labelled heuristic, not a measured difficulty.
 */
export function depthFromSignals(input: AuditSignals): AuditDepth {
  const uncertainty = Number.isFinite(input.uncertainty) ? input.uncertainty : 1;
  const meanReward = Number.isFinite(input.meanReward) ? input.meanReward : 0;
  const attempts = Number.isFinite(input.attempts) ? input.attempts : 0;
  if (attempts < 2) return 4; // no evidence yet — scrutinise fully
  if (uncertainty >= 0.5 || meanReward < 0.5) return 4;
  if (uncertainty >= 0.3 || meanReward < 0.7) return 3;
  if (uncertainty >= 0.15 || meanReward < 0.85) return 2;
  return 1;
}

/** The auditors in a tier, in stable `AUDITOR_IDS` order, optionally filtered
 *  to those the caller can actually run. */
export function auditorsForDepth(depth: AuditDepth, available?: readonly AuditorIdT[]): AuditorIdT[] {
  const tier = AUDIT_DEPTH_TIERS[depth] ?? AUDIT_DEPTH_TIERS[1];
  const allow = available ? new Set(available) : null;
  return AUDITOR_IDS.filter((id) => tier.includes(id) && (!allow || allow.has(id)));
}

export interface AuditDepthPlan {
  domain: ToolDomain;
  depth: AuditDepth;
  auditors: AuditorIdT[];
  uncertainty: number;
  meanReward: number;
  attempts: number;
  reason: string;
}

/**
 * Per-domain audit depth from the learner's beliefs, deepest first. Domains the
 * learner knows nothing about surface at depth 4 (maximum scrutiny).
 */
export function planAuditDepth(
  state: Pick<LearnerState, 'geneBeliefs' | 'directives'>,
  opts: { domains?: readonly ToolDomain[]; available?: readonly AuditorIdT[] } = {},
): AuditDepthPlan[] {
  const summaries = summarizeBeliefsByDomain(Object.values(state.geneBeliefs ?? {}), opts.domains ?? TOOL_DOMAINS);
  return summaries
    .map((s): AuditDepthPlan => {
      const depth = depthFromSignals({ uncertainty: s.uncertainty, meanReward: s.meanReward, attempts: s.attempts });
      return {
        domain: s.domain,
        depth,
        auditors: auditorsForDepth(depth, opts.available),
        uncertainty: s.uncertainty,
        meanReward: s.meanReward,
        attempts: s.attempts,
        reason: `uncertainty ${s.uncertainty.toFixed(2)}, mean reward ${s.meanReward.toFixed(2)}, attempts ${s.attempts} → depth ${depth}`,
      };
    })
    .sort((a, b) => b.depth - a.depth || (a.domain < b.domain ? -1 : a.domain > b.domain ? 1 : 0));
}

/** The single deepest domain needing scrutiny (for a single-profile audit run). */
export function deepestAudit(
  state: Pick<LearnerState, 'geneBeliefs' | 'directives'>,
  opts: { domains?: readonly ToolDomain[]; available?: readonly AuditorIdT[] } = {},
): AuditDepthPlan | null {
  return planAuditDepth(state, opts)[0] ?? null;
}
