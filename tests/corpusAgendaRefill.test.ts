import { describe, it, expect } from 'vitest';
import {
  refillAgendaFromCorpus,
  artifactToFnName,
  kindToDomain,
  artifactRefSuite,
  type CorpusArtifactLike,
} from '../src/intake/corpus/agendaRefill';

describe('corpus → agenda refill', () => {
  it('turns corpus artifacts into proposals + forge specs with deterministic reference suites', () => {
    const artifacts: CorpusArtifactLike[] = [
      { name: 'KRAS-inhibitor-paper.pdf', project: 'cancer-pdfs', kind: 'paper', preview: 'KRAS mutation drives tumor growth via AKT signaling', hash: 'h1' },
      { name: 'breast-cancer-dataset.csv', project: 'cancer-datasets', kind: 'dataset', preview: 'patient_id,age,stage,status', hash: 'h2' },
    ];
    const seen = new Set<string>();
    const existing = new Set<string>();
    const { proposals, specs, result } = refillAgendaFromCorpus(artifacts, seen, existing);
    expect(proposals.length).toBe(2);
    expect(specs.length).toBe(2);
    expect(result.proposalsCreated).toBe(2);
    // Each spec has a runnable reference suite (the FNV fingerprint contract).
    for (const s of specs) {
      expect(s.refSuite).toContain('assert typeof');
      expect(s.refSuite).toContain('=== ');
      expect(s.refSuite.split('\n').length).toBeGreaterThanOrEqual(4);
    }
    // Dedupe: second run with same seen-set adds nothing.
    const again = refillAgendaFromCorpus(artifacts, seen, existing);
    expect(again.proposals.length).toBe(0);
    expect(again.specs.length).toBe(0);
    expect(again.result.proposalsCreated).toBe(0);
  });

  it('maps kinds to sensible domains', () => {
    expect(kindToDomain('paper')).toBe('biotech');
    expect(kindToDomain('dataset')).toBe('systemic');
    expect(kindToDomain('math')).toBe('math');
    expect(kindToDomain('quantum')).toBe('quantum_sim');
    expect(kindToDomain('unknown')).toBe('systemic');
  });

  it('produces safe function names from messy file names', () => {
    expect(artifactToFnName({ name: '1234 KRAS paper (1).pdf', project: 'p' })).toBe('KRAS_paper_1');
    expect(artifactToFnName({ name: 'simple.csv', project: 'p' })).toBe('simple');
  });

  it('returns empty for reserved words (never a valid function name)', () => {
    expect(artifactToFnName({ name: 'package.json', project: 'p' })).toBe('');
    expect(artifactToFnName({ name: 'default.ts', project: 'p' })).toBe('');
    expect(artifactToFnName({ name: 'class.md', project: 'p' })).toBe('');
  });

  it('skips non-tool artifacts honestly', () => {
    const artifacts: CorpusArtifactLike[] = [
      { name: 'README.md', project: 'p', kind: 'doc', hash: 'r' },
      { name: 'package-lock.json', project: 'p', kind: 'doc', hash: 'l' },
    ];
    const seen = new Set<string>();
    const existing = new Set<string>();
    const { proposals, specs, result } = refillAgendaFromCorpus(artifacts, seen, existing);
    expect(proposals.length).toBe(0);
    expect(specs.length).toBe(0);
    expect(result.skipped.length).toBe(2);
  });

  it('refSuite is deterministic and reproducible', () => {
    const a: CorpusArtifactLike = { name: 'x.pdf', project: 'p', kind: 'paper', preview: 'some content', hash: 'z' };
    const fn = artifactToFnName(a);
    const suite1 = artifactRefSuite(fn, a);
    const suite2 = artifactRefSuite(fn, a);
    expect(suite1).toBe(suite2); // deterministic across calls
    // Empty-input fingerprint must be reproducible (the FNV-1a offset basis).
    expect(suite1).toContain('assert ' + fn + "('') === \"811c9dc5\""); // FNV-1a("") = 0x811c9dc5
  });
});