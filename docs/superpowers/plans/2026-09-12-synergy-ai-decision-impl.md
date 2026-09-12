# Synergy Plan 5 — AI Drafting (behind the gate) + decisionEngine Rewire Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** (a) Replace the hardcoded `crossDomainSynergy` constants in `decisionEngine.ts` with values computed from the real synergy map; (b) add an AI-drafting seam that proposes an adaptation, where **only the Plan 4 resolver execution** sets status.

**Architecture:** `decisionEngine.evaluateGrowthDecision` gains an optional `crossDomainSynergyByDomain: Record<string, number>` argument (default `{}` → honest `0`); the literals `0.4/0.3/0.5/0.85/0.95` become map lookups. `synergyMap.ts` gains `domainScoresFromMap(map)` to build that record via `crossDomainSynergyFor`. `aiAdapter.ts` takes an injected `Drafter` (no network in tests); `createModelDrafter()` wraps the real provider. `attemptTransfer` drafts then resolves — execution decides.

**Tech Stack:** TypeScript ESM (`.js`), vitest. Reuses `decisionEngine.ts`, `synergyMap.ts`, `resolver.ts`, `modelProvider.ts`.

---

## File Structure
**Modify:** `src/lib/decisionEngine.ts`, `src/lib/synergy/synergyMap.ts`, `README.md`
**Create:** `src/lib/synergy/aiAdapter.ts`, `tests/synergy/aiAdapter.test.ts`
**Test:** `tests/decisionEngine.test.ts`, `tests/synergy/synergyMap.test.ts`

---

### Task 1: decisionEngine rewire

**Files:** Modify `src/lib/synergy/synergyMap.ts`, `src/lib/decisionEngine.ts`; Test the two test files.

- [ ] **Step 1: Add `domainScoresFromMap`**
In `synergyMap.ts`:
```ts
/** Per-domain cross-domain synergy scores for the decision engine. */
export function domainScoresFromMap(map: SynergyMap, domains: string[] = map.domains): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of domains) out[d] = crossDomainSynergyFor(map, d);
  return out;
}
```

- [ ] **Step 2: Failing test** in `tests/synergy/synergyMap.test.ts`:
```ts
  it('domainScoresFromMap returns a score per domain', () => {
    const map = buildSynergyMap(candidates, { generatedAtRun: 'run:1' });
    const scores = domainScoresFromMap(map, map.domains);
    expect(Object.keys(scores).sort()).toEqual(map.domains);
    expect(scores.cybersecurity).toBe(0);
  });
```
(Import `domainScoresFromMap`.) Run → fail.

- [ ] **Step 3: decisionEngine rewire**
In `evaluateGrowthDecision`, add a 7th parameter:
```ts
  crossDomainSynergyByDomain: Record<string, number> = {},
```
Replace each hardcoded cross-domain factor:
- Domain-gap action: `const crossDomainSynergy = crossDomainSynergyByDomain[domain] ?? 0;`
- Repair action: `crossDomainSynergy: crossDomainSynergyByDomain[topAnomaly.domain] ?? 0`
- GitHub action: `crossDomainSynergy: crossDomainSynergyByDomain[topBp.domain] ?? 0`
- Dream action: `crossDomainSynergy: crossDomainSynergyByDomain[crystallizableThought.domain] ?? 0`
- Crossover action: `const crossDomainSynergy = crossDomainSynergyByDomain['cyber_defense'] ?? 0;` and use it in both `rawFactorScores.crossDomainSynergy` and the `deterministicRationale` string (remove the literal `0.95`).

Also add a `relationBasis`-style honesty note in the function doc that the factor is now caller-supplied from the real map and defaults to 0.

- [ ] **Step 4: Update tests**
- `tests/decisionEngineCoverage.test.ts` recomputes utility from `action.rawFactorScores`, so it should stay green. If any assertion pinned a literal raw value, update it to read from `rawFactorScores`.
- Add to `tests/decisionEngine.test.ts`:
```ts
  it('uses caller-supplied cross-domain synergy and defaults to 0', () => {
    const reg = [{ name: 'a', domain: 'math', versions: [{ promoted: true, score: 1 }] }, { name: 'b', domain: 'coding', versions: [{ promoted: true, score: 1 }] }] as any;
    const zero = evaluateGrowthDecision(reg, [], DEFAULT_GROWTH_WEIGHTS, 1, [], []);
    const withMap = evaluateGrowthDecision(reg, [], DEFAULT_GROWTH_WEIGHTS, 1, [], [], { cyber_defense: 0.9 });
    const find = (r: any) => r.candidateActions.find((a: any) => a.actionType === 'cross_domain_hybridization');
    expect(find(zero)?.rawFactorScores.crossDomainSynergy).toBe(0);
    expect(find(withMap)?.rawFactorScores.crossDomainSynergy).toBe(0.9);
  });
```

- [ ] **Step 5: Verify + commit**
`npx vitest run tests/decisionEngine.test.ts tests/decisionEngineCoverage.test.ts tests/synergy/synergyMap.test.ts` pass; `npx tsc --noEmit` 0. Commit `refactor(synergy): source crossDomainSynergy from the real map` (no more hardcoded constants).

---

### Task 2: AI drafting seam (injected, no network in tests)

**Files:** Create `src/lib/synergy/aiAdapter.ts`, `tests/synergy/aiAdapter.test.ts`

- [ ] **Step 1: Failing test**
```ts
// tests/synergy/aiAdapter.test.ts
import { describe, it, expect } from 'vitest';
import { draftAdaptation, attemptTransfer, type Drafter } from '../../src/lib/synergy/aiAdapter.js';
import type { TransferCandidate } from '../../src/lib/synergy/types.js';

const candidate: TransferCandidate = {
  id: 'tc_1', methodId: 'm', problemId: 'p', fromDomain: 'mathematics', toDomain: 'logistics',
  bridges: [], score: 0.8, support: 1, prediction: 'pass', falsification: 'f', filters: [], engineVersion: '0.1.0',
};
const acceptanceTest = `const a = Mod.f([1,2,3]); assert a === 6;`;

describe('ai adapter (injected drafter, no network)', () => {
  it('returns offline honestly when the drafter errors', async () => {
    const drafter: Drafter = async () => ({ error: 'model offline' });
    const r = await draftAdaptation({ candidate, problemStatement: 's', acceptanceTest, methodName: 'm' }, drafter);
    expect(r.ok).toBe(false);
    expect(r.offline).toBe(true);
  });

  it('attemptTransfer only marks passed when execution passes', async () => {
    const good: Drafter = async () => ({ sourceCode: 'export class Mod { static f(xs){ return xs.reduce(function(s,x){return s+x;},0); } }' });
    const bad: Drafter = async () => ({ sourceCode: 'export class Mod { static f(){ return 0; } }' });
    const a = await attemptTransfer({ candidate, problemStatement: 's', acceptanceTest, methodName: 'm' }, good);
    const b = await attemptTransfer({ candidate, problemStatement: 's', acceptanceTest, methodName: 'm' }, bad);
    expect(a.result?.outcome).toBe('passed');
    expect(a.decision?.status).toBe('reproduced');
    expect(b.result?.outcome).toBe('failed');
    expect(b.decision?.status).toBe('refuted');
  });
});
```

- [ ] **Step 2: Fail** → module not found.

- [ ] **Step 3: Implement**
```ts
// src/lib/synergy/aiAdapter.ts
/**
 * AI adapter drafting. The model proposes an adaptation; ONLY the Plan 4
 * resolver's execution result sets status. Offline => honest failure, no fabrication.
 */
import { resolveTransfer, admit } from './resolver.js';
import { chatCompleteRoute } from '../modelProvider.js';
import type { TransferCandidate, TransferResult, AdmissionDecision } from './types.js';

export interface DraftRequest {
  candidate: TransferCandidate;
  problemStatement: string;
  acceptanceTest: string;
  methodName: string;
}
export interface DraftOk { sourceCode: string }
export interface DraftErr { error: string }
export type Drafter = (req: DraftRequest) => Promise<DraftOk | DraftErr>;
export interface DraftResult { ok: boolean; sourceCode?: string; offline?: boolean; error?: string }

export async function draftAdaptation(req: DraftRequest, drafter: Drafter): Promise<DraftResult> {
  try {
    const out = await drafter(req);
    if ('error' in out) return { ok: false, offline: true, error: out.error };
    if (!out.sourceCode || !out.sourceCode.trim()) return { ok: false, error: 'drafter returned empty source' };
    return { ok: true, sourceCode: out.sourceCode };
  } catch (err) {
    return { ok: false, offline: true, error: err instanceof Error ? err.message : String(err) };
  }
}

export function createModelDrafter(): Drafter {
  return async (req) => {
    const prompt = `You are drafting a self-contained JavaScript module to satisfy a test suite.\n` +
      `Method to adapt: ${req.methodName}\nProblem: ${req.problemStatement}\n` +
      `The module must export exactly the symbols the acceptance test references. Return ONLY code.\n` +
      `Acceptance test:\n${req.acceptanceTest}`;
    const res = await chatCompleteRoute([{ role: 'user', content: prompt }], { route: 'auto' } as never);
    const content = (res as { content?: string }).content ?? '';
    if (!content.trim()) return { error: 'model returned no content' };
    return { sourceCode: content };
  };
}

export async function attemptTransfer(
  req: DraftRequest, drafter: Drafter,
): Promise<{ result: TransferResult | null; decision: AdmissionDecision | null; draft: DraftResult }> {
  const draft = await draftAdaptation(req, drafter);
  if (!draft.ok || !draft.sourceCode) return { result: null, decision: null, draft };
  const result = resolveTransfer(req.candidate, req.acceptanceTest, draft.sourceCode, 'model');
  return { result, decision: admit(result), draft };
}
```
**NOTE:** verify `chatCompleteRoute`'s real signature/return shape in `src/lib/modelProvider.ts` and adjust `createModelDrafter` accordingly. `createModelDrafter` is NOT exercised in tests (network); the injected `Drafter` is.

- [ ] **Step 4: Pass** → 2 tests. `npx tsc --noEmit` 0. Commit `feat(synergy): add AI drafting seam behind the execution gate`.

---

### Task 3: README
- [ ] Add: "`crossDomainSynergy` in the decision engine is now sourced from the real synergy map (`domainScoresFromMap`); the hardcoded constants are removed. `aiAdapter` may draft an adaptation with the model, but only the resolver's execution sets status — offline drafting is reported honestly." Note `createModelDrafter` is untested (network) and adaptations are otherwise caller-supplied.
- [ ] `npx vitest run` full → 0 failed; `npx tsc --noEmit` 0. Commit `docs(synergy): document decision-engine rewire and AI drafting seam`.

---

## Self-Review
Spec §9 (decisionEngine rewire) → Task 1; §10 (AI never authors status) → Task 2. Removes the original hardcoded-synergy theater. Deferred: deterministic CBR operator ladder; model drafting is a thin seam with no offline test.
