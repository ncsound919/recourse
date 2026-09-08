"""
Three seed Problems for the registry, built from real literature retrieved
2026-09-05. These prove the schema and pipeline pattern; the remaining 17
issues are a follow-up research pass, not a schema change.

Sourcing note: dates/venues below are taken from the search results used to
build these entries. URLs are the actual retrieved article URLs. This file
is meant to be regenerated/expanded by future research passes, not hand-
maintained indefinitely — treat it as Stage 1's current snapshot.
"""

from __future__ import annotations

from datetime import date

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from schemas.models import (
    Claim, EvidenceLadderRung, EvidenceTier, Problem, Source, SubMechanism,
)


def _src(sid, title, url, pub_date=None, venue=None) -> Source:
    return Source(source_id=sid, title=title, url=url, publication_date=pub_date, venue=venue)


# ---------------------------------------------------------------------------
# Problem 1: Drug-tolerant persister cell dormancy and reactivation
# ---------------------------------------------------------------------------

_p1_sources = {
    "cheng2026": _src(
        "cheng2026",
        "Cancer drug response and resistance: molecular mechanisms and combating strategies",
        "https://www.nature.com/articles/s41392-026-02924-w",
        date(2026, 8, 3),
        "Signal Transduction and Targeted Therapy",
    ),
    "plasticity2025": _src(
        "plasticity2025",
        "Cancer cell plasticity and therapeutic resistance: mechanisms, crosstalk, and translational perspectives",
        "https://link.springer.com/article/10.1186/s41065-025-00564-8",
        date(2025, 9, 26),
        "Hereditas",
    ),
    "molbiomed2025": _src(
        "molbiomed2025",
        "Drug resistance in cancer: molecular mechanisms and emerging treatment strategies",
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC12623568/",
        None,
        "Molecular Biomedicine",
    ),
}

problem_1 = Problem(
    problem_id="P01_persister_dormancy",
    title="Drug-tolerant persister cell dormancy and reactivation",
    summary=(
        "A subpopulation of tumor cells survives therapy in a reversible, "
        "non-genetic drug-tolerant state ('persisters') via phenotypic "
        "plasticity rather than mutation, then can reactivate to cause "
        "relapse. Distinct from genetically-driven resistance (e.g. the "
        "existing four-leg framework's Leg 3 PROTAC/degrader resistance "
        "work) — this is about transient, non-mutational tolerance."
    ),
    sub_mechanisms=[
        SubMechanism(
            name="Phenotypic plasticity into persister state",
            description="Reversible transcriptional/epigenetic reprogramming that lets a cell tolerate drug exposure without genetic mutation.",
            evidence_ladder=[
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_1_IN_VITRO,
                    description="Persister phenotypes characterized in cell-line models under drug pressure.",
                    current_claims=[
                        Claim(
                            text="Reviews document epigenetic reprogramming and non-coding RNA networks cooperating with metabolic reprogramming to sustain drug-tolerant persister phenotypes in vitro.",
                            source_ids=("molbiomed2025",),
                            evidence_tier=EvidenceTier.TIER_1_IN_VITRO,
                        )
                    ],
                ),
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_2_IN_VIVO_PRECLINICAL,
                    description="Persister-to-relapse transition demonstrated in animal models with lineage tracing.",
                    current_claims=[],  # GAP
                ),
            ],
        ),
        SubMechanism(
            name="Microenvironment / microbiome modulation of persistence",
            description="Tumor microenvironment and microbiome signals that help sustain or trigger reactivation of persister cells.",
            evidence_ladder=[
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_1_IN_VITRO,
                    description="Microbiome-immune crosstalk implicated in resistant phenotype maintenance.",
                    current_claims=[
                        Claim(
                            text="The microbiome is highlighted as an emerging determinant of therapeutic response through immune modulation and metabolic cross-talk with resistant tumor cell populations.",
                            source_ids=("molbiomed2025",),
                            evidence_tier=EvidenceTier.TIER_1_IN_VITRO,
                        )
                    ],
                ),
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_3_CORRELATIVE_CLINICAL,
                    description="Human cohort data linking microbiome composition to relapse timing after therapy.",
                    current_claims=[],  # GAP
                ),
            ],
        ),
    ],
    sources=_p1_sources,
    last_updated=date(2026, 9, 5),
)


# ---------------------------------------------------------------------------
# Problem 2: CAR-T efficacy in solid tumors
# ---------------------------------------------------------------------------

_p2_sources = {
    "onyekweli2026": _src(
        "onyekweli2026",
        "Engineering CAR-T cells for solid tumors: Overcoming the microenvironment through integrated design and clinical translation",
        "https://www.eurekalert.org/news-releases/1139666",
        date(2026, 8, 11),
        "Oncoscience",
    ),
    "frontiers2026a": _src(
        "frontiers2026a",
        "CAR-T cells in solid tumors: engineering, biomarkers, translational pathways and the road ahead",
        "https://www.frontiersin.org/journals/immunology/articles/10.3389/fimmu.2026.1796675/full",
        date(2026, 3, 17),
        "Frontiers in Immunology",
    ),
    "cellmed2026": _src(
        "cellmed2026",
        "Current state of CAR-T cell therapies for solid tumors",
        "https://www.cell.com/med/fulltext/S2666-6340(26)00031-0",
        date(2026, 2, 16),
        "Med (Cell Press)",
    ),
}

problem_2 = Problem(
    problem_id="P02_cart_solid_tumor",
    title="CAR-T cell efficacy in solid tumors",
    summary=(
        "CAR-T therapy is transformative in hematologic malignancies but "
        "pooled objective response in solid tumors is estimated around 9%. "
        "The gap is driven by several interacting, separable barriers rather "
        "than a single obstacle: antigen heterogeneity/escape, trafficking "
        "and stromal penetration, immunosuppressive TME, and exhaustion."
    ),
    sub_mechanisms=[
        SubMechanism(
            name="Antigen heterogeneity and escape",
            description="Lack of truly tumor-specific antigens and variable/loss expression driving relapse after initial response.",
            evidence_ladder=[
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_2_IN_VIVO_PRECLINICAL,
                    description="Multi-antigen / logic-gated CAR constructs tested in preclinical models to counter escape.",
                    current_claims=[
                        Claim(
                            text="Next-generation strategies including logic-gated systems and co-expression of bispecific T-cell engagers are being tested to address antigen escape.",
                            source_ids=("onyekweli2026",),
                            evidence_tier=EvidenceTier.TIER_2_IN_VIVO_PRECLINICAL,
                        )
                    ],
                ),
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_4_EARLY_CLINICAL,
                    description="Biomarker-guided selection of engineering strategy validated prospectively in patients.",
                    current_claims=[],  # GAP — explicitly flagged as aspirational in source
                ),
            ],
        ),
        SubMechanism(
            name="Trafficking and stromal penetration",
            description="CAR-T cells must traffic through vasculature, penetrate dense stroma, and persist within the immunosuppressive TME.",
            evidence_ladder=[
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_2_IN_VIVO_PRECLINICAL,
                    description="Chemokine receptor engineering improving tumor infiltration and persistence in preclinical models.",
                    current_claims=[
                        Claim(
                            text="Chemokine receptor engineering to match CAR-T cells' receptor profiles to tumor/stromal chemokines has significantly improved tumor infiltration and persistence in preclinical models.",
                            source_ids=("cellmed2026",),
                            evidence_tier=EvidenceTier.TIER_2_IN_VIVO_PRECLINICAL,
                        )
                    ],
                ),
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_4_EARLY_CLINICAL,
                    description="Selective tumor migration without off-tumor accumulation demonstrated clinically.",
                    current_claims=[],  # GAP — explicitly named as key translational challenge
                ),
            ],
        ),
        SubMechanism(
            name="Manufacturing / long-term genomic stability of engineered constructs",
            description="Long-term genomic stability after multiplex gene editing, and manufacturing/regulatory complexity of increasingly engineered constructs.",
            evidence_ladder=[
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_0_MECHANISTIC_HYPOTHESIS,
                    description="Concern flagged in literature; not yet systematically studied.",
                    current_claims=[
                        Claim(
                            text="Long-term genomic stability after multiplex gene editing has not been established, and sustained cytokine armoring introduces potential safety concerns.",
                            source_ids=("onyekweli2026",),
                            evidence_tier=EvidenceTier.TIER_0_MECHANISTIC_HYPOTHESIS,
                        )
                    ],
                ),
            ],
        ),
    ],
    sources=_p2_sources,
    last_updated=date(2026, 9, 5),
)


# ---------------------------------------------------------------------------
# Problem 3: Multi-cancer early detection — sensitivity/specificity/overdiagnosis
# ---------------------------------------------------------------------------

_p3_sources = {
    "oncnursing2026": _src(
        "oncnursing2026",
        "Multicancer Early Detection Testing: Promise and Challenges",
        "https://www.oncnursingnews.com/view/multi-cancer-early-detection-testing-promise-and-challenges",
        date(2026, 5, 27),
        "Oncology Nursing News",
    ),
    "science_aay9040": _src(
        "science_aay9040",
        "Early detection of cancer",
        "https://www.science.org/doi/10.1126/science.aay9040",
        None,
        "Science",
    ),
    "frontiers2026b": _src(
        "frontiers2026b",
        "Liquid biopsy, multi-cancer early detection, and artificial intelligence: new frontiers in cancer screening",
        "https://www.frontiersin.org/journals/immunology/articles/10.3389/fimmu.2026.1854718/full",
        date(2026, 6, 3),
        "Frontiers in Immunology",
    ),
}

problem_3 = Problem(
    problem_id="P03_mced_overdiagnosis",
    title="Multi-cancer early detection: sensitivity/specificity and overdiagnosis tradeoff",
    summary=(
        "Roughly half of cancers are diagnosed at advanced stage, motivating "
        "multi-cancer early detection (MCED) liquid-biopsy tests. But finding "
        "biomarkers of early cancer amid physiological noise is hard, and "
        "detecting indolent lesions that would never cause harm risks "
        "overdiagnosis/overtreatment — evidence of test accuracy or stage "
        "shift alone is not sufficient; the field lacks trials powered on "
        "late-stage/mortality reduction, not just detection rate."
    ),
    sub_mechanisms=[
        SubMechanism(
            name="Biomarker signal-to-noise at early stage",
            description="Circulating tumor DNA, exosomes, and other markers exist in very small amounts amid normal physiological background.",
            evidence_ladder=[
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_1_IN_VITRO,
                    description="Candidate biomarker classes identified and characterized analytically.",
                    current_claims=[
                        Claim(
                            text="Circulating tumor DNA, circulating tumor cells, proteins, exosomes, and cancer metabolites are emerging as promising early detection markers, though finding accurate signals of early cancer amid normal physiology remains difficult.",
                            source_ids=("science_aay9040",),
                            evidence_tier=EvidenceTier.TIER_1_IN_VITRO,
                        )
                    ],
                ),
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_3_CORRELATIVE_CLINICAL,
                    description="Multimodal marker integration validated against known-stage clinical cohorts.",
                    current_claims=[
                        Claim(
                            text="Advances in machine learning and integration across marker types in multimodal tests are accelerating progress in early detection.",
                            source_ids=("science_aay9040",),
                            evidence_tier=EvidenceTier.TIER_3_CORRELATIVE_CLINICAL,
                        )
                    ],
                ),
            ],
        ),
        SubMechanism(
            name="Overdiagnosis / indolent-lesion discrimination",
            description="Distinguishing lesions that require treatment from indolent disease that would never cause symptoms or death.",
            evidence_ladder=[
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_3_CORRELATIVE_CLINICAL,
                    description="Population screening data showing overdiagnosis rates for a given cancer type (established for prostate via PSA).",
                    current_claims=[
                        Claim(
                            text="Population-wide PSA screening increased detection but drove substantial overdiagnosis and overtreatment of prostate cancer, while reduced screening correlated with more advanced-stage presentations.",
                            source_ids=("oncnursing2026",),
                            evidence_tier=EvidenceTier.TIER_3_CORRELATIVE_CLINICAL,
                        )
                    ],
                ),
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_5_VALIDATED_CLINICAL,
                    description="Randomized trial powered on late-stage incidence or mortality reduction (not just detection/stage-shift) for an MCED test.",
                    current_claims=[],  # GAP — explicitly flagged: stage-shift evidence alone deemed insufficient
                ),
            ],
        ),
    ],
    sources=_p3_sources,
    last_updated=date(2026, 9, 5),
)


# ---------------------------------------------------------------------------
# Problem 4: Metastatic dormancy and reactivation
# ---------------------------------------------------------------------------

_p4_sources = {
    "wang2026": _src(
        "wang2026",
        "Metastatic cancer cell dormancy and reactivation",
        "https://www.nature.com/articles/s41568-026-00928-w",
        date(2026, 4, 24),
        "Nature Reviews Cancer",
    ),
    "chen2026": _src(
        "chen2026",
        "Multidisciplinary Strategies for Targeting Tumor Dormancy in Breast Cancer Therapeutics",
        "https://onlinelibrary.wiley.com/doi/full/10.1002/imm3.70037",
        date(2026, 3, 23),
        "iMetaMed",
    ),
}

problem_4 = Problem(
    problem_id="P04_metastatic_dormancy",
    title="Metastatic dormancy and reactivation",
    summary=(
        "Disseminated tumor cells (DTCs) can persist in a quiescent state for "
        "years or decades before spontaneously reactivating to fuel metastatic "
        "outgrowth. This is distinct from local therapy-induced persister cells "
        "(P01) — it's about disseminated, long-latency dormancy regulated by "
        "niche signals, microenvironment cues, epigenetic reprogramming, and "
        "immune evasion at distant organ sites."
    ),
    sub_mechanisms=[
        SubMechanism(
            name="Niche-derived signals maintaining DCC quiescence",
            description="Microenvironmental factors (ECM, CAFs, endothelial cues) that enforce cellular dormancy.",
            evidence_ladder=[
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_2_IN_VIVO_PRECLINICAL,
                    description="Experimental metastasis models showing DTC dormancy in organ-specific niches.",
                    current_claims=[
                        Claim(
                            text="Microenvironmental drivers of dormancy include niche-derived signals and extracellular matrix composition that maintain DCC quiescence.",
                            source_ids=("wang2026",),
                            evidence_tier=EvidenceTier.TIER_2_IN_VIVO_PRECLINICAL,
                        )
                    ],
                ),
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_3_CORRELATIVE_CLINICAL,
                    description="Human biomarkers predicting dormancy state in CTCs or bone marrow DTCs.",
                    current_claims=[],  # GAP
                ),
            ],
        ),
        SubMechanism(
            name="Immune evasion by dormant cells",
            description="Mechanisms by which quiescent DTCs evade immune surveillance.",
            evidence_ladder=[
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_1_IN_VITRO,
                    description="In vitro characterization of immune evasion strategies.",
                    current_claims=[
                        Claim(
                            text="Dormant DCCs evade immune surveillance through innate and adaptive immune evasion mechanisms.",
                            source_ids=("wang2026",),
                            evidence_tier=EvidenceTier.TIER_1_IN_VITRO,
                        )
                    ],
                ),
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_4_EARLY_CLINICAL,
                    description="Trial data on targeting immune evasion to prevent dormancy reactivation.",
                    current_claims=[],  # GAP
                ),
            ],
        ),
    ],
    sources=_p4_sources,
    last_updated=date(2026, 9, 5),
)


# ---------------------------------------------------------------------------
# Problem 5: PDAC stromal barrier paradox
# ---------------------------------------------------------------------------

_p5_sources = {
    "mdpi2026": _src(
        "mdpi2026",
        "Targeting the Tumour Microenvironment in Pancreatic Cancer: From Stromal Reprogramming to Emerging Therapeutics",
        "https://www.mdpi.com/2673-9879/6/1/12",
        date(2026, 2, 22),
        "MDPI",
    ),
    "sciencedirect2024": _src(
        "sciencedirect2024",
        "Overcoming therapy resistance in pancreatic cancer: New insights and future directions",
        "https://www.sciencedirect.com/science/article/pii/S0006295224004751",
        date(2024, 8, 15),
        "ScienceDirect",
    ),
}

problem_5 = Problem(
    problem_id="P05_pdac_stroma_paradox",
    title="PDAC stromal barrier paradox",
    summary=(
        "The dense fibrotic stroma in pancreatic ductal adenocarcinoma (PDAC) "
        "is a physical/immunological barrier to drug penetration and immune "
        "infiltration, yet preclinical data show that indiscriminate stromal "
        "depletion can revert tumor cells to a more aggressive phenotype, "
        "potentially worsening outcomes. This paradox (stroma is both barrier "
        "and tumor-suppressive) remains unresolved, blocking rational stromal "
        "targeting strategies."
    ),
    sub_mechanisms=[
        SubMechanism(
            name="Stromal barrier function blocking drug delivery",
            description="Extracellular matrix density and CAF-derived components impeding chemotherapy penetration.",
            evidence_ladder=[
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_2_IN_VIVO_PRECLINICAL,
                    description="Preclinical models showing improved drug penetration with stromal modulation.",
                    current_claims=[
                        Claim(
                            text="The dense ECM acts as a physical barrier, impeding drug penetration to PDAC tumor cells, and stromal components protect DTCs from cytotoxic chemotherapies.",
                            source_ids=("mdpi2026",),
                            evidence_tier=EvidenceTier.TIER_2_IN_VIVO_PRECLINICAL,
                        )
                    ],
                ),
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_4_EARLY_CLINICAL,
                    description="Clinical trials demonstrating safety/efficacy of stromal remodeling + chemo.",
                    current_claims=[],  # GAP — many trials failed
                ),
            ],
        ),
        SubMechanism(
            name="Stromal depletion-induced tumor aggressiveness",
            description="Paradoxical finding that CAF/PSC depletion may promote aggressive tumor phenotypes.",
            evidence_ladder=[
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_2_IN_VIVO_PRECLINICAL,
                    description="Mouse models showing worse outcomes with fibroblast depletion.",
                    current_claims=[
                        Claim(
                            text="Preclinical mouse models suggest that depletion of stromal fibroblasts alone carries a risk of reverting PDAC cells to a more progenitor-like and aggressive state with inferior outcomes.",
                            source_ids=("mdpi2026",),
                            evidence_tier=EvidenceTier.TIER_2_IN_VIVO_PRECLINICAL,
                        )
                    ],
                ),
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_3_CORRELATIVE_CLINICAL,
                    description="Human biomarkers linking stromal composition to clinical outcome.",
                    current_claims=[],  # GAP
                ),
            ],
        ),
    ],
    sources=_p5_sources,
    last_updated=date(2026, 9, 5),
)


# ---------------------------------------------------------------------------
# Problem 6: Immune checkpoint inhibitor primary/acquired resistance
# ---------------------------------------------------------------------------

_p6_sources = {
    "zhang2026": _src(
        "zhang2026",
        "Immune Checkpoint Inhibitors in Cancer Therapy: Clinical Landscape, Resistance Mechanisms, and Therapeutic Innovations",
        "https://onlinelibrary.wiley.com/doi/10.1002/mog2.70097",
        date(2026, 9, 4),
        "MedComm – Oncology",
    ),
    "xu2026": _src(
        "xu2026",
        "Pharmacological strategies to overcome immune checkpoint inhibitor resistance in non-small cell lung cancer",
        "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12824025/",
        date(2026, 1, 8),
        "Frontiers in Oncology",
    ),
}

problem_6 = Problem(
    problem_id="P06_ici_resistance",
    title="Immune checkpoint inhibitor primary/acquired resistance",
    summary=(
        "Despite transformative impact in select patients, ~80% of NSCLC and "
        "other solid tumor patients show primary resistance to single-agent ICI, "
        "and among responders, acquired resistance emerges through multiple "
        "pathways: low TMB/neoantigen burden, antigen presentation defects, "
        "interferon signaling disruption, compensatory checkpoint upregulation, "
        "and metabolic reprogramming of the TME. No robust predictive biomarkers "
        "exist to identify non-responders upfront."
    ),
    sub_mechanisms=[
        SubMechanism(
            name="Low neoantigen/TMB-driven primary resistance",
            description="Tumors with few neoantigens cannot mount sufficient T-cell response despite PD-1 blockade.",
            evidence_ladder=[
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_3_CORRELATIVE_CLINICAL,
                    description="Large cohorts correlating TMB/neoantigen burden with ICI response.",
                    current_claims=[
                        Claim(
                            text="ICIs are highly effective for patients with high TMBs, but patients with low neoantigen levels are primarily resistant to ICIs.",
                            source_ids=("xu2026",),
                            evidence_tier=EvidenceTier.TIER_3_CORRELATIVE_CLINICAL,
                        )
                    ],
                ),
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_4_EARLY_CLINICAL,
                    description="Trial data on neoantigen-priming combinations in low-TMB patients.",
                    current_claims=[],  # GAP
                ),
            ],
        ),
        SubMechanism(
            name="Compensatory checkpoint upregulation (acquired resistance)",
            description="LAG-3, TIGIT, TIM-3 upregulation on exhausted T cells during chronic antigenic stimulation under PD-1 blockade.",
            evidence_ladder=[
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_3_CORRELATIVE_CLINICAL,
                    description="Single-cell immune profiling showing co-upregulation of inhibitory checkpoints.",
                    current_claims=[
                        Claim(
                            text="LAG-3 and PD-1 are co-upregulated on tumor-infiltrating T cells through nonredundant mechanisms under chronic antigenic stimulation.",
                            source_ids=("zhang2026",),
                            evidence_tier=EvidenceTier.TIER_3_CORRELATIVE_CLINICAL,
                        )
                    ],
                ),
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_4_EARLY_CLINICAL,
                    description="Multi-checkpoint blockade (LAG-3 + PD-1) efficacy in acquired resistance cohorts.",
                    current_claims=[],  # GAP — early phase only
                ),
            ],
        ),
    ],
    sources=_p6_sources,
    last_updated=date(2026, 9, 5),
)


# ---------------------------------------------------------------------------
# Problem 7: Blood-brain/blood-tumor barrier drug delivery
# ---------------------------------------------------------------------------

_p7_sources = {
    "he2026": _src(
        "he2026",
        "Blood–Brain Barrier: Structure, Function, Diseases, and Drug Delivery Systems",
        "https://onlinelibrary.wiley.com/doi/10.1002/mco2.70712",
        date(2026, 4, 1),
        "MedComm",
    ),
    "gampa2026": _src(
        "gampa2026",
        "Bridging the blood-brain barrier: strategies to improve delivery of biologics to tumors in the brain",
        "https://pubmed.ncbi.nlm.nih.gov/41654916/",
        date(2026, 2, 7),
        "Fluids and Barriers of the CNS",
    ),
}

problem_7 = Problem(
    problem_id="P07_bbb_drug_delivery",
    title="Blood-brain/blood-tumor barrier drug delivery for brain metastases",
    summary=(
        "The BBB restricts ~98% of small-molecule drugs and nearly all "
        "biologics from reaching the brain parenchyma. While the blood-tumor "
        "barrier (BTB) in metastases is slightly 'leaky,' it remains a formidable "
        "obstacle to effective CNS penetration. The degree of BTB compromise is "
        "highly variable (micro-tumors and infiltrative margins retain functional "
        "BBB), and no general strategy reliably delivers cytotoxic or immunotherapy "
        "payloads to brain metastases at therapeutic concentrations without "
        "off-target neurotoxicity."
    ),
    sub_mechanisms=[
        SubMechanism(
            name="BBB/BTB selective permeability barrier function",
            description="Tight junctions and efflux transporters maintaining CNS drug exclusion.",
            evidence_ladder=[
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_1_IN_VITRO,
                    description="In vitro BBB models demonstrating drug transport restrictions.",
                    current_claims=[
                        Claim(
                            text="The BBB restricts approximately 98% of small-molecule therapeutics and nearly all large biomolecules from reaching the brain parenchyma.",
                            source_ids=("he2026",),
                            evidence_tier=EvidenceTier.TIER_1_IN_VITRO,
                        )
                    ],
                ),
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_3_CORRELATIVE_CLINICAL,
                    description="Human studies showing variable BTB permeability by tumor size/location.",
                    current_claims=[
                        Claim(
                            text="The degree of BTB compromise is highly variable with certain regions such as micro-tumors and infiltrative margins of larger tumors having a functional and intact BBB.",
                            source_ids=("gampa2026",),
                            evidence_tier=EvidenceTier.TIER_3_CORRELATIVE_CLINICAL,
                        )
                    ],
                ),
            ],
        ),
        SubMechanism(
            name="Delivery technology efficacy and safety",
            description="Approaches (nanoparticles, cell-penetrating peptides, focused ultrasound) to overcome BBB/BTB.",
            evidence_ladder=[
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_2_IN_VIVO_PRECLINICAL,
                    description="Preclinical proof-of-concept for BBB-penetrating delivery systems.",
                    current_claims=[
                        Claim(
                            text="Cell-penetrating peptides such as angiopep-2 have advanced to clinical trials for drug delivery to brain metastases.",
                            source_ids=("he2026",),
                            evidence_tier=EvidenceTier.TIER_2_IN_VIVO_PRECLINICAL,
                        )
                    ],
                ),
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_4_EARLY_CLINICAL,
                    description="Clinical efficacy and safety data for brain-targeted therapeutics.",
                    current_claims=[],  # GAP
                ),
            ],
        ),
    ],
    sources=_p7_sources,
    last_updated=date(2026, 9, 5),
)


# ---------------------------------------------------------------------------
# Problem 8: Glioblastoma multisystem treatment resistance
# ---------------------------------------------------------------------------

_p8_sources = {
    "kopecka2021": _src(
        "kopecka2021",
        "Overcoming drug resistance in glioblastoma: new options in sight?",
        date(2021, 6, 19),
        "Cancer Drug Resistance",
    ),
    "kordyukova2026": _src(
        "kordyukova2026",
        "Overcoming Chemoresistance in Glioblastoma: Mechanisms, Therapeutic Strategies, and Functional Precision Medicine",
        "https://www.brainlife.org/fulltext/2026/Kordyukova_MY260226_IntJMolSci.pdf",
        date(2026, 2, 26),
        "International Journal of Molecular Sciences",
    ),
}

problem_8 = Problem(
    problem_id="P08_gbm_resistance",
    title="Glioblastoma multisystem treatment resistance",
    summary=(
        "Glioblastoma (Grade IV glioma, ~48% of CNS malignancies) has a 5-year "
        "survival of ~6.9% despite surgery, radiation, and temozolomide (TMZ) — "
        "the standard of care unchanged for ~20 years. Resistance is multifactorial: "
        "BBB/BTB limiting drug entry, MGMT methylation status, cancer stem cells, "
        "genetic heterogeneity (EGFR, PDGFRA, IDH1, PTEN, TP53 alterations), "
        "metabolic rewiring, and hypoxia. No molecular signature reliably predicts "
        "drug sensitivity/resistance."
    ),
    sub_mechanisms=[
        SubMechanism(
            name="MGMT methylation and intrinsic chemoresistance",
            description="Epigenetic silencing of repair gene predicting TMZ response.",
            evidence_ladder=[
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_3_CORRELATIVE_CLINICAL,
                    description="Clinical correlates of MGMT methylation with TMZ response.",
                    current_claims=[
                        Claim(
                            text="MGMT methylation status was the first factor implicated in resistance to TMZ, but this feature alone does not predict TMZ efficacy at the clinical level.",
                            source_ids=("kopecka2021",),
                            evidence_tier=EvidenceTier.TIER_3_CORRELATIVE_CLINICAL,
                        )
                    ],
                ),
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_4_EARLY_CLINICAL,
                    description="Trials of MGMT-informed stratification or epigenetic + TMZ combinations.",
                    current_claims=[],  # GAP
                ),
            ],
        ),
        SubMechanism(
            name="Glioblastoma stem cell-mediated resistance",
            description="Cancer stem cell populations resistant to chemotherapy, radiation, and immunotherapy.",
            evidence_ladder=[
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_2_IN_VIVO_PRECLINICAL,
                    description="Preclinical evidence of stem cell enrichment after therapy.",
                    current_claims=[
                        Claim(
                            text="Cancer stem cells promote resistance to chemotherapy, radiation, and immunotherapy through efflux transporters, proliferation in neurogenic zones, and immune suppression.",
                            source_ids=("kordyukova2026",),
                            evidence_tier=EvidenceTier.TIER_2_IN_VIVO_PRECLINICAL,
                        )
                    ],
                ),
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_4_EARLY_CLINICAL,
                    description="Clinical trials targeting stem cell pathways in relapsed GBM.",
                    current_claims=[],  # GAP
                ),
            ],
        ),
    ],
    sources=_p8_sources,
    last_updated=date(2026, 9, 5),
)


# ---------------------------------------------------------------------------
# Problem 9: Cancer cachexia
# ---------------------------------------------------------------------------

_p9_sources = {
    "zhang2026_cachexia": _src(
        "zhang2026_cachexia",
        "Cancer cachexia: A tumor-driven disorder of whole-body homeostasis",
        "https://repository.cshl.edu/id/eprint/42203/",
        date(2026, 4, 16),
        "Cancer Cell",
    ),
}

problem_9 = Problem(
    problem_id="P09_cancer_cachexia",
    title="Cancer cachexia",
    summary=(
        "Cancer cachexia affects 40-85% of terminally ill patients and accounts "
        "for ~20-30% of cancer deaths. It is a systemic metabolic syndrome "
        "(skeletal muscle atrophy, adipose loss, inflammation, negative energy "
        "balance) that cannot be reversed by nutritional support. Driven by "
        "complex tumor-host interactions (immune, metabolic, endocrine, neural), "
        "cachexia impairs treatment tolerance, quality of life, and survival. "
        "Despite decades of research, no effective mechanism-based therapy exists."
    ),
    sub_mechanisms=[
        SubMechanism(
            name="Tumor-host metabolic signaling driving catabolism",
            description="Cytokine-mediated and neuroendocrine disruption of energy homeostasis.",
            evidence_ladder=[
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_1_IN_VITRO,
                    description="In vitro characterization of cachexia-inducing cytokines (TNF-α, IL-6, IFN-γ).",
                    current_claims=[
                        Claim(
                            text="Cachexia arises from complex interactions between tumors and host organ systems including immune, metabolic, endocrine, and neural networks that reshape energy balance.",
                            source_ids=("zhang2026_cachexia",),
                            evidence_tier=EvidenceTier.TIER_1_IN_VITRO,
                        )
                    ],
                ),
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_3_CORRELATIVE_CLINICAL,
                    description="Human biomarkers (serum cytokines, metabolic signatures) correlating with cachexia severity.",
                    current_claims=[],  # GAP
                ),
            ],
        ),
    ],
    sources=_p9_sources,
    last_updated=date(2026, 9, 5),
)


# ---------------------------------------------------------------------------
# Problem 10: Relapsed/refractory pediatric malignancies
# ---------------------------------------------------------------------------

_p10_sources = {
    "amaral2026": _src(
        "amaral2026",
        "Underlying biology, challenges and emergent concepts in the treatment of relapsed and refractory pediatric T-cell acute lymphoblastic leukemia",
        "https://cronfa.swansea.ac.uk/Record/cronfa70230/Download/70230__35187__119c0a6b58e548a6860d522e9a56516d.pdf",
        date(2026, 9, 1),
        "Pediatric T-ALL review",
    ),
}

problem_10 = Problem(
    problem_id="P10_pediatric_rrx",
    title="Relapsed/refractory pediatric solid tumors and leukemias",
    summary=(
        "Pediatric cancers (neuroblastoma, Wilms tumor, T-ALL) that relapse or "
        "show primary refractory disease carry dismal prognosis (survival <25% "
        "despite aggressive therapy). High-risk neuroblastoma: 10-15% show poor "
        "end-induction response; relapsed patients have extremely unfavorable "
        "disease course. R/R T-ALL similarly characterized by genetic, epigenetic, "
        "and posttranscriptional heterogeneity with organ-specific niches (e.g. CNS "
        "involvement). No standard precision medicine framework exists for matching "
        "individual patient tumors to effective salvage therapies."
    ),
    sub_mechanisms=[
        SubMechanism(
            name="Primary therapy refractory disease",
            description="Tumors showing poor response to induction chemotherapy at diagnosis.",
            evidence_ladder=[
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_3_CORRELATIVE_CLINICAL,
                    description="Clinical data on predictive biomarkers for induction response.",
                    current_claims=[
                        Claim(
                            text="Within high-risk neuroblastoma, 10-15% of patients show a poor end-induction response, whereas achieving a good end-induction response is associated with better long-term survival.",
                            source_ids=("amaral2026",),
                            evidence_tier=EvidenceTier.TIER_3_CORRELATIVE_CLINICAL,
                        )
                    ],
                ),
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_4_EARLY_CLINICAL,
                    description="Intensified induction trials or biomarker-driven salvage therapy trials.",
                    current_claims=[],  # GAP
                ),
            ],
        ),
        SubMechanism(
            name="Genetic/epigenetic heterogeneity driving acquired resistance",
            description="Clonal evolution, niche specialization (e.g., CNS sanctuary sites), and multifactorial mechanisms.",
            evidence_ladder=[
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_1_IN_VITRO,
                    description="Single-cell sequencing or transcriptomic profiling of relapsed samples.",
                    current_claims=[
                        Claim(
                            text="R/R T-ALL is characterized by genetic, epigenetic, and posttranscriptional heterogeneity with organ and niche specificities that underlie therapy resistance.",
                            source_ids=("amaral2026",),
                            evidence_tier=EvidenceTier.TIER_1_IN_VITRO,
                        )
                    ],
                ),
                EvidenceLadderRung(
                    tier=EvidenceTier.TIER_4_EARLY_CLINICAL,
                    description="Precision medicine trials matching relapsed patient tumors to targeted agents.",
                    current_claims=[],  # GAP
                ),
            ],
        ),
    ],
    sources=_p10_sources,
    last_updated=date(2026, 9, 5),
)


ALL_SEED_PROBLEMS = [problem_1, problem_2, problem_3, problem_4, problem_5, problem_6, problem_7, problem_8, problem_9, problem_10]
