import fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  appendPipelineBenchmark,
  deepseekBareDir,
  deepseekPipeline,
  diffSnapshots,
  dshBin,
  getPipeline,
  harnessProvenance,
  installDefaultPipelines,
  isGitCheckout,
  listPipelines,
  opencodeBareDir,
  opencodeBareEntry,
  pipelineSpecs,
  pipelineStandings,
  pipelineStatuses,
  readPipelineLedger,
  registerPipeline,
  regressionRiskFor,
  resetPipelineRegistry,
  resolveTestCommand,
  runPipelineBenchmark,
  scorePipelineRun,
  snapshotDir,
  verifyPipelineRecords,
  writeWorkspaceOverlay,
  type CodingPipeline,
} from '../src/lib/codingPipelines/index.js';
import { createPipelinesRouter } from '../src/routes/pipelines';

const tmpRoots: string[] = [];
function freshRoot(prefix = 'cp-'): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpRoots.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmpRoots.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  resetPipelineRegistry();
  installDefaultPipelines();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function miniRepo(): string {
  const root = freshRoot('repo-');
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'index.ts'), 'export const a = 1;\n');
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'mini', scripts: { test: 'node --version' } }),
  );
  return root;
}

const STUB: CodingPipeline = {
  spec: {
    id: 'opencode',
    name: 'Stub',
    transport: 'subprocess',
    description: 'test stub',
    capabilities: ['test'],
  },
  async status() {
    return { id: 'opencode', name: 'Stub', transport: 'subprocess', available: true, detail: 'stub' };
  },
  async run(req) {
    fs.writeFileSync(path.join(req.workdir, 'src', 'added.ts'), 'export const added = true;\n');
    return { ok: true, id: 'opencode', stdout: 'done', stderr: '', durationMs: 1 };
  },
};

describe('pipeline registry', () => {
  it('registers the four built-in pipelines', () => {
    resetPipelineRegistry();
    installDefaultPipelines();
    expect(listPipelines().map((p) => p.spec.id).sort()).toEqual([
      'axiom',
      'deepseek',
      'opencode',
      'settlement',
    ]);
  });

  it('is idempotent and resolves by id', () => {
    resetPipelineRegistry();
    installDefaultPipelines();
    installDefaultPipelines();
    expect(listPipelines()).toHaveLength(4);
    expect(getPipeline('axiom')?.spec.name).toBe('Axiom Original');
    expect(getPipeline('nope')).toBeUndefined();
  });

  it('statuses report availability without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const statuses = await pipelineStatuses();
    expect(statuses).toHaveLength(4);
    for (const s of statuses) expect(typeof s.available).toBe('boolean');
    expect(statuses.find((s) => s.id === 'axiom')?.available).toBe(false);
  });

  it('specs carry lane-relevant capability tags', () => {
    const ids = pipelineSpecs().map((s) => s.id);
    expect(ids).toContain('settlement');
  });
});

describe('snapshot + diff', () => {
  it('detects added, modified and removed files', () => {
    const root = miniRepo();
    const before = snapshotDir(root);
    fs.writeFileSync(path.join(root, 'src', 'index.ts'), 'export const a = 2;\nexport const b = 3;\n');
    fs.writeFileSync(path.join(root, 'src', 'new.ts'), 'export const n = 1;\n');
    fs.rmSync(path.join(root, 'package.json'));
    const diff = diffSnapshots(before, snapshotDir(root));
    expect(diff.added).toContain('src/new.ts');
    expect(diff.modified).toContain('src/index.ts');
    expect(diff.removed).toContain('package.json');
    expect(diff.linesAdded).toBeGreaterThan(0);
  });
});

describe('scorer', () => {
  it('resolves the package.json test script', () => {
    expect(resolveTestCommand(miniRepo())).toBe('npm test --silent');
    expect(resolveTestCommand(miniRepo(), 'npm run custom')).toBe('npm run custom');
  });

  it('scores a passing test run above a failing one', async () => {
    const diff = { added: [], removed: [], modified: [], changedFiles: ['a.ts'], linesAdded: 5, linesRemoved: 0 };
    const root = miniRepo();
    fs.writeFileSync(path.join(root, 'pass.js'), 'process.exit(0);\n');
    fs.writeFileSync(path.join(root, 'fail.js'), 'process.exit(1);\n');
    const pass = await scorePipelineRun(root, diff, { testCommand: 'node pass.js' });
    const fail = await scorePipelineRun(root, diff, { testCommand: 'node fail.js' });
    expect(pass.testsPassed).toBe(true);
    expect(fail.testsPassed).toBe(false);
    expect(pass.score!).toBeGreaterThan(fail.score!);
    expect(fail.score).toBe(0);
  });

  it('marks tests unmeasured when no command is configured', async () => {
    const root = freshRoot('nocmd-');
    const score = await scorePipelineRun(root, {
      added: [], removed: [], modified: [], changedFiles: [], linesAdded: 0, linesRemoved: 0,
    });
    expect(score.testsPassed).toBeNull();
    expect(score.reasons.join(' ')).toContain('unmeasured');
  });

  it('forces a zero score when the pipeline run failed', async () => {
    const diff = { added: ['a.ts'], removed: [], modified: [], changedFiles: ['a.ts'], linesAdded: 5, linesRemoved: 0 };
    const score = await scorePipelineRun(miniRepo(), diff, { testCommand: 'node --version', runOk: false });
    expect(score.score).toBe(0);
    expect(score.reasons.join(' ')).toContain('pipeline run failed');
  });

  it('caps the score when a successful run changed nothing', async () => {
    const score = await scorePipelineRun(
      miniRepo(),
      { added: [], removed: [], modified: [], changedFiles: [], linesAdded: 0, linesRemoved: 0 },
      { testCommand: 'node --version' },
    );
    expect(score.score).toBeLessThanOrEqual(30);
    expect(score.reasons.join(' ')).toContain('no files changed');
  });

  it('escalates regression risk on core files', () => {
    const core = { added: [], removed: [], modified: ['package.json'], changedFiles: ['package.json'], linesAdded: 1, linesRemoved: 0 };
    expect(regressionRiskFor(core)).toBe('CRITICAL');
    const small = { added: [], removed: [], modified: ['src/x.ts'], changedFiles: ['src/x.ts'], linesAdded: 2, linesRemoved: 0 };
    expect(regressionRiskFor(small)).toBe('MINIMAL');
  });
});

describe('bare harness provenance', () => {
  it('resolves bare checkout paths from env and defaults', () => {
    const oc = freshRoot('oc-');
    vi.stubEnv('OPENCODE_BARE_DIR', oc);
    expect(opencodeBareDir()).toBe(oc);
    expect(opencodeBareEntry()).toBeNull(); // no packages/opencode/src/index.ts yet
    const ds = freshRoot('ds-');
    vi.stubEnv('DEEPSEEK_BARE_DIR', ds);
    expect(deepseekBareDir()).toBe(ds);
    expect(dshBin()).toBe(path.join(ds, 'apps', 'cli', 'lib', 'bin.js'));
  });

  it('reports a missing dsh build honestly with the fix instruction', async () => {
    vi.stubEnv('DEEPSEEK_BARE_DIR', freshRoot('ds-'));
    const status = await deepseekPipeline.status();
    expect(status.available).toBe(false);
    expect(status.detail).toContain('pnpm run build');
  });

  it('writes a dsh workspace overlay pinning fs + sandbox to the worktree', () => {
    const wd = freshRoot('overlaywd-');
    const file = writeWorkspaceOverlay(wd);
    try {
      const yml = fs.readFileSync(file, 'utf-8');
      const normalized = wd.split(path.sep).join('/');
      expect(yml).toContain('sandbox-policy');
      expect(yml).toContain('fs-sandbox');
      expect(yml).toContain(`workspaceRoot: "${normalized}"`);
      expect(yml).toContain(`cwd: "${normalized}"`);
    } finally {
      fs.rmSync(file, { force: true });
    }
  });

  it('treats a plain temp dir as not a git checkout', () => {
    const dir = freshRoot('nogit-');
    expect(isGitCheckout(dir)).toBe(false);
    expect(harnessProvenance(dir)).toBeUndefined();
  });

  it('reads branch@rev provenance from a real git checkout', () => {
    const dir = freshRoot('gitrepo-');
    const run = (args: string[]) => {
      const res = spawnSync('git', args, { cwd: dir, encoding: 'utf-8' });
      if (res.status !== 0) throw new Error(res.stderr || 'git failed');
    };
    run(['init', '-q']);
    run(['config', 'user.email', 't@t.dev']);
    run(['config', 'user.name', 't']);
    fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
    run(['add', '.']);
    run(['commit', '-q', '-m', 'init']);
    const rev = harnessProvenance(dir);
    expect(rev).toBeTruthy();
    expect(rev).toMatch(/@[0-9a-f]{4,}/);
  });
});

describe('unified runner', () => {
  beforeEach(() => {
    resetPipelineRegistry();
    registerPipeline(STUB);
  });

  it('dispatches to the selected pipeline on a copied worktree and scores the diff', async () => {
    const repo = miniRepo();
    const res = await runPipelineBenchmark('opencode', {
      repoDir: repo,
      task: 'add a file',
      testCommand: 'node --version',
    });
    expect(res.run.ok).toBe(true);
    expect(res.score.diff.changedFiles).toContain('src/added.ts');
    expect(res.score.testsPassed).toBe(true);
    expect(res.pipeline.id).toBe('opencode');
    // Original repo untouched.
    expect(fs.existsSync(path.join(repo, 'src', 'added.ts'))).toBe(false);
  });

  it('leaves the worktree in place when keepWorktree is set', async () => {
    const parent = freshRoot('wtroot-');
    const res = await runPipelineBenchmark('opencode', {
      repoDir: miniRepo(),
      task: 'add a file',
      testCommand: 'node --version',
      keepWorktree: true,
      worktreeRoot: parent,
    });
    expect(fs.existsSync(path.join(res.workdir, 'src', 'added.ts'))).toBe(true);
  });

  it('reports an unknown pipeline id honestly', async () => {
    await expect(runPipelineBenchmark('ghost', { repoDir: miniRepo(), task: 'x' })).rejects.toThrow('unknown pipeline');
  });
});

describe('pipeline ledger', () => {
  it('hash-chains records and aggregates standings', () => {
    const file = path.join(freshRoot('led-'), 'ledger.jsonl');
    const base = {
      pipeline: 'opencode' as const,
      pipelineName: 'OpenCode',
      task: 't',
      repoDir: 'r',
      ok: true,
      score: 90,
      testsPassed: true,
      filesChanged: 1,
      linesAdded: 3,
      linesRemoved: 0,
      regressionRisk: 'LOW',
      durationMs: 5,
    };
    appendPipelineBenchmark(base, file);
    appendPipelineBenchmark({ ...base, pipeline: 'axiom', pipelineName: 'Axiom Original', score: 40 }, file);
    const records = readPipelineLedger(file);
    expect(records).toHaveLength(2);
    expect(verifyPipelineRecords(records).valid).toBe(true);
    const standings = pipelineStandings(file);
    expect(standings[0].pipeline).toBe('opencode');
    expect(standings.find((s) => s.pipeline === 'axiom')?.avgScore).toBe(40);
  });

  it('detects a tampered record', () => {
    const file = path.join(freshRoot('led-'), 'ledger.jsonl');
    appendPipelineBenchmark(
      { pipeline: 'opencode', pipelineName: 'O', task: 't', repoDir: 'r', ok: true, score: 90, testsPassed: true, filesChanged: 1, linesAdded: 3, linesRemoved: 0, regressionRisk: 'LOW', durationMs: 5 },
      file,
    );
    const records = readPipelineLedger(file);
    records[0].score = 1;
    expect(verifyPipelineRecords(records).valid).toBe(false);
  });
});

describe('pipelines router', () => {
  it('GET /coding-pipelines lists the registry with per-pipeline status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const router = createPipelinesRouter();
    const layer = ((router as any).stack).find((l: any) => l?.route?.path === '/coding-pipelines');
    const res = { json: vi.fn() } as any;
    await layer.route.stack[0].handle({ method: 'GET' } as any, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.count).toBe(4);
    expect(payload.pipelines[0].status).toBeTruthy();
  });

  it('POST /coding-pipelines/benchmark rejects an invalid payload', async () => {
    vi.stubEnv('RECOURSE_API_SECRET', '');
    const router = createPipelinesRouter();
    const layer = ((router as any).stack).find((l: any) => l?.route?.path === '/coding-pipelines/benchmark');
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    await layer.route.stack[0].handle({ method: 'POST', body: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toContain('invalid payload');
  });

  it('GET /coding-pipelines/ledger reports chain integrity', () => {
    const router = createPipelinesRouter();
    const layer = ((router as any).stack).find((l: any) => l?.route?.path === '/coding-pipelines/ledger');
    const res = { json: vi.fn() } as any;
    layer.route.stack[0].handle({ method: 'GET' } as any, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.integrity.valid).toBe(true);
  });
});
