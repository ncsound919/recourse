/**
 * Oncology Autonomous Grant Engine — Stages 1-4 as deterministic logic.
 *
 * Stage 1 (registry): SEED_REGISTRY ports all 10 problems from
 *   `seed system/seed_problems.py` (snapshot 2026-09-05) with titles,
 *   summaries, sub-mechanisms, empty-claim gap rungs, and sources w/ real URLs.
 * Stage 2 (gaps → hypotheses): findGaps() + generateHypotheses().
 * Stage 3 (design + review): designExperiments() + scoreProposal().
 * Stage 4 (package): packageGrant() renders Specific Aims / Significance /
 *   Innovation / Approach markdown + budget skeleton with provenance.
 *
 * Rules:
 * - No LLM calls. No fabricated citations. Every Claim must carry ≥1 source_id
 *   that exists in its Problem's `sources` map — enforced by
 *   validateClaimSources(), which packageGrant() calls before rendering and
 *   throws on violation (refuses to render orphan claims).
 * - scoreProposal() is a DOCUMENTED HEURISTIC (text length / specificity
 *   rules), not a reviewer: it approximates NIH 1-9 scale structure
 *   deterministically so the same input always yields the same score.
 */

export type EvidenceTier = 0 | 1 | 2 | 3 | 4 | 5;

export interface Claim {
  text: string;
  sourceIds: string[];
  tier: EvidenceTier;
}

export interface EvidenceLadderRung {
  tier: EvidenceTier;
  description: string;
  claims: Claim[];
}

export interface SubMechanism {
  name: string;
  description: string;
  ladder: EvidenceLadderRung[];
}

export interface SourceMeta {
  title: string;
  url: string;
  pubDate?: string;
  venue?: string;
}

export interface Problem {
  problem_id: string;
  title: string;
  summary: string;
  subMechanisms: SubMechanism[];
  sources: Record<string, SourceMeta>;
  lastUpdated: string;
}

export interface GapRef {
  subMechanism: string;
  tier: EvidenceTier;
  gapDescription: string;
}

export interface Hypothesis {
  id: string;
  problemId: string;
  text: string;
  falsifiable: boolean;
  endpoints: string[];
  gapRef: GapRef;
}

export type ExperimentModality = 'in_vitro' | 'in_vivo' | 'clinical';

export interface ExperimentDesign {
  hypothesisId: string;
  modality: ExperimentModality;
  arms: string[];
  endpoints: string[];
  n: string;
}

export interface ReviewScore {
  significance: number;
  innovation: number;
  approach: number;
  investigator: number;
  environment: number;
  overall: number;
  fundable: boolean;
}

export interface GrantPackage {
  problemId: string;
  aims: string;
  significance: string;
  innovation: string;
  approach: string;
  budgetSkeleton: string;
  provenance: string[];
}

// --- compact builders (registry construction only) ---------------------------

function c(text: string, sourceIds: string[], tier: EvidenceTier): Claim {
  return { text, sourceIds, tier };
}

function rung(tier: EvidenceTier, description: string, claims: Claim[] = []): EvidenceLadderRung {
  return { tier, description, claims };
}

// --- Stage 1: seed registry (ported from seed_problems.py, 2026-09-05) --------

export const SEED_REGISTRY: Problem[] = [
  {
    problem_id: 'P01_persister_dormancy',
    title: 'Drug-tolerant persister cell dormancy and reactivation',
    summary:
      "A subpopulation of tumor cells survives therapy in a reversible, non-genetic drug-tolerant state ('persisters') via phenotypic plasticity rather than mutation, then can reactivate to cause relapse. Distinct from genetically-driven resistance — this is about transient, non-mutational tolerance.",
    subMechanisms: [
      {
        name: 'Phenotypic plasticity into persister state',
        description:
          'Reversible transcriptional/epigenetic reprogramming that lets a cell tolerate drug exposure without genetic mutation.',
        ladder: [
          rung(1, 'Persister phenotypes characterized in cell-line models under drug pressure.', [
            c(
              'Reviews document epigenetic reprogramming and non-coding RNA networks cooperating with metabolic reprogramming to sustain drug-tolerant persister phenotypes in vitro.',
              ['molbiomed2025'],
              1,
            ),
          ]),
          rung(2, 'Persister-to-relapse transition demonstrated in animal models with lineage tracing.', []),
        ],
      },
      {
        name: 'Microenvironment / microbiome modulation of persistence',
        description:
          'Tumor microenvironment and microbiome signals that help sustain or trigger reactivation of persister cells.',
        ladder: [
          rung(1, 'Microbiome-immune crosstalk implicated in resistant phenotype maintenance.', [
            c(
              'The microbiome is highlighted as an emerging determinant of therapeutic response through immune modulation and metabolic cross-talk with resistant tumor cell populations.',
              ['molbiomed2025'],
              1,
            ),
          ]),
          rung(3, 'Human cohort data linking microbiome composition to relapse timing after therapy.', []),
        ],
      },
    ],
    sources: {
      cheng2026: {
        title: 'Cancer drug response and resistance: molecular mechanisms and combating strategies',
        url: 'https://www.nature.com/articles/s41392-026-02924-w',
        pubDate: '2026-08-03',
        venue: 'Signal Transduction and Targeted Therapy',
      },
      plasticity2025: {
        title: 'Cancer cell plasticity and therapeutic resistance: mechanisms, crosstalk, and translational perspectives',
        url: 'https://link.springer.com/article/10.1186/s41065-025-00564-8',
        pubDate: '2025-09-26',
        venue: 'Hereditas',
      },
      molbiomed2025: {
        title: 'Drug resistance in cancer: molecular mechanisms and emerging treatment strategies',
        url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12623568/',
        venue: 'Molecular Biomedicine',
      },
    },
    lastUpdated: '2026-09-05',
  },
  {
    problem_id: 'P02_cart_solid_tumor',
    title: 'CAR-T cell efficacy in solid tumors',
    summary:
      'CAR-T therapy is transformative in hematologic malignancies but pooled objective response in solid tumors is estimated around 9%. The gap is driven by several interacting, separable barriers: antigen heterogeneity/escape, trafficking and stromal penetration, immunosuppressive TME, and exhaustion.',
    subMechanisms: [
      {
        name: 'Antigen heterogeneity and escape',
        description:
          'Lack of truly tumor-specific antigens and variable/loss expression driving relapse after initial response.',
        ladder: [
          rung(2, 'Multi-antigen / logic-gated CAR constructs tested in preclinical models to counter escape.', [
            c(
              'Next-generation strategies including logic-gated systems and co-expression of bispecific T-cell engagers are being tested to address antigen escape.',
              ['onyekweli2026'],
              2,
            ),
          ]),
          rung(4, 'Biomarker-guided selection of engineering strategy validated prospectively in patients.', []),
        ],
      },
      {
        name: 'Trafficking and stromal penetration',
        description:
          'CAR-T cells must traffic through vasculature, penetrate dense stroma, and persist within the immunosuppressive TME.',
        ladder: [
          rung(2, 'Chemokine receptor engineering improving tumor infiltration and persistence in preclinical models.', [
            c(
              "Chemokine receptor engineering to match CAR-T cells' receptor profiles to tumor/stromal chemokines has significantly improved tumor infiltration and persistence in preclinical models.",
              ['cellmed2026'],
              2,
            ),
          ]),
          rung(4, 'Selective tumor migration without off-tumor accumulation demonstrated clinically.', []),
        ],
      },
      {
        name: 'Manufacturing / long-term genomic stability of engineered constructs',
        description:
          'Long-term genomic stability after multiplex gene editing, and manufacturing/regulatory complexity of increasingly engineered constructs.',
        ladder: [
          rung(0, 'Concern flagged in literature; not yet systematically studied.', [
            c(
              'Long-term genomic stability after multiplex gene editing has not been established, and sustained cytokine armoring introduces potential safety concerns.',
              ['onyekweli2026'],
              0,
            ),
          ]),
        ],
      },
    ],
    sources: {
      onyekweli2026: {
        title: 'Engineering CAR-T cells for solid tumors: Overcoming the microenvironment through integrated design and clinical translation',
        url: 'https://www.eurekalert.org/news-releases/1139666',
        pubDate: '2026-08-11',
        venue: 'Oncoscience',
      },
      frontiers2026a: {
        title: 'CAR-T cells in solid tumors: engineering, biomarkers, translational pathways and the road ahead',
        url: 'https://www.frontiersin.org/journals/immunology/articles/10.3389/fimmu.2026.1796675/full',
        pubDate: '2026-03-17',
        venue: 'Frontiers in Immunology',
      },
      cellmed2026: {
        title: 'Current state of CAR-T cell therapies for solid tumors',
        url: 'https://www.cell.com/med/fulltext/S2666-6340(26)00031-0',
        pubDate: '2026-02-16',
        venue: 'Med (Cell Press)',
      },
    },
    lastUpdated: '2026-09-05',
  },
  {
    problem_id: 'P03_mced_overdiagnosis',
    title: 'Multi-cancer early detection: sensitivity/specificity and overdiagnosis tradeoff',
    summary:
      'Roughly half of cancers are diagnosed at advanced stage, motivating multi-cancer early detection (MCED) liquid-biopsy tests. But finding biomarkers of early cancer amid physiological noise is hard, and detecting indolent lesions risks overdiagnosis/overtreatment — test accuracy or stage shift alone is not sufficient; the field lacks trials powered on late-stage/mortality reduction.',
    subMechanisms: [
      {
        name: 'Biomarker signal-to-noise at early stage',
        description:
          'Circulating tumor DNA, exosomes, and other markers exist in very small amounts amid normal physiological background.',
        ladder: [
          rung(1, 'Candidate biomarker classes identified and characterized analytically.', [
            c(
              'Circulating tumor DNA, circulating tumor cells, proteins, exosomes, and cancer metabolites are emerging as promising early detection markers, though finding accurate signals of early cancer amid normal physiology remains difficult.',
              ['science_aay9040'],
              1,
            ),
          ]),
          rung(3, 'Multimodal marker integration validated against known-stage clinical cohorts.', [
            c(
              'Advances in machine learning and integration across marker types in multimodal tests are accelerating progress in early detection.',
              ['science_aay9040'],
              3,
            ),
          ]),
        ],
      },
      {
        name: 'Overdiagnosis / indolent-lesion discrimination',
        description:
          'Distinguishing lesions that require treatment from indolent disease that would never cause symptoms or death.',
        ladder: [
          rung(3, 'Population screening data showing overdiagnosis rates for a given cancer type (established for prostate via PSA).', [
            c(
              'Population-wide PSA screening increased detection but drove substantial overdiagnosis and overtreatment of prostate cancer, while reduced screening correlated with more advanced-stage presentations.',
              ['oncnursing2026'],
              3,
            ),
          ]),
          rung(5, 'Randomized trial powered on late-stage incidence or mortality reduction (not just detection/stage-shift) for an MCED test.', []),
        ],
      },
    ],
    sources: {
      oncnursing2026: {
        title: 'Multicancer Early Detection Testing: Promise and Challenges',
        url: 'https://www.oncnursingnews.com/view/multi-cancer-early-detection-testing-promise-and-challenges',
        pubDate: '2026-05-27',
        venue: 'Oncology Nursing News',
      },
      science_aay9040: {
        title: 'Early detection of cancer',
        url: 'https://www.science.org/doi/10.1126/science.aay9040',
        venue: 'Science',
      },
      frontiers2026b: {
        title: 'Liquid biopsy, multi-cancer early detection, and artificial intelligence: new frontiers in cancer screening',
        url: 'https://www.frontiersin.org/journals/immunology/articles/10.3389/fimmu.2026.1854718/full',
        pubDate: '2026-06-03',
        venue: 'Frontiers in Immunology',
      },
    },
    lastUpdated: '2026-09-05',
  },
  {
    problem_id: 'P04_metastatic_dormancy',
    title: 'Metastatic dormancy and reactivation',
    summary:
      'Disseminated tumor cells (DTCs) can persist in a quiescent state for years or decades before spontaneously reactivating to fuel metastatic outgrowth. Distinct from local therapy-induced persister cells (P01) — disseminated, long-latency dormancy regulated by niche signals, microenvironment cues, epigenetic reprogramming, and immune evasion at distant organ sites.',
    subMechanisms: [
      {
        name: 'Niche-derived signals maintaining DCC quiescence',
        description:
          'Microenvironmental factors (ECM, CAFs, endothelial cues) that enforce cellular dormancy.',
        ladder: [
          rung(2, 'Experimental metastasis models showing DTC dormancy in organ-specific niches.', [
            c(
              'Microenvironmental drivers of dormancy include niche-derived signals and extracellular matrix composition that maintain DCC quiescence.',
              ['wang2026'],
              2,
            ),
          ]),
          rung(3, 'Human biomarkers predicting dormancy state in CTCs or bone marrow DTCs.', []),
        ],
      },
      {
        name: 'Immune evasion by dormant cells',
        description: 'Mechanisms by which quiescent DTCs evade immune surveillance.',
        ladder: [
          rung(1, 'In vitro characterization of immune evasion strategies.', [
            c(
              'Dormant DCCs evade immune surveillance through innate and adaptive immune evasion mechanisms.',
              ['wang2026'],
              1,
            ),
          ]),
          rung(4, 'Trial data on targeting immune evasion to prevent dormancy reactivation.', []),
        ],
      },
    ],
    sources: {
      wang2026: {
        title: 'Metastatic cancer cell dormancy and reactivation',
        url: 'https://www.nature.com/articles/s41568-026-00928-w',
        pubDate: '2026-04-24',
        venue: 'Nature Reviews Cancer',
      },
      chen2026: {
        title: 'Multidisciplinary Strategies for Targeting Tumor Dormancy in Breast Cancer Therapeutics',
        url: 'https://onlinelibrary.wiley.com/doi/full/10.1002/imm3.70037',
        pubDate: '2026-03-23',
        venue: 'iMetaMed',
      },
    },
    lastUpdated: '2026-09-05',
  },
  {
    problem_id: 'P05_pdac_stroma_paradox',
    title: 'PDAC stromal barrier paradox',
    summary:
      'The dense fibrotic stroma in pancreatic ductal adenocarcinoma (PDAC) is a physical/immunological barrier to drug penetration and immune infiltration, yet preclinical data show indiscriminate stromal depletion can revert tumor cells to a more aggressive phenotype. This paradox (stroma is both barrier and tumor-suppressive) remains unresolved, blocking rational stromal targeting strategies.',
    subMechanisms: [
      {
        name: 'Stromal barrier function blocking drug delivery',
        description: 'Extracellular matrix density and CAF-derived components impeding chemotherapy penetration.',
        ladder: [
          rung(2, 'Preclinical models showing improved drug penetration with stromal modulation.', [
            c(
              'The dense ECM acts as a physical barrier, impeding drug penetration to PDAC tumor cells, and stromal components protect DTCs from cytotoxic chemotherapies.',
              ['mdpi2026'],
              2,
            ),
          ]),
          rung(4, 'Clinical trials demonstrating safety/efficacy of stromal remodeling + chemo.', []),
        ],
      },
      {
        name: 'Stromal depletion-induced tumor aggressiveness',
        description: 'Paradoxical finding that CAF/PSC depletion may promote aggressive tumor phenotypes.',
        ladder: [
          rung(2, 'Mouse models showing worse outcomes with fibroblast depletion.', [
            c(
              'Preclinical mouse models suggest that depletion of stromal fibroblasts alone carries a risk of reverting PDAC cells to a more progenitor-like and aggressive state with inferior outcomes.',
              ['mdpi2026'],
              2,
            ),
          ]),
          rung(3, 'Human biomarkers linking stromal composition to clinical outcome.', []),
        ],
      },
    ],
    sources: {
      mdpi2026: {
        title: 'Targeting the Tumour Microenvironment in Pancreatic Cancer: From Stromal Reprogramming to Emerging Therapeutics',
        url: 'https://www.mdpi.com/2673-9879/6/1/12',
        pubDate: '2026-02-22',
        venue: 'MDPI',
      },
      sciencedirect2024: {
        title: 'Overcoming therapy resistance in pancreatic cancer: New insights and future directions',
        url: 'https://www.sciencedirect.com/science/article/pii/S0006295224004751',
        pubDate: '2024-08-15',
        venue: 'ScienceDirect',
      },
    },
    lastUpdated: '2026-09-05',
  },
  {
    problem_id: 'P06_ici_resistance',
    title: 'Immune checkpoint inhibitor primary/acquired resistance',
    summary:
      'Despite transformative impact in select patients, ~80% of NSCLC and other solid tumor patients show primary resistance to single-agent ICI, and among responders acquired resistance emerges through low TMB/neoantigen burden, antigen presentation defects, interferon signaling disruption, compensatory checkpoint upregulation, and metabolic TME reprogramming. No robust predictive biomarkers exist to identify non-responders upfront.',
    subMechanisms: [
      {
        name: 'Low neoantigen/TMB-driven primary resistance',
        description: 'Tumors with few neoantigens cannot mount sufficient T-cell response despite PD-1 blockade.',
        ladder: [
          rung(3, 'Large cohorts correlating TMB/neoantigen burden with ICI response.', [
            c(
              'ICIs are highly effective for patients with high TMBs, but patients with low neoantigen levels are primarily resistant to ICIs.',
              ['xu2026'],
              3,
            ),
          ]),
          rung(4, 'Trial data on neoantigen-priming combinations in low-TMB patients.', []),
        ],
      },
      {
        name: 'Compensatory checkpoint upregulation (acquired resistance)',
        description: 'LAG-3, TIGIT, TIM-3 upregulation on exhausted T cells during chronic antigenic stimulation under PD-1 blockade.',
        ladder: [
          rung(3, 'Single-cell immune profiling showing co-upregulation of inhibitory checkpoints.', [
            c(
              'LAG-3 and PD-1 are co-upregulated on tumor-infiltrating T cells through nonredundant mechanisms under chronic antigenic stimulation.',
              ['zhang2026'],
              3,
            ),
          ]),
          rung(4, 'Multi-checkpoint blockade (LAG-3 + PD-1) efficacy in acquired resistance cohorts.', []),
        ],
      },
    ],
    sources: {
      zhang2026: {
        title: 'Immune Checkpoint Inhibitors in Cancer Therapy: Clinical Landscape, Resistance Mechanisms, and Therapeutic Innovations',
        url: 'https://onlinelibrary.wiley.com/doi/10.1002/mog2.70097',
        pubDate: '2026-09-04',
        venue: 'MedComm – Oncology',
      },
      xu2026: {
        title: 'Pharmacological strategies to overcome immune checkpoint inhibitor resistance in non-small cell lung cancer',
        url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12824025/',
        pubDate: '2026-01-08',
        venue: 'Frontiers in Oncology',
      },
    },
    lastUpdated: '2026-09-05',
  },
  {
    problem_id: 'P07_bbb_drug_delivery',
    title: 'Blood-brain/blood-tumor barrier drug delivery for brain metastases',
    summary:
      'The BBB restricts ~98% of small-molecule drugs and nearly all biologics from reaching the brain parenchyma. While the blood-tumor barrier (BTB) in metastases is slightly leaky, it remains formidable; BTB compromise is highly variable (micro-tumors and infiltrative margins retain functional BBB), and no general strategy reliably delivers payloads at therapeutic concentrations without off-target neurotoxicity.',
    subMechanisms: [
      {
        name: 'BBB/BTB selective permeability barrier function',
        description: 'Tight junctions and efflux transporters maintaining CNS drug exclusion.',
        ladder: [
          rung(1, 'In vitro BBB models demonstrating drug transport restrictions.', [
            c(
              'The BBB restricts approximately 98% of small-molecule therapeutics and nearly all large biomolecules from reaching the brain parenchyma.',
              ['he2026'],
              1,
            ),
          ]),
          rung(3, 'Human studies showing variable BTB permeability by tumor size/location.', [
            c(
              'The degree of BTB compromise is highly variable with certain regions such as micro-tumors and infiltrative margins of larger tumors having a functional and intact BBB.',
              ['gampa2026'],
              3,
            ),
          ]),
        ],
      },
      {
        name: 'Delivery technology efficacy and safety',
        description: 'Approaches (nanoparticles, cell-penetrating peptides, focused ultrasound) to overcome BBB/BTB.',
        ladder: [
          rung(2, 'Preclinical proof-of-concept for BBB-penetrating delivery systems.', [
            c(
              'Cell-penetrating peptides such as angiopep-2 have advanced to clinical trials for drug delivery to brain metastases.',
              ['he2026'],
              2,
            ),
          ]),
          rung(4, 'Clinical efficacy and safety data for brain-targeted therapeutics.', []),
        ],
      },
    ],
    sources: {
      he2026: {
        title: 'Blood–Brain Barrier: Structure, Function, Diseases, and Drug Delivery Systems',
        url: 'https://onlinelibrary.wiley.com/doi/10.1002/mco2.70712',
        pubDate: '2026-04-01',
        venue: 'MedComm',
      },
      gampa2026: {
        title: 'Bridging the blood-brain barrier: strategies to improve delivery of biologics to tumors in the brain',
        url: 'https://pubmed.ncbi.nlm.nih.gov/41654916/',
        pubDate: '2026-02-07',
        venue: 'Fluids and Barriers of the CNS',
      },
    },
    lastUpdated: '2026-09-05',
  },
  {
    problem_id: 'P08_gbm_resistance',
    title: 'Glioblastoma multisystem treatment resistance',
    summary:
      'Glioblastoma (Grade IV glioma, ~48% of CNS malignancies) has a 5-year survival of ~6.9% despite surgery, radiation, and temozolomide (TMZ) — the standard of care unchanged for ~20 years. Resistance is multifactorial: BBB/BTB limiting drug entry, MGMT methylation status, cancer stem cells, genetic heterogeneity (EGFR, PDGFRA, IDH1, PTEN, TP53 alterations), metabolic rewiring, and hypoxia. No molecular signature reliably predicts drug sensitivity/resistance.',
    subMechanisms: [
      {
        name: 'MGMT methylation and intrinsic chemoresistance',
        description: 'Epigenetic silencing of repair gene predicting TMZ response.',
        ladder: [
          rung(3, 'Clinical correlates of MGMT methylation with TMZ response.', [
            c(
              'MGMT methylation status was the first factor implicated in resistance to TMZ, but this feature alone does not predict TMZ efficacy at the clinical level.',
              ['kopecka2021'],
              3,
            ),
          ]),
          rung(4, 'Trials of MGMT-informed stratification or epigenetic + TMZ combinations.', []),
        ],
      },
      {
        name: 'Glioblastoma stem cell-mediated resistance',
        description: 'Cancer stem cell populations resistant to chemotherapy, radiation, and immunotherapy.',
        ladder: [
          rung(2, 'Preclinical evidence of stem cell enrichment after therapy.', [
            c(
              'Cancer stem cells promote resistance to chemotherapy, radiation, and immunotherapy through efflux transporters, proliferation in neurogenic zones, and immune suppression.',
              ['kordyukova2026'],
              2,
            ),
          ]),
          rung(4, 'Clinical trials targeting stem cell pathways in relapsed GBM.', []),
        ],
      },
    ],
    sources: {
      // NOTE: seed_problems.py passes the pub date where the URL belongs for
      // kopecka2021 (arg-order slip); URL below is the real article page.
      kopecka2021: {
        title: 'Overcoming drug resistance in glioblastoma: new options in sight?',
        url: 'https://www.oaepublish.com/articles/cdr.2021.03',
        pubDate: '2021-06-19',
        venue: 'Cancer Drug Resistance',
      },
      kordyukova2026: {
        title: 'Overcoming Chemoresistance in Glioblastoma: Mechanisms, Therapeutic Strategies, and Functional Precision Medicine',
        url: 'https://www.brainlife.org/fulltext/2026/Kordyukova_MY260226_IntJMolSci.pdf',
        pubDate: '2026-02-26',
        venue: 'International Journal of Molecular Sciences',
      },
    },
    lastUpdated: '2026-09-05',
  },
  {
    problem_id: 'P09_cancer_cachexia',
    title: 'Cancer cachexia',
    summary:
      'Cancer cachexia affects 40-85% of terminally ill patients and accounts for ~20-30% of cancer deaths. It is a systemic metabolic syndrome (skeletal muscle atrophy, adipose loss, inflammation, negative energy balance) that cannot be reversed by nutritional support. Driven by complex tumor-host interactions (immune, metabolic, endocrine, neural), cachexia impairs treatment tolerance, quality of life, and survival. No effective mechanism-based therapy exists.',
    subMechanisms: [
      {
        name: 'Tumor-host metabolic signaling driving catabolism',
        description: 'Cytokine-mediated and neuroendocrine disruption of energy homeostasis.',
        ladder: [
          rung(1, 'In vitro characterization of cachexia-inducing cytokines (TNF-α, IL-6, IFN-γ).', [
            c(
              'Cachexia arises from complex interactions between tumors and host organ systems including immune, metabolic, endocrine, and neural networks that reshape energy balance.',
              ['zhang2026_cachexia'],
              1,
            ),
          ]),
          rung(3, 'Human biomarkers (serum cytokines, metabolic signatures) correlating with cachexia severity.', []),
        ],
      },
    ],
    sources: {
      zhang2026_cachexia: {
        title: 'Cancer cachexia: A tumor-driven disorder of whole-body homeostasis',
        url: 'https://repository.cshl.edu/id/eprint/42203/',
        pubDate: '2026-04-16',
        venue: 'Cancer Cell',
      },
    },
    lastUpdated: '2026-09-05',
  },
  {
    problem_id: 'P10_pediatric_rrx',
    title: 'Relapsed/refractory pediatric solid tumors and leukemias',
    summary:
      'Pediatric cancers (neuroblastoma, Wilms tumor, T-ALL) that relapse or show primary refractory disease carry dismal prognosis (survival <25% despite aggressive therapy). High-risk neuroblastoma: 10-15% show poor end-induction response; relapsed patients have extremely unfavorable disease course. No standard precision medicine framework exists for matching individual patient tumors to effective salvage therapies.',
    subMechanisms: [
      {
        name: 'Primary therapy refractory disease',
        description: 'Tumors showing poor response to induction chemotherapy at diagnosis.',
        ladder: [
          rung(3, 'Clinical data on predictive biomarkers for induction response.', [
            c(
              'Within high-risk neuroblastoma, 10-15% of patients show a poor end-induction response, whereas achieving a good end-induction response is associated with better long-term survival.',
              ['amaral2026'],
              3,
            ),
          ]),
          rung(4, 'Intensified induction trials or biomarker-driven salvage therapy trials.', []),
        ],
      },
      {
        name: 'Genetic/epigenetic heterogeneity driving acquired resistance',
        description: 'Clonal evolution, niche specialization (e.g., CNS sanctuary sites), and multifactorial mechanisms.',
        ladder: [
          rung(1, 'Single-cell sequencing or transcriptomic profiling of relapsed samples.', [
            c(
              'R/R T-ALL is characterized by genetic, epigenetic, and posttranscriptional heterogeneity with organ and niche specificities that underlie therapy resistance.',
              ['amaral2026'],
              1,
            ),
          ]),
          rung(4, 'Precision medicine trials matching relapsed patient tumors to targeted agents.', []),
        ],
      },
    ],
    sources: {
      amaral2026: {
        title: 'Underlying biology, challenges and emergent concepts in the treatment of relapsed and refractory pediatric T-cell acute lymphoblastic leukemia',
        url: 'https://cronfa.swansea.ac.uk/Record/cronfa70230/Download/70230__35187__119c0a6b58e548a6860d522e9a56516d.pdf',
        pubDate: '2026-09-01',
        venue: 'Pediatric T-ALL review',
      },
    },
    lastUpdated: '2026-09-05',
  },
];

// --- Stage 1 accessors -------------------------------------------------------

export function listProblems(): Problem[] {
  return SEED_REGISTRY;
}

export function getProblem(id: string): Problem {
  const p = SEED_REGISTRY.find((x) => x.problem_id === id);
  if (!p) throw new Error(`unknown problem_id: ${id}`);
  return p;
}

// --- Provenance enforcement --------------------------------------------------

/** Throws if any claim in the problem has empty sourceIds or an unknown source id. */
export function validateClaimSources(problem: Problem): void {
  for (const sm of problem.subMechanisms) {
    for (const r of sm.ladder) {
      for (const claim of r.claims) {
        if (!claim.sourceIds || claim.sourceIds.length === 0) {
          throw new Error(
            `orphan claim refused [${problem.problem_id} / ${sm.name} / T${r.tier}]: "${claim.text.slice(0, 80)}…" has no source_ids`,
          );
        }
        for (const sid of claim.sourceIds) {
          if (!problem.sources[sid]) {
            throw new Error(
              `unknown source_id "${sid}" [${problem.problem_id}]: not present in problem sources map`,
            );
          }
        }
      }
    }
  }
}

// --- Stage 2: gaps → hypotheses ----------------------------------------------

export function findGaps(problemId: string): GapRef[] {
  const p = getProblem(problemId);
  const gaps: GapRef[] = [];
  for (const sm of p.subMechanisms) {
    for (const r of sm.ladder) {
      if (r.claims.length === 0) {
        gaps.push({ subMechanism: sm.name, tier: r.tier, gapDescription: r.description });
      }
    }
  }
  return gaps;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function endpointsForTier(tier: EvidenceTier): string[] {
  switch (tier) {
    case 0:
    case 1:
      return ['in vitro target modulation (qPCR/protein readout)', 'dose-response EC50'];
    case 2:
      return ['tumor growth inhibition (%TGI)', 'pharmacodynamic target engagement'];
    case 3:
      return ['correlative biomarker association (OR/HR with 95% CI)', 'assay sensitivity/specificity'];
    case 4:
      return ['objective response rate (RECIST)', 'grade ≥3 adverse event rate'];
    case 5:
      return ['overall survival (HR)', 'late-stage incidence / mortality reduction'];
  }
}

/**
 * One falsifiable hypothesis per gap rung. Each hypothesis text names the gap
 * it addresses (sub-mechanism + gap description) and states a measurable,
 * refutable prediction — no new factual claims, so no new citations needed.
 */
export function generateHypotheses(problemId: string): Hypothesis[] {
  const gaps = findGaps(problemId);
  return gaps.map((g, i) => ({
    id: `${problemId}_H${i + 1}_${slug(g.subMechanism)}_T${g.tier}`,
    problemId,
    text:
      `Addressing the gap in "${g.subMechanism}" (T${g.tier}: ${g.gapDescription}): ` +
      `we hypothesize that a targeted intervention at this rung will produce a measurable effect on ` +
      `${endpointsForTier(g.tier)[0]} versus control. ` +
      `This hypothesis is falsified if the intervention arm shows no statistically significant ` +
      `difference from control on the primary endpoint.`,
    falsifiable: true,
    endpoints: endpointsForTier(g.tier),
    gapRef: g,
  }));
}

// --- Stage 3: design + review --------------------------------------------------

/** Modality mapped deterministically from gap tier: T0-1→in_vitro, T2→in_vivo, T3-5→clinical. */
export function modalityForTier(tier: EvidenceTier): ExperimentModality {
  if (tier <= 1) return 'in_vitro';
  if (tier === 2) return 'in_vivo';
  return 'clinical';
}

export function designExperiments(problemId: string): ExperimentDesign[] {
  return generateHypotheses(problemId).map((h) => {
    const modality = modalityForTier(h.gapRef.tier);
    if (modality === 'in_vitro') {
      return {
        hypothesisId: h.id,
        modality,
        arms: ['vehicle control', 'targeted intervention (3 dose levels)'],
        endpoints: h.endpoints,
        n: 'n=3 biological replicates × 3 technical replicates per condition',
      };
    }
    if (modality === 'in_vivo') {
      return {
        hypothesisId: h.id,
        modality,
        arms: ['vehicle control', 'standard-of-care comparator', 'experimental intervention'],
        endpoints: h.endpoints,
        n: 'n=10 animals/arm (80% power, α=0.05 for 50% TGI effect)',
      };
    }
    return {
      hypothesisId: h.id,
      modality,
      arms: ['standard-of-care control', 'experimental intervention'],
      endpoints: [...h.endpoints, 'secondary: progression-free survival'],
      n: 'n per Simon 2-stage (p0=0.10, p1=0.30, α=0.05, β=0.20): stage 1 n=10, total n=29 if stage-1 bar met',
    };
  });
}

// --- Deterministic NIH-style heuristic review ----------------------------------
// HEURISTIC, NOT A REVIEWER: scores derive only from text length/specificity
// rules below. NIH scale 1 (exceptional) → 9 (poor). fundable ⟺ overall ≤ 3.
// These numbers approximate proposal *specificity*, never scientific merit.

const SPECIFICITY_TERMS = [
  'randomized', 'control', 'endpoint', 'survival', 'biomarker', 'dose',
  'versus', 'statistically', 'recist', 'toxicity', 'stratification', 'blinded',
];

function termHits(text: string): number {
  const lower = text.toLowerCase();
  return SPECIFICITY_TERMS.filter((t) => lower.includes(t)).length;
}

/** Score one 1-9 criterion from word count + specificity-term hits. Pure & deterministic. */
function criterionScore(text: string, offset: number): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  const hits = termHits(text);
  // Longer, more specific text → better (lower) score. Base 7, each 12 words
  // improves by 1, each specificity term improves by 1, plus a fixed per-criterion offset.
  const raw = 7 - Math.floor(words / 12) - hits + offset;
  return Math.min(9, Math.max(1, raw));
}

export function scoreProposal(h: Hypothesis, exp: ExperimentDesign): ReviewScore {
  const combined = `${h.text} ${exp.arms.join(' ')} ${exp.endpoints.join(' ')}`;
  const significance = criterionScore(combined, 0);
  const innovation = criterionScore(`${h.gapRef.gapDescription} ${h.text}`, 1);
  const approach = criterionScore(`${exp.arms.join(' ')} ${exp.endpoints.join(' ')} ${exp.n}`, 0);
  const investigator = 5; // heuristic has no investigator/environment signal → neutral midpoint, documented
  const environment = 5;
  const overall = Math.round((significance + innovation + approach + investigator + environment) / 5);
  return { significance, innovation, approach, investigator, environment, overall, fundable: overall <= 3 };
}

// --- Stage 4: grant packaging ---------------------------------------------------

function supportedClaimsSection(problem: Problem): string {
  const lines: string[] = [];
  for (const sm of problem.subMechanisms) {
    for (const r of sm.ladder) {
      for (const claim of r.claims) {
        // Double-enforce at render time: never emit a claim line without its sources.
        if (!claim.sourceIds || claim.sourceIds.length === 0) {
          throw new Error(`refusing to render orphan claim: "${claim.text.slice(0, 80)}…"`);
        }
        lines.push(`- [T${r.tier} · ${sm.name}] ${claim.text} (sources: ${claim.sourceIds.join(', ')})`);
      }
    }
  }
  return lines.join('\n');
}

function budgetForModalities(mods: ExperimentModality[]): string {
  const COST: Record<ExperimentModality, string> = {
    in_vitro: 'Cell culture/supplies $40k; reagents/assays $35k; personnel 0.5 FTE $60k',
    in_vivo: 'Animal per-diem + husbandry $55k; PD/PK core $45k; personnel 1.0 FTE $120k',
    clinical: 'Trial operations/biospecimen $150k; biostatistics core $40k; personnel 1.5 FTE $180k',
  };
  const uniq = [...new Set(mods)];
  const rows = uniq.map((m) => `- ${m}: ${COST[m]} (skeleton placeholder — replace with institutional rates)`);
  return ['## Budget skeleton (Year 1 direct-cost placeholders)', ...rows, '', 'Total Year-1 placeholder direct costs: sum of rows above. Indirects per institutional rate.'].join('\n');
}

/**
 * Builds the Specific Aims / Significance / Innovation / Approach markdown +
 * budget skeleton. REFUSES to render if any registry claim lacks source_ids
 * (throws via validateClaimSources + per-line render check).
 */
export function packageGrant(problemId: string): GrantPackage {
  const problem = getProblem(problemId);
  validateClaimSources(problem);

  const hypotheses = generateHypotheses(problemId);
  const experiments = designExperiments(problemId);
  if (hypotheses.length === 0) throw new Error(`no gaps to propose aims for [${problemId}]`);

  const provenance = Object.keys(problem.sources).sort();

  const aimsBody = hypotheses
    .map((h, i) => `### Aim ${i + 1}: ${h.gapRef.subMechanism}\n\n${h.text}\n\nPrimary endpoint(s): ${h.endpoints.join('; ')}.\nDesign: ${experiments[i].modality} — arms: ${experiments[i].arms.join(' | ')} (${experiments[i].n}).`)
    .join('\n\n');

  const aims = `# Specific Aims — ${problem.title}\n\n${problem.summary}\n\n${aimsBody}`;
  const significance = `# Significance\n\n${problem.summary}\n\nSupported claims (all sourced; orphan claims are refused at render time):\n\n${supportedClaimsSection(problem)}`;
  const innovation =
    `# Innovation\n\nEach aim targets an explicit evidence gap (a ladder rung with zero current claims) ` +
    `rather than repeating established rungs: ${hypotheses.map((h) => `T${h.gapRef.tier} ${h.gapRef.subMechanism}`).join('; ')}.`;
  const approach =
    `# Approach\n\n${experiments.map((e, i) => `Aim ${i + 1} (${e.modality}): ${e.arms.join(' vs. ')}; endpoints ${e.endpoints.join('; ')}; ${e.n}.`).join('\n\n')}` +
    `\n\nFalsifiability: each hypothesis states the control comparison whose failure refutes it.`;
  const budgetSkeleton = budgetForModalities(experiments.map((e) => e.modality));

  return {
    problemId,
    aims,
    significance,
    innovation,
    approach,
    budgetSkeleton,
    provenance: [...provenance, ...provenance.map((sid) => problem.sources[sid].url)],
  };
}
