import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordMathAttempt,
  recordBiotechClaim,
  getMathAttempts,
  getBiotechClaims,
  getGoalProgress,
  clearGoalLedger,
} from '../src/lib/goalLedger';
import { HARD_MATH_PROBLEMS, seedHardMathArchive } from '../src/lib/hardMathProblems';

describe('hard math problems bank', () => {
  it('has real problems across all three tiers', () => {
    expect(HARD_MATH_PROBLEMS.length).toBeGreaterThan(5);
    const tiers = new Set(HARD_MATH_PROBLEMS.map((p) => p.tier));
    expect(tiers.has('solvable')).toBe(true);
    expect(tiers.has('bounded')).toBe(true);
    expect(tiers.has('open')).toBe(true);
  });

  it('every solvable/bounded problem has a real acceptance test', () => {
    for (const p of HARD_MATH_PROBLEMS) {
      if (p.tier === 'open') continue;
      expect(p.acceptanceTest.length, `no suite for ${p.id}`).toBeGreaterThan(10);
      expect(p.acceptanceTest, `suite for ${p.id} lacks assertions`).toContain('assert');
    }
  });

  it('seedHardMathArchive adds problems to an archive', () => {
    const added: any[] = [];
    const archive = {
      add: (p: any) => {
        if (added.some((x) => x.id === p.id)) return { added: false, duplicateOf: p.id };
        added.push(p);
        return { added: true, duplicateOf: null };
      },
    };
    const res = seedHardMathArchive(archive);
    expect(res.added).toBe(HARD_MATH_PROBLEMS.length);
    expect(res.duplicates).toBe(0);
  });
});

describe('goal ledger', () => {
  beforeEach(() => clearGoalLedger());

  it('records math attempts with pass/fail', () => {
    const passed = recordMathAttempt({
      problemId: 'hm.collatz.total_stopping',
      problemTier: 'solvable',
      toolName: 'collatzTotalStopping',
      passed: true,
      score: 1,
      generation: 5,
      latMs: 120,
    });
    const failed = recordMathAttempt({
      problemId: 'hm.riemann.critical_line',
      problemTier: 'open',
      toolName: 'riemannSearch',
      passed: false,
      score: 0,
      failureReason: 'no counter-example found',
      generation: 6,
      latMs: 90,
    });
    expect(passed.id).toMatch(/^math_/);
    expect(failed.passed).toBe(false);
    const attempts = getMathAttempts();
    expect(attempts.length).toBe(2);
    expect(getGoalProgress().math.solved).toBe(1);
    expect(getGoalProgress().math.total).toBe(2);
  });

  it('records biotech claims', () => {
    recordBiotechClaim({
      assetName: 'sotorasib',
      leg: 'debulking',
      evidenceTier: 5,
      passed: true,
      score: 1,
      source: 'NEJM 2021',
      summary: 'pass',
      generation: 1,
    });
    const claims = getBiotechClaims();
    expect(claims.length).toBe(1);
    expect(getGoalProgress().biotech.passed).toBe(1);
    expect(getGoalProgress().biotech.total).toBe(1);
    expect(getGoalProgress().biotech.rate).toBe(1);
  });

  it('groups math progress by tier', () => {
    recordMathAttempt({ problemId: 'a', problemTier: 'solvable', toolName: 'a', passed: true, score: 1, generation: 1, latMs: 1 });
    recordMathAttempt({ problemId: 'b', problemTier: 'open', toolName: 'b', passed: false, score: 0, generation: 2, latMs: 1 });
    const byTier = getGoalProgress().math.byTier;
    expect(byTier.solvable.solved).toBe(1);
    expect(byTier.open.total).toBe(1);
  });
});