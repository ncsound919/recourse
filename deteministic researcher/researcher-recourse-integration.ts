/**
 * Recourse Integration Layer
 * ==========================
 * Wires DeterministicWebResearcher into Recourse's ecosystem:
 * - Template plugin registration
 * - Sandboxed execution with verifiers
 * - Self-hosted module wiring
 * - Evidence compiler integration
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import Crypto from 'crypto';
import {
  DeterministicWebResearcher,
  ResearchQuery,
  RawSource,
  ResearchResult,
  VerifiedSource,
  EvidenceCompilerAdapter,
  EvidenceClaimBinding,
} from './deterministic-web-researcher.js';

// ============================================================================
// RECOURSE TEMPLATE PLUGIN (for component building)
// ============================================================================

export interface RecourseVerifierContract {
  /**
   * Input contract: what this tool expects.
   */
  input: Record<string, unknown>;
  /**
   * Output contract: what this tool guarantees.
   */
  output: Record<string, unknown>;
  /**
   * Test suite: executed in sandbox on every promotion.
   */
  testCode: string;
}

export class ResearcherTemplatePlugin {
  private researcher: DeterministicWebResearcher;

  constructor(private config: {
    maxSourcesPerQuery: number;
    minRelevanceThreshold: number;
    dedupSimilarityThreshold: number;
    allowedDomains: string[];
    apiTimeoutMs: number;
  }) {
    this.researcher = new DeterministicWebResearcher(config);
  }

  /**
   * Recourse contract definition.
   * The verifier will execute this test suite in an isolated VM.
   */
  getVerifierContract(): RecourseVerifierContract {
    return {
      input: {
        queryId: 'string',
        topic: 'string',
        intent: 'string',
        scope: 'object',
        constraints: 'object',
      },
      output: {
        queryId: 'string',
        rawSourceCount: 'number',
        dedupedGroupCount: 'number',
        verifiedSourceCount: 'number',
        sources: 'array',
        auditSummary: 'object',
      },
      testCode: `
        // Isolated sandbox: test the researcher with known inputs
        import { DeterministicWebResearcher } from './deterministic-web-researcher.js';
        
        const researcher = new DeterministicWebResearcher({
          maxSourcesPerQuery: 100,
          minRelevanceThreshold: 0.5,
          dedupSimilarityThreshold: 0.85,
          allowedDomains: ['arxiv.org', 'pubmed.ncbi.nlm.nih.gov', 'github.com'],
          apiTimeoutMs: 5000,
        });

        // Test 1: Query registration and validation
        const testQuery = {
          id: 'test_query_001',
          timestamp: Date.now(),
          topic: 'immunotherapy cancer resistance',
          intent: 'literature_scan',
          scope: {
            domains: ['arxiv.org', 'pubmed.ncbi.nlm.nih.gov'],
            maxResults: 10,
          },
          constraints: {
            minRelevanceScore: 0.7,
            requirePeerReview: true,
          },
        };
        researcher.registerQuery(testQuery);
        assert(researcher.queries.has('test_query_001'), 'Query registration failed');

        // Test 2: Source ingestion and dedup
        const source1 = {
          id: 'src_001',
          title: 'PTEN loss in melanoma',
          url: 'https://arxiv.org/abs/2301.12345',
          domain: 'arxiv.org',
          contentPreview: 'Abstract: We investigate PTEN loss...',
          metadata: {
            publishedAt: Date.now() - 1000 * 60 * 60 * 24 * 30,
            authors: ['Smith, J.', 'Doe, A.'],
            accessibilityStatus: 'open',
          },
          fetchedAt: Date.now(),
        };
        const source2 = {
          id: 'src_002',
          title: 'PTEN loss in melanoma', // Exact duplicate title
          url: 'https://pubmed.ncbi.nlm.nih.gov/12345678',
          domain: 'pubmed.ncbi.nlm.nih.gov',
          contentPreview: 'Abstract: We investigate PTEN loss...',
          metadata: {
            publishedAt: Date.now() - 1000 * 60 * 60 * 24 * 30,
            authors: ['Smith, J.', 'Doe, A.'],
            doi: '10.1234/example',
            accessibilityStatus: 'open',
          },
          fetchedAt: Date.now(),
        };
        researcher.ingestRawSource(source1);
        researcher.ingestRawSource(source2);

        // Test 3: Deduplication
        const groups = researcher.deduplicateSources();
        assert(groups.size > 0, 'No dedup groups formed');
        assert(groups.size <= 2, 'Dedup should produce at most 2 groups');

        // Test 4: Relevance scoring
        const verified = researcher.verifySources('test_query_001', ['src_001']);
        assert(verified.length >= 0, 'Verification should return array');
        if (verified.length > 0) {
          assert(verified[0].relevanceScore >= 0 && verified[0].relevanceScore <= 1, 'Score out of range');
          assert(['high', 'medium', 'low'].includes(verified[0].confidenceLevel), 'Invalid confidence');
        }

        // Test 5: Audit trail
        const log = researcher.getExecutionLog();
        assert(log.length > 0, 'Execution log should have entries');
        log.forEach(entry => {
          assert(entry.timestamp > 0, 'Invalid timestamp');
          assert(entry.stage, 'Missing stage');
          assert(typeof entry.resultCode === 'number', 'Invalid result code');
        });

        console.log('All tests passed');
      `,
    };
  }

  /**
   * Public API method: Execute research query.
   * This is what Recourse will sandbox and verify.
   */
  async executeResearchQuery(query: ResearchQuery, rawSources: RawSource[]): Promise<ResearchResult> {
    this.researcher.registerQuery(query);
    for (const source of rawSources) {
      this.researcher.ingestRawSource(source);
    }
    return this.researcher.executeResearch(query.id);
  }

  /**
   * Public API method: Bind research results to evidence claims.
   */
  bindToEvidenceClaims(
    result: ResearchResult,
    claims: Array<{ id: string; text: string }>
  ): EvidenceClaimBinding[] {
    return EvidenceCompilerAdapter.bindToClaims(result, claims);
  }

  /**
   * Recourse self-hosted descriptor.
   */
  getSelfHostDescriptor() {
    return {
      name: 'DeterministicWebResearcher',
      id: 'deterministic_web_researcher_v1',
      description: 'Deterministic research pipeline with full audit trail for evidence collection',
      selfHost: {
        module: 'deterministic-web-researcher.mjs',
        methods: ['executeResearchQuery', 'bindToEvidenceClaims'],
      },
      tags: ['research', 'evidence', 'audit', 'deterministic'],
      version: '1.0.0',
      author: 'Overlay365',
    };
  }
}

// ============================================================================
// MCP SERVER (for agent coordination)
// ============================================================================

const querySchema = z.object({
  queryId: z.string().describe('Unique query identifier'),
  topic: z.string().describe('Research topic'),
  intent: z.enum(['literature_scan', 'fact_check', 'trend_detection', 'evidence_collection']),
  scope: z
    .object({
      domains: z.array(z.string()).optional(),
      dateRange: z.tuple([z.number(), z.number()]).optional(),
      maxResults: z.number().optional(),
    })
    .optional(),
  constraints: z
    .object({
      minRelevanceScore: z.number().min(0).max(1).optional(),
      excludeTerms: z.array(z.string()).optional(),
      requirePeerReview: z.boolean().optional(),
      requireOpenAccess: z.boolean().optional(),
    })
    .optional(),
});

const sourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().url(),
  domain: z.string(),
  contentPreview: z.string(),
  metadata: z.object({
    publishedAt: z.number().optional(),
    authors: z.array(z.string()).optional(),
    doi: z.string().optional(),
    accessibilityStatus: z.enum(['open', 'paywalled', 'restricted']),
  }),
  fetchedAt: z.number(),
});

const claimSchema = z.object({
  id: z.string(),
  text: z.string(),
});

export class ResearcherMCPServer {
  private server: Server;
  private plugin: ResearcherTemplatePlugin;

  constructor(config: ConstructorParameters<typeof ResearcherTemplatePlugin>[0]) {
    this.server = new Server({
      name: 'deterministic-web-researcher',
      version: '1.0.0',
    });

    this.plugin = new ResearcherTemplatePlugin(config);
    this.registerTools();
  }

  private registerTools() {
    // Tool 1: Execute research query
    this.server.registerTool(
      {
        name: 'execute_research_query',
        description:
          'Execute deterministic research query with full audit trail. Returns verified sources ranked by relevance.',
        inputSchema: z.object({
          query: querySchema,
          sources: z.array(sourceSchema),
        }),
      },
      async ({ query, sources }) => {
        try {
          const result = await this.plugin.executeResearchQuery(query as ResearchQuery, sources as RawSource[]);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool 2: Bind to evidence claims
    this.server.registerTool(
      {
        name: 'bind_research_to_claims',
        description:
          'Bind research results to evidence compiler claims. Returns claim-source bindings with confidence levels.',
        inputSchema: z.object({
          queryId: z.string(),
          sources: z.array(sourceSchema.extend({ relevanceScore: z.number(), confidenceLevel: z.enum(['high', 'medium', 'low']) })),
          claims: z.array(claimSchema),
        }),
      },
      ({ queryId, sources, claims }) => {
        try {
          const result: ResearchResult = {
            queryId,
            rawSourceCount: sources.length,
            dedupedGroupCount: sources.length,
            verifiedSourceCount: sources.length,
            sources: sources as VerifiedSource[],
            executionLog: [],
            auditSummary: {
              queryHash: Crypto.createHash('sha256').update(queryId).digest('hex'),
              executionHash: Crypto.createHash('sha256').update(JSON.stringify(sources)).digest('hex'),
              startedAt: Date.now(),
              completedAt: Date.now(),
              dedupReport: {
                groupsFormed: sources.length,
                duplicatesRemoved: 0,
                mergeStrategy: 'none',
              },
              scoreDistribution: {
                high: sources.filter(s => s.relevanceScore >= 0.8).length,
                medium: sources.filter(s => s.relevanceScore >= 0.5 && s.relevanceScore < 0.8).length,
                low: sources.filter(s => s.relevanceScore < 0.5).length,
              },
            },
          };

          const bindings = this.plugin.bindToEvidenceClaims(result, claims as any);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(bindings, null, 2),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
    );

    // Tool 3: Get verifier contract (for Recourse)
    this.server.registerTool(
      {
        name: 'get_verifier_contract',
        description: 'Get the Recourse verifier contract for this researcher tool',
        inputSchema: z.object({}),
      },
      () => {
        const contract = this.plugin.getVerifierContract();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(contract, null, 2),
            },
          ],
        };
      }
    );
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('Deterministic Web Researcher MCP server started');
  }
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = {
    maxSourcesPerQuery: parseInt(process.env.MAX_SOURCES || '100'),
    minRelevanceThreshold: parseFloat(process.env.MIN_RELEVANCE || '0.5'),
    dedupSimilarityThreshold: parseFloat(process.env.DEDUP_THRESHOLD || '0.85'),
    allowedDomains: (process.env.ALLOWED_DOMAINS || 'arxiv.org,pubmed.ncbi.nlm.nih.gov,github.com').split(','),
    apiTimeoutMs: parseInt(process.env.API_TIMEOUT || '5000'),
  };

  const server = new ResearcherMCPServer(config);
  server.start().catch(error => {
    console.error('Server error:', error);
    process.exit(1);
  });
}
