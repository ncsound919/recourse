import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// gamification.ts is a pure derivation over four persisted-state readers.
// Mock those readers so every branch (empty, fail, pass, each finding kind,
// streaks, badge thresholds, levels) is deterministic.
const h = vi.hoisted(() => ({
  recentCycles: vi.fn(),
  recentFindings: vi.fn(),
  recentMathCycles: vi.fn(),
  recentMathFindings: vi.fn(),
  getMathAttempts: vi.fn(),
  getGoalProgress: vi.fn(),
}));

vi.mock('../src/lib/scienceConductor.js', () => ({
  recentCycles: h.recentCycles,
  recentFindings: h.recentFindings,
}));
vi.mock('../src/lib/mathConductor.js', () => ({
  recentMathCycles: h.recentMathCycles,
  recentMathFindings: h.recentMathFindings,
}));
vi.mock('../src/lib/goalLedger.js', () => ({
  getMathAttempts: h.getMathAttempts,
  getGoalProgress: h.getGoalProgress,
}));

import {
  XP_RATES,
  LEVELS,
  BADGES,
  levelForXp,
  nextLevel,
  currentStreak,
  computeGameProfile,
  leaderboard,
  persistGameProfile,
  loadGameProfile,
} from '../src/lib/gamification.js';

const pass = (problemId: string, problemTier: string) => ({
  problemId,
  problemTier,
  passed: true,
});
const fail = (problemId: string, problemTier: string) => ({
  problemId,
  problemTier,
  passed: false,
});

// Cycle with no findings (zero XP) but a novelty flag so it counts for streaks.
const novelCycle = (startedAt: number) => ({
  startedAt,
  novelCount: 1,
  findings: [] as unknown[],
  axiomBuild: { built: false },
});
const silentCycle = (startedAt: number) => ({
  startedAt,
  novelCount: 0,
  findings: [] as unknown[],
  axiomBuild: { built: false },
});
const scienceCycle = (findings: Array<{ kind: string }>, axiomBuilt = false, startedAt = 1) => ({
  startedAt,
  novelCount: findings.length,
  findings,
  axiomBuild: { built: axiomBuilt },
});
const mathCycle = (findings: Array<{ kind: string; passed?: boolean }>, axiomBuilt = false, startedAt = 1) => ({
  startedAt,
  novelCount: findings.length,
  findings,
  axiomBuild: { built: axiomBuilt },
});

beforeEach(() => {
  h.recentCycles.mockReset();
  h.recentFindings.mockReset();
  h.recentMathCycles.mockReset();
  h.recentMathFindings.mockReset();
  h.getMathAttempts.mockReset();
  h.getGoalProgress.mockReset();
  h.recentCycles.mockReturnValue([]);
  h.recentFindings.mockReturnValue([]);
  h.recentMathCycles.mockReturnValue([]);
  h.recentMathFindings.mockReturnValue([]);
  h.getMathAttempts.mockReturnValue([]);
  h.getGoalProgress.mockReturnValue({});
});

describe('const tables', () => {
  it('XP_RATES are the documented values', () => {
    expect(XP_RATES.mathAttemptPass).toBe(100);
    expect(XP_RATES.mathAttemptFail).toBe(5);
    expect(XP_RATES.mathAxiomBuilt).toBe(50);
    expect(XP_RATES.novelFindingScience).toBe(10);
    expect(XP_RATES.novelFindingEvidence).toBe(25);
    expect(XP_RATES.axiomBuiltScience).toBe(30);
    expect(XP_RATES.streakDay).toBe(50);
  });

  it('every badge has an id matching its key', () => {
    for (const [key, badge] of Object.entries(BADGES)) {
      expect(badge.id).toBe(key);
    }
  });
});

describe('levelForXp', () => {
  it('maps XP to the correct level at boundaries', () => {
    expect(levelForXp(-100).name).toBe('apprentice');
    expect(levelForXp(0).name).toBe('apprentice');
    expect(levelForXp(99).name).toBe('apprentice');
    expect(levelForXp(100).name).toBe('researcher');
    expect(levelForXp(499).name).toBe('researcher');
    expect(levelForXp(500).name).toBe('scholar');
    expect(levelForXp(1999).name).toBe('scholar');
    expect(levelForXp(2000).name).toBe('principal');
    expect(levelForXp(9999).name).toBe('principal');
    expect(levelForXp(10000).name).toBe('luminary');
    expect(levelForXp(1_000_000).name).toBe('luminary');
  });

  it('LEVELS are ordered ascending by minXp', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].minXp).toBeGreaterThan(LEVELS[i - 1].minXp);
    }
  });
});

describe('nextLevel', () => {
  it('returns the next threshold or null at the cap', () => {
    expect(nextLevel(0)?.name).toBe('researcher');
    expect(nextLevel(100)?.name).toBe('scholar');
    expect(nextLevel(10000)).toBeNull();
    expect(nextLevel(50000)).toBeNull();
  });
});

describe('currentStreak', () => {
  it('returns 0 with no events', () => {
    expect(currentStreak()).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    const day = 86_400_000;
    const now = Date.now();
    h.recentCycles.mockReturnValue([novelCycle(now), novelCycle(now - day), novelCycle(now - 2 * day)]);
    expect(currentStreak()).toBe(3);
  });

  it('breaks on a past gap but tolerates today being in progress', () => {
    const day = 86_400_000;
    const now = Date.now();
    // Yesterday but not today: today is "in progress", so count yesterday.
    h.recentCycles.mockReturnValue([novelCycle(now - day)]);
    expect(currentStreak()).toBe(1);
    // A gap two days back ends the streak at one.
    h.recentCycles.mockReturnValue([novelCycle(now - 2 * day)]);
    expect(currentStreak()).toBe(0);
  });

  it('counts math cycles as qualifying events too', () => {
    const day = 86_400_000;
    const now = Date.now();
    h.recentMathCycles.mockReturnValue([novelCycle(now), novelCycle(now - day)]);
    expect(currentStreak()).toBe(2);
  });

  it('ignores cycles with novelCount 0', () => {
    h.recentCycles.mockReturnValue([silentCycle(Date.now())]);
    expect(currentStreak()).toBe(0);
  });
});

describe('computeGameProfile — math XP', () => {
  it('reports an empty profile with only the always-on apprentice badge', () => {
    const p = computeGameProfile();
    expect(p.totalXp).toBe(0);
    expect(p.level.name).toBe('apprentice');
    expect(p.nextLevel?.name).toBe('researcher');
    expect(p.xpToNextLevel).toBe(100);
    expect(p.mathXp).toBe(0);
    expect(p.oncologyXp).toBe(0);
    expect(p.badges.map((b) => b.id)).toEqual(['apprentice']);
    expect(p.mathAttempts).toBe(0);
    expect(p.mathPasses).toBe(0);
    expect(p.mathTiers).toEqual({ solvable: 0, bounded: 0, open: 0 });
    expect(typeof p.computedAt).toBe('number');
  });

  it('awards pass/fail XP from the math ledger and counts tiers', () => {
    h.getMathAttempts.mockReturnValue([pass('a', 'solvable'), fail('b', 'open'), pass('c', 'solvable')]);
    const p = computeGameProfile();
    expect(p.mathAttempts).toBe(3);
    expect(p.mathPasses).toBe(2);
    expect(p.mathXp).toBe(100 + 5 + 100);
    expect(p.mathTiers).toEqual({ solvable: 2, bounded: 0, open: 0 });
    expect(p.badges.map((b) => b.id)).toContain('first_blood');
    expect(p.badges.map((b) => b.id)).toContain('tier1_solver');
  });

  it('maps math findings (attempt pass/fail, axiom) when the ledger is empty', () => {
    h.recentMathFindings.mockReturnValue([
      { kind: 'math_attempt', passed: true },
      { kind: 'math_attempt', passed: false },
      { kind: 'axiom_built' },
    ]);
    const p = computeGameProfile();
    expect(p.mathXp).toBe(100 + 5 + 50);
  });

  it('takes the max of ledger XP and findings XP (never double-counts)', () => {
    h.getMathAttempts.mockReturnValue([pass('a', 'solvable')]);
    h.recentMathFindings.mockReturnValue([{ kind: 'math_attempt', passed: true }]);
    expect(computeGameProfile().mathXp).toBe(100);
  });

  it('awards the named hard-problem badges for specific passed ids', () => {
    h.getMathAttempts.mockReturnValue([
      pass('hm.collatz.total_stopping', 'bounded'),
      pass('hm.prime.gaps.upto', 'bounded'),
      pass('hm.zeta.zeros.in_critical_strip', 'open'),
      pass('hm.digit.factorial_chain', 'bounded'),
      pass('hm.proth.primality', 'bounded'),
      pass('hm.goldbach.strong.upto', 'open'),
      pass('hm.collatz.no_exception', 'open'),
      pass('hm.riemann.critical_line', 'open'),
      pass('hm.beal.upto', 'open'),
    ]);
    const ids = computeGameProfile().badges.map((b) => b.id);
    for (const id of [
      'collatz_conqueror',
      'prime_hunter',
      'zeta_counter',
      'rhymer',
      'proth_finder',
      'goldbach_verifier',
      'collatz_verifier',
      'riemann_explorer',
      'beal_explorer',
    ]) {
      expect(ids).toContain(id);
    }
  });
});

describe('computeGameProfile — science XP + counters', () => {
  it('maps every known finding kind to the right XP rate', () => {
    const cases: Array<[string, number]> = [
      ['dose_response', XP_RATES.novelFindingScience],
      ['lod_comparison', XP_RATES.novelFindingScience],
      ['bounty_draft', XP_RATES.novelFindingScience],
      ['kg_bridge', XP_RATES.novelFindingScience],
      ['dedup', XP_RATES.novelFindingScience],
      ['evidence_binding', XP_RATES.novelFindingEvidence],
      ['gene_lookup', XP_RATES.novelFindingEvidence],
      ['translation_mapping', XP_RATES.novelFindingEvidence],
      ['translation_metric', XP_RATES.novelFindingEvidence],
    ];
    for (const [kind, expected] of cases) {
      h.recentCycles.mockReturnValue([scienceCycle([{ kind }])]);
      expect(computeGameProfile().oncologyXp).toBe(expected);
    }
    // Unknown kinds contribute nothing.
    h.recentCycles.mockReturnValue([scienceCycle([{ kind: 'niche_classification' }])]);
    expect(computeGameProfile().oncologyXp).toBe(0);
  });

  it('adds axiom-built science XP and counts axioms/bounties', () => {
    h.recentCycles.mockReturnValue([
      scienceCycle([{ kind: 'bounty_draft' }], true),
      scienceCycle([{ kind: 'dose_response' }], false),
    ]);
    const p = computeGameProfile();
    expect(p.oncologyXp).toBe(XP_RATES.novelFindingScience + XP_RATES.axiomBuiltScience + XP_RATES.novelFindingScience);
    expect(p.axiomsBuilt).toBe(1);
    expect(p.bountiesDrafted).toBe(1);
    expect(p.novelFindings).toBe(2);
  });

  it('counts axioms from math cycles as well', () => {
    h.recentMathCycles.mockReturnValue([mathCycle([], true), mathCycle([], false)]);
    expect(computeGameProfile().axiomsBuilt).toBe(1);
  });
});

describe('computeGameProfile — levels, streak bonus, badges', () => {
  it('adds a streak bonus of 50 per day and the streak badges', () => {
    const day = 86_400_000;
    const now = Date.now();
    h.recentCycles.mockReturnValue([novelCycle(now), novelCycle(now - day), novelCycle(now - 2 * day)]);
    const p = computeGameProfile();
    expect(p.streak).toBe(3);
    // Three novelty cycles each carry no findings, so only the streak XP.
    expect(p.totalXp).toBe(3 * XP_RATES.streakDay);
    const ids = p.badges.map((b) => b.id);
    expect(ids).toContain('streak_3');
    expect(ids).not.toContain('streak_7');
  });

  it('reaches scholar and awards the researcher/scholar badges', () => {
    // 20 evidence findings * 25 = 500 XP.
    const findings = Array.from({ length: 20 }, () => ({ kind: 'evidence_binding' }));
    h.recentCycles.mockReturnValue([scienceCycle(findings)]);
    const p = computeGameProfile();
    expect(p.oncologyXp).toBe(500);
    expect(p.level.name).toBe('scholar');
    const ids = p.badges.map((b) => b.id);
    expect(ids).toContain('researcher');
    expect(ids).toContain('scholar');
    expect(ids).not.toContain('principal');
  });

  it('reaches luminary and awards all level badges', () => {
    // 420 evidence findings * 25 = 10,500 XP.
    const findings = Array.from({ length: 420 }, () => ({ kind: 'evidence_binding' }));
    h.recentCycles.mockReturnValue([scienceCycle(findings)]);
    const p = computeGameProfile();
    expect(p.level.name).toBe('luminary');
    expect(p.nextLevel).toBeNull();
    expect(p.xpToNextLevel).toBe(0);
    const ids = p.badges.map((b) => b.id);
    for (const id of ['apprentice', 'researcher', 'scholar', 'principal', 'luminary']) {
      expect(ids).toContain(id);
    }
  });

  it('awards first_finding / first_axiom / first_bounty once', () => {
    h.recentCycles.mockReturnValue([scienceCycle([{ kind: 'bounty_draft' }], true)]);
    const p = computeGameProfile();
    const ids = p.badges.map((b) => b.id);
    expect(ids).toContain('first_finding');
    expect(ids).toContain('first_axiom');
    expect(ids).toContain('first_bounty');
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('leaderboard', () => {
  it('puts math first when math XP dominates', () => {
    h.getMathAttempts.mockReturnValue([pass('a', 'solvable')]);
    const board = leaderboard();
    expect(board[0].domain).toBe('math');
    expect(board[0].solves).toBe(1);
    expect(board.find((b) => b.domain === 'oncology')?.findings).toBe(0);
  });

  it('puts oncology first when science XP dominates', () => {
    const findings = Array.from({ length: 20 }, () => ({ kind: 'evidence_binding' }));
    h.recentCycles.mockReturnValue([scienceCycle(findings)]);
    const board = leaderboard();
    expect(board[0].domain).toBe('oncology');
    expect(board[0].xp).toBe(500);
  });
});

describe('persistence', () => {
  const gameFile = path.join(process.cwd(), 'data', 'agenda', 'game-profile.json');
  const original = fs.existsSync(gameFile) ? fs.readFileSync(gameFile, 'utf-8') : null;

  afterAll(() => {
    // Restore the operator's previous profile (or remove the test artifact).
    if (original === null) {
      fs.rmSync(gameFile, { force: true });
    } else {
      fs.writeFileSync(gameFile, original, 'utf-8');
    }
  });

  it('round-trips a computed profile through disk', () => {
    h.getMathAttempts.mockReturnValue([pass('a', 'solvable')]);
    const written = persistGameProfile();
    expect(fs.existsSync(gameFile)).toBe(true);
    const loaded = loadGameProfile();
    expect(loaded).not.toBeNull();
    expect(loaded?.totalXp).toBe(written.totalXp);
    expect(loaded?.level.name).toBe(written.level.name);
    expect(loaded?.mathPasses).toBe(1);
  });

  it('returns null on corrupt JSON rather than throwing', () => {
    fs.mkdirSync(path.dirname(gameFile), { recursive: true });
    fs.writeFileSync(gameFile, '{ this is not json', 'utf-8');
    expect(loadGameProfile()).toBeNull();
  });

  it('returns null when the file is absent', () => {
    fs.rmSync(gameFile, { force: true });
    expect(loadGameProfile()).toBeNull();
  });
});
