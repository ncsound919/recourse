import { describe, it, expect } from 'vitest';
import { exportOdeToSbml } from '../src/lib/sbmlExporter';
import { exportOdeToPhysicell } from '../src/lib/physicellExporter';
import { buildEvidenceDossier } from '../src/lib/evidenceDossier';
import { CANONICAL_ODE } from '../src/lib/odeKineticSynthesizer';
import { runDosingSweep } from '../src/lib/dosingOptimizer';
import type { LiveGraphResult } from '../src/lib/liveOncologyGraph';

function sampleGraph(): LiveGraphResult {
  return {
    ok: true,
    nodes: [
      { id: 'ot:disease:MONDO_0005233', attrs: { label: 'NSCLC' }, provenance: 'open_targets' },
      { id: 'ot:target:ENSG00000146648', attrs: { label: 'EGFR' }, provenance: 'open_targets' },
      { id: 'pt:gene:KRAS', attrs: { label: 'KRAS' }, provenance: 'pubtator' },
    ],
    edges: [
      { source: 'ot:target:ENSG00000146648', target: 'ot:disease:MONDO_0005233', relation: 'associates_disease', weight: 0.9, provenance: 'open_targets', evidence: 'OT score 0.900' },
      { source: 'pt:gene:KRAS', target: 'ot:disease:MONDO_0005233', relation: 'cooccurs_with_disease', weight: 2, provenance: 'pubtator', evidence: 'PubTator co-occurrence PMID 34918209, 35775708' },
    ],
    payload: { nodes: [], edges: [] },
    providers: { openTargets: { ok: true }, pubTator: { ok: true } },
    counts: { canonicalNodes: 0, openTargetsNodes: 2, pubTatorNodes: 1, openTargetsEdges: 1, pubTatorEdges: 1 },
    generatedAt: '2026-09-07T00:00:00.000Z',
  };
}

describe('SBML Level 3 exporter', () => {
  it('produces a valid-level SBML document with species, params, reactions', () => {
    const ex = exportOdeToSbml({ ...CANONICAL_ODE, totalDays: 60 });
    expect(ex.ok).toBe(true);
    expect(ex.level).toBe(3);
    expect(ex.version).toBe(1);
    expect(ex.speciesCount).toBe(7);
    expect(ex.parameterCount).toBe(15);
    expect(ex.reactionCount).toBe(7);
    expect(ex.sbml).toContain('level="3" version="1"');
    expect(ex.sbml).toContain('id="S"');
    expect(ex.sbml).toContain('id="dS_reaction"');
    // MathML is present in a kinetic law
    expect(ex.sbml).toContain('<kineticLaw>');
    expect(ex.sbml).toContain('<math');
  });

  it('uses CONTENT MathML (apply/plus/times) that libSBML accepts, not presentation mrow', () => {
    const ex = exportOdeToSbml({ ...CANONICAL_ODE });
    // SBML requires content MathML: no <mrow>, has <apply><times/> etc.
    expect(ex.sbml).not.toContain('<mrow');
    expect(ex.sbml).toContain('<apply><times/>');
    expect(ex.sbml).toContain('<apply><plus/>');
    expect(ex.sbml).toContain('<apply><minus/>');
  });

  it('emits mandatory SBML L3V1 attributes (species/param/reaction/reference)', () => {
    const ex = exportOdeToSbml({ ...CANONICAL_ODE });
    expect(ex.sbml).toContain('hasOnlySubstanceUnits="false" boundaryCondition="false" constant="false"');
    expect(ex.sbml).toContain('constant="true"');
    expect(ex.sbml).toContain('reversible="false" fast="false"');
    expect(ex.sbml).toContain('constant="true"');
  });

  it('places notes in the XHTML namespace (libSBML requirement)', () => {
    const ex = exportOdeToSbml({ ...CANONICAL_ODE });
    expect(ex.sbml).toContain('<body xmlns="http://www.w3.org/1999/xhtml">');
  });

  it('carries the therapy mode and dosing schedule into model notes (honest)', () => {
    const ex = exportOdeToSbml({ ...CANONICAL_ODE, therapyMode: 'adaptive_pulsed', totalDays: 90 });
    expect(ex.sbml).toContain('adaptive_pulsed');
    expect(ex.sbml).toContain('not flattened into the SBML');
  });

  it('includes the synthesized IC50 and growth values as parameters', () => {
    const ex = exportOdeToSbml({ ...CANONICAL_ODE, ic50_S: 11.84, growthRate_S: 0.22 });
    expect(ex.sbml).toContain('id="ic50S" value="11.84"');
    expect(ex.sbml).toContain('id="rS" value="0.22"');
  });
});

describe('PhysiCell XML exporter', () => {
  it('produces well-formed PhysiCell settings XML with seeded cells and params', () => {
    const ex = exportOdeToPhysicell({ ...CANONICAL_ODE, totalDays: 90 });
    expect(ex.ok).toBe(true);
    expect(ex.cellCount).toBe(2);
    expect(ex.parameterCount).toBe(15);
    expect(ex.xml).toContain('<PhysiCell_settings');
    expect(ex.xml).toContain('<cell_definition name="tumor"');
    expect(ex.xml).toContain('<cell_definition name="immune"');
    expect(ex.xml).toContain('growthRate_S');
    expect(ex.xml).toContain('<microenvironment_setup>');
  });

  it('carries the synthesized IC50 into user_parameters', () => {
    const ex = exportOdeToPhysicell({ ...CANONICAL_ODE, ic50_S: 11.84, drugDose: 4 });
    expect(ex.xml).toContain('name="ic50_S" units="uM" value="11.84"');
    expect(ex.xml).toContain('name="drugDose" units="uM" value="4"');
  });

  it('is honest about being a config, not a solver', () => {
    const ex = exportOdeToPhysicell({ ...CANONICAL_ODE });
    expect(ex.note.toLowerCase()).toContain('requires a physicell build');
    expect(ex.xml).toContain('Honesty: this is a PhysiCell *config*');
  });
});

describe('cryptographic evidence dossier', () => {
  it('hash-chains every stage so tampering is detectable', async () => {
    const opt = await runDosingSweep({ ...CANONICAL_ODE, totalDays: 60 }, { ensembleSize: 8 });
    const build = () =>
      buildEvidenceDossier({
        generatedAt: '2026-09-07T00:00:00.000Z',
        graph: sampleGraph(),
        params: opt.params,
        paramProvenance: [{ key: 'growthRate_S', origin: 'evidence-derived', evidence: 'EGFR 0.900' }],
        arms: opt.arms.map((a) => ({ arm: `${a.therapyMode}@${a.drugDose}`, finalVolume: a.finalVolume_mm3, reachable: a.reachability.isReachable })),
        extinction: { extinctionProbability: opt.extinction.extinctionProbability, nRuns: opt.extinction.nRuns },
        sbml: { hash: 'abc', ok: true },
        physicell: { hash: 'def', ok: true },
      });
    const dossier = build();
    expect(dossier.ok).toBe(true);
    expect(dossier.hash).toBeTruthy();
    expect(dossier.stages).toHaveLength(5);
    // chain integrity: each stage commits to the previous
    expect(dossier.stages[0]!.prevHash).toBeNull();
    for (let i = 1; i < dossier.stages.length; i++) {
      expect(dossier.stages[i]!.prevHash).toBe(dossier.stages[i - 1]!.hash);
    }
    // deterministic: same inputs + timestamp → same hash
    expect(build().hash).toBe(dossier.hash);
  });

  it('extracts real DOIs/PMIDs referenced by the live graph', () => {
    const dossier = buildEvidenceDossier({
      graph: sampleGraph(),
      params: { ...CANONICAL_ODE },
      paramProvenance: [],
      arms: [],
      extinction: null,
    });
    expect(dossier.provenanceSources.some((s) => s.source.startsWith('pubmed:'))).toBe(true);
    expect(dossier.provenanceSources.some((s) => s.source === 'open_targets')).toBe(true);
  });

  it('emits falsifiable, scoped statements (not unfounded claims)', () => {
    const dossier = buildEvidenceDossier({
      graph: sampleGraph(),
      params: { ...CANONICAL_ODE },
      paramProvenance: [],
      arms: [{ arm: 'adaptive_pulsed@2', finalVolume: 5, reachable: true }],
      extinction: { extinctionProbability: 0.25, nRuns: 8 },
    });
    expect(dossier.statements.length).toBeGreaterThan(0);
    for (const s of dossier.statements) {
      expect(['model-derived', 'calibrated', 'literature-prior', 'canonical']).toContain(s.scope);
      expect(typeof s.claim).toBe('string');
    }
    expect(dossier.note).toContain('makes claims verifiable, not true');
  });

  it('reports ok:false with an error when construction throws', () => {
    const d = buildEvidenceDossier({
      graph: { ...sampleGraph(), edges: 42 as unknown as LiveGraphResult['edges'] },
      params: { ...CANONICAL_ODE },
      paramProvenance: [],
      arms: [],
      extinction: null,
    });
    expect(d.ok).toBe(false);
    expect(d.error).toBeTruthy();
  });
});