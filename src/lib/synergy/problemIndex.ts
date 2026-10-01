// src/lib/synergy/problemIndex.ts
/**
 * Problem extraction from RecourseProblem. Primitive detection is a labeled
 * heuristic over the statement + acceptance test — never claimed as measured.
 * Limitation: text is lowercased before matching, so camelCase identifiers like
 * `LossFunction` do NOT match — a conservative, accepted false-negative.
 *
 * Real relational predicates are extracted from `@rel` annotations in the
 * acceptance test or problem statement. When present, the problem's
 * `relationBasis` is set to `'declared'` and SME alignment can fire.
 */
import type { RecourseProblem } from '../problemArchive.js';
import type { ProblemSignature } from './types.js';
import { PRIMITIVES, canonicalizeTerm } from './vocabulary.js';
import { relationsFromPrimitives } from './methodIndex.js';
import { extractDeclaredRelations } from './relationExtract.js';
import { sha256Hex } from './manifest.js';

/** Heuristic controlled-primitive detector over free text. Word-boundary based. */
export function detectPrimitives(text: string): string[] {
  const lower = text.toLowerCase();
  return PRIMITIVES
    .filter((prim) => new RegExp(`\\b${prim.replace(/_/g, '[_ ]?')}\\b`).test(lower))
    .map((prim) => canonicalizeTerm(prim));
}

export function extractProblem(p: RecourseProblem): ProblemSignature {
  if (!p || !p.id) throw new Error('extractProblem: problem id is required');
  const fullText = `${p.title}\n${p.statement}\n${p.acceptanceTest}`;
  const requiredPrimitives = detectPrimitives(fullText);
  const extracted = extractDeclaredRelations(p.acceptanceTest, p.domain);
  const hasRealRelations = extracted.relations.length > 0;
  return {
    id: `problem:${canonicalizeTerm(p.id)}`,
    name: p.title,
    domain: p.domain,
    requiredPrimitives,
    acceptanceTest: p.acceptanceTest,
    testHash: sha256Hex(p.acceptanceTest),
    extraction: hasRealRelations ? 'declared' : 'heuristic',
    relations: hasRealRelations ? extracted.relations : relationsFromPrimitives(requiredPrimitives, p.domain),
    relationBasis: hasRealRelations ? 'declared' : 'placeholder',
  };
}

export function extractProblems(ps: RecourseProblem[]): ProblemSignature[] {
  return ps.map(extractProblem).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
