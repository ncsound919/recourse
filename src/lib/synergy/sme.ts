// src/lib/synergy/sme.ts
/**
 * Deterministic SME-style structure mapping over relational dgroups. All numeric
 * constants are CALIBRATION (published SME rule set), not measured properties.
 */
import type { Rel, AlignmentResult, AlignmentMapping } from './types.js';
import { canonicalizeTerm } from './vocabulary.js';

export interface DGroup {
  domain: string;
  entities: string[];
  relations: Rel[];
}

export interface MatchHypothesis {
  baseFunctor: string;
  targetFunctor: string;
  /** aligned argument pairs, positionally: [baseArg, targetArg] */
  argPairs: Array<[string, string]>;
  score: number;
}

/** Published SME rule weights (calibration). */
export const SME_CALIBRATION = {
  relationSameFunctor: 0.5,
  attributeSameFunctor: 0.2,
  argMatch: 0.4,
  orderSame: 0.3,
  higherOrderTrickle: 0.8,
} as const;

export function dgroupFromRelations(domain: string, relations: Rel[], entities: string[]): DGroup {
  return { domain, entities: entities.map(canonicalizeTerm), relations };
}

export function matchHypotheses(base: DGroup, target: DGroup): MatchHypothesis[] {
  const out: MatchHypothesis[] = [];
  for (const br of base.relations) {
    for (const tr of target.relations) {
      if (br.functor !== tr.functor) continue;
      const argPairs: Array<[string, string]> = [];
      const n = Math.min(br.args.length, tr.args.length);
      for (let i = 0; i < n; i++) argPairs.push([canonicalizeTerm(br.args[i]), canonicalizeTerm(tr.args[i])]);
      let score = br.type === 'rel' ? SME_CALIBRATION.relationSameFunctor : SME_CALIBRATION.attributeSameFunctor;
      if (argPairs.length > 0) score += SME_CALIBRATION.argMatch;
      if (br.order === tr.order) score += SME_CALIBRATION.orderSame;
      out.push({ baseFunctor: br.functor, targetFunctor: tr.functor, argPairs, score: Math.round(score * 1000) / 1000 });
    }
  }
  return out.sort((a, b) => b.score - a.score || (a.baseFunctor < b.baseFunctor ? -1 : 1));
}

/** One-to-one: no base element maps to two targets and vice versa. */
export function isStructurallyConsistent(mhs: MatchHypothesis[]): boolean {
  const baseToTarget = new Map<string, string>();
  const targetToBase = new Map<string, string>();
  for (const mh of mhs) {
    for (const [b, t] of mh.argPairs) {
      const prevT = baseToTarget.get(b);
      if (prevT !== undefined && prevT !== t) return false;
      const prevB = targetToBase.get(t);
      if (prevB !== undefined && prevB !== b) return false;
      baseToTarget.set(b, t);
      targetToBase.set(t, b);
    }
  }
  return true;
}

export function align(base: DGroup, target: DGroup): AlignmentResult {
  const mhs = matchHypotheses(base, target);
  // Greedy merge into a maximal one-to-one consistent set (deterministic order).
  const chosen: MatchHypothesis[] = [];
  const usedBase = new Set<string>();
  const usedTarget = new Set<string>();
  for (const mh of mhs) {
    if (!isStructurallyConsistent([...chosen, mh])) continue;
    const [b0] = mh.argPairs[0] ?? ['', ''];
    if (b0 && (usedBase.has(b0) || usedTarget.has(mh.argPairs[0][1]))) continue;
    chosen.push(mh);
    for (const [b, t] of mh.argPairs) { usedBase.add(b); usedTarget.add(t); }
  }
  // Systematicity: propagate evidence to relations that share entities with the core.
  const coreEntities = new Set<string>();
  for (const mh of chosen) for (const [b] of mh.argPairs) coreEntities.add(b);
  const systematic = SME_CALIBRATION.higherOrderTrickle * (coreEntities.size / Math.max(1, base.entities.length));
  const raw = chosen.reduce((s, m) => s + m.score, 0) + (chosen.length > 1 ? systematic : 0);
  const gmapWeight = Math.round(Math.min(1, raw / (SME_CALIBRATION.relationSameFunctor + SME_CALIBRATION.argMatch + SME_CALIBRATION.orderSame + 1)) * 1000) / 1000;

  const mappings: AlignmentMapping[] = [];
  for (const mh of chosen) {
    for (const [b, t] of mh.argPairs) mappings.push({ base: b, target: t, evidence: mh.score });
  }
  // Candidate inferences: base relations whose constituents all mapped, but with no target match.
  const targetFunctors = new Set(target.relations.map((r) => r.functor));
  const inferences: string[] = [];
  for (const br of base.relations) {
    if (targetFunctors.has(br.functor)) continue;
    if (br.args.every((a) => usedBase.has(canonicalizeTerm(a)))) inferences.push(br.functor);
  }
  mappings.sort((a, b) => (a.base < b.base ? -1 : a.base > b.base ? 1 : a.target < b.target ? -1 : 1));
  inferences.sort();
  return { gmapWeight, mappings, inferences, consistent: isStructurallyConsistent(chosen) };
}
