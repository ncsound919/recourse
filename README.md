# Recourse

Autonomous self-developing architectural OS experiment: template-driven
component building, self-healing code repair, a recursive learner with
property-based gene evaluation, and a registry whose every promoted version
has a real sandboxed test suite behind it.

## Run locally

1. `npm install`
2. Copy `.env.example` to `.env` and set `MODEL_BASE_URL` and `MODEL_NAME`.
3. Start your model server. Prerequisites: Node.js 18+, and (for generative
   features) any OpenAI-compatible model server — Ollama is the default target.
   Set `MODEL_NAME` in `.env` to whichever model you have pulled (the default in
   `.env.example` is `qwen3.8-4b-distill:q4_k_m`); leave
   `MODEL_BASE_URL="http://localhost:11434/v1"` for a local Ollama.
4. `npm run dev` → http://localhost:3000

## What is real (and what is not)

This codebase was originally a demo with mocked "autonomous" behavior. It has
been partially de-theatred. Current ground rules:

- Every verifier executes the actual code under test in an isolated sandbox.
  No fixture constants are injected, so a test referencing an undeclared
  symbol fails. A promotion means the code's own test suite ran green.
- Every tool version stores the test suite that verified it. At boot the live
  (current) version of each tool is re-verified for real.
- Generators (evolve / mutate / chat) go through the configured OpenAI-
  compatible provider. When the model is offline the app says "offline" —
  it never falls back to canned text pretending to be AI.
- Repair only counts as healed after the patched code passes the verifier.
- The recursive learner scores genes with real property-based tests
  (fast-check), folds real system outcomes into its state, and persists to a
  JSON ledger that replays bit-for-bit.
- The dreaming engine and the subagent swarm are driven by the configured local
  model (e.g. Qwen3.5-4B). Dream REM cycles ask the model for a hypothesis with
  real code + tests; those thoughts only promote after the code passes the
  sandbox. Subagent tasks are queued and worked by the same model — a task only
  completes when the produced code passes the verifier, at which point the tool
  is registered with its suite. Model offline => thoughts/tasks are honestly
  marked rule-based/queued, never fabricated.
- The GitHub Research tab talks to the real GitHub REST API: live repo search,
  real file fetch, and registration as an UNVERIFIED pending candidate (parse +
  security scan + oxlint reported honestly; imported code is never
  auto-promoted).
- A real open-source lint gate (oxlint) runs on code-domain candidates before
  promotion; `eval`/`debugger`/`const`-reassignment/unreachable code blocks
  promotion when the linter is installed.
- A Local Model Manager (Ollama view) drives the real `ollama pull` CLI so you
  can fetch a model such as `hf.co/Qwen/Qwen3.5-4B` from inside the app.
- Templates are registered through a plugin API
  (`registerComponentTemplatePlugin` in `src/lib/templatePlugin.ts`). Code
  templates declare a `selfHost` descriptor, so a build that passes its real
  test suite + the oxlint gate can be **self-hosted**: its code is written to
  `.selfhosted/tools/<name>.mjs`, dynamically imported by the running server,
  and callable through `/api/recourse/selfhosted/<name>/execute`. At boot every
  self-hosted module is re-verified for real (fresh import + stored suite
  re-run). This is the dogfood loop — Recourse runs modules it built from its
  own templates (see the "SELF-HOSTED TOOLS" tab in the Structural Forge).
- A template plugin can be added as a single standalone module — see
  `src/lib/templatePlugins/bloomFilter.ts` for the pattern used by a
  third-party-style add-on.

Honest limits of self-hosting:

- Only templates that declare a `selfHost` descriptor can self-host; others
  still register as sandbox-only genes, and self-hosted tools only expose the
  plugin-declared method whitelist (unknown methods are rejected).
- Stateful self-hosted tools (e.g. the LRU cache) keep one module-level
  instance across calls until the server restarts.
- Self-hosted modules are self-contained logic — they do not yet generate UI
  views.

Known remaining theater (not yet replaced):

- Biotech knowledge-graph checks validate internal consistency only; they
  cannot fact-check clinical literature.
- The recursive-math "five formulas" panels describe abstract math in physical
  language; they are derived numerics, not physical measurements.

## Python sidecars (optional)

Three small, **stateless** Python HTTP services Recourse calls like any other
external source (arXiv, GitHub). Each receives its data in the request and
returns real computation over that data — never a fabricated result. None owns
a copy of Recourse state, so nothing drifts. If a sidecar is down its status
route reports `online:false` and analysis routes return `ok:false`.

Python never runs inside the isolated-vm sandbox; these are plain HTTP
services. Note the README's "known remaining theater" for the KG: NetworkX
reasons over the *internal* target/biomarker network but still does not
fact-check clinical literature — the PDF sidecar's real full-text extraction is
the step toward closing that, but the wiring to fetch/scan papers is not yet
hooked into the verifier.

### NetworkX Knowledge-Graph sidecar (`python/kg_service`, port 8500)

Real graph analytics over the oncology KG — the shallow rule checks in the TS
verifier never did this math. `GET /health`, `POST /kg/centrality`,
`POST /kg/neighborhood?target=<id>`, `POST /kg/bridges?from_id=<id>&to_id=<id>`.
Configured via `KG_SIDECAR_URL`; client `src/lib/kgSidecarClient.ts`.

### PDF / paper extractor (`python/pdf_service`, port 8600)

Real PyMuPDF full-text extraction over a paper URL or bytes — the piece that
turns the arXiv metadata-only intake into something the KG could actually read.
`GET /health`, `POST /pdf/url {url}`, `POST /pdf/bytes {data_base64, filename?}`.
Honest: a scanned/image-only PDF reports `scanned_only_image_pdf:true` with
empty text — never invented prose. Configured via `PDF_SIDECAR_URL`; client
`src/lib/pdfSidecarClient.ts`.

### Fuzzy dedup (`python/fuzz_service`, port 8700)

Real RapidFuzz near-duplicate detection for registry tool names / GitHub
UNVERIFIED candidates / learner genes, where exact matching misses
near-duplicates. `GET /health`, `POST /fuzz/match {needle, candidates}`,
`POST /fuzz/dedup {names}` (group near-duplicates, reports real `dedup_savings`).
Configured via `FUZZ_SIDECAR_URL`; client `src/lib/fuzzSidecarClient.ts`.

### Data Visualizer (`python/viz_service`, port 8505)

Renders a curated subset of the `Data_Visualization-main` teaching repo
(~350 matplotlib/plotly math-physics-statistics scripts) as real PNG artifacts.
Not all 350 are hosted: most are near-duplicate variants, several need
interactive-only APIs (ipywidgets/`plt.show()`/plotly animations), and some are
outright broken (undefined symbols, `np.math.comb`). The 12 curated scenes are
faithful ports, each documenting its SOURCE file and `adapted:true` where a bug
was fixed or an interactive backend was replaced by the Agg capture. Endpoints:
`GET /health`, `GET /viz/catalog`, `POST /viz/render {id, width?, height?,
params?}` → base64 PNG + derived metrics. Configured via `VIZ_SIDECAR_URL`;
client `src/lib/vizSidecarClient.ts`; proxy routes under `/api/recourse/viz/*`.

Honest scope: these are fixed teaching scenarios (each hardcodes its own
data/formula) — they are not yet parameterized "visualize Recourse's data"
endpoints. That is a separate, future capability.

```bash
# one terminal per service
cd python/kg_service  && pip install -r requirements.txt && uvicorn main:app --host 127.0.0.1 --port 8500
cd python/pdf_service && pip install -r requirements.txt && uvicorn main:app --host 127.0.0.1 --port 8600
cd python/fuzz_service && pip install -r requirements.txt && uvicorn main:app --host 127.0.0.1 --port 8700
cd python/viz_service && pip install -r requirements.txt && uvicorn main:app --host 127.0.0.1 --port 8505
```

Recourse proxy routes live under `/api/recourse/kg/sidecar*`,
`/api/recourse/pdf/*` and `/api/recourse/fuzz/*` in `server.ts`.

## JS hardening & input contracts

- **helmet** — HTTP security headers always on; full Content-Security-Policy in
  production (the built app loads scripts/styles from `'self'`, no inline
  scripts), relaxed in dev so Vite HMR works.
- **express-rate-limit** — configurable limiter over `/api/`. Default is
  generous so Recourse's own in-process loops (they call engines directly, not
  self-HTTP) are never throttled. Tune via `RECOURSE_RATE_LIMIT_MAX` /
  `RECOURSE_RATE_LIMIT_WINDOW_MS`; set max `0` to disable.
- **zod** — input contracts in `src/lib/contracts.ts`, applied at the highest-risk
  boundaries: the six sidecar routes and the biotech claim payload on
  `/api/recourse/verify` (which now rejects out-of-range tiers and unknown keys
  before the engine runs). Honest scope: it is not (yet) a retrofit of every one
  of the ~22 hand-rolled `JSON.parse` sites.
- **clsx** — used only at the genuinely composite nested-ternary className sites
  (2 conversions). Not adopted codebase-wide: Recourse's existing
  `className` style is clean ternaries + data-driven tokens, so a 2,451-site
  mechanical rewrite was judged cosmetic churn with regression risk and not done.

## Fleet integration (Axiom / OpenHub)

Recourse is wired into the Axiom Agent and OpenHub as a two-way self-learning
peer, not just a tool source.

- **Fleet memory intake** — `POST /api/recourse/fleet/memory` lets external
  agent loops (Axiom, OpenHub, Draymond) write real outcomes into Recourse's
  durable vector memory. Guarded fail-closed (`RECOURSE_API_SECRET`); the pure
  normalizer is `src/lib/fleetMemory.ts`. This is what makes the loop
  bidirectional: Axiom posts every project-loop outcome here, so Recourse
  self-learns across the fleet.
- **Axiom bridge** — `src/lib/axiomBridge.ts` builds/verifies/self-hosts tools
  via Axiom (`integrateAxiomTool`), reports bridge health (`axiomBridgeStatus`),
  and hands Recourse's weak findings to Axiom to run a real repair project loop
  (`dispatchAxiomRepair`, exposed as `POST /api/recourse/develop/axiom`).
  Outbound calls present `AXIOM_API_TOKEN` or mint a JWT from the Keywire
  `jwtSecret` (or the legacy `AXIOM_KEYS_FILE`); with neither they are honest
  unauthenticated calls. Axiom only ever writes patches that clear its own
  gates, and Recourse only applies fleet patches through its verified
  patch-intake gate.
- **OpenHub** proxies Recourse's status, synergy, registry, forge, learner and
  provenance surface under `/api/recourse/*` and folds recalls into skill
  matching.

## Checks

- `npm run lint` — typecheck
- `npm test` — vitest suite (includes the honest-sandbox contract tests)

## Cross-domain synergy engine (deterministic core)

`src/lib/synergy/` maps transferable structure across the sectors this instance
works in (health/oncology, mathematics, cybersecurity, neuro/music, aging,
sports, logistics). It is a **closed-discovery** engine: A = method, C = problem,
B = a shared controlled-vocabulary term.

Honesty contract:

- Only pure functions are indexed as methods. Sources that call `Date.now()`,
  `new Date()`, `Math.random()`, `performance.now()`, or `crypto.random*` are
  rejected with a reason (see `methodIndex.detectNonDeterminism`). Example:
  Truck Buddy's `deriveStatus`/`dossierVerdict` are indexed; `buildDossier` is not.
- Bridges are only controlled-vocabulary terms, never free text. An unknown
  term is rejected at the `semantic_type` gate.
- Missing evidence is excluded, never imputed; a pair with no passing bridge is
  dropped.
- Every scan carries a `manifestHash` over its version, vocabulary fingerprint,
  resolved options, canonical doc ids, and candidates, so re-runs are diffable
  bit-for-bit and config changes are visible.
- Candidate scores are **calibration**, not measured properties. Scoring
  constants live in `closedDiscovery.SYNERGY_CALIBRATION`.
- A candidate is a **hypothesis**, not a discovery. Promotion to a resolved
  edge requires execution verification (Plan 4, admission gate).
- The store distinguishes an absent map from a corrupt one: corrupt content is
  surfaced as a structured error, never silently treated as "no data".

Routes (mounted under `/api/recourse`):
`GET /synergy/domains`, `GET /synergy/map`, `GET /synergy/candidates`,
`GET /synergy/score/:domain`, `POST /synergy/scan`,
`POST /synergy/resolve`.

Resolver + admission gate (Plan 4):

`POST /api/recourse/synergy/resolve` runs a candidate's `acceptanceTest` against
an adaptation's `sourceCode` in the existing sandbox and admits
`hypothesis → reproduced` only on an admissible proof (`executable_test`). The
model may draft `sourceCode`, but only execution sets status. Oracle, formal, and
human-signoff proof types are declared but not yet automated; only
`executable_test` is wired.

Adaptations are otherwise caller-supplied: the deterministic CBR operator-ladder
adaptation is not yet implemented.

AI adapter drafting (Plan 5): `src/lib/synergy/aiAdapter.ts` may ask the model to
draft an adaptation (`createModelDrafter`), but only the resolver's execution
sets status — `attemptTransfer` runs the acceptance test and admits solely on the
result. Offline drafting is reported honestly (`{ ok: false, offline: true }`)
and never fabricates source. `createModelDrafter` is untested (it makes a
network call); tests exercise the injected `Drafter` seam with no network.

Decision-engine rewire (Plan 5): `crossDomainSynergy` in `decisionEngine.ts` is
now sourced from the real synergy map (build the per-domain record with
`domainScoresFromMap`) and the hardcoded `0.4/0.3/0.5/0.85/0.95` constants are
removed. The new argument defaults to `{}`, so callers that omit it get an
honest `0` rather than a fabricated constant.

Decision-engine bridge (Plan 6): `src/lib/synergy/decisionBridge.ts` reads the
persisted map (`readSynergyMap`, fail-soft) and maps sector scores onto
`ToolDomain`s (a sector may map to several; merged by max). The
`/api/recourse/decision/evaluate`, `/weights`, and `/execute` routes in
`server.ts` now pass that record into `evaluateGrowthDecision`, so the Plan-5
seam is live rather than inert. Responses carry
`synergy: { source: 'map' | 'none', manifestHash? }`, which the UI displays;
`source: 'none'` means no map was read and the factor is honestly `0`. Non-UI
callers can fetch the same record from
`POST /api/recourse/synergy/decision-inputs`.

Deferred to later plans: SME structural alignment wiring, corrected statistics
(stationarity, Granger/transfer entropy, FDR), and a deterministic CBR
operator-ladder adapter.

Known Plan-1 limitations (honest, not yet fixed):

- Three filter gates are effectively inert in the real pipeline: `cross_domain`
  is pre-empted by the same-domain skip, `semantic_type` always passes because
  only controlled-vocabulary terms become bridges, and `evidence` always passes
  at the default `minDocsPerLeg: 1`. Only `generalness` and `novelty` can reject
  a real candidate today.
- Evidence uses global document frequency, not per-leg support; the spec's
  `minDocsPerLeg: 2` default is not yet in force.
- A scan manifest receipts candidates by `id:score:top-terms` only; it does not
  cover bridge weights, `support`, `prediction`, or `filters`.
- Small corpora (one method + one problem) yield zero candidates because the
  only shared bridge is over-general (`df == docCount`).

Known Plan-2 limitations (honest, not yet fixed):

- Alignment is **fail-closed**: it is only computed when both the method and
  problem carry relations flagged `relationBasis: 'declared'`. The internal
  method/problem indexes currently derive relations from primitives and flag
  them `'placeholder'`, so production candidates carry no `alignment`/
  `farTransfer` yet. The SME path is exercised by tests that declare real
  relations; a real relational source is still required to turn it on.
- `gmapWeight` normalization is approximate (calibration constants, not
  measured), and `sme` does not enforce full separate-gmap parallel
  connectivity across the chosen match set. Candidate `inferences` are coverage
  flags (base relations whose arguments all mapped), not true target-side
  projections. MAC/FAC (`macFac.ts`) is implemented and unit-tested but is not
  yet wired into `discover`.

Cross-domain significance now uses the Fisher-z test (requires n>3) with Benjamini–Hochberg FDR across the scan; the old `|r|>=0.5` rule is removed. Granger causality and transfer entropy are not yet wired, and no utility for them exists yet; forced stationarity differencing is also not wired (`needsDifferencing`/`difference` are implemented in `stats.ts`).
