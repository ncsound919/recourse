import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { UpgradeProposal, type UpgradeProposalT } from '../src/autopilot/loopTypes';
import { RepoBinding, type RepoBindingT } from '../src/autopilot/businessProfile';
import {
  applyProposalFiles,
  checkProtectedPaths,
  runGate,
  DEFAULT_EXECUTORS,
  type Executor,
} from '../src/autopilot/preMergeGate';

const tmpRepos: string[] = [];

function makeTmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'premerge-gate-'));
  tmpRepos.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpRepos.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeProposal(overrides: Partial<UpgradeProposalT> = {}): UpgradeProposalT {
  return UpgradeProposal.parse({
    id: 'proposal-1',
    gapId: 'gap-1',
    tier: 'A',
    title: 'Test proposal',
    description: 'Test',
    files: [],
    expectedScoreDelta: {},
    generatedAt: new Date().toISOString(),
    requiresSandboxVerify: false,
    ...overrides,
  });
}

function makeBinding(overrides: Partial<RepoBindingT> = {}): RepoBindingT {
  return RepoBinding.parse({ localPath: 'C:/tmp/repo', ...overrides });
}

function passExecutor(): ReturnType<typeof vi.fn> & Executor {
  return vi.fn(async () => ({ passed: true, output: 'ok' }));
}

function allPassingExecutors() {
  return {
    sandbox: passExecutor(),
    lint: passExecutor(),
    typecheck: passExecutor(),
    tests: passExecutor(),
  };
}

describe('preMergeGate runGate', () => {
  it('passes when all injected executors pass, checks in gate order, overallScore 1', async () => {
    const repo = makeTmpRepo();
    const executors = allPassingExecutors();
    const result = await runGate(
      makeProposal({ files: [{ path: 'src/new.ts', action: 'create', content: 'export const a = 1;' }] }),
      repo,
      executors,
    );

    expect(result.passed).toBe(true);
    expect(result.overallScore).toBe(1);
    expect(result.rejectedReason).toBeUndefined();
    expect(result.checks.map((c) => c.name)).toEqual(['sandbox', 'lint', 'typecheck', 'tests']);
    for (const check of result.checks) {
      expect(check.passed).toBe(true);
      expect(check.durationMs).toBeGreaterThanOrEqual(0);
    }
    expect(executors.sandbox).toHaveBeenCalledTimes(1);
    expect(executors.lint).toHaveBeenCalledTimes(1);
    expect(executors.typecheck).toHaveBeenCalledTimes(1);
    expect(executors.tests).toHaveBeenCalledTimes(1);
  });

  it('fails fast when lint fails and later executors are never called', async () => {
    const repo = makeTmpRepo();
    const executors = allPassingExecutors();
    executors.lint.mockImplementation(async () => ({
      passed: false,
      output: 'lint exploded',
      error: 'lint exploded',
    }));

    const result = await runGate(
      makeProposal({ files: [{ path: 'src/a.ts', action: 'create', content: 'export const a = 1;' }] }),
      repo,
      executors,
    );

    expect(result.passed).toBe(false);
    expect(result.rejectedReason).toMatch(/lint/);
    expect(result.rejectedReason).toContain('lint exploded');
    expect(executors.sandbox).toHaveBeenCalledTimes(1);
    expect(executors.typecheck).not.toHaveBeenCalled();
    expect(executors.tests).not.toHaveBeenCalled();
  });

  it('fails with requires_sandbox_not_available when proposal.requiresSandboxVerify is true (no fabrication)', async () => {
    const repo = makeTmpRepo();
    const result = await runGate(
      makeProposal({
        requiresSandboxVerify: true,
        files: [{ path: 'src/sandbox.ts', action: 'create', content: 'export const x = 1;' }],
      }),
      repo,
    );

    expect(result.passed).toBe(false);
    expect(result.rejectedReason).toMatch(/sandbox failed/);
    expect(result.rejectedReason).toContain('requires_sandbox_not_available');
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0].name).toBe('sandbox');
  });

  it('blocks protected-path changes before any executor runs', async () => {
    const repo = makeTmpRepo();
    const executors = allPassingExecutors();
    const binding = makeBinding({ protectedPaths: ['docs/locked/**'] });

    const result = await runGate(
      makeProposal({ files: [{ path: 'docs/locked/secrets.txt', action: 'create', content: 'x' }] }),
      repo,
      executors,
      binding,
    );

    expect(result.passed).toBe(false);
    expect(result.rejectedReason).toMatch(/Protected path/);
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0].name).toBe('protected_paths');
    expect(executors.sandbox).not.toHaveBeenCalled();
    expect(executors.lint).not.toHaveBeenCalled();
    expect(executors.typecheck).not.toHaveBeenCalled();
    expect(executors.tests).not.toHaveBeenCalled();
  });

  it('treats absent executor steps as no-op passes when only some executors are injected', async () => {
    const repo = makeTmpRepo();
    const lint = passExecutor();
    const result = await runGate(
      makeProposal({ files: [{ path: 'src/only.ts', action: 'create', content: 'export const x = 1;' }] }),
      repo,
      { lint },
    );

    expect(result.passed).toBe(true);
    expect(result.checks.map((c) => c.name)).toEqual(['sandbox', 'lint', 'typecheck', 'tests']);
    const byName = Object.fromEntries(result.checks.map((c) => [c.name, c]));
    expect(byName.sandbox.passed).toBe(true);
    expect(byName.sandbox.output).toBe('sandbox executor not provided');
    expect(byName.typecheck.passed).toBe(true);
    expect(byName.typecheck.output).toBe('typecheck executor not provided');
    expect(byName.tests.passed).toBe(true);
    expect(byName.tests.output).toBe('tests executor not provided');
    expect(lint).toHaveBeenCalledTimes(1);
  });

  it('passes a proposal with zero files as long as executors pass', async () => {
    const repo = makeTmpRepo();
    const executors = allPassingExecutors();
    const result = await runGate(makeProposal({ files: [] }), repo, executors);

    expect(result.passed).toBe(true);
    expect(result.overallScore).toBe(1);
    expect(result.checks).toHaveLength(4);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it('runs the real default executors when none are injected and they have nothing to do (no-op pass)', async () => {
    const repo = makeTmpRepo();
    const result = await runGate(
      makeProposal({
        // .md is neither javascript (sandbox) nor lintable (oxlint) and the
        // bare temp repo has no package.json (typecheck/tests) — every real
        // default executor resolves to a passing no-op without shelling out.
        files: [{ path: 'notes/note.md', action: 'create', content: '# note' }],
      }),
      repo,
    );

    expect(result.passed).toBe(true);
    expect(result.overallScore).toBe(1);
    expect(result.checks.map((c) => c.name)).toEqual(['sandbox', 'lint', 'typecheck', 'tests']);
    expect(result.checks[0].output).toContain('no javascript files');
    expect(result.checks[1].output).toContain('no lintable changed files');
    expect(result.checks[2].output).toContain('no typecheck script');
    expect(result.checks[3].output).toContain('no test script');
  });
});

describe('preMergeGate applyProposalFiles', () => {
  it('round-trips create/modify/delete against disk', () => {
    const repo = makeTmpRepo();
    fs.writeFileSync(path.join(repo, 'keep.txt'), 'zero');
    fs.writeFileSync(path.join(repo, 'doomed.txt'), 'dead');

    const proposal = makeProposal({
      files: [
        { path: 'new.txt', action: 'create', content: 'hello' },
        { path: 'keep.txt', action: 'modify', content: 'one' },
        { path: 'doomed.txt', action: 'delete', content: '' },
      ],
    });
    const { changedFiles } = applyProposalFiles(proposal, repo);

    expect(fs.readFileSync(path.join(repo, 'new.txt'), 'utf8')).toBe('hello');
    expect(fs.readFileSync(path.join(repo, 'keep.txt'), 'utf8')).toBe('one');
    expect(fs.existsSync(path.join(repo, 'doomed.txt'))).toBe(false);
    expect(changedFiles).toHaveLength(3);
    for (const f of changedFiles) {
      expect(path.isAbsolute(f)).toBe(true);
    }
  });

  it('creates parent directories automatically', () => {
    const repo = makeTmpRepo();
    const proposal = makeProposal({
      files: [{ path: 'a/deeply/nested/file.txt', action: 'create', content: 'deep' }],
    });
    const { changedFiles } = applyProposalFiles(proposal, repo);

    expect(fs.existsSync(path.join(repo, 'a', 'deeply', 'nested', 'file.txt'))).toBe(true);
    expect(fs.readFileSync(path.join(repo, 'a', 'deeply', 'nested', 'file.txt'), 'utf8')).toBe('deep');
    expect(changedFiles).toEqual([path.join(repo, 'a', 'deeply', 'nested', 'file.txt')]);
  });

  it('skips no-op operations (identical create/modify, delete of missing file)', () => {
    const repo = makeTmpRepo();
    fs.writeFileSync(path.join(repo, 'same.txt'), 'unchanged');

    const proposal = makeProposal({
      files: [
        { path: 'same.txt', action: 'modify', content: 'unchanged' },
        { path: 'ghost.txt', action: 'delete', content: '' },
      ],
    });
    const { changedFiles } = applyProposalFiles(proposal, repo);

    expect(changedFiles).toEqual([]);
    expect(fs.readFileSync(path.join(repo, 'same.txt'), 'utf8')).toBe('unchanged');
  });
});

describe('preMergeGate DEFAULT_EXECUTORS.sandbox', () => {
  it('passes node --check on a valid js file', async () => {
    const repo = makeTmpRepo();
    const file = path.join(repo, 'valid.js');
    fs.writeFileSync(file, 'const x = 1;\nconsole.log(x);\n');

    const result = await DEFAULT_EXECUTORS.sandbox({
      repoPath: repo,
      changedFiles: [file],
      repoBinding: null,
      proposal: makeProposal(),
    });

    expect(result.passed).toBe(true);
  });

  it('fails node --check on an invalid js file', async () => {
    const repo = makeTmpRepo();
    const file = path.join(repo, 'broken.js');
    fs.writeFileSync(file, 'const x = ;\n');

    const result = await DEFAULT_EXECUTORS.sandbox({
      repoPath: repo,
      changedFiles: [file],
      repoBinding: null,
      proposal: makeProposal(),
    });

    expect(result.passed).toBe(false);
    expect(String(result.output)).toContain('broken.js');
  });

  it('refuses to fabricate a sandbox pass for a requiresSandboxVerify proposal', async () => {
    const repo = makeTmpRepo();
    const file = path.join(repo, 'valid.js');
    fs.writeFileSync(file, 'const x = 1;\n');

    const result = await DEFAULT_EXECUTORS.sandbox({
      repoPath: repo,
      changedFiles: [file],
      repoBinding: null,
      proposal: makeProposal({ requiresSandboxVerify: true }),
    });

    expect(result.passed).toBe(false);
    expect(result.output).toContain('requires_sandbox_not_available');
  });
});

describe('preMergeGate checkProtectedPaths', () => {
  it('applies binding protectedPaths with wildcards', () => {
    const binding = makeBinding({ protectedPaths: ['docs/locked/**'] });
    expect(checkProtectedPaths(['docs/locked/plan.txt'], binding).allowed).toBe(false);
    expect(checkProtectedPaths(['docs/locked/sub/plan.txt'], binding).allowed).toBe(false);
    expect(checkProtectedPaths(['src/app.ts'], binding).allowed).toBe(true);
  });

  it('falls back to the default protection list when repoBinding is null', () => {
    const blocked = checkProtectedPaths(['config/.env.local'], null);
    expect(blocked.allowed).toBe(false);
    expect(blocked.violations).toContain('config/.env.local');

    expect(checkProtectedPaths(['.env'], null).allowed).toBe(false);
    expect(checkProtectedPaths(['lib/tokens/keys.json'], null).allowed).toBe(false);
    expect(checkProtectedPaths(['src/app.ts'], null).allowed).toBe(true);
  });
});
