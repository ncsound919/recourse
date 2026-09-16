// src/lib/synergy/relationExtract.ts
/**
 * Real relational predicates for the synergy engine (Plan 7).
 *
 * SME alignment is fail-closed on methods without `relationBasis: 'declared'`.
 * These extractors produce genuine predicates from execution-/text-grounded
 * evidence only — a translation engine's real term mapping, or explicit `@rel`
 * annotations in verified source. Nothing is invented: when no real predicate
 * exists the result is an empty set with basis `null`, and the method stays
 * `placeholder`.
 *
 * The functor vocabulary is controlled; off-vocabulary annotations are rejected
 * rather than admitted as noise.
 */
import type { Rel } from './types.js';
import { canonicalizeTerm } from './vocabulary.js';

export type RelationBasisKind = 'declared' | 'translation' | 'suite';

export interface ExtractedRelations {
  relations: Rel[];
  basis: RelationBasisKind | null;
  confidence: number;
  notes: string[];
}

/** Controlled functor vocabulary — the only predicates SME may align on. */
export const ALLOWED_FUNCTORS = new Set([
  'maps_to',
  'depends_on',
  'derives',
  'increases',
  'decreases',
  'part_of',
  'causes',
  'enables',
  'inhibits',
]);

const EMPTY: ExtractedRelations = { relations: [], basis: null, confidence: 0, notes: [] };

function splitArgs(raw: string): string[] {
  return raw
    .split(/\s*->\s*|\s*,\s*|\s+/)
    .map((s) => canonicalizeTerm(s))
    .filter((s) => s.length > 0);
}

/**
 * Parse explicit `@rel <functor> <arg> [->|,| ] ...` annotations from source
 * comments. Only allowlisted functors are admitted; anything else is noted and
 * dropped (never silently turned into a placeholder relation).
 */
export function extractDeclaredRelations(sourceCode: string | undefined, _domain: string): ExtractedRelations {
  if (!sourceCode) return { ...EMPTY };
  const relations: Rel[] = [];
  const notes: string[] = [];
  const re = /@rel\s+([a-z_]+)\s+([^\r\n*]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sourceCode)) !== null) {
    const functor = m[1].toLowerCase();
    if (!ALLOWED_FUNCTORS.has(functor)) {
      notes.push(`rejected off-vocabulary functor "${functor}"`);
      continue;
    }
    const args = splitArgs(m[2].trim());
    if (args.length < 1) {
      notes.push(`rejected "${functor}" with no arguments`);
      continue;
    }
    relations.push({ functor, type: 'rel', args, order: relations.length + 1 });
  }
  if (relations.length === 0) return { relations: [], basis: null, confidence: 0, notes };
  return { relations, basis: 'declared', confidence: 1, notes };
}

export interface TranslationPair {
  source: string;
  target: string;
  confidence?: number;
}

/**
 * Turn a translation engine's real `source -> target` term pairs into `maps_to`
 * relations, carrying the engine's per-pair confidence (default 0.8).
 */
export function extractTranslationRelations(pairs: TranslationPair[], _domain: string): ExtractedRelations {
  const rels: Rel[] = [];
  let confSum = 0;
  const notes: string[] = [];
  for (const p of pairs) {
    const source = canonicalizeTerm(String(p.source ?? ''));
    const target = canonicalizeTerm(String(p.target ?? ''));
    if (!source || !target) {
      notes.push('skipped a pair with an empty side');
      continue;
    }
    const confidence = typeof p.confidence === 'number' ? Math.max(0, Math.min(1, p.confidence)) : 0.8;
    confSum += confidence;
    rels.push({ functor: 'maps_to', type: 'rel', args: [source, target], order: rels.length + 1 });
  }
  if (rels.length === 0) return { ...EMPTY, notes };
  return { relations: rels, basis: 'translation', confidence: confSum / rels.length, notes };
}

/** Merge relation sets, de-duplicating by functor+args. */
export function mergeRelations(...sets: ExtractedRelations[]): ExtractedRelations {
  const seen = new Set<string>();
  const relations: Rel[] = [];
  const notes: string[] = [];
  let basis: RelationBasisKind | null = null;
  let confSum = 0;
  let confCount = 0;
  for (const set of sets) {
    notes.push(...set.notes);
    if (!basis && set.basis) basis = set.basis;
    if (set.basis) {
      confSum += set.confidence;
      confCount += 1;
    }
    for (const r of set.relations) {
      const key = `${r.functor}:${r.args.join('|')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      relations.push({ ...r, order: relations.length + 1 });
    }
  }
  return {
    relations,
    basis: relations.length > 0 ? basis : null,
    confidence: confCount > 0 ? confSum / confCount : 0,
    notes,
  };
}

/** Convenience: relations for a method from its declared annotations + optional provided ones. */
export function relationsForMethod(
  input: { sourceCode?: string; relations?: Rel[]; domain: string },
): ExtractedRelations {
  const declared = extractDeclaredRelations(input.sourceCode, input.domain);
  const provided: ExtractedRelations = input.relations && input.relations.length > 0
    ? { relations: input.relations, basis: 'declared', confidence: 1, notes: [] }
    : EMPTY;
  return mergeRelations(provided, declared);
}
