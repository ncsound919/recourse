# Recourse — Major Upgrades

> Dated 2026-09-22. Every claim below is grounded in evidence measured this
> session (benchmark ledger, learner state, registry/state inventory), not
> assumed. The thesis: **Recourse's integrity machinery is real; its capability
> signal is broken.** Fix the signal before adding more generation.

## What was measured (the evidence)

| Signal | Reading | Source |
|---|---|---|
| Benchmark | **200 runs, every one 15/15**, `deltaSolved` 0 | `data/benchmark-ledger.jsonl`, `benchmarkHistory` |
| Registry | 5,781 tools → pruned to **1,232**; ~4,500 `1.0.0-forge` contributed nothing | registry inventory |
| Learner | `selfScore 0.4954`, `calibrationError 0.7238` | `recourse_learner.json` |
| Dream | 32 recent thoughts → **15 unique (47%)**; one hypothesis ×6 | `recourse_dream.json` |
| Biotech domain | **1 active gene, 1% pass rate** | `status.domainCoverage` |
| Self-repair | `repairSuccessRate: 1` (100%) | `status.selfRepair` |
| Readiness | `readinessScore 0.9281` while the benchmark never moved | `status` |
| State | DB 224.7 MB → **12.5 MB** after distill + VACUUM | `recourse_storage.json` |

Interpretation: the hash-chained ledgers, sandbox verification, provenance, and
single-writer state are genuine engineering. But the number that is supposed to
say "is Recourse getting better" (the benchmark) has never changed, and the
learner that is supposed to improve it is a coin-flip with 0.72 calibration
error. **Everything downstream inherits a broken measurement.**

---

## P0 — Fix the capability signal (do first)

### 1. Replace the saturated benchmark with an unbounded one
The 15 fixed problems are all solved by the same 15 genes. A yardstick pinned at
100% cannot detect improvement.
- Generate problems (seeded, reproducible) across difficulty tiers; keep a
  **held-out set** never used for tuning.
- Adversarial/edge cases where a naive solution fails (empty, NaN, overflow,
  huge N, malformed input).
- **Acceptance:** the benchmark can produce a score < 100% and `deltaSolved ≠ 0`
  across two runs. If it cannot fail, it is not a measurement.

> **STATUS: DONE (2026-09-22).** The scored set is now 50 problems in three
> tiers: `baseline` 15 (happy path), `robustness` 15 (edge/adversarial, same
> functions), `generated` 20 (seeded specs with reference-computed expected
> values). First run: **28/50 = 56%** (baseline 15/15, robustness 13/15,
> generated 0/20), `deltaSolved 13` — the first non-zero delta in the ledger.
> Real gaps exposed: `multiply` is hardcoded 2×2; `planRoutes` fails
> `start === goal`.
> - Files: `src/benchmark/benchmark.ts`, `generatedProblems.ts`,
>   `edgeProblems.ts`; `BenchmarkRun` gained `byTier` + `problemSetHash`.
> - The activator's refresh now appends a **real** generated problem; the old
>   templates carried non-executable pseudo-code "test vectors" (theater).
> - **Honest caveat:** `deltaSolved` is only comparable between runs with the
>   same `benchmarkHash`; a set change is now visible in the ledger. The next
>   run at this set is the first true apples-to-apples delta.
> - Tests: `src/benchmark/benchmark.test.ts` (8).

> **P1 wiring — DONE (2026-09-22).** The generated tier is no longer just
> headroom: `benchmarkGapSpecs()` (`src/lib/capabilityForge.ts`) maps every
> unsolved generated problem to a forge spec (`name` = the required export,
> `refSuite` = the problem's hidden suite), and `allForgeSpecs()` feeds them to
> the forge. So the forge generates + sandbox-verifies a real implementation,
> registers a tool the benchmark then counts, and `deltaSolved` reflects
> capability rather than a set change. Verified live: the forge agenda now lists
> all 20 `benchgap_*` specs, and a forge cycle materialized a tool
> (`chunkArray`). Gaps queue behind the 36 pending builtin specs.
> - Tests: `tests/benchmarkGapSpecs.test.ts` (3).

### 2. Make repair success verified, not self-reported
`repairSuccessRate: 1` is not credible. A repair is done when the affected job
re-runs healthy, not when the healer says so.
- Success = post-repair verification pass (the dead-man's-switch pattern the
  Draymond gate already defines but never closes).
- **Acceptance:** success rate is computed only from verified outcomes; a
  reported "fixed" that later fails counts as a failure.

> **STATUS: DONE (2026-09-22).** Each heal now opens a verification window
> (`src/lib/repairVerification.ts`). `repairSuccessRate` is
> `verified / (verified + regressed)` — the heal claim no longer counts. A
> smoke-only heal (no regression suite) is `unverifiable` and excluded; a heal
> that later fails a re-verify becomes `regressed` (a failure). The existing
> self-repair pass re-verifies pending windows live.
> - Live proof: before, `repairSuccessRate: 1`; after a smoke-only heal,
>   `totalHealedCount: 44` but `repairSuccessRate: 0` with
>   `unverifiableRepairs: 1` — the claim did not inflate the rate.
> - Status now exposes `verifiedRepairs` / `pendingRepairs` / `regressedRepairs`
>   / `unverifiableRepairs`.
> - Files: `src/lib/repairVerification.ts`, `server.ts` (`executeSelfRepair`,
>   `reverifyPendingRepairs`, `runStuckRepairPass`), `src/types.ts`.
> - Tests: `tests/repairVerification.test.ts` (7), incl. the acceptance case
>   "a heal that later fails counts as a failure".
> - **Boundary (honest):** a successful *suite-matching* heal is hard to force
>   through the current template healer, so the live demo used the smoke-only
>   (unverifiable) path; the verified/regressed transitions are covered by tests.

### 3. Calibrate the learner
`calibrationError 0.7238` means predicted reward is nearly uninformative.
- Report Brier/reliability curves; gate promotion on calibrated confidence.
- Stop folding self-attested outcomes into gene beliefs (only verified ones).
- **Acceptance:** calibrationError < 0.20 on held-out episodes.

---

## P1 — Fix generation quality

### 4. Registry quality gate
The forge mass-produced ~4,500 tools (9-LOC stubs, scraped document headings)
that added zero capability. The prune kept only hand-authored tools + proven
solvers.
- Promotion requires a real behavioral test (not a smoke `node -e 0`), a minimum
  substance bar, and a novelty check against the existing registry.
- Keep the prune discipline (`scripts/prune-registry.mts`): protect proven
  solvers, cut the rest.
- **Acceptance:** registry growth correlates with benchmark/verification gains;
  no more than ~5% of a batch is sub-substance.

### 5. Dream novelty gate
47% unique hypotheses (one ×6) is a loop, not dreaming.
- Dedupe against recent thoughts; require a novelty score before
  crystallization.
- **Acceptance:** ≥ 80% unique hypotheses per rolling window.

### 6. Domain honesty
Biotech shows 1 active gene at 1% pass yet appears in "coverage".
- Report a domain as **broken** when pass rate is near zero, or retire it.
- **Acceptance:** `domainCoverage` reflects real pass rates; no domain is
  counted as covered while failing.

### 7. Recalibrate the readiness score
`readinessScore 0.9281` alongside a flat benchmark is misleading.
- Tie readiness to the unbounded benchmark + verified repair rate, or drop it.
- **Acceptance:** readiness moves when capability moves.

> **P1.4–P1.7 STATUS: DONE (2026-09-22).** All four gates live in one pure module
> (`src/lib/honestyMetrics.ts`, 13 tests) and are wired in:
> - **P1.4 quality gate** — `assessSourceSubstance` rejects empty/declaration-only
>   stubs and bare constants before lint in `materializeForgeOutcome`; a real
>   implementation still materializes (verified live: `runLengthEncode` built).
> - **P1.5 novelty gate** — `isNovelHypothesis` blocks a repeated model
>   hypothesis (REM reports "novelty gate"); `phaseLucid` crystallizes each
>   distinct hypothesis once.
> - **P1.6 domain honesty** — `domainHealth` marks a domain BROKEN below 3 genes
>   or 25% pass. Live: `biotech: 1 gene @ 1% [BROKEN]`; the readout shows it.
> - **P1.7 readiness** — `capabilityReadiness` = mean(benchmark solved%,
>   verified-repair rate). Live: `capabilityReadiness 0.28` vs
>   `readinessScore 0.9281`, now labelled `readinessBasis: math-loop convergence
>   (not a capability score)`; the readout prints both.
>
> **Boundary (honest):** the substance gate is a structural heuristic (it does
> not judge semantics); a 1-line implementation is accepted by design. Novelty
> dedup ignores hypotheses shorter than 8 chars (no idea to compare).
>
> **P1.4 gap CLOSED (2026-09-22).** The gate is no longer forge-only: a shared
> `promoteTool(entry, { origin, gate?, push? })` chokepoint now guards every
> generator path — templates, learn/synthesize-directive, crossover,
> decision/execute (×2), dream-mirror, dream/crystallize, mutate/evolve,
> mutate/approve, swarm, grounding — plus the forge. A refusal is recorded as a
> `promotion_refused` provenance event + dev log, never silent. Repairs
> (`executeSelfRepair`), pending candidates (`evolve`, `importGitHubCandidate`,
> `registerImportedTool`) and restores pass `gate:false` by design: a repair is
> judged by the verification window, not by this gate.
> - Verified live: a forge cycle still materializes (`fibonacciN`); a crossover
>   still promotes (`gene_crossover` provenance). `tsc` clean; suite
>   2,999/3,000 (the 1 failure is the pre-existing `fleetDevelopmentExtended`).

---

## P2 — Keep it healthy

### 8. State hygiene as a scheduled job
One-off pruning is not a policy. The DB grew to 224 MB of which ~99 MB was
superseded telemetry/proposals.
- TTL/cap the telemetry stores (`systemSnapshots`, proposals, ledgers);
  periodic distill → `legacyDigest`; `VACUUM` on cadence.
- **Acceptance:** DB stays bounded (e.g. < 50 MB) without manual intervention.

### 9. Make the digest a first-class artifact
`legacyDigest` (58 KB) now holds the capability trend, registry/health trend,
learner trend, repair patterns, research topics, agenda themes. Feed it to the
planner so old runs inform new work instead of being re-derived or lost.

> **P2 STATUS: DONE (2026-09-22).**
> - **P2.8** — `StateStore.vacuum()` (checkpoint + VACUUM, returns bytes) and
>   `stateHygiene()` in `server.ts`: historical snapshots keep only a `toolCount`
>   (the per-tool arrays are the bloat; baseline + last 10 keep full `tools` for
>   the upgrade report), history capped at 100, VACUUM when the file exceeds
>   `RECOURSE_STATE_VACUUM_MB` (default 64). Scheduled by `startStateHygiene()`,
>   opt-in via `RECOURSE_STATE_HYGIENE_MS`. Verified live:
>   `[state-hygiene] scheduled every 15000ms` → ran.
> - **P2.9** — `legacyDigest` is a first-class state key (module var + boot
>   loader + `getPayload`), exposed at `GET /api/recourse/legacy-digest` and
>   rendered in the readout ("Legacy digest" section with the capability finding
>   + pruned stores). Verified live.
> - Tests: `tests/stateStore.test.ts` (+1 vacuum). `tsc` clean; suite
>   2,999/3,001 (the 2 failures are the pre-existing `fleetDevelopmentExtended`
>   and the flaky live-API `musicTherapyFeed`).
> - **Boundary (honest):** the store upserts changed keys only, so it never
>   deletes a key removed from the payload — VACUUM reclaims freed pages but a
>   deliberately dropped store must be deleted explicitly (as the distill script
>   did). `systemSnapshots` is still capped at 200 at the append site; hygiene
>   tightens it to 100 on cadence.

---

## Explicitly NOT doing (theater to refuse)

- More dashboard panels, more Elo surfaces, more exploration knobs **before**
  the benchmark can fail.
- "Autonomous" loops running against a 15/15 yardstick — that is churn.
- Counting self-reported success anywhere in the promotion path.

## Sequencing

1. **Unbound the benchmark** (P0.1) — smallest change that makes everything else
   measurable. If nothing can move it, stop and reconsider the whole loop.
2. **Verified repair success** (P0.2) + **learner calibration** (P0.3).
3. **Quality gate** (P1.4) + **novelty gate** (P1.5) + **domain honesty** (P1.6).
4. **Hygiene** (P2.8) + **digest integration** (P2.9).

## The honest fork

- If P0 lands → Recourse becomes a system whose "it got better" claim is
  falsifiable and real.
- If P0 cannot land (no ground truth reachable) → narrow scope to the domains
  where ground truth exists, and stop presenting generation volume as progress.
