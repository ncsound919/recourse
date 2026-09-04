import { describe, it, expect } from 'vitest';
import {
  estimateDifficulty,
  domainUncertainty,
  ProblemArchive,
  nextByCurriculum,
} from '../src/lib/problemArchive';
import type { RecourseProblem } from '../src/lib/problemArchive';

function problem(id: string, domain: string, title: string, difficultyHints: { requiredPrimitives?: number; acceptanceLines?: number; dataDims?: number; statement?: string } = {}): RecourseProblem {
  return {
    id,
    domain,
    title,
    statement: difficultyHints.statement ?? 'solve a small task with a verifier',
    acceptanceTest: `assert true;\n${'assert true;\n'.repeat(Math.max(0, (difficultyHints.acceptanceLines ?? 2) - 2))}`,
    hints: { requiredPrimitives: difficultyHints.requiredPrimitives ?? 1, acceptanceLines: difficultyHints.acceptanceLines, dataDims: difficultyHints.dataDims },
  };
}

describe('problem difficulty heuristic (phase 3)', () => {
  it('orders a simple problem below a hard one (heuristic, not measured)', () => {
    const easy = estimateDifficulty(problem('e', 'math', 'add', { requiredPrimitives: 1, acceptanceLines: 2, dataDims: 1 }));
    const hard = estimateDifficulty(problem('h', 'math', 'fft', { requiredPrimitives: 8, acceptanceLines: 30, dataDims: 4 }));
    expect(hard).toBeGreaterThan(easy);
    expect(easy).toBeGreaterThanOrEqual(0);
    expect(hard).toBeLessThanOrEqual(1);
  });
});

describe('problem archive', () => {
  it('adds, dedupes by near-identical title, and lists', () => {
    const a = new ProblemArchive();
    expect(a.add(problem('p1', 'coding', 'build a bloom filter over tokens')).added).toBe(true);
    expect(a.add(problem('p2', 'coding', 'build a bloom filter for tokens')).added).toBe(false);
    expect(a.add(problem('p3', 'math', 'solve a quadratic', { requiredPrimitives: 2 })).added).toBe(true);
    expect(a.size).toBe(2);
    expect(a.byDomain('math')).toHaveLength(1);
  });
});

describe('curriculum selection (phase 3 #12)', () => {
  it('domainUncertainty derives failure rate from real alpha/beta', () => {
    const u = domainUncertainty([
      { domain: 'math', alpha: 8, beta: 2, attempts: 10 },
      { domain: 'coding', alpha: 1, beta: 9, attempts: 10 },
    ]);
    expect(u.get('coding')).toBeCloseTo(0.9);
    expect(u.get('math')).toBeCloseTo(0.2);
  });

  it('picks the easiest unseen problem in the least-confident domain', () => {
    const arch = new ProblemArchive();
    arch.add(problem('m1', 'math', 'integrate', { requiredPrimitives: 6, statement: 'very long statement '.repeat(20) }));
    arch.add(problem('m2', 'math', 'derive', { requiredPrimitives: 1 }));
    arch.add(problem('c1', 'coding', 'heap', { requiredPrimitives: 4 }));

    // coding is the weak domain -> expect an easy coding problem, else math.
    const pick = nextByCurriculum(arch, [
      { domain: 'math', alpha: 8, beta: 2, attempts: 10 },
      { domain: 'coding', alpha: 1, beta: 9, attempts: 10 },
    ]);
    expect(pick.chosenDomain).toBe('coding');
    expect(pick.problem?.id).toBe('c1');
  });

  it('skips solved problems and falls through when none remain', () => {
    const arch = new ProblemArchive();
    arch.add(problem('a', 'coding', 'only', { requiredPrimitives: 2 }));
    const pick = nextByCurriculum(arch, [{ domain: 'coding', alpha: 5, beta: 5, attempts: 10 }], ['a']);
    expect(pick.problem).toBeNull();
  });
});
