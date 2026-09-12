# Synergy — Outstanding Work Plans (6–10)

**Date:** 2026-09-13
**Status:** Planning artifacts for follow-up execution. Each section is a self-contained plan; when executed, expand to full TDD steps per `writing-plans`.
**Context:** Plans 1–5 are implemented, tested, and pushed on `feat/cross-domain-synergy` (PR #2). These close the documented gaps.

Ordering rationale: Plan 6 first (makes the shipped rewire actually do something), then 7 (gives SME real input), then 8 (statistical depth), then 9 (resolver maturity), then 10 (AI hardening).

---

## Plan 6 — Wire the synergy map into the decision engine

**Goal:** Feed real, map-derived cross-domain synergy into `evaluateGrowthDecision` so the Plan-5 rewire is not inert (currently callers pass nothing → factor `0`).

**Depends on:** Plan 5.

**Files:**
- `src/lib/synergy/synergyMap.ts` — already exports `domainScoresFromMap`.
- New `src/lib/synergy/decisionBridge.ts` — `decisionSynergyInputs(): { crossDomainSynergyByDomain: Record<string, number>; source: 'map' | 'none'; manifestHash?: string }` reading `readSynergyMap()` (fail-soft) and mapping sector ids → `ToolDomain` via `domainRegistry`.
- `src/components/DecisionEngineView.tsx` — call the bridge and pass the result into `evaluateGrowthDecision`; display `source`/`manifestHash` honestly.
- `src/lib/decisionEngine.ts` — no change (optional param already exists).
- Route (optional) `POST /synergy/decision-inputs` returning the bridge output for non-UI callers.

**Tasks:**
1. `decisionBridge.ts` + test: empty map → `{ crossDomainSynergyByDomain: {}, source: 'none' }`; populated map → per-domain scores; deterministic; fail-soft on corrupt map (source `'none'`, no throw).
2. Map `SectorId → ToolDomain` (a domain may map to several `ToolDomain`s) and merge by max; test the mapping.
3. Wire `DecisionEngineView` to pass the inputs; keep rendering honest (`source: none` when no map). Component test or a hook test.
4. README: note the loop is now closed end-to-end.

**Verify:** `tests/synergy/decisionBridge.test.ts`; no literal `crossDomainSynergy` constants remain (grep); `tsc` 0; full suite 0 failed.

**Risks:** The UI is React; prefer a pure bridge module + thin component change to keep tests DOM-light.

---

## Plan 7 — Real relational predicates for SME (un-fail-close alignment)

**Goal:** Give `MethodSignature`/`ProblemSignature` genuine `relations` so SME alignment stops being fail-closed.

**Depends on:** Plan 2.

**Sources of real relations (pick per sector; each must be execution- or text-grounded, not invented):**
- Verified tools: parse the verified suite / source for functional-call structure (deterministic AST-ish extraction), or declare relations in the tool's template metadata.
- Translation engines (`translationBridge`): the real `source_term → target_term` mapping pairs become `maps_to` relations with the engine's confidence.
- Corpus artifacts: extract `depends_on`/`derives` from doc headings only where explicit.

**Files:**
- New `src/lib/synergy/relationExtract.ts` — pure extractors returning `Rel[]` + a `confidence`, labeled with their basis (`suite` | `translation` | `declared`).
- `methodIndex.ts` — accept `relations` from extractors and set `relationBasis: 'declared'` accordingly.
- `problemIndex.ts` — same where a problem declares expected relations.

**Tasks:**
1. Implement the translation-engine extractor (real data already available via `translationBridge.translateTerm`) + test with a stubbed engine client (no subprocess).
2. Implement a conservative suite-structure extractor (only explicit patterns; else `[]`) + tests for the "no fabrication" case.
3. Flip `relationBasis` to `'declared'` only when at least one real predicate exists; test alignment now attaches for such methods.
4. README: update the Plan-2 limitation.

**Verify:** `tests/synergy/relationExtract.test.ts`; alignment attaches for real predicates and stays absent otherwise; determinism golden updated.

**Risks:** The representation bottleneck (research brief): keep the controlled functor vocabulary; reject anything off-vocabulary.

---

## Plan 8 — Statistical depth: Granger causality + transfer entropy + stationarity wiring

**Goal:** Add validated directional lead-lag and make the stationarity gate actually run.

**Depends on:** Plan 3.

**Files:**
- `src/lib/synergy/stats.ts` — add `grangerCausality(xs, ys, maxLag)` (OLS + F-test; require n > 3·lag + 2), `transferEntropy(xs, ys, { bins, history })` (histogram estimator; report `ok:false` when n below a calibration minimum), and `stationarize(series)` (difference while `needsDifferencing`, cap iterations, return transform chain).
- `src/lib/trendEngine.ts` — optional `opts.stationarize` running `stationarize` before `laggedCorrelation`/`runTrendScan`; do NOT change defaults (avoid breaking existing behavior); document.

**Tasks:**
1. `grangerCausality` + tests: detects a one-lag leading indicator; no false positive on independent series; returns `ok:false` for short series.
2. `transferEntropy` + tests: deterministic; `ok:false` under minimum samples; higher for coupled than for shuffled (surrogate).
3. `stationarize` + tests: random walk → differenced, transform chain length > 0; white noise unchanged.
4. Wire optional stationarize into `runTrendScan` behind a flag; test that default output is unchanged and flagged output uses differences.
5. README: document assumption limits (linear for Granger; sample-hungry TE).

**Verify:** stats + trendEngine tests; `tsc` 0; full suite 0 failed.

**Risks:** TE estimation is sample-hungry and bin-sensitive; expose `ok:false` honestly rather than return noise.

---

## Plan 9 — Resolver maturity: CBR operator ladder + admissible proofs

**Goal:** Reduce dependence on caller-supplied adaptations; support more admissible proof types.

**Depends on:** Plan 4.

**Files:**
- New `src/lib/synergy/adapters.ts` — deterministic CBR operator ladder over a method's verified source/suite: `null → reinstantiate → parameter-adjust → abstract/respecialize`. Each operator returns candidate `sourceCode` + the operator that fired; pure string/AST-light transforms only.
- `resolver.ts` — `resolveWithLadder(candidate, problem, method, drafter?)` tries ladder operators in order, then (optionally) the model drafter, executing each through `verifyCodingCode`; first admissible pass wins.
- `resolver.ts` — `admit` already supports `oracle_metric`/`formal_proof`/`human_signoff`; add `resolveOracle` (metric above a pre-registered threshold) and `recordHumanSignoff` (operator id + timestamp as evidence), with tests.

**Tasks:**
1. Ladder operators (null/reinstantiate) + tests using real tiny methods; deterministic.
2. `resolveWithLadder` + tests: passing ladder stops early; all-fail falls through to drafter (injected); execution decides.
3. `resolveOracle` + tests (metric threshold); `recordHumanSignoff` + tests (identity + timestamp stored; still requires `admit`).
4. Ledger template ids for oracle/human results.
5. README.

**Verify:** resolver/adapters tests; `tsc` 0; full suite 0 failed.

**Risks:** Automatic code adaptation is hard; keep operators conservative and always execution-gated. Do not fabricate a pass.

---

## Plan 10 — AI drafting hardening

**Goal:** Make the model drafter safe, testable, and honest.

**Depends on:** Plan 5.

**Files:**
- `src/lib/synergy/aiAdapter.ts` — inject the provider call (`ChatFn`) so `createModelDrafter` is testable without network; add prompt contract, max-length guard, code-fence stripping, and an explicit `offline` result.
- `tests/synergy/aiAdapter.test.ts` — cover: injected chat returns fenced code → stripped; empty → `ok:false`; provider throws → `offline:true`; oversized output rejected.
- Sandbox safety: assert the resolver runs whatever the model returns in the isolated sandbox only (no eval in-process), and add a test that a model-drafted infinite loop fails within the sandbox timeout.

**Tasks:**
1. Refactor `createModelDrafter` to take `chat: ChatFn`; keep `createModelDrafter()` defaulting to `chatCompleteRoute`.
2. Add fence-stripping + size guard + tests.
3. Add sandbox-timeout test with a drafted infinite loop → `outcome:'error'`, no hang.
4. README: model is advisory; nothing it returns is trusted until execution passes.

**Verify:** aiAdapter tests; `tsc` 0; full suite 0 failed.

**Risks:** Sandbox timeouts must be enforced by the existing verifier; if not, that is itself a finding to fix.

---

## Cross-cutting non-code item
- **Rotate the `PHOENIX_API_KEY`** hardcoded in `scripts/kw-import-phoenix.js` (gitignored, not committed) and store it in Keywire; then delete the file or load from env.

## Execution note
Execute in order 6 → 10. Each expands to a full TDD plan per `writing-plans` at execution time. Plans 7 and 9 carry the most risk; 6 is the highest-value/lowest-risk.
