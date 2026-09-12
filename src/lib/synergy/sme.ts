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
