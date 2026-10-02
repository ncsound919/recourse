/**
 * roleRouter.ts — route a model call by ROLE, not by availability.
 *
 * WHY THIS EXISTS
 * Recourse had exactly two model "profiles": `local` (qwen3.5-2b on Ollama) and
 * `api` (deepseek-v4-flash). Both the PLANNER and the narrow EXECUTOR used the
 * same call, `chatComplete()`, which picked a profile by availability + a UCB1
 * bandit over `(local|api)`. A 2B local model was therefore eligible to decide
 * *what to build and whether the work was any good* — the two jobs that need
 * judgement — while also doing the narrow work it is actually good at.
 *
 * That is backwards. A 2B model is a fine executor and a poor planner. The
 * failure is not that the small model is used; it is that the ROLE is not part of
 * the decision.
 *
 * WHAT THIS DOES
 * Adds a role dimension. A call declares its role (`plan` | `critique` | `execute`
 * | `summarize`); the router decides the profile. Judgement roles are held to a
 * higher evidence bar than mechanical ones, and the bandit's arm id encodes the
 * role so a model that is good at planning is not punished for being bad at
 * summarization, and vice versa.
 *
 * The existing `ModelBandit` is reused as-is — UCB1 is already correct and
 * already persisted. What changes is the ARM SPACE: arms become
 * `<role>:<profile>` instead of `<profile>`, and the floor that decides "is this
 * model good enough to be allowed to plan" is explicit rather than emergent.
 *
 * HONESTY CONTRACT
 *  - This is a POLICY layer, not a capability upgrade. It cannot make a 2B model
 *    plan well. It can only stop routing planning work to models that have
 *    demonstrated they cannot do it. If no profile is configured for a
 *    judgement role, the router says so and returns null — it never silently
 *    downgrades planning to the executor model.
 *  - A role with no observed outcomes returns null (fall back to the caller's
 *    existing heuristic). No evidence => no routing decision. This is the same
 *    warmup discipline modelSelection.ts already uses.
 *  - Rewards are supplied by the caller from a real measured outcome. Nothing
 *    here infers quality from a model's own opinion of its answer.
 *  - The floor is a THRESHOLD, not a gate on correctness: crossing it lets a
 *    profile plan; it never asserts the plan is right.
 */

import { ModelBandit, type ArmRecord } from './modelBandit.js';

/**
 * What the call is FOR. This is the axis the system was missing.
 *
 *  - `plan`      — decide what to build / what to do next. Judgement.
 *  - `critique`  — judge whether output is any good. Judgement.
 *  - `execute`   — narrow, well-specified generation (extract, reformat, fill a
 *                  template from a stated contract). Mechanical.
 *  - `summarize` — condense text that is already known-good. Mechanical.
 */
export type ModelRole = 'plan' | 'critique' | 'execute' | 'summarize';

/** Roles where a weak model produces a confidently wrong answer rather than an obviously broken one. */
const JUDGEMENT_ROLES: ReadonlySet<ModelRole> = new Set<ModelRole>(['plan', 'critique']);

export function isJudgementRole(role: ModelRole): boolean {
  return JUDGEMENT_ROLES.has(role);
}

/** A provider profile, as today: 'local' | 'api'. */
export type ModelProfile = 'local' | 'api';

/** Arm id for a (role, profile) pair. */
export function armId(role: ModelRole, profile: ModelProfile): string {
  return `${role}:${profile}`;
}

/** Inverse of {@link armId}; null when the id is malformed. */
export function parseArmId(id: string): { role: ModelRole; profile: ModelProfile } | null {
  const i = id.indexOf(':');
  if (i <= 0) return null;
  const role = id.slice(0, i);
  const profile = id.slice(i + 1);
  if (!['plan', 'critique', 'execute', 'summarize'].includes(role)) return null;
  if (profile !== 'local' && profile !== 'api') return null;
  return { role: role as ModelRole, profile };
}

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

export interface RolePolicy {
  /**
   * Minimum observed mean reward for a profile to be allowed to do a judgement
   * role. Below this, the model may still EXECUTE, but it does not get to decide
   * what to build or whether the work is good.
   *
   * Calibrated against the reward scale in modelSelection.rewardForOutcome: a
   * perfect fast answer scores 1.0, a correct but slow one 0.5, a failure 0.0.
   * So 0.6 means "correct most of the time and usually promptly".
   */
  judgementFloor: number;
  /** Profiles to consider at all, in preference order. */
  preferred: ModelProfile[];
  /** Roles, if any, this deployment refuses to route (e.g. no API key). */
  disabledRoles?: ModelRole[];
}

export const DEFAULT_ROLE_POLICY: RolePolicy = {
  // Deliberately not zero: a model that fails a quarter of the time must not be
  // trusted to decide direction.
  judgementFloor: 0.6,
  // API first for judgement: a bigger model is the point of the split. It stays
  // a PREFERENCE, not a hardcode — the bandit can override once it has evidence.
  preferred: ['api', 'local'],
};

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

export interface RouteDecision {
  profile: ModelProfile;
  /** True when the bandit's UCB pick decided this; false when policy did. */
  byBandit: boolean;
  /** Every candidate considered, with the measured mean that justified the call. */
  considered: ArmRecord[];
  /** Why this profile, in words an operator can audit. */
  reason: string;
}

export interface RouteResult {
  /** The chosen profile, or null when nothing may take this role. */
  decision: RouteDecision | null;
  /** Set when nothing may take this role. Never a silent fallback. */
  refusal?: string;
}

/** Snapshot type the router needs from a bandit, without depending on its class. */
interface BanditLike {
  choose(): string | null;
  addArm(id: string): void;
  record(id: string, reward: number): void;
  snapshot(): ArmRecord[];
  readonly totalPlayCount: number;
}

export class RoleRouter {
  private readonly bandit: BanditLike;
  private readonly policy: RolePolicy;
  /** Plays required before the bandit may override the static preference. */
  private readonly warmup: number;

  constructor(opts: { bandit?: BanditLike; policy?: Partial<RolePolicy>; warmup?: number } = {}) {
    this.bandit = opts.bandit ?? new ModelBandit({ priorCount: 1 });
    this.policy = { ...DEFAULT_ROLE_POLICY, ...(opts.policy ?? {}) };
    this.warmup = Math.max(0, opts.warmup ?? 4);
  }

  private allowedProfiles(role: ModelRole): ModelProfile[] {
    if (this.policy.disabledRoles?.includes(role)) return [];
    return this.policy.preferred.filter((p) => p === 'local' || p === 'api');
  }

  /**
   * True once the bandit has enough real plays to justify overriding policy.
   * Requires BOTH the warmup threshold AND at least one observed play, so an
   * unplayed bandit never "decides" — otherwise `byBandit:true` would claim
   * credit for a choice made with no evidence at all.
   */
  private banditIsInformed(): boolean {
    return this.bandit.totalPlayCount >= this.warmup && this.bandit.totalPlayCount > 0;
  }

  /**
   * Mean reward observed for a (role, profile) arm, or null when never tried.
   * Read from the snapshot rather than the private internals so the router does
   * not depend on the bandit's implementation.
   */
  private meanFor(role: ModelRole, profile: ModelProfile): number | null {
    const rec = this.bandit.snapshot().find((a) => a.id === armId(role, profile));
    if (!rec || rec.plays <= 0) return null;
    return rec.mean;
  }

  /**
   * Choose a profile for `role` from the profiles that are actually available.
   *
   * `available` is the set the caller could reach right now (probed). Order does
   * not matter — the router decides.
   *
   * Returns null (with a reason) rather than falling back, because the whole
   * point is that judgement work must not silently land on a model that has not
   * earned it.
   */
  route(role: ModelRole, available: ModelProfile[]): RouteResult {
    const allowed = this.allowedProfiles(role).filter((p) => available.includes(p));
    if (allowed.length === 0) {
      return {
        decision: null,
        refusal: this.policy.disabledRoles?.includes(role)
          ? `role "${role}" is disabled by policy`
          : `no available provider profile may serve role "${role}" (available: ${available.join(',') || 'none'})`,
      };
    }

    for (const p of allowed) this.bandit.addArm(armId(role, p));

    // Single candidate: nothing to decide, and no evidence to withhold it.
    if (allowed.length === 1) {
      return {
        decision: {
          profile: allowed[0],
          byBandit: false,
          considered: this.bandit.snapshot().filter((a) => a.id.startsWith(`${role}:`)),
          reason: `only "${allowed[0]}" is available for role "${role}"`,
        },
      };
    }

    // Judgement roles additionally require a measured mean at or above the floor.
    // This is the load-bearing rule: it is what stops a 2B executor from being
    // handed the planner seat.
    if (isJudgementRole(role)) {
      const floor = this.policy.judgementFloor;
      const qualified = allowed.filter((p) => {
        const m = this.meanFor(role, p);
        return m !== null && m >= floor;
      });

      if (qualified.length === 0) {
        // No profile has earned the judgement seat. Report the real numbers
        // rather than quietly promoting the preference order.
        const detail = allowed
          .map((p) => `${p}=${this.meanFor(role, p) === null ? 'no data' : this.meanFor(role, p)}`)
          .join(', ');
        return {
          decision: null,
          refusal:
            `role "${role}" requires an observed mean reward >= ${floor}, and no available profile has it (${detail}). ` +
            `Recording outcomes for this role is what unlocks it.`,
        };
      }

      // Among qualified profiles, let the bandit choose — but only once warm.
      if (this.banditIsInformed()) {
        const pick = this.bandit.choose();
        const parsed = pick ? parseArmId(pick) : null;
        if (parsed && parsed.role === role && qualified.includes(parsed.profile)) {
          return {
            decision: {
              profile: parsed.profile,
              byBandit: true,
              considered: this.bandit.snapshot().filter((a) => a.id.startsWith(`${role}:`)),
              reason: `bandit selected ${parsed.profile} for ${role} among profiles that met the ${floor} floor (means: ${qualified.map((p) => `${p}=${this.meanFor(role, p)}`).join(', ')})`,
            },
          };
        }
      }

      // Qualified but not warm (or bandit's pick was unqualified): preference
      // order, restricted to qualified.
      const chosen = this.policy.preferred.find((p) => qualified.includes(p))!;
      return {
        decision: {
          profile: chosen,
          byBandit: false,
          considered: this.bandit.snapshot().filter((a) => a.id.startsWith(`${role}:`)),
          reason: `policy order among profiles that met the ${floor} floor for ${role}`,
        },
      };
    }

    // Mechanical role: no floor. Preference order, or the bandit once warm.
    if (this.banditIsInformed()) {
      const pick = this.bandit.choose();
      const parsed = pick ? parseArmId(pick) : null;
      if (parsed && parsed.role === role && allowed.includes(parsed.profile)) {
        return {
          decision: {
            profile: parsed.profile,
            byBandit: true,
            considered: this.bandit.snapshot().filter((a) => a.id.startsWith(`${role}:`)),
            reason: `bandit selected ${parsed.profile} for ${role}`,
          },
        };
      }
    }
    const chosen = allowed[0];
    return {
      decision: {
        profile: chosen,
        byBandit: false,
        considered: this.bandit.snapshot().filter((a) => a.id.startsWith(`${role}:`)),
        reason: `policy preference for mechanical role "${role}"`,
      },
    };
  }

  /** Record a real measured outcome for a (role, profile) pair. */
  record(role: ModelRole, profile: ModelProfile, reward: number): void {
    this.bandit.addArm(armId(role, profile));
    this.bandit.record(armId(role, profile), reward);
  }

  snapshot(): ArmRecord[] {
    return this.bandit.snapshot();
  }
}
