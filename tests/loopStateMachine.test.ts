import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

import {
  RepoBinding,
  type BusinessProfileT,
} from '../src/autopilot/businessProfile';
import type { AuditAdapter } from '../src/autopilot/auditRunner';
import { resumeAfterVeto, runLoop } from '../src/autopilot/loopStateMachine';
import { PRState, type GitHubClient, type PRStateT } from '../src/autopilot/loopTypes';

const tmpRepos: string[] = [];

function makeTmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'loop-machine-'));
  tmpRepos.push(dir);
  return dir;
}

const GITIGNORE_GAP =
  'Add a .gitignore with protected-path patterns so secrets and tokens never get committed';

function makeProfile(opts: { repoPath?: string; autoMerge?: boolean } = {}): BusinessProfileT {
  const profile: BusinessProfileT = {
    business: {
      name: 'TestBiz',
      tagline: 'Tagline',
      industry: 'Test',
      website: '',
      stage: 'idea',
    },
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
      differentiators: ['Diff'],
    },
    gaps: [GITIGNORE_GAP],
  };
  if (opts.repoPath !== undefined) {
    profile.repo = RepoBinding.parse({
      localPath: opts.repoPath,
      autoMergeEnabled: opts.autoMerge ?? true,
    });
  }
  return profile;
}

const graderFixture: AuditAdapter = async () => ({
  included: true,
  scoreBasis: 'deterministic fixture',
  payload: {
    security: { score: 90 },
    quality: { score: 90, testScore: 90, readmeCompleteness: 90 },
    market: { score: 80 },
    compliance: { score: 80 },
    valuation: { estimatedValue: 100000 },
  },
});

function allPassingExecutors() {
  const pass = vi.fn(async () => ({ passed: true, output: 'ok' }));
  return { sandbox: pass, lint: pass, typecheck: pass, tests: pass };
}

beforeEach(() => {
  delete process.env.RECOURSE_AUTOPILOT_DISABLED;
});

afterEach(() => {
  delete process.env.RECOURSE_AUTOPILOT_DISABLED;
  for (const dir of tmpRepos.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('runLoop kill switch and gates', () => {
  it('returns error kill_switch when RECOURSE_AUTOPILOT_DISABLED is set', async () => {
    const repo = makeTmpRepo();
    process.env.RECOURSE_AUTOPILOT_DISABLED = '1';
    try {
      const out = await runLoop({
        profile: makeProfile({ repoPath: repo }),
        dryRun: true,
        adapters: { grader: graderFixture },
      });
      expect(out.state).toMatchObject({ status: 'error', reason: 'kill_switch' });
      expect(out.context.scorecard).toBeNull();
      expect(out.context.queue).toBeNull();
    } finally {
      delete process.env.RECOURSE_AUTOPILOT_DISABLED;
    }
  });

  it('returns idle when auto-merge is disabled and this is not a dry run', async () => {
    const repo = makeTmpRepo();
    const out = await runLoop({
      profile: makeProfile({ repoPath: repo, autoMerge: false }),
    });
    expect(out.state).toMatchObject({ status: 'idle' });
  });

  it('returns error no_repo_binding when the profile has no repo binding', async () => {
    const out = await runLoop({
      profile: makeProfile(),
      dryRun: true,
      adapters: { grader: graderFixture },
    });
    expect(out.state).toMatchObject({ status: 'error', reason: 'no_repo_binding' });
  });
});

describe('runLoop dry-run happy path', () => {
  it('runs audit -> analyze -> generate -> gate and returns pr_open with prNumber -1', async () => {
    const repo = makeTmpRepo();
    const out = await runLoop({
      profile: makeProfile({ repoPath: repo, autoMerge: true }),
      dryRun: true,
      adapters: { grader: graderFixture },
      gateExecutors: allPassingExecutors(),
    });

    expect(out.state).toMatchObject({ status: 'pr_open', prNumber: -1 });
    const ctx = out.context;
    expect(ctx.profileSlug).toBe('testbiz');
    expect(ctx.scorecard).not.toBeNull();
    expect(ctx.queue).not.toBeNull();
    expect(ctx.queue!.gaps.length).toBeGreaterThan(0);
    expect(ctx.queue!.businessSlug).toBe('testbiz');
    expect(ctx.currentProposal).not.toBeNull();
    expect(ctx.currentProposal!.gapId).toBe(ctx.queue!.gaps[0].id);
    expect(ctx.currentProposal!.tier).toBe('A');
    expect(ctx.prState).toBeNull();
  });
});

describe('runLoop when no gap passes the gate', () => {
  it('returns idle with the queue in context when every proposal is rejected', async () => {
    const repo = makeTmpRepo();
    const failing = {
      sandbox: vi.fn(async () => ({ passed: false, output: 'blocked', error: 'blocked' })),
    };
    const out = await runLoop({
      profile: makeProfile({ repoPath: repo, autoMerge: true }),
      dryRun: true,
      adapters: { grader: graderFixture },
      gateExecutors: failing,
    });

    expect(out.state).toMatchObject({ status: 'idle' });
    expect(out.context.queue).not.toBeNull();
    expect(out.context.queue!.gaps.length).toBeGreaterThan(0);
    expect(out.context.currentProposal).toBeNull();
    expect(out.context.prState).toBeNull();
  });
});

describe('resumeAfterVeto — closing the loop', () => {
  function makePrState(overrides: Partial<PRStateT> = {}): PRStateT {
    return PRState.parse({
      prNumber: 7,
      owner: 'acme',
      repo: 'widget',
      branch: 'recourse/upgrade-1',
      proposalId: 'upgrade-gap-1-1',
      openedAt: '2026-09-04T00:00:00.000Z',
      vetoDeadline: '2026-09-05T00:00:00.000Z',
      ...overrides,
    });
  }

  function makeGithub(overrides: Record<string, unknown> = {}): GitHubClient {
    const base: GitHubClient = {
      createBranch: vi.fn(async () => 'b'),
      createCommit: vi.fn(async () => 'c'),
      createDraftPR: vi.fn(async () => 7),
      addLabel: vi.fn(async () => {}),
      getComments: vi.fn(async () => []),
      mergePR: vi.fn(async () => {}),
      closePR: vi.fn(async () => {}),
    };
    return { ...base, ...overrides } as unknown as GitHubClient;
  }

  it('vetoes when a comment contains the word veto (returns vetoed, no re-audit)', async () => {
    const repo = makeTmpRepo();
    const github = makeGithub({
      getComments: vi.fn(async () => [
        { id: 1, body: 'veto this', user: 'acme', createdAt: '2026-09-04T01:00:00.000Z' },
      ]),
    });
    const out = await resumeAfterVeto({
      profile: makeProfile({ repoPath: repo }),
      prState: makePrState(),
      github,
      adapters: { grader: graderFixture },
      auditDir: makeTmpRepo(),
      now: new Date('2026-09-06T00:00:00.000Z'),
    });
    expect(out.state).toMatchObject({ status: 'vetoed', prNumber: 7 });
    expect(github.closePR).toHaveBeenCalledTimes(1);
  });

  it('merges when the deadline passed without a veto and folds post-merge fitness', async () => {
    const repo = makeTmpRepo();
    const auditDir = makeTmpRepo();
    const github = makeGithub(); // getComments -> [], mergePR ok
    const out = await resumeAfterVeto({
      profile: makeProfile({ repoPath: repo }),
      prState: makePrState(),
      github,
      adapters: { grader: graderFixture },
      auditDir,
      now: new Date('2026-09-06T00:00:00.000Z'),
    });
    expect(github.mergePR).toHaveBeenCalledTimes(1);
    expect(out.state).toMatchObject({ status: 'merged', prNumber: 7 });
    expect(out.context.scorecard).not.toBeNull();
    // Post-merge audit persisted a new scorecard.
    const files = fs.readdirSync(path.join(auditDir, 'testbiz'), { recursive: true });
    expect(files.some((f: unknown) => String(f).includes('scorecard-'))).toBe(true);
  });

  it('returns veto_wait unchanged while still inside the window', async () => {
    const repo = makeTmpRepo();
    const github = makeGithub();
    const out = await resumeAfterVeto({
      profile: makeProfile({ repoPath: repo }),
      prState: makePrState(),
      github,
      now: new Date('2026-09-04T12:00:00.000Z'),
    });
    expect(out.state).toMatchObject({ status: 'veto_wait', prNumber: 7 });
    expect(github.mergePR).not.toHaveBeenCalled();
    expect(github.closePR).not.toHaveBeenCalled();
  });
});
