import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  parsePlannedCode,
  parsePlannedChange,
  tryParsePlannedChange,
  validatePlannedChange,
  createCodePlanner,
  isSafeRepoPath,
  MAX_PLANNER_BYTES,
  MAX_PLANNED_FILES,
} from '../src/autopilot/codePlanner';
import { UpgradeProposal } from '../src/autopilot/loopTypes';
import { generateUpgrade } from '../src/autopilot/upgradeGenerator';
import { DEFAULT_EXECUTORS } from '../src/autopilot/preMergeGate';
import type { GapT } from '../src/autopilot/loopTypes';
import type { BusinessProfileT } from '../src/autopilot/businessProfile';

const gap = {
  id: 'g1',
  description: 'Implement input sanitization',
  tier: 'A',
  fixability: 0.6,
  risk: 0.3,
  affectedDimensions: ['securityPosture'],
} as unknown as GapT;
const profile = { business: { name: 'Acme' } } as unknown as BusinessProfileT;

const good = JSON.stringify({
  file: 'src/sanitize.js',
  content: 'export function sanitize(s) { return String(s).replace(/[<>]/g, ""); }',
  acceptanceTest: 'assert sanitize("<x>") === "x";',
  functionName: 'sanitize',
});

/** A three-file change that imports an existing repo module. */
const threeFilePlan = JSON.stringify({
  files: [
    { file: 'src/sanitize/core.ts', action: 'create', content: 'export const PATTERN = /[<>]/g;\nexport function scrub(s) { return String(s).replace(PATTERN, ""); }' },
    { file: 'src/sanitize/index.ts', action: 'create', content: "import { scrub } from './core';\nexport const sanitize = scrub;" },
    { file: 'src/sanitize/index.test.ts', action: 'create', content: "import { expect, it } from 'vitest';\nimport { sanitize } from './index';\nit('scrubs', () => { expect(sanitize('<x>')).toBe('x'); });" },
  ],
  acceptanceTest: 'assert sanitize("<x>") === "x";',
  functionName: 'sanitize',
  imports: ['src/lib/calibration.ts'],
  testFile: 'src/sanitize/index.test.ts',
});

function makeRepo(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-planner-'));
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body, 'utf8');
  }
  return dir;
}

describe('isSafeRepoPath', () => {
  it('refuses traversal, absolute paths and protected directories', () => {
    expect(isSafeRepoPath('src/a.ts')).toBe(true);
    expect(isSafeRepoPath('../etc/passwd')).toBe(false);
    expect(isSafeRepoPath('a/../../b.ts')).toBe(false);
    expect(isSafeRepoPath('/abs.js')).toBe(false);
    expect(isSafeRepoPath('C:/win.js')).toBe(false);
    expect(isSafeRepoPath('node_modules/evil/index.js')).toBe(false);
    expect(isSafeRepoPath('.git/config')).toBe(false);
    expect(isSafeRepoPath('src/../secrets/x.ts')).toBe(false);
    expect(isSafeRepoPath('keys/server.pem')).toBe(false);
    expect(isSafeRepoPath('.env')).toBe(false);
    expect(isSafeRepoPath('')).toBe(false);
  });
});

describe('parsePlannedCode (legacy single-file view)', () => {
  it('accepts a valid fenced json block', () => {
    const parsed = parsePlannedCode('sure:\n```json\n' + good + '\n```');
    expect(parsed?.file).toBe('src/sanitize.js');
    expect(parsed?.functionName).toBe('sanitize');
  });

  it('rejects traversal, absolute paths, missing tests and oversize content', () => {
    expect(parsePlannedCode(JSON.stringify({ file: '../etc.js', content: 'x', acceptanceTest: 'assert true;' }))).toBeNull();
    expect(parsePlannedCode(JSON.stringify({ file: '/abs.js', content: 'x', acceptanceTest: 'assert true;' }))).toBeNull();
    expect(parsePlannedCode(JSON.stringify({ file: 'a.js', content: 'x', acceptanceTest: '' }))).toBeNull();
    const huge = 'a'.repeat(MAX_PLANNER_BYTES + 1);
    expect(parsePlannedCode(JSON.stringify({ file: 'a.js', content: huge, acceptanceTest: 'assert true;' }))).toBeNull();
    expect(parsePlannedCode('not json')).toBeNull();
    expect(parsePlannedCode(null)).toBeNull();
  });

  it('has no single `file` to return for a multi-file change', () => {
    expect(parsePlannedCode(threeFilePlan)).toBeNull();
  });
});

describe('parsePlannedChange', () => {
  it('parses a multi-file plan that imports an existing repo module', () => {
    const change = parsePlannedChange('```json\n' + threeFilePlan + '\n```');
    expect(change?.files).toHaveLength(3);
    expect(change?.files.map((f) => f.file)).toEqual([
      'src/sanitize/core.ts',
      'src/sanitize/index.ts',
      'src/sanitize/index.test.ts',
    ]);
    expect(change?.imports).toEqual(['src/lib/calibration.ts']);
    expect(change?.testFile).toBe('src/sanitize/index.test.ts');
    expect(change?.acceptanceTest).toContain('sanitize');
  });

  it('wraps a legacy single-file payload into the multi-file shape', () => {
    const change = parsePlannedChange(good);
    expect(change?.files).toHaveLength(1);
    expect(change?.files[0]).toEqual({ file: 'src/sanitize.js', content: expect.stringContaining('sanitize') });
  });

  it('rejects a `..` path, a node_modules path and more than MAX_PLANNED_FILES files', () => {
    const traversal = JSON.stringify({
      files: [{ file: '../outside.ts', content: 'x' }],
      acceptanceTest: 'assert true;',
    });
    expect(tryParsePlannedChange(traversal).ok).toBe(false);

    const nodeModules = JSON.stringify({
      files: [{ file: 'node_modules/x/index.js', content: 'x' }],
      acceptanceTest: 'assert true;',
    });
    expect(tryParsePlannedChange(nodeModules).ok).toBe(false);

    const tooMany = JSON.stringify({
      files: Array.from({ length: MAX_PLANNED_FILES + 1 }, (_, i) => ({ file: `src/f${i}.ts`, content: 'x' })),
      acceptanceTest: 'assert true;',
    });
    const parsed = tryParsePlannedChange(tooMany);
    expect(parsed.ok).toBe(false);
    expect(parsed.ok === false && parsed.reason).toBe('too_many_files');

    const exactly = JSON.stringify({
      files: Array.from({ length: MAX_PLANNED_FILES }, (_, i) => ({ file: `src/f${i}.ts`, content: 'x' })),
      acceptanceTest: 'assert true;',
    });
    expect(tryParsePlannedChange(exactly).ok).toBe(true);
  });

  it('rejects duplicate paths, empty content, an unsafe testFile and a missing acceptanceTest', () => {
    const cases: Array<[unknown, string]> = [
      [{ files: [{ file: 'a.ts', content: 'x' }, { file: 'A.TS', content: 'y' }], acceptanceTest: 'assert true;' }, 'duplicate_path'],
      [{ files: [{ file: 'a.ts', content: '   ' }], acceptanceTest: 'assert true;' }, 'empty_content'],
      [{ files: [{ file: 'a.ts', content: 'x' }], acceptanceTest: '', testFile: 'tests/a.test.ts' }, 'no_acceptance_test'],
      [{ files: [{ file: 'a.ts', content: 'x' }], acceptanceTest: 'assert true;', testFile: '../x.test.ts' }, 'unsafe_path'],
      [{ acceptanceTest: 'assert true;' }, 'no_files'],
    ];
    for (const [input, reason] of cases) {
      const parsed = validatePlannedChange(input);
      expect(parsed.ok).toBe(false);
      expect(parsed.ok === false && parsed.reason).toBe(reason);
    }
  });

  it('caps one file and the total across files', () => {
    const oneBig = validatePlannedChange({
      files: [{ file: 'a.ts', content: 'a'.repeat(200) }],
      acceptanceTest: 'assert true;',
    }, { maxFileBytes: 100 });
    expect(oneBig.ok === false && oneBig.reason).toBe('oversize');

    const total = validatePlannedChange({
      files: [
        { file: 'a.ts', content: 'a'.repeat(80) },
        { file: 'b.ts', content: 'b'.repeat(80) },
      ],
      acceptanceTest: 'assert true;',
    }, { maxTotalBytes: 100 });
    expect(total.ok === false && total.reason).toBe('oversize');
  });
});

describe('createCodePlanner', () => {
  it('returns a PlannedChange from a real model response', async () => {
    const chat = vi.fn(async () => ({ ok: true, content: '```json\n' + good + '\n```' }));
    const planner = createCodePlanner(chat as never);
    const planned = await planner(gap, profile);
    expect(planned?.files[0].file).toBe('src/sanitize.js');
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it('injects ranked REPO CONTEXT so the plan can import existing modules', async () => {
    let prompt = '';
    const chat = vi.fn(async (messages: Array<{ content: string }>) => {
      prompt = messages[0].content;
      return { ok: true, content: '```json\n' + good + '\n```' };
    });
    const planner = createCodePlanner(chat as never, {
      repoIndex: [
        { file: 'src/lib/calibration.ts', name: 'brierScore', kind: 'function', summary: 'Brier score for forecasts' },
        { file: 'src/lib/wallet.ts', name: 'readWallet', kind: 'function', summary: 'wallet balances' },
      ],
      contextEntries: 1,
    });
    await planner({ ...gap, description: 'the brier score for forecasts is wrong' } as GapT, profile);
    expect(prompt).toContain('REPO CONTEXT');
    expect(prompt).toContain('src/lib/calibration.ts :: brierScore');
    expect(prompt).not.toContain('readWallet');
    expect(prompt).not.toContain('NO imports');
    expect(prompt).toContain('files');
  });

  it('says the context is unavailable rather than pretending it knows the repo', async () => {
    let prompt = '';
    const planner = createCodePlanner(
      (async (messages: Array<{ content: string }>) => {
        prompt = messages[0].content;
        return { ok: true, content: '```json\n' + good + '\n```' };
      }) as never,
    );
    await planner(gap, profile);
    expect(prompt).toContain('REPO CONTEXT');
    expect(prompt).toContain('unavailable');
  });

  it('returns null honestly when the model is offline or output is unusable', async () => {
    const offline = createCodePlanner((async () => ({ ok: false, content: null, error: 'offline' })) as never);
    expect(await offline(gap, profile)).toBeNull();

    const junk = createCodePlanner((async () => ({ ok: true, content: 'no json here' })) as never);
    expect(await junk(gap, profile)).toBeNull();

    const throws = createCodePlanner((async () => { throw new Error('boom'); }) as never);
    expect(await throws(gap, profile)).toBeNull();

    const overCap = createCodePlanner(
      (async () => ({
        ok: true,
        content: '```json\n' + JSON.stringify({ files: [{ file: 'a.ts', content: 'x'.repeat(500) }, { file: 'b.ts', content: 'y'.repeat(500) }], acceptanceTest: 'assert true;' }) + '\n```',
      })) as never,
      { maxBytes: 100 },
    );
    expect(await overCap(gap, profile)).toBeNull();
  });

  it('reads the repo index from a real root when one is supplied', async () => {
    const root = makeRepo({ 'src/lib/calibration.ts': '/** Brier score for forecasts. */\nexport function brierScore(): number { return 0; }\n' });
    try {
      let prompt = '';
      const planner = createCodePlanner(
        (async (messages: Array<{ content: string }>) => {
          prompt = messages[0].content;
          return { ok: true, content: '```json\n' + good + '\n```' };
        }) as never,
        { repoRoot: root, contextEntries: 3 },
      );
      await planner({ ...gap, description: 'brier score is wrong' } as GapT, profile);
      expect(prompt).toContain('src/lib/calibration.ts :: brierScore');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('end-to-end: a 3-file plan that imports an existing module', () => {
  // Type-clean on purpose: lane B runs the real tsc, so a fixture with a type
  // error would be refused for the wrong reason.
  const cleanThreeFiles = [
    { file: 'src/sanitize/pattern.ts', action: 'create' as const, content: 'export const PATTERN: RegExp = /[<>]/g;\n' },
    { file: 'src/sanitize/core.ts', action: 'create' as const, content: 'import { PATTERN } from "./pattern";\nexport function scrub(s: string): string { return String(s).replace(PATTERN, ""); }\n' },
    { file: 'src/sanitize/index.ts', action: 'create' as const, content: 'import { scrub } from "./core";\nexport const sanitize: (s: string) => string = scrub;\n' },
  ];

  function laneBProposal(files: typeof cleanThreeFiles) {
    return UpgradeProposal.parse({
      id: 'p1', gapId: 'g1', tier: 'A', title: 'sanitize', description: 'sanitize input',
      files: files.map((f) => ({ path: f.file, action: f.action, content: f.content })),
      expectedScoreDelta: {}, generatedAt: new Date().toISOString(),
      requiresSandboxVerify: true,
      verification: {
        files: files.map((f) => f.file),
        acceptanceTest: 'assert sanitize("<x>") === "x";',
        imports: ['src/lib/calibration.ts'],
      },
    });
  }

  function laneBRepo(): string {
    return makeRepo({
      'package.json': JSON.stringify({ name: 'lane-b-fixture', private: true, type: 'module' }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', strict: true, noEmit: true, skipLibCheck: true },
        include: ['src'],
      }),
      'src/lib/calibration.ts': 'export function brierScore(f: number[]): number { return f.length; }\n',
    });
  }

  it('routes to lane B and proves the change with a real typecheck', async () => {
    const root = laneBRepo();
    try {
      const result = await DEFAULT_EXECUTORS.sandbox({
        repoPath: root, changedFiles: [], repoBinding: null, proposal: laneBProposal(cleanThreeFiles),
      });
      expect(result.passed).toBe(true);
      expect(result.output).toMatch(/lane_b typecheck passed/);
      // Nothing was written into the live tree.
      expect(fs.existsSync(path.join(root, 'src', 'sanitize'))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('lane B fails on a real type error instead of falling back to the sandbox', async () => {
    const root = laneBRepo();
    try {
      const broken = [
        cleanThreeFiles[0],
        { ...cleanThreeFiles[1], content: 'import { PATTERN } from "./pattern";\nexport function scrub(s) { return String(s).replace(PATTERN, ""); }\n' },
        cleanThreeFiles[2],
      ];
      const result = await DEFAULT_EXECUTORS.sandbox({
        repoPath: root, changedFiles: [], repoBinding: null, proposal: laneBProposal(broken),
      });
      expect(result.passed).toBe(false);
      expect(result.output).toMatch(/tsc failed/);
      expect(result.output).toContain('core.ts');
      expect(fs.existsSync(path.join(root, 'src', 'sanitize'))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('lane A refuses two files that declare the same top-level name', async () => {
    const proposal = UpgradeProposal.parse({
      id: 'p2', gapId: 'g1', tier: 'A', title: 'collide', description: 'collide',
      files: [
        { path: 'a.js', action: 'create', content: 'const shared = 1;' },
        { path: 'b.js', action: 'create', content: 'const shared = 2;' },
      ],
      expectedScoreDelta: {}, generatedAt: new Date().toISOString(),
      requiresSandboxVerify: true,
      verification: { files: ['a.js', 'b.js'], acceptanceTest: 'assert shared === 1;' },
    });
    const root = makeRepo({});
    try {
      const result = await DEFAULT_EXECUTORS.sandbox({
        repoPath: root, changedFiles: [], repoBinding: null, proposal,
      });
      expect(result.passed).toBe(false);
      expect(result.error).toMatch(/collision/);
      expect(result.output).toContain('a.js, b.js');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('lane A flattens a 3-file plan with no collisions and runs the suite', async () => {
    const proposal = UpgradeProposal.parse({
      id: 'p3', gapId: 'g1', tier: 'A', title: 'sanitize', description: 'sanitize input',
      files: [
        { path: 'core.js', action: 'create', content: 'const PATTERN = /[<>]/g;\nfunction scrub(s) { return String(s).replace(PATTERN, ""); }' },
        { path: 'mid.js', action: 'create', content: 'const wrapped = (s) => scrub(s);' },
        { path: 'index.js', action: 'create', content: 'const sanitize = wrapped;' },
      ],
      expectedScoreDelta: {}, generatedAt: new Date().toISOString(),
      requiresSandboxVerify: true,
      verification: { files: ['core.js', 'mid.js', 'index.js'], acceptanceTest: 'assert sanitize("<x>") === "x";' },
    });
    const root = makeRepo({});
    try {
      const result = await DEFAULT_EXECUTORS.sandbox({
        repoPath: root, changedFiles: [], repoBinding: null, proposal,
      });
      expect(result.passed).toBe(true);
      expect(result.output).toContain('core.js, mid.js, index.js');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses a verification that names a file the proposal does not contain', async () => {
    const proposal = UpgradeProposal.parse({
      id: 'p4', gapId: 'g1', tier: 'A', title: 'sanitize', description: 'sanitize input',
      files: [{ path: 'a.js', action: 'create', content: 'const a = 1;' }],
      expectedScoreDelta: {}, generatedAt: new Date().toISOString(),
      requiresSandboxVerify: true,
      verification: { files: ['missing.js'], acceptanceTest: 'assert true;' },
    });
    const root = makeRepo({});
    try {
      const result = await DEFAULT_EXECUTORS.sandbox({
        repoPath: root, changedFiles: [], repoBinding: null, proposal,
      });
      expect(result.passed).toBe(false);
      expect(result.output).toMatch(/proposal has none of them/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('generateUpgrade with a multi-file plan', () => {
  it('emits one proposal file per planned file and carries the imports', async () => {
    const change = parsePlannedChange(threeFilePlan)!;
    const proposal = await generateUpgrade(gap, profile, { planner: async () => change });
    expect(proposal.files.map((f) => f.path)).toEqual([
      'src/sanitize/core.ts',
      'src/sanitize/index.ts',
      'src/sanitize/index.test.ts',
    ]);
    expect(proposal.files[1].content).toContain("from './core'");
    expect(proposal.verification?.files).toHaveLength(3);
    expect(proposal.verification?.imports).toEqual(['src/lib/calibration.ts']);
    expect(proposal.verification?.testFile).toBe('src/sanitize/index.test.ts');
    expect(proposal.skipped).toBeUndefined();
    expect(proposal.description).toMatch(/materialize \+ typecheck \+ vitest lane/);
  });

  it('keeps a modify action from the plan', async () => {
    const proposal = await generateUpgrade(gap, profile, {
      planner: async () => ({
        files: [{ file: 'src/existing.ts', action: 'modify', content: 'export const a = 1;' }],
        acceptanceTest: 'assert a === 1;',
      }),
    });
    expect(proposal.files[0].action).toBe('modify');
    expect(proposal.verification?.files).toEqual(['src/existing.ts']);
  });
});