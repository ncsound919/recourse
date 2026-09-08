# Deterministic Web Researcher - Quick Start Guide

## Installation

```bash
# Clone repository
git clone https://github.com/ncsound919/deterministic-web-researcher.git
cd deterministic-web-researcher

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test
```

---

## Usage #1: Direct API (Node.js)

### Basic Research Query

```typescript
import {
  DeterministicWebResearcher,
  ResearchQuery,
  RawSource,
} from './dist/deterministic-web-researcher.js';

// 1. Create researcher instance
const researcher = new DeterministicWebResearcher({
  maxSourcesPerQuery: 100,
  minRelevanceThreshold: 0.6,
  dedupSimilarityThreshold: 0.85,
  allowedDomains: ['arxiv.org', 'pubmed.ncbi.nlm.nih.gov', 'github.com'],
  apiTimeoutMs: 5000,
});

// 2. Define research query
const query: ResearchQuery = {
  id: 'melanoma_pten_study_2024',
  timestamp: Date.now(),
  topic: 'PTEN loss melanoma immunotherapy T cell resistance',
  intent: 'literature_scan',
  scope: {
    domains: ['arxiv.org', 'pubmed.ncbi.nlm.nih.gov'],
    maxResults: 50,
  },
  constraints: {
    minRelevanceScore: 0.7,
    requireOpenAccess: false,
  },
};

// 3. Register query
researcher.registerQuery(query);

// 4. Ingest sources (from web fetch, API calls, etc.)
const sources: RawSource[] = [
  {
    id: 'arxiv_2301_12345',
    title: 'PTEN loss enhances T cell infiltration in melanoma',
    url: 'https://arxiv.org/abs/2301.12345',
    domain: 'arxiv.org',
    contentPreview: 'We demonstrate that PTEN loss in melanoma cell lines...',
    metadata: {
      publishedAt: new Date('2023-01-15').getTime(),
      authors: ['Smith, J.', 'Doe, A.', 'Johnson, B.'],
      accessibilityStatus: 'open',
    },
    fetchedAt: Date.now(),
  },
  // ... more sources
];

for (const source of sources) {
  researcher.ingestRawSource(source);
}

// 5. Execute research pipeline
const result = await researcher.executeResearch(query.id);

// 6. Inspect results
console.log('Verified Sources:', result.verifiedSourceCount);
console.log('Score Distribution:', result.auditSummary.scoreDistribution);

// 7. Top-ranked source
if (result.sources.length > 0) {
  const top = result.sources[0];
  console.log(`
    Title: ${top.title}
    Relevance: ${(top.relevanceScore * 100).toFixed(1)}%
    Confidence: ${top.confidenceLevel}
    Domain: ${top.domain}
    Authors: ${top.metadata.authors?.join(', ')}
  `);
}

// 8. Audit trail
console.log('Execution Log Entries:', result.executionLog.length);
result.executionLog.forEach(entry => {
  console.log(
    `[${entry.stage}] ${entry.action} (code: ${entry.resultCode})`
  );
});

// 9. Audit summary for compliance
console.log('Query Hash:', result.auditSummary.queryHash);
console.log('Execution Hash:', result.auditSummary.executionHash);
console.log('Dedup Report:', result.auditSummary.dedupReport);
```

---

## Usage #2: MCP Server (Agent Integration)

### Start the MCP Server

```bash
# Terminal 1: Start MCP server
npm run mcp:start

# Terminal 2: Use inspector (Claude Desktop testing)
npm run mcp:inspect
```

### Call via Claude Desktop

Configure Claude Desktop (`~/.config/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "web-researcher": {
      "command": "node",
      "args": ["/path/to/deterministic-web-researcher/dist/researcher-recourse-integration.js"],
      "env": {
        "MAX_SOURCES": "100",
        "MIN_RELEVANCE": "0.6",
        "DEDUP_THRESHOLD": "0.85"
      }
    }
  }
}
```

### Call via Claude Code / Cursor

```typescript
// In Claude Code or Cursor, reference the MCP server
// The researcher tools will be available for agent use

// Example agent loop:
// 1. Agent formulates research query
// 2. Agent calls execute_research_query via MCP
// 3. Agent receives VerifiedSource[] ranked by relevance
// 4. Agent passes to downstream evidence compiler
```

---

## Usage #3: Recourse Integration (Self-Hosting)

### Register Template Plugin

```typescript
import { registerRecourseTemplate } from './dist/deterministic-web-researcher.js';

// In your Recourse template plugin registry:
const descriptor = registerRecourseTemplate();

// Recourse discovers:
// - name: 'DeterministicWebResearcher'
// - selfHost.methods: ['executeResearchQuery', 'bindToEvidenceClaims']
// - verifier contract with input/output schemas and test suite

// Once promoted:
// - Tool available at /api/recourse/selfhosted/deterministic_web_researcher_v1/execute
// - Self-hosted execution in Recourse sandbox
// - Test suite re-run at every startup for verification
```

---

## Usage #4: Evidence Compiler Integration

### Bind Research Results to Diagnostic Claims

```typescript
import { EvidenceCompilerAdapter } from './dist/deterministic-web-researcher.js';

// After research completes, bind to diagnostic claims
const diagnosticClaims = [
  {
    id: 'claim_001',
    text: 'PTEN loss in melanoma enhances T cell infiltration',
  },
  {
    id: 'claim_002',
    text: 'Checkpoint inhibitor resistance correlates with altered metabolism',
  },
];

const evidenceBindings = EvidenceCompilerAdapter.bindToClaims(
  researchResult,
  diagnosticClaims
);

// Each binding links a source to a claim with confidence level:
// {
//   sourceId: 'arxiv_2301_12345',
//   claimId: 'claim_001',
//   confidenceLevel: 'high',  // high | medium | low
//   auditHash: 'abc123...',
// }

// Pass to auditor agent for verification:
for (const binding of evidenceBindings) {
  const source = researchResult.sources.find(s => s.id === binding.sourceId);
  const claim = diagnosticClaims.find(c => c.id === binding.claimId);
  
  console.log(`
    Binding: ${claim.text}
    ← Source: ${source.title}
    Confidence: ${binding.confidenceLevel}
    Audit: ${binding.auditHash}
  `);
}
```

---

## Usage #5: Audit Trail Verification

### Verify Reproducibility

```typescript
import Crypto from 'crypto';

// After two independent research runs:
const result1 = await researcher1.executeResearch(query.id);
const result2 = await researcher2.executeResearch(query.id);

// Check determinism
if (result1.auditSummary.executionHash === result2.auditSummary.executionHash) {
  console.log('✓ Execution is reproducible (hashes match)');
} else {
  console.log('✗ Execution diverged (hashes differ)');
  console.log('Result 1 hash:', result1.auditSummary.executionHash);
  console.log('Result 2 hash:', result2.auditSummary.executionHash);
}

// Verify audit trail integrity
const logHash = Crypto.createHash('sha256')
  .update(
    result1.executionLog
      .map(e => `${e.timestamp}|${e.stage}|${e.action}`)
      .join('\n')
  )
  .digest('hex');

if (logHash === result1.auditSummary.executionHash) {
  console.log('✓ Audit trail matches execution hash');
} else {
  console.log('✗ Audit trail tampering detected');
}

// Inspect log for anomalies
const errors = result1.executionLog.filter(e => e.resultCode > 0);
if (errors.length > 0) {
  console.log(`⚠ ${errors.length} errors logged:`);
  errors.forEach(e => console.log(`  - ${e.action}`));
}
```

---

## Usage #6: Streaming Integration (Large Result Sets)

### Process Results Incrementally

```typescript
// For large source sets, process as results arrive
async function* streamResearchResults(
  query: ResearchQuery,
  sourceStream: AsyncIterable<RawSource>
) {
  const researcher = new DeterministicWebResearcher(config);
  researcher.registerQuery(query);

  for await (const source of sourceStream) {
    researcher.ingestRawSource(source);
  }

  const result = await researcher.executeResearch(query.id);

  // Yield results in order of relevance
  for (const verifiedSource of result.sources) {
    yield {
      source: verifiedSource,
      relevance: verifiedSource.relevanceScore,
      confidence: verifiedSource.confidenceLevel,
    };
  }
}

// Usage
for await (const item of streamResearchResults(query, sourceStream)) {
  console.log(`${item.relevance.toFixed(2)} | ${item.source.title}`);
}
```

---

## Configuration Examples

### Cancer Research (High Relevance Threshold)

```typescript
const cancerConfig = {
  maxSourcesPerQuery: 200,
  minRelevanceThreshold: 0.75, // Stricter for medical claims
  dedupSimilarityThreshold: 0.9, // More aggressive dedup
  allowedDomains: [
    'arxiv.org',
    'pubmed.ncbi.nlm.nih.gov',
    'clinicaltrials.gov',
    'nature.com',
    'science.org',
  ],
  apiTimeoutMs: 10000, // More time for large PDFs
};
```

### GitHub Repository Analysis (Lower Threshold)

```typescript
const gitHubConfig = {
  maxSourcesPerQuery: 500,
  minRelevanceThreshold: 0.5, // Broader for code discovery
  dedupSimilarityThreshold: 0.8, // Looser matching
  allowedDomains: ['github.com', 'arxiv.org'],
  apiTimeoutMs: 3000,
};
```

### FinTech Compliance (Maximum Audit Trail)

```typescript
const finTechConfig = {
  maxSourcesPerQuery: 100,
  minRelevanceThreshold: 0.8, // Very strict
  dedupSimilarityThreshold: 0.95, // Exact matching
  allowedDomains: [
    'sec.gov',
    'finra.org',
    'occ.gov', // Regulatory sources only
  ],
  apiTimeoutMs: 15000, // Regulatory sources can be slow
};
```

---

## Error Handling

### Common Issues

**Q: Result count is lower than expected**
- Check `minRelevanceThreshold` in config
- Check `constraints.minRelevanceScore` in query
- Inspect `result.auditSummary.scoreDistribution`

**Q: Same query produces different results**
- Likely: sources ingested in different order (check dedup logic)
- Verify: `result.auditSummary.executionHash` should match
- Check: are timestamps being used in scoring? (they shouldn't be)

**Q: Dedup groups seem off**
- Increase `dedupSimilarityThreshold` to be stricter
- Inspect `result.auditSummary.dedupReport`
- Check: are sources have identical metadata (DOI, authors)?

**Q: MCP server won't start**
- Ensure Node.js >= 18
- Check environment variables: `MAX_SOURCES`, `MIN_RELEVANCE`, etc.
- Verify: `npm run build` succeeded

---

## Performance Tuning

### Reduce Execution Time

```typescript
// For time-sensitive queries:
const config = {
  maxSourcesPerQuery: 50, // Reduce from 100
  dedupSimilarityThreshold: 0.95, // Skip semantic matching
  apiTimeoutMs: 2000, // Fail fast
};

// Expected: ~100-200ms for 50 sources
```

### Improve Accuracy

```typescript
// For compliance-critical queries:
const config = {
  maxSourcesPerQuery: 500, // Process more sources
  dedupSimilarityThreshold: 0.8, // Catch subtle duplicates
  apiTimeoutMs: 30000, // Wait for slow sources
};

// Expected: ~5-10s for 500 sources
```

---

## Testing Your Integration

```bash
# Unit tests
npm test

# Coverage report
npm test:cov

# Integration tests (MCP server, Recourse)
npm test:integration

# Linting
npm run lint

# Type checking
npm run type-check
```

---

## Next Steps

1. **Integrate with your diagnostic pipeline:**
   - Add researcher calls to Strategist agent
   - Pass results to Evidence Compiler
   - Configure Auditor agent to verify audit trails

2. **Deploy MCP server:**
   - Configure Claude Desktop or your agent host
   - Test with real queries
   - Monitor audit trail for compliance

3. **Optimize configuration:**
   - Tune thresholds for your domain
   - Profile performance
   - Adjust domain whitelist

4. **Extend functionality:**
   - Add custom domain reputation scoring
   - Integrate with knowledge graph (python/kg_service)
   - Add PDF extraction (python/pdf_service)

---

## Support & Issues

- **Documentation:** See [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Tests:** `npm test` to verify your setup
- **Inspector:** `npm run mcp:inspect` for MCP debugging
- **Issues:** https://github.com/ncsound919/deterministic-web-researcher/issues
