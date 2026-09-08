# Recourse + Overlay Oncology — Media Package

Ready-to-upload assets for generating media (NotebookLM audio/video overviews,
investor visuals, social content) for the Recourse + Overlay Oncology closed-loop
falsification pipeline.

## Contents

```
media-package/
├── README-NOTEBOOKLM.md        How to generate audio/video overviews in NotebookLM
├── make_diagrams.py            Regenerates diagrams from real pipeline JSON
├── sources/
│   └── recourse-oncology-system-brief.md   Main NotebookLM source (honest system brief)
├── google-notebook/            Marketing-team-generated content, ready to upload
│   ├── social-posts.md         Voice-checked + format-audited social drafts
│   ├── overview-script.md      Narration script for audio/video overview
│   ├── mind-map-outline.md     Structured outline (mind maps / slide decks)
│   ├── investor-one-pager.md   Positioning brief
│   └── sources-manifest.md     What to upload + how to use it
├── assets/
│   ├── pipeline-full.json      Real pipeline output (live evidence -> params -> dosing -> dossier)
│   ├── marketing-pulse.json    Deterministic marketing team output (voice/format/calendar/tracker)
│   └── strategist-report.json  Deterministic strategy team output (clustering + venture scan)
└── diagrams/
    ├── dosing-arms.png         Real ODE dosing arms by final volume + reachability
    ├── provenance.png          Synthesized params by origin + heuristic confidence
    ├── dossier-chain.png       SHA-256 stage hash chain
    └── provider-contrib.png    Provenance sources referenced by the dossier
```

## What is real

Every number in the diagrams and the pipeline JSON comes from the live
`/api/recourse/kg/live/pipeline` run (real Open Targets + PubTator evidence, real ODE
simulation, real libSBML-validated SBML export, real hash chain). The marketing and
strategy outputs come from the deterministic agent teams under
`01_Platforms/Overlay365/agent-team/agents/{marketing,strategist}`.

## What is NOT here

- No generated audio/video files — NotebookLM generation requires your logged-in
  Google session (see README-NOTEBOOKLM.md).
- No fabricated marketing claims — the brand-voice guard enforces honesty rules.

## Regenerating

```bash
# 1. With Recourse running:
Invoke-RestMethod -Uri "http://localhost:3050/api/recourse/kg/live/pipeline" -Method Post -Body '{}' `
  | ConvertTo-Json -Depth 6 > assets/pipeline-full.json

# 2. Rebuild diagrams:
python make_diagrams.py
```

## Agent-team inputs (for re-running the marketing/strategy teams)

The scripts that produced the marketing pulse and strategist report live in
`01_Platforms/Overlay365/agent-team/scripts/`:
- `run-oncology-marketing.ts` — runs the marketing team with the Recourse/Oncology
  brand corpus scoped
- `oncology-serve-input.json` / `oncology-strategist.json` — strategist + scout inputs