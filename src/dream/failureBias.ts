/**
 * failureBias.ts — bridges tiered failure memory into the dream mutator.
 *
 * Pure, self-contained, deterministic: given past episodes and a mutation
 * request, it (1) fingerprints the request, (2) retrieves similar past LOSSES
 * as avoid-guidance, and (3) builds a recordable episode from the outcome so
 * the caller can persist it. No IO here — the caller owns the store.
 *
 * Honest limits: guidance never blocks synthesis (the epsilon exploration
 * floor from failureMemory is preserved by construction — a heavily-failed
 * region still gets attempted, just with its failure history attached).
 * Gene-region down-weighting across a candidate set remains available via
 * rankByBias for call sites that select among existing genes.
 */

import type { ToolDomain } from './types';
import type { BiasOptions } from '../lib/memory/failureMemory';
import { geneBiasWeights } from '../lib/memory/failureMemory';
import type { Episode } from '../lib/memory/types';

/** Small stoplist so fingerprints carry signal tokens, not grammar. */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'make',
  'makes', 'made', 'use', 'used', 'using', 'will', 'shall', 'should',
  'must', 'can', 'are', 'was', 'were', 'has', 'have', 'had', 'our',
  'your', 'their', 'then', 'than', 'when', 'which', 'what', 'also',
]);

function sigTokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

/** Deterministic problem fingerprint for a mutation request. */
export function fingerprintForMutation(
  domain: ToolDomain,
  instructions: string,
  targetToolName?: string,
): string {
  const seen = new Set<string>();
  const sig: string[] = [];
  for (const t of sigTokens(instructions)) {
    if (seen.has(t)) continue;
    seen.add(t);
    sig.push(t);
    if (sig.length >= 10) break;
  }
  const base = targetToolName ? `${domain}/${targetToolName}` : domain;
  // When targetToolName is provided, we use it as the entire fingerprint base
  // and do NOT append instruction tokens, so the caller can identify the exact tool.
  if (targetToolName) {
    return `mutate/${base}`;
  }
  return sig.length > 0 ? `mutate/${base}/${sig.join('-')}` : `mutate/${base}`;
}

function stripFingerprintPrefix(fp: string): string {
  // Remove 'mutate/{domain}/' prefix for similarity comparison
  const idx = fp.indexOf('/', 8); // after 'mutate/'
  return idx >= 0 ? fp.slice(idx + 1) : fp;
}

export interface AvoidGuidanceOptions {
  /** Max avoid-lines returned. Default 5. */
  maxLines?: number;
  /** Minimum token-overlap similarity to count as a near-neighbor. Default 0.2. */
  minSimilarity?: number;
}

/**
 * Retrieve distinct failure summaries from episodes whose fingerprint is
 * similar to the current request. Only LOSSES count — wins and neutrals are
 * never presented as things to avoid. Sorted by similarity desc, then episode
 * id asc, so output is deterministic.
 */
export function avoidGuidance(
  episodes: Episode[],
  fingerprint: string,
  opts: AvoidGuidanceOptions = {},
): string[] {
  const maxLines = opts.maxLines ?? 5;
  const minSimilarity = opts.minSimilarity ?? 0.2;
  const targetTokens = new Set(sigTokens(stripFingerprintPrefix(fingerprint)));
  const ranked = episodes
    .filter((e) => e.outcome === 'loss')
    .map((e) => ({
      episode: e,
      similarity: jaccard(targetTokens, new Set(sigTokens(stripFingerprintPrefix(e.problemFingerprint)))),
    }))
    .filter((x) => x.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity || a.episode.id.localeCompare(b.episode.id));

  const lines: string[] = [];
  const seen = new Set<string>();
  for (const { episode } of ranked) {
    const line = episode.summary.trim().slice(0, 160);
    if (!line || seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
    if (lines.length >= maxLines) break;
  }
  return lines;
}

export interface MutationEpisodeInput {
  fingerprint: string;
  toolName: string;
  geneIds: string[];
  outcome: 'win' | 'loss' | 'neutral';
  score: number;
  summary: string;
}

/** Build the recordable episode for a mutation outcome (caller persists it). */
export function episodeFromMutation(input: MutationEpisodeInput): Omit<Episode, 'id' | 'timestamp'> {
  return {
    problemFingerprint: input.fingerprint,
    toolName: input.toolName,
    outcome: input.outcome,
    score: input.score,
    geneIds: [...input.geneIds],
    summary: input.summary.trim().slice(0, 500),
  };
}

/** Transparency lookup: current bias weight for one gene id (1 when unknown). */
export function biasWeightForGene(
  episodes: Episode[],
  geneId: string,
  opts: BiasOptions = {},
): number {
  return geneBiasWeights(episodes, [geneId], opts).get(geneId) ?? 1;
}
