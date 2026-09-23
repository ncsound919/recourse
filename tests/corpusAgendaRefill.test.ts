import { describe, it, expect } from 'vitest';
import {
  refillAgendaFromCorpus,
  artifactToFnName,
  kindToDomain,
  GROUNDING_MIN_CHARS,
  type CorpusArtifactLike,
} from '../src/intake/corpus/agendaRefill';

describe('corpus → agenda refill', () => {
  it('turns corpus artifacts into proposals + minting groundings, never clone forge specs', () => {
    const longText = 'KRAS mutation drives tumor growth via AKT signaling. '.repeat(8);
    const artifacts: CorpusArtifactLike[] = [
      { name: 'KRAS-inhibitor-paper.pdf', project: 'cancer-pdfs', kind: 'paper', excerpt: longText, hash: 'h1' },
      { name: 'breast-cancer-dataset.csv', project: 'cancer-datasets', kind: 'dataset', preview: 'patient_id,age,stage,status', hash: 'h2' },
    ];
    const seen = new Set<string>();
    const { proposals, specs, groundings, result } = refillAgendaFromCorpus(artifacts, seen);
    expect(proposals.length).toBe(2);
    // The FNV-fingerprint clone specs are gone: a file name is not a spec.
    expect(specs.length).toBe(0);
    expect(result.specsCreated).toBe(0);
    // Only the artifact with substantive text becomes a grounding for minting.
    expect(groundings.map((g) => g.hash)).toEqual(['h1']);
    expect(groundings[0].excerpt.length).toBeGreaterThanOrEqual(GROUNDING_MIN_CHARS);
    expect(groundings[0].domain).toBe('biotech');
    // Dedupe: second run with same seen-set adds nothing.
    const again = refillAgendaFromCorpus(artifacts, seen);
    expect(again.proposals.length).toBe(0);
    expect(again.groundings.length).toBe(0);
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
});
