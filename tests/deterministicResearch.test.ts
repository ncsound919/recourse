import { describe, expect, it } from 'vitest';
import {
  bindToClaims,
  contentHash,
  dedupSources,
  executeResearch,
  scoreRelevance,
  type RawSource,
  type ResearchQuery,
} from '../src/lib/deterministicResearch';
import { getComponentTemplate } from '../src/lib/componentTemplates';

const QUERY: ResearchQuery = {
  id: 'q1',
  timestamp: 1700000000000,
  topic: 'graph neural networks',
  intent: 'literature_scan',
  scope: {},
  constraints: {},
};

type SourceOverrides = { id: string } & Partial<Omit<RawSource, 'id' | 'metadata'>> & {
  metadata?: Partial<RawSource['metadata']>;
};

function makeSource(overrides: SourceOverrides): RawSource {
  const { metadata: metadataOverride, ...rest } = overrides;
  return {
    title: 'Graph Neural Networks for Molecules',
    url: 'https://arxiv.org/abs/1234',
    domain: 'arxiv.org',
    contentPreview: 'graph neural networks applied to molecules',
    fetchedAt: 1700000000000,
    ...rest,
    metadata: {
      publishedAt: 1699000000000,
      authors: ['Ada Lovelace'],
      accessibilityStatus: 'open',
      ...metadataOverride,
    },
  };
}

describe('deterministicResearch core', () => {
  it('dedups exact-hash duplicates (3 sources, 1 duplicate -> 2 unique)', () => {
    const a = makeSource({ id: 's1' });
    const b = makeSource({ id: 's2' }); // identical content, different id
    const c = makeSource({
      id: 's3',
      title: 'Baking Sourdough Bread',
      url: 'https://example.com/bread',
      domain: 'example.com',
      contentPreview: 'flour water salt baking',
      metadata: { authors: ['Baker'], accessibilityStatus: 'paywalled' },
    });
    const { unique, dedupReport } = dedupSources([a, b, c]);
    expect(unique).toHaveLength(2);
    expect(unique[0].id).toBe('s1');
    expect(dedupReport.duplicatesRemoved).toBe(1);
    expect(contentHash(a)).toBe(contentHash(b));
  });

  it('dedups via DOI and author-cluster stages', () => {
    const a = makeSource({ id: 's1', metadata: { doi: '10.1/abc', authors: ['X'] } });
    const b = makeSource({
      id: 's2',
      title: 'Totally Different Title Here',
      url: 'https://other.example/diff',
      metadata: { doi: '10.1/abc', authors: ['Y'] },
    });
    expect(dedupSources([a, b]).unique).toHaveLength(1);

    const c = makeSource({ id: 's3', metadata: { authors: ['Shared Author'] } });
    const d = makeSource({
      id: 's4',
      title: 'Another Distinct Title Entirely',
      url: 'https://other.example/other',
      metadata: { authors: ['Shared Author'] },
    });
    const clustered = dedupSources([c, d], 0.99);
    expect(clustered.unique).toHaveLength(1);
    expect(clustered.groups[0].matchTypes).toContain('author_cluster');
  });

  it('scores deterministically and clamps to [0,1]', () => {
    const a = makeSource({ id: 's1' });
    const s1 = scoreRelevance(a, QUERY);
    const s2 = scoreRelevance(a, QUERY);
    expect(s1).toBe(s2);
    expect(s1).toBeGreaterThanOrEqual(0);
    expect(s1).toBeLessThanOrEqual(1);

    const irrelevant = makeSource({
      id: 's9',
      title: 'Unrelated cooking guide',
      url: 'https://example.com/x',
      domain: 'example.com',
      contentPreview: 'recipes and ovens',
      metadata: { publishedAt: 1500000000000, authors: ['Cook'], accessibilityStatus: 'paywalled' },
    });
    expect(scoreRelevance(irrelevant, QUERY)).toBeLessThan(s1);
  });

  it('executeResearch sorts desc and reproduces the audit hash on re-execution', () => {
    const sources = [
      makeSource({ id: 's1' }),
      makeSource({ id: 's2' }),
      makeSource({
        id: 's3',
        title: 'Baking Sourdough Bread',
        url: 'https://example.com/bread',
        domain: 'example.com',
        contentPreview: 'flour water salt baking',
        metadata: { publishedAt: 1600000000000, authors: ['Baker'], accessibilityStatus: 'paywalled' },
      }),
    ];
    const first = executeResearch(QUERY, sources, { maxSources: 10 });
    const second = executeResearch(QUERY, sources, { maxSources: 10 });
    expect(first.auditSummary.executionHash).toBe(second.auditSummary.executionHash);
    expect(first.auditSummary.queryHash).toBe(second.auditSummary.queryHash);
    expect(first.dedupReport.duplicatesRemoved).toBe(1);
    for (let i = 1; i < first.sources.length; i++) {
      expect(first.sources[i - 1].relevanceScore).toBeGreaterThanOrEqual(first.sources[i].relevanceScore);
    }
  });

  it('binds claims only above the 0.6 similarity threshold', () => {
    const sources = [makeSource({ id: 's1' })];
    const result = executeResearch(QUERY, sources);
    const bindings = bindToClaims(result, [
      { id: 'c1', text: 'graph neural networks for molecules' },
      { id: 'c2', text: 'zebra xylophone quantum pancakes' },
    ]);
    expect(bindings.some((b) => b.claimId === 'c1')).toBe(true);
    expect(bindings.some((b) => b.claimId === 'c2')).toBe(false);
  });

  it('registers tpl_deterministic_researcher as a synthesizing systemic/algorithmic plugin', () => {
    const tpl = getComponentTemplate('tpl_deterministic_researcher');
    expect(tpl).toBeTruthy();
    expect(tpl?.domain).toBe('systemic');
    expect(tpl?.category).toBe('algorithmic');
    const out = tpl?.synthesizer(
      { maxSources: 10, minRelevance: 0, dedupThreshold: 0.85 },
      { withSelfHealing: true, componentName: 'Researcher' },
    );
    expect(out?.sourceCode).toContain('class Researcher');
    expect(out?.sourceCode).toContain('executeResearch');
    expect(out?.sourceCode).toContain('bindToClaims');
    expect(out?.testSuiteCode).toContain('duplicatesRemoved === 1');
    expect(tpl?.selfHost?.methods.map((m) => m.method)).toEqual(
      expect.arrayContaining(['executeResearch', 'bindToClaims']),
    );
  });
});
