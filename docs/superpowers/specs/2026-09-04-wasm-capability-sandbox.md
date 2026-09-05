# WASM Capability Sandbox

- **Date:** 2026-09-04
- **Status:** Proposed
- **Related:** [capability-expansion-roadmap](./2026-09-04-capability-expansion-roadmap.md)

## Motivation

Self-hosted tools (`.selfhosted/tools/<name>.mjs`) are dynamically imported by the running server and executed with full server privileges. That caps how much rope we can safely give the dream engine: any capability involving network access, filesystem writes, or untrusted computation is too dangerous to auto-promote. A WebAssembly runtime with least-privilege capability grants makes riskier evolved tools safe to enable — it is the keystone for the rest of the roadmap.

## Overview

Replace direct dynamic import in `selfHosting.ts` with a sandbox host. Each tool is compiled/instantiated inside a WASM runtime (QuickJS-in-WASM for JS tools; Pyodide for Python tools) and receives an explicit set of grants. The existing public route (`/api/recourse/selfhosted/<name>/execute`) and boot-time re-verification (fresh instantiate + stored suite) stay unchanged.

## Design

### Runtime
- JS tools: QuickJS compiled to WASM (or equivalent). No Node APIs visible by default.
- Python tools: Pyodide (CPython in WASM), uniting the TS core and Python sidecars inside one trust boundary.
- Limits: wall-clock budget, memory cap, instruction/cycle cap per execution.

### Capability grants
- Default deny. A grant is an explicit object attached to each tool at promotion time, e.g.:
  - `fs`: allowlisted paths, read-only vs read-write
  - `net`: allowlisted domains + methods
  - `secrets`: named env vars, never the whole environment
  - `spend`: optional budget token (see generative-actuators spec)
- Grants are recorded in the tool's provenance entry and re-checked at boot verification.
- Grant changes require the same pre-merge gate as any other upgrade.

### Snapshot / durable pause
- The sandbox host can snapshot a tool's WASM linear memory + QuickJS heap state and serialize it.
- A paused tool can be resumed exactly where it stopped — the substrate for the interactive veto spec.

## Phases

1. QuickJS/WASM runner behind the existing `selfhosted` execute route; no grants, pure computation only; all current suites pass inside it.
2. Capability grant system with default-deny policy and provenance recording.
3. Pyodide runner; Python sidecar logic (fuzz/kg/pdf) migratable into the boundary over time.
4. Snapshot pause/resume with round-trip fidelity tests.

## Success criteria

- Generated code cannot read host env vars, host filesystem, or network without an explicit grant (verified by adversarial probe suite).
- All stored tool suites still pass inside the sandbox.
- A paused tool resumes with identical outputs vs an uninterrupted run.

## Risks

- Performance overhead on hot paths (mitigate: keep trivial pure-function tools on the direct path; sandbox only tools with grants).
- Tools requiring Node APIs cannot be sandboxed — they stay manual-review-only.
- Capability grammar needs care to stay expressive without becoming a security hole.

## Touchpoints

`src/lib/executionSandbox.ts`, `src/lib/isolatedSandbox.ts`, `src/lib/selfHosting.ts`, `src/lib/templatePlugin.ts`, `src/lib/verifiers.ts`, `src/autopilot/preMergeGate.ts`
