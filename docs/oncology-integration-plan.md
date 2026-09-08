# Recourse ↔ Oncology Integration Plan

Goal: wire Recourse into the oncology systems **without building 20 parallel
bridges**. Overlay Oncology (the host app under
`02_Pillars/Overlay Science/Overlay Oncology`) already aggregates several of
these subsystems in its `lib/` and exposes ~68 API routes. So the strategy is:

1. **Route through Overlay Oncology** for everything it already aggregates.
2. **Extend the existing oncology bridge** (`src/lib/oncologyEngineBridge.ts`)
   to reach those aggregate routes — one client, not fifteen.
3. **Direct-wire only** the genuinely standalone producers Overlay Oncology
   does NOT surface, and only when they are high-value AND actually running.
4. Everything stays **availability-gated** (probe at call time, `ok:false`
   honestly when down — the same contract as every other Recourse bridge).

No fabricated integration: a subsystem is "wired" only when a real call to a
real route returns real data. Scaffolds, empty folders, and services that are
down are reported as such.

---

## 1. Inventory — all oncology subsystems found

### 1a. Already wired in Recourse (direct bridges exist)

| Subsystem | Recourse bridge | Proxy routes |
|---|---|---|
| Overlay Oncology (host) | `oncologyEngineBridge` | `/api/recourse/oncology/*` (status, simulate, synthesis) |
| UMOE (mechanistic engine) | `umoeBridge` | `/api/recourse/umoe/*` |
| OncoForesight | `oncoforesightBridge` | `/api/recourse/foresight/*` |
| Overlay-Chemlab | `chemlabBridge` | `/api/recourse/chemlab/*` |
| BioSim sidecar | `biosimSidecarClient` | `/api/recourse/biosim/*` |
| KG sidecar (NetworkX) | `kgSidecarClient` | `/api/recourse/kg/*` |
| Protein folding | `proteinFoldingBridge` | `/api/recourse/folding/*` |
| Integrity/reproducibility | `integrityBridge` | `/api/recourse/integrity/*` |
| Study orchestrator | `studyOrchestratorBridge` | `/api/recourse/orchestrator/*` |
| Scientific API | `scientificApiBridge` | `/api/recourse/scientific/*` |
| Prometheus | `prometheusBridge` | (research sources) |
| Pathosphere | in-process | `/api/recourse/pathosphere/*` |

These cover **UMOE, OncoForesight, Overlay-Chemlab, BioSim, KG, folding,
integrity, orchestrator, scientific-API, Prometheus, Pathosphere** — already
connected.

### 1b. Aggregated BY Overlay Oncology (route through it, no new bridge)

These subsystems already live in Overlay Oncology's `lib/` and are reached via
its API routes. Recourse reaches them by extending `oncologyEngineBridge` /
the oncology proxy, not by building per-subsystem clients.

| Subsystem | Aggregator evidence in oncology | Oncology route to call |
|---|---|---|
| Decon (TME deconvolution) | `decon-cure-bridge`, `real-tcga-benchmark.enrichWithRealDeconvolution`, `multi-engine-pipeline.runDeconvolution` | `/api/simulate`, `/api/predict`, `/api/validation/*` (immune context) |
| QLCCE (quantum/log-periodic) | `multi-engine-pipeline`, `consolidated-report` | `/api/simulate`, `/api/research/*` |
| ATTEC (degrader design) | `attec-bridge` (map to ODE params) | `/api/simulate` |
| ctDNA / MRD | `ctdna-integration` (OncoForesight MRD → Oncograph) | `/api/predict`, `/api/simulate` |
| Oncograph (clonal ODE) | `oncology-ecosystem-e2e`, `multi-engine-pipeline` | `/api/simulate`, `/api/predict` |
| OncoForesight (already direct) | `predictMechanisms`, `ctdna-integration` | `/api/predict`, `/api/remission`, `/api/resistance`, `/api/toxicity` |
| daraxonrasib (mevalonate) | `multi-engine-pipeline`, `oncology-ecosystem-e2e`, `local-model-research-scenario` | `/api/simulate`, `/api/research/*` |
| HelixForge (provenance/hypotheses) | `multi-engine-pipeline`, `oncology-ecosystem-e2e` | `/api/discovery/*`, `/api/evidence/*` |
| EvidenceHub / literature | `evidence/evidence-hub` | `/api/evidence/*`, `/api/vector/*` |

### 1c. Standalone producers NOT surfaced by oncology → direct-wire candidates

Only wire these if (a) high value to Recourse's loop AND (b) the service is
actually runnable. Gate availability at every call.

| Subsystem | Produces | Decision |
|---|---|---|
| Meta-Map (metastasis / digital twin) | metastasis simulations, organotropism, digital-twin forecasts | **Direct** (high value, standalone `server.ts`) |
| Decon (if run standalone) | cell-type fractions, immune contexture | **Direct if needed**; else via oncology (1b) |
| HelixForge (if run standalone) | provenance-graph artifacts, ranked hypotheses | **Direct if needed**; else via oncology (1b) |
| CureForge (deterministic verifier) | verified function executions + fuzz evidence | **Defer** — Recourse already has its own sandbox verifier + lint; duplicative |
| AlphaFold / AlphaFold3 | protein 3D structures | **Defer** — needs Google weights + offline DB; not running |
| AlphaGenome | DNA regulatory / variant-effect | **Defer** — cloud API key required |
| SciForge-Platform | unified API gateway + synergy | **Optional alternate host** — could aggregate instead of direct |

### 1d. Defer / non-actionable (honest)

| Subsystem | Why deferred |
|---|---|
| `ctDNA/` folder | empty — archived workspace tarball, no consumable content |
| `kalker/` | generic Rust math engine, not oncology-specific |
| OncoSIM (`2 new systems/oncosim`) | dashboard/UI + LLM assistant; consumed by oncology, not a producer API to bridge |
| AncestralMT / `Tum/` | ancestry-gap + PCGR analytics; reachable via oncology, low current priority |
| Biocomposable, Cellular-Map | scaffolding; low value to Recourse's loop today |
| Overlay-QLCCE standalone | covered via oncology (1b) |

---

## 2. Current live state (probed today)

| Service | Status |
|---|---|
| Overlay Oncology (:3000) | **UP** (custom tsx server) |
| KG (:8500), PDF (:8600), BioSim (:8503), brain (:3210) | **UP** |
| UMOE (:8723), scientific (:8090), integrity (:8025), orchestrator (:8099), folding (:8000), Prometheus (:3001), RepoRank (:3200), Grader (:3201) | **DOWN** |
| Most component subsystems (Decon, MetaMap, HelixForge, QLCCE, ATTEC standalone, etc.) | **NOT RUNNING** as separate processes |

---

## 3. Execution plan (phased)

### Phase 1 — Extend the oncology bridge (route through the host) — ✅ DONE (verified live 2026-09-07)
- **Correction found during execution:** Overlay Oncology actually runs on
  **:3070** (pm2 "overlay-oncology"); port 3000 is Keywire's SPA. The bridge
  default was already :3070; `.env.example` now documents this.
- Added to `src/lib/oncologyEngineBridge.ts` (one client, contracts verified
  against each route's source): `oncologyHealth`, `oncologyCalibrationState`,
  `oncologyCalibrationDatasets`, `oncologyValidationScorecard`,
  `oncologyValidationMatrix`, `oncologyDiscoveryScreen`,
  `oncologyDiscoveryLedger`, `oncologyEvidence`, `oncologyResearchUnified`,
  `oncologyResearchPipeline`, `oncologyMechanismFusion`, `oncologyPredict`.
- Added 12 proxy routes under `/api/recourse/oncology/*` + zod contracts
  (`oncology*Req` in `src/lib/contracts.ts`).
- **Live verification against the real host:** calibration/state returns real
  CCLE provenance (medianIc50 11.84, n=392, dataHash); evidence lists the 8
  real cohorts (BRCA/GBM/HNSC/KIRC/LIHC/LUAD/METABRIC/PAAD);
  mechanism-fusion returns 5 registered mechanisms + 10 alignments;
  research/unified and discovery/ledger respond; `predict` honestly surfaces
  the upstream 422 (measured features + provenance required).
- **Upstream issue found (honest):** `POST /api/discovery/screen` HANGS on the
  oncology host (>45s, its `screeningContext()` event-DB/Redis call blocks
  with no timeout). Recourse's bridge reports `timed out after 30000ms`
  instead of hanging or fabricating. Fix belongs in Overlay Oncology.
- Tests: `tests/oncologyAggregateBridge.test.ts` 10/10; typecheck clean.
- Add to `src/lib/oncologyEngineBridge.ts` (or a sibling `oncologyAggregateBridge.ts`):
  - `oncologyPredict(patient)` → `POST /api/predict`
  - `oncologySimulateV2(body)` → `POST /api/simulate`
  - `oncologyDiscovery(...)` → `/api/discovery/*`
  - `oncologyEvidence(...)` → `/api/evidence/*`
  - `oncologyResearch(...)` → `/api/research/{pipeline,synthesis,unified}`
  - `oncologyValidation(...)` → `/api/validation/*`
  - `oncologyCalibration(...)` → `/api/calibration/*`
  - `oncologyMechanismFusion()` → `/api/mechanism-fusion`
- Add proxy routes under `/api/recourse/oncology/*` in `server.ts` (same
  timeout + `ok:false` honesty as existing routes).
- Add zod input contracts in `src/lib/contracts.ts`.
- This makes Decon/QLCCE/ATTEC/ctDNA/Oncograph/HelixForge/daraxonrasib
  reachable through ONE bridge.

### Phase 2 — Direct-wire the standalone high-value set
- `metaMapBridge.ts` + `/api/recourse/meta-map/*` (metastasis/digital twin).
- `deconBridge.ts` + `/api/recourse/decon/*` (immune deconvolution) — only if
  not adequately covered via Phase 1.
- Register each new bridge in the dev/audit status surface so operators see
  live online/offline honestly.

### Phase 3 — Feed into the science/self-repair loop — ✅ DONE (verified live 2026-09-07)
- `scienceConductor.buildOncologyEvidenceSources()` pulls real oncology outputs
  (8 cohorts, up to 5 mechanism DAGs, CCLE calibration, discovery ledger) into
  the researcher's evidence corpus. Availability-gated: a failing route is
  skipped with a reason, never fabricated.
- Evidence findings now read "…over grant-registry + prometheus + oncology
  sources". Live cycle confirmed: `enginesUsed` includes `oncology-evidence`;
  the persister-dormancy hypothesis honestly scored 0.02 overlap (below the
  0.6 binding threshold) over 10 grant/prometheus/oncology sources.
- `GET /api/recourse/oncology/systems` — one dashboard probing all 10 oncology
  bridges (real probes: oncology :3070 + biosim + kg online; umoe/folding/
  scientific/integrity/orchestrator down; foresight/chemlab correctly flag the
  `<!doctype html>` collision from their :3000 defaults).
- Self-repair loop gained a `service` signal kind + `oncology:host` stuck-signal
  (flagged when the aggregate host is unreachable while a consuming loop runs).
- Tests: 40/40 across five suites; typecheck clean.

### Phase 4 — Validate + document
- Add unit tests for each new bridge (mock fetch, assert `ok:false` on
  non-2xx / timeout / invalid JSON, per repo convention).
- Update `.env.example` with new `*_URL` entries.
- Update `docs/` with the coverage map.

---

## 4. Honest constraints
- **Do not build 20 bridges.** Route through Overlay Oncology first; direct-wire
  only what it does not surface.
- Many subsystems are scaffolds or not running; a bridge is only "wired" when a
  real call returns real data. Downtime is reported, never faked.
- AlphaFold/AlphaGenome need external weights/keys — out of scope unless the
  operator provisions them.
- The reverse bridge (`oncology → /api/recourse/bridge`) already exists; this
  plan closes the Recourse → oncology direction.