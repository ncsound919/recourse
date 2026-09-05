# Interactive Veto with Durable Pause

- **Date:** 2026-09-04
- **Status:** Proposed
- **Related:** [capability-expansion-roadmap](./2026-09-04-capability-expansion-roadmap.md), [wasm-capability-sandbox](./2026-09-04-wasm-capability-sandbox.md)

## Motivation

`vetoScheduler.ts` vetoes on a schedule; the human is outside the loop. For consequential actions (merging a generation, spending budget, promoting a skill), we want the opposite: the system *stops mid-action*, presents its evidence, waits for judgment, and resumes exactly where it stopped — without losing loop state.

## Overview

Upgrade the veto from a gate that rejects to a checkpoint that pauses. Built on the WASM sandbox snapshot capability.

## Design

### Checkpoint model
- A new autopilot state: `PAUSED_AWAITING_REVIEW` in `loopStateMachine.ts`.
- On entry: serialize loop state + sandbox snapshot of the in-flight tool + the full decision dossier (scorecard, diffs, provenance chain, predicted impact).
- The dossier renders in mission control (existing `SystemInsightModal` / hourly report surfaces).
- Approve → resume from snapshot, identical to an uninterrupted run. Reject → run the existing veto/rollback path.

### Timeout policy
- Each checkpoint carries a timeout with a configurable fallback (auto-reject by default; auto-approve only for whitelisted low-risk action classes).
- Unresolved checkpoints surface in the mission status strip.

### Confidence thresholds
- `qualityTier.ts` already stratifies output quality; use it to decide which actions auto-pass, which require checkpoints, and which auto-reject — the veto policy becomes a confidence-tiered matrix instead of a single schedule.

## Phases

1. `PAUSED_AWAITING_REVIEW` state + dossier rendering + approve/reject from UI.
2. Snapshot-backed resume (depends on WASM sandbox phase 4).
3. Confidence-tiered action matrix.
4. Timeout policies + escalation surfacing.

## Success criteria

- A paused-and-approved action produces byte-identical outcomes vs an uninterrupted run.
- Zero silent consequential actions: every merge/spend/promotion is either auto-passed with recorded confidence or checkpointed.

## Risks

- A stuck checkpoint stalls the loop — mitigated by timeouts and a watchdog in the autopilot cron.
- Snapshot fidelity across tool versions; snapshot schema must be version-pinned.

## Touchpoints

`src/autopilot/vetoScheduler.ts`, `src/autopilot/loopStateMachine.ts`, `src/autopilot/qualityTier.ts`, `src/autopilot/scorecard.ts`, `src/lib/provenance.ts`, `src/components/SystemInsightModal.tsx`, `src/components/MissionStatusStrip.tsx`
