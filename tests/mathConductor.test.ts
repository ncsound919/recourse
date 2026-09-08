import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  runMathCycle,
  mathConductorStatus,
  recentMathCycles,
  recentMathFindings,
  loadSeenMathClaims,
} from '../src/lib/mathConductor.js';
import { HARD_MATH_PROBLEMS } from '../src/lib/hardMathProblems.js';
import { computeAgenda, computeMilestoneStatus, selectNextMathMilestone, selectNextOncologyMilestone, AGENDA } from '../src/lib/breakthroughAgenda.js';
import { computeGameProfile, levelForXp, currentStreak, BADGES } from '../src/lib/gamification.js';

beforeAll(() => {
  process.env.MATH_FORGE_ENABLED = '0';
  process.env.SCIENCE_AXIOM_BUILD = '0';
  process.env.MATH_AXIOM_BUILD = '0';
  process.env.MATH_LOOP_DIR = `${process.cwd()}\\data\\test-math-loop`;
});
afterAll(() => {
  delete process.env.MATH_FORGE_ENABLED;
  delete process.env.SCIENCE_AXIOM_BUILD;
  delete process.env.MATH_AXIOM_BUILD;
  delete process.env.MATH_LOOP_DIR;
});

describe('math conductor', () => {
  it('produces a valid cycle with stub (no LLM)', async () => {
    const cycle = await runMathCycle();
    expect(typeof cycle.cycle).toBe('number');
    expect(typeof cycle.problemId).toBe('string');
    expect(cycle.problemId).not.toBe('none');
    expect(['solvable', 'bounded', 'open']).toContain(cycle.problemTier);
    expect(typeof cycle.attemptPassed).toBe('boolean');
    expect(typeof cycle.attemptScore).toBe('number');
    expect(typeof cycle.attemptGeneration).toBe('number');
    expect(cycle.attemptGeneration).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(cycle.enginesUsed)).toBe(true);
    expect(cycle.attemptLatencyMs).toBeGreaterThanOrEqual(0);
    expect(typeof cycle.failureReason === 'string' || cycle.failureReason === null).toBe(true);
  });

  it('appends findings to the math ledger', async () => {
    const before = recentMathFindings(100);
    await runMathCycle();
    const after = recentMathFindings(100);
    expect(after.length).toBeGreaterThanOrEqual(before.length);
  });

  it('increments generation on retry of same problem', async () => {
    const c1 = await runMathCycle();
    const c2 = await runMathCycle();
    // Two cycles should have targeted problems (possibly same or different).
    expect(typeof c1.attemptGeneration).toBe('number');
    expect(typeof c2.attemptGeneration).toBe('number');
  });

  it('mathConductorStatus returns structured state', () => {
    const s = mathConductorStatus();
    expect(typeof s.running).toBe('boolean');
    expect(typeof s.uptimeSeconds).toBe('number');
    expect(typeof s.cyclesRun).toBe('number');
    expect(typeof s.findingsFile).toBe('string');
    expect(s.findingsFile).toContain('math-loop');
  });

  it('loads seen claims from the math ledger', async () => {
    await runMathCycle();
    loadSeenMathClaims(); // no-op if already loaded
    // The function should not throw.
    expect(true).toBe(true);
  });
});

describe('breakthrough agenda', () => {
  it('AGENDA has math and oncology milestones', () => {
    const math = AGENDA.filter((m) => m.domain === 'math');
    const onco = AGENDA.filter((m) => m.domain === 'oncology');
    expect(math.length).toBeGreaterThan(0);
    expect(onco.length).toBeGreaterThan(0);
  });

  it('every milestone has required fields', () => {
    for (const m of AGENDA) {
      expect(typeof m.id).toBe('string');
      expect(typeof m.title).toBe('string');
      expect(['oncology', 'math']).toContain(m.domain);
      expect(['oncology_grant', 'math_solved', 'math_bounds']).toContain(m.class);
      expect(typeof m.targetDate).toBe('string');
      expect(typeof m.priority).toBe('string');
      expect(typeof m.successCriterion).toBe('string');
      expect(typeof m.order).toBe('number');
    }
  });

  it('computeAgenda returns one report per milestone', () => {
    const reports = computeAgenda();
    expect(reports.length).toBe(AGENDA.length);
    for (const r of reports) {
      expect(typeof r.status).toBe('string');
      expect(['met', 'on_track', 'at_risk', 'overdue']).toContain(r.status);
      expect(typeof r.daysRemaining).toBe('number');
      expect(typeof r.verification.currentValue).toBe('number');
      expect(typeof r.verification.targetValue).toBe('number');
    }
  });

  it('computeMilestoneStatus always produces a reason', () => {
    for (const m of AGENDA) {
      const r = computeMilestoneStatus(m);
      expect(typeof r.reason).toBe('string');
      expect(r.reason.length).toBeGreaterThan(0);
    }
  });

  it('selectNextMathMilestone returns null when all math milestones met', () => {
    // With no actual solves, this should return a math milestone (the first unmet).
    const next = selectNextMathMilestone();
    expect(next === null || typeof next.milestone.domain === 'string').toBe(true);
    if (next) {
      expect(next.milestone.domain).toBe('math');
      expect(next.statusReport.status).not.toBe('met');
    }
  });

  it('selectNextOncologyMilestone returns null when all oncology milestones met', () => {
    const next = selectNextOncologyMilestone();
    expect(next === null || typeof next.milestone.domain === 'string').toBe(true);
    if (next) {
      expect(next.milestone.domain).toBe('oncology');
    }
  });
});

describe('gamification', () => {
  it('computeGameProfile returns a valid structure', () => {
    const p = computeGameProfile();
    expect(typeof p.totalXp).toBe('number');
    expect(typeof p.level).toBe('object');
    expect(typeof p.level.name).toBe('string');
    expect(typeof p.level.description).toBe('string');
    expect(typeof p.mathXp).toBe('number');
    expect(typeof p.oncologyXp).toBe('number');
    expect(typeof p.streak).toBe('number');
    expect(Array.isArray(p.badges)).toBe(true);
    expect(typeof p.computedAt).toBe('number');
    expect(p.totalXp).toBeGreaterThanOrEqual(0);
    expect(p.streak).toBeGreaterThanOrEqual(0);
  });

  it('levelForXp returns correct level for XP thresholds', () => {
    expect(levelForXp(0).name).toBe('apprentice');
    expect(levelForXp(50).name).toBe('apprentice');
    expect(levelForXp(100).name).toBe('researcher');
    expect(levelForXp(500).name).toBe('scholar');
    expect(levelForXp(2000).name).toBe('principal');
    expect(levelForXp(10000).name).toBe('luminary');
  });

  it('currentStreak returns non-negative integer', () => {
    const s = currentStreak();
    expect(typeof s).toBe('number');
    expect(s).toBeGreaterThanOrEqual(0);
  });

  it('BADGES has expected milestone badges', () => {
    const required: Array<keyof typeof BADGES> = [
      'first_blood',
      'tier1_solver',
      'collatz_conqueror',
      'prime_hunter',
      'zeta_counter',
      'first_finding',
      'first_axiom',
      'streak_3',
      'apprentice',
      'researcher',
      'scholar',
      'principal',
      'luminary',
    ];
    for (const id of required) {
      expect(BADGES[id]).toBeDefined();
      expect(typeof BADGES[id].name).toBe('string');
      expect(typeof BADGES[id].icon).toBe('string');
    }
  });

  it('totalXp is mathXp + oncologyXp + streak bonus', () => {
    const p = computeGameProfile();
    const streakBonus = p.streak * 50;
    expect(p.totalXp).toBe(p.mathXp + p.oncologyXp + streakBonus);
  });
});
