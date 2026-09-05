import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

import {
  PRState,
  type BusinessScorecardT,
  type GitHubClient,
  type PRStateT,
  type UpgradeProposalT,
} from '../src/autopilot/loopTypes';
import { BusinessProfile, RepoBinding, type BusinessProfileT } from '../src/autopilot/businessProfile';
import type { AuditAdapter } from '../src/autopilot/auditRunner';
import { projectScorecard, saveScorecard } from '../src/autopilot/scorecard';
import { analyzeGaps } from '../src/autopilot/gapAnalyzer';
import { runGate, type GateExecutors } from '../src/autopilot/preMergeGate';
import {
  checkAndMerge,
  computeVetoDeadline,
  isInFlight,
  isTerminal,
  loadOpenPrStates,
} from '../src/autopilot/vetoScheduler';
import { resumeAfterVeto, runLoop } from '../src/autopilot/loopStateMachine';
import {
  isGapQuarantined,
  loadLedger,
  updateGeneFitness,
  DEFAULT_QUARANTINE_THRESHOLD_POINTS,
} from '../src/autopilot/fitnessLoop';

// ----------------------------------------------------------------------------
// Shared fixtures
// ----------------------------------------------------------------------------

const tmpRoots: string[] = [];
function makeTmpDir(label = 'autofix-'): string {
  const dir = fs.mkdtempSync(path.join(tmpdir(), label));
  tmpRoots.push(dir);
  return dir;
}

afterEach(() => {
  for (const root of tmpRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function makeProfile(repoPath: string, gaps: string[] = []): BusinessProfileT {
  return BusinessProfile.parse({
    business: { name: 'TestBiz', tagline: 'Tagline', industry: 'Test', website: '', stage: 'idea' },
    customer: {
      icp: 'Test ICP',
      segments: [{ name: 'Seg', pain: 'Pain' }],
      buyingTrigger: 'Trigger',
      topObjections: ['Obj'],
    },
    offering: {
      summary: 'Summary',
      pricing: '$0',
      model: 'free',
      differentiators: ['D1', 'D2', 'D3'],
    },
    gaps,
    repo: RepoBinding.parse({ localPath: repoPath, autoMergeEnabled: true }),
  });
}

function graderAdapter(scores: { sec: number; qual: number; market: number; comp: number }): AuditAdapter {
  return async () => ({
    included: true,
    scoreBasis: 'deterministic fixture',
    payload: {
      security: { score: scores.sec },
      quality: { score: scores.qual, testScore: scores.qual, readmeCompleteness: scores.qual },
      market: { score: scores.market },
      compliance: { score: scores.comp },
      valuation: { estimatedValue: 1_000 },
    },
  });
}

const HIGH_AUDIT = graderAdapter({ sec: 90, qual: 90, market: 80, comp: 80 });
const LOW_AUDIT = graderAdapter({ sec: 10, qual: 10, market: 10, comp: 10 });

function makeScorecard(overallScore: number, auditedAt = '2020-01-01T00:00:00.000Z'): BusinessScorecardT {
  return {
    businessSlug: 'testbiz',
    auditedAt,
    auditorsUsed: ['grader'],
    auditorsExcluded: [],
    codeQuality: 50,
    securityPosture: 50,
    testCoverage: 50,
    documentationCompleteness: 50,
    marketSignals: 50,
    complianceMaturity: 50,
    valuationEstimate: 0,
    profileGapCoverage: 50,
    webPresence: 50,
    overallScore,
    gradeCategory: 'C',
    findingsCount: 0,
    criticalFindings: 0,
    highFindings: 0,
  };
}

function makePrState(overrides: Partial<PRStateT> = {}): PRStateT {
  return PRState.parse({
    prNumber: 42,
    owner: 'acme',
    repo: 'widget',
    branch: 'recourse/upgrade-1',
    proposalId: 'upgrade-gap-1-1',
    gapId: 'gap-1',
    openedAt: '2026-09-04T00:00:00.000Z',
    vetoDeadline: '2026-09-05T00:00:00.000Z',
    ...overrides,
  });
}

function makeGithub(overrides: Record<string, unknown> = {}): GitHubClient {
  const base: GitHubClient = {
    createBranch: vi.fn(async () => 'b'),
    createCommit: vi.fn(async () => 'c'),
    createDraftPR: vi.fn(async () => 42),
    addLabel: vi.fn(async () => {}),
    getComments: vi.fn(async () => []),
    mergePR: vi.fn(async () => {}),
    closePR: vi.fn(async () => {}),
  };
  return { ...base, ...overrides } as unknown as GitHubClient;
}

function makeProposal(files: UpgradeProposalT['files']): UpgradeProposalT {
  return {
    id: 'proposal-x',
    gapId: 'gap-1',
    tier: 'A',
    title: 'Test proposal',
    description: 'Test',
    files,
    expectedScoreDelta: {},
    generatedAt: new Date().toISOString(),
    requiresSandboxVerify: false,
  };
}

function passExecutors(): GateExecutors {
  const pass = vi.fn(async () => ({ passed: true, output: 'ok' }));
  return { sandbox: pass, lint: pass, typecheck: pass, tests: pass };
}

// ----------------------------------------------------------------------------
// H1 — fitness must measure a REAL pre/post delta (not always zero)
// ----------------------------------------------------------------------------

describe('H1 fitness baseline (resumeAfterVeto)', () => {
  it('folds a non-zero positive delta when the merge improves the score', async () => {
    const repo = makeTmpDir();
    const auditDir = makeTmpDir();
    const ledgerRoot = makeTmpDir();
    const profile = makeProfile(repo);

    // Write the PRE-merge scorecard (this must be the baseline, NOT the post).
    saveScorecard(makeScorecard(400), auditDir);

    const github = makeGithub();
    const out = await resumeAfterVeto({
      profile,
      prState: makePrState({ vetoDeadline: '2026-09-03T00:00:00.000Z' }),
      github,
      adapters: { grader: HIGH_AUDIT },
      auditDir,
      ledgerRoot,
      now: new Date('2026-09-06T00:00:00.000Z'),
    });

    expect(out.state.status).toBe('merged');
    const ledger = loadLedger(ledgerRoot);
    const last = ledger.geneFitnessUpdates?.[ledger.geneFitnessUpdates.length - 1];
    expect(last).toBeDefined();
    // H1 regression guard: the delta must NOT be zero.
    expect(last!.overallDelta).not.toBe(0);
    expect(last!.overallDelta).toBeGreaterThan(0);
    expect(last!.verdict).toBe('improved');
  });

  it('quarantines (gene_quarantined) when the merge regresses the score by >= threshold', async () => {
    const repo = makeTmpDir();
    const auditDir = makeTmpDir();
    const ledgerRoot = makeTmpDir();
    const profile = makeProfile(repo);

    // High pre baseline, then a LOW post audit -> regression.
    saveScorecard(makeScorecard(900), auditDir);

    const github = makeGithub();
    const out = await resumeAfterVeto({
      profile,
      prState: makePrState({ vetoDeadline: '2026-09-03T00:00:00.000Z' }),
      github,
      adapters: { grader: LOW_AUDIT },
      auditDir,
      ledgerRoot,
      now: new Date('2026-09-06T00:00:00.000Z'),
    });

    expect(out.state.status).toBe('error');
    expect(out.state).toMatchObject({ reason: 'gene_quarantined' });
    const ledger = loadLedger(ledgerRoot);
    expect(ledger.quarantined).toContain('upgrade-gap-1-1');
    // post overall is far below 900 → delta is negative and large.
    const last = ledger.geneFitnessUpdates![ledger.geneFitnessUpdates!.length - 1];
    expect(last.overallDelta).toBeLessThan(0);
    expect(Math.abs(last.overallDelta)).toBeGreaterThanOrEqual(DEFAULT_QUARANTINE_THRESHOLD_POINTS);
  });
});

// ----------------------------------------------------------------------------
// M3 — veto must be authorized; race narrowed by a final re-fetch
// ----------------------------------------------------------------------------

describe('M3 veto authorization + race', () => {
  it('ignores a veto comment from an UNauthorized user (default = repo owner)', async () => {
    const github = makeGithub({
      getComments: vi.fn(async () => [
        { id: 1, body: 'veto this', user: 'mallory', createdAt: '2026-09-04T01:00:00.000Z' },
      ]),
    });
    const result = await checkAndMerge(makePrState(), github, {
      now: new Date('2026-09-04T12:00:00.000Z'),
    });
    expect(result.vetoReceived).toBe(false);
    expect(result.closed).toBe(false);
    expect(github.closePR).not.toHaveBeenCalled();
  });

  it('honors a veto comment from the repo owner', async () => {
    const github = makeGithub({
      getComments: vi.fn(async () => [
        { id: 1, body: 'veto this', user: 'acme', createdAt: '2026-09-04T01:00:00.000Z' },
      ]),
    });
    const result = await checkAndMerge(makePrState(), github, {
      now: new Date('2026-09-04T12:00:00.000Z'),
    });
    expect(result.vetoReceived).toBe(true);
    expect(github.closePR).toHaveBeenCalledTimes(1);
  });

  it('supports an explicit authorizedVetoUsers allowlist', async () => {
    const github = makeGithub({
      getComments: vi.fn(async () => [
        { id: 1, body: 'veto', user: 'mallory', createdAt: '2026-09-04T01:00:00.000Z' },
      ]),
    });
    const result = await checkAndMerge(makePrState(), github, {
      now: new Date('2026-09-04T12:00:00.000Z'),
      authorizedVetoUsers: ['mallory'],
    });
    expect(result.vetoReceived).toBe(true);
    expect(github.closePR).toHaveBeenCalledTimes(1);
  });

  it('re-fetches comments right before the merge and vetoes if one appeared in the gap', async () => {
    const callable = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 9, body: 'veto', user: 'acme', createdAt: '2026-09-04T23:59:00.000Z' },
      ]);
    const github = makeGithub({ getComments: callable });
    const result = await checkAndMerge(makePrState(), github, {
      now: new Date('2026-09-06T00:00:00.000Z'),
    });
    expect(github.mergePR).not.toHaveBeenCalled();
    expect(github.closePR).toHaveBeenCalledTimes(1);
    expect(result.vetoReceived).toBe(true);
    expect(callable).toHaveBeenCalledTimes(2);
  });
});

// ----------------------------------------------------------------------------
// H4/H5 — PR lifecycle helpers the cron uses to close the loop
// ----------------------------------------------------------------------------

describe('H4/H5 in-flight PR helpers', () => {
  it('isTerminal / isInFlight classify correctly', () => {
    const open = makePrState();
    const merged = makePrState({ merged: true });
    const vetoed = makePrState({ vetoReceived: true, closed: true });
    expect(isInFlight(open)).toBe(true);
    expect(isTerminal(open)).toBe(false);
    expect(isInFlight(merged)).toBe(false);
    expect(isInFlight(vetoed)).toBe(false);
  });

  it('loadOpenPrStates returns only in-flight PRs and skips corrupt files', async () => {
    const prsDir = makeTmpDir('prscan-');
    fs.writeFileSync(path.join(prsDir, 'pr-1.json'), JSON.stringify(makePrState({ prNumber: 1 })));
    fs.writeFileSync(
      path.join(prsDir, 'pr-2.json'),
      JSON.stringify(makePrState({ prNumber: 2, merged: true })),
    );
    fs.writeFileSync(path.join(prsDir, 'pr-3.json'), '{ not json');

    const open = await loadOpenPrStates(prsDir);
    expect(open).toHaveLength(1);
    expect(open[0].prNumber).toBe(1);
  });

  it('loadOpenPrStates returns [] for a missing dir', async () => {
    const open = await loadOpenPrStates(path.join(makeTmpDir(), 'does-not-exist'));
    expect(open).toEqual([]);
  });

  it('computeVetoDeadline still adds hours (sanity for cron merge timing)', () => {
    expect(computeVetoDeadline('2026-09-04T00:00:00.000Z', 24)).toBe('2026-09-05T00:00:00.000Z');
  });
});

// ----------------------------------------------------------------------------
// H3 — path traversal is refused before any disk write
// ----------------------------------------------------------------------------

describe('H3 path traversal guard', () => {
  it('refuses a `../` proposal path in runGate before any executor runs', async () => {
    const repo = makeTmpDir();
    const outside = path.resolve(repo, '..', 'escaped.txt');
    const executors = passExecutors();
    const result = await runGate(makeProposal([{ path: '../escaped.txt', action: 'create', content: 'x' }]), repo, executors);

    expect(result.passed).toBe(false);
    expect(result.rejectedReason).toMatch(/traversal/i);
    expect(fs.existsSync(outside)).toBe(false);
    expect(executors.sandbox).not.toHaveBeenCalled();
  });

  it('refuses an absolute path that points outside the repo root', async () => {
    const repo = makeTmpDir();
    const outside = path.join(makeTmpDir('abs-target-'), 'evil.txt');
    const executors = passExecutors();
    const result = await runGate(
      makeProposal([{ path: outside, action: 'create', content: 'x' }]),
      repo,
      executors,
    );

    expect(result.passed).toBe(false);
    expect(result.rejectedReason).toMatch(/traversal/i);
    expect(fs.existsSync(outside)).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// M2 — a PASSING gate leaves the local clone clean (verifier, not stager)
// ----------------------------------------------------------------------------

describe('M2 gate is a verifier (rolls back on success)', () => {
  it('removes created files and restores modified files after a green gate', async () => {
    const repo = makeTmpDir();
    fs.mkdirSync(path.join(repo, 'src'));
    fs.writeFileSync(path.join(repo, 'src', 'kept.ts'), 'original');

    const result = await runGate(
      makeProposal([
        { path: 'src/kept.ts', action: 'modify', content: 'MODIFIED' },
        { path: 'src/new.ts', action: 'create', content: 'new file' },
      ]),
      repo,
      passExecutors(),
    );

    expect(result.passed).toBe(true);
    expect(fs.readFileSync(path.join(repo, 'src', 'kept.ts'), 'utf8')).toBe('original');
    expect(fs.existsSync(path.join(repo, 'src', 'new.ts'))).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// M4 — quarantine suppresses re-selection of the same gap
// ----------------------------------------------------------------------------

describe('M4 gap quarantine', () => {
  it('records quarantinedGaps and isGapQuarantined consults it', async () => {
    const root = makeTmpDir();
    const pre = makeScorecard(900);
    const post = makeScorecard(800); // -100 regression

    const { quarantined } = await updateGeneFitness({
      proposalId: 'upgrade-gap-x-1',
      gapId: 'gap-x',
      pre,
      post,
      ledgerRoot: root,
    });
    expect(quarantined).toBe(true);
    const ledger = loadLedger(root);
    expect(ledger.quarantined).toContain('upgrade-gap-x-1');
    expect(ledger.quarantinedGaps).toContain('gap-x');
    expect(isGapQuarantined('gap-x', root)).toBe(true);
    expect(isGapQuarantined('other-gap', root)).toBe(false);
  });

  it('runLoop skips a quarantined gap and reports idle when it is the only candidate', async () => {
    const repo = makeTmpDir();
    const ledgerRoot = makeTmpDir();
    // Discover the gap id the analyzer will emit for this profile.
    const probeProfile = makeProfile(repo, ['No public website for the product']);
    const probeAuditDir = makeTmpDir();
    const stmt = await runAuditFixture(HIGH_AUDIT, probeProfile, probeAuditDir);
    const probeCard = projectScorecard(stmt, probeProfile);
    const queue = analyzeGaps(probeCard, probeProfile);
    const gapId = queue.gaps[0].id;

    // Quarantine that exact gap id.
    await updateGeneFitness({
      proposalId: `upgrade-${gapId}-1`,
      gapId,
      pre: makeScorecard(900),
      post: makeScorecard(400),
      ledgerRoot,
    });

    // Dry-run the loop against a profile with the same gap text; the quarantined
    // gap must be skipped, leaving no candidate -> idle.
    const out = await runLoop({
      profile: makeProfile(repo, ['No public website for the product']),
      dryRun: true,
      adapters: { grader: HIGH_AUDIT },
      ledgerRoot,
      gateExecutors: passExecutors(),
    });
    expect(out.state.status).toBe('idle');
    expect(out.context.currentProposal).toBeNull();
  });
});

// Minimal local helper so the M4 test doesn't import the audit runner directly
// in a way that complicates the fixture — uses the same contract as runAudit.
async function runAuditFixture(adapter: AuditAdapter, profile: BusinessProfileT, auditDir: string) {
  const { runAudit } = await import('../src/autopilot/auditRunner');
  return runAudit({ profile, adapters: { grader: adapter }, auditDir });
}
