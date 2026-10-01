# Changelog

All notable changes to Recourse. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); this project aims to be honest
about state, so entries describe what is real and what remains limited.

## Unreleased

### Fixed - orchestration decisions were decided by the host, not the test (2026-10-01)
- `tests/subsystemOrchestrator.test.ts` decided from the machine's real free
  RAM. `orchestrate()` called `sampleResources()` internally, and the test's
  `vi.spyOn(import(...), 'sampleResources')` never took effect (a spy on an ESM
  namespace export is a no-op here), so its intended 8000MB sample was silently
  replaced by whatever the host reported. With 1991MB free the orchestrator
  correctly took its tight tier and stopped `chemlab`, and the "everything is
  online is a no-op" test failed for reasons unrelated to the code.
- `orchestrate()` now takes `opts.resources?: ResourceSample`. That is a real
  seam, not a test affordance: a caller that already sampled the host (or a
  scheduler tick deciding from a snapshot) should not have to re-sample. Tests
  pass memory explicitly, so no Node builtin is mocked and the decision no
  longer depends on machine state.
- The `sampleResources` test is deliberately left unmocked and now asserts
  finiteness on a real host sample - mocking `node:os` would have made it
  tautological, which is the failure mode this whole fix is about.
- Threshold coverage is probed AT each boundary (1200, 2400), not merely either
  side of it, and a caller-supplied-override test pins that the thresholds are
  inputs rather than constants. Verified by deliberately breaking the code:
  removing the `opts.resources` seam fails 3 tests (one reporting the host's
  real 1951MB), and flipping the tight tier's `<` to `<=` fails 2. Before the
  boundary probes were added, that same `<` -> `<=` flip changed nothing and the
  suite stayed green.

### Fixed - main registry re-verified against the real protocol (2026-10-01)
- The dream mirror wrote 1,253 registry entries with `passed_verifier: true` and
  no suite behind it. The suite it did store (`buildRefSuiteFromVectors`) only
  asserts the function exists and "did not throw" - its own comment says the
  gene has no oracle - and boot re-verification runs *any* stored suite and
  marks a tool `healthy` on a pass, so a smoke check was being read as health.
  The mirrored source was also the bare, non-module form the registry
  substance gate refuses.
- `POST /api/recourse/ops/tools/reverify` re-runs the real invariant protocol
  for each gene kind against the tool's own stored source and appends a
  module-form version with a recomputed hash and the actual check results.
  Live result: **1,124 re-verified green (6/6 invariants each), 0 failed, 947
  fabricated claims replaced**, 111 skipped because they carry a real suite that
  boot can re-execute, and 18 reported unverifiable rather than guessed at.
  Latest-version module form went 78 -> 1,202; registry health is unchanged
  (111 healthy) because the pass never claims health it cannot reproduce, and it
  never attaches a suite. Re-running is a no-op (1,124 `skipped-already-current`,
  version count unchanged).
- The identity check matters more than it looks: name-matching alone paired
  tools named `CODI_CYCLOMATIC_*` whose source is a TypeScript `LRUCache` class
  with the cyclomatic protocol, and would have published a verdict for code that
  gene never produced. A tool is only judged when its source declares that kind's
  entrypoint (`geneEntrypointName`); the five mismatched tools are reported, not
  judged, and a tool we cannot judge is not marked degraded either.
- The report separates claims it *withdrew* (replaced with a real verdict) from
  ones it merely *flagged* (16 unverifiable tools still carry an unsupported
  pass on file, and saying "withdrawn" would overstate what the pass did). Detail
  entries are ranked by severity so a capped list cannot hide a failure behind
  1,124 successes.

### Fixed - dream registry re-verified against the real verifier (2026-10-01)
- The 1,136 genes in the dream store were carrying a `verified: true` that
  nothing re-confirmed: `promote()` used to write it as a literal, so a gene
  kept claiming verification forever. 1,132 of them also had no `export` in
  their code and no test vectors, which is why the registry's substance gate
  refused them.
- `POST /api/recourse/dream/reconcile-registry` re-runs every stored gene
  through today's invariant protocol (`verifyGeneSource`, keyed on the gene
  kind's own deterministic vectors, since a stored gene has no GenomeSpec) and
  recomputes the verdict from that run - never from the stored flag. Result on
  the live store: **1,135 re-verified green, 1 withdrawn, 1 unverifiable**; all
  1,136 rewritten to module form and 1,135 given back their test vectors. The
  one withdrawal is the single model-derived gene, which has no stored suite to
  re-run and whose own stored check was already red - its claim is now
  `verified: false` with the reason recorded instead of a green nothing
  backed. A second pass reports 0 downgrades and 0 rewrites.
- The report separates what could be *checked* (`unverifiable`) from how many
  claims were *withdrawn* (`downgraded`), because a claim that cannot even be
  re-checked is still a withdrawal; `failed` keeps the counts additive.
- Two bugs found while building this, both caught by the new tests: the sandbox
  harness could not evaluate module-form source, so a re-run would have
  downgraded exactly the genes it had just fixed (`export` is now stripped
  before evaluation, and both forms verify identically); and the first
  accounting draft hid withdrawn unverifiable claims inside a softer bucket.
- The pass is recorded in provenance (`dream_registry_reconciled`) so a bulk
  re-verdict is auditable rather than a silent edit.

### Fixed - invented metrics and dead counters (2026-10-01)
- **Dream readiness/intensity were dice rolls**: `buildThought` set
  `crystallizationReadiness = 0.5 + rng() * 0.2` for a verified genome and
  `0.25 + rng() * 0.1` otherwise, and `intensity = 0.55 + rng() * 0.4` for
  every thought — a seeded random number presented as a measure of how ready a
  thought was to become a gene. Both are now derived from the sandbox verdict
  (verified: 0.60 readiness / 0.85 intensity; failed: 0.20 + 0.15 x check pass
  rate, with a +0.05 credit for a two-parent hybrid), so the same evidence
  always yields the same number and re-seeding cannot change it. A failed
  verification can never out-score a pass, and the intensity floor stays above
  the 0.45 theorem-induction cutoff so a failing thought is still re-tested
  instead of being starved of recovery. Pruning decay is likewise proportional
  to remaining evidence (0.97 verified, 0.70 unverified) instead of
  `rng()`-driven. Golden values in `dreamEngine` tests were recomputed from the
  real checks, not rubber-stamped.
- **Property-gate shapes were guessed from the export name**: the open-ended
  cycle picked fast-check input shapes with a regex over the problem's
  `functionName` (`/arr|list|chunk|merge/...`), so renaming a problem silently
  changed which invariants were enforced, and a name matching no pattern fed
  numeric samples to an array problem. Shapes now come only from what the
  problem declares — its minted `vectors`, else the sample calls in its own
  acceptance test — and otherwise the property gate is skipped instead of being
  run on fabricated inputs (`src/lib/openEnded/propertyVectors.ts`).
- **Semgrep's 10s screen budget was a silent hole**: a scan killed by the
  timeout was caught and reported as `scanned: false`, which reads like "found
  nothing" rather than "never finished" — and under parallel test load it hit
  routinely (measured 11-16s per scan). The budget is now configurable via
  `SEMGREP_TIMEOUT_MS`, defaults to 30s, is applied to the availability probe
  too, and a timeout is named as a timeout in the reason string.
- **Repair attempts were invisible**: `repairAttempts` / `repairSuccesses` were
  module-level counters nothing read (the success count merely duplicated
  `totalHealedCount`), so "we healed N tools" could never be weighed against
  "we tried N times". `status.selfRepair` now carries `repairAttempts` and
  `unverifiedRepairAttempts` (persisted with the rest of status, so a restart
  cannot reset the denominator), counted through the pure, tested
  `src/lib/repairCounters.ts`, and shown in the self-repair view.

### Fixed - loop integrity gates (2026-10-01)
- Cross-domain synergy is now self-feeding: a scheduled job derives the corpus
  in-process (`selfFeedSynergyScan`) instead of the growth decision engine
  reading `source: 'none'`.
- A transfer candidate whose acceptance test a trivial stub also passes is
  refused (`acceptance_too_weak`), and a suite with zero assertions is reported
  as `[FAIL] No assertions declared` rather than as a green run.
- `/synergy/resolve` runs the operator ladder (`resolveWithLadder`) and records
  honest `operator_ladder` provenance instead of a caller claim.
- Registry health on boot is derived from the stored verification evidence: a
  tool with no verified current version reports `unverified` instead of
  inheriting `healthy`.
- Novelty screening has one implementation — `noveltyVerdict` delegates to
  `src/lib/novelty.ts` — so the open-ended gate and the fleet gates cannot
  disagree about what counts as novel.
- Registry insertions (self-repair, dream, swarm, grounding, forge) go through
  the single `promoteTool` chokepoint.

### Fixed - dream / learn / heal honesty (2026-10-01)
- **Dream**: genes are crystallized in module form (`export function …`), so the
  registry's substance gate accepts them and the dream→registry loop can
  actually deliver genes again (1,132 of 1,133 dream genes were previously
  refused for having no `export`). `promote()` no longer hardcodes
  `verified: true`: `assertionChecks()` maps the real `[PASS]`/`[FAIL]` detail
  lines, promotion requires at least one passing check with none failing, and
  gene tools carry their `testVectors` for downstream verification.
- **Learn**: an ecosystem `externalScore` now *modulates* the per-gene property
  score (`EXTERNAL_REWARD_WEIGHT`) instead of overwriting it, so beliefs keep
  discriminating between genes instead of all copying one number. Loaded state
  is backfilled (`migrateState`) — a saved state predating `forecastWindow`
  threw on its first episode and the learner never advanced again. Directives
  are severity-ranked (retire → refine → synthesize → amplify) before the
  20-directive cap. Replay records each episode's gene set (`input.genes`) and
  reports `partial` / `driftAtEpisode` / `divergedAtEpisode` separately, so an
  incomplete run is never presented as a verified chain.
- **Heal**: `repairVerifications` is restored on boot (it was persisted but
  never read, zeroing the repair stats on every restart). Verification depth is
  explicit (`suite` / `claim` / `smoke`): a smoke-only pass is recorded as an
  attempt — not `healed`, not promoted, no verifier score, no heal counter —
  instead of being opened as an unverifiable "healed" window.

### Fixed - test suite date sensitivity (2026-10-01)
- `fleetDashboard` asserted a non-negative `days left` for the 2026-09-30
  Collatz milestone; the row correctly shows `-1.3` now that the target date
  has passed.

### Changed - dashboard redesign (2026-09-24)
- One design system: `ink` neutrals, one `accent`, and `ok` / `warn` / `bad`
  status colors defined in `src/index.css`; Geist + Geist Mono. The 20 ad-hoc
  Tailwind hue families, glows, gradients, emoji and em-dashes are gone.
- Navigation: the 31-button wrapping tab bar is replaced by a grouped sidebar
  (Evolution, Quality, Research, Reporting, Audio, System) and a Ctrl+K jump
  list. Tab keys and gamepad cycling are unchanged.
- Overview holds the health line, metrics, loop controls and determinism panel;
  other views no longer render ~600px of status chrome above their content.
- Tool genes render as a paged table (the card grid put all 1,246 genes on one
  ~95k px page). Provenance events render as one-line rows.
- Fixed: the hourly reports view read `/api/recourse/reports`, which the
  orchestration router answers with research file names; hourly reports now
  come from `/api/recourse/reports/hourly`.
- The promotion-gate selector moved from the header into the loop controls
  (`LiveEvolutionControl` had destructured its `onPolicyChange` prop under the
  wrong name, so it could only display the policy).
- Removed decorative status that was not backed by data ("+1 cycle",
  "Deterministic OS Core Active" spinner, "Instant" MTTR, marketing footer).

### Security — 2026-09-24 audit
- API guard: path matching is now case-insensitive. Express routes
  case-insensitively, so `POST /API/recourse/...` skipped the guard entirely.
- Self-hosted modules are only `import()`ed into the server realm when the
  source passes the in-process safety screen and the file matches its manifest
  hash; host-capable tools are sandbox-only and verified statically at boot.
- Isolate verifier: bookkeeping moved into a closure and intrinsics captured
  before candidate code runs (a candidate could forge `passed:true`).
- Math acceptance harness: the suite calls a private `const` assert and must
  return a completion sentinel (a candidate `function assert(){}` or top-level
  `return` used to pass wrong answers).
- Sandbox net driver: no redirect following, 15s timeout, 2MB body cap.
- Provenance chain: v2 hashes bind event content (v1 hashed only `prev`) and
  `verifyChainIntegrity` recomputes hashes; legacy events reported as `legacyUnbound`.

### Fixed — 2026-09-24 audit
- Shutdown/crash now flushes the debounced state save; `stateStore.close()`
  no longer drops a pending save; one corrupt kv row no longer discards all state.
- State saves diff per-key SHA-1 digests in memory instead of re-reading the DB.
- Single-flight `runServerTick`, intel pull and swarm pump (lost updates / double runs).
- `runBenchmark`: candidate pre-filter + verdict cache (~85s event-loop stall → ~0.1s).
- Python runner bridges share `jsonLineRunner` (EPIPE crash, unbounded buffers,
  empty-output-as-success).
- Bounded `forgeLedger`, `intelProposals`, Collatz memo; JSONL "recent N" readers tail the file.
- `assert.deepStrictEqual`/`throws` in the assert shim; key-order-independent deep equality.
- Misc: `axiomReachable()` not awaited, `/memory/consolidate` response shape,
  cron day-of-week numbering, Jev key precedence/rotation, Keywire negative caching,
  body parsing after guard + rate limit, tests no longer write into `data/`.
- Boot reconcile no longer parses biotech code genes as JSON claims (190 tools
  were marked degraded on every boot).
- Problem minting rejects acceptance suites that a constant/identity stub passes.
- `strictNullChecks` enabled; fixed the real bugs it exposed (undefined
  `ledgerRoot` in the fitness loop, `artifact`-less findings in Global Lens
  briefs, composer episodes keyed by an undefined seed, `/memory/recall`
  accepting unknown kinds).
- Saved `status` no longer carries the dream/swarm copies (~1.3MB per save).
- Memory drivers expose `count()`; status no longer loads every episode.
- `scripts/reverify-registry.ts`: read-only re-verification of stored passes.

### Added — capability sandbox & self-hosting
- QuickJS/WASM capability sandbox with persistent per-tool guest contexts and
  default-deny `fs`/`net`/`secrets`/`spend` grants; self-hosted tools compile to
  self-contained guest programs and report the execution mode honestly.

### Added — durable memory & skills
- SQLite (WAL) episodic/semantic memory with id-resume and idempotent
  consolidation; a real verify → lint → export skill-promotion pipeline.

### Added — agents
- Full-loop MCP toolset (stdio + remote HTTP with read/write scopes) and an A2A
  agent card + JSON-RPC endpoint with auth-gated mutating skills.

### Added — determinism & measurement
- Deterministic, seed-explicit ledgers and a `POST /api/recourse/replay` that
  re-derives streams and reports drift; a self-attested, hash-chained benchmark
  ledger with a leaderboard.

### Added — engine depth
- Synergy Plans 7–10 (relational predicates, Granger/transfer-entropy/
  stationarize, CBR operator ladder + oracle/human proofs, hardened AI drafter).

### Added — actuators, senses, safety
- Offline WAV render + stems, MIDI download, Web MIDI, A/B rating loop;
  faster-whisper transcription client + machine/git telemetry.
- Wave 0: single promotion-policy vocabulary; Wave 2: policy engine, approval
  queue, Prometheus `/metrics`, deployment actuator (build → health gate →
  rollback), Dockerfile/compose, expanded CI.
- Wave 3: signed plugin SDK, connector registry + signed webhooks, remote MCP,
  signed skill registry wired into federation.

### Added — commercial & network effects
- Wave 1: API-key/tenant identity, plans + Stripe billing, usage metering,
  outcome-feedback ledger, versioned `/v1` OpenAPI + generated client.
- Wave 4: Ed25519 peer federation (identity, signed envelopes, peer trust, sync);
  publishing + paywall; growth channels (CRM/leads/compliant outbound/SEO/ads).

### Changed
- `README.md` documents the real vs. limited surfaces; `build` uses
  `node esbuild.config.mjs`.
- `server.ts` decomposition (incremental): extracted the research/agenda,
  orchestration, music-therapy, memory, LEGO, intake/benchmark, corpus,
  skills, develop (stuck/repair/brain/council/patch), forge, open-ended,
  self-repair, policy/autonomy, dream, AI-mutator, growth-decision/JEV,
  component-template, learn/evolution-op, operator-readout, and
  replay/OpenAPI/A2A/MCP, math conductor, biotech claim, axiom bridge, provider
  chat/settings, builder-brain, runtime-ops, reports, GitHub research, and
  capability-runtime/telemetry route clusters into `src/routes/*` (29 new
  routers, ~194 inline routes moved — the decomposition is complete; only the
  two `GET *` SPA fallbacks remain inline).
  A static route-table snapshot (`scripts/route-snapshot.mjs`,
  `tests/fixtures/route-snapshot.json`) now guards all 496 routes against drift.
  See `docs/route-decomposition.md` for the remaining clusters and the pattern.

### Known limitations
- `server.ts` is still a large module (the route decomposition is complete:
  `src/routes/*` routers now own every API route; only the two `GET *` SPA
  fallbacks remain inline) — see `docs/route-decomposition.md`.
- Serverless `api/recourse/{math,dream}` still hold module-level state.
- The pre-merge gate refuses proposals that require sandbox verification but
  carry no machine-checkable suite (honest refusal, not a fabricated pass).
