# Recourse — Fix Spec (from BHCR audit)

Repo: ncsound919/recourse (master). Each fix: **Where → Problem → Change → Done when**.
Do in order: F1–F3 (why runs are micro-steps), F4–F5 (why learning degrades), F6–F8 (unused code / no cross-domain), F9–F11 (visibility). Keep each fix its own commit; run `npm run typecheck && npm run lint && npm test` after each.

---
## F1. Planner is capped at one file with no imports  [CRITICAL]
**Where:** `src/autopilot/codePlanner.ts` (prompt ~L70, `parsePlannedCode`), `src/autopilot/upgradeGenerator.ts` (`PlannedCode` ~L35, `buildTierA` ~L102-140), `src/lib/multiFileForge.ts`, `src/autopilot/preMergeGate.ts`.
**Problem:** Prompt says "exactly ONE new file", "self-contained ES module with NO imports". Generated code therefore can never call existing repo functions — this is the main reason only 3-4 of 40+ functions "do anything". The verifier runs one flattened source string.
**Change:**
1. Replace `PlannedCode` with:
```ts
export interface PlannedFile { file: string; content: string; action?: 'create'|'modify' }
export interface PlannedChange {
  files: PlannedFile[];            // 1..MAX_PLANNED_FILES (default 8)
  acceptanceTest: string;          // assert-style body OR vitest file content
  testFile?: string;               // repo-relative path if vitest-style
  functionName?: string;
  imports?: string[];              // existing repo modules the change relies on
}
export const MAX_PLANNED_FILES = 8;
```
Keep `parsePlannedCode` as a thin wrapper that wraps a legacy single-file JSON into `files:[...]` so old tests pass.
2. `parsePlannedChange`: validate every path (no abs, no `..`, no `node_modules`/`.git`/protected paths), total bytes ≤ `MAX_PLANNER_BYTES * 2`, dedupe paths, require ≥1 file + acceptanceTest.
3. Prompt: remove "ONE file" and "NO imports". New rules: "emit up to 8 files; you MAY import from the listed existing modules (see REPO CONTEXT); return JSON `{files:[{file,content}],acceptanceTest,functionName,imports}`." Inject REPO CONTEXT from F3.
4. `buildTierA`: map `planned.files` → `UpgradeFileT[]` (one per file); `verification` carries `files` + `acceptanceTest`.
5. Verification — two lanes in `preMergeGate.ts`:
   - Lane A (no repo imports): existing sandbox via `multiFileToForgeSpec`/`bundleModules`. Fix `bundleModules` name collisions first (prefix top-level declarations per module, or throw `collision` listing names — never silently merge).
   - Lane B (uses repo imports): materialize into a temp git worktree/copy, write files, then run `npx tsc --noEmit -p .` and `npx vitest run <testFile>` with a 120s timeout; gate passes only if both exit 0. Never write to the live tree before pass.
**Done when:** test in `tests/codePlanner.test.ts` proves a 3-file plan that imports an existing module (e.g. `../lib/calibration`) parses, verifies in Lane B, and a plan with `..` paths or >8 files is rejected.

## F2. Doc-stub fallback counts as an "upgrade"  [CRITICAL]
**Where:** `src/autopilot/upgradeGenerator.ts` `buildTierA` tail (writes `docs/upgrades/<gap>.md`, "PENDING SANDBOX VERIFICATION").
**Problem:** When the planner returns null (offline model, bad JSON), the run still emits a markdown placeholder. Runs look productive but ship nothing.
**Change:** Return `{ skipped: true, reason: 'planner_unavailable'|'planner_invalid', files: [] }`; propagate through `UpgradeProposalT` (add optional `skipped`, `reason`). In `auditRunner.ts`/`loopStateMachine.ts` do not count skipped proposals toward completed upgrades or fitness; record them in the run report (F11). Only keep doc generation behind an explicit `opts.allowDocStubs` (default false).
**Done when:** with a planner stub returning null, the run reports `upgrades: 0, skipped: N` and writes no files.

## F3. Planner has no knowledge of the existing codebase
**Where:** new `src/autopilot/repoIndex.ts`; consumed by `codePlanner.ts`.
**Change:** Build a deterministic export index once per run: walk `src/**/*.ts(x)` (skip tests), regex `export (async )?(function|const|class) (\w+)` plus the first `/** ... */` or `//` header line as summary. Cache to `.recourse/repo-index.json` keyed by git tree hash.
```ts
export interface IndexEntry { file: string; name: string; kind: string; summary: string }
export function buildRepoIndex(root: string): IndexEntry[]
export function relevantEntries(index: IndexEntry[], gapText: string, k = 25): IndexEntry[] // token-overlap (BM25-lite) on name+summary+file
```
Pass `relevantEntries(...)` into the planner prompt as REPO CONTEXT (`file :: name :: summary`).
**Done when:** unit test shows a gap mentioning "calibration" surfaces `src/lib/calibration.ts :: calibrationReport`.

## F4. Learner beliefs persist across gene versions  [CRITICAL]
**Where:** `src/dream/learner.ts` ~L480-520 (`state.geneBeliefs[gene.id]`), `LearnerState`/`GeneBelief` in `src/dream/learner-types.ts`, hydrate/migrate ~L742-800.
**Problem:** Beliefs keyed by `gene.id`; a mutated gene (new `versionHash`) inherits the old Beta(α,β). Forecasts for new code are anchored on old code's history, and α/β grow without bound.
**Change:**
1. Add `versionHash?: string` to `GeneBelief`. In the loop, compute `vh = gene.versionHash ?? h8(gene.code)`.
2. If `belief.versionHash && belief.versionHash !== vh`: shrink toward prior before forecasting:
```ts
const PRIOR_STRENGTH = 2, VERSION_KEEP = 0.25, MAX_ESS = 40;
const n = belief.alpha + belief.beta;
const keep = Math.min(1, (PRIOR_STRENGTH + VERSION_KEEP * (n - PRIOR_STRENGTH)) / n);
belief.alpha = round4(1 + (belief.alpha - 1) * keep);
belief.beta  = round4(1 + (belief.beta  - 1) * keep);
belief.attempts = 0; belief.versionHash = vh;
```
3. Every update, cap effective sample size: if `α+β > MAX_ESS`, scale both by `MAX_ESS/(α+β)` (keeps mean, restores adaptivity).
4. Migration in hydrate: missing `versionHash` → leave undefined (first sight sets it, no shrink).
**Done when:** test: gene with 30 high rewards, then new versionHash with low rewards → forecast error on episode 2 of new version is lower than baseline; ledger replay (`POST /api/recourse/replay`) still matches.

## F5. Calibration loop tunes the wrong things
**Where:** `src/dream/learner.ts` ~L540-585, `src/lib/calibration.ts`, `learner-types.ts`.
**Problems & changes:**
1. `calibrationError` = mean |reward − priorMean| is surprise, not calibration. Rename to `meanAbsSurprise` (keep an alias in hydrate for old saves) and stop using it to drive `learningRate`.
2. Drive `learningRate` from Brier on the gene window: if `brierGene` rose vs. previous episode by >5% → decrease LR ×0.9 (floor 0.05); if fell → ×1.05 (cap 0.3). Remove the "error > 0.15 ⇒ LR ×1.1 up to 0.5" rule.
3. Split forecasts: `state.forecastWindow` (genes only) and `state.selfForecastWindow` (selfScore vs externalScore). Compute `ece/brierScore` from gene window only; compute `selfEce` separately. `isCalibrated` gate (promotion, ~L621) uses gene-window ECE.
4. `selfScore` must not target `(1 - calibration)`. Make it an EMA of recent `externalScore` (when present), else unchanged.
5. `learningRate` currently only affects `meanReward/weight`, not forecasts. Either (a) forecast with `meanReward` blended: `pred = 0.5*betaMean + 0.5*meanReward`, or (b) delete the claim in docs. Pick (a); store both in the forecast record for analysis.
6. Hydrate migration: if `selfForecastWindow` missing → `[]`.
**Done when:** unit tests: (i) window separation (self forecasts never appear in gene reliability bins), (ii) LR decreases when Brier worsens, (iii) replay chain still verifies after bumping ledger schema version.

## F6. 22 modules never imported by production code
Static scan (non-test importers = 0): `dream/ast-genes`, `autopilot/qualityTier`, `lib/tracingOss`, `lib/literatureGrounding`, `lib/langfuseIntegration`, `lib/synergy/aiAdapter`, `lib/problemGenerator`, `lib/e2bSandbox`, `lib/codeSafetyOss`, `lib/kagSidecarClient`, `lib/unstructuredSidecarClient`, `lib/inspectSidecarClient`, `lib/multiFileForge`, `lib/specQueue`, `lib/astRelExtract`, `lib/inspectExport`, `lib/metricsOss`, `lib/repairAst`, `lib/recourseSdk`, `lib/v1Client.generated`, `lib/exportableHygiene`, `lib/musicTherapyFeed`.
(Static only — a computed `import()` or script/CLI use can false-positive; check each before deleting.)
**Change, per module — wire or delete (decide by the table):**
| Module | Wire into |
|---|---|
| `multiFileForge` | F1 Lane A |
| `qualityTier` | `upgradeGenerator` tiering + `preMergeGate` thresholds |
| `dream/ast-genes` | learner gene source (`dream/engine.ts` gene collection) |
| `langfuseIntegration`, `tracingOss`, `metricsOss` | `server.ts` boot, wrapped in env flags (`LANGFUSE_*`, `OTEL_*`); no-op when unset |
| `codeSafetyOss` | `lib/codeSafety.ts` as second-opinion scan |
| `e2bSandbox` | `lib/executionSandbox.ts` fallback when isolated-vm unavailable and `E2B_API_KEY` set |
| `kag/unstructured/inspect` sidecar clients | the matching `routes/*` and `agentTools.ts` tool registry |
| `literatureGrounding` | `deterministicResearch.ts` / researcher path |
| `problemGenerator`, `specQueue` | `autopilot` gap intake (feeds F7) |
| `repairAst`, `astRelExtract` | `selfRepair` path / synergy `relationExtract` |
| `v1Client.generated`, `recourseSdk`, `musicTherapyFeed`, `exportableHygiene`, `inspectExport` | delete if no CLI/script use after grep |
Add `scripts/orphan-check.mts` (walk `src/**`, for each file with exports verify ≥1 non-test importer or an entry in `scripts/orphan-allowlist.json`; exit 1 otherwise) and run it in `.github/workflows/ci.yml`.
**Done when:** CI fails on a new orphan; each wired module has a production call site and an env flag documented in `.env.example`.

## F7. Cross-domain synergy is not in the autonomous path
**Where:** `src/autopilot/gapAnalyzer.ts` (`analyzeGaps` ~L357), `src/lib/synergy/*` (read `src/routes/synergy.ts` for the call signature), `scripts/autopilot-cron.ts`.
**Change:** Add optional `synergy?: (gaps: GapT[]) => Promise<SynergyPair[]>` to `analyzeGaps` options. Merge pairs into composite gaps `{id:'syn:<a>+<b>', tier, description, domains:[a,b]}` scored `scoreGap(...) * 1.25`. Composite gaps go to the F1 multi-file planner with both domains' REPO CONTEXT. In `autopilot-cron.ts` pass the real synergy resolver. Gate by `SYNERGY_IN_LOOP=1` initially.
**Done when:** a dry-run (`npm run audit:dry-run`) lists ≥1 composite gap when two domains have open gaps.

## F8. Learner directives never reach gap selection
**Where:** `src/dream/learner.ts` `deriveDirectives` (~L609); consumers today are UI, `forgeLearningLoop.ts`, `learnerGenerationPlan.ts`, `routes/learn.ts` only.
**Change:** In `gapAnalyzer.scoreGap`, accept `directives: Directive[]` and add `+w` when a gap's domain matches a directive's target domain (reuse the loop's learner depth hook in `loopStateMachine.ts` ~L96-130). Log which directive influenced which gap in the run report.
**Done when:** test: a high-priority directive reorders two otherwise equal gaps.

## F9. ~19 silent catch blocks in server.ts
**Where:** `server.ts` lines ≈ 521, 766, 873, 894, 901, 1245, 1680, 2327, 2892, 3771, 5698, 5761, 5787, 5803, 6244, 6582, 7285, 7309, 7359 (return `null`/`[]`/`0`/`undefined` or a comment only). Re-grep after edits; line numbers will shift.
**Change:** add `src/lib/swallow.ts`:
```ts
export function swallow<T>(tag: string, err: unknown, fallback: T): T {
  console.warn(`[swallow:${tag}]`, err instanceof Error ? err.message : String(err));
  swallowCounts.set(tag, (swallowCounts.get(tag) ?? 0) + 1);
  return fallback;
}
export const swallowCounts = new Map<string, number>();
```
Replace each `catch { return X; }` with `catch (e) { return swallow('<route-or-fn>', e, X); }`. Expose `swallowCounts` in the existing metrics/health endpoint. Keep the intentional "best-effort" ones, but they must still log.
**Done when:** `grep -nE "catch\s*\{\s*(return|//|/\*)" server.ts` returns 0 and `/api/.../health` shows counters.

## F10. Nightly self-improvement is only an HTTP driver
**Where:** `scripts/nightly-self-improvement.ts` (101 lines).
**Change:** After the existing POSTs, call the autopilot loop directly (`runLoop` as in `scripts/autopilot-cron.ts`) with planner (F1), repo index (F3), synergy (F7), learner. Fail the script (exit 1) if the F11 run report shows zero non-doc files merged or all proposals skipped.

## F11. Run report that measures significance
**Where:** new `src/autopilot/runReport.ts`; call from `loopStateMachine.ts` end and `renderUpgradeReport`.
**Fields:** `{ runId, gapsConsidered, proposals, skipped:{reason:count}, filesChanged, locAdded, gatesPassed, gatesFailed, laneA, laneB, compositeGaps, fitnessDelta, forecastBrier, forecastEce, selfEce }`. Write to `docs/audits/runs/<runId>.json`. A run is "significant" only if `filesChanged ≥ 2 && gatesPassed ≥ 1 && fitnessDelta > 0` — surface that boolean at the top.
**Done when:** every run emits a report and the nightly script uses `significant` for its exit code.

---
## Verified strengths — don't break
Hash-chained ledger + `POST /api/recourse/replay`; sandbox-verified promotion; Brier/ECE math in `calibration.ts`. Re-run replay after F4/F5 and bump the ledger schema version rather than editing old entries.
