# Recourse + Overlay Oncology — One-Pager

**Positioning:** Evidence-grounded dynamic simulation with verifiable provenance.

## The problem
Static knowledge graphs (Open Targets, PrimeKG) show associations but not dynamics. Isolated simulators (PhysiCell, COPASI, Simcyp) need months of manual parameterization. Black-box AI (Tempus, Insilico) predicts without mechanistic falsification.

## The system
A closed-loop falsification pipeline:
1. **Live evidence** — Open Targets + PubTator 3.0, provenance-tagged, no fabrication.
2. **Evidence-to-ODE** — evidence becomes kinetic parameters, each labeled by origin.
3. **Dosing optimization** — 4 modes × dose sweep, cure reachability, honest negative verdicts.
4. **Standards interop** — SBML Level 3 (libSBML-validated) + PhysiCell XML.
5. **Evidence dossier** — SHA-256 hash chain over every stage, tamper-evident.

## Proof of honesty
- Negative result is published: with real resistance signal 0.60, "cure not reachable" under every arm.
- Real-data validation against TCGA/CCLE/METABRIC with honest C-indexes, including underperforming results.
- Confidence is a labeled heuristic, not a posterior; IC50 marked NOT calibrated without a fit.

## Why fundable
- Verification infrastructure: every claim is auditable to a DOI/PMID + engine run + hash.
- Standards-validated exports: interop with the tools the field already uses.
- Deterministic engines: reproducible, drift-gated, no theater.
