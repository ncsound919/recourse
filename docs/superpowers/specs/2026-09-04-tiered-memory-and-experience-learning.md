# Tiered Memory and Experience Learning

- **Date:** 2026-09-04
- **Status:** Proposed
- **Related:** [capability-expansion-roadmap](./2026-09-04-capability-expansion-roadmap.md)

## Motivation

`vectorMemory.ts` is a flat store. The system currently re-explores known-bad regions and lets winning patterns die with the generation that produced them. Experience-driven lifelong learning (experience exploration, persistent memory, skill abstraction, internalization) turns a one-shot optimizer into a compounding one: agents that learn from mistakes and dead ends need fewer attempts to reach the same quality over time.

## Overview

Promote memory to three tiers and close two loops: failures bias future search, and repeatedly-winning genes are promoted into first-class skills.

## Design

### Memory tiers
- **Episodic:** append-only log of every run — inputs, genes, scores, veto outcomes, diffs. Already half-built via provenance; make it the retrieval substrate.
- **Semantic:** periodic consolidation during idle/dream cycles — summarize clusters of episodes into durable facts ("layout mutation X consistently degrades metric Y under load") stored in `vectorMemory.ts` with provenance back-links.
- **Skill:** the `skills/` registry itself.

### Failure memory
- `problemArchive.ts` gains a retrieval path keyed by problem fingerprint.
- Before a mutation round, `mutator.ts` queries the archive for near-neighbors of the current problem and down-weights gene regions associated with archived failures.
- Failed experiments are never deleted — only demoted to negative-example status.

### Skill auto-promotion
- Track gene lineage across problems in `dream/store.ts`.
- If a gene (or gene cluster) contributes to wins across N unrelated problems, flag it as a promotion candidate.
- Promotion = extract into a `skills/` tool + generate its own test suite + pass the pre-merge gate. Manual approval checkpoint required for the first promotions; can be auto-gated once trust builds.

### Internalization
- Repeated successful skill chains get compiled into a faster deterministic path (cache/precompute) so the system gets cheaper on things it does often, reserving model calls for genuinely novel problems.

## Phases

1. Episodic tier: queryable provenance log + problem-fingerprint retrieval.
2. Failure memory biasing in the mutator.
3. Semantic consolidation during idle cycles.
4. Skill auto-promotion pipeline with gate integration.
5. Internalization caches.

## Success criteria

- Measurable drop in repeated failure classes across generations (track via gap analyzer).
- At least one gene auto-promoted into `skills/` with a passing suite.
- Model-call cost per solved problem trends down on recurring problem types.

## Risks

- Negative-example biasing can over-prune the search space; keep an exploration floor (epsilon) in the mutator.
- Semantic summaries can be wrong; every semantic fact must carry provenance links to its episodes.

## Touchpoints

`src/lib/vectorMemory.ts`, `src/lib/problemArchive.ts`, `src/dream/mutator.ts`, `src/dream/store.ts`, `src/dream/genomes.ts`, `src/skills/`, `src/autopilot/scorecard.ts`
