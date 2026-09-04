/**
 * Builder Brain — the meta-loop that improves Recourse's own generator.
 *
 * The "improver" is the config that drives code generation (the system
 * instructions + temperature the Capability Forge sends the model). Builder
 * Brain treats that as a tunable that evolves from REAL outcomes:
 *
 *  - Several BuilderProfiles each carry a distinct code-writing strategy.
 *  - Every forge attempt records a BuilderOutcome {profileId, specId, domain,
 *    passed, attemptsUsed}; `passed` is the ground truth reference-suite result.
 *  - computeBeliefs folds those real outcomes into a beta posterior per profile
 *    (pass-rate). chooseProfile selects the profile with the best expected
 *    pass-rate — the bandit decision.
 *  - proposeVariant mutates the current best profile's prompt/temperature to
 *    propose a NEW strategy; the journal validates it and selection keeps it
 *    only if it actually wins. Self-modification is confined to the prompt /
 *    temperature layer — never core logic.
 *
 * Honesty contract: reward is a real reference-suite pass, never a fabricated
 * quality score. With no data the seed profile is used. Pure functions so the
 * decision logic is unit-testable; persistence lives in the server state.
 */

export interface BuilderProfile {
  id: string;
  label: string;
  /** System instructions sent to the code model (how to write code). */
  systemPrompt: string;
  temperature: number;
}

export interface BuilderOutcome {
  at: number;
  profileId: string;
  specId: string;
  domain: string;
  passed: boolean;
  attemptsUsed: number;
}

/** Seed strategies. 'concise' is the current default system prompt. */
export const BUILDER_SEED_PROFILES: BuilderProfile[] = [
  {
    id: 'concise',
    label: 'Concise default',
    temperature: 0.1,
    systemPrompt:
      `You write plain JavaScript micro-functions. Rules:\n` +
      `- Return ONLY the source code. No Markdown fences, no commentary, no prose.\n` +
      `- No imports, no require, no TypeScript types, no classes unless asked.\n` +
      `- Define and export exactly one function.\n` +
      `- The implementation will be tested against a hidden test suite that asserts the exact behavior described. Match it precisely.\n` +
      `- Handle edge cases (empty inputs, single elements) explicitly.`,
  },
  {
    id: 'edge-correctness',
    label: 'Edge-case correctness first',
    temperature: 0.2,
    systemPrompt:
      `Write correct, plain JavaScript. You are judged by a HIDDEN test suite that checks exact outputs including edge and boundary cases.\n` +
      `- Return ONLY the source code (no fences, prose, comments).\n` +
      `- No imports, no require, no TypeScript, no classes.\n` +
      `- Before writing, enumerate edge cases for the described contract (empty input, single element, duplicates, negatives, large inputs, exact string/array equality). Ensure each is handled.\n` +
      `- Prefer simple, explicit, obviously-correct code over clever or compressed code.\n` +
      `- Define and export exactly one function with the required name.`,
  },
  {
    id: 'minimal',
    label: 'Minimal tokens',
    temperature: 0.0,
    systemPrompt:
      `Return the SHORTEST correct plain-JavaScript implementation.\n` +
      `- ONLY source code, no fences, no prose, no comments.\n` +
      `- No imports, no require, no TypeScript, no classes.\n` +
      `- No extra branches or variables beyond what the contract requires.\n` +
      `- Define and export exactly one function with the required name.\n` +
      `- Fewer tokens reduce model mistakes; still match exact expected outputs including empty/edge cases.`,
  },
];

export interface BuilderBelief {
  profileId: string;
  label: string;
  attempts: number;
  passes: number;
  /** Posterior mean of pass-rate with a Beta(1,1) prior: (1+passes)/(2+attempts). */
  posteriorMean: number;
}

export interface BuilderMeta {
  activeProfileId: string;
  profiles: BuilderProfile[];
  journalSize: number;
  beliefs: BuilderBelief[];
  bestProfileId: string;
  mutateDue: boolean;
}

/** Fold real outcomes into per-profile beta beliefs, best pass-rate first. */
export function computeBuilderBeliefs(profiles: BuilderProfile[], journal: BuilderOutcome[]): BuilderBelief[] {
  const agg = new Map<string, { passes: number; attempts: number }>();
  for (const p of profiles) agg.set(p.id, { passes: 0, attempts: 0 });
  for (const o of journal) {
    if (!agg.has(o.profileId)) continue;
    const a = agg.get(o.profileId)!;
    a.attempts += 1;
    if (o.passed) a.passes += 1;
  }
  const beliefs: BuilderBelief[] = profiles.map((p) => {
    const a = agg.get(p.id)!;
    return {
      profileId: p.id,
      label: p.label,
      attempts: a.attempts,
      passes: a.passes,
      posteriorMean: a.attempts === 0 ? 0.5 : (1 + a.passes) / (2 + a.attempts),
    };
  });
  return beliefs.sort((x, y) => y.posteriorMean - x.posteriorMean || x.attempts - y.attempts || x.profileId.localeCompare(y.profileId));
}

/** Pick the profile with the best expected pass-rate (the bandit decision). */
export function chooseBuilderProfile(profiles: BuilderProfile[], journal: BuilderOutcome[]): BuilderProfile {
  if (profiles.length === 0) throw new Error('no builder profiles');
  if (journal.length === 0) return profiles[0];
  const beliefs = computeBuilderBeliefs(profiles, journal);
  const best = beliefs[0];
  return profiles.find((p) => p.id === best.profileId) ?? profiles[0];
}

/** Should the builder propose a new prompt variant yet? Mutation is rare. */
export function builderMutateDue(journal: BuilderOutcome[], profiles: BuilderProfile[], lastMutateJournalSize: number): boolean {
  const MAX_PROFILES = 8;
  if (profiles.length >= MAX_PROFILES) return false;
  // Propose a variant after every N new outcomes since the last mutation, once.
  return journal.length - lastMutateJournalSize >= 6;
}

const VARIANT_DIRECTIVES: string[] = [
  'Handle the case where the input array/string is very large and must not overflow.',
  'Verify array/string results with exact element order; never mutate the input.',
  'Prefer an explicit single-return structure; avoid deeply nested control flow.',
  'Double-check sign handling, zero, and off-by-one boundaries before returning.',
  'For numeric contracts, avoid floating-point drift by integer/closed-form math where possible.',
];

/** Propose ONE new strategy by mutating the current best profile (rare). */
export function proposeBuilderProfile(
  profiles: BuilderProfile[],
  journal: BuilderOutcome[],
  rng: () => number,
): BuilderProfile | null {
  if (profiles.length >= 8) return null;
  const best = chooseBuilderProfile(profiles, journal);
  const directive = VARIANT_DIRECTIVES[Math.floor(rng() * VARIANT_DIRECTIVES.length)];
  const variantId = `${best.id}-v${profiles.length}`;
  const variant: BuilderProfile = {
    id: variantId,
    label: `Variant of ${best.label}`,
    temperature: Math.min(0.4, Math.round((best.temperature + 0.05 + rng() * 0.05) * 100) / 100),
    systemPrompt: `${best.systemPrompt}\n\nExperiment directive (meta-learned): ${directive}`,
  };
  return variant;
}
