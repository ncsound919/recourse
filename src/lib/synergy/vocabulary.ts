// src/lib/synergy/vocabulary.ts
/**
 * Versioned controlled relational vocabulary. This is the precision lever:
 * only these tokens become graph bridge terms, which is what keeps the
 * closed-discovery baseline from degenerating into free-text lexical noise.
 */
import { manifestHash } from './manifest.js';

export const VOCAB_VERSION = '1.0.0';

export const PRIMITIVES = [
  'transform', 'loss', 'optimizer', 'memory', 'router', 'evaluator',
  'graph', 'sequence', 'geometry', 'statistics', 'scheduling', 'compliance',
  'prediction', 'search', 'optimization', 'probability', 'linear_algebra',
  'signal', 'control', 'ranking', 'clustering', 'simulation',
] as const;

export const FUNCTORS = [
  'depends_on', 'derives', 'maps_to', 'satisfies', 'bounds',
  'schedules', 'measures', 'classifies',
] as const;

const PRIMITIVE_SET = new Set<string>(PRIMITIVES);

export function isKnownPrimitive(x: string): boolean {
  return PRIMITIVE_SET.has(x);
}

export function canonicalizeTerm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Primitives only — the only tokens allowed as graph bridge terms. Functors
 *  are relational and are rejected by the semantic_type gate by design. */
export function bridgeTerms(): string[] {
  return PRIMITIVES.map(canonicalizeTerm);
}

export function vocabularyTerms(): string[] {
  return [...PRIMITIVES, ...FUNCTORS].map(canonicalizeTerm);
}

export function vocabularyHash(): string {
  return manifestHash([
    VOCAB_VERSION,
    ...PRIMITIVES.map((p) => `P:${p}`),
    ...FUNCTORS.map((f) => `F:${f}`),
  ]);
}
