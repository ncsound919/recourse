/**
 * Cross-run inspiration crossover (Phase 3 #11).
 *
 * CodeEvolve's "inspiration-based crossover" pulls ideas from a run-local
 * archive to seed new candidates. Recourse's edge is that its memory is
 * *durable* (vectorMemory + ledger), so inspiration can carry over across runs
 * and across the map. This module is the pure crossover primitive: given a
 * target statement and a memory of prior (text, payload) solutions, it recalls
 * the top-k most similar items and renders an "inspiration context" a generator
 * can inject into its prompt (or a forge can use as crossover parents).
 *
 * Honesty contract:
 *  - Pure + deterministic over the memory items you pass. Similarity is the
 *    token-Jaccard default (drop in the vector/fuzz backend by supplying `sim`).
 *  - Only items above `threshold` are recalled; below it nothing is returned
 *    rather than weakly-related noise pretending to be inspiration.
 *  - This selects + formats inspiration; it does not fabricate code.
 */

import { jaccard } from './novelty.js';

export interface MemoryItem<T = unknown> {
  id: string;
  text: string;
  /** the stored payload (e.g. prior source code / candidate) */
  payload?: T;
}

export interface InspirationHit<T = unknown> {
  id: string;
  similarity: number;
  text: string;
  payload?: T;
}

export interface InspirationResult<T = unknown> {
  hits: InspirationHit<T>[];
  /** joined, ready-to-inject inspiration context */
  promptHint: string;
}

export function renderPromptHint<T>(goal: string, hits: InspirationHit<T>[]): string {
  if (hits.length === 0) return goal;
  const block = hits
    .map((h, i) => `[inspiration ${i + 1} — similarity ${h.similarity}] ${h.text}`)
    .join('\n');
  return `${goal}\n\nPrior solutions worth borrowing ideas from:\n${block}`;
}

/** Recall the top-k memory items most similar to `goal`, above threshold. */
export function inspire<T = unknown>(
  goal: string,
  memory: MemoryItem<T>[],
  opts: { k?: number; threshold?: number; sim?: (a: string, b: string) => number } = {},
): InspirationResult<T> {
  const k = Math.max(1, opts.k ?? 3);
  const threshold = opts.threshold ?? 0.25;
  const sim = opts.sim ?? jaccard;
  const scored = memory
    .map((m) => ({ m, similarity: sim(goal, m.text) }))
    .filter((s) => s.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k)
    .map((s) => ({ id: s.m.id, similarity: Math.round(s.similarity * 1000) / 1000, text: s.m.text, payload: s.m.payload }));
  return {
    hits: scored,
    promptHint: renderPromptHint(goal, scored),
  };
}
