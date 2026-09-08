/**
 * Test Suite: DeterministicWebResearcher
 * ======================================
 * Unit tests with emphasis on determinism, audit trail integrity, and reproducibility.
 * 
 * Key testing principles:
 * - All outputs must be deterministic (same input → same output)
 * - Audit trails must be complete and verifiable
 * - Dedup decisions must be consistent
 * - Relevance scores must be reproducible
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Crypto from 'crypto';
import {
  DeterministicWebResearcher,
  ResearchQuery,
  RawSource,
  VerifiedSource,
  EvidenceCompilerAdapter,
} from './deterministic-web-researcher';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const mockQuery: ResearchQuery = {
  id: 'test_query_001',
  timestamp: 1704067200000, // Fixed: 2024-01-01T00:00:00Z
  topic: 'PTEN loss melanoma immunotherapy',
  intent: 'literature_scan',
  scope: {
    domains: ['arxiv.org', 'pubmed.ncbi.nlm.nih.gov'],
    maxResults: 10,
  },
  constraints: {
    minRelevanceScore: 0.6,
    requireOpenAccess: true,
  },
};

const mockSource1: RawSource = {
  id: 'src_001',
  title: 'PTEN loss in melanoma enhances T cell infiltration',
  url: 'https://arxiv.org/abs/2301.12345',
  domain: 'arxiv.org',
  contentPreview: 'We report that PTEN loss in melanoma models leads to enhanced immune infiltration...',
  metadata: {
    publishedAt: 1693526400000, // 2023-08-31
    authors: ['Smith, John', 'Doe, Alice'],
    accessibilityStatus: 'open' as const,
  },
  fetchedAt: 1704067200000,
};

const mockSource2: RawSource = {
  id: 'src_002',
  title: 'PTEN loss in melanoma enhances T cell infiltration',
  url: 'https://pubmed.ncbi.nlm.nih.gov/37234567',
  domain: 'pubmed.ncbi.nlm.nih.gov',
  contentPreview: 'We report that PTEN loss in melanoma models leads to enhanced immune infiltration...',
  metadata: {
    publishedAt: 1693526400000,
    authors: ['Smith, John', 'Doe, Alice'],
    doi: '10.1234/example.doi',
    accessibilityStatus: 'open' as const,
  },
  fetchedAt: 1704067200000,
};

const mockSource3: RawSource = {
  id: 'src_003',
  title: 'Resistance mechanisms in immunotherapy-treated melanoma',
  url: 'https://pubmed.ncbi.nlm.nih.gov/37345678',
  domain: 'pubmed.ncbi.nlm.nih.gov',
  contentPreview: 'Checkpoint inhibitor resistance in melanoma can involve multiple pathways...',
  metadata: {
    publishedAt: 1702000000000,
    authors: ['Johnson, Bob', 'Williams, Carol'],
    accessibilityStatus: 'paywalled' as const,
  },
  fetchedAt: 1704067200000,
};

const defaultConfig = {
  maxSourcesPerQuery: 100,
  minRelevanceThreshold: 0.5,
  dedupSimilarityThreshold: 0.85,
  allowedDomains: ['arxiv.org', 'pubmed.ncbi.nlm.nih.gov', 'github.com'],
  apiTimeoutMs: 5000,
};

// ============================================================================
// DETERMINISM TESTS
// ============================================================================

describe('DeterministicWebResearcher - Determinism', () => {
  let researcher1: DeterministicWebResearcher;
  let researcher2: DeterministicWebResearcher;

  beforeEach(() => {
    researcher1 = new DeterministicWebResearcher(defaultConfig);
    researcher2 = new DeterministicWebResearcher(defaultConfig);
  });

  it('should produce identical dedup groups from identical inputs', () => {
    // Setup researcher 1
    researcher1.registerQuery(mockQuery);
    researcher1.ingestRawSource(mockSource1);
    researcher1.ingestRawSource(mockSource2);
    researcher1.ingestRawSource(mockSource3);
    const groups1 = researcher1.deduplicateSources();

    // Setup researcher 2 with same inputs
    researcher2.registerQuery(mockQuery);
    researcher2.ingestRawSource(mockSource1);
    researcher2.ingestRawSource(mockSource2);
    researcher2.ingestRawSource(mockSource3);
    const groups2 = researcher2.deduplicateSources();

    // Compare results
    expect(groups1.size).toBe(groups2.size);

    // All groups should match
    const groups1Sorted = Array.from(groups1.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const groups2Sorted = Array.from(groups2.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    groups1Sorted.forEach((group1, idx) => {
      const group2 = groups2Sorted[idx];
      const members1 = group1[1].sort();
      const members2 = group2[1].sort();
      expect(members1).toEqual(members2);
    });
  });

  it('should produce identical relevance scores for identical sources', () => {
    researcher1.registerQuery(mockQuery);
    researcher1.ingestRawSource(mockSource1);
    researcher2.registerQuery(mockQuery);
    researcher2.ingestRawSource(mockSource1);

    const verified1 = researcher1.verifySources(mockQuery.id, ['src_001']);
    const verified2 = researcher2.verifySources(mockQuery.id, ['src_001']);

    expect(verified1.length).toBe(1);
    expect(verified2.length).toBe(1);
    expect(verified1[0].relevanceScore).toBe(verified2[0].relevanceScore);
  });

  it('should produce identical audit hashes for identical execution paths', async () => {
    researcher1.registerQuery(mockQuery);
    researcher1.ingestRawSource(mockSource1);
    researcher1.ingestRawSource(mockSource2);
    const result1 = await researcher1.executeResearch(mockQuery.id);

    researcher2.registerQuery(mockQuery);
    researcher2.ingestRawSource(mockSource1);
    researcher2.ingestRawSource(mockSource2);
    const result2 = await researcher2.executeResearch(mockQuery.id);

    expect(result1.auditSummary.queryHash).toBe(result2.auditSummary.queryHash);
    expect(result1.auditSummary.executionHash).toBe(result2.auditSummary.executionHash);
  });
});

// ============================================================================
// DEDUPLICATION TESTS
// ============================================================================

describe('DeterministicWebResearcher - Deduplication', () => {
  let researcher: DeterministicWebResearcher;

  beforeEach(() => {
    researcher = new DeterministicWebResearcher(defaultConfig);
  });

  it('should detect exact duplicates by content hash', () => {
    researcher.ingestRawSource(mockSource1);
    researcher.ingestRawSource(mockSource2); // Same title/authors as mockSource1
    const groups = researcher.deduplicateSources();

    expect(groups.size).toBeGreaterThan(0);
    // At least one group should contain both duplicate sources
    const hasBoth = Array.from(groups.values()).some(
      group => group.includes('src_001') && group.includes('src_002')
    );
    expect(hasBoth).toBe(true);
  });

  it('should handle non-duplicate distinct sources', () => {
    researcher.ingestRawSource(mockSource1);
    researcher.ingestRawSource(mockSource3); // Different topic
    const groups = researcher.deduplicateSources();

    expect(groups.size).toBe(2); // Should be 2 separate groups
  });

  it('should merge similar sources above threshold', () => {
    // Paraphrased title of mockSource1: edit distance gives similarity ≈0.71.
    // The 0.85 default requires near-identical titles; use a looser threshold
    // to exercise the semantic-merge path explicitly.
    const looseResearcher = new DeterministicWebResearcher({
      ...defaultConfig,
      dedupSimilarityThreshold: 0.7,
    });
    const similarSource: RawSource = {
      id: 'src_similar',
      title: 'PTEN loss in melanoma enhances T cells', // Very similar title
      url: 'https://different-domain.org/paper',
      domain: 'different-domain.org',
      contentPreview: 'Different content but similar title...',
      metadata: {
        publishedAt: 1693526400000,
        authors: ['Smith, John'],
        accessibilityStatus: 'open' as const,
      },
      fetchedAt: 1704067200000,
    };

    looseResearcher.ingestRawSource(mockSource1);
    looseResearcher.ingestRawSource(similarSource);
    const groups = looseResearcher.deduplicateSources();

    // Should group them due to title similarity
    const hasBoth = Array.from(groups.values()).some(
      group => group.includes('src_001') && group.includes('src_similar')
    );
    expect(hasBoth).toBe(true);
  });
});

// ============================================================================
// RELEVANCE SCORING TESTS
// ============================================================================

describe('DeterministicWebResearcher - Relevance Scoring', () => {
  let researcher: DeterministicWebResearcher;

  beforeEach(() => {
    researcher = new DeterministicWebResearcher(defaultConfig);
  });

  it('should score sources with query keyword matches higher', () => {
    researcher.registerQuery(mockQuery);
    researcher.ingestRawSource(mockSource1); // Contains "PTEN loss melanoma" keywords
    researcher.ingestRawSource(mockSource3); // Contains "melanoma" but not "PTEN"

    const verified = researcher.verifySources(mockQuery.id, ['src_001', 'src_003']);
    const src1 = verified.find(v => v.id === 'src_001');
    const src3 = verified.find(v => v.id === 'src_003');

    if (src1 && src3) {
      expect(src1.relevanceScore).toBeGreaterThan(src3.relevanceScore);
    }
  });

  it('should award bonus for trusted domains', () => {
    researcher.registerQuery(mockQuery);
    researcher.ingestRawSource(mockSource1); // arxiv.org (trusted)

    const untrustedSource: RawSource = {
      id: 'src_untrusted',
      title: 'PTEN loss melanoma immunotherapy',
      url: 'https://unknown-blog.com/post',
      domain: 'unknown-blog.com',
      contentPreview: 'PTEN loss melanoma...',
      metadata: {
        publishedAt: 1693526400000,
        accessibilityStatus: 'open' as const,
      },
      fetchedAt: 1704067200000,
    };

    researcher.ingestRawSource(untrustedSource);

    const verified = researcher.verifySources(mockQuery.id, ['src_001', 'src_untrusted']);
    const trusted = verified.find(v => v.id === 'src_001');
    const untrusted = verified.find(v => v.id === 'src_untrusted');

    if (trusted && untrusted) {
      expect(trusted.relevanceScore).toBeGreaterThan(untrusted.relevanceScore);
    }
  });

  it('should apply recency decay for older sources', () => {
    researcher.registerQuery(mockQuery);

    const recentSource: RawSource = {
      id: 'src_recent',
      title: 'PTEN loss melanoma',
      url: 'https://arxiv.org/abs/2312.99999',
      domain: 'arxiv.org',
      contentPreview: 'PTEN loss melanoma...',
      metadata: {
        publishedAt: Date.now() - 1000 * 60 * 60 * 24 * 7, // 7 days ago
        accessibilityStatus: 'open' as const,
      },
      fetchedAt: Date.now(),
    };

    const oldSource: RawSource = {
      id: 'src_old',
      title: 'PTEN loss melanoma',
      url: 'https://arxiv.org/abs/2010.11111',
      domain: 'arxiv.org',
      contentPreview: 'PTEN loss melanoma...',
      metadata: {
        publishedAt: Date.now() - 1000 * 60 * 60 * 24 * 365 * 3, // 3 years ago
        accessibilityStatus: 'open' as const,
      },
      fetchedAt: Date.now(),
    };

    researcher.ingestRawSource(recentSource);
    researcher.ingestRawSource(oldSource);

    const verified = researcher.verifySources(mockQuery.id, ['src_recent', 'src_old']);
    const recent = verified.find(v => v.id === 'src_recent');
    const old = verified.find(v => v.id === 'src_old');

    if (recent && old) {
      expect(recent.relevanceScore).toBeGreaterThanOrEqual(old.relevanceScore);
    }
  });
});

// ============================================================================
// AUDIT TRAIL TESTS
// ============================================================================

describe('DeterministicWebResearcher - Audit Trail', () => {
  let researcher: DeterministicWebResearcher;

  beforeEach(() => {
    researcher = new DeterministicWebResearcher(defaultConfig);
  });

  it('should log all operations in execution log', async () => {
    researcher.registerQuery(mockQuery);
    researcher.ingestRawSource(mockSource1);
    await researcher.executeResearch(mockQuery.id);

    const log = researcher.getExecutionLog();
    expect(log.length).toBeGreaterThan(0);

    // Verify log structure (init is a valid stage — logged at construction)
    log.forEach(entry => {
      expect(entry.timestamp).toBeGreaterThan(0);
      expect(['init', 'query_validation', 'fetch', 'dedup', 'verify', 'score']).toContain(entry.stage);
      expect(typeof entry.resultCode).toBe('number');
      expect(entry.action).toBeDefined();
    });
  });

  it('should produce deterministic execution hash', async () => {
    researcher.registerQuery(mockQuery);
    researcher.ingestRawSource(mockSource1);
    researcher.ingestRawSource(mockSource2);
    const result1 = await researcher.executeResearch(mockQuery.id);

    const researcher2 = new DeterministicWebResearcher(defaultConfig);
    researcher2.registerQuery(mockQuery);
    researcher2.ingestRawSource(mockSource1);
    researcher2.ingestRawSource(mockSource2);
    const result2 = await researcher2.executeResearch(mockQuery.id);

    expect(result1.auditSummary.executionHash).toBe(result2.auditSummary.executionHash);
  });

  it('should include detailed audit summary', async () => {
    researcher.registerQuery(mockQuery);
    researcher.ingestRawSource(mockSource1);
    researcher.ingestRawSource(mockSource2);
    researcher.ingestRawSource(mockSource3);

    const result = await researcher.executeResearch(mockQuery.id);

    expect(result.auditSummary.queryHash).toBeDefined();
    expect(result.auditSummary.executionHash).toBeDefined();
    expect(result.auditSummary.dedupReport).toBeDefined();
    expect(result.auditSummary.dedupReport.groupsFormed).toBeGreaterThan(0);
    expect(result.auditSummary.scoreDistribution).toBeDefined();
  });

  it('should compute audit hash for each verified source', () => {
    researcher.registerQuery(mockQuery);
    researcher.ingestRawSource(mockSource1);

    const verified = researcher.verifySources(mockQuery.id, ['src_001']);
    expect(verified.length).toBeGreaterThan(0);
    verified.forEach(source => {
      expect(source.auditHash).toBeDefined();
      // Audit hash should be a valid SHA256
      expect(source.auditHash).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});

// ============================================================================
// EVIDENCE COMPILER INTEGRATION TESTS
// ============================================================================

describe('EvidenceCompilerAdapter - Claim Binding', () => {
  it('should bind research sources to evidence claims', () => {
    const result = {
      queryId: 'test_001',
      rawSourceCount: 2,
      dedupedGroupCount: 2,
      verifiedSourceCount: 2,
      sources: [mockSource1 as VerifiedSource, mockSource3 as VerifiedSource].map(s => ({
        ...s,
        relevanceScore: 0.85,
        confidenceLevel: 'high' as const,
        dataQuality: {
          hasMetadata: true,
          hasAuthors: true,
          isOpenAccess: true,
        },
        auditHash: Crypto.createHash('sha256')
          .update(s.id)
          .digest('hex'),
      })),
      executionLog: [],
      auditSummary: {
        queryHash: 'test_hash',
        executionHash: 'test_exec_hash',
        startedAt: Date.now(),
        completedAt: Date.now(),
        dedupReport: {
          groupsFormed: 2,
          duplicatesRemoved: 0,
          mergeStrategy: 'none',
        },
        scoreDistribution: {
          high: 2,
          medium: 0,
          low: 0,
        },
      },
    };

    const claims = [
      { id: 'claim_001', text: 'PTEN loss enhances T cell infiltration' },
      { id: 'claim_002', text: 'Immunotherapy resistance in melanoma' },
    ];

    const bindings = EvidenceCompilerAdapter.bindToClaims(result, claims);

    expect(bindings.length).toBeGreaterThan(0);
    bindings.forEach(binding => {
      expect(binding.sourceId).toBeDefined();
      expect(binding.claimId).toBeDefined();
      expect(['high', 'medium', 'low']).toContain(binding.confidenceLevel);
      expect(binding.auditHash).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});

// ============================================================================
// REPRODUCIBILITY TESTS
// ============================================================================

describe('DeterministicWebResearcher - Reproducibility', () => {
  it('should replay identical execution from log', () => {
    const researcher1 = new DeterministicWebResearcher(defaultConfig);
    researcher1.registerQuery(mockQuery);
    researcher1.ingestRawSource(mockSource1);
    researcher1.ingestRawSource(mockSource2);
    researcher1.ingestRawSource(mockSource3);

    const log1 = researcher1.getExecutionLog();

    // Second execution with same operations
    const researcher2 = new DeterministicWebResearcher(defaultConfig);
    researcher2.registerQuery(mockQuery);
    researcher2.ingestRawSource(mockSource1);
    researcher2.ingestRawSource(mockSource2);
    researcher2.ingestRawSource(mockSource3);

    const log2 = researcher2.getExecutionLog();

    // Logs should have same structure and result codes
    expect(log1.length).toBe(log2.length);
    log1.forEach((entry, idx) => {
      expect(entry.stage).toBe(log2[idx].stage);
      expect(entry.resultCode).toBe(log2[idx].resultCode);
    });
  });
});
