import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

import {
  RepoBinding,
  type BusinessProfileT,
} from '../src/autopilot/businessProfile';
import type { AuditAdapter } from '../src/autopilot/auditRunner';
import { resolveCheckpoint, resumeAfterVeto, runLoop } from '../src/autopilot/loopStateMachine';
import { FileCheckpointStore, buildCheckpoint } from '../src/autopilot/checkpoint';
import { PRState, type GitHubClient, type PRStateT } from '../src/autopilot/loopTypes';

const tmpRepos: string[] = [];

function makeTmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'checkpoint-loop-'));
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
      githubUrl: 'https://github.com/acme/widget',
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

beforeEach(() => {
  delete process.env.RECOURSE_AUTOPILOT_DISABLED;
});

afterEach(() => {
  delete process.env.RECOURSE_AUTOPILOT_DISABLED;
  for (const dir of tmpRepos.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('runLoop with requireCheckpoint', () => {
  it('pauses in checkpoint state after opening PR when requireCheckpoint is set', async () => {
    const repo = makeTmpRepo();
    const auditDir = makeTmpRepo();
    const store = new FileCheckpointStore(auditDir);
    const github = makeGithub();

    const out = await runLoop({
      profile: makeProfile({ repoPath: repo, autoMerge: true }),
      auditDir,
      adapters: { grader: graderFixture },
      gateExecutors: allPassingExecutors(),
      github,
      requireCheckpoint: true,
      checkpointStore: store,
    });

    expect(out.state).toMatchObject({ status: 'checkpoint' });
    expect(out.context.checkpoint).not.toBeNull();
    expect(out.context.checkpoint!.prNumber).toBe(42);
    expect(out.context.prState).not.toBeNull();
  });

  it('does not enter checkpoint state when requireCheckpoint is false', async () => {
    const repo = makeTmpRepo();
    const auditDir = makeTmpRepo();
    const github = makeGithub();

    const out = await runLoop({
      profile: makeProfile({ repoPath: repo, autoMerge: true }),
      auditDir,
      adapters: { grader: graderFixture },
      gateExecutors: allPassingExecutors(),
      github,
    });

    expect(out.state.status).toBe('veto_wait');
    expect(out.context.checkpoint).toBeNull();
  });
});

describe('resumeAfterVeto with checkpoint', () => {
  function makePrState(overrides: Partial<PRStateT> = {}): PRStateT {
    return PRState.parse({
      prNumber: 42,
      owner: 'acme',
      repo: 'widget',
      branch: 'recourse/upgrade-1',
      proposalId: 'upgrade-gap-1-1',
      openedAt: '2026-09-04T00:00:00.000Z',
      vetoDeadline: '2026-09-05T00:00:00.000Z',
      ...overrides,
    });
  }

  it('does not advance when a pending checkpoint exists', async () => {
    const repo = makeTmpRepo();
    const auditDir = makeTmpRepo();
    const store = new FileCheckpointStore(auditDir);
    const github = makeGithub();

    // Create a pending checkpoint
    const cp = buildCheckpoint({
      id: 'ckpt_pending_42',
      profileSlug: 'testbiz',
      prNumber: 42,
      proposalId: 'upgrade-gap-1-1',
      expiresAt: '2026-09-05T00:00:00.000Z',
    });
    await store.save(cp);

    const out = await resumeAfterVeto({
      profile: makeProfile({ repoPath: repo }),
      prState: makePrState(),
      github,
      auditDir,
      checkpointStore: store,
      now: new Date('2026-09-04T12:00:00.000Z'),
    });

    expect(out.state).toMatchObject({ status: 'checkpoint', checkpointId: 'ckpt_pending_42' });
    expect(github.mergePR).not.toHaveBeenCalled();
  });

  it('returns error when checkpoint has expired', async () => {
    const repo = makeTmpRepo();
    const auditDir = makeTmpRepo();
    const store = new FileCheckpointStore(auditDir);
    const github = makeGithub();

    const cp = buildCheckpoint({
      id: 'ckpt_expired_42',
      profileSlug: 'testbiz',
      prNumber: 42,
      proposalId: 'upgrade-gap-1-1',
      expiresAt: '2026-09-01T00:00:00.000Z',
    });
    await store.save(cp);

    const out = await resumeAfterVeto({
      profile: makeProfile({ repoPath: repo }),
      prState: makePrState(),
      github,
      auditDir,
      checkpointStore: store,
      now: new Date('2026-09-05T00:00:00.000Z'),
    });

    expect(out.state).toMatchObject({ status: 'error' });
    expect((out.state as { status: string; reason: string }).reason).toContain('expired');
  });

  it('returns vetoed when checkpoint is rejected', async () => {
    const repo = makeTmpRepo();
    const auditDir = makeTmpRepo();
    const store = new FileCheckpointStore(auditDir);
    const github = makeGithub();

    const cp = buildCheckpoint({
      id: 'ckpt_rejected_42',
      profileSlug: 'testbiz',
      prNumber: 42,
      proposalId: 'upgrade-gap-1-1',
      status: 'rejected',
    }, new Date('2026-09-04T10:00:00.000Z'));
    await store.save(cp);

    const out = await resumeAfterVeto({
      profile: makeProfile({ repoPath: repo }),
      prState: makePrState(),
      github,
      auditDir,
      checkpointStore: store,
      now: new Date('2026-09-04T12:00:00.000Z'),
    });

    expect(out.state).toMatchObject({ status: 'vetoed' });
  });

  it('proceeds to veto_wait when checkpoint is approved (checkpoint clears, veto window proceeds)', async () => {
    const repo = makeTmpRepo();
    const auditDir = makeTmpRepo();
    const store = new FileCheckpointStore(auditDir);
    const github = makeGithub();

    const cp = buildCheckpoint({
      id: 'ckpt_approved_42',
      profileSlug: 'testbiz',
      prNumber: 42,
      proposalId: 'upgrade-gap-1-1',
      status: 'approved',
    }, new Date('2026-09-04T10:00:00.000Z'));
    await store.save(cp);

    const out = await resumeAfterVeto({
      profile: makeProfile({ repoPath: repo }),
      prState: makePrState(),
      github,
      auditDir,
      checkpointStore: store,
      now: new Date('2026-09-04T12:00:00.000Z'),
    });

    // Inside the 24h window: should stay in veto_wait (checkpoint was cleared so we proceed)
    expect(out.state.status).toBe('veto_wait');
    expect(github.mergePR).not.toHaveBeenCalled();
  });
});