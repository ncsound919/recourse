/**
 * Open-ended problem archive (Phase 3 #10's data layer + #12 curriculum).
 *
 * Recourse's dream engine currently emits *hypotheses*. The open-endedness step
 * is to also emit *problems* — a task statement plus a machine-checkable
 * acceptance test — so the capability forge (or any solver) can be aimed at
 * them. This module is the durable substrate for that:
 *   - a typed `RecourseProblem` record whose `acceptanceTest` is a real JS
 *     suite the sandbox can run (nothing is admitted on trust);
 *   - a pure archive (add / list / byDomain / dedupe-via-novelty);
 *   - an honest difficulty estimate (a structural heuristic, clearly labeled —
 *     NOT a measured property);
 *   - a curriculum selector that orders problems using the recursive learner's
 *     real belief posteriors (alpha/beta), preferring the least-confident
 *     domain and the easiest unseen problem there (zone-of-proximal growth).
 *
 * Honesty contract: generation of brand-new problems still needs the model (a
 * follow-up). This module archives, dedupes, and sequences problems over real
 * belief data; it does not invent problems.
 */

import { jaccard } from './novelty.js';

export interface RecourseProblem {
  id: string;
  domain: string;
  title: string;
  statement: string;
  /** Real JS suite the sandbox verifier must pass for a solution to count. */
  acceptanceTest: string;
  /** Structural complexity hints (counts) used ONLY by the difficulty heuristic. */
  hints?: { requiredPrimitives?: number; acceptanceLines?: number; dataDims?: number };
  createdAt?: number;
}

export interface DifficultySignals {
  requiredPrimitives: number;
  acceptanceLines: number;
  dataDims: number;
  statementLength: number;
}

export function difficultySignals(p: RecourseProblem): DifficultySignals {
  const h = p.hints ?? {};
  return {
    requiredPrimitives: Math.max(0, h.requiredPrimitives ?? 1),
    acceptanceLines: Math.max(0, h.acceptanceLines ?? p.acceptanceTest.split('\n').length),
    dataDims: Math.max(0, h.dataDims ?? 1),
    statementLength: p.statement.length,
  };
}

/**
 * Structural difficulty heuristic in [0,1]. This is a labeled heuristic
 * (required-primitive count, acceptance-test length, data dimensionality,
 * statement length), NOT a measured property. It is useful for ordering, not
 * for claiming absolute difficulty.
 */
export function estimateDifficulty(p: RecourseProblem): number {
  const s = difficultySignals(p);
  const prim = Math.min(1, s.requiredPrimitives / 8) * 0.4;
  const lines = Math.min(1, s.acceptanceLines / 30) * 0.3;
  const dims = Math.min(1, s.dataDims / 4) * 0.2;
  const len = Math.min(1, s.statementLength / 600) * 0.1;
  return Math.round((prim + lines + dims + len) * 1000) / 1000;
}

export interface BeliefLike {
  domain: string;
  alpha: number;
  beta: number;
  attempts: number;
}

/** Learner confidence in a domain from real belief posteriors (failure rate). */
export function domainUncertainty(beliefs: BeliefLike[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of beliefs) {
    const total = (b.alpha ?? 0) + (b.beta ?? 0);
    const failure = total > 0 ? (b.beta ?? 0) / total : 1; // unknown domain -> max uncertainty
    const prior = out.get(b.domain) ?? 0;
    out.set(b.domain, Math.max(prior, Math.round(failure * 1000) / 1000));
  }
  return out;
}

/**
 * In-memory problem archive. Pure; determinism comes from caller-provided ids
 * and the fact that dedupe uses only the strings given.
 */
export class ProblemArchive {
  private problems = new Map<string, RecourseProblem>();
  constructor(private readonly titleSimThreshold = 0.7) {}

  add(p: RecourseProblem): { added: boolean; duplicateOf: string | null } {
    if (!p.id || this.problems.has(p.id)) return { added: false, duplicateOf: p.id };
    for (const existing of this.problems.values()) {
      if (existing.domain === p.domain && jaccard(existing.title, p.title) >= this.titleSimThreshold) {
        return { added: false, duplicateOf: existing.id };
      }
    }
    this.problems.set(p.id, { ...p, createdAt: p.createdAt ?? Date.now() });
    return { added: true, duplicateOf: null };
  }

  list(): RecourseProblem[] {
    return [...this.problems.values()];
  }

  byDomain(domain: string): RecourseProblem[] {
    return this.list().filter((p) => p.domain === domain);
  }

  get size(): number { return this.problems.size; }
}

export interface CurriculumPick {
  problem: RecourseProblem | null;
  difficulty: number;
  chosenDomain: string | null;
}

/**
 * Pick the next problem to attempt given the learner's real beliefs. Prefers
 * the least-confident domain (highest failure-rate posterior) and, within it,
 * the easiest *unseen* problem — a zone-of-proximal curriculum. Deterministic:
 * ties break to lowest id. `solved` are problem ids already mastered.
 */
export function nextByCurriculum(
  archive: ProblemArchive,
  beliefs: BeliefLike[],
  solved: string[] = [],
  knownDomains: string[] = [],
): CurriculumPick {
  const solvedSet = new Set(solved);
  const uncertainty = domainUncertainty(beliefs);
  // Order domains by uncertainty desc; domains with no belief default to max
  // uncertainty (under-explored) unless explicitly known-but-empty.
  const domains = new Set<string>([...archive.list().map((p) => p.domain), ...knownDomains]);
  const rankedDomains = [...domains].sort((a, b) => {
    const ua = uncertainty.get(a) ?? 1;
    const ub = uncertainty.get(b) ?? 1;
    if (ua !== ub) return ub - ua;
    return a < b ? -1 : a > b ? 1 : 0;
  });

  for (const domain of rankedDomains) {
    const candidates = archive
      .byDomain(domain)
      .filter((p) => !solvedSet.has(p.id))
      .map((p) => ({ p, difficulty: estimateDifficulty(p) }))
      .sort((x, y) => x.difficulty - y.difficulty || (x.p.id < y.p.id ? -1 : 1));
    if (candidates.length > 0) {
      const { p, difficulty } = candidates[0];
      return { problem: p, difficulty, chosenDomain: domain };
    }
  }
  return { problem: null, difficulty: 0, chosenDomain: null };
}

/**
 * Deterministic full curriculum queue (Phase 3 #12): every unsolved problem,
 * ordered so that the least-confident domains come first and, within a domain,
 * easiest first. This lets the solver/learner walk a stable teaching order
 * instead of re-deciding one-at-a-time. Pure.
 */
export function curriculumQueue(
  archive: ProblemArchive,
  beliefs: BeliefLike[],
  solved: string[] = [],
  knownDomains: string[] = [],
): Array<{ problem: RecourseProblem; difficulty: number; domain: string }> {
  const solvedSet = new Set(solved);
  const uncertainty = domainUncertainty(beliefs);
  const domains = new Set<string>([...archive.list().map((p) => p.domain), ...knownDomains]);
  const rankedDomains = [...domains].sort((a, b) => {
    const ua = uncertainty.get(a) ?? 1;
    const ub = uncertainty.get(b) ?? 1;
    if (ua !== ub) return ub - ua;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const out: Array<{ problem: RecourseProblem; difficulty: number; domain: string }> = [];
  for (const domain of rankedDomains) {
    const candidates = archive
      .byDomain(domain)
      .filter((p) => !solvedSet.has(p.id))
      .map((p) => ({ problem: p, difficulty: estimateDifficulty(p), domain }))
      .sort((x, y) => x.difficulty - y.difficulty || (x.problem.id < y.problem.id ? -1 : 1));
    out.push(...candidates);
  }
  return out;
}
