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

### Known limitations
- `server.ts` remains a large monolith (decomposition is incremental).
- Serverless `api/recourse/{math,dream}` still hold module-level state.
- The pre-merge gate refuses proposals that require sandbox verification but
  carry no machine-checkable suite (honest refusal, not a fabricated pass).
