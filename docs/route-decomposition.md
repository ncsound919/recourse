# Server decomposition tracker

`server.ts` is an Express monolith being split incrementally into
`src/routes/*` routers. This file tracks progress and the established pattern.

## Pattern (follow this exactly)

1. Create `src/routes/<domain>.ts` exporting `create<Domain>Router(deps): Router`.
2. The router imports **pure** lib modules directly and receives **host-owned
   mutable state / side-effecting operations** via a typed `deps` object.
   - Later-declared module `let`/`const` must be read through a **getter**
     (`() => SOME_FLAG`) or callback, never read at factory-call time (TDZ).
   - Keep `appendProvenanceEvent`, `saveStateToDisk`, autopilot flags, and
     singleton engines host-side and inject closures.
3. In `server.ts`, replace the inline routes with
   `app.use('<mount>', create<Domain>Router({ ... }));` **at the same position**
   (preserves Express registration order / first-match behavior).
4. Add the import; remove now-dead imports (run `npx oxlint server.ts <router>`).
5. Verify:
   ```sh
   npm run typecheck
   node scripts/route-snapshot.mjs --check tests/fixtures/route-snapshot.json
   npx vitest run routeSnapshot
   npx vitest run <domain or Router>
   ```
6. If you used a script to bulk-delete server.ts lines, **restore CRLF** (the
   file is tracked with CRLF) before committing, or the diff becomes whole-file.

## Done (extracted, verified)

| Router | Domain |
| --- | --- |
| `src/routes/research.ts` | science conductor, Global Lens, math conductor, agenda, gamification, fleet dashboard |
| `src/routes/orchestration.ts` | subsystem orchestration, issues, research reports |
| `src/routes/musicTherapy.ts` | music sector + music-therapy research/evidence feed |
| `src/routes/memory.ts` | vector memory, tiered memory, fleet memory/signal |
| `src/routes/lego.ts` | LEGO composable-ML state/assemble/execute/route |
| `src/routes/intake.ts` | external intake (poll/brain/ground/autopilot) + benchmark |
| `src/routes/corpus.ts` | ecosystem corpus + local cancer library (datasets/PDFs/literature KG) |
| `src/routes/skills.ts` | skill catalog + Phase-4 skill export/import |
| `src/routes/develop.ts` | stuck-issue loop, repair-team report/deep/intake, brain/council, patch gate, autopilot toggle, patch ledger |
| `src/routes/forge.ts` | forge snapshot/plan/mint/run + autopilot toggle |
| `src/routes/openEnded.ts` | QD archive view, open-ended snapshot/run/archive/hygiene/patch, fleet-recursion ledger |
| `src/routes/repair.ts` | self-repair status/scan-heal/single/knowledge/auto-heal |
| `src/routes/policy.ts` | promotion policy, toggle-auto, autonomy snapshot/safe-boot/halt (the big `GET /status` readout stays for the core cluster) |
| `src/routes/dream.ts` | dream status/toggle/tick/crystallize/cron |
| `src/routes/mutate.ts` | AI mutator gene status/evolve/approve + mutate-scoped policy |
| `src/routes/decision.ts` | growth decision evaluate/weights/execute + JEV status/public/evaluate/noul/promotion |
| `src/routes/templates.ts` | component template list/detail/build/benchmark |
| `src/routes/learn.ts` | learn/synthesize-directive, crossover, approve, verify, evolve + learn/status\|episode\|run\|replay\|directives |
| `src/routes/readout.ts` | big `GET /status`, provenance, registry, sandbox, failures, benchmark, selfuse, snapshots, legacy-digest, upgrade-report, capabilities, generations, readout (`GET /metrics` stays inline — app-root path) |
| `src/routes/interop.ts` | replay, OpenAPI spec + operation index, agent card, A2A JSON-RPC, remote MCP (mounted at app root — paths span `/api/recourse`, `/api`, `/.well-known`) |
| `src/routes/math.ts` | math conductor: state/step/reset/configure, problems/attempts/goals, solve (pairs with `solveNextMathProblem` hoisted to module level) |
| `src/routes/biotech.ts` | oncology KG drugs, verify-claim, claims |
| `src/routes/axiom.ts` | axiom/status, develop/axiom (repair dispatch), axiom/build-tool |
| `src/routes/providerChat.ts` | provider/chat, `/v1/chat/completions` (OpenAI shim), settings/provider GET/POST (app-root mount — `/v1` + `/api/recourse`) |
| `src/routes/builder.ts` | builder GET, select/propose/step (generator meta-loop; state + `builderSnapshot`/`builderMetaStep` injected) |
| `src/routes/runtimeOps.ts` | hyperparameters, chaos/inject, tick, tick/autopilot/toggle (host state/anomalies/registry + tick loop injected) |
| `src/routes/reports.ts` | report/generate + reports (status, provenance chain, report list injected) |
| `src/routes/github.ts` | github/catalog (live search) + github/import (candidate pipeline injected) |

Harness: `scripts/route-snapshot.mjs` + `tests/fixtures/route-snapshot.json` +
`tests/routeSnapshot.test.ts` guard the full 496-route table against drift.

As of `github`/`reports`: `server.ts` is ~7.9k lines, 60 routers, 4 inline routes.

## Remaining clusters (in descending value, roughly)

All clusters named in this table have been extracted. The 4 inline routes
that remain are grouped by domain but not yet scheduled:

| Group | Approx. routes | Notes |
| --- | --- | --- |
| capabilities/serve, execute, perf, `GET /metrics` | 4 | capability dogfood + app-root paths |
| github catalog/import, report/generate + reports | 4 | provenance/save side effects |
| capabilities/serve, execute, perf, `GET /metrics` | 4 | capability dogfood + app-root paths |
