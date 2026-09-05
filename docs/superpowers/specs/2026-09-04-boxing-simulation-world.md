# Boxing Simulation World

- **Date:** 2026-09-04
- **Status:** Proposed
- **Related:** [capability-expansion-roadmap](./2026-09-04-capability-expansion-roadmap.md)

## Motivation

The dream engine needs hard, cheap-to-score fitness functions that are genuinely interesting to the operator. Historical boxing is ideal: discrete outcomes, abundant records, obvious overfitting traps (era effects), and a direct line to the operator's actual interests.

## Overview

A second domain world: the dream engine evolves simulation parameters for historical fight outcomes, scored on prediction accuracy over held-out bouts.

## Design

### Data plane
- Historical fight records: boxers (era, style tags, physical attributes), bout outcomes, and judges'/KO details from open datasets.
- Fight records enter the intake corpus; each fighter/bout is an entity with provenance.

### Simulation plane
- A deterministic fight simulator (rate-based or event-based) whose parameters form the genome: pace, damage accumulation, stamina, chin/recovery, style-interaction matrix, judging bias weights.
- Simulation is pure computation — runnable inside the WASM sandbox at scale, cheap to replay.

### Evolution plane
- Genome = simulator parameter vector (+ optionally structural choices like simulation length, scoring rules).
- Fitness: prediction accuracy on held-out bouts (win/lose/method), with era-split and time-split validation so the simulator must generalize across boxing eras, not memorize them.
- Quality-diversity archive over style-space: the goal is a family of simulators that each model distinct style matchups well, not one monoculture.

### Products
- What-if bouts between any two fighters across eras, with confidence from the simulator family's spread.
- Promoted simulator configs become `skills/` tools (`predict-bout`, `simulate-matchup`) callable via MCP.

## Phases

1. Dataset selection + ingestion with provenance.
2. Deterministic baseline simulator + baseline accuracy floor.
3. Parameter-genome evolution loop.
4. Era/time-split validation + quality-diversity archive.
5. What-if interface + MCP tool exposure.

## Success criteria

- Evolved simulator beats baseline on held-out bouts across at least two era splits.
- Deterministic: same config + same seed = identical fight, verified by property harness.
- A what-if matchup returns results plus disagreement spread across the simulator family.

## Risks

- Small-dataset overfitting; guard with strict splits and archive diversity pressure.
- Record data quality varies by era; weight training examples by data confidence.

## Touchpoints

`src/dream/*`, `src/dream/property-harness.ts`, `src/benchmark/benchmark.ts`, `src/lib/qualityDiversity.ts`, `src/skills/`, `mcp-server.ts`
