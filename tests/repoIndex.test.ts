import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  buildRepoIndex,
  relevantEntries,
  renderRepoContext,
  listSourceFiles,
  loadRepoIndex,
  gitTreeKey,
  repoCacheKey,
} from '../src/autopilot/repoIndex';

function tempRepo(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-repo-index-'));
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body, 'utf8');
  }
  return dir;
}

describe('buildRepoIndex', () => {
  it('indexes exported declarations with their header summary', () => {
    const root = tempRepo({
      'src/lib/calibration.ts': [
        '/**',
        ' * Brier score, reliability curves and ECE for a forecast window.',
        ' */',
        'export function brierScore(xs: number[]): number { return 0; }',
        '',
        'export async function fetchExternal(): Promise<void> {}',
        '',
        'export class ReliabilityBins {}',
        '',
        'const helper = 1;',
        'export const DEFAULT_BINS = 10;',
        '',
        'export interface Forecast { predicted: number }',
        'function notExported() {}',
      ].join('\n'),
      'src/server.ts': "export const PORT = 3050;\n",
      'tests/calibration.test.ts': "export function testOnlyThing() {}\n",
      'src/lib/broken.ts': 'export function ok() {}\n',
    });

    const index = buildRepoIndex(root);
    const names = index.map((e) => e.name);
    expect(names).toContain('brierScore');
    expect(names).toContain('fetchExternal');
    expect(names).toContain('ReliabilityBins');
    expect(names).toContain('DEFAULT_BINS');
    expect(names).toContain('PORT');
    // Tests are skipped, and `helper`/`notExported` are not exported.
    expect(names).not.toContain('testOnlyThing');
    expect(names).not.toContain('helper');
    expect(names).not.toContain('notExported');

    const brier = index.find((e) => e.name === 'brierScore')!;
    expect(brier.kind).toBe('function');
    expect(brier.summary).toContain('Brier score');

    const fetchExternal = index.find((e) => e.name === 'fetchExternal')!;
    expect(fetchExternal.kind).toBe('async function');

    expect(buildRepoIndex(root)).toEqual(index);
  });

  it('indexes re-exports (under the exported alias) and skips node_modules/dist', () => {
    const root = tempRepo({
      'src/a.ts': 'export const alpha = 1;\n',
      'src/b.ts': "export { alpha, beta as gamma } from './a';\n",
      'src/c.ts': 'export { local };\nconst local = 1;\n',
      'node_modules/pkg/index.ts': 'export const fromNode = 1;\n',
      'dist/out.ts': 'export const fromDist = 1;\n',
    });
    const index = buildRepoIndex(root);
    const names = index.map((e) => e.name);
    // `gamma` is the name this module actually exports.
    expect(names).toContain('gamma');
    // A bare `export { x }` without `from` is not a re-export and is skipped
    // (its origin file already indexed the declaration).
    expect(names).not.toContain('local');
    expect(names).not.toContain('fromNode');
    expect(names).not.toContain('fromDist');
    // `alpha` is exported by two modules, so it appears once per file.
    expect(names.filter((n) => n === 'alpha')).toHaveLength(2);
    expect(index.filter((e) => e.name === 'alpha').map((e) => e.file).sort()).toEqual([
      'src/a.ts',
      'src/b.ts',
    ]);
  });

  it('returns an empty index for a tree with no source', () => {
    expect(buildRepoIndex(tempRepo({ 'README.md': 'hi' }))).toEqual([]);
  });
});

describe('relevantEntries', () => {
  it('surfaces the calibration symbol for a calibration gap', () => {
    const root = tempRepo({
      'src/lib/calibration.ts':
        '/** Brier score and expected calibration error over a forecast window. */\nexport function calibrationReport(): number { return 0; }\n',
      'src/lib/wallet.ts': 'export function readWallet(): number { return 0; }\n',
      'src/lib/ledger.ts': 'export function loadLedger(): number { return 0; }\n',
    });
    const index = buildRepoIndex(root);
    const hits = relevantEntries(index, 'calibration report is wrong for our forecasts', 5);
    expect(hits[0].file).toBe('src/lib/calibration.ts');
    expect(hits[0].name).toBe('calibrationReport');
  });

  it('is deterministic and bounded by k', () => {
    const root = tempRepo({
      'src/alpha.ts': 'export const alpha = 1;\n',
      'src/beta.ts': 'export const beta = 1;\n',
    });
    const index = buildRepoIndex(root);
    const first = relevantEntries(index, 'alpha beta', 1);
    expect(first).toHaveLength(1);
    expect(relevantEntries(index, 'alpha beta', 1)).toEqual(first);
    expect(relevantEntries(index, 'alpha beta', 5)).toHaveLength(2);
    expect(relevantEntries(index, 'nothing matches here', 5)).toEqual([]);
    expect(relevantEntries([], 'anything', 5)).toEqual([]);
    // k <= 0 yields nothing rather than an unbounded list.
    expect(relevantEntries(index, 'alpha', 0)).toEqual([]);
  });

  it('renders file :: name :: summary lines', () => {
    expect(
      renderRepoContext([{ file: 'src/x.ts', name: 'x', kind: 'function', summary: 'does x' }]),
    ).toBe('src/x.ts :: x :: does x');
    expect(renderRepoContext([])).toBe('');
  });
});

describe('loadRepoIndex', () => {
  it('serves the second call from the cache file', () => {
    const root = tempRepo({ 'src/a.ts': 'export const alpha = 1;\n' });
    const cache = path.join(root, '.recourse', 'idx.json');
    const first = loadRepoIndex(root, cache);
    expect(first.map((e) => e.name)).toContain('alpha');
    expect(fs.existsSync(cache)).toBe(true);
    const cached = JSON.parse(fs.readFileSync(cache, 'utf8')) as { entries: unknown[] };
    expect(cached.entries.length).toBe(first.length);
    // A changed tree must be re-indexed rather than served stale, even though
    // the temp dir is not a git repo (so the key is the fs fingerprint).
    fs.writeFileSync(path.join(root, 'src', 'c.ts'), 'export const charlie = 1;\n', 'utf8');
    expect(loadRepoIndex(root, cache).map((e) => e.name)).toContain('charlie');
  });

  it('rebuilds when the cache is corrupt', () => {
    const root = tempRepo({ 'src/a.ts': 'export const alpha = 1;\n' });
    const cache = path.join(root, '.recourse', 'idx.json');
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    fs.writeFileSync(cache, 'not json', 'utf8');
    expect(loadRepoIndex(root, cache).map((e) => e.name)).toContain('alpha');
  });

  it('keys the cache on git HEAD inside a real repository', () => {
    const root = tempRepo({ 'src/a.ts': 'export const alpha = 1;\n' });
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 't@example.invalid'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
    execFileSync('git', ['add', '-A'], { cwd: root });
    execFileSync('git', ['commit', '-qm', 'init'], { cwd: root });
    expect(gitTreeKey(root)).toMatch(/^[0-9a-f]{40}$/);
    expect(repoCacheKey(root)).toBe(`git:${gitTreeKey(root)}`);
    const cache = path.join(root, '.recourse', 'idx.json');
    loadRepoIndex(root, cache);
    // An uncommitted file changes the fs fingerprint but not HEAD, so the
    // git-keyed cache is intentionally served as-is here.
    fs.writeFileSync(path.join(root, 'src', 'uncommitted.ts'), 'export const later = 1;\n', 'utf8');
    expect(loadRepoIndex(root, cache).map((e) => e.name)).not.toContain('later');
  });
});

describe('listSourceFiles', () => {
  it('walks src and the root entrypoints, skipping tests', () => {
    const root = tempRepo({
      'src/x.ts': 'export const x = 1;\n',
      'src/nested/deep/y.ts': 'export const y = 1;\n',
      'tests/x.test.ts': 'export const t = 1;\n',
      'src/x.test.ts': 'export const t2 = 1;\n',
      'server.ts': 'export const s = 1;\n',
    });
    const files = listSourceFiles(root);
    expect(files).toContain('src/x.ts');
    expect(files).toContain('src/nested/deep/y.ts');
    expect(files).toContain('server.ts');
    expect(files.some((f) => f.includes('test'))).toBe(false);
  });
});