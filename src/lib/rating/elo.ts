/**
 * Elo engine — deterministic pairwise ranking for human A/B choices.
 *
 * Honesty note: Elo is a *relative* ranking derived only from recorded choices.
 * It says nothing about absolute quality; a variation can top the table simply
 * by beating weak opponents. The `matches` count is always returned so a caller
 * never mistakes a 3-game lead for a settled result.
 */

import type { PairChoice, Standing, VariationDescriptor } from './types.js';

export const DEFAULT_ELO = 1500;
export const DEFAULT_K = 32;

/** Probability that A beats B given their ratings. */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Zero-sum Elo update for a single game. `scoreA` is 1 (A won), 0 (B won) or
 * 0.5 (draw). Returns the new [a, b] ratings.
 */
export function updateRatings(
  ratingA: number,
  ratingB: number,
  scoreA: number,
  k: number = DEFAULT_K,
): [number, number] {
  const delta = k * (scoreA - expectedScore(ratingA, ratingB));
  return [ratingA + delta, ratingB - delta];
}

export interface StandingsOptions {
  /** Restrict to one source. */
  source?: string;
  /** Drop variations with fewer than this many recorded matches. */
  minMatches?: number;
}

/**
 * Replay every recorded choice in ledger order and recompute standings. This is
 * the single source of truth: standings are never stored, only derived, so a
 * tampered ledger cannot hide a rating change.
 */
export function computeStandings(
  variations: VariationDescriptor[],
  choices: PairChoice[],
  opts: StandingsOptions = {},
): Standing[] {
  const byHash = new Map<string, VariationDescriptor>();
  for (const v of variations) byHash.set(v.paramHash, v);

  const ratings = new Map<string, number>();
  const matches = new Map<string, number>();
  const wins = new Map<string, number>();
  const losses = new Map<string, number>();

  const ensure = (hash: string): number => {
    if (!ratings.has(hash)) {
      ratings.set(hash, DEFAULT_ELO);
      matches.set(hash, 0);
      wins.set(hash, 0);
      losses.set(hash, 0);
    }
    return ratings.get(hash)!;
  };

  const ordered = [...choices].sort((a, b) => a.seq - b.seq);
  for (const c of ordered) {
    if (c.aHash === c.bHash) continue; // degenerate self-pair never moves Elo
    const ra = ensure(c.aHash);
    const rb = ensure(c.bHash);
    const scoreA = c.winner === 'A' ? 1 : 0;
    const [na, nb] = updateRatings(ra, rb, scoreA);
    ratings.set(c.aHash, na);
    ratings.set(c.bHash, nb);
    matches.set(c.aHash, (matches.get(c.aHash) ?? 0) + 1);
    matches.set(c.bHash, (matches.get(c.bHash) ?? 0) + 1);
    if (c.winner === 'A') {
      wins.set(c.aHash, (wins.get(c.aHash) ?? 0) + 1);
      losses.set(c.bHash, (losses.get(c.bHash) ?? 0) + 1);
    } else {
      wins.set(c.bHash, (wins.get(c.bHash) ?? 0) + 1);
      losses.set(c.aHash, (losses.get(c.aHash) ?? 0) + 1);
    }
  }

  const minMatches = opts.minMatches ?? 0;
  const out: Standing[] = [];
  for (const hash of new Set<string>([...byHash.keys(), ...ratings.keys()])) {
    const m = matches.get(hash) ?? 0;
    if (m < minMatches) continue;
    const v = byHash.get(hash);
    if (opts.source && v?.source !== opts.source) continue;
    const w = wins.get(hash) ?? 0;
    out.push({
      paramHash: hash,
      source: v?.source ?? 'unknown',
      label: v?.label,
      elo: ratings.get(hash) ?? DEFAULT_ELO,
      matches: m,
      wins: w,
      losses: losses.get(hash) ?? 0,
      winRate: m ? w / m : 0,
    });
  }

  out.sort((a, b) => b.elo - a.elo || b.matches - a.matches || a.paramHash.localeCompare(b.paramHash));
  return out;
}
