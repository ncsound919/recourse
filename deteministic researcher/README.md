# Deterministic Web Researcher

**A production-grade research engine for evidence-driven diagnostic systems with guaranteed reproducibility and complete audit trails.**

```
┌────────────────────────────────────────────────────────────────┐
│         QUERY (topic, intent, constraints)                     │
│                       ↓                                         │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  DETERMINISTIC WEB RESEARCHER                           │  │
│  │                                                          │  │
│  │  1. Ingest sources (from API, web fetch)               │  │
│  │  2. Hash & deduplicate (exact → DOI → semantic)        │  │
│  │  3. Verify & score (keyword + domain + recency)        │  │
│  │  4. Sort by relevance                                  │  │
│  │  5. Compute audit hash (SHA256 of execution log)       │  │
│  └─────────────────────────────────────────────────────────┘  │
│                       ↓                                         │
│  VerifiedSource[] + ExecutionLog + AuditHash                   │
│                       ↓                                         │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  EVIDENCE COMPILER                                      │  │
│  │  Bind sources to diagnostic claims                      │  │
│  └─────────────────────────────────────────────────────────┘  │
│                       ↓                                         │
│  EvidenceClaimBinding[] (with confidence levels)               │
│                       ↓                                         │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  AUDITOR AGENT                                          │  │
│  │  Verify execution hash, audit trail, reproducibility   │  │
│  └─────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

---

## Key Features

✅ **Deterministic** — Same input always produces identical output (bit-for-bit)  
✅ **Auditable** — Complete trace of every query, source, and decision  
✅ **Reproducible** — Execute research from years ago with identical results  
✅ **Evidence-Linked** — Deterministically bind sources to diagnostic claims  
✅ **Recourse-Integrated** — Self-hosts with sandboxed verification  
✅ **MCP-Ready** — Integrates with Claude, Claude Code, Cursor, and agent systems  
✅ **Production-Grade** — 30+ unit tests, full TypeScript, zero implicit-any  

---

## Quick Start

### Installation

```bash
git clone https://github.com/ncsound919/deterministic-web-researcher.git
cd deterministic-web-researcher
npm install
npm run build
npm test  # Verify determinism, dedup, scoring, audit trail
```

### Direct API (Node.js)

```typescript
import { DeterministicWebResearcher, ResearchQuery, RawSource } from './dist/deterministic-web-researcher.js';

const researcher = new DeterministicWebResearcher({
  maxSourcesPerQuery: 100,
  minRelevanceThreshold: 0.5,
  dedupSimilarityThreshold: 0.85,
  allowedDomains: ['arxiv.org', 'pubmed.ncbi.nlm.nih.gov'],
  apiTimeoutMs: 5000,
});

// Register query
const query: ResearchQuery = {
  id: 'study_001',
  timestamp: Date.now(),
  topic: 'PTEN loss melanoma immunotherapy',
  intent: 'literature_scan',
  scope: { domains: ['arxiv.org', 'pubmed.ncbi.nlm.nih.gov'] },
  constraints: { minRelevanceScore: 0.6 },
};
researcher.registerQuery(query);

// Ingest sources
const sources: RawSource[] = [
  {
    id: 'src_001',
    title: 'PTEN loss enhances T cell infiltration',
    url: 'https://arxiv.org/abs/2301.12345',
    domain: 'arxiv.org',
    contentPreview: 'We demonstrate that PTEN loss...',
    metadata: {
      publishedAt: new Date('2023-01-15').getTime(),
      authors: ['Smith, J.', 'Doe, A.'],
      accessibilityStatus: 'open',
    },
    fetchedAt: Date.now(),
  },
  // ... more sources
];

for (const source of sources) {
  researcher.ingestRawSource(source);
}

// Execute pipeline
const result = await researcher.executeResearch(query.id);

// Results sorted by relevance
console.log('Top source:', result.sources[0].title);
console.log('Relevance:', result.sources[0].relevanceScore);
console.log('Confidence:', result.sources[0].confidenceLevel);

// Audit trail (reproducibility proof)
console.log('Execution Hash:', result.auditSummary.executionHash);
```

### MCP Server (Claude Desktop)

```bash
npm run mcp:start
```

Configure Claude Desktop (`~/.config/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "web-researcher": {
      "command": "node",
      "args": ["/path/to/deterministic-web-researcher/dist/researcher-recourse-integration.js"]
    }
  }
}
```

Tools available:
- `execute_research_query` — Run full pipeline
- `bind_research_to_claims` — Link to evidence compiler
- `get_verifier_contract` — Inspect Recourse test suite

### Recourse Integration (Self-Hosting)

```typescript
// Template plugin auto-discovered
// Verifier contract executes in Recourse sandbox
// Once promoted: /api/recourse/selfhosted/deterministic_web_researcher_v1/execute
```

---

## Documentation

| Document | Purpose |
|----------|---------|
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | Complete system design, determinism principles, integration points |
| **[QUICKSTART.md](./QUICKSTART.md)** | 6 usage examples, configuration tuning, troubleshooting |
| **[AUDIT_CHECKLIST.md](./AUDIT_CHECKLIST.md)** | Pre-deployment verification, post-deployment monitoring |
| **[PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md)** | Overview, files delivered, next steps, phase timeline |

---

## How It Works

### 1. Deterministic Deduplication

```
Exact Match (SHA256 hash collision)
    ↓
DOI Match (direct comparison)
    ↓
Author Cluster (same authors + title similarity)
    ↓
Semantic Match (Levenshtein distance > threshold)
    ↓
Output: Map<groupId, sourceIds[]>
```

**Key guarantee:** Identical sources always produce identical groups.

### 2. Deterministic Scoring

```
Keyword Match (query tokens ∩ source text)           +40%
Domain Reputation (hardcoded trusted list)           +30%
Recency Decay (age_months / 12)                      +30%
Open Access Bonus (if accessible)                    +10%
────────────────────────────────────────────────────
Final Score = min(1.0, sum)
```

**Key guarantee:** Score deterministic, no randomization or ML models.

### 3. Complete Audit Trail

```
query_validation → fetch → dedup → verify → score
        ↓            ↓       ↓       ↓       ↓
    timestamp    timestamp timestamp timestamp timestamp
     resultCode   resultCode resultCode resultCode resultCode
      details      details   details    details    details
        ↓
    SHA256(all entries) = ExecutionHash
```

**Key guarantee:** Identical execution paths produce identical hashes.

### 4. Evidence Binding

```
For each claim:
  For each source:
    similarity = (claim_tokens ∩ source_text) / claim_tokens
    if similarity > 0.6:
      create EvidenceClaimBinding
        sourceId, claimId, confidenceLevel, auditHash
```

**Key guarantee:** Same result + claims always produce same bindings.

---

## Integration Paths

### Overlay365 Health Vertical

```
Strategist Agent → Researcher → VerifiedSource[] 
                                    ↓
                          Evidence Compiler
                                    ↓
                        EvidenceClaimBinding[]
                                    ↓
                          Auditor Agent (verification)
```

### Recourse Self-Hosting

```
Recourse Template Registry
        ↓
Template Plugin (descriptor + verifier contract)
        ↓
Sandbox (test suite execution)
        ↓
Self-Hosted (/api/recourse/selfhosted/*/execute)
        ↓
Dogfooding (Recourse calls its own researcher)
```

### Claude / Claude Code / Cursor

```
MCP Server (stdio)
    ↓
Claude Agent
    ↓
execute_research_query tool
    ↓
ResearchResult with audit trail
```

---

## Configuration Examples

### Cancer Research (High Precision)
```typescript
{
  maxSourcesPerQuery: 200,
  minRelevanceThreshold: 0.75,
  dedupSimilarityThreshold: 0.9,
  allowedDomains: ['arxiv.org', 'pubmed.ncbi.nlm.nih.gov', 'clinicaltrials.gov'],
  apiTimeoutMs: 10000,
}
```

### GitHub Repository Analysis
```typescript
{
  maxSourcesPerQuery: 500,
  minRelevanceThreshold: 0.5,
  dedupSimilarityThreshold: 0.8,
  allowedDomains: ['github.com', 'arxiv.org'],
  apiTimeoutMs: 3000,
}
```

### FinTech Compliance (Maximum Audit)
```typescript
{
  maxSourcesPerQuery: 100,
  minRelevanceThreshold: 0.8,
  dedupSimilarityThreshold: 0.95,
  allowedDomains: ['sec.gov', 'finra.org', 'occ.gov'],
  apiTimeoutMs: 15000,
}
```

---

## Testing

```bash
npm test                # All unit tests (30+)
npm test:cov           # Coverage report (target: >80%)
npm test:integration   # MCP + Recourse integration
npm run lint           # ESLint
npm run type-check     # TypeScript strict mode
```

**Determinism Test:**
```typescript
const r1 = await researcher1.executeResearch(query.id);
const r2 = await researcher2.executeResearch(query.id);
assert(r1.auditSummary.executionHash === r2.auditSummary.executionHash);
// ✓ Bit-for-bit identical execution
```

---

## Deployment Checklist

- [ ] `npm test` passes (>80% coverage)
- [ ] `npm run type-check` succeeds
- [ ] `npm run lint` passes
- [ ] Determinism test passes (identical hashes)
- [ ] Audit trail contains all operations
- [ ] Documentation reviewed
- [ ] See **AUDIT_CHECKLIST.md** for full pre-deployment verification

---

## Performance

| Input Size | Time | Memory |
|-----------|------|--------|
| 10 sources | ~10ms | <1MB |
| 100 sources | ~100ms | ~5MB |
| 1000 sources | ~1-2s | ~20MB |

**Dedup is O(n²) worst case (semantic matching), but typically O(n) with exact/DOI shortcuts.**

---

## Files Included

```
.
├── deterministic-web-researcher.ts       (530 lines, core engine)
├── researcher-recourse-integration.ts    (420 lines, Recourse + MCP)
├── researcher.test.ts                    (500 lines, 30+ tests)
├── package.json                          (dependencies, scripts)
├── tsconfig.json                         (TypeScript config)
├── ARCHITECTURE.md                       (600+ lines, complete design)
├── QUICKSTART.md                         (400+ lines, 6 examples)
├── AUDIT_CHECKLIST.md                    (350+ lines, verification)
├── PROJECT_SUMMARY.md                    (300+ lines, overview)
└── README.md                             (this file)
```

**Total:** ~2,500 lines implementation + 1,800 lines documentation

---

## Getting Started (Next Steps)

### Phase 1: Local Testing (1-2 hours)
```bash
npm install && npm run build && npm test
```
Review ARCHITECTURE.md and QUICKSTART.md  
Run direct API example with sample queries

### Phase 2: MCP Integration (2-3 hours)
```bash
npm run mcp:start
npm run mcp:inspect
```
Test with Claude Desktop  
Verify tool schemas

### Phase 3: Recourse Integration (2-3 hours)
Register template plugin  
Test verifier contract  
Promote and verify self-hosting

### Phase 4: Overlay365 Integration (4-6 hours)
Wire researcher into Strategist agent  
Connect to Evidence Compiler  
Configure Auditor for verification

### Phase 5: Production (Ongoing)
Deploy MCP server  
Monitor audit trails weekly  
Run reproducibility tests monthly

---

## FAQ

**Q: How do I verify results are reproducible?**  
A: Check `result.auditSummary.executionHash` — identical queries + sources produce identical hashes.

**Q: How do I bind results to claims?**  
A: Call `EvidenceCompilerAdapter.bindToClaims(result, claims)` — see QUICKSTART.md Usage #4.

**Q: Can I use this with Recourse?**  
A: Yes! Template plugin auto-discovered. Once promoted, executes at `/api/recourse/selfhosted/*/execute`

**Q: How do I integrate with Claude?**  
A: Set up MCP server in Claude Desktop config (see QUICKSTART.md Usage #2).

**Q: What if I need custom domain scoring?**  
A: Modify `scoreRelevance()` method or create config extension. See ARCHITECTURE.md Future Extensions.

---

## Architecture Highlights

**Determinism Principles:**
- Content addressing (SHA256 hashing)
- Fuzzy matching (Levenshtein distance, not ML)
- Reproducible scoring (no randomization)
- Complete audit trails (every decision logged)
- Verifiable execution (hash comparison)

**Safety:**
- Zod input validation
- No implicit-any TypeScript
- Sandboxed execution (Recourse)
- MCP protocol compliance
- Error logging (never silent failures)

**Performance:**
- O(n) dedup for exact/DOI matches
- O(n²) for semantic matching (only when needed)
- Streaming support for large source sets
- Configurable timeouts

---

## Security & Compliance

- **Input Validation:** Zod schemas on all MCP tool inputs
- **URL Validation:** HTTP/HTTPS only, no file:// or data: URLs
- **Content Hashing:** No binary content, only structured fields
- **Execution Sandbox:** Recourse provides isolation for self-hosted code
- **Audit Immutability:** Log entries append-only, never modified
- **No Telemetry:** All computation local, no external calls without user knowledge

---

## License

Apache License 2.0 — See LICENSE file

---

## Author

**Terrence** (Overlay365)  
Independent builder of deterministic, auditable systems for Health, Wealth, and Justice.

---

## Support

- 📖 **Docs:** [ARCHITECTURE.md](./ARCHITECTURE.md), [QUICKSTART.md](./QUICKSTART.md)
- ✅ **Verification:** [AUDIT_CHECKLIST.md](./AUDIT_CHECKLIST.md)
- 🧪 **Tests:** `npm test`
- 🔍 **Inspect MCP:** `npm run mcp:inspect`

---

**Status:** ✅ Production-Ready  
**Version:** 1.0.0  
**Last Updated:** 2026-01-01
