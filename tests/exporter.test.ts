import { promises as fs } from 'node:fs';
import * as fsSync from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ToolEntry } from '../src/types';
import {
  candidateFromSkillText,
  currentToolVersion,
  exportSkillFiles,
  extractFencedBlocks,
  isVerifiableVersion,
  renderSkillMarkdown,
  skillSafeName,
} from '../src/skills/exporter';
import { scanSkillRoot } from '../src/skills/scanner';
import type { SkillRoot } from '../src/skills/types';

const tmpRoots: string[] = [];
function freshRoot(): string {
  const d = fsSync.mkdtempSync(path.join(os.tmpdir(), 'skillx-'));
  tmpRoots.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmpRoots.splice(0)) fsSync.rmSync(d, { recursive: true, force: true });
});

function makeTool(over: Partial<ToolEntry> = {}): ToolEntry {
  return {
    name: 'Url Hasher',
    domain: 'coding',
    entrypoint: '.selfhosted/tools/url_hasher.mjs',
    description: 'Deterministic SHA-256 URL digest for dedup and anchoring.',
    versions: [
      {
        version: '0.0.1',
        hash: 'a'.repeat(16),
        created_at: 1,
        passed_verifier: true,
        score: 0.94,
        promoted: true,
        verifier_notes: 'clean lint, all assertions passed',
        source_code: 'export const urlHasher = (u: string) => u;',
        test_suite_code: 'assert.equal(urlHasher("a"), "a");',
      },
    ],
    currentVersion: '0.0.1',
    ...over,
  };
}

describe('skill exporter helpers', () => {
  it('sanitizes names to safe directory slugs', () => {
    expect(skillSafeName('Url Hasher')).toBe('url-hasher');
    expect(skillSafeName('  Bloom Filter v2! ')).toBe('bloom-filter-v2');
    expect(skillSafeName('')).toBe('untitled');
    expect(skillSafeName('...')).toBe('untitled');
    expect(skillSafeName('OK')).toBe('ok');
  });

  it('resolves the active version (currentVersion, else latest)', () => {
    const t = makeTool({ versions: [{ version: 'x', hash: 'x', created_at: 1, passed_verifier: false, score: 0, promoted: false, verifier_notes: '' }] });
    expect(currentToolVersion(t)?.version).toBe('x');
    const t2 = makeTool();
    t2.currentVersion = '0.0.1';
    expect(currentToolVersion(t2)?.version).toBe('0.0.1');
  });

  it('only treats versions carrying real source as verifiable', () => {
    expect(isVerifiableVersion(makeTool().versions[0])).toBe(true);
    expect(isVerifiableVersion({ version: 'x', hash: 'x', created_at: 1, passed_verifier: false, score: 0, promoted: false, verifier_notes: '' })).toBe(false);
    expect(isVerifiableVersion(undefined)).toBe(false);
  });

  it('renders scanner-compatible frontmatter + provenance', () => {
    const md = renderSkillMarkdown(makeTool(), makeTool().versions[0], { license: 'Apache-2.0' });
    expect(md.startsWith('---\nname: Url Hasher\n')).toBe(true);
    expect(md).toContain('license: Apache-2.0');
    expect(md).toContain('Verifier: PASSED');
    expect(md).toContain('Score: 0.94');
    expect(md).toContain('```ts');
  });
});

describe('exportSkillFiles', () => {
  it('writes a rescanable SKILL.md folder with source + suite support files', async () => {
    const root = freshRoot();
    const tool = makeTool();
    const res = await exportSkillFiles(tool, tool.versions[0], root, { license: 'Apache-2.0' });
    expect(res.ok).toBe(true);
    expect(res.files.length).toBe(3);

    const mdAbs = path.join(root, 'recourse-tools', 'url-hasher', 'SKILL.md');
    expect(await fs.readFile(mdAbs, 'utf-8')).toContain('name: Url Hasher');
    expect(await fs.readFile(path.join(root, 'recourse-tools', 'url-hasher', 'src', 'url-hasher.ts'), 'utf-8')).toBe(tool.versions[0].source_code);
    expect(await fs.readFile(path.join(root, 'recourse-tools', 'url-hasher', 'tests', 'url-hasher.test.ts'), 'utf-8')).toBe(tool.versions[0].test_suite_code);

    // The output must be discoverable by the existing scanner.
    const scan = await scanSkillRoot({ id: 'recourse-tools', root } as SkillRoot);
    expect(scan.skills.map((s) => s.name)).toContain('Url Hasher');
  });

  it('refuses an unsafe derived name', async () => {
    const root = freshRoot();
    const tool = makeTool({ name: '...' });
    const res = await exportSkillFiles(tool, tool.versions[0], root);
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it('sanitizes traversal attempts so writes never escape outRoot', async () => {
    const root = freshRoot();
    const tool = makeTool({ name: '..\\..\\evil' });
    expect(skillSafeName('..\\..\\evil')).toBe('evil'); // separators collapsed away
    const res = await exportSkillFiles(tool, tool.versions[0], root);
    expect(res.ok).toBe(true);
    expect(res.dir).toBe(path.join('recourse-tools', 'evil'));
    expect(await fsSync.existsSync(path.join(root, 'recourse-tools', 'evil', 'SKILL.md'))).toBe(true);
    expect(fsSync.existsSync(path.join(os.tmpdir(), 'evil'))).toBe(false);
  });
});

describe('fenced block extraction', () => {
  it('pulls annotated and unannotated ts blocks in order', () => {
    const body = 'intro\n```ts source\nexport const a = 1;\n```\nmid\n```ts suite\nassert.ok(a);\n```\n';
    const blocks = extractFencedBlocks(body);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].code).toContain('export const a');
    expect(blocks[1].code).toContain('assert.ok');
  });
});

describe('candidateFromSkillText (import path)', () => {
  it('round-trips an exported skill back into a runnable candidate', async () => {
    const root = freshRoot();
    const tool = makeTool();
    await exportSkillFiles(tool, tool.versions[0], root, { license: 'Apache-2.0' });
    const md = await fs.readFile(path.join(root, 'recourse-tools', 'url-hasher', 'SKILL.md'), 'utf-8');
    const cand = candidateFromSkillText(md, { rootId: 'recourse-tools', rel: 'recourse-tools/url-hasher/SKILL.md' });
    expect(cand.ok).toBe(true);
    expect(cand.runnable).toBe(true);
    expect(cand.source).toContain('urlHasher');
    expect(cand.name).toBe('Url Hasher');
    expect(cand.license).toBe('Apache-2.0');
  });

  it('marks prose-only skills as non-runnable and does not invent code', () => {
    const md = '---\nname: Brainstorm\ndescription: "A thinking ritual"\n---\n\nDo a structured brainstorm before building.';
    const cand = candidateFromSkillText(md, { rootId: 'ecc', rel: 'brainstorm/SKILL.md' });
    expect(cand.ok).toBe(true);
    expect(cand.runnable).toBe(false);
    expect(cand.source).toBeUndefined();
    expect(cand.reason).toContain('prose-only');
  });
});
