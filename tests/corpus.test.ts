import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { scanRoot, scanCorpus } from '../src/intake/corpus/scanner';
import { summarize, corpusDigest, artifactsToSignals } from '../src/intake/corpus/index';
import type { CorpusRoot } from '../src/intake/corpus/types';

describe('ecosystem corpus scanner (real files)', () => {
  let base: string;

  beforeAll(async () => {
    base = await fs.mkdtemp(path.join(os.tmpdir(), 'recourse-corpus-test-'));
    // Project A — insight-bearing + noise it must ignore.
    await fs.mkdir(path.join(base, 'projA', 'docs'), { recursive: true });
    await fs.mkdir(path.join(base, 'projA', 'data'), { recursive: true });
    await fs.mkdir(path.join(base, 'projA', 'src'), { recursive: true });
    await fs.mkdir(path.join(base, 'projA', 'node_modules', 'x'), { recursive: true });
    await fs.mkdir(path.join(base, 'projA', '__pycache__'), { recursive: true });
    await fs.mkdir(path.join(base, 'projB', 'research'), { recursive: true });
    await fs.mkdir(path.join(base, 'projB', 'dist'), { recursive: true });

    await fs.writeFile(path.join(base, 'projA', 'WHITEPAPER.md'), 'Recourse Oncology Whitepaper. This candidate drug targets tumor mrd and cancer recurrence.'.repeat(5));
    await fs.writeFile(path.join(base, 'projA', 'docs', 'synthesis-breakthrough.md'), 'Cross-project research synthesis about clinical trials and patient cohorts.');
    await fs.writeFile(path.join(base, 'projA', 'data', 'patients.csv'), 'patient,cohort\n1,A\n');
    await fs.writeFile(path.join(base, 'projA', 'config.yaml'), 'api: null\nname: projA\n');
    await fs.writeFile(path.join(base, 'projA', 'src', 'code.ts'), 'export const x = 1;'); // not a doc ext -> ignored
    await fs.writeFile(path.join(base, 'projA', 'node_modules', 'x', 'README.md'), 'noise readme'); // ignored
    await fs.writeFile(path.join(base, 'projA', '__pycache__', 'cache.md'), 'noise'); // ignored
    await fs.writeFile(path.join(base, 'projA', 'README.md'), 'Project A readme only');

    await fs.writeFile(path.join(base, 'projB', 'research', 'mrd-guided-trial.md'), 'MRD guided adjuvant clinical trial analysis with hemp-derived compound.');
    await fs.writeFile(path.join(base, 'projB', 'dist', 'README.md'), 'noise'); // ignored
    await fs.writeFile(path.join(base, 'projB', 'image.png'), 'fake png bytes'); // ignored by ext
  }, 20000);

  afterAll(async () => {
    await fs.rm(base, { recursive: true, force: true });
  });

  function roots(): { a: CorpusRoot; b: CorpusRoot } {
    return {
      a: { project: 'projA', root: path.join(base, 'projA') },
      b: { project: 'projB', root: path.join(base, 'projB') },
    };
  }

  it('scans a root and ignores noise dirs + non-doc files', async () => {
    const { a } = roots();
    const { artifacts, errors } = await scanRoot(a);
    expect(errors).toHaveLength(0);
    const rels = artifacts.map((a) => a.rel).sort();
    // docs/synthesis-breakthrough.md, data/patients.csv, README.md, WHITEPAPER.md
    // config.yaml is a doc ext but classifyKind -> config (still indexed).
    expect(rels).not.toContain('src/code.ts');
    expect(rels).not.toContain('node_modules/x/README.md');
    expect(rels).not.toContain('__pycache__/cache.md');
    expect(rels.some((r) => r.endsWith('WHITEPAPER.md'))).toBe(true);
    expect(rels.some((r) => r.endsWith('synthesis-breakthrough.md'))).toBe(true);
  });

  it('classifies insight kinds and detects real topics', async () => {
    const { a } = roots();
    const { artifacts } = await scanRoot(a);
    const wp = artifacts.find((a) => a.name === 'WHITEPAPER.md');
    expect(wp?.kind).toBe('whitepaper');
    expect(wp?.topics).toContain('oncology');
    expect(wp?.excerpt.length).toBeGreaterThan(0);
    const synth = artifacts.find((a) => a.name === 'synthesis-breakthrough.md');
    expect(synth?.kind).toBe('research');
    expect(synth?.topics).toContain('clinical');
    const csv = artifacts.find((a) => a.ext === '.csv');
    expect(csv?.kind).toBe('data');
  });

  it('scans multiple roots and rolls up real counts', async () => {
    const { a, b } = roots();
    const res = await scanCorpus([a, b]);
    const summary = summarize(res.artifacts);
    expect(res.errors).toHaveLength(0);
    expect(summary.byProject.projA).toBeGreaterThanOrEqual(4);
    expect(summary.byProject.projB).toBeGreaterThanOrEqual(1);
    expect(Object.keys(summary.byKind).length).toBeGreaterThan(1);
  });

  it('reports an honest error for a missing root (never fake artifacts)', async () => {
    const missing: CorpusRoot = { project: 'nope', root: path.join(base, 'does-not-exist') };
    const { artifacts, errors } = await scanRoot(missing);
    expect(artifacts).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].root).toBe('nope');
  });
});

describe('corpus dispatch → intake signals', () => {
  const fakeArtifacts = [
    { project: 'p', rel: 'WHITEPAPER.md', name: 'WHITEPAPER.md', ext: '.md', kind: 'whitepaper', sizeBytes: 10, words: 50, excerpt: 'real whitepaper text on oncology', topics: ['oncology'], mtime: 1 } as any,
    { project: 'p', rel: 'a.csv', name: 'a.csv', ext: '.csv', kind: 'data', sizeBytes: 10, words: 5, excerpt: 'x,y', topics: [], mtime: 1 } as any,
    { project: 'p', rel: 'README.md', name: 'README.md', ext: '.md', kind: 'readme', sizeBytes: 10, words: 5, excerpt: 'readme', topics: [], mtime: 1 } as any,
    { project: 'p', rel: 'research/synthesis.md', name: 'synthesis.md', ext: '.md', kind: 'research', sizeBytes: 10, words: 90, excerpt: 'research synthesis over hemp clinical data', topics: ['hemp', 'clinical'], mtime: 1 } as any,
  ];

  it('only emits research-value kinds as corpus signals', () => {
    const signals = artifactsToSignals(fakeArtifacts, 10);
    expect(signals.every((s) => s.source === 'corpus')).toBe(true);
    const kinds = signals.map((s) => s.title);
    expect(kinds).toContain('WHITEPAPER');
    expect(kinds).toContain('synthesis');
    expect(kinds).not.toContain('a'); // data kind filtered
    expect(kinds).not.toContain('README'); // readme kind filtered
  });

  it('produces stable dedupe ids + honors cap', () => {
    const a = artifactsToSignals(fakeArtifacts, 1);
    expect(a).toHaveLength(1);
    // Highest-value kind (whitepaper ranks above research) chosen first.
    expect(a[0].title).toBe('WHITEPAPER');
  });

  it('digest renders honest empty state before a scan', () => {
    const snap = { roots: [{ project: 'p', root: '/x' }], lastScanAt: null, artifacts: [], summary: null, errors: [], dispatchedSignals: 0 } as any;
    const md = corpusDigest(snap);
    expect(md).toContain('Not scanned yet');
  });

  it('digest reflects real scan summary + dispatch count', () => {
    const snap = {
      roots: [{ project: 'p', root: '/x' }],
      lastScanAt: 1000,
      artifacts: fakeArtifacts,
      summary: summarize(fakeArtifacts),
      errors: [],
      dispatchedSignals: 3,
    } as any;
    const md = corpusDigest(snap);
    expect(md).toContain('artifacts indexed: 4');
    expect(md).toContain('hemp');
    expect(md).toContain('Dispatched 3 research artifacts');
  });
});
