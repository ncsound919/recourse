# Recourse + Overlay Oncology — Mind Map Outline

## Root: Closed-Loop Falsification
- Live Evidence
  - Open Targets (target-disease scores, tractability)
  - PubTator 3.0 (gene-disease co-occurrence, PMIDs)
  - Provenance-tagged graph, provider-down is honest
- Evidence-to-ODE Synthesis
  - Params: growth/kill/IC50/mutation
  - Origins: evidence-derived / literature-prior / canonical / calibrated
  - Confidence is a labeled heuristic, not a posterior
- Dosing Optimization
  - 4 therapy modes × dose sweep
  - Cure reachability, resistant fraction, toxicity
  - Seeded subclone-extinction probability (ensemble fraction)
  - Negative verdicts are valid findings
- Standards Interop
  - SBML Level 3 (libSBML-validated round-trip)
  - PhysiCell XML config (same parameters)
- Evidence Dossier
  - SHA-256 hash chain (live_graph → ode_params → dosing_optimization → sbml_export → physicell_export)
  - DOIs/PMIDs collected, scope-tagged statements
  - Makes claims verifiable, not true

## Branches
- Differentiation vs field: static KGs / isolated simulators / black-box AI
- Real validation: TCGA/CCLE/METABRIC, Cox + Uno C, honest negative results
- Honest scope: not clinical, no cures, IC50 not calibrated unless fit supplied
