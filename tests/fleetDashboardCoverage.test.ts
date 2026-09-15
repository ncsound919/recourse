import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// fleetDashboard.ts derives everything from persisted-state readers
// (gamification / science+math conductors / agenda / goal ledger / issue
// tracker / keywire health). Those modules read the real repo's `data/` tree
// and live network health, so for a deterministic unit test of the dashboard
// rendering layer we mock the state *sources* and feed them representative
// state shapes. The dashboard's own markdown assembly is the real code under
// test; every assertion is against output it actually produced.
vi.mock('../src/lib/issueTracker', () => ({ computeIssueProgress: vi.fn() }));
vi.mock('../src/lib/breakthroughAgenda', () => ({ renderAndPersistAgenda: vi.fn() }));
vi.mock('../src/lib/gamification', () => ({
  computeGameProfile: vi.fn(),
  leaderboard: vi.fn(),
  BADGES: {
    first_blood: { id: 'first_blood', name: 'First Blood', description: 'First passing math attempt.', icon: '🩸' },
    first_finding: { id: 'first_finding', name: 'First Finding', description: 'First novel science finding recorded.', icon: '🔍' },
  },
}));
vi.mock('../src/lib/scienceConductor', () => ({
  recentCycles: vi.fn(),
  recentFindings: vi.fn(),
  getConductorStatus: vi.fn(),
}));
vi.mock('../src/lib/mathConductor', () => ({
  recentMathCycles: vi.fn(),
  recentMathFindings: vi.fn(),
  mathConductorStatus: vi.fn(),
}));
vi.mock('../src/lib/keywireBridge', () => ({ keywireHealth: vi.fn() }));
vi.mock('../src/lib/trendLedger', () => ({ verifyLedgerChain: vi.fn() }));
vi.mock('../src/lib/goalLedger', () => ({ getMathAttempts: vi.fn() }));
vi.mock('../src/lib/hardMathProblems', () => ({ HARD_MATH_PROBLEMS: [] }));

import { computeDashboardSections, renderDashboard } from '../src/lib/fleetDashboard';
import { computeIssueProgress } from '../src/lib/issueTracker';
import { renderAndPersistAgenda } from '../src/lib/breakthroughAgenda';
import { computeGameProfile, leaderboard } from '../src/lib/gamification';
import { recentCycles, getConductorStatus } from '../src/lib/scienceConductor';
import { recentMathCycles, mathConductorStatus } from '../src/lib/mathConductor';
import { keywireHealth } from '../src/lib/keywireBridge';
import { verifyLedgerChain } from '../src/lib/trendLedger';
import { getMathAttempts } from '../src/lib/goalLedger';
import { HARD_MATH_PROBLEMS } from '../src/lib/hardMathProblems';

// Mirrors the dashboard's own bar() cell format so row assertions are exact.
function barStr(value: number, target: number): string {
  if (target <= 0) return '—';
  const ratio = Math.max(0, Math.min(1, value / target));
  const filled = Math.round(ratio * 16);
  return '█'.repeat(filled) + '░'.repeat(16 - filled) + ` ${(ratio * 100).toFixed(0)}%`;
}

function makeProfile(over: Record<string, unknown> = {}) {
  return {
    totalXp: 340,
    level: { name: 'researcher', description: 'Consistently producing novel findings; rhythm established.', minXp: 100 },
    nextLevel: { name: 'scholar', description: 'Multi-engine synthesis', minXp: 500 },
    xpToNextLevel: 160,
    mathXp: 200,
    oncologyXp: 90,
    badges: [
      { id: 'first_blood', name: 'First Blood', description: 'First passing math attempt.', icon: '🩸' },
      { id: 'first_finding', name: 'First Finding', description: 'First novel science finding recorded.', icon: '🔍' },
    ],
    streak: 1,
    mathAttempts: 3,
    mathPasses: 1,
    mathTiers: { solvable: 1, bounded: 0, open: 0 },
    novelFindings: 2,
    axiomsBuilt: 0,
    bountiesDrafted: 0,
    computedAt: 0,
    ...over,
  };
}

function makeReport(status: string, domain: 'math' | 'oncology', over: Record<string, unknown> = {}) {
  return {
    status,
    daysRemaining: status === 'overdue' ? -3.2 : 12.4,
    reason: `${status} because of real measurements`,
    verification: { currentValue: 0.5, targetValue: 1, description: 'measured progress' },
    milestone: {
      id: `m-${domain}-${status}`,
      title: `MS ${domain} ${status}`,
      domain,
      class: status === 'overdue' || status === 'at_risk' ? 'math_bounds' : 'math_solved',
      refId: 'r',
      targetDate: '2026-12-01',
      priority: 'high',
      successCriterion: 'criterion',
      order: 0,
    },
    ...over,
  };
}

function makeIssue(issueId: string, status: string, over: Record<string, unknown> = {}) {
  return {
    issueId,
    title: `Issue ${issueId}`,
    summary: 'summary',
    status,
    gapCount: 1,
    hypothesisCount: 1,
    experimentsRun: 1,
    findingsCount: 2,
    trendInsights: 1,
    goalSignals: 1,
    progressScore: 0.5,
    lastUpdatedAt: 0,
    ...over,
  };
}

const fixtures = {
  profile: makeProfile(),
  milestones: [
    makeReport('met', 'math', { daysRemaining: 5.0, verification: { currentValue: 1, targetValue: 1, description: 'done' } }),
    makeReport('on_track', 'oncology', { daysRemaining: 30.25 }),
    makeReport('at_risk', 'math', { verification: { currentValue: 0.9, targetValue: 0, description: 'untargeted' } }),
    makeReport('overdue', 'oncology', { daysRemaining: -1.5 }),
    makeReport('corrupted', 'math', { milestone: { id: 'm-x', title: 'Ghost milestone', domain: 'math', targetDate: '2026-12-01' } }),
  ],
  issues: [
    makeIssue('onc-1', 'open', { progressScore: 0.4, gapCount: 3, findingsCount: 5, trendInsights: 2 }),
    makeIssue('onc-2', 'in_progress', { progressScore: 0.9 }),
    makeIssue('onc-3', 'stalled', { progressScore: 0.1 }),
    makeIssue('onc-4', 'weird-corrupt-status'),
  ],
  board: [
    { domain: 'math', xp: 200, solves: 1 },
    { domain: 'oncology', xp: 90, findings: 2 },
  ],
  problems: [
    { id: 'hm.a', title: 'Collatz bound', tier: 'solvable' },
    { id: 'hm.b', title: 'Prime gaps', tier: 'bounded' },
    { id: 'hm.c', title: 'Beal search', tier: 'open' },
  ],
  attempts: [
    { problemId: 'hm.a', passed: true, score: 0.95 },
    { problemId: 'hm.a', passed: false, score: 0.4 },
    { problemId: 'hm.b', passed: true, score: 0.6 },
  ],
  sciCycles: [
    { cycle: 7, startedAt: 1, problemId: 'onc-1', problemTitle: 'x', experimentMode: 'dose_response', novelCount: 1, enginesUsed: ['kg', 'loda'], skipped: ['model-gate'], findings: [] },
  ],
  mathCycles: [
    { cycle: 3, startedAt: 1, problemId: 'hm.a', problemTier: 'solvable', attemptPassed: true, attemptScore: 0.9, attemptGeneration: 4, enginesUsed: ['hard-math'], findings: [], novelCount: 0 },
  ],
};

const tmpRoots: string[] = [];
function freshReportsDir(): string {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-dash-'));
  tmpRoots.push(r);
  return r;
}
afterAll(() => {
  for (const r of tmpRoots.splice(0)) {
    try {
      fs.rmSync(r, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

beforeEach(() => {
  vi.mocked(renderAndPersistAgenda).mockReturnValue({ milestones: fixtures.milestones } as any);
  vi.mocked(computeIssueProgress).mockReturnValue(fixtures.issues as any);
  vi.mocked(computeGameProfile).mockReturnValue(fixtures.profile as any);
  vi.mocked(leaderboard).mockReturnValue(fixtures.board as any);
  vi.mocked(getConductorStatus).mockReturnValue({ running: false, cyclesRun: 0 } as any);
  vi.mocked(mathConductorStatus).mockReturnValue({ running: true, cyclesRun: 12 } as any);
  vi.mocked(recentCycles).mockReturnValue(fixtures.sciCycles as any);
  vi.mocked(recentMathCycles).mockReturnValue(fixtures.mathCycles as any);
  vi.mocked(getMathAttempts).mockReturnValue(fixtures.attempts as any);
  vi.mocked(verifyLedgerChain).mockReturnValue({ valid: true, length: 3 });
  vi.mocked(keywireHealth).mockResolvedValue({ ok: true } as any);
  // HARD_MATH_PROBLEMS is an array (not a mock fn); refill the shared reference
  // with the fixture problems so renderMathSection sees them.
  (HARD_MATH_PROBLEMS as unknown as unknown[]).splice(0, HARD_MATH_PROBLEMS.length, ...fixtures.problems);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.REPORTS_DIR;
});

describe('computeDashboardSections', () => {
  it('aggregates real sections from every state source', async () => {
    const sections = await computeDashboardSections();
    expect(sections.agenda).toBe(fixtures.milestones);
    expect(sections.issues).toBe(fixtures.issues);
    expect(sections.profile).toBe(fixtures.profile);
    expect(sections.mathConductor).toEqual({ running: true, cyclesRun: 12 });
    expect(sections.sciConductor).toEqual({ running: false, cyclesRun: 0 });
    expect(sections.trendLedgerValid).toBe(true);
    expect(sections.keywireOk).toBe(true);
  });

  it('reports a broken trend ledger chain honestly', async () => {
    vi.mocked(verifyLedgerChain).mockReturnValue({ valid: false, length: 3, brokenAt: 1 });
    const sections = await computeDashboardSections();
    expect(sections.trendLedgerValid).toBe(false);
  });

  it('reports keywire offline when the health check answers ok:false', async () => {
    vi.mocked(keywireHealth).mockResolvedValue({ ok: false } as any);
    const sections = await computeDashboardSections();
    expect(sections.keywireOk).toBe(false);
  });

  it('reports keywire offline when the health check throws (catch path)', async () => {
    vi.mocked(keywireHealth).mockRejectedValue(new Error('keywire down'));
    const sections = await computeDashboardSections();
    expect(sections.keywireOk).toBe(false);
  });
});

describe('renderDashboard — real markdown assembly + persistence', () => {
  it('renders identity, agenda, domain progress, cycles and honesty into a file', async () => {
    process.env.REPORTS_DIR = freshReportsDir();
    const { file, sections } = await renderDashboard();

    expect(sections.trendLedgerValid).toBe(true);
    expect(sections.keywireOk).toBe(true);
    expect(path.dirname(file)).toBe(process.env.REPORTS_DIR);
    expect(fs.existsSync(file)).toBe(true);

    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    // Header / identity
    expect(content).toContain('# Recourse Fleet Dashboard');
    expect(content).toContain('## Identity & Gamification');
    expect(content).toContain('**Level:** RESEARCHER — Consistently producing novel findings; rhythm established.');
    expect(content).toContain('**Total XP:** 340 (math: 200 + oncology: 90 + streak: 50)');
    expect(content).toContain('**Next level:** scholar (160 XP to go)');
    expect(content).toContain('**Streak:** 1 consecutive day(s) of novel findings');
    expect(content).toContain('**Badges earned (2/2):** 🩸 🔍');
    expect(content).toContain('| 🩸 | First Blood | First passing math attempt. |');
    expect(content).toContain('| math | 200 | 1 passing attempts |');
    expect(content).toContain('| oncology | 90 | 2 novel findings |');
    expect(content).toContain('**Science conductor:** STOPPED (0 cycles)');
    expect(content).toContain('**Math conductor:** RUNNING (12 cycles)');

    // Agenda summary counts + tables
    expect(content).toContain('- ✅ Met: **1**');
    expect(content).toContain('- 🟢 On track: **1**');
    expect(content).toContain('- 🟡 At risk: **1**');
    expect(content).toContain('- 🔴 Overdue: **1**');
    expect(content).toContain(`| ✅ | MS math met | 2026-12-01 | 5.0 | ${barStr(1, 1)} | met because of real measurements |`);
    expect(content).toContain(`| 🟡 | MS math at_risk | 2026-12-01 | 12.4 | ${barStr(0.9, 0)} | at_risk because of real measurements |`);
    // A corrupted status falls back to the "?" icon instead of crashing.
    expect(content).toContain('| ? | Ghost milestone | 2026-12-01 | 12.4 |');
    expect(content).toContain('| 🔴 | MS oncology overdue | 2026-12-01 | -1.5 |');

    // Oncology issues
    expect(content).toContain(`| \`onc-1\` | ⚪ open | ${barStr(0.4, 1)} | 3 | 5 | 2 |`);
    expect(content).toContain('| `onc-4` | ? weird-corrupt-status |');

    // Math problems
    expect(content).toContain('| Collatz bound | 🥇 solvable | 2 | 1 | 0.95 |');
    expect(content).toContain('| Prime gaps | 🔍 bounded | 1 | 1 | 0.60 |');
    expect(content).toContain('| Beal search | 🌌 open | 0 | 0 | 0.00 |');

    // Recent cycles
    expect(content).toContain('| 7 | onc-1 | dose_response | 1 | kg, loda | 1 |');
    expect(content).toContain('| 3 | hm.a | solvable | ✅ | 0.90 | 4 | hard-math |');

    // Trend + keywire honesty footer
    expect(content).toContain('**Trend ledger chain:** VALID');
    expect(content).toContain('**Keywire fleet:** online');
    expect(content).toContain('## Honesty Contract');
    expect(lines[lines.length - 1]).toBe('');
    expect(content).toContain('_Offline services and unmet criteria are reported as zero. We do not interpolate, we do not pad._');

    // Persisted daily + latest files
    const daily = path.basename(file);
    expect(daily).toMatch(/^fleet-\d{4}-\d{2}-\d{2}\.md$/);
    const latest = path.join(process.env.REPORTS_DIR, 'latest.md');
    expect(fs.existsSync(latest)).toBe(true);
    expect(fs.readFileSync(latest, 'utf-8')).toBe(content);
  });

  it('renders the max-level / no-badges state honestly', async () => {
    process.env.REPORTS_DIR = freshReportsDir();
    vi.mocked(computeGameProfile).mockReturnValue(
      makeProfile({
        totalXp: 12000,
        level: { name: 'luminary', description: 'Self-driving research', minXp: 10000 },
        nextLevel: null,
        xpToNextLevel: 0,
        badges: [],
      }) as any,
    );
    const { file } = await renderDashboard();
    const content = fs.readFileSync(file, 'utf-8');
    expect(content).toContain('**Next level:** — (max level reached)');
    expect(content).toContain('**Badges earned (0/2):** ');
  });

  it('renders the empty-cycle state honestly', async () => {
    process.env.REPORTS_DIR = freshReportsDir();
    vi.mocked(recentCycles).mockReturnValue([]);
    vi.mocked(recentMathCycles).mockReturnValue([]);
    const { file } = await renderDashboard();
    const content = fs.readFileSync(file, 'utf-8');
    expect(content).toContain('_No science cycles yet._');
    expect(content).toContain('_No math cycles yet._');
  });
});
