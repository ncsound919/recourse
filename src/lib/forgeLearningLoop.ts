/**
 * forgeLearningLoop.ts — close the loop between the recursive learner and the
 * capability forge (tool generation).
 *
 * Two engines already exist but ran past each other:
 *   - the recursive learner (`dream/learner.ts` + `learnerGenerationPlan.ts`)
 *     maintains Beta posteriors per gene and a deterministic generation plan
 *     (which domain is least understood / worst-performing, and whether to
 *     synthesize, refine, or amplify); and
 *   - the capability forge (`capabilityForge.ts`) generates, sandbox-verifies,
 *     and materializes real tools — but selected its agenda in a hard-coded
 *     order and never reported its outcomes back to the learner.
 *
 * This module is the missing seam. It is pure (no clock, no I/O, no model) so
 * the same learner state + spec list always yields the same plan, and the
 * server can inject the model + sandbox:
 *
 *   - PLANNING  `rankForgeSpecsByLearnerPlan` orders forge specs by the
 *               learner's real domain needs so the next tool is built where the
 *               learner is weakest — not where the static list points.
 *   - FEEDBACK  `forgeOutcomeReward` / `forgeLearnUpdate` turn a real outcome
 *               (reference-suite pass + live materialization) into a reward on
 *               the learner, keyed by the canonical capability key so variants
 *               of one capability compound onto a single belief.
 *   - MINTING   `chooseMintTarget` / `mintContextForTarget` /
 *               `mintedProblemToForgeSpec` let a learner `synthesize` directive
 *               become a brand-new ForgeSpec: the server mints a problem whose
 *               hidden reference is proven to pass its own acceptance test in
 *               the sandbox, then treats that acceptance test as the forge's
 *               reference suite. The learner can therefore invent new tools,
 *               not just reorder the existing ones.
 *
 * Honesty contract: nothing here invents a capability, a score, or a reward.
 * Every field is derived from the learner's recorded beliefs/directives or from
 * a real forge outcome. An offline attempt yields no learning signal (null)
 * rather than a fabricated one.
 */

import type { ForgeSpec } from './capabilityForge.js';
import type { LearnerState } from '../dream/learner-types.js';
import type { ToolDomain } from '../dream/types.js';
import { canonicalToolKey } from './openEnded/gates.js';
import { generationTargets, type GenerationTarget } from './learnerGenerationPlan.js';
import type { MintedProblem } from './openEnded/problemMint.js';

const clamp01 = (n: number): number => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

// ---------------------------------------------------------------------------
// PLANNING — order forge specs by the learner's generation plan
// ---------------------------------------------------------------------------

export interface ForgeSpecRanking {
  /** Specs ordered best-first for the learner's current needs (stable). */
  ordered: ForgeSpec[];
  /** The domain-level plan that produced the ordering (for logs/UI). */
  targets: GenerationTarget[];
  /** spec.id -> the human reason it was ranked where it was. */
  reasons: Record<string, string>;
}

export interface RankForgeSpecsOptions {
  /** Domains to plan over (defaults to the learner's shared tool domains). */
  domains?: readonly ToolDomain[];
  /** Domains to rank first (e.g. `systemic` when the fleet reports degraded).
   *  By contract these sort ahead of higher-need domains, matching
   *  `generationTargets`. */
  priorityDomains?: readonly ToolDomain[];
  /** Bonus added when the domain's plan says synthesize. Default 0.15. */
  synthesizeBoost?: number;
  /** Bonus added when the domain's plan says refine. Default 0.08. */
  refineBoost?: number;
  /** Bonus added when a directive names this exact spec. Default 0.30. */
  directiveBoost?: number;
}

/**
 * Rank forge specs by the recursive learner's real domain needs. The score is
 * the domain's generation `priority` (in [0,1]) plus action bonuses, plus a
 * large bonus when a directive names the spec's exact capability. Ordering is
 * deterministic: score desc, then original index, then spec id. Specs whose
 * domain has no belief get a neutral 0.5 — honest "unknown", never fabricated
 * confidence.
 */
export function rankForgeSpecsByLearnerPlan(
  specs: ForgeSpec[],
  state: Pick<LearnerState, 'geneBeliefs' | 'directives'>,
  opts: RankForgeSpecsOptions = {},
): ForgeSpecRanking {
  const targets = generationTargets(state, {
    ...(opts.domains ? { domains: opts.domains } : {}),
    ...(opts.priorityDomains ? { priorityDomains: opts.priorityDomains } : {}),
  });
  const targetByDomain = new Map<ToolDomain, GenerationTarget>();
  for (const t of targets) targetByDomain.set(t.domain, t);

  const synthBoost = opts.synthesizeBoost ?? 0.15;
  const refineBoost = opts.refineBoost ?? 0.08;
  const directiveBoost = opts.directiveBoost ?? 0.3;
  const prioritySet = new Set<ToolDomain>(opts.priorityDomains ?? []);

  // A directive that names THIS spec's capability is the strongest possible
  // "build it" signal; a directive that names the domain is a weaker one.
  const directiveDomains = new Set<ToolDomain>();
  const directiveGeneKeys = new Set<string>();
  for (const d of state.directives ?? []) {
    if (d.targetDomain) directiveDomains.add(d.targetDomain);
    if (d.geneName) directiveGeneKeys.add(canonicalToolKey(d.geneName));
  }

  const scored = specs.map((spec, index) => {
    const target = targetByDomain.get(spec.domain);
    let score = target ? target.priority : 0.5;
    if (target?.action === 'synthesize') score += synthBoost;
    else if (target?.action === 'refine') score += refineBoost;
    if (directiveDomains.has(spec.domain)) score += refineBoost;
    if (directiveGeneKeys.has(canonicalToolKey(spec.name))) score += directiveBoost;
    const reason = target
      ? `${target.action} ${spec.domain} (need ${target.priority.toFixed(2)}): ${target.reason}`
      : `no learner belief for ${spec.domain} — neutral priority`;
    return { spec, index, score: round3(score), reason };
  });

  scored.sort((a, b) => {
    // Explicit priority domains sort first, exactly like generationTargets.
    const ap = prioritySet.has(a.spec.domain) ? 1 : 0;
    const bp = prioritySet.has(b.spec.domain) ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return (
      b.score - a.score ||
      a.index - b.index ||
      (a.spec.id < b.spec.id ? -1 : a.spec.id > b.spec.id ? 1 : 0)
    );
  });

  const reasons: Record<string, string> = {};
  for (const s of scored) reasons[s.spec.id] = s.reason;
  return { ordered: scored.map((s) => s.spec), targets, reasons };
}

// ---------------------------------------------------------------------------
// FEEDBACK — turn a real forge outcome into a learner reward
// ---------------------------------------------------------------------------

export type ForgeOutcomeStatus = 'materialized' | 'exists' | 'offline' | 'failed' | 'materialize_failed';

/** The subset of a forge outcome the reward depends on. */
export interface ForgeOutcomeLike {
  ok: boolean;
  verifyScore?: number;
  attemptsUsed: number;
  reason?: string;
}

/**
 * Graded reward in [0,1] for a forge outcome, or null when there is no real
 * signal to learn from.
 *   - materialized       -> 1.0  (reference suite passed AND live self-host ok)
 *   - materialize_failed -> 0.7  (reference suite passed — real, proven capability)
 *   - failed             -> 0.15 (the model never satisfied the reference suite)
 *   - exists / offline   -> null (nothing built / network absence is not evidence)
 */
export function forgeOutcomeReward(outcome: ForgeOutcomeLike, status: ForgeOutcomeStatus): number | null {
  if (status === 'offline') return null;
  if (status === 'exists') return null;
  if (status === 'materialized') return 1;
  if (status === 'materialize_failed') return 0.7;
  if (outcome.attemptsUsed <= 0) return 0;
  return 0.15;
}

export interface ForgeLearnUpdate {
  /** Human-readable tool name (kept for display in the learner UI). */
  name: string;
  /** Canonical key (without the learner's `real:` prefix) so variants compound. */
  key: string;
  domain: ToolDomain;
  reward: number;
}

/**
 * The learner update for a real forge attempt, or null when the attempt carries
 * no usable signal. The belief key is canonical so every name-variant of one
 * capability lands on a single posterior.
 */
export function forgeLearnUpdate(
  outcome: ForgeOutcomeLike,
  spec: Pick<ForgeSpec, 'name' | 'domain'>,
  status: ForgeOutcomeStatus,
): ForgeLearnUpdate | null {
  const reward = forgeOutcomeReward(outcome, status);
  if (reward === null) return null;
  return { name: spec.name, key: canonicalToolKey(spec.name), domain: spec.domain, reward: clamp01(reward) };
}

// ---------------------------------------------------------------------------
// MINTING — let a learner synthesize directive become a new ForgeSpec
// ---------------------------------------------------------------------------

/**
 * The highest-priority learner target whose domain has NO forge spec pending,
 * so minting fills a genuine gap instead of duplicating queued work. Prefers a
 * `synthesize` target, then a `refine` one; returns null when every actionable
 * domain already has something to build.
 */
export function chooseMintTarget(
  targets: GenerationTarget[],
  existingDomains: Iterable<string>,
): GenerationTarget | null {
  const have = new Set(existingDomains);
  for (const t of targets) {
    if (!have.has(t.domain) && t.action === 'synthesize') return t;
  }
  for (const t of targets) {
    if (!have.has(t.domain) && t.action === 'refine') return t;
  }
  return null;
}

/**
 * Thematic context handed to the problem drafter for a learner target. Derived
 * verbatim from the learner's real signal — no invented premise.
 */
export function mintContextForTarget(target: GenerationTarget): string {
  return (
    `a genuinely useful, self-contained ${target.domain} capability this system ` +
    `cannot yet solve. Learner signal: ${target.reason}.`
  );
}

/**
 * Convert an admitted (reference-proven) minted problem into a ForgeSpec. The
 * acceptance test becomes the forge's hidden reference suite — the same
 * machine-checkable contract `benchmarkGapSpecs` uses — so the forge builds and
 * sandbox-verifies a real implementation against it.
 */
export function mintedProblemToForgeSpec(
  problem: MintedProblem,
  opts: { sourceDirectiveId?: string } = {},
): ForgeSpec {
  const safeId = problem.id.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
  const tag = opts.sourceDirectiveId ? `_${canonicalToolKey(opts.sourceDirectiveId)}` : '';
  return {
    id: `learn_${safeId}${tag}`,
    name: problem.functionName,
    domain: problem.domain as ToolDomain,
    title: problem.title,
    prompt: `${problem.statement}\n\nDefine and export exactly one function named "${problem.functionName}" that satisfies the contract. Return only the code.`,
    refSuite: problem.acceptanceTest,
  };
}

/** One-line, honest digest of a ranking for logs/reports. */
export function forgeRankingDigest(ranking: ForgeSpecRanking): string {
  const head = ranking.ordered.slice(0, 5).map((s) => `${s.name}@${s.domain}`);
  return head.length ? head.join(' > ') : 'no forge specs';
}
