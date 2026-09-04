import { describe, it, expect } from 'vitest';
import {
  CapabilityDef,
  selectBestBacking,
  owningGeneScore,
  backingKey,
} from '../src/lib/capabilities';
import type { ToolEntry } from '../src/types';
import type { SelfHostedManifestEntry } from '../src/lib/selfHosting';

const merkleCap: CapabilityDef = {
  id: 'provenance_merkle',
  label: 'Provenance Merkle integrity root',
  backableTemplateId: 'tpl_merkle_anchor',
  method: 'computeRoot',
  args: (ctx: { hashes: string[] }) => [ctx.hashes],
  builtin: () => 'builtin-root',
};

function shEntry(partial: Partial<SelfHostedManifestEntry>): SelfHostedManifestEntry {
  return {
    name: 'x',
    templateId: 'tpl_merkle_anchor',
    domain: 'systemic',
    entrypointName: 'MerkleStateAnchor',
    params: {},
    stateful: false,
    methods: [{ method: 'computeRoot', label: 'r' }],
    hash: 'abc',
    file: 'tools/x.mjs',
    sourceCode: '',
    testSuiteCode: 'assert true;',
    summary: 'x',
    createdAt: 0,
    lastVerifiedAt: 1,
    lastVerified: { passed: true, detail: 'ok' },
    ...partial,
  };
}

function gene(partial: any): ToolEntry {
  return {
    name: 'x',
    domain: 'systemic',
    entrypoint: '.selfhosted/tools/x.mjs',
    description: 'x',
    versions: [{
      version: '1.0.0-selfhosted', hash: 'abc', created_at: 0,
      passed_verifier: true, score: 0.9, promoted: true,
      verifier_notes: '', source_code: '',
    }],
    currentVersion: '1.0.0-selfhosted',
    healthStatus: 'healthy',
    anomalyCount: 0,
    ...partial,
  };
}

describe('capability adoption picker', () => {
  it('returns builtin when no verified self-hosted candidate exists', () => {
    const backing = selectBestBacking(merkleCap, [], []);
    expect(backing.source).toBe('builtin');
    expect(backingKey(backing)).toBe('builtin');
  });

  it('ignores self-hosted entries that failed live verification', () => {
    const entry = shEntry({ lastVerified: { passed: false, detail: 'broken' } });
    const backing = selectBestBacking(merkleCap, [entry], [gene({})]);
    expect(backing.source).toBe('builtin');
  });

  it('ignores self-hosted entries whose owning gene is not promoted/passing', () => {
    const entry = shEntry({});
    const g = gene({});
    g.versions[0].passed_verifier = false;
    g.versions[0].promoted = false;
    const backing = selectBestBacking(merkleCap, [entry], [g]);
    expect(backing.source).toBe('builtin');
  });

  it('adopts a verified self-hosted candidate and reports its score', () => {
    const entry = shEntry({ name: 'merkle_alpha' });
    const g = gene({ name: 'merkle_alpha', entrypoint: '.selfhosted/tools/merkle_alpha.mjs' });
    g.versions[0].score = 0.97;
    g.versions[0].hash = 'hash-alpha';
    const backing = selectBestBacking(merkleCap, [entry], [g]);
    expect(backing.source).toBe('selfhosted');
    expect(backing.toolName).toBe('merkle_alpha');
    expect(backing.score).toBe(0.97);
    expect(backing.hash).toBe('hash-alpha');
  });

  it('picks the highest-scoring candidate (aggressive best-available)', () => {
    const low = shEntry({ name: 'merkle_low' });
    const high = shEntry({ name: 'merkle_high' });
    const gLow = gene({ name: 'merkle_low' });
    const gHigh = gene({ name: 'merkle_high' });
    gLow.versions[0].score = 0.6;
    gHigh.versions[0].score = 0.99;
    const backing = selectBestBacking(merkleCap, [low, high], [gLow, gHigh]);
    expect(backing.source).toBe('selfhosted');
    expect(backing.toolName).toBe('merkle_high');
    expect(backing.score).toBe(0.99);
  });

  it('ignores candidates from a different template (wrong capability)', () => {
    const entry = shEntry({ templateId: 'tpl_lru_cache' });
    const backing = selectBestBacking(merkleCap, [entry], [gene({})]);
    expect(backing.source).toBe('builtin');
  });

  it('owningGeneScore is null when the gene is missing', () => {
    const entry = shEntry({ name: 'ghost' });
    expect(owningGeneScore(entry, [])).toBeNull();
  });
});
