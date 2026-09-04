import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { scanSkillRoot, scanSkillLibraries, parseSkillDoc } from '../src/skills/scanner';
import { summarize, skillDigest, searchSkills } from '../src/skills/index';
import type { SkillRoot } from '../src/skills/types';

describe('skill scanner (real files)', () => {
  let base: string;

  beforeAll(async () => {
    base = await fs.mkdtemp(path.join(os.tmpdir(), 'recourse-skills-test-'));
    // Library A: two skills, one with scripts; plus a nested doc translation mirror.
    await fs.mkdir(path.join(base, 'libA', 'skills', 'claude-api', 'python'), { recursive: true });
    await fs.mkdir(path.join(base, 'libA', 'skills', 'clone-repo'), { recursive: true });
    await fs.mkdir(path.join(base, 'libA', 'node_modules', 'x'), { recursive: true });
    await fs.mkdir(path.join(base, 'libA', 'docs', 'ja-JP', 'skills', 'claude-api'), { recursive: true });

    await fs.writeFile(
      path.join(base, 'libA', 'skills', 'claude-api', 'SKILL.md'),
      '---\nname: claude-api\ndescription: "Build apps with the Claude API or Anthropic SDK."\n---\n\n# Claude API\nReal body about LLM apps.',
    );
    await fs.writeFile(path.join(base, 'libA', 'skills', 'claude-api', 'python', 'claude-api.md'), '# Python notes');
    await fs.writeFile(path.join(base, 'libA', 'skills', 'clone-repo', 'SKILL.md'), '---\nname: clone-repo\ndescription: "Clone and inspect a git repository"\n---\n\nRun the clone script.\n');
    await fs.writeFile(path.join(base, 'libA', 'skills', 'clone-repo', 'clone.sh'), '#!/bin/sh\ngit clone "$1"\n');
    await fs.writeFile(path.join(base, 'libA', 'node_modules', 'x', 'SKILL.md'), 'noise'); // pruned
    await fs.writeFile(path.join(base, 'libA', 'docs', 'ja-JP', 'skills', 'claude-api', 'SKILL.md'), '---\nname: claude-api\n---\n日本語'); // translation, pruned

    // Library B: one skill (non-English docs mirror present elsewhere is fine).
    await fs.mkdir(path.join(base, 'libB', 'orch-build'), { recursive: true });
    await fs.writeFile(path.join(base, 'libB', 'orch-build', 'SKILL.md'), '---\nname: orch-build\ndescription: "Blueprint and build an MVP end to end"\n---\n# Build\nPlan + implement.\n');
  }, 20000);

  afterAll(async () => {
    await fs.rm(base, { recursive: true, force: true });
  });

  function libA(): SkillRoot { return { id: 'A', root: path.join(base, 'libA') }; }
  function libB(): SkillRoot { return { id: 'B', root: path.join(base, 'libB') }; }

  it('parses SKILL.md frontmatter (name/description/license) + body', () => {
    const r = parseSkillDoc('---\nname: foo\ndescription: "A skill that does things."\nlicense: MIT\n---\n# Foo\nBody text.\n');
    expect(r.name).toBe('foo');
    expect(r.description).toBe('A skill that does things.');
    expect(r.license).toBe('MIT');
    expect(r.body).toContain('Body text');
    expect(r.keys).toContain('name');
  });

  it('discovers skills, prunes translation mirrors + noise, flags scripts', async () => {
    const res = await scanSkillRoot(libA());
    expect(res.errors).toHaveLength(0);
    const names = res.skills.map((s) => s.name).sort();
    expect(names).toContain('claude-api');
    expect(names).toContain('clone-repo');
    expect(names).not.toContain('node_modules'); // noise SKILL.md ignored
    // translation mirror is pruned & counted
    expect(res.prunedTranslations).toBeGreaterThanOrEqual(1);
    const clone = res.skills.find((s) => s.name === 'clone-repo');
    expect(clone?.hasScripts).toBe(true);
    expect(clone?.files).toContain('clone.sh');
    const api = res.skills.find((s) => s.name === 'claude-api');
    expect(api?.files).toContain('python/claude-api.md');
    expect(api?.topics).toContain('ml_ai');
  });

  it('scans multiple libraries and rolls up real counts', async () => {
    const merged = await scanSkillLibraries([libA(), libB()]);
    const summary = summarize(merged.skills);
    expect(merged.errors).toHaveLength(0);
    expect(summary.byRoot.A).toBeGreaterThanOrEqual(2);
    expect(summary.byRoot.B).toBe(1);
    expect(summary.total).toBe(summary.byRoot.A + summary.byRoot.B);
  });

  it('reports an honest error for a missing library root', async () => {
    const missing: SkillRoot = { id: 'x', root: path.join(base, 'nope') };
    const res = await scanSkillRoot(missing);
    expect(res.skills).toHaveLength(0);
    expect(res.errors.length).toBeGreaterThanOrEqual(1);
  });
});

describe('skill search + digest', () => {
  const fake: any[] = [
    { id: '1', name: 'seo-specialist', rootId: 'A', dir: 'skills/seo', description: 'Search engine optimization and rankings', words: 100, topics: ['marketing'], hasScripts: false, files: [] },
    { id: '2', name: 'react-patterns', rootId: 'B', dir: 'skills/react', description: 'React component patterns and hooks', words: 90, topics: ['engineering'], hasScripts: true, files: ['lint.sh'] },
    { id: '3', name: 'orchestrator', rootId: 'B', dir: 'skills/orch', description: 'Multi-agent orchestration pipelines', words: 60, topics: ['ml_ai', 'engineering'], hasScripts: false, files: [] },
  ];

  it('ranks and filters search results', () => {
    const hits = searchSkills(fake, 'react', 10);
    expect(hits.map((s) => s.name)).toEqual(['react-patterns']);
    const broad = searchSkills(fake, 'engineering', 10);
    expect(broad.map((s) => s.name)).toContain('react-patterns');
    expect(broad.map((s) => s.name)).toContain('orchestrator');
  });

  it('returns full slice when no query', () => {
    expect(searchSkills(fake, '', 10)).toHaveLength(3);
  });

  it('digest shows honest pre/post scan states', () => {
    const empty = { roots: [{ id: 'A', root: '/x' }], lastScanAt: null, skills: [], summary: null, found: 0, prunedTranslations: 0, errors: [] } as any;
    expect(skillDigest(empty)).toContain('Not scanned yet');
    const scanned = { roots: [{ id: 'A', root: '/x' }], lastScanAt: 1000, skills: fake, summary: summarize(fake), found: 4, prunedTranslations: 1, errors: [] } as any;
    const md = skillDigest(scanned);
    expect(md).toContain('indexed: 3 skills');
    expect(md).toContain('1 translation mirrors pruned');
    expect(md).toContain('1 skills ship runnable scripts');
  });
});
