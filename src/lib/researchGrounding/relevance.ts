/**
 * relevance.ts — decides whether a retrieved source is actually about the thing
 * being forged.
 *
 * ## Why this file exists
 *
 * Wiring the gatherer up and pointing it at a live service exposed the real
 * failure mode. Forging `shannonEntropy` — "Shannon entropy of a symbol
 * distribution… compute the entropy in bits" — returned, in order:
 *
 * 1. *Observations of TeV gamma ray flares from Markarian 501*
 * 2. *Beamforming Techniques for Large-N Aperture Arrays*
 * 3. *CORSIKA Simulation of the Telescope Array Surface Detector*
 *
 * arXiv's search is loose: it ORs terms and matches on any of them, so a query
 * containing "array", "compute" and "distribution" will return radio astronomy.
 *
 * Quoting those into a code-generation prompt is worse than quoting nothing.
 * Nothing at least leaves the model to write the straightforward implementation;
 * wrong-but-authoritative excerpts teach it that entropy means astrophysics, and
 * the citation makes the result look reviewed.
 *
 * So every item is scored against the query's own terms and dropped when the
 * overlap is too thin. The scorer is deliberately lexical rather than semantic —
 * it needs to be explainable ("this source shares no terms with your query") and
 * it must never be the reason a tool gets built wrongly.
 */

import type { GroundingSource } from './types';

/** Terms too common to carry topical signal. */
const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'with', 'that', 'this', 'it', 'is', 'are', 'be',
  'as', 'by', 'on', 'at', 'from', 'into', 'which', 'must', 'should', 'can', 'may', 'not', 'use', 'used',
  'using', 'return', 'returns', 'define', 'export', 'exactly', 'one', 'function', 'named', 'code', 'only',
  'source', 'javascript', 'satisfies', 'contract', 'given', 'each', 'per', 'than', 'then', 'when', 'value',
  'values', 'array', 'arrays', 'compute', 'computes', 'computed', 'handle', 'handles', 'implied', 'observed',
]);

export interface Relevance {
  /** Fraction of query terms present in the title or span, 0..1. */
  readonly score: number;
  /** Query terms that actually matched. */
  readonly matched: readonly string[];
  /** How many of the query's content terms exist at all. */
  readonly considered: number;
}

/** Reduce a string to comparable content terms. */
export function contentTerms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/**
 * Long terms are the discriminating ones. "entropy" identifies a subject; "data"
 * does not. Weighting by length keeps a generic-but-matching result from scoring
 * the same as an exact topical hit.
 */
function weight(term: string): number {
  return term.length >= 7 ? 2 : 1;
}

/**
 * Score one source against the query.
 *
 * Matching against title AND span separately matters: a paper whose title is
 * exactly on-topic ("Renyi extrapolation of Shannon entropy") must outrank one
 * that merely mentions the words in passing, so a title match counts double.
 *
 * That doubling is why the result is clamped. Without it a single-term query
 * matching a title scores 2.0, and a caller passing `minRelevance` — documented
 * as 0..1 — would find that nothing above 1 is reachable.
 */
export function scoreRelevance(query: string, source: Pick<GroundingSource, 'title' | 'span'>): Relevance {
  const terms = [...new Set(contentTerms(query))];
  if (terms.length === 0) return { score: 0, matched: [], considered: 0 };

  const titleTerms = new Set(contentTerms(source.title));
  const spanTerms = new Set(contentTerms(source.span));

  let earned = 0;
  let possible = 0;
  const matched: string[] = [];
  for (const term of terms) {
    const w = weight(term);
    possible += w;
    if (titleTerms.has(term)) {
      earned += w * 2;
      matched.push(term);
    } else if (spanTerms.has(term)) {
      earned += w;
      matched.push(term);
    }
  }
  const score = possible === 0 ? 0 : Math.min(1, earned / possible);
  return { score, matched, considered: terms.length };
}

export interface FilterOptions {
  /**
   * Minimum weighted overlap to keep an item. 0.34 means roughly a third of the
   * query's weight must appear in the source.
   */
  readonly minScore?: number;
  /**
   * Keep everything the providers returned, but mark relevance instead of
   * dropping. Used by the status route so an operator can see what a looser
   * threshold would have yielded.
   */
  readonly keepAll?: boolean;
}

export interface RelevanceFilter {
  readonly kept: GroundingSource[];
  /** Everything dropped, with the score that dropped it, so the gate is auditable. */
  readonly dropped: Array<{ source: GroundingSource; score: number }>;
}

/**
 * Drop sources that are not about the query.
 *
 * Runs *after* trust classification and independently of it: a `retrieved`
 * source that is off-topic and an `unverified` source that is on-topic are both
 * excluded from the prompt, for different reasons.
 */
export function filterByRelevance(
  sources: readonly GroundingSource[],
  query: string,
  opts: FilterOptions = {},
): RelevanceFilter {
  const minScore = opts.minScore ?? 0.34;
  const kept: GroundingSource[] = [];
  const dropped: Array<{ source: GroundingSource; score: number }> = [];
  for (const source of sources) {
    if (opts.keepAll === true) {
      kept.push(source);
      continue;
    }
    const { score } = scoreRelevance(query, source);
    if (score >= minScore) kept.push(source);
    else dropped.push({ source, score });
  }
  return { kept, dropped };
}