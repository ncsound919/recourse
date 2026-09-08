# Oncology Autonomous Grant Engine

A four-stage pipeline that identifies unresolved cancer research problems,
generates testable hypotheses and experiment/trial designs against them,
critiques those designs the way an NIH study section would, and packages
surviving proposals into NIH/NCI grant-format deliverables.

**Honest framing:** this system compresses the time between "we have a real
research gap" and "a submission-ready, reviewer-credible application exists."
It does not make NIH funding instant — review cycles (R01/SBIR) run 6-10+
months regardless of proposal quality, and every claim generated here needs
human PI verification before submission. What it optimizes for is thoroughness
and speed of the *drafting and self-critique* loop, not the external review
timeline.

## Pipeline

```
Stage 1: Problem Registry
   └─> 20 unresolved issues, each with a domain-specific evidence ladder
       (modeled after the four-leg metastatic-cure framework, generalized)

Stage 2: Hypothesis & Experiment Generator
   └─> For each registry issue: literature-grounded gap analysis →
       falsifiable hypotheses → proposed experiment/trial designs
       (in vitro / in vivo / clinical, with defined endpoints)

Stage 3: Reviewer-Model Critic
   └─> Scores a hypothesis+design bundle against actual NIH review
       criteria (Significance, Investigator, Innovation, Approach,
       Environment) before it's allowed into packaging

Stage 4: Grant Packager
   └─> Drafts NIH-format sections (Specific Aims, Significance,
       Innovation, Approach, budget justification skeleton) with
       provenance links back to every source claim
```

## Status

Thin skeleton across all four stages. Three seed issues in the registry
(persister-cell dormancy, CAR-T solid-tumor efficacy, multi-cancer early
detection) built from real 2026 literature — not yet the full 20. Each
stage runs standalone against `data/` JSON files; no orchestration layer
yet, no LLM calls wired in (the generator/critic/packager stages currently
define schemas + interfaces + stub logic, not live model calls — see
each module's TODO).

## Directory layout

- `schemas/` — data contracts every stage reads/writes (JSON Schema + Python dataclasses)
- `registry/` — Stage 1: the problem registry itself + evidence-ladder logic
- `generator/` — Stage 2: hypothesis/experiment generation interface
- `critic/` — Stage 3: NIH-reviewer-model scoring interface
- `packager/` — Stage 4: grant-section drafting interface
- `data/` — seed data (the 3 researched issues, in registry schema format)

## Provenance requirement (non-negotiable)

Every claim that reaches Stage 4 must carry a citation back to a real
source captured in Stage 1/2. No stage may synthesize a citation. This is
enforced structurally: `Claim.source_ids` is a required, non-empty field
in the schema, and the packager refuses to render any claim without one.
