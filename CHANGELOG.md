# Changelog

All notable changes to Recourse. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); this project aims to be honest
about state, so entries describe what is real and what remains limited.

## Unreleased

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
