import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSkillToolProvider } from '../src/lib/skillTools.js';
import type { SkillDef, SkillRoot } from '../src/skills/types.js';

let rootDir: string;
let skill: SkillDef;
let root: SkillRoot;

function provider(overrides: Record<string, unknown> = {}) {
  return createSkillToolProvider({
    ensureCatalog: async () => [skill],
    getRoots: () => [root],
    ...overrides,
  });
}

beforeAll(() => {
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-skill-'));
  const dir = path.join(rootDir, 'demo');
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: test-skill\ndescription: A test skill\n---\n# Test\nDo the thing.\n');
  fs.writeFileSync(path.join(dir, 'reference.md'), '# Reference\nDetails.');
  fs.writeFileSync(path.join(dir, 'scripts', 'hello.js'), 'console.log(JSON.stringify({ hi: process.argv.slice(2) }));\n');
  fs.writeFileSync(path.join(dir, 'scripts', 'sleep.js'), 'setTimeout(() => console.log("done"), 5000);\n');
  fs.writeFileSync(path.join(dir, 'scripts', 'legacy.rb'), "puts 'x'\n");

  skill = {
    id: 'fleet-skills:demo',
    name: 'test-skill',
    description: 'A test skill',
    rootId: 'fleet-skills',
    rel: 'demo/SKILL.md',
    dir: 'demo',
    words: 4,
    excerpt: 'Do the thing.',
    topics: [],
    hasScripts: true,
    files: ['reference.md', 'scripts/hello.js', 'scripts/sleep.js', 'scripts/legacy.rb'],
    frontmatterKeys: ['name', 'description'],
    mtime: Date.now(),
  };
  root = { id: 'fleet-skills', root: rootDir };
});

afterAll(() => {
  try { fs.rmSync(rootDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe('createSkillToolProvider — list/read/file', () => {
  it('exposes the four skill tools', async () => {
    const names = (await provider().list()).map((s) => s.name).sort();
    expect(names).toEqual(['file', 'list', 'read', 'run']);
  });

  it('lists the catalog with a query filter', async () => {
    const p = provider();
    const all = await p.invoke('list', {});
    expect(all.ok).toBe(true);
    expect((all.result as any).skills[0]).toMatchObject({ name: 'test-skill', rootId: 'fleet-skills', hasScripts: true });

    const miss = await p.invoke('list', { query: 'zzz-nothing' });
    expect((miss.result as any).returned).toBe(0);
  });

  it('reads SKILL.md and one listed supporting file', async () => {
    const p = provider();
    const read = await p.invoke('read', { name: 'test-skill' });
    expect(read.ok).toBe(true);
    expect((read.result as any).text).toContain('Do the thing.');
    expect((read.result as any).files).toContain('reference.md');

    const file = await p.invoke('file', { dir: 'demo', file: 'reference.md' });
    expect(file.ok).toBe(true);
    expect((file.result as any).text).toContain('# Reference');
  });

  it('refuses unlisted files and traversal', async () => {
    const p = provider();
    const unlisted = await p.invoke('file', { name: 'test-skill', file: '../SKILL.md' });
    expect(unlisted.ok).toBe(false);
    expect(unlisted.error).toMatch(/invalid file path/);

    const notListed = await p.invoke('file', { name: 'test-skill', file: 'secret.txt' });
    expect(notListed.ok).toBe(false);
    expect(notListed.error).toMatch(/not a listed supporting file/);
  });

  it('reports an unknown skill honestly', async () => {
    const res = await provider().invoke('read', { name: 'nope' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/no skill matched/);
  });
});

describe('createSkillToolProvider — run', () => {
  it('executes a bundled node script and returns real stdout/exit code', async () => {
    const res = await provider().invoke('run', { name: 'test-skill', script: 'scripts/hello.js', args: ['a', 'b'] });
    expect(res.ok).toBe(true);
    const result = res.result as any;
    expect(result.interpreter).toBe('node');
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ hi: ['a', 'b'] });
  });

  it('reports a timeout instead of hanging', async () => {
    const res = await provider().invoke('run', { name: 'test-skill', script: 'scripts/sleep.js', timeoutMs: 1000 });
    expect(res.ok).toBe(false);
    expect((res.result as any).timedOut).toBe(true);
    expect(res.error).toMatch(/timed out/);
  }, 15000);

  it('refuses unsupported script types and unlisted scripts', async () => {
    const p = provider();
    const rb = await p.invoke('run', { name: 'test-skill', script: 'scripts/legacy.rb' });
    expect(rb.ok).toBe(false);
    expect(rb.error).toMatch(/unsupported script type/);

    const unlisted = await p.invoke('run', { name: 'test-skill', script: 'SKILL.md' });
    expect(unlisted.ok).toBe(false);
    expect(unlisted.error).toMatch(/not a listed supporting file/);
  });

  it('honors the AGENT_SKILLS_EXEC=0 kill switch', async () => {
    const res = await provider({ execEnabled: false }).invoke('run', { name: 'test-skill', script: 'scripts/hello.js' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/disabled/);
  });
});
