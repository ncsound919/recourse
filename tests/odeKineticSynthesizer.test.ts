import { describe, it, expect } from 'vitest';
import {
  synthesizeOdeKinetics,
  topTargetsForDisease,
  resistanceSignal,
  tractabilityConfidence,
  CANONICAL_ODE,
} from '../src/lib/odeKineticSynthesizer';
import type { LiveGraphResult } from '../src/lib/liveOncologyGraph';

// A hand-built live graph that exercises every mapping branch without network.
function makeGraph(overrides: Partial<LiveGraphResult> = {}): LiveGraphResult {
  const base: LiveGraphResult = {
    ok: true,
    nodes: [
      { id: 'ot:disease:MONDO_0005233', attrs: { label: 'non-small cell lung carcinoma', entityType: 'disease' }, provenance: 'open_targets' },
      { id: 'ot:target:ENSG00000146648', attrs: { label: 'EGFR', approvedName: 'epidermal growth factor receptor', tractability: ['Approved Drug', 'Advanced Clinical'] }, provenance: 'open_targets' },
      { id: 'ot:target:ENSG00000133703', attrs: { label: 'KRAS', tractability: ['Approved Drug'] }, provenance: 'open_targets' },
      { id: 'pt:gene:KRAS', attrs: { label: 'KRAS', entityType: 'gene' }, provenance: 'pubtator' },
      { id: 'pt:gene:TP53', attrs: { label: 'TP53', entityType: 'gene' }, provenance: 'pubtator' },
      { id: 'pt:disease:Lung_Neoplasms', attrs: { label: 'Lung_Neoplasms', entityType: 'disease' }, provenance: 'pubtator' },
    ],
    edges: [
      { source: 'ot:target:ENSG00000146648', target: 'ot:disease:MONDO_0005233', relation: 'associates_disease', weight: 0.888, provenance: 'open_targets', evidence: 'OT score 0.888' },
      { source: 'ot:target:ENSG00000133703', target: 'ot:disease:MONDO_0005233', relation: 'associates_disease', weight: 0.834, provenance: 'open_targets', evidence: 'OT score 0.834' },
      { source: 'pt:gene:KRAS', target: 'pt:disease:Lung_Neoplasms', relation: 'cooccurs_with_disease', weight: 3, provenance: 'pubtator', evidence: 'cooc' },
      { source: 'pt:gene:TP53', target: 'pt:disease:Lung_Neoplasms', relation: 'cooccurs_with_disease', weight: 1, provenance: 'pubtator', evidence: 'cooc' },
    ],
    payload: { nodes: [], edges: [] },
    providers: { openTargets: { ok: true }, pubTator: { ok: true } },
    counts: { canonicalNodes: 0, openTargetsNodes: 3, pubTatorNodes: 3, openTargetsEdges: 2, pubTatorEdges: 2 },
    generatedAt: '2026-09-07T00:00:00.000Z',
  };
  return { ...base, ...overrides };
}

describe('topTargetsForDisease', () => {
  it('extracts scored targets for the requested disease, sorted by score', () => {
    const g = makeGraph();
    const targets = topTargetsForDisease(g, 'MONDO_0005233');
    expect(targets.length).toBe(2);
    expect(targets[0]!.symbol).toBe('EGFR');
    expect(targets[0]!.score).toBeCloseTo(0.888);
    expect(targets[1]!.symbol).toBe('KRAS');
  });

  it('returns empty when the disease has no OT targets', () => {
    const g = makeGraph();
    expect(topTargetsForDisease(g, 'MONDO_NOPE')).toHaveLength(0);
  });
});

describe('resistanceSignal + tractabilityConfidence', () => {
  it('detects resistance genes co-occurring in the PubTator layer', () => {
    const g = makeGraph();
    expect(resistanceSignal(g)).toBeGreaterThan(0); // KRAS + TP53 both resistance genes
  });

  it('returns 0 when no resistance genes co-occur', () => {
    const g = makeGraph({
      edges: [{ source: 'pt:gene:GAPDH', target: 'pt:disease:Lung_Neoplasms', relation: 'cooccurs_with_disease', weight: 1, provenance: 'pubtator' }],
    });
    expect(resistanceSignal(g)).toBe(0);
  });

  it('reads real tractability labels from the OT layer', () => {
    const g = makeGraph();
    const tr = tractabilityConfidence(g);
    expect(tr.hasApproved).toBe(true);
    expect(tr.labels).toContain('Approved Drug');
  });
});

describe('synthesizeOdeKinetics', () => {
  it('produces a complete OdeSimulationParams bundle with provenance on every param', async () => {
    const bundle = await synthesizeOdeKinetics({ graph: makeGraph(), diseaseId: 'MONDO_0005233' });
    expect(bundle.ok).toBe(true);
    // every required ODE key is present
    for (const key of Object.keys(CANONICAL_ODE)) {
      expect(bundle.params).toHaveProperty(key);
    }
    // every provenance row is self-consistent
    const keys = new Set(bundle.provenance.map((p) => p.key));
    for (const p of bundle.provenance) {
      expect(['evidence-derived', 'literature-prior', 'canonical', 'calibrated']).toContain(p.origin);
      expect(p.confidence).toBeGreaterThan(0);
      expect(p.confidence).toBeLessThanOrEqual(0.95);
      expect(typeof p.evidence).toBe('string');
    }
    // growthRate_S was boosted by the EGFR driver evidence
    expect(bundle.params.growthRate_S).toBeGreaterThan(CANONICAL_ODE.growthRate_S);
    expect(keys.has('growthRate_S')).toBe(true);
    // mutation rate raised by resistance signal
    expect(bundle.params.mutationRate_mu).toBeGreaterThan(CANONICAL_ODE.mutationRate_mu);
    // note is present and honest
    expect(bundle.synthesisNote).toContain('HEURISTIC');
  });

  it('marks IC50 as calibrated when a real fit is supplied', async () => {
    const bundle = await synthesizeOdeKinetics({
      graph: makeGraph(),
      diseaseId: 'MONDO_0005233',
      ic50Fit: { medianIc50: 11.84, ciLow: 10.6, ciHigh: 13.32, n: 392, source: 'ccle_broad_2019_CCLE_drug_treatment_IC50', mode: 'live_network' },
    });
    const ic50 = bundle.provenance.find((p) => p.key === 'ic50_S');
    expect(ic50?.origin).toBe('calibrated');
    expect(bundle.params.ic50_S).toBeCloseTo(11.84);
    expect(ic50?.ciLow).toBeCloseTo(10.6);
    expect(ic50?.ciHigh).toBeCloseTo(13.32);
  });

  it('leaves IC50 canonical (NOT calibrated) when no fit is supplied', async () => {
    const bundle = await synthesizeOdeKinetics({ graph: makeGraph(), diseaseId: 'MONDO_0005233' });
    const ic50 = bundle.provenance.find((p) => p.key === 'ic50_S');
    expect(ic50?.origin).toBe('canonical');
    expect(bundle.params.ic50_S).toBe(CANONICAL_ODE.ic50_S);
    expect(ic50?.evidence).toContain('NOT calibrated');
  });

  it('honours request-level dosing overrides', async () => {
    const bundle = await synthesizeOdeKinetics({
      graph: makeGraph(),
      diseaseId: 'MONDO_0005233',
      dose: { drugDose: 5, therapyMode: 'adaptive_pulsed', totalDays: 90 },
    });
    expect(bundle.params.drugDose).toBe(5);
    expect(bundle.params.therapyMode).toBe('adaptive_pulsed');
    expect(bundle.params.totalDays).toBe(90);
  });

  it('returns ok:false honestly when the graph build fails', async () => {
    const bad: LiveGraphResult = {
      ok: false, error: 'boom', nodes: [], edges: [], payload: { nodes: [], edges: [] },
      providers: { openTargets: { ok: false, error: 'boom' }, pubTator: { ok: false, error: 'boom' } },
      counts: { canonicalNodes: 0, openTargetsNodes: 0, pubTatorNodes: 0, openTargetsEdges: 0, pubTatorEdges: 0 },
      generatedAt: '2026-09-07T00:00:00.000Z',
    };
    const bundle = await synthesizeOdeKinetics({ graph: bad });
    expect(bundle.ok).toBe(false);
    expect(bundle.error).toContain('boom');
  });

  it('lowers drugKill_R when resistance signal is present (resistant subclone is killed less)', async () => {
    const bundle = await synthesizeOdeKinetics({ graph: makeGraph(), diseaseId: 'MONDO_0005233' });
    const rSig = resistanceSignal(makeGraph());
    expect(rSig).toBeGreaterThan(0);
    expect(bundle.params.drugKill_R).toBeLessThan(CANONICAL_ODE.drugKill_R);
    const row = bundle.provenance.find((p) => p.key === 'drugKill_R');
    expect(row?.origin).toBe('evidence-derived');
    expect(row?.evidence).toContain('reduces');
  });

  it('keeps drugKill_R canonical when no resistance evidence exists', async () => {
    const noResistance = makeGraph({
      edges: [{ source: 'ot:target:ENSG00000146648', target: 'ot:disease:MONDO_0005233', relation: 'associates_disease', weight: 0.888, provenance: 'open_targets', evidence: 'OT score 0.888' }],
    });
    const bundle = await synthesizeOdeKinetics({ graph: noResistance, diseaseId: 'MONDO_0005233' });
    expect(bundle.params.drugKill_R).toBe(CANONICAL_ODE.drugKill_R);
    const row = bundle.provenance.find((p) => p.key === 'drugKill_R');
    expect(row?.origin).toBe('literature-prior');
  });
});