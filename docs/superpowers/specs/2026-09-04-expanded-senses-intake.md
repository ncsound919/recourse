# Expanded Senses: Computer Use, AV Intake, Environment Telemetry

- **Date:** 2026-09-04
- **Status:** Proposed
- **Related:** [capability-expansion-roadmap](./2026-09-04-capability-expansion-roadmap.md)

## Motivation

The intake layer already ingests arXiv, GitHub, Hacker News, and RSS through `src/intake/`. Three gaps keep it from being a full perception system: it can read pages but not *use* sites (logins, forms, downloads); it cannot hear or watch anything; and it is blind to the machine it lives on.

## Overview

Grow `src/intake/` into a standing perception grid.

## Design

### Computer-use browser driver (`agentbrowser.ts`)
- Session persistence: authenticated logins scoped per source, with credential access granted via the WASM sandbox capability model.
- Action API: fill, click, download, screenshot; each action logged to provenance.
- DOM diffing over time: the driver snapshots watched pages and emits structured change events ("price changed", "new paper in category X") — combined with `poll.ts`, this becomes the observation grid.
- Rate limiting and robots/ToS policy per source, enforced by `lintGate`-style static rules.

### Audio/video ingestion
- Transcription sidecar (Python, alongside `pdf_service`): podcasts, interviews, lectures, video audio → text.
- Transcripts enter `intake/corpus` like any other document; `grounding.ts` treats transcript claims with appropriate uncertainty.
- Speaker diarization optional; segment-level provenance so citations point at timestamps.

### Environment telemetry
- Local sensors: filesystem watchers on project dirs, git activity across linked repos, machine load, calendar availability.
- Use: autopilot scheduling — heavy dream cycles deferred while the user is mid-session; nightly cycles get the full budget.
- All telemetry local-only; nothing leaves the machine by default.

## Phases

1. DOM diffing + observation grid on top of existing browsing.
2. Session persistence and action API (behind capability grants).
3. Transcription sidecar + corpus integration.
4. Telemetry sensors + autopilot scheduling integration.

## Success criteria

- A watched source change triggers intake and a grounded readout with no human prompt.
- A podcast episode ingested end-to-end appears in the corpus with timestamp-anchored provenance.
- Dream cycles automatically avoid user-active windows for a week without collisions.

## Risks

- Authenticated browsing has legal/ToS exposure — keep a strict per-source policy layer and manual opt-in per source.
- Telemetry is privacy-sensitive: default off, explicit enable, local storage only.

## Touchpoints

`src/intake/agentbrowser.ts`, `src/intake/poll.ts`, `src/intake/rss.ts`, `src/intake/grounding.ts`, `src/intake/store.ts`, `python/`, `src/lib/agentBrowser.ts`, `src/autopilot/loopStateMachine.ts`
