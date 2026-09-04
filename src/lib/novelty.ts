/**
 * Novelty rejection sampling (Phase 2 #8).
 *
 * Before paying for sandbox verification (or a model call), reject candidates
 * that are near-duplicates of ones we already know. This is the sample-
 * efficiency win ShinkaEvolve demonstrated; here it runs as a deterministic,
 * dependency-free filter with an optional plug-in similarity function so the
 * fuzz sidecar (RapidFuzz) can be dropped in for fuzzy near-duplicates later.
 *
 * Honesty: everything is pure over the exact strings you pass. The default
 * similarity is a token Jaccard in [0,1]; a candidate is novel when its best
 * similarity to the pool is strictly below the threshold. No LLM is involved
 * and nothing is "deduplicated" away unless it truly clears the bar.
 */

export interface NoveltyVerdict {
  novel: boolean;
  /** highest similarity to any known item, in [0,1] */
  bestScore: number;
  /** the pool member that is most similar (when pool is non-empty) */
  mostSimilar: string | null;
}

export type SimilarityFn = (a: string, b: string) => number;

function tokens(s: string): Set<string> {
  return new Set(
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9_ ]/g, ' ')
      .split(/\s+/)
      .filter(Boolean),
  );
}

/** Default token-Jaccard similarity in [0,1]. */
export function jaccard(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Highest similarity of `needle` to any pool member (0 when pool empty). */
export function bestSimilarity(needle: string, pool: string[], sim: SimilarityFn = jaccard): { best: number; item: string | null } {
  let best = 0;
  let item: string | null = null;
  for (const p of pool) {
    const s = sim(needle, p);
    if (s > best) { best = s; item = p; }
  }
  return { best, item };
}

/** Novel when best similarity < threshold. Pure. */
export function isNovel(needle: string, pool: string[], threshold = 0.7, sim: SimilarityFn = jaccard): NoveltyVerdict {
  const { best, item } = bestSimilarity(needle, pool, sim);
  return { novel: best < threshold, bestScore: Math.round(best * 1000) / 1000, mostSimilar: item };
}

/** Return only the pool members that are novel against each other (greedy
 *  filter keeping order) — a dedupe that drops near-duplicates. */
export function dedupeNovel(items: string[], threshold = 0.7, sim: SimilarityFn = jaccard): string[] {
  const kept: string[] = [];
  for (const it of items) {
    if (isNovel(it, kept, threshold, sim).novel) kept.push(it);
  }
  return kept;
}
