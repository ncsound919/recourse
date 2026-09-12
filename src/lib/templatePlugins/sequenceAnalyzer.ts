/**
 * Sequence analyzer template plugin — real DNA/RNA/protein sequence computation.
 *
 * Every constant below is taken from a published, citable source (previous
 * versions of this plugin mixed rounded values and an unattributed pKa set):
 *
 * - Genetic code: NCBI Standard Code (transl_table=1), verified codon-by-codon
 *   against https://www.ncbi.nlm.nih.gov/Taxonomy/Utils/wprintgc.cgi
 * - Amino-acid average residue masses: ExPASy (FindMod / ProtParam tables,
 *   Gasteiger et al., Humana Press 2005). MW = Σ(residue masses) + average
 *   isotopic mass of one water molecule — ExPASy Compute pI/Mw convention.
 * - DNA/RNA oligo MW: OligoCalc (Kibbe, Nucleic Acids Res 2007,
 *   PMC1933198): MW = Σ(dNMP Na-salt residue masses) − 61.96, i.e. 5'/3'
 *   hydroxylated ends without a 5' phosphate (dA 313.21, dT 304.2, dC 289.18,
 *   dG 329.21; rA 329.21, rU 306.2, rC 305.18, rG 345.21).
 * - Isoelectric point: Henderson-Hasselbalch charge model (Eqs 1-2) with the
 *   EMBOSS pKa set (Rice et al., Trends Genet 2000, via IPC Table 4,
 *   Kozlowski, Biology Direct 2016, 10.1186/s13062-016-0159-9):
 *   N-term 8.6, C-term 3.6, C 8.5, D 3.9, E 4.1, H 6.5, K 10.8, R 12.5, Y 10.1.
 *   Bisection to zero net charge, same method family as ExPASy/IPC.
 *
 * All methods are pure and deterministic — real math on real input, no fixture
 * constants, no fabricated values.
 *
 * Honest scope: derived numerics only. Estimated masses/pI, not experimental
 * measurements; the nine-parameter pI model ignores post-translational
 * modifications (see IPC paper's discussion of this limitation).
 */

import type { ToolDomain, ComponentTemplateParam, ComponentTemplateCategory } from '../../types';
import type { TemplatePlugin } from '../templatePlugin';

const params: ComponentTemplateParam[] = [
  {
    id: 'exampleSeq',
    label: 'Example Sequence',
    type: 'string',
    default: 'ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG',
    description: 'Default sequence baked into synthesized examples (test fixture only)'
  },
];

export const sequenceAnalyzerPlugin: TemplatePlugin = {
  id: 'tpl_sequence_analyzer',
  name: 'DNA/RNA/Protein Sequence Analyzer',
  domain: 'biotech' as ToolDomain,
  category: 'biotech' as ComponentTemplateCategory,
  description: 'Bioinformatics primitives with published constants: NCBI standard genetic code, ExPASy residue masses, OligoCalc oligo MW, EMBOSS-pKa isoelectric point, translation, reverse complement, ORF detection, codon usage.',
  benchmarkFlops: 800,
  complexity: 'O(N)',
  defaultScore: 0.96,
  tags: ['bioinformatics', 'genomics', 'sequence', 'translation', 'protein'],
  params,
  synthesizer: (userParams, options) => {
    const compName = options?.componentName || 'SequenceAnalyzer';
    const withHealing = options?.withSelfHealing ?? true;
    const example = String(userParams.exampleSeq || params[0].default).toUpperCase();

    const sourceCode = `/**
 * Autonomously Synthesized Component: ${compName}
 * Blueprint: tpl_sequence_analyzer
 * Constants from: NCBI transl_table=1; ExPASy Compute pI/Mw (residue masses +
 * water); OligoCalc (Kibbe, NAR 2007) for oligo MW (5'/3'-OH, -61.96 rule);
 * EMBOSS pKa set via IPC Table 4 (Kozlowski, Biology Direct 2016).
 */
type SeqType = 'DNA' | 'RNA' | 'PROTEIN' | 'UNKNOWN';

const CODE: Record<string, string> = {
  TTT: 'F', TTC: 'F', TTA: 'L', TTG: 'L', CTT: 'L', CTC: 'L', CTA: 'L', CTG: 'L',
  ATT: 'I', ATC: 'I', ATA: 'I', ATG: 'M', GTT: 'V', GTC: 'V', GTA: 'V', GTG: 'V',
  TCT: 'S', TCC: 'S', TCA: 'S', TCG: 'S', CCT: 'P', CCC: 'P', CCA: 'P', CCG: 'P',
  ACT: 'T', ACC: 'T', ACA: 'T', ACG: 'T', GCT: 'A', GCC: 'A', GCA: 'A', GCG: 'A',
  TAT: 'Y', TAC: 'Y', TAA: '*', TAG: '*', CAT: 'H', CAC: 'H', CAA: 'Q', CAG: 'Q',
  AAT: 'N', AAC: 'N', AAA: 'K', AAG: 'K', GAT: 'D', GAC: 'D', GAA: 'E', GAG: 'E',
  TGT: 'C', TGC: 'C', TGA: '*', TGG: 'W', CGT: 'R', CGC: 'R', CGA: 'R', CGG: 'R',
  AGT: 'S', AGC: 'S', AGA: 'R', AGG: 'R', GGT: 'G', GGC: 'G', GGA: 'G', GGG: 'G',
};

// ExPASy average amino-acid residue masses (Da)
const AA_MW: Record<string, number> = {
  A: 71.0788, R: 156.1875, N: 114.1038, D: 115.0886, C: 103.1388, E: 129.1155,
  Q: 128.1307, G: 57.0519, H: 137.1411, I: 113.1594, L: 113.1594, K: 128.1741,
  M: 131.1926, F: 147.1766, P: 97.1167, S: 87.0782, T: 101.1051, W: 186.2132,
  Y: 163.1760, V: 99.1326,
};
const WATER_MW = 18.0153; // average isotopic mass of water (ExPASy convention)

// OligoCalc dNMP / rNMP Na-salt residue masses (Da)
const DNA_MW: Record<string, number> = { A: 313.21, T: 304.2, G: 329.21, C: 289.18 };
const RNA_MW: Record<string, number> = { A: 329.21, U: 306.2, G: 345.21, C: 305.18 };
const OLIGO_END_CORRECTION = -61.96; // 5'/3' hydroxylated oligo, no 5' phosphate

// EMBOSS pKa set (Rice et al. 2000, via IPC Table 4)
const PKA = { nTerm: 8.6, cTerm: 3.6, D: 3.9, E: 4.1, C: 8.5, Y: 10.1, H: 6.5, K: 10.8, R: 12.5 };

export class ${compName} {
  static asSeq(raw: unknown): string {
    return typeof raw === 'string' ? raw : '';
  }

  static detectType(raw: string): SeqType {
    const upper = ${compName}.asSeq(raw).toUpperCase().replace(/\\s/g, '');
    if (!upper.length) return 'UNKNOWN';
    if (/^[ACGTN\\-]+$/.test(upper) && !upper.includes('U')) return 'DNA';
    if (/^[ACGUN\\-]+$/.test(upper)) return 'RNA';
    if (/^[ACDEFGHIKLMNPQRSTVWY\\*\\-]+$/.test(upper)) return 'PROTEIN';
    return 'UNKNOWN';
  }

  static analyze(raw: string) {
    const seq = ${compName}.asSeq(raw).toUpperCase().replace(/\\s/g, '');
    const type = ${compName}.detectType(seq);
    const composition: Record<string, number> = {};
    for (const ch of seq) composition[ch] = (composition[ch] ?? 0) + 1;
    const isNucleic = type === 'DNA' || type === 'RNA';
    // JSON-safe fields: inapplicable values are null (never NaN — the
    // self-hosting layer rejects non-finite numbers).
    const gcContent = isNucleic ? ((composition['G'] ?? 0) + (composition['C'] ?? 0)) / Math.max(1, seq.length) * 100 : null;
    let molecularWeight: number | null = null;
    if (isNucleic) {
      const table = type === 'DNA' ? DNA_MW : RNA_MW;
      let mw = 0;
      for (const [base, count] of Object.entries(composition)) mw += (table[base] ?? 0) * count;
      molecularWeight = seq.length > 0 ? mw + OLIGO_END_CORRECTION : 0;
    } else if (type === 'PROTEIN') {
      let mw = WATER_MW;
      for (const [aa, count] of Object.entries(composition)) mw += (AA_MW[aa] ?? 0) * count;
      molecularWeight = mw;
    }
    const isoelectricPoint = type === 'PROTEIN' ? ${compName}.estimatePi(seq) : null;
    return { type, length: seq.length, gcContent, composition, molecularWeight, isoelectricPoint };
  }

  static translate(raw: string, frame: 0 | 1 | 2 = 0): string {
    const s = ${compName}.asSeq(raw).toUpperCase().replace(/\\s/g, '').replace(/U/g, 'T');
    let protein = '';
    for (let i = frame; i + 2 < s.length; i += 3) {
      const aa = CODE[s.slice(i, i + 3)] ?? 'X';
      if (aa === '*') break;
      protein += aa;
    }
    return protein;
  }

  static reverseComplement(raw: string): string {
    const comp: Record<string, string> = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N', a: 't', t: 'a', g: 'c', c: 'g', n: 'n' };
    return ${compName}.asSeq(raw).split('').reverse().map((b) => comp[b] ?? b).join('');
  }

  static findOrfs(raw: string, minLength = 20) {
    const dna = ${compName}.asSeq(raw).toUpperCase().replace(/\\s/g, '').replace(/U/g, 'T');
    const rc = ${compName}.reverseComplement(dna);
    const orfs: { start: number; end: number; strand: '+' | '-'; frame: 0 | 1 | 2; protein: string; length: number }[] = [];
    const scan = (strand: string, strandLabel: '+' | '-') => {
      for (const frame of [0, 1, 2] as const) {
        let inOrf = false;
        let orfStart = 0;
        let protein = '';
        for (let i = frame; i + 2 < strand.length; i += 3) {
          const aa = CODE[strand.slice(i, i + 3)] ?? 'X';
          if (!inOrf && aa === 'M') { inOrf = true; orfStart = i; protein = 'M'; }
          else if (inOrf) {
            if (aa === '*') {
              if (protein.length >= minLength) {
                const start = strandLabel === '+' ? orfStart : dna.length - (orfStart + (protein.length + 1) * 3);
                orfs.push({ start, end: start + protein.length * 3, strand: strandLabel, frame, protein, length: protein.length });
              }
              inOrf = false; protein = '';
            } else protein += aa;
          }
        }
      }
    };
    scan(dna, '+');
    scan(rc, '-');
    return orfs.sort((a, b) => b.length - a.length);
  }

  static codonUsage(raw: string) {
    const s = ${compName}.asSeq(raw).toUpperCase().replace(/\\s/g, '').replace(/U/g, 'T');
    const counts = new Map<string, number>();
    for (let i = 0; i + 2 < s.length; i += 3) {
      const codon = s.slice(i, i + 3);
      if (CODE[codon]) counts.set(codon, (counts.get(codon) ?? 0) + 1);
    }
    const byAA: Record<string, number> = {};
    for (const [codon, cnt] of counts) { const aa = CODE[codon] ?? '?'; byAA[aa] = (byAA[aa] ?? 0) + cnt; }
    const result: { codon: string; aa: string; count: number; relFreq: number }[] = [];
    for (const [codon, count] of counts) {
      const aa = CODE[codon] ?? '?';
      result.push({ codon, aa, count, relFreq: byAA[aa] ? count / byAA[aa] : 0 });
    }
    return result;
  }

  /**
   * Isoelectric point: Henderson-Hasselbalch charge model (IPC Eqs 1-2) with
   * the EMBOSS pKa set; bisection to zero net charge on [0, 14].
   */
  static estimatePi(protein: string): number | null {
    const counts: Record<string, number> = {};
    for (const aa of ${compName}.asSeq(protein).toUpperCase()) counts[aa] = (counts[aa] ?? 0) + 1;
    if (!Object.keys(counts).length) return null;
    const chargeAtPH = (ph: number): number => {
      let charge = 1 / (1 + Math.pow(10, ph - PKA.nTerm)); // N-terminus (+)
      for (const [aa, pKa] of Object.entries({ K: PKA.K, R: PKA.R, H: PKA.H })) {
        const cnt = counts[aa] ?? 0;
        if (cnt) charge += (cnt) * (1 / (1 + Math.pow(10, ph - pKa)));
      }
      for (const [aa, pKa] of Object.entries({ D: PKA.D, E: PKA.E, C: PKA.C, Y: PKA.Y })) {
        const cnt = counts[aa] ?? 0;
        if (cnt) charge -= (cnt) / (1 + Math.pow(10, pKa - ph));
      }
      charge -= 1 / (1 + Math.pow(10, PKA.cTerm - ph)); // C-terminus (-)
      return charge;
    };
    let lo = 0, hi = 14;
    for (let iter = 0; iter < 100; iter++) {
      const mid = (lo + hi) / 2;
      if (chargeAtPH(mid) > 0) lo = mid; else hi = mid;
    }
    return Math.round(((lo + hi) / 2) * 100) / 100;
  }
}`;

    const testSuiteCode = `const seq = '${example}';
assert ${compName}.detectType(seq) === 'DNA';
const stats = ${compName}.analyze('ATGC');
assert stats.type === 'DNA';
assert stats.gcContent === 50;
assert stats.length === 4;
assert Math.abs(stats.molecularWeight - 1173.84) < 0.01;
assert ${compName}.reverseComplement('ATGC') === 'GCAT';
assert ${compName}.translate('ATGGAA') === 'ME';
assert ${compName}.translate('ATGTAA') === 'M';
assert ${compName}.detectType('ACDEFGHIKLMNPQRSTVWY') === 'PROTEIN';
assert ${compName}.detectType('AUGGCC') === 'RNA';
const prot = ${compName}.analyze('WWW');
assert prot.type === 'PROTEIN';
assert Math.abs(prot.molecularWeight - (3 * 186.2132 + 18.0153)) < 0.01;
assert ${compName}.estimatePi('KKKKKK') > 9;
assert ${compName}.estimatePi('DDDDDD') < 4;
const orfs = ${compName}.findOrfs(seq, 3);
assert Array.isArray(orfs);
const cu = ${compName}.codonUsage('ATGGCCATTGTA');
assert cu.length > 0;
assert ${compName}.detectType(undefined) === 'UNKNOWN';
const emptyStats = ${compName}.analyze(undefined);
assert emptyStats.length === 0;
assert ${compName}.translate(undefined) === '';
assert ${compName}.reverseComplement(undefined) === '';
assert Array.isArray(${compName}.findOrfs(undefined));
assert Array.isArray(${compName}.codonUsage(undefined));`;

    return {
      sourceCode,
      testSuiteCode,
      entrypointName: compName,
      summary: `Synthesized sequence analyzer (${compName}) with published constants (NCBI code, ExPASy masses, OligoCalc MW, EMBOSS-pKa pI)`,
      selfHealingGuards: withHealing ? ['SequenceTypeBoundaryGuard', 'GeneticCodeLookupClamp'] : [],
    };
  },
  selfHost: {
    stateful: false,
    methods: [
      { method: 'detectType', label: 'Detect sequence type' },
      { method: 'analyze', label: 'Compute sequence statistics' },
      { method: 'translate', label: 'Translate DNA/RNA to protein' },
      { method: 'reverseComplement', label: 'Reverse complement' },
      { method: 'findOrfs', label: 'Find open reading frames' },
      { method: 'codonUsage', label: 'Build codon-usage table' },
      { method: 'estimatePi', label: 'Estimate protein isoelectric point' },
    ],
  },
};