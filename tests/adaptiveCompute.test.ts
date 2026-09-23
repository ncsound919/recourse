import { describe, it, expect } from 'vitest';
import { difficultyIndex, adaptiveBudget, budgetForInput, shouldSpend, spendDecision } from '../src/lib/adaptiveCompute';

describe('adaptiveCompute — compute-optimal budgets (arXiv:2408.03314)', () => {
  it('scores difficulty from the signals actually present, else neutral', () => {
    expect(difficultyIndex({})).toBe(0.5);
    expect(difficultyIndex({ uncertainty: 1 })).toBe(1);
    expect(difficultyIndex({ meanReward: 1 })).toBe(0);
    // mean of the present signals (both maximally hard here)
    expect(difficultyIndex({ uncertainty: 1, meanReward: 0 })).toBe(1);
    expect(difficultyIndex({ uncertainty: 0, meanReward: 1 })).toBe(0);
    // large prompts are capped as a difficulty proxy
    expect(difficultyIndex({ promptChars: 100_000 })).toBe(1);
  });

  it('gives the minimum budget to easy capabilities and the max to hard ones', () => {
    expect(adaptiveBudget(0, { min: 1, max: 3 })).toBe(1);
    expect(adaptiveBudget(1, { min: 1, max: 3 })).toBe(3);
    expect(adaptiveBudget(0.5, { min: 1, max: 3 })).toBe(2);
    // malformed options can never request fewer than one sample
    expect(adaptiveBudget(0.9, { min: 0, max: 0 })).toBe(1);
  });

  it('budgetForInput is the composition of both', () => {
    expect(budgetForInput({ meanReward: 1 })).toBe(1); // easy
    expect(budgetForInput({ uncertainty: 1 })).toBe(3); // hardest
  });

  it('cuts average samples vs a fixed max budget on a realistic easy/hard mix', () => {
    // Mostly well-understood capabilities + one hard one (the real distribution
    // of a mature registry). Fixed best-of-3 would spend 3 on every item.
    const workload = [
      { uncertainty: 0.1, meanReward: 0.9 },
      { uncertainty: 0.1, meanReward: 0.85 },
      { uncertainty: 0.2, meanReward: 0.8 },
      { uncertainty: 0.15, meanReward: 0.9 },
      { uncertainty: 0.9, meanReward: 0.2 }, // the hard one
    ];
    const adaptive = workload.reduce((n, i) => n + budgetForInput(i), 0);
    const fixed = workload.length * 3;
    expect(adaptive).toBeLessThan(fixed);
    expect(fixed - adaptive).toBeGreaterThanOrEqual(workload.length); // >=1 saved per item
  });

  it('only spends on novel/uncertain (or hard) candidates', () => {
    expect(shouldSpend({ novelty: 0.9, uncertainty: 0.1 })).toBe(true);
    expect(shouldSpend({ novelty: 0.05, uncertainty: 0.05 })).toBe(false);
    // a hard capability always earns a call even if currently non-novel
    expect(shouldSpend({ novelty: 0, uncertainty: 0, difficulty: 0.9 })).toBe(true);
    const r = spendDecision({ novelty: 0, uncertainty: 0 });
    expect(r.spend).toBe(false);
    expect(r.reason).toContain('redundant');
  });
});
