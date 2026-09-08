import { describe, it, expect } from 'vitest';
import {
  scanLiteratureTerms,
  buildLiteratureEdges,
  literatureEvidence,
  scoreClaimSupport,
  buildLiteratureKgGraph,
  LITERATURE_LEXICON,
  type LiteratureDoc,
} from '../src/lib/literatureGrounding';

function doc(rel: string, text: string): LiteratureDoc {
  return { rel, text };
}

describe('literatureGrounding (pure, real counts over synthetic docs)', () => {
  const docs: LiteratureDoc[] = [
    doc('a.pdf', 'AKT activates PI3K and promotes apoptosis resistance in KRAS-driven tumors.'),
    doc('b.pdf', 'HDAC inhibitors and EGFR blockade target apoptosis.'),
    doc('c.pdf', 'AKT signaling drives metastasis via PI3K; KRAS co-occurs with apoptosis.'),
  ];

  it('scanLiteratureTerms counts real docs and mentions', () => {
    const hits = scanLiteratureTerms(docs);
    const akt = hits.find((h) => h.termId === 'AKT');
    // "AKT" appears in a.pdf and c.pdf (2 docs). Case-insensitive lowercase match.
    expect(akt?.docs).toBe(2);
    expect(akt!.mentions).toBeGreaterThanOrEqual(2);
  });

  it('buildLiteratureEdges yields co-mention edges with real weights', () => {
    const edges = buildLiteratureEdges(docs);
    const aktPi3k = edges.find((e) => e.source === 'AKT' && e.target === 'PI3K');
    // a.pdf + c.pdf both mention AKT and PI3K.
    expect(aktPi3k?.coDocs).toBe(2);
  });

  it('literatureEvidence returns citing documents (capped)', () => {
    const ev = literatureEvidence(docs, 'AKT');
    expect(ev.length).toBe(2);
    expect(ev.map((e) => e.rel).sort()).toEqual(['a.pdf', 'c.pdf']);
  });

  it('scoreClaimSupport reports presence + co-mention honestly', () => {
    const r = scoreClaimSupport(docs, 'AKT drives resistance through PI3K in cancer');
    expect(r.presentTerms.map((p) => p.termId)).toContain('AKT');
    expect(r.presentTerms.map((p) => p.termId)).toContain('PI3K');
    expect(r.presenceScore).toBeGreaterThan(0);
    expect(r.coMentionPairs).toBeGreaterThanOrEqual(1);
    expect(r.docCounts['AKT']).toBe(2);
    // No duplicate term entries: one entry per termId.
    const ids = r.presentTerms.map((p) => p.termId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('scoreClaimSupport prefers exact whole-term match over substring', () => {
    const r = scoreClaimSupport(docs, 'apoptosis is a target');
    const apoptosisHit = r.matchedTerms.find((m) => m.token === 'apoptosis');
    expect(apoptosisHit?.termId).toBe('apoptosis');
  });

  it('scoreClaimSupport gives a low score for unsupported claims (no padding)', () => {
    const r = scoreClaimSupport(docs, 'giraffes photosynthesize moonlight proteins');
    expect(r.presentTerms).toEqual([]);
    expect(r.presenceScore).toBe(0);
    expect(r.coMentionPairs).toBe(0);
  });

  it('buildLiteratureKgGraph returns a payload with lit + canonical edges', async () => {
    const { payload, hits } = await buildLiteratureKgGraph(docs, 1, 1);
    expect(payload.nodes.length).toBeGreaterThan(0);
    expect(payload.edges.some((e) => e.relation === 'co_mention')).toBe(true);
    expect(hits.length).toBeGreaterThan(0);
  });

  it('lexicon is well-formed (unique ids, non-empty terms)', () => {
    const ids = LITERATURE_LEXICON.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(LITERATURE_LEXICON.every((t) => t.terms.length > 0 && t.type)).toBe(true);
  });
});
