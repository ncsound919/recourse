import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { resolveChangesDir, scanSpecQueue, verifySpecDir } from '../src/lib/specQueue';

let tmpRoot = '';
let changesDir = '';
let savedEnv: string | undefined;

function writeSpec(name: string, files: { proposal?: string; design?: string; tasks?: string }): string {
  const dir = path.join(changesDir, name);
  fs.mkdirSync(dir, { recursive: true });
  if (files.proposal !== undefined) fs.writeFileSync(path.join(dir, 'proposal.md'), files.proposal);
  if (files.design !== undefined) fs.writeFileSync(path.join(dir, 'design.md'), files.design);
  if (files.tasks !== undefined) fs.writeFileSync(path.join(dir, 'tasks.md'), files.tasks);
  return dir;
}

const GOOD_PROPOSAL = '# Add foo\n\nThis proposal describes adding foo to the system in enough detail to exceed fifty characters.';
const GOOD_DESIGN = '# Design\n\nComponents and interfaces.';
const DONE_TASKS = '- [x] Write code\n- [x] Write tests\n';
const PARTIAL_TASKS = '- [x] Write code\n- [ ] Write tests\n';

beforeEach(() => {
  savedEnv = process.env.OPENSPEC_CHANGES_DIR;
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-queue-'));
  changesDir = path.join(tmpRoot, 'openspec', 'changes');
  fs.mkdirSync(changesDir, { recursive: true });
  process.env.OPENSPEC_CHANGES_DIR = changesDir;
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env.OPENSPEC_CHANGES_DIR;
  else process.env.OPENSPEC_CHANGES_DIR = savedEnv;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('specQueue (deterministic, no LLM)', () => {
  it('resolveChangesDir respects OPENSPEC_CHANGES_DIR and never throws', () => {
    const r = resolveChangesDir();
    expect(r.path).toBe(changesDir);
    expect(r.exists).toBe(true);
  });

  it('resolveChangesDir reports exists:false for a missing dir without throwing', () => {
    process.env.OPENSPEC_CHANGES_DIR = path.join(tmpRoot, 'does-not-exist');
    const r = resolveChangesDir();
    expect(r.exists).toBe(false);
    expect(typeof r.path).toBe('string');
  });

  it('scans a fixture dir with correct counts and flags', () => {
    writeSpec('alpha', { proposal: GOOD_PROPOSAL, design: GOOD_DESIGN, tasks: DONE_TASKS });
    writeSpec('beta', { proposal: GOOD_PROPOSAL, tasks: PARTIAL_TASKS });
    const specs = scanSpecQueue(changesDir);
    expect(specs.map((s) => s.name)).toEqual(['alpha', 'beta']);

    const alpha = specs.find((s) => s.name === 'alpha')!;
    expect(alpha.hasProposal).toBe(true);
    expect(alpha.hasDesign).toBe(true);
    expect(alpha.hasTasks).toBe(true);
    expect(alpha.taskCounts).toEqual({ total: 2, done: 2 });
    expect(alpha.complete).toBe(true);

    const beta = specs.find((s) => s.name === 'beta')!;
    expect(beta.hasDesign).toBe(false);
    expect(beta.taskCounts).toEqual({ total: 2, done: 1 });
    expect(beta.complete).toBe(false);
  });

  it('counts uppercase [X] as done and ignores non-task lines', () => {
    writeSpec('gamma', {
      proposal: GOOD_PROPOSAL,
      design: GOOD_DESIGN,
      tasks: '# Tasks\n- [X] One\n- [ ] Two\nJust a dash - not a task\n',
    });
    const specs = scanSpecQueue(changesDir);
    expect(specs[0].taskCounts).toEqual({ total: 2, done: 1 });
    expect(specs[0].complete).toBe(false);
  });

  it('verify passes on a complete spec with an honest no-attachments skip', () => {
    writeSpec('alpha', { proposal: GOOD_PROPOSAL, design: GOOD_DESIGN, tasks: DONE_TASKS });
    const v = verifySpecDir(changesDir, 'alpha');
    expect(v.name).toBe('alpha');
    expect(v.passed).toBe(true);
    expect(v.checks.map((c) => c.check)).toEqual([
      'proposal-exists',
      'design-exists',
      'tasks-exist',
      'proposal-substance',
      'code-attachments',
    ]);
    expect(v.checks.every((c) => c.passed)).toBe(true);
    expect(v.checks.find((c) => c.check === 'code-attachments')!.detail).toBe('no verifiable attachments');
  });

  it('verify fails substance on a TODO-only proposal', () => {
    writeSpec('thin', { proposal: 'TODO', design: GOOD_DESIGN, tasks: DONE_TASKS });
    const v = verifySpecDir(changesDir, 'thin');
    expect(v.passed).toBe(false);
    expect(v.checks.find((c) => c.check === 'proposal-substance')!.passed).toBe(false);
  });

  it('verify fails tasks-exist when tasks.md has no checklist', () => {
    writeSpec('notasks', { proposal: GOOD_PROPOSAL, design: GOOD_DESIGN, tasks: 'No checklist here.\n' });
    const v = verifySpecDir(changesDir, 'notasks');
    expect(v.passed).toBe(false);
    expect(v.checks.find((c) => c.check === 'tasks-exist')!.passed).toBe(false);
  });

  it('verify executes recourse-verify attachments through the real sandbox', () => {
    const fence =
      '```recourse-verify\n' +
      JSON.stringify({
        sourceCode: 'export function add(a, b) { return a + b; }',
        testSuiteCode: 'assert add(2, 3) === 5;',
      }) +
      '\n```\n';
    writeSpec('wired', { proposal: GOOD_PROPOSAL, design: GOOD_DESIGN, tasks: DONE_TASKS + '\n' + fence });
    const v = verifySpecDir(changesDir, 'wired');
    const code = v.checks.find((c) => c.check === 'code-attachment-1')!;
    expect(code.passed).toBe(true);
    expect(v.passed).toBe(true);
  });

  it('verify reports honestly when a recourse-verify attachment FAILS', () => {
    const fence =
      '```recourse-verify\n' +
      JSON.stringify({
        sourceCode: 'export function add(a, b) { return a - b; }',
        testSuiteCode: 'assert add(2, 3) === 5;',
      }) +
      '\n```\n';
    writeSpec('broken', { proposal: GOOD_PROPOSAL, design: GOOD_DESIGN, tasks: DONE_TASKS + '\n' + fence });
    const v = verifySpecDir(changesDir, 'broken');
    expect(v.passed).toBe(false);
    expect(v.checks.find((c) => c.check === 'code-attachment-1')!.passed).toBe(false);
  });

  it('verify returns passed:false (404-style) for a missing spec', () => {
    const v = verifySpecDir(changesDir, 'nope');
    expect(v.passed).toBe(false);
    expect(v.checks[0].check).toBe('spec-exists');
    expect(v.checks[0].passed).toBe(false);
  });

  it('verify rejects path traversal as not found', () => {
    const v = verifySpecDir(changesDir, '../evil');
    expect(v.passed).toBe(false);
    expect(v.checks[0].passed).toBe(false);
  });

  it('scan returns [] for a missing dir (empty handling, never throws)', () => {
    expect(scanSpecQueue(path.join(tmpRoot, 'missing'))).toEqual([]);
    expect(scanSpecQueue('')).toEqual([]);
  });
});
