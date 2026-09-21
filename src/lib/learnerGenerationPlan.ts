/**
 * learnerGenerationPlan.ts — feed tool generation from the recursive learner.
 *
 * The recursive learner already maintains Beta posteriors per gene
 * (`GeneBelief` alpha/beta + EMA `meanReward`) and emits structured `Directive`s
 * (retire / refine / amplify / synthesize_template). What was missing was a
 * single, deterministic place that turns those real signals into *what to build
 * next*: which domain is least understood or worst-performing, and whether the
 * forge should synthesize a new capability, refine the weakest one, or amplify
 * the strongest pattern.
 *
 * This module is that planner. It is pure (no clock, no model, no I/O) so the
 * same learner state always yields the same generation plan — the forge can run
 * it 24/7 and be audited/replayed. Nothing is invented: every field is derived
 * from the learner's recorded beliefs and directives.
 */
import type { Directive, GeneBelief, LearnerState } from '../dream/learner-types.js';
import type { ToolDomain } from '../dream/types.js';

/** The tool domains the learner and forge share. */
export const TOOL_DOMAINS: readonly ToolDomain[] = [
  'coding',
  'math',
  'biotech',
  'systemic',
  'cyber_defense',
  'neuro_symbolic',
  'quantum_sim',
];

const clamp01 = (n: number): number => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

export interface DomainBeliefSummary {
  domain: ToolDomain;
  genes: number;
  attempts: number;
  alpha: number;
  beta: number;
  /** Attempt-weighted mean reward across the domain's genes, in [0,1]. */
  meanReward: number;
  /** Failure-rate posterior in [0,1]; 1 when there is no evidence. */
  uncertainty: number;
  /** Generation priority in [0,1]: under-explored + under-performing = highest. */
  need: number;
}

/**
 * Aggregate gene beliefs into per-domain signals. A domain with no genes yet
 * reports `uncertainty: 1`, `need: 1` — i.e. maximum priority — which is the
 * honest statement that we know nothing about it.
 */
export function summarizeBeliefsByDomain(
  beliefs: Iterable<GeneBelief>,
  domains: readonly ToolDomain[] = TOOL_DOMAINS,
): DomainBeliefSummary[] {
  const byDomain = new Map<ToolDomain, GeneBelief[]>();
  for (const d of domains) byDomain.set(d, []);
  for (const b of beliefs) {
    const list = byDomain.get(b.domain);
    if (list) list.push(b);
  }
  return domains.map((domain) => {
    const list = byDomain.get(domain) ?? [];
    const attempts = list.reduce((n, b) => n + (Number(b.attempts) || 0), 0);
    const alpha = list.reduce((n, b) => n + (Number(b.alpha) || 0), 0);
    const beta = list.reduce((n, b) => n + (Number(b.beta) || 0), 0);
    const weightedReward = list.reduce(
      (n, b) => n + (Number(b.meanReward) || 0) * (Number(b.attempts) || 0),
      0,
    );
    const meanReward = attempts > 0 ? weightedReward / attempts : 0;
    const uncertainty = alpha + beta > 0 ? beta / (alpha + beta) : 1;
    // Under-explored (uncertainty) weighted a little above under-performing.
    const need = clamp01(0.6 * uncertainty + 0.4 * (1 - meanReward));
    return {
      domain,
      genes: list.length,
      attempts,
      alpha,
      beta,
      meanReward: round3(meanReward),
      uncertainty: round3(uncertainty),
      need: round3(need),
    };
  });
}

export type GenerationAction = 'synthesize' | 'refine' | 'amplify';

export interface GenerationTarget {
  domain: ToolDomain;
  action: GenerationAction;
  /** Ranking key in [0,1]; higher = build here first. */
  priority: number;
  uncertainty: number;
  meanReward: number;
  genes: number;
  reason: string;
  /** The learner directive that motivated this target, when there was one. */
  directiveId?: string;
}

export interface GenerationPlanOptions {
  domains?: readonly ToolDomain[];
  limit?: number;
  /** Domains to rank first (e.g. `systemic` when an external self-report is
   *  degraded). They sort ahead of higher-need domains; `priority` is unchanged. */
  priorityDomains?: readonly ToolDomain[];
}

/**
 * Rank domains for the forge. Ordering is deterministic: priority desc, then
 * domain id asc. Action per domain:
 *  - a learner `synthesize_template` directive, or zero genes  -> synthesize
 *  - mean reward below the refine threshold (0.70)             -> refine
 *  - otherwise                                                -> amplify
 */
export function generationTargets(
  state: Pick<LearnerState, 'geneBeliefs' | 'directives'>,
  opts: GenerationPlanOptions = {},
): GenerationTarget[] {
  const domains = opts.domains ?? TOOL_DOMAINS;
  const summaries = summarizeBeliefsByDomain(Object.values(state.geneBeliefs ?? {}), domains);
  const boost = new Set<ToolDomain>(opts.priorityDomains ?? []);

  const synthByDomain = new Map<string, Directive>();
  for (const d of state.directives ?? []) {
    if (d.kind === 'synthesize_template' && d.targetDomain && !synthByDomain.has(d.targetDomain)) {
      synthByDomain.set(d.targetDomain, d);
    }
  }

  const targets = summaries.map((s): GenerationTarget => {
    const synth = synthByDomain.get(s.domain);
    let action: GenerationAction;
    let reason: string;
    if (synth) {
      action = 'synthesize';
      reason = synth.reason;
    } else if (s.genes === 0) {
      action = 'synthesize';
      reason = `no capability recorded in ${s.domain} yet — synthesize the first one`;
    } else if (s.meanReward < 0.7) {
      action = 'refine';
      reason = `mean reward ${s.meanReward.toFixed(2)} below 0.70 — refine the weakest capability`;
    } else {
      action = 'amplify';
      reason = `stable reward ${s.meanReward.toFixed(2)} — amplify the strongest pattern`;
    }
    return {
      domain: s.domain,
      action,
      priority: s.need,
      uncertainty: s.uncertainty,
      meanReward: s.meanReward,
      genes: s.genes,
      reason,
      ...(synth ? { directiveId: synth.id } : {}),
    };
  });

  targets.sort((a, b) => {
    const ab = boost.has(a.domain) ? 1 : 0;
    const bb = boost.has(b.domain) ? 1 : 0;
    if (ab !== bb) return bb - ab;
    return b.priority - a.priority || (a.domain < b.domain ? -1 : a.domain > b.domain ? 1 : 0);
  });
  return typeof opts.limit === 'number' ? targets.slice(0, Math.max(0, opts.limit)) : targets;
}

/** The single highest-priority generation target, or null when there are none. */
export function nextGenerationTarget(
  state: Pick<LearnerState, 'geneBeliefs' | 'directives'>,
  opts: Omit<GenerationPlanOptions, 'limit'> = {},
): GenerationTarget | null {
  return generationTargets(state, { ...opts, limit: 1 })[0] ?? null;
}

/** One-line, honest digest of a plan for logs/reports. */
export function generationPlanDigest(targets: GenerationTarget[]): string {
  if (!targets.length) return 'generation plan: no domains configured';
  return targets
    .map((t) => `${t.domain}:${t.action}(p=${t.priority.toFixed(2)})`)
    .join(' ');
}
