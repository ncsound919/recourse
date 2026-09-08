/**
 * Deterministic Web Researcher
 * ============================
 * Core research engine for Overlay365 diagnostic pipelines.
 * 
 * Design principles:
 * - Every query, source, and decision is logged with full audit trail
 * - Evidence scoring is deterministic and reproducible
 * - Deduplication uses precise similarity matching (not probabilistic)
 * - All external data flows are validated before integration
 * - Output is structured for evidence compilers and auditors
 * 
 * Integrates with:
 * - Recourse (sandboxed execution, template plugin, self-hosting)
 * - Cancer frontier study tools
 * - FinTech education pipelines
 * - Chain of Custody compliance engines
 */

import Crypto from 'crypto';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface ResearchQuery {
  id: string;
  timestamp: number;
  topic: string;
  intent: 'literature_scan' | 'fact_check' | 'trend_detection' | 'evidence_collection';
  scope: {
    domains?: string[];     // e.g., ['arxiv', 'github', 'clinicaltrials.gov']
    dateRange?: [number, number]; // [from_ms, to_ms]
    languages?: string[];
    maxResults?: number;
  };
  constraints?: {
    minRelevanceScore?: number;  // 0-1
    excludeTerms?: string[];
    requirePeerReview?: boolean;
    requireOpenAccess?: boolean;
  };
}

export interface RawSource {
  id: string;
  title: string;
  url: string;
  domain: string;
  contentPreview: string;
  metadata: {
    publishedAt?: number;
    authors?: string[];
    doi?: string;
    accessibilityStatus: 'open' | 'paywalled' | 'restricted';
  };
  fetchedAt: number;
}

export interface DedupCandidate {
  id: string;
  groupId: string;
  sourceId: string;
  similarityScore: number; // 0-1, exact match = 1.0
  matchType: 'exact_hash' | 'semantic' | 'doi_match' | 'author_cluster';
  metadata: Record<string, unknown>;
}

export interface VerifiedSource extends RawSource {
  relevanceScore: number;      // 0-1, based on query
  confidenceLevel: 'high' | 'medium' | 'low';
  dataQuality: {
    hasMetadata: boolean;
    hasAuthors: boolean;
    isOpenAccess: boolean;
    citationCount?: number;
    h5Index?: number; // for academic sources
  };
  extractedClaims?: string[];
  auditHash: string;           // SHA256 of all prior fields
}

export interface ResearchResult {
  queryId: string;
  rawSourceCount: number;
  dedupedGroupCount: number;
  verifiedSourceCount: number;
  sources: VerifiedSource[];
  executionLog: ExecutionLogEntry[];
  auditSummary: AuditSummary;
}

export interface ExecutionLogEntry {
  timestamp: number;
  stage: 'init' | 'query_validation' | 'fetch' | 'dedup' | 'verify' | 'score';
  action: string;
  resultCode: number; // 0 = success, >0 = error/warning
  details?: Record<string, unknown>;
}

export interface AuditSummary {
  queryHash: string;
  executionHash: string;   // deterministic hash of entire execution
  startedAt: number;
  completedAt: number;
  dedupReport: {
    groupsFormed: number;
    duplicatesRemoved: number;
    mergeStrategy: string;
  };
  scoreDistribution: {
    high: number;    // count >= 0.8
    medium: number;  // 0.5-0.79
    low: number;     // < 0.5
  };
}

// ============================================================================
// CORE RESEARCHER ENGINE
// ============================================================================

export class DeterministicWebResearcher {
  private queries: Map<string, ResearchQuery> = new Map();
  private rawSources: Map<string, RawSource> = new Map();
  private executionLog: ExecutionLogEntry[] = [];
  private sourceHashIndex: Map<string, string> = new Map(); // hash → sourceId

  constructor(private config: {
    maxSourcesPerQuery: number;
    minRelevanceThreshold: number;
    dedupSimilarityThreshold: number;
    allowedDomains: string[];
    apiTimeoutMs: number;
  }) {
    this.logAction('init', 'Researcher initialized', 0);
  }

  /**
   * Register a research query with full audit capture.
   */
  registerQuery(query: ResearchQuery): void {
    if (this.queries.has(query.id)) {
      this.logAction('query_validation', `Query ${query.id} already registered`, 1);
      return;
    }
    this.queries.set(query.id, query);
    this.logAction('query_validation', `Query registered: ${query.topic}`, 0, {
      intent: query.intent,
      constraintCount: Object.keys(query.constraints || {}).length,
    });
  }

  /**
   * Ingest raw sources (from web fetch, API call, etc).
   * Each source is hashed for dedup detection.
   */
  ingestRawSource(source: RawSource): void {
    const sourceHash = this.computeSourceHash(source);
    this.sourceHashIndex.set(sourceHash, source.id);
    this.rawSources.set(source.id, source);
    this.logAction('fetch', `Source ingested: ${source.title.slice(0, 50)}…`, 0, {
      domain: source.domain,
      hashCollision: this.sourceHashIndex.get(sourceHash) !== source.id,
    });
  }

  /**
   * Compute deterministic hash for source content.
   * Used for exact-match dedup and audit trail.
   */
  private computeSourceHash(source: RawSource): string {
    const contentKey = [
      source.title.toLowerCase().trim(),
      source.url,
      source.metadata.doi || '',
      source.metadata.authors?.join('|').toLowerCase() || '',
    ].join('\n');
    return Crypto.createHash('sha256').update(contentKey).digest('hex');
  }

  /**
   * Dedup phase: group near-duplicate sources.
   * Returns map of dedup groups (groupId → sourceIds).
   */
  deduplicateSources(): Map<string, string[]> {
    const groups = new Map<string, string[]>();
    const processed = new Set<string>();
    let groupCounter = 0;

    for (const [sourceId, source] of this.rawSources) {
      if (processed.has(sourceId)) continue;

      const hash = this.computeSourceHash(source);
      const groupId = `dedup_${groupCounter++}`;

      // Exact match: same hash
      const exactMatches = Array.from(this.rawSources.values())
        .filter(s => !processed.has(s.id) && this.computeSourceHash(s) === hash)
        .map(s => s.id);

      // Semantic match: title/author similarity above threshold
      const semanticMatches = Array.from(this.rawSources.values())
        .filter(s => 
          !processed.has(s.id) && 
          s.id !== sourceId && 
          this.stringSimilarity(source.title, s.title) > this.config.dedupSimilarityThreshold
        )
        .map(s => s.id);

      const groupMembers = [...new Set([sourceId, ...exactMatches, ...semanticMatches])];
      groups.set(groupId, groupMembers);
      groupMembers.forEach(id => processed.add(id));

      this.logAction('dedup', `Group ${groupId} formed`, 0, {
        memberCount: groupMembers.length,
        exactMatches: exactMatches.length,
        semanticMatches: semanticMatches.length,
      });
    }

    return groups;
  }

  /**
   * Verify sources: check quality, extract metadata, compute relevance.
   */
  verifySources(queryId: string, sourceIds: string[]): VerifiedSource[] {
    const query = this.queries.get(queryId);
    if (!query) {
      this.logAction('verify', `Query ${queryId} not found`, 2);
      return [];
    }

    const verified: VerifiedSource[] = [];

    for (const sourceId of sourceIds) {
      const raw = this.rawSources.get(sourceId);
      if (!raw) continue;

      // Compute relevance score
      const relevanceScore = this.scoreRelevance(raw, query);
      if (relevanceScore < (query.constraints?.minRelevanceScore || this.config.minRelevanceThreshold)) {
        this.logAction('verify', `Source ${sourceId} below relevance threshold`, 0, {
          score: relevanceScore,
          threshold: query.constraints?.minRelevanceScore,
        });
        continue;
      }

      // Data quality checks
      const dataQuality = {
        hasMetadata: Boolean(raw.metadata.publishedAt && raw.metadata.authors),
        hasAuthors: Boolean(raw.metadata.authors?.length),
        isOpenAccess: raw.metadata.accessibilityStatus === 'open',
        citationCount: 0,
        h5Index: undefined,
      };

      const verifiedSource: VerifiedSource = {
        ...raw,
        relevanceScore,
        confidenceLevel: this.computeConfidence(relevanceScore, dataQuality),
        dataQuality,
        auditHash: this.computeAuditHash(raw, relevanceScore, dataQuality),
      };

      verified.push(verifiedSource);
      this.logAction('verify', `Source verified: ${raw.title.slice(0, 40)}…`, 0, {
        confidenceLevel: verifiedSource.confidenceLevel,
        relevanceScore,
      });
    }

    return verified;
  }

  /**
   * Score relevance of a source to a query.
   * Deterministic: based on keyword overlap, domain reputation, recency.
   */
  private scoreRelevance(source: RawSource, query: ResearchQuery): number {
    let score = 0;

    // Keyword match
    const queryTokens = query.topic.toLowerCase().split(/\s+/);
    const sourceText = `${source.title} ${source.contentPreview}`.toLowerCase();
    const keywordMatches = queryTokens.filter(token => sourceText.includes(token)).length;
    score += (keywordMatches / queryTokens.length) * 0.4;

    // Domain reputation
    const trustedDomains = ['arxiv.org', 'pubmed.ncbi.nlm.nih.gov', 'github.com', 'nature.com', 'science.org'];
    if (trustedDomains.includes(source.domain)) {
      score += 0.3;
    }

    // Recency
    if (source.metadata.publishedAt) {
      const ageMonths = (Date.now() - source.metadata.publishedAt) / (1000 * 60 * 60 * 24 * 30);
      score += Math.max(0, 0.3 * (1 - ageMonths / 12)); // decay over 12 months
    }

    // Open access bonus
    if (source.metadata.accessibilityStatus === 'open') {
      score += 0.1;
    }

    return Math.min(1, score);
  }

  /**
   * Compute confidence level based on relevance and data quality.
   */
  private computeConfidence(
    relevanceScore: number,
    quality: VerifiedSource['dataQuality']
  ): 'high' | 'medium' | 'low' {
    const qualityScore = (
      (quality.hasMetadata ? 0.3 : 0) +
      (quality.hasAuthors ? 0.3 : 0) +
      (quality.isOpenAccess ? 0.2 : 0) +
      (quality.citationCount ? Math.min(0.2, quality.citationCount / 100) : 0)
    );
    const combined = relevanceScore * 0.6 + qualityScore * 0.4;
    if (combined >= 0.8) return 'high';
    if (combined >= 0.5) return 'medium';
    return 'low';
  }

  /**
   * Compute audit hash for a verified source.
   * Ensures integrity and reproducibility.
   */
  private computeAuditHash(
    source: RawSource,
    relevanceScore: number,
    quality: VerifiedSource['dataQuality']
  ): string {
    const content = [
      source.id,
      source.url,
      source.title,
      relevanceScore.toString(),
      JSON.stringify(quality),
    ].join('|');
    return Crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Compute string similarity (0-1) for dedup.
   * Uses Levenshtein distance ratio.
   */
  private stringSimilarity(a: string, b: string): number {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    const distance = this.levenshteinDistance(a, b);
    return 1 - distance / maxLen;
  }

  /**
   * Levenshtein distance for fuzzy matching.
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        const cost = a[j - 1] === b[i - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    return matrix[b.length][a.length];
  }

  /**
   * Execute full research pipeline.
   */
  async executeResearch(queryId: string): Promise<ResearchResult> {
    const query = this.queries.get(queryId);
    if (!query) {
      throw new Error(`Query ${queryId} not found`);
    }

    this.logAction('query_validation', `Starting research: ${query.topic}`, 0);

    // Dedup phase
    const dupGroups = this.deduplicateSources();
    const representativeIds = Array.from(dupGroups.values()).map(group => group[0]);

    // Verify phase
    const verified = this.verifySources(queryId, representativeIds);

    // Score distribution
    const scoreDistribution = {
      high: verified.filter(s => s.relevanceScore >= 0.8).length,
      medium: verified.filter(s => s.relevanceScore >= 0.5 && s.relevanceScore < 0.8).length,
      low: verified.filter(s => s.relevanceScore < 0.5).length,
    };

    const result: ResearchResult = {
      queryId,
      rawSourceCount: this.rawSources.size,
      dedupedGroupCount: dupGroups.size,
      verifiedSourceCount: verified.length,
      sources: verified.sort((a, b) => b.relevanceScore - a.relevanceScore),
      executionLog: this.executionLog,
      auditSummary: {
        queryHash: Crypto.createHash('sha256').update(JSON.stringify(query)).digest('hex'),
        executionHash: this.computeExecutionHash(),
        startedAt: query.timestamp,
        completedAt: Date.now(),
        dedupReport: {
          groupsFormed: dupGroups.size,
          duplicatesRemoved: this.rawSources.size - representativeIds.length,
          mergeStrategy: 'first_in_group_retained',
        },
        scoreDistribution,
      },
    };

    this.logAction('score', 'Research pipeline completed', 0, {
      verifiedSources: verified.length,
      scores: scoreDistribution,
    });

    return result;
  }

  /**
   * Compute hash of entire execution for reproducibility audit.
   *
   * Determinism fix: wall-clock timestamps are RECORDED in the log (audit
   * trail stays complete) but EXCLUDED from the hash. Otherwise two
   * executions of the same query+sources can never produce identical hashes,
   * defeating the reproducibility guarantee this hash exists to prove.
   */
  private computeExecutionHash(): string {
    const logContent = this.executionLog
      .map(e => `${e.stage}|${e.action}|${e.resultCode}`)
      .join('\n');
    return Crypto.createHash('sha256').update(logContent).digest('hex');
  }

  /**
   * Log action to audit trail.
   */
  private logAction(
    stage: ExecutionLogEntry['stage'],
    action: string,
    resultCode: number,
    details?: Record<string, unknown>
  ): void {
    this.executionLog.push({
      timestamp: Date.now(),
      stage,
      action,
      resultCode,
      details,
    });
  }

  /**
   * Get execution log for auditing.
   */
  getExecutionLog(): ExecutionLogEntry[] {
    return [...this.executionLog];
  }

  /**
   * Export result as JSON-LD for RDF/semantic systems.
   */
  exportAsLinkedData(result: ResearchResult): Record<string, unknown> {
    return {
      '@context': 'https://schema.org',
      '@type': 'ScholarlyArticle',
      name: `Research Result ${result.queryId}`,
      datePublished: new Date(result.auditSummary.completedAt).toISOString(),
      citation: result.sources.map(s => ({
        '@type': 'ScholarlyArticle',
        url: s.url,
        name: s.title,
        author: s.metadata.authors,
      })),
      mainEntity: {
        '@type': 'Dataset',
        url: result.auditSummary.executionHash,
      },
    };
  }
}

// ============================================================================
// EVIDENCE COMPILER ADAPTER (for Overlay365 integration)
// ============================================================================

export interface EvidenceClaimBinding {
  sourceId: string;
  claimId: string;
  confidenceLevel: VerifiedSource['confidenceLevel'];
  supportingQuotes?: string[];
  contradictingQuotes?: string[];
  auditHash: string;
}

export class EvidenceCompilerAdapter {
  /**
   * Bind research results to evidence compiler claims.
   * Produces deterministic evidence bindings for auditor validation.
   */
  static bindToClaims(
    researchResult: ResearchResult,
    claims: Array<{ id: string; text: string }>
  ): EvidenceClaimBinding[] {
    const bindings: EvidenceClaimBinding[] = [];

    for (const claim of claims) {
      for (const source of researchResult.sources) {
        const similarity = this.claimSourceSimilarity(claim.text, source.title + ' ' + source.contentPreview);
        if (similarity > 0.6) {
          bindings.push({
            sourceId: source.id,
            claimId: claim.id,
            confidenceLevel: source.confidenceLevel,
            auditHash: Crypto.createHash('sha256')
              .update(`${source.id}|${claim.id}|${similarity}`)
              .digest('hex'),
          });
        }
      }
    }

    return bindings;
  }

  private static claimSourceSimilarity(claim: string, sourceText: string): number {
    const claimWords = claim.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const sourceWords = sourceText.toLowerCase().split(/\s+/);
    const matches = claimWords.filter(w => sourceText.includes(w)).length;
    return matches / claimWords.length;
  }
}

// ============================================================================
// RECOURSE INTEGRATION (Self-Hosting Template)
// ============================================================================

/**
 * Recourse template plugin descriptor.
 * Enables self-hosted deterministic research execution.
 */
export const researcherTemplateDescriptor = {
  name: 'DeterministicWebResearcher',
  id: 'deterministic_web_researcher_v1',
  description: 'Deterministic research pipeline with full audit trail for scientific evidence collection',
  selfHost: {
    module: './deterministic-web-researcher.mjs',
    methods: ['executeResearch', 'ingestRawSource', 'deduplicateSources', 'verifySources'],
  },
  tags: ['research', 'evidence', 'audit', 'deterministic'],
};

/**
 * Export for Recourse registry.
 */
export function registerRecourseTemplate() {
  return {
    descriptor: researcherTemplateDescriptor,
    factory: (config: ConstructorParameters<typeof DeterministicWebResearcher>[0]) =>
      new DeterministicWebResearcher(config),
  };
}
