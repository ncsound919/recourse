import { describe, expect, it } from 'vitest';
import { bundleModules, stripModuleSyntax, multiFileToForgeSpec } from './multiFileForge';
import type { MultiFileSpec } from './multiFileSpec';

const spec = (): MultiFileSpec => ({
  id: 'spec_counter',
  name: 'makeCounter',
  domain: 'coding',
  title: 'Counter module',
  prompt: 'A stateful counter factory.',
  refSuite: 'assert makeCounter().next() === 1;',
  files: [
    { rel: 'src/main.ts', role: 'entrypoint' },
    { rel: 'src/helper.ts', role: 'helper', prompt: 'increment helper' },
  ],
});

describe('stripModuleSyntax', () => {
  it('removes import lines and the export keyword', () => {
    const src = [
      "import { x } from './x';",
      "import './side-effect';",
      'export function f() { return x; }',
      'export default f;',
      'export { a, b };',
    ].join('\n');
    const out = stripModuleSyntax(src);
    expect(out).not.toContain('import');
    expect(out).not.toContain('export');
    expect(out).toContain('function f()');
    expect(out).toContain('f;');
  });
});

describe('bundleModules', () => {
  it('is deterministic and preserves manifest order with file headers', () => {
    const modules = [
      { rel: 'src/a.ts', source: 'export const a = 1;' },
      { rel: 'src/b.ts', source: 'export const b = 2;' },
    ];
    const one = bundleModules(modules);
    const two = bundleModules(modules);
    expect(one).toBe(two);
    expect(one.indexOf('// ---- src/a.ts ----')).toBeLessThan(one.indexOf('// ---- src/b.ts ----'));
    expect(one).toContain('const a = 1;');
    expect(one).not.toContain('export');
  });
});

describe('multiFileToForgeSpec', () => {
  it('produces a single-source forge spec and reports missing files', () => {
    const s = spec();
    const r = multiFileToForgeSpec(s, { 'src/main.ts': 'export const main = 1;' });
    expect(r.id).toBe(s.id);
    expect(r.name).toBe(s.name);
    expect(r.domain).toBe(s.domain);
    expect(r.refSuite).toBe(s.refSuite);
    expect(r.bundledSource).toContain('const main = 1;');
    expect(r.missing).toEqual(['src/helper.ts']);
    expect(r.prompt).toContain('Counter module');
  });

  it('is deterministic for the same inputs', () => {
    const s = spec();
    const sources = { 'src/main.ts': 'export const main = 1;', 'src/helper.ts': 'export const h = 2;' };
    const a = multiFileToForgeSpec(s, sources);
    const b = multiFileToForgeSpec(s, sources);
    expect(a.prompt).toBe(b.prompt);
    expect(a.bundledSource).toBe(b.bundledSource);
    expect(a.missing).toEqual([]);
  });
});
