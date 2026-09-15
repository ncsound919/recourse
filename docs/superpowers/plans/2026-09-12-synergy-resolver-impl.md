# Synergy Plan 4 — Resolver + Admission Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn transfer candidates into **resolved** edges by executing a real test, with an admission gate that only promotes `hypothesis → reproduced` on an admissible proof. AI may draft an adaptation, but only execution sets status.

**Architecture:** Pure `src/lib/synergy/resolver.ts` over the existing sandbox (`verifyCodingCode` in `src/lib/verifiers.ts`). `resolveTransfer` runs the problem's `acceptanceTest` against an adaptation's `sourceCode` and returns a `TransferResult`. `applyTransferResult` updates a `SynergyMap` with `kind:'resolved'` edges and `admit` maps outcome→status. `recordTransferResult` appends a ledger insight. A `/synergy/resolve` route orchestrates, persists, and records.

**Tech Stack:** TypeScript ESM (`.js`), vitest, existing `verifyCodingCode` (isolated-vm sandbox). No new deps.

**Spec:** design §8.9, §9, §10. **Depends on:** Plans 1–3.

---

## File Structure
**Modify:** `src/lib/synergy/types.ts` (add `TransferResult`, `AdmissionProof`, `TransferOutcome`), `src/routes/synergy.ts`, `README.md`
**Create:** `src/lib/synergy/resolver.ts`, `tests/synergy/resolver.test.ts`

**First:** read `src/lib/verifiers.ts` (`VerifierResult`, `verifyCodingCode`) and `src/lib/executionSandbox.ts` to learn the exact result field names before writing `resolver.ts`.

---

### Task 1: Resolver types + core

**Files:** Modify `src/lib/synergy/types.ts`; Create `src/lib/synergy/resolver.ts`; Test `tests/synergy/resolver.test.ts`

- [ ] **Step 1: Types**
Append to `types.ts`:
```ts
export type TransferOutcome = 'passed' | 'failed' | 'error';
export type AdmissionProof = 'executable_test' | 'oracle_metric' | 'formal_proof' | 'human_signoff';

export interface TransferResult {
  candidateId: string;
  outcome: TransferOutcome;
  proofType: AdmissionProof;
  /** sha256 over the deterministic parts of the verifier result (no timing) */
  sandboxReportHash: string;
  durationMs: number;
  adaptedBy: 'none' | 'operator_ladder' | 'model';
  detail: string;
}

export interface AdmissionDecision {
  candidateId: string;
  status: EvidenceStatus; // 'reproduced' | 'refuted' | 'tested'
  admitted: boolean;
  reason: string;
}
```

- [ ] **Step 2: Failing test**
```ts
// tests/synergy/resolver.test.ts
import { describe, it, expect } from 'vitest';
import { resolveTransfer, admit, applyTransferResult } from '../../src/lib/synergy/resolver.js';
import { buildSynergyMap } from '../../src/lib/synergy/synergyMap.js';
import type { TransferCandidate } from '../../src/lib/synergy/types.js';

const acceptanceTest = `const a = Mod.f([1,2,3]); assert a === 6;`;
const passing = `export class Mod { static f(xs) { return xs.reduce(function (s, x) { return s + x; }, 0); } }`;
const failing = `export class Mod { static f() { return 0; } }`;

const candidate: TransferCandidate = {
  id: 'tc_1', methodId: 'm', problemId: 'p', fromDomain: 'mathematics', toDomain: 'logistics',
  bridges: [], score: 0.8, support: 1, prediction: 'pass', falsification: 'f', filters: [], engineVersion: '0.1.0',
};

describe('resolver + admission gate', () => {
  it('resolves a passing adaptation as reproduced via executable_test', () => {
    const r = resolveTransfer(candidate, acceptanceTest, passing);
    expect(r.outcome).toBe('passed');
    expect(r.proofType).toBe('executable_test');
    expect(r.sandboxReportHash).toHaveLength(64);
    const d = admit(r);
    expect(d.admitted).toBe(true);
    expect(d.status).toBe('reproduced');
  });

  it('resolves a failing adaptation as refuted', () => {
    const r = resolveTransfer(candidate, acceptanceTest, failing);
    expect(r.outcome).toBe('failed');
    const d = admit(r);
    expect(d.status).toBe('refuted');
    expect(d.admitted).toBe(false);
  });

  it('applies a result to a map as a resolved edge', () => {
    const map = buildSynergyMap([candidate], { generatedAtRun: 'run:1' });
    const r = resolveTransfer(candidate, acceptanceTest, passing);
    const next = applyTransferResult(map, r);
    const edge = next.edges.find((e) => e.from === 'mathematics' && e.to === 'logistics' && e.kind === 'resolved');
    expect(edge?.passes).toBe(1);
    expect(edge?.attempts).toBe(1);
  });
});
```

- [ ] **Step 3: Failing run** → `npx vitest run tests/synergy/resolver.test.ts`.

- [ ] **Step 4: Implement**
```ts
// src/lib/synergy/resolver.ts
/**
 * Resolver + admission gate. Execution decides; the model never sets status.
 * Only admissible proofs (executable_test / oracle / formal / human) promote.
 */
import { verifyCodingCode } from '../verifiers.js';
import { sha256Hex } from './manifest.js';
import type {
  TransferCandidate, TransferResult, AdmissionDecision, SynergyMap, SynergyEdge,
} from './types.js';

export function resolveTransfer(
  candidate: TransferCandidate,
  acceptanceTest: string,
  sourceCode: string,
  adaptedBy: TransferResult['adaptedBy'] = 'operator_ladder',
): TransferResult {
  const started = Date.now();
  let passed = false;
  let detail = '';
  try {
    const res = verifyCodingCode(sourceCode, acceptanceTest) as { passed?: boolean; score?: number; error?: string; details?: string };
    passed = Boolean(res?.passed);
    detail = res?.error ?? res?.details ?? (passed ? 'suite passed' : 'suite failed');
  } catch (err) {
    return {
      candidateId: candidate.id, outcome: 'error', proofType: 'executable_test',
      sandboxReportHash: sha256Hex(`${candidate.id}|error|${err instanceof Error ? err.message : String(err)}`),
      durationMs: Date.now() - started, adaptedBy, detail: err instanceof Error ? err.message : String(err),
    };
  }
  const outcome = passed ? 'passed' : 'failed';
  return {
    candidateId: candidate.id, outcome, proofType: 'executable_test',
    sandboxReportHash: sha256Hex(`${candidate.id}|${outcome}|${detail}`),
    durationMs: Date.now() - started, adaptedBy, detail,
  };
}

/** Admission gate: only passing admissible proofs promote to reproduced. */
export function admit(result: TransferResult): AdmissionDecision {
  const admissible = result.proofType === 'executable_test' || result.proofType === 'oracle_metric'
    || result.proofType === 'formal_proof' || result.proofType === 'human_signoff';
  if (!admissible) return { candidateId: result.candidateId, status: 'tested', admitted: false, reason: 'non-admissible proof' };
  if (result.outcome === 'passed') return { candidateId: result.candidateId, status: 'reproduced', admitted: true, reason: 'admissible proof passed' };
  if (result.outcome === 'failed') return { candidateId: result.candidateId, status: 'refuted', admitted: false, reason: 'admissible proof failed' };
  return { candidateId: result.candidateId, status: 'tested', admitted: false, reason: 'execution error' };
}

/** Add/update a resolved edge (directed) on the map; candidates are preserved. */
export function applyTransferResult(map: SynergyMap, result: TransferResult, candidate?: TransferCandidate): SynergyMap {
  const c = candidate ?? map.candidates.find((x) => x.id === result.candidateId);
  if (!c) return map;
  const key = `${c.fromDomain}->${c.toDomain}`;
  const edges = map.edges.map((e) => ({ ...e, backingIds: [...e.backingIds] }));
  const existing = edges.find((e) => e.from === c.fromDomain && e.to === c.toDomain && e.kind === 'resolved');
  const passed = result.outcome === 'passed' ? 1 : 0;
  if (existing) {
    existing.passes += passed;
    existing.attempts += 1;
    existing.backingIds.push(result.candidateId);
  } else {
    const edge: SynergyEdge = {
      from: c.fromDomain, to: c.toDomain, kind: 'resolved',
      score: result.outcome === 'passed' ? c.score : 0, passes: passed, attempts: 1,
      backingIds: [result.candidateId],
    };
    edges.push(edge);
  }
  edges.sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : a.to > b.to ? 1 : 0));
  return { ...map, edges };
}
```
**IMPORTANT:** adjust the `verifyCodingCode` result field access to the REAL `VerifierResult` shape you read from `src/lib/verifiers.ts` (e.g. it may be `{ passed, score, logs, error }`). The test must pass with a real passing/failing adaptation.

- [ ] **Step 5: Pass** → `npx vitest run tests/synergy/resolver.test.ts` (3 tests). Then commit `feat(synergy): add resolver and admission gate`.

---

### Task 2: Ledger recording + route

**Files:** Modify `src/routes/synergy.ts`; Test `tests/synergy/router.test.ts`

- [ ] **Step 1: Add `recordTransferResult` to `resolver.ts`**
```ts
import { appendInsight, type LedgerInsight } from '../trendLedger.js';
export function recordTransferResult(result: TransferResult, manifestRoot: string): LedgerInsight | null {
  return appendInsight({
    createdRun: 'synergy:resolve',
    hypothesisId: result.candidateId,
    templateId: result.outcome === 'passed' ? 'crossdomain_transfer_passed' : 'crossdomain_transfer_refuted',
    statement: `Transfer ${result.candidateId} ${result.outcome} via ${result.proofType} (${result.detail.slice(0, 120)})`,
    confidence: result.outcome === 'passed' ? 1 : 0,
    provenanceRoot: manifestRoot,
    payload: { proofType: result.proofType, sandboxReportHash: result.sandboxReportHash, adaptedBy: result.adaptedBy },
  });
}
```

- [ ] **Step 2: Route** `POST /synergy/resolve` in `src/routes/synergy.ts`:
Body: `{ candidate: TransferCandidate, acceptanceTest: string, sourceCode: string, adaptedBy?: 'none'|'operator_ladder'|'model' }`.
Validate shapes (400). Then:
```ts
    const result = resolveTransfer(candidate, acceptanceTest, sourceCode, adaptedBy ?? 'operator_ladder');
    const decision = admit(result);
    const map = readSynergyMap();
    const next = map ? applyTransferResult(map, result, candidate) : null;
    if (next) writeSynergyMap(next);
    recordTransferResult(result, next?.manifestHash ?? candidate.id);
    res.json({ success: true, result, decision, map: next });
```
Wrap in try/catch → structured 500. Import `resolveTransfer`, `admit`, `applyTransferResult`, `recordTransferResult`.

- [ ] **Step 3: Tests** — add to `router.test.ts` a case that POSTs a passing adaptation and asserts `result.outcome === 'passed'`, `decision.status === 'reproduced'`, and that the stored map now has a `kind:'resolved'` edge; plus a 400 for a malformed body. Verify.

- [ ] **Step 4: Commit** `feat(synergy): add /synergy/resolve route and transfer ledger`

---

### Task 3: README

- [ ] Add: "`POST /api/recourse/synergy/resolve` runs a candidate's `acceptanceTest` against an adaptation's `sourceCode` in the existing sandbox and admits `hypothesis → reproduced` only on an admissible proof (`executable_test`). The model may draft `sourceCode`, but only execution sets status." Also note CBR operator-ladder adaptation is not yet implemented (adaptations are caller-supplied).
- [ ] Verify `npx tsc --noEmit` 0 and full `npx vitest run` 0 failed. Commit `docs(synergy): document the resolver and admission gate`.

---

## Self-Review
Spec §8.9 admission gate + §9 ledger + §10 AI-never-authors → Tasks 1–3. Deferred/documented: deterministic CBR operator ladder (caller supplies adaptations), oracle/formal/human proof automation (types exist; only executable_test wired).
