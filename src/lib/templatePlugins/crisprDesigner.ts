/**
 * CRISPR guide RNA designer template plugin — published scoring models only.
 *
 * Replaces the earlier hand-tuned "Doench 2016-style" heuristics (which were
 * neither Doench 2016 nor verifiable) with two published, deterministic models:
 *
 * 1. On-target: Doench 2014 "Rule Set 1" logistic score (Doench et al., Nat
 *    Biotech 2014, PMID 25184501). Coefficients transcribed verbatim from the
 *    CRISPOR reference implementation (crisporWebsite/crisporEffScores.py,
 *    calcDoenchScores — "Code reproduced following paper's methods section"),
 *    which carries the same doctest vector used in our test suite.
 *    Input: 30mer = 4bp 5' flank + 20bp guide + 3bp PAM + 3bp 3' flank.
 *    Doench 2016 "Rule Set 2" is NOT included: it is a gradient-boosted
 *    regression-tree model distributed only as a pickled scikit-learn model
 *    (Azimuth) — not portable to a sandboxed JS module.
 *
 * 2. Off-target: CFD (Cutting Frequency Determination) score (Doench et al.,
 *    Nat Biotech 2016, PMID 26780180). Position/type-specific mismatch penalty
 *    table + PAM weights extracted from the official CFD_Scoring pickles
 *    (crisporWebsite/CFD_Scoring) and validated against the published reference
 *    values (iGWOS CFD/otscore.py doctests; crisprVerse/crisprScore R examples).
 *
 * Honest scope:
 * - design() enumerates guides in the sequence you give it. It does NOT search
 *   a genome: real off-target enumeration needs Cas-OFFinder / BWA against a
 *   reference genome. cfdScore() only scores a candidate off-target 23mer that
 *   YOU provide (e.g. from a BLAST/Cas-OFFinder hit).
 * - On-target scores are probabilistic predictions (Pearson r ≈ 0.4 to observed
 *   cleavage even for the full Rule Set 2 — Haeussler et al., Genome Biology
 *   2016). Ranking aid, not a guarantee.
 * - Quality flags are published design rules: TTTT is a Pol III terminator
 *   (Gao & Herrera-Carrillo, Mol Ther Nucleic Acids 2017 — T4 is the minimal
 *   terminator; Graham & Root, Genome Biology 2015), a 5' G aids U6 initiation
 *   (Graham & Root 2015), guides ending -GG rank well for U6 (Haeussler 2016).
 */

import type { ToolDomain, ComponentTemplateParam, ComponentTemplateCategory } from '../../types';
import type { TemplatePlugin } from '../templatePlugin';

// --- Doench 2014 (Rule Set 1) coefficients — verbatim from CRISPOR ----------
// (0-based positions into the 30mer: 4bp 5' + 20bp guide + 3bp PAM + 3bp 3')
const DOENCH_INTERCEPT = 0.59763615;
const DOENCH_GC_HIGH = -0.1665878;
const DOENCH_GC_LOW = -0.2026259;
const DOENCH_PARAMS: Array<[number, string, number]> = [
  [1, 'G', -0.2753771], [2, 'A', -0.3238875], [2, 'C', 0.17212887], [3, 'C', -0.1006662],
  [4, 'C', -0.2018029], [4, 'G', 0.24595663], [5, 'A', 0.03644004], [5, 'C', 0.09837684],
  [6, 'C', -0.7411813], [6, 'G', -0.3932644], [11, 'A', -0.466099], [14, 'A', 0.08537695],
  [14, 'C', -0.013814], [15, 'A', 0.27262051], [15, 'C', -0.1190226], [15, 'T', -0.2859442],
  [16, 'A', 0.09745459], [16, 'G', -0.1755462], [17, 'C', -0.3457955], [17, 'G', -0.6780964],
  [18, 'A', 0.22508903], [18, 'C', -0.5077941], [19, 'G', -0.4173736], [19, 'T', -0.054307],
  [20, 'G', 0.37989937], [20, 'T', -0.0907126], [21, 'C', 0.05782332], [21, 'T', -0.5305673],
  [22, 'T', -0.8770074], [23, 'C', -0.8762358], [23, 'G', 0.27891626], [23, 'T', -0.4031022],
  [24, 'A', -0.0773007], [24, 'C', 0.28793562], [24, 'T', -0.2216372], [27, 'G', -0.6890167],
  [27, 'T', 0.11787758], [28, 'C', -0.1604453], [29, 'G', 0.38634258], [1, 'GT', -0.6257787],
  [4, 'GC', 0.30004332], [5, 'AA', -0.8348362], [5, 'TA', 0.76062777], [6, 'GG', -0.4908167],
  [11, 'GG', -1.5169074], [11, 'TA', 0.7092612], [11, 'TC', 0.49629861], [11, 'TT', -0.5868739],
  [12, 'GG', -0.3345637], [13, 'GA', 0.76384993], [13, 'GC', -0.5370252], [16, 'TG', -0.7981461],
  [18, 'GG', -0.6668087], [18, 'TC', 0.35318325], [19, 'CC', 0.74807209], [19, 'TG', -0.3672668],
  [20, 'AC', 0.56820913], [20, 'CG', 0.32907207], [20, 'GA', -0.8364568], [20, 'GG', -0.7822076],
  [21, 'TC', -1.029693], [22, 'CG', 0.85619782], [22, 'CT', -0.4632077], [23, 'AA', -0.5794924],
  [23, 'AG', 0.64907554], [24, 'AG', -0.0773007], [24, 'CG', 0.28793562], [24, 'TG', -0.2216372],
  [26, 'GT', 0.11787758], [28, 'GG', -0.69774],
];

// --- CFD tables — extracted from the official CFD_Scoring pickles -----------
// Mismatch penalties: RNA guide base (r) vs revcom of the off-target DNA base
// (d) at 1-based protospacer positions 1..20. Only the 12 real mismatch types
// exist (rX:dX self-identities are never looked up — matching bases score 1).
const CFD_MM: Record<string, number[]> = {
  'rA:dA': [1, 0.727272727, 0.705882353, 0.636363636, 0.363636364, 0.714285714, 0.4375, 0.428571429, 0.6, 0.882352941, 0.307692308, 0.333333333, 0.3, 0.533333333, 0.2, 0, 0.133333333, 0.5, 0.538461538, 0.6],
  'rA:dC': [1, 0.8, 0.611111111, 0.625, 0.72, 0.714285714, 0.705882353, 0.733333333, 0.666666667, 0.555555556, 0.65, 0.722222222, 0.652173913, 0.466666667, 0.65, 0.192307692, 0.176470588, 0.4, 0.375, 0.764705882],
  'rA:dG': [0.857142857, 0.785714286, 0.428571429, 0.352941176, 0.5, 0.454545455, 0.4375, 0.428571429, 0.571428571, 0.333333333, 0.4, 0.263157895, 0.210526316, 0.214285714, 0.272727273, 0, 0.176470588, 0.19047619, 0.206896552, 0.227272727],
  'rC:dA': [1, 0.909090909, 0.6875, 0.8, 0.636363636, 0.928571429, 0.8125, 0.875, 0.875, 0.941176471, 0.307692308, 0.538461538, 0.7, 0.733333333, 0.066666667, 0.307692308, 0.466666667, 0.642857143, 0.461538462, 0.3],
  'rC:dC': [0.913043478, 0.695652174, 0.5, 0.5, 0.6, 0.5, 0.470588235, 0.642857143, 0.619047619, 0.388888889, 0.25, 0.444444444, 0.136363636, 0, 0.05, 0.153846154, 0.058823529, 0.133333333, 0.125, 0.058823529],
  'rC:dT': [1, 0.727272727, 0.866666667, 0.842105263, 0.571428571, 0.928571429, 0.75, 0.65, 0.857142857, 0.866666667, 0.75, 0.714285714, 0.384615385, 0.35, 0.222222222, 1, 0.466666667, 0.538461538, 0.428571429, 0.5],
  'rG:dA': [1, 0.636363636, 0.5, 0.363636364, 0.3, 0.666666667, 0.571428571, 0.625, 0.533333333, 0.8125, 0.384615385, 0.384615385, 0.3, 0.266666667, 0.142857143, 0, 0.25, 0.666666667, 0.666666667, 0.7],
  'rG:dG': [0.714285714, 0.692307692, 0.384615385, 0.529411765, 0.785714286, 0.681818182, 0.6875, 0.615384615, 0.538461538, 0.4, 0.428571429, 0.529411765, 0.421052632, 0.428571429, 0.272727273, 0, 0.235294118, 0.476190476, 0.448275862, 0.428571429],
  'rG:dT': [0.9, 0.846153846, 0.75, 0.9, 0.866666667, 1, 1, 1, 0.642857143, 0.933333333, 1, 0.933333333, 0.923076923, 0.75, 0.941176471, 1, 0.933333333, 0.692307692, 0.714285714, 0.9375],
  'rU:dC': [0.956521739, 0.84, 0.5, 0.625, 0.64, 0.571428571, 0.588235294, 0.733333333, 0.619047619, 0.5, 0.4, 0.5, 0.260869565, 0, 0.05, 0.346153846, 0.117647059, 0.333333333, 0.25, 0.176470588],
  'rU:dG': [0.857142857, 0.857142857, 0.428571429, 0.647058824, 1, 0.909090909, 0.6875, 1, 0.923076923, 0.533333333, 0.666666667, 0.947368421, 0.789473684, 0.285714286, 0.272727273, 0.666666667, 0.705882353, 0.428571429, 0.275862069, 0.090909091],
  'rU:dT': [1, 0.846153846, 0.714285714, 0.476190476, 0.5, 0.866666667, 0.875, 0.8, 0.928571429, 0.857142857, 0.75, 0.8, 0.692307692, 0.619047619, 0.578947368, 0.909090909, 0.533333333, 0.666666667, 0.285714286, 0.5625],
};
// PAM dinucleotide weights (last 2 bases of the 3bp PAM).
const CFD_PAM: Record<string, number> = {
  AA: 0, AC: 0, AG: 0.259259259, AT: 0, CA: 0, CC: 0, CG: 0.107142857, CT: 0,
  GA: 0.069444444, GC: 0.022222222, GG: 1, GT: 0.016129032, TA: 0, TC: 0, TG: 0.038961039, TT: 0,
};

const params: ComponentTemplateParam[] = [
  {
    id: 'exampleSeq',
    label: 'Example Target Sequence',
    type: 'string',
    default: 'CCACGTCTCCACACATCAGCACAACTACGCAGCGCCTCCCTCCACTCGGAAGGACTATCCTGCTGCCAAGAGGGTCAAGTTGGACAGTGTCAGAGTCCTG',
    description: 'Example genomic target (the CRISPOR doctest 100mer) baked into synthesized tests'
  },
];

export const crisprDesignerPlugin: TemplatePlugin = {
  id: 'tpl_crispr_designer',
  name: 'CRISPR/Cas9 Guide RNA Designer (Doench 2014 + CFD)',
  domain: 'biotech' as ToolDomain,
  category: 'biotech' as ComponentTemplateCategory,
  description: 'Enumerates SpCas9 (NGG) / SpG (NG) guides on both strands and scores them with the published Doench 2014 Rule Set 1 logistic model; includes the Doench 2016 CFD off-target score for user-supplied candidate off-targets. No genome search.',
  benchmarkFlops: 1200,
  complexity: 'O(N)',
  defaultScore: 0.94,
  tags: ['crispr', 'guide-rna', 'doench-2014', 'cfd-score', 'spcas9'],
  params,
  synthesizer: (userParams, options) => {
    const compName = options?.componentName || 'CrisprDesigner';
    const withHealing = options?.withSelfHealing ?? true;
    const example = String(userParams.exampleSeq || params[0].default).toUpperCase();

    const sourceCode = `/**
 * Autonomously Synthesized Component: ${compName}
 * Blueprint: tpl_crispr_designer
 * Published models only:
 * - Doench 2014 Rule Set 1 on-target score (PMID 25184501; coefficients from the
 *   CRISPOR reference implementation, crisporEffScores.py calcDoenchScores).
 * - Doench 2016 CFD off-target score (PMID 26780180; tables from the official
 *   CFD_Scoring pickles, validated against published reference values).
 * NOT included: Doench 2016 Rule Set 2 (pickled GBRT model, not portable) and
 * genome-wide off-target search (needs Cas-OFFinder/BWA + a reference genome).
 */
export interface GuideRNA {
  sequence: string;
  pam: string;
  position: number;
  strand: '+' | '-';
  onTargetScore: number | null;
  gcContent: number;
  warnings: string[];
}

const DOENCH_INTERCEPT = ${JSON.stringify(DOENCH_INTERCEPT)};
const DOENCH_GC_HIGH = ${JSON.stringify(DOENCH_GC_HIGH)};
const DOENCH_GC_LOW = ${JSON.stringify(DOENCH_GC_LOW)};
const DOENCH_PARAMS = ${JSON.stringify(DOENCH_PARAMS)};
const CFD_MM = ${JSON.stringify(CFD_MM)};
const CFD_PAM = ${JSON.stringify(CFD_PAM)};

export class ${compName} {
  /**
   * Doench 2014 Rule Set 1 score. Input: 30mer = 4bp 5' flank + 20bp guide +
   * 3bp PAM + 3bp 3' flank. Returns the logistic score in [0,1] (CRISPOR
   * multiplies by 100), or null if the guide lacks full flanking context.
   */
  static doench2014(ctx30: string): number | null {
    if (!ctx30 || ctx30.length < 30) return null;
    const seq = ctx30.toUpperCase();
    let score = DOENCH_INTERCEPT;
    const guide = seq.slice(4, 24);
    const gcCount = (guide.match(/G/g) || []).length + (guide.match(/C/g) || []).length;
    score += Math.abs(10 - gcCount) * (gcCount > 10 ? DOENCH_GC_HIGH : DOENCH_GC_LOW);
    for (const [pos, modelSeq, weight] of DOENCH_PARAMS) {
      if (seq.slice(pos, pos + modelSeq.length) === modelSeq) score += weight;
    }
    return 1 / (1 + Math.exp(-score));
  }

  /**
   * CFD off-target score (Doench 2016). Both inputs are 23mers: 20bp spacer +
   * 3bp PAM. wt = on-target guide, off = candidate off-target. Returns [0,1];
   * 1.0 only for a perfect match with an NGG PAM.
   */
  static cfdScore(wt23: string, off23: string): number {
    const revcom = (b: string) => ({ A: 'T', C: 'G', G: 'C', T: 'A' }[b] || 'A');
    const wt = wt23.toUpperCase().slice(0, 20).split('').map((b) => (b === 'T' ? 'U' : b));
    const off = off23.toUpperCase();
    const sg = off.slice(0, 20).split('').map((b) => (b === 'T' ? 'U' : b));
    const pamKey = off.slice(21, 23);
    let score = 1;
    for (let i = 0; i < 20; i++) {
      if (wt[i] === sg[i]) continue;
      const key = 'r' + wt[i] + ':d' + revcom(sg[i]);
      const row = CFD_MM[key];
      score *= row ? row[i] : 1;
    }
    return score * (CFD_PAM[pamKey] ?? 0);
  }

  static design(targetSequence: string, pamType: 'NGG' | 'NG' = 'NGG'): GuideRNA[] {
    const guides: GuideRNA[] = [];
    const seq = targetSequence.toUpperCase().replace(/[^ATCG]/g, '');
    if (seq.length < 23) return guides;
    // PAM check by character test — a shared /g regex with .test() would
    // advance lastIndex and silently skip valid guides.
    const isPam = (pam: string) => pam.length === 3 && /[ATCG]/.test(pam[0]) &&
      (pamType === 'NGG' ? pam[1] === 'G' && pam[2] === 'G' : pam[1] === 'G');
    const revComp = (s: string) => s.split('').reverse().map((b) => ({ A: 'T', T: 'A', G: 'C', C: 'G' }[b] || b)).join('');

    const scan = (strand: string, strandLabel: '+' | '-') => {
      const pamLen = pamType === 'NGG' ? 3 : 2;
      for (let i = 0; i + 20 + pamLen <= strand.length; i++) {
        const guideSeq = strand.slice(i, i + 20);
        const pam = strand.slice(i + 20, i + 20 + pamLen);
        if (!isPam(pam)) continue;
        const gcCount = (guideSeq.match(/[GC]/g) || []).length;
        const gcContent = gcCount / 20;
        const warnings: string[] = [];
        if (guideSeq.includes('TTTT')) warnings.push('TTTT: Pol III terminator - truncates U6/H1 transcription (Gao 2017)');
        if (gcContent < 0.4 || gcContent > 0.7) warnings.push('GC content outside the 40-70% design band');
        if (guideSeq[0] !== 'G') warnings.push('No 5\\' G: weaker U6 Pol III initiation (Graham & Root 2015)');
        if (guideSeq.endsWith('GG')) warnings.push('Ends -GG: favorable empirical rule for U6 guides (Haeussler 2016)');
        // Doench 2014 is defined for the SpCas9 NGG 30mer (4+20+3+3) only.
        const ctx30 = (pamType === 'NGG' && strandLabel === '+') ? seq.slice(i - 4, i + 26) : null;
        const onTargetScore = (strandLabel === '+' && ctx30 && ctx30.length === 30)
          ? ${compName}.doench2014(ctx30)
          : null;
        guides.push({
          sequence: guideSeq, pam, position: strandLabel === '+' ? i : seq.length - i - 20 - pamLen,
          strand: strandLabel, onTargetScore, gcContent, warnings,
        });
      }
    };
    scan(seq, '+');
    scan(revComp(seq), '-');
    return guides
      .sort((a, b) => (b.onTargetScore ?? -1) - (a.onTargetScore ?? -1))
      .slice(0, 50);
  }
}`;

    const testSuiteCode = `const d = ${compName}.doench2014('ACGCAGCGCCTCCCTCCACTCGGAAGGACT');
assert d !== null;
assert Math.round(d * 100) === 10;
const c1 = ${compName}.cfdScore('GGGGGGGGGGGGGGGGGGGGGGG', 'GGGGGGGGGGGGGGGGGAAAGGG');
assert Math.abs(c1 - 0.4635989007074176) < 1e-9;
const c2 = ${compName}.cfdScore('GGGGGGGGGGGGGGGGGGGGGGG', 'GGGGGGGGGGGGGGGGGGGGGGG');
assert c2 === 1.0;
const c3 = ${compName}.cfdScore('ATCGATGCTGATGCTAGATAAGG', 'ACCGATGCTGATGCTAGATAAGG');
assert Math.abs(c3 - 0.857142857) < 1e-6;
const c4 = ${compName}.cfdScore('ATCGATGCTGATGCTAGATAAGG', 'ATCGATGCTGATGCTAGATAAGA');
assert Math.abs(c4 - 0.069444444) < 1e-6;
const guides = ${compName}.design('${example}');
assert Array.isArray(guides);
assert guides.length > 0;
assert guides.every(g => g.sequence.length === 20);
assert guides.every(g => g.position >= 0);
assert guides.every(g => g.gcContent >= 0 && g.gcContent <= 1);
assert ${compName}.design('AT').length === 0;`;

    return {
      sourceCode,
      testSuiteCode,
      entrypointName: compName,
      summary: `Synthesized CRISPR designer (${compName}) with published Doench 2014 on-target scoring and Doench 2016 CFD off-target scoring (both doctest-verified)`,
      selfHealingGuards: withHealing ? ['PamCharBoundaryGuard', 'CfdTableLookupClamp'] : [],
    };
  },
  selfHost: {
    stateful: false,
    methods: [
      { method: 'doench2014', label: 'Doench 2014 on-target score (30mer context)' },
      { method: 'cfdScore', label: 'CFD off-target score (guide 23mer vs off-target 23mer)' },
      { method: 'design', label: 'Enumerate and score guides in a target sequence' },
    ],
  },
};