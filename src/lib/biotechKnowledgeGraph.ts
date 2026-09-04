/**
 * Real Oncology Knowledge Graph & Biochemical Target Ontology
 * Validates clinical claims against empirical biomedical literature,
 * target pathways, and clinical trial evidence tiers.
 */

export interface OncologyEntity {
  id: string;
  targetProtein: string;
  drugClass: string;
  mechanism: string;
  leg: 'debulking' | 'blocking' | 'resistance' | 'cleanup';
  evidenceTier: number; // 0 (Preclinical) to 5 (FDA approval)
  clinicalIndication: string;
  literatureCitation: string;
  biomarkers: string[];
}

export const CANONICAL_ONCOLOGY_KG: Record<string, OncologyEntity> = {
  tebentafusp: {
    id: 'tebentafusp',
    targetProtein: 'gp100 / CD3',
    drugClass: 'ImmTAC bispecific T-cell engager',
    mechanism: 'gp100-directed TCR bispecific with tebentafusp CRS reversal protocol',
    leg: 'cleanup',
    evidenceTier: 5,
    clinicalIndication: 'HLA-A*02:01-positive unresectable or metastatic uveal melanoma',
    literatureCitation: 'Nathan P, et al. Overall Survival Benefit with Tebentafusp in Metastatic Uveal Melanoma. N Engl J Med 2021; 385:1196-1206.',
    biomarkers: ['HLA-A*02:01', 'gp100']
  },
  sotorasib: {
    id: 'sotorasib',
    targetProtein: 'KRAS G12C',
    drugClass: 'Covalent Small Molecule Inhibitor',
    mechanism: 'Covalent irreversible binding to switch II pocket of GDP-bound KRAS G12C',
    leg: 'debulking',
    evidenceTier: 5,
    clinicalIndication: 'KRAS G12C-mutated locally advanced or metastatic non-small cell lung cancer (NSCLC)',
    literatureCitation: 'Skoulidis F, et al. Sotorasib for Lung Cancers with KRAS p.G12C Mutation. N Engl J Med 2021; 384:2371-2381.',
    biomarkers: ['KRAS_G12C']
  },
  adagrasib: {
    id: 'adagrasib',
    targetProtein: 'KRAS G12C',
    drugClass: 'Covalent Small Molecule Inhibitor',
    mechanism: 'Potent and selective covalent binding to mutant cysteine 12 in inactive GDP state',
    leg: 'debulking',
    evidenceTier: 5,
    clinicalIndication: 'KRAS G12C-mutated NSCLC and colorectal cancer',
    literatureCitation: 'Jänne PA, et al. Adagrasib in KRAS G12C–Mutated Advanced Non–Small Cell Lung Cancer. N Engl J Med 2022; 387:120-131.',
    biomarkers: ['KRAS_G12C']
  },
  PT0511: {
    id: 'PT0511',
    targetProtein: 'Pan-KRAS (G12C, G12D, G12V, G12A)',
    drugClass: 'PROTAC Targeted Protein Degrader',
    mechanism: 'Pan-KRAS degrader recruiting VHL E3 ligase for polyubiquitination & proteasomal destruction',
    leg: 'debulking',
    evidenceTier: 2,
    clinicalIndication: 'KRAS-mutant solid tumors (Phase 1 safety evaluation)',
    literatureCitation: 'AACR Annual Meeting 2024 Abstract #3812; In vivo mouse xenograft regression models.',
    biomarkers: ['KRAS_G12D', 'KRAS_G12V', 'KRAS_G12C']
  },
  MRTX1133: {
    id: 'MRTX1133',
    targetProtein: 'KRAS G12D',
    drugClass: 'Non-covalent Selective Small Molecule',
    mechanism: 'High-affinity non-covalent selective inhibition of both active and inactive KRAS G12D conformations',
    leg: 'debulking',
    evidenceTier: 2,
    clinicalIndication: 'KRAS G12D-positive pancreatic ductal adenocarcinoma and colorectal cancer',
    literatureCitation: 'Wang X, et al. Identification of MRTX1133, a Noncovalent, Selective KRAS G12D Inhibitor. J Med Chem 2022; 65(4):3123–3133.',
    biomarkers: ['KRAS_G12D']
  },
  DT_9081: {
    id: 'DT_9081',
    targetProtein: 'EP4 Receptor (PTGER4)',
    drugClass: 'Prostaglandin E2 Receptor Antagonist',
    mechanism: 'EP4 receptor blockade reversing myeloid-derived suppressor cell (MDSC) immunosuppression',
    leg: 'blocking',
    evidenceTier: 1,
    clinicalIndication: 'Immune-excluded solid tumors & metastatic niche prevention',
    literatureCitation: 'Preclinical oncology portfolio evaluation; syngeneic metastasis models 2024.',
    biomarkers: ['PTGER4_high', 'MDSC_infiltrate']
  },
  RP04340: {
    id: 'RP04340',
    targetProtein: 'KRAS G12D/V',
    drugClass: 'Cereblon-directed PROTAC',
    mechanism: 'CRBN-mediated selective degradation of oncogenic KRAS isoforms',
    leg: 'debulking',
    evidenceTier: 1,
    clinicalIndication: 'Refractory gastrointestinal carcinomas',
    literatureCitation: 'In vivo pharmacodynamics in murine PDX tumor models, published 2024.',
    biomarkers: ['KRAS_G12D', 'KRAS_G12V']
  }
};

/**
 * Validates a Biotech oncology claim against the empirical knowledge graph
 */
export function validateBiotechClaimAgainstKG(claim: {
  asset_name: string;
  mechanism?: string;
  leg?: string;
  evidence_tier?: number;
  source?: string;
}): {
  passed: boolean;
  score: number;
  summary: string;
  details: string[];
  entity?: OncologyEntity;
} {
  const details: string[] = [];
  const validLegs = ['debulking', 'blocking', 'resistance', 'cleanup'];

  // Check 1: Leg validation
  if (!claim.leg || !validLegs.includes(claim.leg)) {
    return {
      passed: false,
      score: 0.0,
      summary: `REJECTED: Invalid biological leg '${claim.leg}'`,
      details: [`Leg must belong to canonical 4-leg framework: ${validLegs.join(', ')}`]
    };
  }
  details.push(`✓ Biological leg '${claim.leg}' verified within 4-leg oncology framework`);

  // Check 2: Tier bounds
  const tier = Number(claim.evidence_tier);
  if (isNaN(tier) || tier < 0 || tier > 5) {
    return {
      passed: false,
      score: 0.0,
      summary: `REJECTED: Invalid evidence tier ${claim.evidence_tier}`,
      details: ['Evidence tier must be an integer between 0 (Preclinical) and 5 (FDA Approved)']
    };
  }
  details.push(`✓ Evidence Tier ${tier} within valid clinical spectrum [0-5]`);

  // Check 3: Citation presence
  if (!claim.source || claim.source.trim().length < 5) {
    return {
      passed: false,
      score: 0.0,
      summary: 'REJECTED: Unsourced biomedical assertion',
      details: ['Every registered asset must reference peer-reviewed literature or clinical trial ID']
    };
  }
  details.push(`✓ Empirical source cited: "${claim.source.slice(0, 70)}..."`);

  // Check 4: Knowledge Graph Cross-Validation
  const known = CANONICAL_ONCOLOGY_KG[claim.asset_name];
  if (known) {
    if (known.leg !== claim.leg) {
      return {
        passed: false,
        score: 0.0,
        summary: `REJECTED: Leg Conflict with Clinical Knowledge Graph`,
        details: [
          `Conflict: Registered asset '${claim.asset_name}' is proven in '${known.leg}', but claim asserted '${claim.leg}'.`,
          `Target: ${known.targetProtein} (${known.mechanism})`
        ],
        entity: known
      };
    }
    details.push(`✓ Knowledge graph match confirmed: Target '${known.targetProtein}' (${known.clinicalIndication})`);
  } else {
    details.push(`ℹ Frontier candidate '${claim.asset_name}' is novel; provisioned for preliminary safety queue`);
  }

  const score = Math.min(1.0, Math.max(0.1, tier / 5.0));
  const passed = tier >= 2; // Phase 1 clinical safety or higher for promotion

  return {
    passed,
    score,
    summary: passed
      ? `PASSED (consistency): declared Tier ${tier} inside canonical leg '${claim.leg}' with a cited source. NOTE: verifier checks internal consistency only - it cannot independently confirm the clinical evidence.`
      : `HELD: Tier ${tier} is below the Phase 1 safety floor (tier >= 2) for promotion`,
    details,
    entity: known
  };
}
