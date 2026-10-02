import fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  collectProvenance,
  commitResults,
  pushResults,
  createHarnessPR,
  runAutopilot,
  gitConfig,
  type GitConfig,
  type HarnessProvenance,
} from '../src/lib/codingPipelines/harnessGit.js';
import type { PipelineBenchmarkResult, BenchmarkTarget } from '../src/lib/codingPipelines/runner.js';

const tmpRoots: string[] = [];
function freshRoot(prefix = 'hg-'): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpRoots.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmpRoots.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function initGitRepo(dir: string): void {
  const run = (args: string[]) => {
    const res = spawnSync('git', args, { cwd: dir, encoding: 'utf-8' });
    if (res.status !== 0) throw new Error(res.stderr || 'git failed');
  };
  run(['init', '-q']);
  run(['config', 'user.email', 'test@test.dev']);
  run(['config', 'user.name', 'Test']);
  fs.writeFileSync(path.join(dir, 'README.md'), '# test\n');
  run(['add', '.']);
  run(['commit', '-q', '-m', 'init']);
}

function makeProvenance(overrides: Partial<HarnessProvenance> = {}): HarnessProvenance {
  return {
    harnessSha: 'abc1234',
    harnessBranch: 'dev',
    targetSha: 'def5678',
    targetBranch: 'main',
    timestamp: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeResult(pipelineId: string, ok: boolean, score: number): PipelineBenchmarkResult {
  return {
    pipeline: { id: pipelineId as any, name: `Pipeline ${pipelineId}`, transport: 'subprocess', description: '', capabilities: [] },
    status: { id: pipelineId as any, name: `Pipeline ${pipelineId}`, transport: 'subprocess', available: true, detail: 'ok' },
    run: { ok, id: pipelineId as any, stdout: '', stderr: '', durationMs: 1000 },
    score: {
      scoringVersion: 2,
      measured: true,
      testsPassed: ok,
      testExitCode: ok ? 0 : 1,
      testDurationMs: 100,
      testsTimedOut: false,
      diff: { added: ['a.ts'], removed: [], modified: [], changedFiles: ['a.ts'], linesAdded: 5, linesRemoved: 0 },
      regressionRisk: 'LOW',
      score,
      rubric: { correctness: 70, minimality: 15, focus: 10, speed: 5, total: 100 },
      reasons: [],
    },
    workdir: '',
    startedAt: Date.now(),
  };
}

function makeTarget(repoDir: string): BenchmarkTarget {
  return { repoDir, task: 'add a file' };
}

function testConfig(repoPath: string): GitConfig {
  return {
    repoPath,
    remote: 'origin',
    branch: 'main',
    userName: 'Test',
    userEmail: 'test@test.dev',
  };
}

describe('collectProvenance', () => {
  it('collects SHAs from both harness and target repos', () => {
    const harnessDir = freshRoot('harness-');
    const targetDir = freshRoot('target-');
    initGitRepo(harnessDir);
    initGitRepo(targetDir);
    const prov = collectProvenance(targetDir, harnessDir);
    expect(prov.harnessSha).toMatch(/^[0-9a-f]{7,}$/);
    expect(['main', 'master']).toContain(prov.harnessBranch);
    expect(prov.targetSha).toMatch(/^[0-9a-f]{7,}$/);
    expect(['main', 'master']).toContain(prov.targetBranch);
    expect(prov.timestamp).toBeTruthy();
  });

  it('returns undefined for non-git directories', () => {
    const dir = freshRoot('nogit-');
    const prov = collectProvenance(dir, dir);
    expect(prov.harnessSha).toBeUndefined();
    expect(prov.targetSha).toBeUndefined();
  });
});

describe('gitConfig', () => {
  it('reads from environment with defaults', () => {
    vi.stubEnv('HARNESS_RESULTS_REPO', '/tmp/results');
    vi.stubEnv('HARNESS_RESULTS_REMOTE', 'upstream');
    vi.stubEnv('HARNESS_RESULTS_BRANCH', 'develop');
    vi.stubEnv('HARNESS_GIT_USER_NAME', 'Bot');
    vi.stubEnv('HARNESS_GIT_USER_EMAIL', 'bot@test.dev');
    const config = gitConfig();
    expect(config.repoPath).toBe('/tmp/results');
    expect(config.remote).toBe('upstream');
    expect(config.branch).toBe('develop');
    expect(config.userName).toBe('Bot');
    expect(config.userEmail).toBe('bot@test.dev');
  });

  it('uses defaults when env vars are not set', () => {
    vi.stubEnv('HARNESS_RESULTS_REPO', '');
    vi.stubEnv('HARNESS_RESULTS_REMOTE', '');
    vi.stubEnv('HARNESS_RESULTS_BRANCH', '');
    vi.stubEnv('HARNESS_GIT_USER_NAME', '');
    vi.stubEnv('HARNESS_GIT_USER_EMAIL', '');
    const config = gitConfig();
    expect(config.repoPath).toBe('');
    expect(config.remote).toBe('origin');
    expect(config.branch).toBe('main');
  });
});

describe('commitResults', () => {
  it('returns error when repo path is not set', () => {
    const result = commitResults([], makeTarget('/tmp/x'), makeProvenance(), { ...testConfig('') });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('HARNESS_RESULTS_REPO not set');
  });

  it('returns error when repo path is a file', () => {
    const filePath = path.join(freshRoot('file-'), 'file.txt');
    fs.writeFileSync(filePath, 'not a dir');
    const result = commitResults([], makeTarget('/tmp/x'), makeProvenance(), testConfig(filePath));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not a directory');
  });

  it('creates a new git repo and commits results', () => {
    const repoPath = path.join(freshRoot('results-'), 'results');
    const targetDir = freshRoot('target-');
    initGitRepo(targetDir);
    const prov = makeProvenance({ targetSha: 'abc1234', targetBranch: 'main' });
    const results = [makeResult('deepseek', true, 90)];
    const result = commitResults(results, makeTarget(targetDir), prov, testConfig(repoPath));
    expect(result.ok).toBe(true);
    expect(result.commitSha).toMatch(/^[0-9a-f]{7,}$/);
    expect(result.branch).toBe('main');
    expect(result.filesCommitted).toBe(3);
    expect(fs.existsSync(path.join(repoPath, 'runs'))).toBe(true);
  });

  it('handles identical results gracefully', () => {
    const repoPath = path.join(freshRoot('results-'), 'results');
    const targetDir = freshRoot('target-');
    initGitRepo(targetDir);
    const prov = makeProvenance();
    const results = [makeResult('deepseek', true, 90)];
    const config = testConfig(repoPath);
    const first = commitResults(results, makeTarget(targetDir), prov, config);
    expect(first.ok).toBe(true);
    const second = commitResults(results, makeTarget(targetDir), prov, config);
    expect(second.ok).toBe(true);
    expect(second.commitSha).toMatch(/^[0-9a-f]{7,}$/);
  });

  it('sanitizes commit message', () => {
    const repoPath = path.join(freshRoot('results-'), 'results');
    const targetDir = freshRoot('target-');
    initGitRepo(targetDir);
    const prov = makeProvenance();
    const results = [makeResult('deepseek', true, 90)];
    const result = commitResults(results, makeTarget(targetDir), prov, testConfig(repoPath));
    expect(result.ok).toBe(true);
    const log = spawnSync('git', ['log', '--oneline'], { cwd: repoPath, encoding: 'utf-8' });
    expect(log.stdout).toContain('harness:');
  });
});

describe('pushResults', () => {
  it('returns error when repo path is not set', () => {
    const result = pushResults({ ...testConfig('') });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('HARNESS_RESULTS_REPO not set');
  });

  it('returns error when remote is not configured and no URL is set', () => {
    const repoPath = path.join(freshRoot('results-'), 'results');
    fs.mkdirSync(repoPath, { recursive: true });
    const res = spawnSync('git', ['init', '-q'], { cwd: repoPath, encoding: 'utf-8' });
    if (res.status !== 0) return;
    vi.stubEnv('HARNESS_RESULTS_REMOTE_URL', '');
    const result = pushResults(testConfig(repoPath));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not configured');
  });
});

describe('createHarnessPR', () => {
  it('returns error when GitHub env vars are not set', async () => {
    vi.stubEnv('GITHUB_TOKEN', '');
    vi.stubEnv('GITHUB_OWNER', '');
    vi.stubEnv('GITHUB_REPO', '');
    const result = await createHarnessPR([], makeTarget('/tmp/x'), makeProvenance());
    expect(result.ok).toBe(false);
    expect(result.error).toContain('GITHUB_TOKEN');
  });

  it('creates a PR with results table', async () => {
    const calls: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      calls.push({ url, init });
      const body = init?.body ? JSON.parse(init.body) : {};
      if (url.includes('/git/ref/heads/')) {
        return new Response(JSON.stringify({ object: { sha: 'abc123' } }), { status: 200 });
      }
      if (url.includes('/git/blobs')) {
        return new Response(JSON.stringify({ sha: 'blob123' }), { status: 200 });
      }
      if (url.includes('/git/trees')) {
        return new Response(JSON.stringify({ sha: 'tree123' }), { status: 200 });
      }
      if (url.includes('/git/commits')) {
        return new Response(JSON.stringify({ sha: 'commit123' }), { status: 200 });
      }
      if (url.includes('/pulls') && init?.method === 'POST') {
        return new Response(JSON.stringify({ number: 42 }), { status: 201 });
      }
      return new Response('{}', { status: 200 });
    }));
    vi.stubEnv('GITHUB_TOKEN', 'test-token');
    vi.stubEnv('GITHUB_OWNER', 'test-owner');
    vi.stubEnv('GITHUB_REPO', 'test-repo');
    const results = [makeResult('deepseek', true, 90)];
    const result = await createHarnessPR(results, makeTarget('/tmp/x'), makeProvenance());
    expect(result.ok).toBe(true);
    expect(result.prNumber).toBe(42);
    expect(result.prUrl).toBe('https://github.com/test-owner/test-repo/pull/42');
  });
});

describe('runAutopilot', () => {
  it('returns error for empty results', async () => {
    const targetDir = freshRoot('target-');
    initGitRepo(targetDir);
    const result = await runAutopilot([], makeTarget(targetDir));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('no results');
  });

  it('runs the full loop: provenance → commit → push (fails at push without remote)', async () => {
    const repoPath = path.join(freshRoot('results-'), 'results');
    const targetDir = freshRoot('target-');
    initGitRepo(targetDir);
    vi.stubEnv('HARNESS_RESULTS_REPO', repoPath);
    vi.stubEnv('HARNESS_RESULTS_REMOTE_URL', '');
    const results = [makeResult('deepseek', true, 90)];
    const result = await runAutopilot(results, makeTarget(targetDir));
    expect(result.ok).toBe(false);
    expect(result.steps.map((s) => s.name)).toEqual(['provenance', 'commit', 'push']);
    expect(result.steps[0].ok).toBe(true);
    expect(result.steps[1].ok).toBe(true);
    expect(result.steps[2].ok).toBe(false);
  });
});
