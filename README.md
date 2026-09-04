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

```bash
# one terminal per service
cd python/kg_service  && pip install -r requirements.txt && uvicorn main:app --host 127.0.0.1 --port 8500
cd python/pdf_service && pip install -r requirements.txt && uvicorn main:app --host 127.0.0.1 --port 8600
cd python/fuzz_service && pip install -r requirements.txt && uvicorn main:app --host 127.0.0.1 --port 8700
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

## Checks

- `npm run lint` — typecheck
- `npm test` — vitest suite (includes the honest-sandbox contract tests)
