# Generative Actuators: Audio, Reports, Budgeted Wallet

- **Date:** 2026-09-04
- **Status:** Proposed
- **Related:** [capability-expansion-roadmap](./2026-09-04-capability-expansion-roadmap.md)

## Motivation

Recourse can currently act on code. Three actuator classes expand its action space into the physical/economic world: sound (the composer engine deserves real output), documents (it should publish its own findings), and money (some problems justify buying compute or data).

## Overview

Three independent actuators sharing one rule: every action is gated, capped, and recorded in provenance.

## Design

### Audio actuator (`src/lib/composer/`)
- Web MIDI output: the dream engine's evolved patches and patterns drive real hardware, not just preview audio.
- Offline render: render evolved compositions/mutations to WAV/stems as artifacts (`artifactHost.ts`).
- Quality-diversity archive: MAP-Elites over the composer's lexicon/theory space (`qualityDiversity.ts`, `novelty.ts`); fitness = music-theory constraints + the user's manual ratings as oracle.
- Rating UI hooks into mission control; ratings become fitness signal for the next generation.

### Report writer
- A daily digest generated from hourly report + provenance data: what was tried, what won, what was vetoed, what changed in the observation grid.
- Output formats: PDF (sidecar) and an audio "broadcast" read by `narration.ts`/`voice.ts` — mission-control radio.

### Budgeted wallet
- A capped spending account (Stripe) usable by gated tools for compute, API credits, or datasets.
- Spend is a sandbox capability grant (`spend` token with hard cap + per-action ceiling).
- Every transaction: pre-action checkpoint (interactive veto) + provenance entry + post-action reconciliation against the scorecard.
- Auto-shutdown of spending tools when the cap is hit; renewal requires explicit human action.

## Phases

1. Offline audio render + artifact hosting for composer output.
2. Rating loop + quality-diversity archive.
3. Daily report writer (PDF + voice broadcast).
4. Wallet with caps, checkpoints, reconciliation.

## Success criteria

- An evolved pattern renders to a downloadable stem with provenance from gene to WAV.
- A daily broadcast is produced unattended for a week.
- Wallet spend never exceeds cap even under adversarial self-generated tools (probe suite).

## Risks

- Spending is irreversible: default per-action ceilings low; first month manual-approve only.
- Audio fitness without a human oracle drifts to blandness — keep the user in the loop as fitness oracle.

## Touchpoints

`src/lib/composer/soundlab.ts`, `src/lib/composer/theory.ts`, `src/lib/qualityDiversity.ts`, `src/lib/novelty.ts`, `src/lib/artifactHost.ts`, `src/lib/narration.ts`, `src/lib/voice.ts`, `src/components/HourlyReportView.tsx`
