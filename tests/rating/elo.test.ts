import { describe, it, expect } from 'vitest';
import { DEFAULT_ELO, computeStandings, expectedScore, updateRatings } from '../../src/lib/rating/elo';
import type { PairChoice, VariationDescriptor } from '../../src/lib/rating/types';

function variation(paramHash: string, source = 'test'): VariationDescriptor {
  return { paramHash, source, params: { h: paramHash }, createdAt: 0 };
}

function choice(seq: number, aHash: string, bHash: string, winner: 'A' | 'B', source = 'test'): PairChoice {
  return {
    pairId: `p${seq}`,
    source,
    aHash,
    bHash,
    winner,
    decidedAt: 0,
    seq,
    prevHash: '0'.repeat(64),
    hash: `h${seq}`,
  };
}

describe('elo math', () => {
  it('expected scores are complementary', () => {
    expect(expectedScore(1600, 1400) + expectedScore(1400, 1600)).toBeCloseTo(1, 10);
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5, 10);
  });

  it('update is zero-sum', () => {
    const [a, b] = updateRatings(1600, 1400, 1);
    expect(a + b).toBeCloseTo(3000, 10);
  });

  it('an underdog win gains more than a favourite win', () => {
    const favGain = updateRatings(1800, 1400, 1)[0] - 1800;
    const dogGain = updateRatings(1400, 1800, 1)[0] - 1400;
    expect(dogGain).toBeGreaterThan(favGain);
    expect(dogGain).toBeGreaterThan(0);
  });
});

describe('computeStandings', () => {
  it('ranks the winner above the loser and is order-independent in input', () => {
    const vars = [variation('a'), variation('b')];
    const standings = computeStandings(vars, [choice(0, 'a', 'b', 'A')]);
    expect(standings[0].paramHash).toBe('a');
    expect(standings[0].elo).toBeGreaterThan(DEFAULT_ELO);
    expect(standings[1].elo).toBeLessThan(DEFAULT_ELO);
    expect(standings[0].wins).toBe(1);
    expect(standings[1].losses).toBe(1);
    expect(standings[0].winRate).toBe(1);
  });

  it('ignores degenerate self-pairs', () => {
    const standings = computeStandings([variation('a')], [choice(0, 'a', 'a', 'A')]);
    expect(standings[0].elo).toBe(DEFAULT_ELO);
    expect(standings[0].matches).toBe(0);
  });

  it('filters by minMatches and source', () => {
    const vars = [variation('a'), variation('b'), variation('c', 'other')];
    const choices = [choice(0, 'a', 'b', 'A')];
    expect(computeStandings(vars, choices, { minMatches: 1 }).map((s) => s.paramHash).sort()).toEqual(['a', 'b']);
    expect(computeStandings(vars, choices, { source: 'other' }).map((s) => s.paramHash)).toEqual(['c']);
  });

  it('replays deterministically from the recorded ledger', () => {
    const vars = [variation('a'), variation('b'), variation('c')];
    const choices = [choice(0, 'a', 'b', 'A'), choice(1, 'b', 'c', 'B'), choice(2, 'a', 'c', 'A')];
    const first = computeStandings(vars, choices);
    const shuffled = computeStandings(vars, [choices[2], choices[0], choices[1]]);
    expect(first).toEqual(shuffled);
  });
});
