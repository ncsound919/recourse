# Deterministic Web Researcher - Architecture

**Version:** 1.0.0  
**Author:** Terrence (Overlay365)  
**Last Updated:** 2026-01-01

## Executive Summary

The **Deterministic Web Researcher** is a production-grade research engine designed to feed clean, auditable evidence into Overlay365's diagnostic pipelines and scientific tools. It achieves determinism through:

- **Content-addressed deduplication** (SHA256 hashing + fuzzy matching)
- **Reproducible relevance scoring** (keyword match + domain reputation + recency decay)
- **Complete audit trails** (every query, fetch, decision logged with timestamp and result code)
- **Sandboxed verification** (Recourse integration for reproducible testing)
- **Evidence binding** (deterministic claim-source linking for compilers)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                 OVERLAY365 DIAGNOSTIC PIPELINES                  │
│              (Health / Wealth / Justice Verticals)               │
│                                                                   │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────┐ │
│  │  Strategist     │  │   Evidence       │  │   Auditor       │ │
│  │  Agent          │  │   Compiler       │  │   Agent         │ │
│  └────────┬────────┘  └────────┬─────────┘  └────────┬────────┘ │
│           │                    │                      │          │
└───────────┼────────────────────┼──────────────────────┼──────────┘
            │                    │                      │
       EVIDENCE BINDINGS (deterministic claim-source links)
            │                    │                      │
┌───────────┴────────────────────┴──────────────────────┴──────────┐
│                 DETERMINISTIC WEB RESEARCHER                      │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ QUERY REGISTRATION                                         │ │
│  │ - topic: "PTEN loss melanoma immunotherapy"                │ │
│  │ - intent: literature_scan | fact_check | trend_detection   │ │
│  │ - scope: domains, date range, max results                  │ │
│  │ - constraints: min relevance, require open access, etc.    │ │
│  └────────────────────────────────────────────────────────────┘ │
│                            ↓                                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ SOURCE INGESTION & HASHING                                 │ │
│  │ - fetch from arxiv, pubmed, github, clinicaltrials.gov     │ │
│  │ - compute content hash for each source                     │ │
│  │ - store in hash index for exact-match dedup                │ │
│  │ - audit: domain, DOI, authors, accessibility              │ │
│  └────────────────────────────────────────────────────────────┘ │
│                            ↓                                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ DEDUPLICATION (Deterministic)                              │ │
│  │ 1. Exact match: hash collision → group together            │ │
│  │ 2. DOI match: same DOI → group together                    │ │
│  │ 3. Author cluster: same authors + similar title            │ │
│  │ 4. Semantic: Levenshtein distance > threshold              │ │
│  │ → output: groupId → [sourceId, sourceId, ...]             │ │
│  │ → dedup_report: {groupsFormed, duplicatesRemoved, ...}    │ │
│  └────────────────────────────────────────────────────────────┘ │
│                            ↓                                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ VERIFICATION & RELEVANCE SCORING (Deterministic)           │ │
│  │                                                             │ │
│  │ For each representative source:                            │ │
│  │   - keyword match: query_tokens ∩ source_text             │ │
│  │   - domain reputation: bonus for arxiv, pubmed, etc.      │ │
│  │   - recency decay: age_months / 12 → score * (1 - decay)  │ │
│  │   - open access bonus: +0.1 if open                       │ │
│  │   - final score = min(1, keyword + domain + recency + oa) │ │
│  │                                                             │ │
│  │ Confidence level based on relevance + data quality:        │ │
│  │   - high:   combined_score >= 0.8                         │ │
│  │   - medium: combined_score >= 0.5 && < 0.8                │ │
│  │   - low:    combined_score < 0.5                          │ │
│  │                                                             │ │
│  │ → output: VerifiedSource[] with relevanceScore + audit     │ │
│  └────────────────────────────────────────────────────────────┘ │
│                            ↓                                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ AUDIT SUMMARY & REPRODUCIBILITY                            │ │
│  │ - queryHash: SHA256(query JSON)                            │ │
│  │ - executionHash: SHA256(execution log entries)             │ │
│  │ - execution log: each action → (timestamp, stage, result)  │ │
│  │ - score distribution: count high/medium/low                │ │
│  │ → enables perfect reproducibility and verification         │ │
│  └────────────────────────────────────────────────────────────┘ │
│                            ↓                                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ EVIDENCE BINDING                                            │ │
│  │ Deterministic claim-source linking:                        │ │
│  │   - for each claim: "PTEN loss enhances T cells"          │ │
│  │   - for each source: compute claim-source similarity       │ │
│  │   - if similarity > 0.6: create binding                   │ │
│  │   - binding includes: sourceId, claimId, confidence        │ │
│  │   - auditHash enables compiler verification                │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. DeterministicWebResearcher (TypeScript Class)

**Responsibilities:**
- Query registration and validation
- Source ingestion with content hashing
- Deterministic deduplication
- Reproducible relevance scoring
- Full audit trail logging
- Execution hash computation for verification

**Key Methods:**

```typescript
class DeterministicWebResearcher {
  // Registration
  registerQuery(query: ResearchQuery): void
  
  // Ingestion
  ingestRawSource(source: RawSource): void
  
  // Deduplication
  deduplicateSources(): Map<string, string[]>
  
  // Verification & Scoring
  verifySources(queryId: string, sourceIds: string[]): VerifiedSource[]
  
  // Execution
  executeResearch(queryId: string): Promise<ResearchResult>
  
  // Auditing
  getExecutionLog(): ExecutionLogEntry[]
}
```

**Determinism Guarantees:**
- Same query + sources → identical dedup groups
- Same sources → identical relevance scores
- Same execution path → identical audit hash
- No randomization or non-deterministic data structures

---

### 2. EvidenceCompilerAdapter

**Responsibilities:**
- Bridge between researcher output and evidence compiler claims
- Deterministic claim-source similarity matching
- Binding generation with confidence levels

```typescript
class EvidenceCompilerAdapter {
  static bindToClaims(
    researchResult: ResearchResult,
    claims: Array<{ id: string; text: string }>
  ): EvidenceClaimBinding[]
}
```

---

### 3. ResearcherTemplatePlugin (Recourse Integration)

**Responsibilities:**
- Recourse template descriptor generation
- Verifier contract definition (input/output/test schemas)
- Self-hosted execution in Recourse sandbox
- Registry promotion workflow

**Key Features:**
- Test suite executes in isolated Recourse sandbox
- Every promoted version carries its test suite
- Self-hosting in Recourse enables dogfooding
- Deterministic execution means cached results are reproducible

---

### 4. ResearcherMCPServer

**Responsibilities:**
- MCP protocol server for agent coordination
- Tool registration for Claude, Claude Code, Cursor, etc.
- Input validation via Zod schemas
- Structured response formatting

**Tools:**
- `execute_research_query`: Run full pipeline
- `bind_research_to_claims`: Link to evidence compiler
- `get_verifier_contract`: Expose Recourse test suite

---

## Data Flow

### Query Registration → Execution → Audit Trail

```
1. Client registers ResearchQuery
   ↓
2. Researcher validates constraints
   ↓
3. Client ingests RawSource[] (from web fetch, APIs, etc.)
   ↓
4. Each source is content-hashed and stored
   ↓
5. Deduplication phase:
   - Exact matches (hash collision) grouped first
   - DOI matches grouped next
   - Semantic matches (Levenshtein > threshold) grouped last
   - Output: Map<groupId, sourceIds[]>
   ↓
6. Representative selection:
   - Take first source from each group (deterministic)
   ↓
7. Verification phase:
   - For each representative, score relevance (0-1)
   - Compute confidence level (high/medium/low)
   - Filter by minRelevanceScore constraint
   ↓
8. Sorting:
   - Sort verified sources by relevance descending
   ↓
9. Audit summary:
   - Compute queryHash
   - Compute executionHash from log
   - Generate scoreDistribution
   ↓
10. Return ResearchResult with:
    - VerifiedSource[] (sorted by relevance)
    - ExecutionLogEntry[] (full trace)
    - AuditSummary (queryHash, executionHash, stats)
```

---

## Determinism Principles

### 1. Content Addressing
- Every source hashed by: title + URL + DOI + authors (normalized)
- Identical content → identical hash (no timestamps in hash)
- Enables exact-match dedup across independent runs

### 2. Fuzzy Matching
- Levenshtein distance computed consistently
- String similarity = 1 - (distance / maxLen)
- Threshold (0.85 default) applied uniformly
- No probabilistic matching or ML models

### 3. Scoring
- Keyword match: deterministic token overlap
- Domain reputation: hardcoded trusted domain list
- Recency decay: age_months / 12 (linear, no randomization)
- Open access: boolean flag
- Final score: min(1.0, sum of components)

### 4. Audit Trail
- Every operation logged: (timestamp, stage, action, resultCode, details)
- Stage order: query_validation → fetch → dedup → verify → score
- Execution hash computed from log: ensures tampering detection
- Timestamps recorded but not used in deterministic functions

### 5. Result Ordering
- Sorted by relevance score descending (deterministic)
- Tied scores: maintain ingestion order (deterministic)

---

## Integration Points

### Recourse

**Template Plugin Registration:**
```typescript
registerComponentTemplatePlugin({
  name: 'DeterministicWebResearcher',
  templates: [{
    name: 'deterministic_web_researcher_v1',
    description: 'Research pipeline with full audit trail',
    selfHost: {
      module: 'deterministic-web-researcher.mjs',
      methods: ['executeResearchQuery', 'bindToEvidenceClaims']
    }
  }]
});
```

**Verifier Contract:**
- Input: query (topic, intent, scope, constraints) + sources
- Output: ResearchResult (VerifiedSource[], AuditSummary, ExecutionLog)
- Test: sandbox runs provided test code against actual implementation
- Promotion: only after test passes, version stored with its suite

**Self-Hosting:**
- Once promoted, tool executes in Recourse's `/api/recourse/selfhosted/<name>/execute`
- Every startup: re-verify with stored test suite
- Enables dogfooding: Recourse can call its own researcher

### Overlay365 Diagnostic Agents

**Strategist Agent:**
- Calls researcher to gather evidence for Health/Wealth/Justice domains
- Uses ResearchQuery to specify domain-specific constraints
- Receives VerifiedSource[] ranked by relevance
- Feeds high-confidence sources to evidence compiler

**Evidence Compiler:**
- Receives ResearchResult + set of diagnostic claims
- Calls EvidenceCompilerAdapter.bindToClaims()
- Gets EvidenceClaimBinding[] with confidence levels
- Uses bindings to weight claim evidence

**Auditor Agent:**
- Inspects ExecutionLog for anomalies
- Validates queryHash and executionHash
- Cross-references audit trail with original sources
- Reports findings back to diagnostic pipeline

### MCP (Model Context Protocol)

**Claude / Claude Code / Cursor:**
- Connect to ResearcherMCPServer via stdio or HTTP
- Call `execute_research_query` with natural language converted to schema
- Receive structured ResearchResult for downstream processing
- Use for automated evidence gathering in agent loops

---

## Reliability & Error Handling

### Validation
- Zod schemas on all MCP tool inputs
- Query constraints checked at registration time
- Source metadata validated before ingestion

### Timeouts
- API calls timeout after configurable duration (default 5s)
- No retry loops; failures logged as result codes

### Degrad ation
- If source has no metadata: confidence lowered but not excluded
- If DOI invalid: continues with other matching strategies
- If relevance < threshold: filtered but logged

### Audit Trail
- Every error logged with result code > 0
- Execution log survives errors; pipeline continues where possible

---

## Performance Characteristics

| Operation | Complexity | Time (1000 sources) |
|-----------|-----------|-------------------|
| Ingest sources | O(n) hash | ~10ms |
| Dedup exact match | O(n) | ~5ms |
| Dedup semantic | O(n²) Levenshtein | ~500ms |
| Score relevance | O(n) | ~50ms |
| Full pipeline | O(n²) worst | ~600ms |

**Optimization:** Semantic matching only if exact/DOI failed. Threshold tuning trades recall for speed.

---

## Configuration

```typescript
interface ResearcherConfig {
  maxSourcesPerQuery: number;        // 100 (hard limit)
  minRelevanceThreshold: number;     // 0.5 (0-1)
  dedupSimilarityThreshold: number;  // 0.85 (0-1, higher = stricter)
  allowedDomains: string[];          // e.g., ['arxiv.org', 'pubmed.ncbi.nlm.nih.gov']
  apiTimeoutMs: number;              // 5000ms
}
```

---

## Testing Strategy

### Unit Tests
- **Determinism:** Identical input → identical output (exact hash match)
- **Dedup:** Exact/DOI/semantic match detection
- **Scoring:** Relevance scores deterministic and in range [0,1]
- **Audit:** Log entries complete and structured
- **Reproducibility:** Execution hash matches across runs

### Integration Tests
- **MCP Server:** Tool registration and response formatting
- **Recourse Integration:** Template plugin discovery and registration
- **Evidence Binding:** Claim-source matching with confidence

### Sandbox Tests
- Verifier contract test code runs in isolated Recourse VM
- Validates core functions in sandbox environment
- Ensures self-hosted module meets contract

---

## Audit Trail Example

```json
{
  "queryId": "test_query_001",
  "rawSourceCount": 3,
  "dedupedGroupCount": 2,
  "verifiedSourceCount": 2,
  "sources": [
    {
      "id": "src_001",
      "title": "PTEN loss in melanoma enhances T cell infiltration",
      "relevanceScore": 0.92,
      "confidenceLevel": "high",
      "auditHash": "abc123...",
      "dataQuality": {...}
    }
  ],
  "executionLog": [
    {
      "timestamp": 1704067200500,
      "stage": "query_validation",
      "action": "Query registered: PTEN loss melanoma immunotherapy",
      "resultCode": 0
    },
    {
      "timestamp": 1704067200510,
      "stage": "fetch",
      "action": "Source ingested: PTEN loss in melanoma enhances...",
      "resultCode": 0,
      "details": {"domain": "arxiv.org"}
    },
    ...
  ],
  "auditSummary": {
    "queryHash": "def456...",
    "executionHash": "ghi789...",
    "startedAt": 1704067200000,
    "completedAt": 1704067200600,
    "dedupReport": {
      "groupsFormed": 2,
      "duplicatesRemoved": 1,
      "mergeStrategy": "first_in_group_retained"
    },
    "scoreDistribution": {
      "high": 2,
      "medium": 0,
      "low": 0
    }
  }
}
```

---

## Security Considerations

- **Input validation:** Zod schemas on all external inputs
- **URL validation:** Only HTTP/HTTPS, no file:// or data: URLs
- **Content hashing:** No binary content, only structured fields
- **Execution sandbox:** Recourse provides isolation for self-hosted code
- **Audit immutability:** Log entries append-only, never modified

---

## Future Extensions

1. **PDF extraction:** integrate python/pdf_service for full-text analysis
2. **Knowledge graph:** integrate python/kg_service for ontology matching
3. **Citation scoring:** fetch citation counts from Semantic Scholar API
4. **LLM-assisted dedup:** optional ML-based matching above threshold
5. **Caching:** deterministic cache key = SHA256(query + sources)
6. **Export formats:** RDF/JSON-LD, BibTeX, CSL-JSON
