// src/lib/synergy/problemIndex.ts
/**
 * Problem extraction from RecourseProblem. Primitive detection is a labeled
 * heuristic over the statement + acceptance test — never claimed as measured.
 * Limitation: text is lowercased before matching, so camelCase identifiers like
 * `LossFunction` do NOT match — a conservative, accepted false-negative.
 */
import type { RecourseProblem } from '../problemArchive.js';
import type { ProblemSignature } from './types.js';
import { PRIMITIVES, canonicalizeTerm } from './vocabulary.js';
import { relationsFromPrimitives } from './methodIndex.js';
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
  const requiredPrimitives = detectPrimitives(`${p.title}\n${p.statement}\n${p.acceptanceTest}`);
  return {
    id: `problem:${canonicalizeTerm(p.id)}`,
    name: p.title,
    domain: p.domain,
    requiredPrimitives,
    acceptanceTest: p.acceptanceTest,
    testHash: sha256Hex(p.acceptanceTest),
    extraction: 'heuristic',
    relations: relationsFromPrimitives(requiredPrimitives, p.domain),
  };
}

export function extractProblems(ps: RecourseProblem[]): ProblemSignature[] {
  return ps.map(extractProblem).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
