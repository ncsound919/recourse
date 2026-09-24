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

Harness: `scripts/route-snapshot.mjs` + `tests/fixtures/route-snapshot.json` +
`tests/routeSnapshot.test.ts` guard the full 496-route table against drift.

As of `develop`: `server.ts` is ~10.5k lines, 41 routers, 108 inline routes.

## Remaining clusters (in descending value, roughly)

| Cluster | Approx. routes | Notes / likely deps to inject |
| --- | --- | --- |
| `forge.ts` | 8 | `forgeSnapshot`, `runForgeCycle`, `mintForgeSpecFromLearnerPlan`, `forgeAutopilotOn` |
| `openEnded.ts` | 8 | open-ended archive state, `runOpenEndedEngineCycle`, `fleetRecursion` |
| `repair.ts` | 5 | `executeSelfRepair`, anomaly state, `haltAllAutonomousLoops` |
| `policy.ts` | 6 | `status`, `autonomySettings`, `applyPromotionPolicy`, `haltAllAutonomousLoops` |
| `dream.ts` | 4 | `dreamEngine`, `dreamState`, crystallize/mirror helpers |
| `mutate.ts` | 4 | `geneRegistryStore`, mutator helpers |
| `decision.ts` | 7 | `registry`, `anomalies`, `growthWeights`, JEV client |
| `templates.ts` | 4 | component templates + generation ledger |
| `learn.ts` | 6 | learner, crossover/verify/evolve helpers |
| `readout.ts` / `metrics` / core | ~10 | `verifyChainIntegrity`, `buildUpgradeReport`, `telemetryAuthorized` |
| A2A / MCP / openapi / replay | ~7 | `a2aBaseUrl`, `internalApiCall`, `buildA2aOperations` |

The A2A/MCP block is intentionally coupled to `internalApiCall` (same-process
HTTP); extract it last or split that helper first.
