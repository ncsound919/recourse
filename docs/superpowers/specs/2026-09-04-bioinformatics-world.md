# Bioinformatics World

- **Date:** 2026-09-04
- **Status:** Proposed
- **Related:** [capability-expansion-roadmap](./2026-09-04-capability-expansion-roadmap.md)

## Motivation

`biotechKnowledgeGraph.ts` exists but is fed opportunistically. Bioinformatics is the ideal first "world" for the dream engine: problems are concrete, datasets are public, and scoring can be made objective (reproducibility + held-out validation). This turns Recourse into a research instrument, not just a self-improving toy.

## Overview

A domain world = curated problem space + datasets + objective fitness + grounded knowledge base. The dream engine evolves analysis pipelines; the KG keeps every hypothesis grounded and traceable.

## Design

### Data plane
- Ingestion: PubMed abstracts, clinicaltrials.gov, open omics datasets (expression, mutation, clinical) via the intake layer into `python/kg_service`.
- KG schema: entities (genes, proteins, pathways, drugs, cohorts, biomarkers) with source-anchored edges; every edge carries provenance back to a document/record.
- Grounding: before a hypothesis is scored, `grounding.ts`-style checks verify it references real entities with real, non-contradicted relations.

### Evolution plane
- Genome = analysis pipeline parameters: normalization choices, feature selection strategy, model family + hyperparameters, validation design.
- Fitness: held-out predictive performance (time-split or cohort-split) + reproducibility (pipeline reruns identical) + grounding score.
- Overfitting guards: temporal splits, cross-cohort validation, and penalty for pipelines that only fit one dataset.

### Hypothesis loop
- `problemGenerator.ts` proposes candidate biomarker/association questions from KG gaps.
- Dream engine evolves candidate pipelines; `verifiers.ts` + symbolic consistency checks (see roadmap, cognition layer) reject internally inconsistent candidates before scoring.
- Winning pipelines are promoted to `skills/` as reusable analysis tools; hypotheses with surviving evidence go to a human-review queue (interactive veto), never auto-published.

## Phases

1. KG schema + PubMed/clinicaltrials ingestion with provenance edges.
2. One public omics dataset loaded; baseline pipeline as fitness floor.
3. Pipeline genome + evolution loop on that dataset.
4. Cross-dataset generalization scoring.
5. Hypothesis generation from KG gaps.

## Success criteria

- An evolved pipeline beats the baseline on held-out data with a reproducible rerun.
- Zero ungrounded hypotheses reach scoring.
- A promoted analysis skill is reusable on a second dataset without modification.

## Risks

- Dataset licensing/attribution — public sources only, license recorded in provenance.
- Biological overfitting is subtle; validation design is part of the genome so it can can be evolved/gated, not fixed by hand.
- Never auto-publish health claims — human review is a hard gate.

## Touchpoints

`src/lib/biotechKnowledgeGraph.ts`, `src/lib/problemGenerator.ts`, `src/lib/verifiers.ts`, `src/intake/arxiv.ts`, `python/kg_service`, `src/benchmark/benchmark.ts`, `src/dream/*`
