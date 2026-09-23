import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { planQuarantine, applyQuarantine, isCorpusClone } from '../scripts/quarantine-selfhosted';
import { sourceSkeleton, findNearDuplicate } from '../src/lib/forgeQuality';

const FNV = (n: string) =>
  `export function ${n}(input) {\n  const str = typeof input === 'string' ? input : '';\n  let hash = 0x811c9dc5;\n  for (let i = 0; i < str.length; i++) { hash ^= str.charCodeAt(i); hash = (hash * 0x01000193) >>> 0; }\n  return hash.toString(16).padStart(8, '0');\n}`;

function entry(name: string, sourceCode: string, extra: Record<string, unknown> = {}) {
  return {
    name, file: `tools/${name}.mjs`, sourceCode, testSuiteCode: `assert typeof ${name} === 'function';`,
    summary: `[Capability Forge] ${name}`, createdAt: 1, ...extra,
  };
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'q-'));
  fs.mkdirSync(path.join(root, 'tools'));
  const entries = [
    entry('gcdPair', 'export function gcdPair(a, b) { while (b) { [a, b] = [b, a % b]; } return a; }', {
      testSuiteCode: 'assert gcdPair(48,18) === 6;\nassert gcdPair(0,12) === 12;', createdAt: 1,
    }),
    entry('paper_one', FNV('paper_one'), { summary: '[Capability Forge] paper_one (corpus_abc123)', createdAt: 2 }),
    entry('CODI_1', 'function CODI_1(input) { const { b } = input; return Math.min(71.7, 1.4 * b); }', { createdAt: 3 }),
    entry('CODI_2', 'function CODI_2(input) { const { b } = input; return Math.min(12.5, 0.3 * b); }', { createdAt: 4 }),
  ];
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ version: 1, entries }));
  for (const e of entries) fs.writeFileSync(path.join(root, e.file), '// module');
  fs.writeFileSync(path.join(root, 'tools', 'orphan_x.mjs'), '// orphan');
  fs.writeFileSync(path.join(root, 'tools', '_runtime.mjs'), '// shared runtime');
  return root;
}

describe('sourceSkeleton / findNearDuplicate', () => {
  it('treats constant-only variants as the same algorithm', () => {
    expect(sourceSkeleton('function A(x){return 1.5*x}', 'A')).toBe(sourceSkeleton('function B(x){return 9*x}', 'B'));
    expect(findNearDuplicate('function B(x){return 9*x}', 'B', [{ name: 'A', sourceCode: 'function A(x){return 1.5*x}' }])).toBe('A');
    expect(findNearDuplicate('function B(x){return x*x}', 'B', [{ name: 'A', sourceCode: 'function A(x){return 1.5*x}' }])).toBeNull();
  });
});

describe('quarantine-selfhosted', () => {
  it('plans corpus clones, near-duplicates and orphans; keeps real tools', () => {
    const root = fixture();
    const plan = planQuarantine(root);
    expect(plan.keep.sort()).toEqual(['CODI_1', 'gcdPair']);
    const byName = Object.fromEntries(plan.quarantine.map((q) => [q.name, q.reason]));
    expect(byName).toEqual({ paper_one: 'corpus-clone', CODI_2: 'near-duplicate' });
    expect(plan.orphans).toEqual(['orphan_x.mjs']);
    expect(isCorpusClone({ name: 'x', file: '', sourceCode: FNV('x'), testSuiteCode: "assert x('') === \"811c9dc5\";" })).toBe(true);
  });

  it('applies by moving (never deleting) and keeps a manifest backup', () => {
    const root = fixture();
    const qdir = applyQuarantine(planQuarantine(root), 'test');
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf-8'));
    expect(manifest.entries.map((e: any) => e.name).sort()).toEqual(['CODI_1', 'gcdPair']);
    expect(fs.existsSync(path.join(qdir, 'tools', 'paper_one.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(qdir, 'tools', 'orphan_x.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'tools', '_runtime.mjs'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(qdir, 'manifest.before.json'), 'utf-8')).entries).toHaveLength(4);
  });
});
