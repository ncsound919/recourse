import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  MAX_READ_BYTES,
  MAX_EXCERPT,
  CORPUS_TOPICS,
  extractPythonInsight,
  scanRoot,
  scanCorpus,
} from '../src/intake/corpus/scanner.js';
import type { CorpusRoot } from '../src/intake/corpus/types.js';

let base: string;
let bigWords: number;

beforeAll(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-scanner-'));
  const w = (rel: string, content: string) => {
    const abs = path.join(base, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
  };

  // Classification targets.
  w('WHITEPAPER-cure.md', 'oncology whitepaper about tumor mrd');
  w('paper-notes.md', 'preprint notes');
  w('synthesis-report.md', 'research synthesis');
  w('knowledge-base.md', 'ontology of terms');
  w('design-spec.md', 'architecture outline');
  w('dataset.csv', 'a,b\n1,2\n');
  w('README.md', 'readme text');
  w('config.json', '{"a":1}');
  w('notes.txt', 'just some notes');
  w('plain.md', 'nothing special here');

  // Python classification.
  w('test_math.py', 'def test_x():\n    pass\n');
  w('translation_engine.py', '"""BB-Tech basketball-to-biotech translation engine."""\nclass Engine:\n    def translate(self):\n        pass\ndef translate_metric(self):\n    pass\n');
  w('util.py', 'def helper():\n    pass\n');

  // Index-only library files.
  w('oncology-review.pdf', '%PDF-1.4 fake bytes');
  w('bundle.zip', 'PK fake zip');

  // Skipped extension.
  w('image.png', 'fake png');

  // Noise directories that must be pruned.
  w('node_modules/dep/README.md', 'noise');
  w('dist/built.md', 'noise');
  w('__pycache__/cache.md', 'noise');
  w('coverage/report.md', 'noise');
  w('.git/COMMIT_EDITMSG.md', 'noise');

  // Nested directory.
  w('sub/deep.md', 'nested content');

  // Oversized file to exercise the read cap.
  const big = 'word '.repeat(300_000); // ~1.5 MB
  fs.writeFileSync(path.join(base, 'big.txt'), big, 'utf-8');
  bigWords = 300_000;
});

afterAll(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

function findBy<T extends { name: string }>(items: T[], name: string): T | undefined {
  return items.find((i) => i.name === name);
}

describe('exported constants', () => {
  it('document the read/excerpt caps and topic vocabulary', () => {
    expect(MAX_READ_BYTES).toBe(1_000_000);
    expect(MAX_EXCERPT).toBe(1200);
    expect(Object.keys(CORPUS_TOPICS)).toContain('oncology');
    expect(CORPUS_TOPICS.math).toContain('bayesian');
  });
});

describe('extractPythonInsight', () => {
  it('extracts a triple-quoted module docstring and unique symbols', () => {
    const text = '"""Module doc.\n\nMore."""\nclass A:\n    def b(self):\n        pass\ndef b(self):\n    pass\n';
    const out = extractPythonInsight(text);
    expect(out).toContain('Module doc.');
    expect(out).toContain('Symbols: A, b');
    expect(out.match(/\bb\b/g)?.length).toBe(1); // deduped
  });

  it('extracts a single-quoted docstring and allows leading whitespace', () => {
    const out = extractPythonInsight('\n\n  \'\'\'single quoted\'\'\'\ndef only():\n    pass\n');
    expect(out).toContain('single quoted');
    expect(out).toContain('only');
  });

  it('returns symbols only when there is no docstring', () => {
    const out = extractPythonInsight('class Widget:\n    def render(self):\n        pass\n');
    expect(out).not.toContain('"""');
    expect(out).toBe('Symbols: Widget, render');
  });

  it('returns an empty string when there is neither a docstring nor symbols', () => {
    expect(extractPythonInsight('# just a comment\nx = 1\n')).toBe('');
    expect(extractPythonInsight('')).toBe('');
  });

  it('caps the symbol list at 40', () => {
    const defs = Array.from({ length: 45 }, (_, i) => `def fn${i}():\n    pass\n`).join('');
    const line = extractPythonInsight(defs).split('\n').find((l) => l.startsWith('Symbols: '))!;
    const names = line.replace('Symbols: ', '').split(', ');
    expect(names).toHaveLength(40);
    expect(names[39]).toBe('fn39');
  });
});

describe('scanRoot classification', () => {
  it('classifies documents, python modules, and defaults', async () => {
    const { artifacts, errors } = await scanRoot({ project: 'p', root: base });
    expect(errors).toHaveLength(0);
    const kind = (name: string) => findBy(artifacts, name)?.kind;
    expect(kind('WHITEPAPER-cure.md')).toBe('whitepaper');
    expect(kind('paper-notes.md')).toBe('paper');
    expect(kind('synthesis-report.md')).toBe('research');
    expect(kind('knowledge-base.md')).toBe('knowledge');
    expect(kind('design-spec.md')).toBe('spec');
    expect(kind('dataset.csv')).toBe('data');
    expect(kind('README.md')).toBe('readme');
    expect(kind('config.json')).toBe('config');
    expect(kind('notes.txt')).toBe('other');
    expect(kind('plain.md')).toBe('other');
    expect(kind('test_math.py')).toBe('other');
    expect(kind('translation_engine.py')).toBe('research');
    expect(kind('util.py')).toBe('knowledge');
    expect(kind('oncology-review.pdf')).toBe('paper');
    expect(kind('bundle.zip')).toBe('data');
  });

  it('prunes noise directories and skips binary extensions', async () => {
    const { artifacts } = await scanRoot({ project: 'p', root: base });
    const rels = artifacts.map((a) => a.rel);
    expect(rels.some((r) => r.includes('node_modules'))).toBe(false);
    expect(rels.some((r) => r.includes('dist/'))).toBe(false);
    expect(rels.some((r) => r.includes('__pycache__'))).toBe(false);
    expect(rels.some((r) => r.includes('coverage/'))).toBe(false);
    expect(rels.some((r) => r.includes('.git/'))).toBe(false);
    expect(rels).not.toContain('image.png');
  });

  it('keeps nested paths relative to the root', async () => {
    const { artifacts } = await scanRoot({ project: 'p', root: base });
    expect(findBy(artifacts, 'deep.md')?.rel).toBe('sub/deep.md');
  });

  it('indexes pdf/zip by metadata only and detects topics from the name', async () => {
    const { artifacts } = await scanRoot({ project: 'p', root: base });
    const pdf = findBy(artifacts, 'oncology-review.pdf')!;
    expect(pdf.words).toBe(0);
    expect(pdf.topics).toContain('oncology');
    expect(pdf.excerpt).toMatch(/full text via POST/);
    expect(pdf.excerpt).toMatch(/oncology-review\.pdf/);

    const zip = findBy(artifacts, 'bundle.zip')!;
    expect(zip.ext).toBe('.zip');
    expect(zip.words).toBe(0);
    expect(zip.excerpt).toMatch(/manifest via GET/);
    // No topic keyword in the name => honest default to oncology for archives.
    expect(zip.topics).toEqual(['oncology']);
  });

  it('reads real Python insight text, not the code body', async () => {
    const { artifacts } = await scanRoot({ project: 'p', root: base });
    const eng = findBy(artifacts, 'translation_engine.py')!;
    expect(eng.excerpt).toContain('BB-Tech basketball-to-biotech translation engine');
    expect(eng.excerpt).toContain('Symbols: Engine, translate, translate_metric');
    expect(eng.excerpt).not.toContain('pass');
    expect(eng.topics).toContain('biotech_translation');
    expect(eng.words).toBeGreaterThan(0);
  });

  it('caps reading at MAX_READ_BYTES while recording the true size', async () => {
    const { artifacts } = await scanRoot({ project: 'p', root: base });
    const big = findBy(artifacts, 'big.txt')!;
    expect(big.sizeBytes).toBeGreaterThan(MAX_READ_BYTES);
    expect(big.words).toBeGreaterThan(0);
    expect(big.words).toBeLessThan(bigWords);
    expect(big.excerpt.length).toBeLessThanOrEqual(MAX_EXCERPT + 1);
    expect(big.hash).toHaveLength(16);
  });
});

describe('scanRoot error handling', () => {
  it('reports a missing root honestly (never fake artifacts)', async () => {
    const missing: CorpusRoot = { project: 'gone', root: path.join(base, 'does-not-exist') };
    const { artifacts, errors } = await scanRoot(missing);
    expect(artifacts).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ root: 'gone' });
    expect(errors[0].error).toMatch(/root missing/);
  });

  it('reports a non-directory root', async () => {
    const fileRoot: CorpusRoot = { project: 'file', root: path.join(base, 'README.md') };
    const { artifacts, errors } = await scanRoot(fileRoot);
    expect(artifacts).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].error).toMatch(/not a directory/);
  });

  it('returns empty results for an empty directory', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-scanner-empty-'));
    try {
      const { artifacts, errors } = await scanRoot({ project: 'empty', root: empty });
      expect(artifacts).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe('scanCorpus', () => {
  it('merges artifacts and errors across roots with a timestamp', async () => {
    const res = await scanCorpus([
      { project: 'good', root: base },
      { project: 'missing', root: path.join(base, 'nope') },
    ]);
    expect(res.scannedAt).toBeGreaterThan(0);
    expect(res.artifacts.length).toBeGreaterThan(0);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0].root).toBe('missing');
  });

  it('handles an empty root list', async () => {
    const res = await scanCorpus([]);
    expect(res.artifacts).toEqual([]);
    expect(res.errors).toEqual([]);
    expect(typeof res.scannedAt).toBe('number');
  });
});
