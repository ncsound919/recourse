# Deterministic Web Researcher - Audit Checklist

**Purpose:** Verify that all determinism, auditability, and integration requirements are met before production deployment.

**Intended Audience:** Terrence (solo builder), Auditor Agent, Integration Teams

---

## Pre-Deployment Verification

### ✅ Code Quality & Type Safety

- [ ] `npm run build` succeeds with zero errors
- [ ] `npm run type-check` produces no warnings
- [ ] `npm run lint` passes all ESLint checks
- [ ] All TypeScript strict mode flags enabled in tsconfig.json
- [ ] No `any` types used (verify with `grep -r ': any' src/`)
- [ ] All public APIs documented with JSDoc comments
- [ ] No console.log statements in production code (only in tests)

### ✅ Determinism Verification

- [ ] **Hash computation:** `computeSourceHash()` includes only: title, URL, DOI, authors (no timestamps)
- [ ] **Dedup logic:** Uses exact hash match first, then DOI, then Levenshtein distance
- [ ] **Levenshtein distance:** Implementation verified against reference (e.g., `difflib`)
- [ ] **Relevance scoring:** No randomization, all calculations deterministic
  - [ ] Keyword match = token overlap (fixed order)
  - [ ] Domain reputation = hardcoded list lookup
  - [ ] Recency decay = age_months / 12 (linear formula)
  - [ ] Open access = boolean flag
- [ ] **Result ordering:** Sorted by relevance descending; ties maintain ingestion order
- [ ] **No Date.now() in deterministic functions:** Only in logging and timestamps
- [ ] **No floating-point precision issues:** All scores clamped to [0, 1]

### ✅ Audit Trail Completeness

- [ ] Every operation logged with (timestamp, stage, action, resultCode, details)
- [ ] Log order preserved: query_validation → fetch → dedup → verify → score
- [ ] No log entries removed or reordered after execution
- [ ] Error codes non-zero for failures, zero for success
- [ ] Execution log exported in `getExecutionLog()`
- [ ] Execution hash computed from complete log

### ✅ Reproducibility Testing

- [ ] Unit test: "identical inputs → identical dedup groups" ✓
- [ ] Unit test: "identical inputs → identical relevance scores" ✓
- [ ] Unit test: "identical execution → identical audit hash" ✓
- [ ] Integration test: Running pipeline twice with same sources produces same output
- [ ] All tests in `researcher.test.ts` pass with `npm test`
- [ ] Test coverage > 80% (run `npm test:cov`)

### ✅ Recourse Integration

- [ ] Template plugin descriptor defined (name, id, selfHost.methods)
- [ ] Verifier contract specifies input/output schemas
- [ ] Verifier test suite runs in sandbox without external dependencies
- [ ] Test suite includes dedup, scoring, and audit trail checks
- [ ] Self-hosting methods exposed: `executeResearchQuery`, `bindToEvidenceClaims`
- [ ] Recourse integration compiles: `npm run build` includes `researcher-recourse-integration.js`
- [ ] Plugin registration code tested (if available in Recourse test environment)

### ✅ MCP Server

- [ ] Zod schemas defined for all tool inputs
- [ ] Input validation catches invalid queries/sources
- [ ] Error messages are actionable (not generic)
- [ ] All tools registered in ResearcherMCPServer
- [ ] Response format is valid JSON with proper error handling
- [ ] CLI entry point works: `npm run mcp:start`
- [ ] MCP Inspector discovers all tools: `npm run mcp:inspect`

### ✅ Evidence Binding

- [ ] `EvidenceCompilerAdapter.bindToClaims()` is deterministic
- [ ] Claim-source similarity computed consistently
- [ ] Similarity threshold (0.6 default) applied uniformly
- [ ] Each binding includes: sourceId, claimId, confidenceLevel, auditHash
- [ ] Audit hash of binding computed from: sourceId + claimId + similarity
- [ ] Bindings deterministic: same result + claims → same bindings

### ✅ Configuration & Defaults

- [ ] Default config values reasonable (maxSources: 100, minRelevance: 0.5, etc.)
- [ ] Configuration documented in ARCHITECTURE.md
- [ ] Environment variables documented in package.json scripts
- [ ] All configuration values validated at initialization
- [ ] No hardcoded secrets (API keys, tokens, credentials)

### ✅ Error Handling

- [ ] All network calls have timeouts
- [ ] Invalid input rejected with clear error messages
- [ ] Out-of-range scores clamped to [0, 1]
- [ ] Missing metadata doesn't crash (just lowers confidence)
- [ ] Query not found returns empty array, not error
- [ ] Log entries created even when errors occur

### ✅ Documentation

- [ ] ARCHITECTURE.md explains entire system
- [ ] QUICKSTART.md provides working examples
- [ ] JSDoc comments on all public methods
- [ ] Configuration examples in QUICKSTART.md
- [ ] Audit trail example JSON in ARCHITECTURE.md
- [ ] Future extensions section in ARCHITECTURE.md
- [ ] TypeScript types exported from dist/deterministic-web-researcher.d.ts

### ✅ Performance Baseline

- [ ] Benchmark: 100 sources complete in < 1 second
- [ ] Benchmark: 1000 sources complete in < 10 seconds
- [ ] Memory usage steady (no leaks) with large source sets
- [ ] No quadratic algorithms in hot path (except necessary Levenshtein)

---

## Integration Checklist

### ✅ Overlay365 Integration

- [ ] Researcher accessible from Strategist agent
- [ ] Query format matches diagnostic pipeline needs
- [ ] Results feed correctly into Evidence Compiler
- [ ] Auditor agent can inspect execution logs
- [ ] Audit hashes enable verification workflow

### ✅ Recourse Integration (if applicable)

- [ ] Template plugin discoverable by Recourse
- [ ] Verifier contract executes in sandbox
- [ ] Self-hosted execution functional at `/api/recourse/selfhosted/*/execute`
- [ ] Re-verification on startup passes
- [ ] Dogfooding: Recourse researcher can call itself

### ✅ MCP Server Integration (if applicable)

- [ ] Claude Desktop config matches executable path
- [ ] Environment variables properly set
- [ ] All three tools functional in Claude/Claude Code/Cursor
- [ ] Error responses include useful debugging info

### ✅ Binding & Auditing

- [ ] Evidence bindings feed to diagnostic evidence compiler
- [ ] Auditor agent can validate bindings against sources
- [ ] Audit trail reveals any discrepancies

---

## Security & Compliance Checklist

### ✅ Input Validation

- [ ] Query IDs validated (alphanumeric + underscores)
- [ ] URLs validated (HTTP/HTTPS only, no file://)
- [ ] Domain whitelisting enforced
- [ ] Source IDs validated before processing
- [ ] No path traversal possible (no file operations)

### ✅ Audit Trail Security

- [ ] Audit hashes are cryptographic (SHA256)
- [ ] No personally identifiable information in logs
- [ ] Logs don't contain source content (only metadata)
- [ ] Query text logged but sanitized

### ✅ Reproducibility Guarantee

- [ ] Same query + sources always → same results
- [ ] Results can be reproduced years later
- [ ] Execution hash enables verification
- [ ] Test suite archived with promoted version

### ✅ Compliance

- [ ] No licensing conflicts (Apache 2.0 + dependencies)
- [ ] No telemetry or external calls without user knowledge
- [ ] No data retention (results computed on-demand)

---

## Post-Deployment Monitoring

### ✅ Audit Trail Inspection (Weekly)

- [ ] Sample 10 random research results
- [ ] Verify execution hash matches log
- [ ] Check for anomalies (zero-ranked sources, timeouts)
- [ ] Confirm no log tampering

### ✅ Reproducibility Testing (Monthly)

- [ ] Re-run 5 archived queries from 1 month ago
- [ ] Verify execution hash matches original
- [ ] Document any discrepancies

### ✅ Performance Monitoring (Ongoing)

- [ ] Track average execution time
- [ ] Alert if > 10 seconds for typical query
- [ ] Monitor memory usage
- [ ] Check error rate (should be near zero for valid inputs)

### ✅ Integration Health

- [ ] Strategist agent success rate > 95%
- [ ] Evidence bindings align with claims (spot check)
- [ ] Auditor agent verification passes > 99%

---

## Deployment Sign-Off

### For Solo Builder (Terrence)

- [ ] All checklists above completed and verified
- [ ] Code reviewed for determinism and auditability
- [ ] Test suite passes locally with `npm test`
- [ ] Benchmark meets performance targets
- [ ] Documentation reviewed for completeness
- [ ] Ready for first production run

**Date Approved:** _______________  
**Terrence Signature:** _______________

### For Auditor Agent / Compliance

- [ ] Audit trail format matches specification
- [ ] Execution hash computation verified
- [ ] Bindings deterministic and traceable
- [ ] Reproducibility tested and confirmed
- [ ] No discrepancies found in sample audit

**Date Verified:** _______________  
**Auditor Signature:** _______________

### For Integration Teams (if applicable)

- [ ] MCP server functional in target environment
- [ ] Recourse integration passes sandboxed tests
- [ ] Evidence binding format matches consumer specs
- [ ] Error handling acceptable for pipeline

**Date Integrated:** _______________  
**Integrator Signature:** _______________

---

## Incident Response

If discrepancies detected:

1. **Halt production:** Stop accepting new queries
2. **Inspect audit trail:** Identify divergence point
3. **Run verification:** Compare current vs. previous behavior
4. **Root cause:** Check recent code changes, config updates
5. **Fix & test:** Update code if bug found, re-run full test suite
6. **Revalidate:** Run reproducibility test on historical queries
7. **Resume:** Once verified, resume with increased monitoring

---

## Appendix: Key Verification Tests

### Test A: Determinism

```typescript
// Run twice, compare execution hashes
const r1 = new DeterministicWebResearcher(config);
r1.registerQuery(query);
r1.ingestRawSource(source1);
r1.ingestRawSource(source2);
const result1 = await r1.executeResearch(query.id);

const r2 = new DeterministicWebResearcher(config);
r2.registerQuery(query);
r2.ingestRawSource(source1);
r2.ingestRawSource(source2);
const result2 = await r2.executeResearch(query.id);

assert(result1.auditSummary.executionHash === result2.auditSummary.executionHash);
```

### Test B: Audit Trail Integrity

```typescript
// Verify execution hash matches log
const logHash = Crypto.createHash('sha256')
  .update(
    result.executionLog
      .map(e => `${e.timestamp}|${e.stage}|${e.action}`)
      .join('\n')
  )
  .digest('hex');

assert(logHash === result.auditSummary.executionHash);
```

### Test C: Reproducibility

```typescript
// Archive query + sources, re-run after 1 week
const oldResult = JSON.parse(fs.readFileSync('./archived_result.json'));
const newResult = await researcher.executeResearch(oldResult.queryId);

assert(newResult.auditSummary.executionHash === oldResult.auditSummary.executionHash);
```

### Test D: Binding Consistency

```typescript
// Same result + claims → always same bindings
const bindings1 = EvidenceCompilerAdapter.bindToClaims(result, claims);
const bindings2 = EvidenceCompilerAdapter.bindToClaims(result, claims);

assert(JSON.stringify(bindings1) === JSON.stringify(bindings2));
```

---

**Last Updated:** 2026-01-01  
**Checklist Version:** 1.0.0  
**Contact:** Terrence (Overlay365)
