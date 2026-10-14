/**
 * trustLevels.ts — the T0–T3 trust model, with the corroboration rule enforced
 * in code rather than stated in prose.
 *
 * WHY THIS EXISTS (AEF v2.1)
 * The fleet had provenance *sources* (a DOI/PMID ledger, a hash chain) but no
 * trust TIER: nothing labelled how much a fact could be believed, and nothing
 * refused a promotion on the strength of an unverified one. The rule AEF
 * requires is: facts at T0/T1 may inform a proposal, and only T2/T3 facts may
 * justify a promotion, a policy change or a deployment.
 *
 * THE LOAD-BEARING DECISION: a level is DERIVED, never taken from the caller.
 * A `declaredTrust` field that a caller could simply set to 3 would be the same
 * defect as a caller-supplied `reversible` flag on the autonomy envelope — the
 * agent's account of itself, accepted as evidence. So `deriveTrustLevel` can
 * only ever LOWER a claim, never raise it: it starts from what the source
 * materially is, and raises the tier only when the caller supplies the
 * corroborating artifact that tier requires.
 *
 *   T0  external / untrusted      — scraped web, a fetched document, an unknown source
 *   T1  agent-derived             — an agent's own claim about its own work
 *   T2  corroborated              — a second INDEPENDENT source, or a deterministic
 *                                   check that does not trust the agent's word
 *   T3  human-attested            — a named operator explicitly signed off
 *
 * Pure and deterministic: no clock, no I/O, no randomness.
 */

export type TrustLevel = 0 | 1 | 2 | 3;

export const T0_EXTERNAL: TrustLevel = 0;
export const T1_AGENT: TrustLevel = 1;
export const T2_CORROBORATED: TrustLevel = 2;
export const T3_HUMAN: TrustLevel = 3;

export const TRUST_NAMES: Readonly<Record<TrustLevel, string>> = {
  0: 'T0_external',
  1: 'T1_agent',
  2: 'T2_corroborated',
  3: 'T3_human_attested',
};

/** The minimum tier at which a fact may justify a promotion / policy / deploy. */
export const PROMOTION_MIN_TRUST: TrustLevel = T2_CORROBORATED;

/**
 * Sources that ARE a deterministic check rather than an agent's account. A fact
 * attributed to one of these is corroborated by construction: the check ran
 * against the artifact, and its verdict does not depend on the agent's word.
 * This list is deliberately small and explicit — adding a source here is a
 * security decision, so it is a code change, not a config flag.
 */
export const DETERMINISTIC_CHECK_SOURCES: readonly string[] = [
  'truthchain',        // Truth Chain detectors (hash comparisons, not claims)
  'sieve-decision',    // a composed gate verdict carrying gate evidence
  'sieve-verify',      // assert-nothing / false-green detection
  'sieve-guard',       // injection/secret scanner
  'openhub-audit',     // the audit suite's reconciled score
  'benchmark',         // the hash-chained benchmark ledger
];

/** Sources that are inherently an agent's own account of its work. */
export const AGENT_SOURCES: readonly string[] = [
  'opencode-session',
  'sieve',
  'openhub-teams',
  'axiom-prospector',
  'axiom-adversary',
  'axiom-repair',
  'draymond',
  'omniresearch',
  'fleet',
];

export interface TrustInput {
  /** Where the fact came from (lowercased by the deriver). */
  source?: unknown;
  /**
   * The caller's CLAIMED level. It can only ever lower the derived tier. An
   * agent claiming T3 receives the tier its source materially supports.
   */
  declaredTrust?: unknown;
  /** Independent corroboration: a second source id that is NOT the origin. */
  corroboratingSource?: unknown;
  /**
   * Whether a deterministic check (one of DETERMINISTIC_CHECK_SOURCES) is what
   * produced this fact. Must be paired with `checkEvidence` to count.
   */
  deterministicCheck?: unknown;
  /** A free-form artifact reference proving the check ran (hash, report id). */
  checkEvidence?: unknown;
  /** Human attestation. Only a named `operator:*` actor counts. */
  attestedBy?: unknown;
}

export interface TrustResult {
  level: TrustLevel;
  name: string;
  /** Why this tier, in words an operator can audit. */
  reason: string;
  /** The tier the caller asked for, when they asked for one. */
  claimed?: TrustLevel | null;
  /** Set when the claim was refused (a claim can never RAISE a tier). */
  downgraded?: boolean;
}

function asLevel(v: unknown): TrustLevel | null {
  const n = typeof v === 'string' ? Number(v.replace(/[^0-9]/g, '')) : Number(v);
  return n === 0 || n === 1 || n === 2 || n === 3 ? (n as TrustLevel) : null;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** A human actor is one explicitly namespaced as the operator's own hands. */
export function isHumanActor(actor: string): boolean {
  return /^operator:|^human:|^founder:/i.test(actor);
}

/**
 * Derive the trust tier of one fact.
 *
 * Precedence:
 *   1. A named operator attestation  -> T3 (cannot be spoofed by an agent source,
 *      because the actor string must be namespaced `operator:`)
 *   2. A deterministic check WITH evidence -> T2
 *   3. A second, independent corroborating source -> T2
 *   4. Unknown / external source -> T0
 *   5. Otherwise (an agent's own account) -> T1
 *
 * Then the caller's `declaredTrust` may LOWER the result. It can never raise it.
 */
export function deriveTrustLevel(input: TrustInput = {}): TrustResult {
  const source = asString(input.source).toLowerCase();
  const claimed = asLevel(input.declaredTrust);
  const attestor = asString(input.attestedBy);
  const corroborator = asString(input.corroboratingSource).toLowerCase();
  const checkOk = input.deterministicCheck === true && asString(input.checkEvidence).length > 0;

  let level: TrustLevel;
  let reason: string;
  const isCheckSource = DETERMINISTIC_CHECK_SOURCES.includes(source);
  const isAgentSource = AGENT_SOURCES.includes(source);

  if (attestor && isHumanActor(attestor)) {
    level = T3_HUMAN;
    reason = `human attestation by "${attestor}"`;
  } else if (checkOk && isCheckSource) {
    level = T2_CORROBORATED;
    reason = `deterministic check "${source}" with evidence`;
  } else if (corroborator && corroborator !== source && corroborator.length > 0) {
    level = T2_CORROBORATED;
    reason = `independent corroboration by "${corroborator}"`;
  } else if (isCheckSource) {
    // A deterministic-check SOURCE that arrived with no evidence artifact. The
    // check may well have run, but nothing here proves it, so the fact is no
    // better than a claim — and the reason must say that, not misdescribe the
    // source as an agent's account.
    level = T1_AGENT;
    reason = `"${source}" is a check source but arrived with no evidence artifact, so it is no better than a claim`;
  } else if (!source || !isAgentSource) {
    level = T0_EXTERNAL;
    reason = source ? `unknown source "${source}" is untrusted by default` : 'no source given: untrusted by default';
  } else {
    level = T1_AGENT;
    reason = `"${source}" is an agent's own account of its work`;
  }

  // The claim may only lower.
  let downgraded = false;
  if (claimed !== null && claimed < level) {
    level = claimed;
    reason += `; caller claimed ${TRUST_NAMES[claimed]} (a lower tier)`;
  } else if (claimed !== null && claimed > level) {
    downgraded = true;
    reason += `; caller claimed ${TRUST_NAMES[claimed]} but that tier was NOT supported — clamped to ${TRUST_NAMES[level]}`;
  }

  return { level, name: TRUST_NAMES[level], reason, ...(claimed !== null ? { claimed, ...(downgraded ? { downgraded } : {}) } : {}) };
}

/**
 * THE RULE. Only a corroborated (T2) or human-attested (T3) fact may justify a
 * promotion, a policy change or a deployment. A T0/T1 fact may inform a proposal
 * and nothing else.
 */
export function canJustifyPromotion(level: TrustLevel): boolean {
  return level >= PROMOTION_MIN_TRUST;
}

/** One-line gate result for a caller that wants the decision, not the derivation. */
export function promotionGate(result: TrustResult): { allowed: boolean; level: TrustLevel; reason: string } {
  const allowed = canJustifyPromotion(result.level);
  return {
    allowed,
    level: result.level,
    reason: allowed
      ? `${result.name} may justify a promotion (${result.reason})`
      : `${result.name} may INFORM a proposal but not justify a promotion: ${result.reason}`,
  };
}
