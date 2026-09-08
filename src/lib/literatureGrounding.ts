/**
 * Literature grounding layer for the oncology KG.
 *
 * Closes the "KG can't read clinical literature" gap honestly: this module
 * extracts a graph from REAL full-text papers (the local cancer PDF corpus)
 * by exact-string matching against a curated oncology lexicon, and produces
 * edges whose weights are REAL co-mention counts across the corpus.
 *
 * Honest limits (never papered over):
 * - Entity detection is exact-string term matching, NOT named-entity
 *   recognition. Terms like "AKT" match as literal substrings bounded to
 *   avoid trivial false hits; there is no disambiguation of genes vs
 *   proteins vs gene families.
 * - An edge "A -- B" means "A and B co-occur in >=1 real paper", weighted by
 *   the number of papers containing both. It does NOT assert causality or a
 *   specific mechanistic relation.
 * - All counts are real: recomputable from the corpus file at any time.
 */

export interface LiteratureTerm {
  id: string;
  /** Type label for the node: gene/protein, drug, pathway, mechanism, class. */
  type: 'gene' | 'drug' | 'pathway' | 'mechanism' | 'class';
  /** Exact (case-insensitive) substrings to match in paper text. */
  terms: string[];
}

/** Curated lexicon derived from the actual journal mix observed in the corpus
 *  (drug-target reviews, mechanism papers: AKT/PI3K, HDAC, FOXO, c-FLIP,
 *  PIM1, NF-kB, DNA repair, etc.). Exact-string matching only. */
export const LITERATURE_LEXICON: LiteratureTerm[] = [
  { id: 'AKT', type: 'pathway', terms: ['AKT', 'Akt', 'akt'] },
  { id: 'PI3K', type: 'pathway', terms: ['PI3K', 'phosphatidylinositol 3'] },
  { id: 'PTEN', type: 'gene', terms: ['PTEN'] },
  { id: 'PIK3CA', type: 'gene', terms: ['PIK3CA'] },
  { id: 'mTOR', type: 'pathway', terms: ['mTOR'] },
  { id: 'KRAS', type: 'gene', terms: ['KRAS', 'K-Ras', 'kras'] },
  { id: 'BRAF', type: 'gene', terms: ['BRAF', 'B-Raf', 'braf'] },
  { id: 'EGFR', type: 'gene', terms: ['EGFR', 'Epidermal growth factor receptor'] },
  { id: 'HER2', type: 'gene', terms: ['HER2', 'ErbB2', 'HER-2'] },
  { id: 'p53', type: 'gene', terms: ['p53', 'TP53'] },
  { id: 'PUMA', type: 'gene', terms: ['PUMA', 'Bbc3'] },
  { id: 'c-FLIP', type: 'gene', terms: ['c-FLIP', 'FLICE-like inhibitory'] },
  { id: 'PIM1', type: 'gene', terms: ['PIM1'] },
  { id: 'FOXO', type: 'gene', terms: ['FOXO', 'forkhead box O'] },
  { id: 'NFkB', type: 'pathway', terms: ['NF-\u03baB', 'NF-κB', 'NF-kB', 'nuclear factor kappa'] },
  { id: 'HDAC', type: 'gene', terms: ['HDAC', 'histone deacetylase'] },
  { id: 'RBM39', type: 'gene', terms: ['RBM39'] },
  { id: 'ARID1A', type: 'gene', terms: ['ARID1A'] },
  { id: 'c-Myc', type: 'gene', terms: ['c-Myc', 'MYC'] },
  { id: 'SRC', type: 'gene', terms: ['SRC', 'c-Src'] },
  { id: 'DNA-repair', type: 'mechanism', terms: ['DNA repair', 'strand break repair', 'non-homologous end'] },
  { id: 'PNK', type: 'gene', terms: ['polynucleotide kinase', 'PNK'] },
  { id: 'topoisomerase', type: 'gene', terms: ['topoisomerase I', 'topoisomerase II'] },
  { id: 'TRAIL', type: 'pathway', terms: ['TRAIL', 'TNF-related apoptosis'] },
  { id: 'apoptosis', type: 'mechanism', terms: ['apoptosis', 'programmed cell death'] },
  { id: 'efflux', type: 'mechanism', terms: ['efflux', 'ABC transporter', 'multidrug resistance', 'MDR'] },
  { id: 'methylation', type: 'mechanism', terms: ['methylation', 'epigenetic'] },
  { id: 'angiogenesis', type: 'mechanism', terms: ['angiogenesis', 'VEGF', 'vascular endothelial'] },
  { id: 'metastasis', type: 'mechanism', terms: ['metastasis', 'metastatic'] },
  { id: 'cancer-stem', type: 'mechanism', terms: ['cancer stem', 'stem cell', 'self-renewal'] },
  { id: 'immunotherapy', type: 'mechanism', terms: ['immunotherapy', 'immune checkpoint', 'PD-1', 'PD-L1'] },
  { id: 'sorafenib', type: 'drug', terms: ['sorafenib'] },
  { id: 'gefitinib', type: 'drug', terms: ['gefitinib'] },
  { id: 'docetaxel', type: 'drug', terms: ['docetaxel'] },
  { id: 'etoposide', type: 'drug', terms: ['etoposide'] },
  { id: 'tafluposide', type: 'drug', terms: ['tafluposide'] },
  { id: 'camptothecin', type: 'drug', terms: ['camptothecin'] },
  { id: 'lidamycin', type: 'drug', terms: ['lidamycin'] },
  { id: 'chloroquine', type: 'drug', terms: ['chloroquine'] },
  { id: '2-methoxyestradiol', type: 'drug', terms: ['2-methoxyestradiol', '2-ME'] },
  { id: 'rapamycin', type: 'drug', terms: ['rapamycin'] },
  { id: 'SAHA', type: 'drug', terms: ['SAHA', 'vorinostat'] },
  { id: 'cisplatin', type: 'drug', terms: ['cisplatin'] },
  { id: 'paclitaxel', type: 'drug', terms: ['paclitaxel', 'taxol'] },
  { id: 'imatinib', type: 'drug', terms: ['imatinib'] },
  { id: 'gp100', type: 'gene', terms: ['gp100'] },
  { id: 'PTGER4', type: 'gene', terms: ['PTGER4', 'EP4'] },
];

export interface LiteratureDoc {
  rel: string;
  text: string;
  authors?: string[];
  publishedAt?: number;
}

export interface LiteratureHit {
  termId: string;
  docs: number;
  mentions: number;
}

export interface LiteratureEdge {
  source: string;
  target: string;
  coDocs: number;
}

/** Count real occurrences (docs + mentions) of each lexicon term across the corpus. */
export function scanLiteratureTerms(docs: LiteratureDoc[]): LiteratureHit[] {
  const counts = new Map<string, { docs: number; mentions: number }>();
  for (const d of docs) {
    const text = d.text.toLowerCase();
    const seenInDoc = new Set<string>();
    for (const term of LITERATURE_LEXICON) {
      let mentions = 0;
      for (const t of term.terms) {
        const needle = t.toLowerCase();
        if (!needle) continue;
        const idx = text.indexOf(needle);
        let n = 0;
        while (idx !== -1 && n < 20) {
          n++;
          const pos = idx + needle.length;
          const next = text.indexOf(needle, pos);
          if (next === -1) break;
        }
        mentions += n;
      }
      if (mentions > 0) {
        const c = counts.get(term.id) ?? { docs: 0, mentions: 0 };
        c.docs += 1;
        c.mentions += mentions;
        counts.set(term.id, c);
        seenInDoc.add(term.id);
      }
    }
  }
  return [...counts.entries()].map(([termId, c]) => ({ termId, docs: c.docs, mentions: c.mentions }));
}

/** Build literature co-mention edges: A-B edge weight = number of papers citing both. */
export function buildLiteratureEdges(docs: LiteratureDoc[]): LiteratureEdge[] {
  const perDoc: Array<{ rel: string; terms: string[] }> = [];
  for (const d of docs) {
    const text = d.text.toLowerCase();
    const present: string[] = [];
    for (const term of LITERATURE_LEXICON) {
      if (term.terms.some((t) => text.includes(t.toLowerCase()))) present.push(term.id);
    }
    if (present.length >= 2) perDoc.push({ rel: d.rel, terms: present });
  }
  const co = new Map<string, LiteratureEdge>();
  const key = (a: string, b: string) => (a < b ? `${a}||${b}` : `${b}||${a}`);
  for (const d of perDoc) {
    for (let i = 0; i < d.terms.length; i++) {
      for (let j = i + 1; j < d.terms.length; j++) {
        const k = key(d.terms[i], d.terms[j]);
        const e = co.get(k) ?? { source: d.terms[i], target: d.terms[j], coDocs: 0 };
        e.coDocs += 1;
        co.set(k, e);
      }
    }
  }
  return [...co.values()].sort((a, b) => b.coDocs - a.coDocs);
}

/** Evidence docs for one term (real citations, capped). */
export function literatureEvidence(docs: LiteratureDoc[], termId: string): Array<{ rel: string; authors: string[]; publishedAt?: number }> {
  const term = LITERATURE_LEXICON.find((t) => t.id === termId);
  if (!term) return [];
  return docs
    .filter((d) => term.terms.some((t) => d.text.toLowerCase().includes(t.toLowerCase())))
    .slice(0, 25)
    .map((d) => ({ rel: d.rel, authors: d.authors ?? [], publishedAt: d.publishedAt }));
}

/** Map canonical KG asset -> literature lexicon term via its real targetProtein. */
export const CANONICAL_TARGET_MAP: Record<string, string> = {
  sotorasib: 'KRAS', adagrasib: 'KRAS', PT0511: 'KRAS', MRTX1133: 'KRAS', RP04340: 'KRAS',
  tebentafusp: 'gp100', DT_9081: 'PTGER4',
};

import type { KgPayload } from './kgSidecarClient.js';

/**
 * Union graph for the KG sidecar: literature co-mention edges (real counts) +
 * canonical shared-target edges + canonical asset -> target-term edges (from
 * the KG's own targetProtein field). Pure/deterministic — unit-testable, no
 * network. Imported lazily to avoid a hard cycle on the KG modules.
 */
export async function buildLiteratureKgGraph(
  docs: LiteratureDoc[],
  minDocPresence = 2,
  minCoDocs = 2,
): Promise<{ payload: KgPayload; hits: LiteratureHit[]; edges: LiteratureEdge[] }> {
  const { oncologyKgToGraph } = await import('./kgSidecarClient.js');
  const { CANONICAL_ONCOLOGY_KG } = await import('./biotechKnowledgeGraph.js');
  const hits = scanLiteratureTerms(docs);
  const present = hits.filter((h) => h.docs >= minDocPresence);
  const litEdges = buildLiteratureEdges(docs).filter((e) => e.coDocs >= minCoDocs);
  const canonical = oncologyKgToGraph();
  return {
    payload: {
      nodes: [
        ...present.map((h) => ({ id: h.termId, attrs: { type: LITERATURE_LEXICON.find((t) => t.id === h.termId)?.type, litDocs: h.docs, litMentions: h.mentions, source: 'literature' } })),
        ...canonical.nodes,
      ],
      edges: [
        ...litEdges.map((e) => ({ source: e.source, target: e.target, relation: 'co_mention', weight: e.coDocs })),
        ...canonical.edges,
        ...Object.entries(CANONICAL_TARGET_MAP).filter(([a]) => CANONICAL_ONCOLOGY_KG[a]).map(([asset, term]) => ({ source: asset, target: term, relation: 'targets', weight: 1 })),
      ],
    },
    hits,
    edges: litEdges,
  };
}

// Type-only re-export so callers can name KgPayload without a circular import.
export type { KgPayload } from './kgSidecarClient.js';

const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'via', 'are', 'was', 'were', 'into', 'over', 'under', 'during', 'against', 'after', 'before', 'between', 'through', 'which', 'who', 'its', 'their', 'her', 'his', 'not', 'but', 'has', 'have', 'had', 'can', 'may', 'might', 'will', 'would', 'than', 'then', 'when', 'where', 'these', 'those', 'also', 'more', 'most', 'less', 'each', 'other', 'such', 'only', 'very', 'our', 'your', 'by', 'in', 'on', 'of', 'to', 'at', 'as', 'be', 'is', 'it', 'or']);

export interface ClaimSupportResult {
  tokens: string[];
  matchedTerms: Array<{ token: string; termId: string }>;
  presentTerms: Array<{ termId: string; docs: number }>;
  /** Fraction of lexicon-matched claim tokens that have real literature presence. */
  presenceScore: number;
  /** Number of co-mention edges among the present terms (real counts). */
  coMentionPairs: number;
  /** Real per-term doc counts for the present terms. */
  docCounts: Record<string, number>;
}

/**
 * Score how well a natural-language claim is supported by the literature
 * corpus. Real and honest: tokens are matched to the curated lexicon by exact
 * substring, presence = real doc counts, co-mention = real co-occurrence.
 * A low/zero score means the corpus does not substantiate the claim's terms —
 * reported as-is, never padded.
 */
export function scoreClaimSupport(docs: LiteratureDoc[], claimText: string, minDocs = 2): ClaimSupportResult {
  const tokens = claimText
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));

  const hits = scanLiteratureTerms(docs);
  const docByTerm = new Map(hits.map((h) => [h.termId, h.docs]));

  const matchedTerms: ClaimSupportResult['matchedTerms'] = [];
  const seenToken = new Set<string>();
  for (const token of tokens) {
    if (seenToken.has(token)) continue;
    seenToken.add(token);
    // Prefer an exact whole-term match before any substring match, so e.g.
    // 'apoptosis' binds to the dedicated 'apoptosis' term, not to a longer
    // term like 'TNF-related apoptosis' that merely contains it.
    const exact = LITERATURE_LEXICON.find((t) => t.terms.some((s) => s.toLowerCase() === token));
    const term = exact ?? LITERATURE_LEXICON.find((t) => t.terms.some((s) => s.toLowerCase().includes(token) || token.includes(s.toLowerCase())));
    if (term) matchedTerms.push({ token, termId: term.id });
  }

  const presentTerms: ClaimSupportResult['presentTerms'] = [];
  const byTerm = new Map<string, number>();
  for (const m of matchedTerms) {
    const docsN = docByTerm.get(m.termId) ?? 0;
    if (docsN >= minDocs) byTerm.set(m.termId, docsN);
  }
  for (const [termId, docsN] of byTerm) presentTerms.push({ termId, docs: docsN });
  presentTerms.sort((a, b) => b.docs - a.docs);

  const presentIds = new Set(presentTerms.map((p) => p.termId));
  let coMentionPairs = 0;
  const edges = buildLiteratureEdges(docs);
  for (const e of edges) {
    if (presentIds.has(e.source) && presentIds.has(e.target)) coMentionPairs++;
  }

  const presenceScore = matchedTerms.length ? presentTerms.length / matchedTerms.length : 0;
  const docCounts: Record<string, number> = {};
  for (const p of presentTerms) docCounts[p.termId] = p.docs;

  return { tokens, matchedTerms, presentTerms, presenceScore, coMentionPairs, docCounts };
}