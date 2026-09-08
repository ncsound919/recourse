# Recourse & Overlay Oncology — System Brief for Media Generation

> Source document for NotebookLM. This brief is accurate as of 2026-09-07. Every
> claim here traces to a real engine, provider, or dataset in the codebase —
> nothing is fabricated. Model-derived results are labeled as such; only an
> explicitly supplied IC50 fit is marked "calibrated."

---

## 1. What these systems are

**Overlay Oncology** is an in-silico oncology research platform (Next.js monorepo under
`02_Pillars/Overlay Science/Overlay Oncology`). It is explicitly NOT a clinical platform
and performs no wet-lab work, no clinical decisions, and no patient care. It pairs
deterministic science engines with real-data validation.

**Recourse** is an autonomous self-developing architectural OS (TypeScript server). It
builds, verifies, and self-hosts its own tools; every promoted version has a real
sandboxed test suite. Over the past sessions, Recourse became the host for a
**closed-loop falsification pipeline** that Overlay Oncology's engines feed.

Together they implement the program: **live evidence → synthesized kinetics →
dosing falsification → standards-valid exports → cryptographic evidence dossier.**

---

## 2. The pipeline, stage by stage

### Stage 1 — Live Evidence Graph (Open Targets + PubTator 3.0)
- Recourse queries the **Open Targets Platform** GraphQL API (no key) for
  target-disease associations with real scores (e.g. EGFR 0.888, KRAS 0.834 for
  non-small cell lung carcinoma) and drug tractability labels.
- Recourse queries **PubTator 3.0** (NCBI) for annotated cancer literature and parses
  `@GENE_`, `@DISEASE_`, `@CHEMICAL_` entity tags into gene–disease co-occurrence edges
  with real PMIDs.
- Both feed a provenance-tagged knowledge graph merged with a canonical curated layer.
  A provider that is down contributes nothing and is reported `ok:false` — never
  fabricated.

### Stage 2 — Evidence-to-ODE Kinetic Synthesizer
- Maps the live evidence into a concrete `OdeSimulationParams` bundle accepted verbatim
  by Overlay Oncology's `solveOdeTumorImmuneSystem` engine.
- Every parameter is tagged with an origin: `evidence-derived`, `literature-prior`,
  `canonical`, or `calibrated`. `confidence` is an explicit heuristic label (0..1), not a
  statistical posterior.
- Example real output (2026-09-07): resistance co-occurrence signal 0.60 (KRAS, EGFR,
  ERBB2) raised `growthRate_R` to 0.182, lowered `drugKill_R` to 0.051 (resistant
  subclone killed less), and raised `mutationRate_mu` to 0.004.

### Stage 3 — Combinatorial Adaptive Dosing Optimizer
- Sweeps 4 therapy modes × dose levels (continuous MTD, adaptive pulsed, metronomic,
  awaken-senescence), runs the deterministic ODE per arm, and ranks arms by cure
  reachability → final volume → toxicity.
- Computes a seeded subclone-extinction probability (ensemble fraction over mutation-rate
  × resistant-seed perturbations).
- **Honest negative result** (2026-09-07): with resistance signal 0.60, the best arm
  (continuous_mtd@4) still ends at resistant fraction ~1.0 — "evolutionary escape,
  curative spec not reachable." The engine reports containment-only rather than a
  fabricated cure. This negative verdict is a valid, published finding.

### Stage 4 — Standards Interop + Cryptographic Evidence Dossier
- **SBML Level 3 export**: the ODE model serialized to standards-compliant SBML with
  content MathML, validated round-trip by **libSBML 5.21.1** (the parser COPASI,
  BioModels, and libRoadRunner use). 7 species, 15 parameters, 7 reactions.
- **PhysiCell XML export**: the same evidence-synthesized parameters carried into a
  cell-scale simulator config (2 cell definitions, 15 parameters).
- **Evidence dossier**: a SHA-256 hash chain over every stage
  (live_graph → ode_params → dosing_optimization → sbml_export → physicell_export).
  Each stage commits to the previous; tampering is detectable by re-hashing. The
  dossier collects real DOIs/PMIDs referenced by the graph and emits falsifiable,
  scope-tagged statements. A dossier makes claims verifiable, not true.

---

## 3. Real-data validation (Overlay Oncology)

- Live cBioPortal API ingestion for CCLE IC50 and TCGA survival cohorts.
- Real fitted Cox / elastic-net models with Harrell and Uno IPCW C-indices.
- Published results in `reports/`, including negative ones (e.g. pooled model ≥0.60 Uno
  C on 3/8 held-out cohorts; the honest read: "the headline C is largely clinical
  signal, not biology").
- Engine outputs pinned by an engine-registry lockfile with a CI drift gate.

---

## 4. Differentiation vs. the field

| Category | Industry tools | What this stack adds |
|---|---|---|
| Static knowledge graphs | Open Targets, PrimeKG, PubTator | **Dynamic projection**: associations become ODE parameters with confidence |
| Isolated simulators | PhysiCell, COPASI, Simcyp | **Auto-parametrization from live evidence**; SBML/PhysiCell exports |
| Black-box AI | Tempus, Insilico, Recursion | **Mechanistic falsification**: cure-reachability is computed, and can be negative |

The positioning: *evidence-grounded dynamic simulation with verifiable provenance* —
distinct from static KGs, isolated simulators, and black-box AI.

---

## 5. Marketing & strategy outputs (from the deterministic agent teams)

- **Marketing Pulse** (2026-09-07): the brand-voice guard flagged a hype post for
  "guaranteed / 6 figures / revolutionary cure / perfect accuracy", a clinical-claim
  post for "cures / 10x better", and both for LinkedIn missing required links. A
  compliant post passed the forbidden-term checks. Corpus: 15 merged rules across
  Overlay365 + a new Recourse/Oncology brand corpus.
- **Strategist venture scan**: cross-silo signal "open-targets × pubtator" → monetize
  the live-evidence-graph in the service lane (new-purpose score 90, low risk).
- **Strategist clustering**: "the evidence dossier is the moat" cluster (fb1/fb7/fb8),
  frequency 2 (25% of period), score 48, roadmap recommendation issued.

---

## 6. Honest scope (what these systems do NOT do)

- No wet-lab work, no clinical decisions, no patient care, no cures claimed.
- IC50 values are NOT calibrated unless an explicit fit is supplied.
- Growth/kill/mutation rates are synthesis rules bounded to plausible ranges — NOT
  fitted to patient data.
- SBML kinetic laws use the continuous-MTD dose term and unclamped logistic (SBML
  Level 3 core has no max(0,.)); mode-specific dosing is documented in model notes.
- The PhysiCell XML is validated as well-formed XML but not yet round-tripped through a
  real PhysiCell build (toolchain not installed here).