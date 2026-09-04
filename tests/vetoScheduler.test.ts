import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { PRState, type GitHubClient, type PRStateT } from '../src/autopilot/loopTypes';
import {
  checkAndMerge,
  computeVetoDeadline,
  loadPRState,
  parseOwnerRepo,
  savePRState,
} from '../src/autopilot/vetoScheduler';

const tmpRoots: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'veto-scheduler-'));
  tmpRoots.push(dir);
  return dir;
}

afterEach(() => {
  for (const root of tmpRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function makeState(overrides: Partial<PRStateT> = {}): PRStateT {
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

function makeGithub(overrides: Partial<Record<string, unknown>> = {}): GitHubClient {
  const github = {
    createBranch: vi.fn(),
    createCommit: vi.fn(),
    createDraftPR: vi.fn(),
    addLabel: vi.fn(),
    getComments: vi.fn(async () => []),
    mergePR: vi.fn(async () => {}),
    closePR: vi.fn(async () => {}),
    ...overrides,
  };
  return github as unknown as GitHubClient;
}

describe('computeVetoDeadline', () => {
  it('adds vetoHours to the ISO openedAt and returns an ISO timestamp', () => {
    const deadline = computeVetoDeadline('2026-09-04T00:00:00.000Z', 24);
    expect(deadline).toBe('2026-09-05T00:00:00.000Z');
    expect(new Date(deadline).toISOString()).toBe(deadline);
    const diff = new Date(deadline).getTime() - new Date('2026-09-04T00:00:00.000Z').getTime();
    expect(diff).toBe(24 * 60 * 60 * 1000);
  });

  it('supports partial hours', () => {
    const deadline = computeVetoDeadline('2026-09-04T00:00:00.000Z', 1.5);
    expect(new Date(deadline).toISOString()).toBe('2026-09-04T01:30:00.000Z');
  });
});

describe('parseOwnerRepo', () => {
  it('parses https://github.com/owner/repo', () => {
    expect(parseOwnerRepo('https://github.com/owner/repo')).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('strips a .git suffix', () => {
    expect(parseOwnerRepo('https://github.com/owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('handles a trailing slash', () => {
    expect(parseOwnerRepo('https://github.com/owner/repo/')).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('handles a protocol-less github.com URL', () => {
    expect(parseOwnerRepo('github.com/owner/repo')).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('returns null for non-github hosts and invalid inputs', () => {
    expect(parseOwnerRepo('https://gitlab.com/owner/repo')).toBeNull();
    expect(parseOwnerRepo('https://example.com/owner/repo')).toBeNull();
    expect(parseOwnerRepo('not a url')).toBeNull();
    expect(parseOwnerRepo('')).toBeNull();
  });

  it('returns null when the path does not have exactly owner/repo', () => {
    expect(parseOwnerRepo('https://github.com/owner')).toBeNull();
    expect(parseOwnerRepo('https://github.com/owner/repo/tree/main')).toBeNull();
  });
});

describe('checkAndMerge', () => {
  it('closes the PR and marks vetoReceived when a comment contains veto', async () => {
    const github = makeGithub({
      getComments: vi.fn(async () => [
        { id: 1, body: 'Operator: please veto this PR', user: 'al', createdAt: '2026-09-04T01:00:00.000Z' },
      ]),
    });
    const state = makeState();
    const result = await checkAndMerge(state, github, { now: new Date('2026-09-04T12:00:00.000Z') });

    expect(github.closePR).toHaveBeenCalledTimes(1);
    expect(github.closePR).toHaveBeenCalledWith('acme', 'widget', 42);
    expect(github.mergePR).not.toHaveBeenCalled();
    expect(result.vetoReceived).toBe(true);
    expect(result.closed).toBe(true);
    expect(result.merged).toBe(false);
  });

  it('matches veto case-insensitively', async () => {
    const github = makeGithub({
      getComments: vi.fn(async () => [
        { id: 1, body: 'NO APPROVAL -- VETO', user: 'al', createdAt: '2026-09-04T01:00:00.000Z' },
      ]),
    });
    const result = await checkAndMerge(makeState(), github);
    expect(result.vetoReceived).toBe(true);
    expect(result.closed).toBe(true);
  });

  it('does NOT treat veto-adjacent words as a veto (word boundary)', async () => {
    const github = makeGithub({
      getComments: vi.fn(async () => [
        { id: 1, body: 'vetoed the earlier proposal', user: 'al', createdAt: '2026-09-04T01:00:00.000Z' },
        { id: 2, body: 'the vetoes are counted below', user: 'be', createdAt: '2026-09-04T01:00:00.000Z' },
      ]),
    });
    const result = await checkAndMerge(makeState(), github, { now: new Date('2026-09-04T12:00:00.000Z') });
    expect(result.vetoReceived).toBe(false);
    expect(result.closed).toBe(false);
    expect(github.closePR).not.toHaveBeenCalled();
    expect(github.mergePR).not.toHaveBeenCalled();
  });

  it('returns the state unchanged before the deadline with no veto comment', async () => {
    const github = makeGithub();
    const state = makeState();
    const result = await checkAndMerge(state, github, { now: new Date('2026-09-04T23:00:00.000Z') });

    expect(result).toBe(state);
    expect(github.mergePR).not.toHaveBeenCalled();
    expect(github.closePR).not.toHaveBeenCalled();
    expect(result.merged).toBe(false);
    expect(result.vetoReceived).toBe(false);
  });

  it('merges when now is at/after the veto deadline and no veto comment exists', async () => {
    const github = makeGithub();
    const state = makeState();
    const result = await checkAndMerge(state, github, { now: new Date('2026-09-05T00:00:00.000Z') });

    expect(github.mergePR).toHaveBeenCalledTimes(1);
    expect(github.mergePR).toHaveBeenCalledWith('acme', 'widget', 42);
    expect(github.closePR).not.toHaveBeenCalled();
    expect(result.merged).toBe(true);
    expect(result.vetoReceived).toBe(false);
  });

  it('records mergeError and leaves the PR unmerged when mergePR throws', async () => {
    const github = makeGithub({
      mergePR: vi.fn(async () => {
        throw new Error('merge conflict');
      }),
    });
    const result = await checkAndMerge(makeState(), github, {
      now: new Date('2026-09-06T00:00:00.000Z'),
    });

    expect(result.merged).toBe(false);
    expect(result.mergeError).toContain('merge conflict');
    expect(github.closePR).not.toHaveBeenCalled();
  });

  it('short-circuits (getComments NOT called) when the state is already merged', async () => {
    const github = makeGithub();
    const state = makeState({ merged: true });
    const result = await checkAndMerge(state, github, { now: new Date('2026-09-06T00:00:00.000Z') });

    expect(result).toBe(state);
    expect(github.getComments).not.toHaveBeenCalled();
    expect(github.closePR).not.toHaveBeenCalled();
    expect(github.mergePR).not.toHaveBeenCalled();
  });

  it('short-circuits (getComments NOT called) when the state is already closed', async () => {
    const github = makeGithub();
    const state = makeState({ closed: true });
    const result = await checkAndMerge(state, github);

    expect(result).toBe(state);
    expect(github.getComments).not.toHaveBeenCalled();
  });

  it('short-circuits (getComments NOT called) when a veto was already received', async () => {
    const github = makeGithub();
    const state = makeState({ vetoReceived: true, closed: true });
    const result = await checkAndMerge(state, github);

    expect(result).toBe(state);
    expect(github.getComments).not.toHaveBeenCalled();
  });
});

describe('savePRState / loadPRState', () => {
  it('round-trips PR state through an explicit file path', async () => {
    const dir = makeTmpDir();
    const filePath = path.join(dir, 'acme', 'prs', 'pr-42.json');
    const state = makeState();

    const saved = await savePRState(state, filePath);
    expect(saved).toBe(filePath);
    expect(fs.existsSync(filePath)).toBe(true);

    const loaded = await loadPRState(filePath);
    expect(loaded).not.toBeNull();
    expect(loaded).toEqual(state);
  });

  it('returns null for a missing or corrupt file', async () => {
    const dir = makeTmpDir();
    expect(await loadPRState(path.join(dir, 'prs', 'missing.json'))).toBeNull();

    const corrupt = path.join(dir, 'prs', 'pr-1.json');
    fs.mkdirSync(path.dirname(corrupt), { recursive: true });
    fs.writeFileSync(corrupt, '{ not json', 'utf8');
    expect(await loadPRState(corrupt)).toBeNull();
  });
});
