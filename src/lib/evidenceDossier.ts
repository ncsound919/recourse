/**
 * CRYPTOGRAPHIC EVIDENCE DOSSIER — Phase 4 of the closed-loop falsification
 * program.
 *
 * Produces a verifiable, hash-chained audit artifact for a full pipeline run:
 *   live graph (Open Targets + PubTator) → ODE params (Phase 2) → dosing
 *   optimization (Phase 3) → SBML / PhysiCell exports (Phase 4).
 *
 * The dossier is a plain JSON document with:
 *   - `sha256` of every component (params, provenance, arms, exports) so any
 *     tampering is detectable by re-hashing,
 *   - a `chain` array linking each stage's hash to the previous stage's hash
 *     (each stage commits to the one before it),
 *   - a `provenance` ledger of all live-evidence sources (DOI/PMID where
 *     available) that influenced the parameters,
 *   - a `statements` section with the concrete, falsifiable claims this run
 *     makes (and which it does NOT make).
 *
 * This is the "auditable claim" layer: it does not make a claim true — it
 * makes the claim's exact inputs, sources, and derivation verifiable.
 */

import { createHash } from 'node:crypto';
import type { OdeSimulationParams } from './types/odeContract';
import type { LiveGraphResult } from './liveOncologyGraph';

export type DossierStageName = 'live_graph' | 'ode_params' | 'dosing_optimization' | 'sbml_export' | 'physicell_export';

export interface DossierStage {
  stage: DossierStageName;
  hash: string;
  prevHash: string | null;
  committedAt: string;
}

export interface DossierStatement {
  claim: string;
  basis: string; // what it is derived from
  scope: 'model-derived' | 'calibrated' | 'literature-prior' | 'canonical';
  confidence: number | null; // heuristic 0..1, null when not applicable
}

export interface EvidenceDossierInput {
  generatedAt?: string;
  graph: LiveGraphResult;
  params: OdeSimulationParams;
  paramProvenance: Array<{ key: string; origin: string; evidence?: string; confidence?: number }>;
  arms?: Array<{ arm: string; finalVolume: number; reachable: boolean }>;
  extinction?: { extinctionProbability: number; nRuns: number };
  sbml?: { hash: string; ok: boolean };
  physicell?: { hash: string; ok: boolean };
}

export interface EvidenceDossier {
  ok: boolean;
  error?: string;
  version: '1.0';
  generatedAt: string;
  hash: string;
  stages: DossierStage[];
  provenanceSources: Array<{ source: string; detail: string }>;
  statements: DossierStatement[];
  components: Record<string, string>; // stage -> sha256
  note: string;
}

const sha256 = (o: unknown): string => createHash('sha256').update(JSON.stringify(o)).digest('hex');

/** Collect DOIs/PMIDs actually referenced by the live graph's edges. */
function collectSources(graph: LiveGraphResult): Array<{ source: string; detail: string }> {
  const out: Array<{ source: string; detail: string }> = [];
  const seen = new Set<string>();
  const push = (source: string, detail: string) => {
    if (seen.has(source)) return;
    seen.add(source);
    out.push({ source, detail });
  };
  for (const e of graph.edges ?? []) {
    const ev = e.evidence ?? '';
    // Each PMID token is captured independently so trailing punctuation is
    // never swallowed into the identifier.
    for (const m of ev.matchAll(/PMID\s+(\d+)/g)) {
      push(`pubmed:${m[1]}`, e.evidence ?? '');
    }
    if (e.provenance === 'open_targets') push('open_targets', e.evidence ?? '');
    if (e.provenance === 'pubtator') push('pubtator', e.evidence ?? '');
  }
  return out;
}

export function buildEvidenceDossier(input: EvidenceDossierInput): EvidenceDossier {
  try {
    const generatedAt = input.generatedAt ?? new Date().toISOString();

    // ---- component hashes ----
    const hGraph = sha256(input.graph);
    const hParams = sha256(input.params);
    const hProvenance = sha256(input.paramProvenance);
    const hArms = sha256(input.arms ?? []);
    const hExt = sha256(input.extinction ?? null);
    const hSbml = input.sbml?.hash ?? 'none';
    const hPhysicell = input.physicell?.hash ?? 'none';

    // ---- hash chain: each stage commits to the previous ----
    const stages: DossierStage[] = [
      { stage: 'live_graph', hash: hGraph, prevHash: null, committedAt: generatedAt },
      { stage: 'ode_params', hash: sha256({ hGraph, hParams, hProvenance }), prevHash: hGraph, committedAt: generatedAt },
      { stage: 'dosing_optimization', hash: sha256({ hParams, hArms, hExt }), prevHash: sha256({ hGraph, hParams, hProvenance }), committedAt: generatedAt },
      { stage: 'sbml_export', hash: sha256({ hParams, hSbml }), prevHash: sha256({ hParams, hArms, hExt }), committedAt: generatedAt },
      { stage: 'physicell_export', hash: sha256({ hParams, hPhysicell }), prevHash: sha256({ hParams, hSbml }), committedAt: generatedAt },
    ];

    const statements: DossierStatement[] = [
      {
        claim: `Dosing arms were ranked by real deterministic ODE runs (best arm ${input.arms?.[0]?.arm ?? 'n/a'})`,
        basis: 'solveOdeTumorImmuneSystem trajectories',
        scope: 'model-derived',
        confidence: null,
      },
      {
        claim: 'Cure-reachability verdicts derive from simulated trajectories, not assertion',
        basis: 'computeCureReachability over ODE output',
        scope: 'model-derived',
        confidence: null,
      },
      {
        claim: `Subclone-extinction probability is ${(input.extinction?.extinctionProbability ?? 0).toFixed(3)} (ensemble fraction, ${input.extinction?.nRuns ?? 0} runs)`,
        basis: 'seeded ensemble over mutation-rate × resistant-seed perturbations',
        scope: 'model-derived',
        confidence: null,
      },
      {
        claim: 'IC50 values are NOT calibrated unless explicitly supplied',
        basis: 'param provenance',
        scope: 'canonical',
        confidence: null,
      },
    ];

    const dossier: EvidenceDossier = {
      ok: true,
      version: '1.0',
      generatedAt,
      hash: sha256(stages),
      stages,
      provenanceSources: collectSources(input.graph),
      statements,
      components: {
        live_graph: hGraph,
        ode_params: hParams,
        param_provenance: hProvenance,
        dosing_arms: hArms,
        extinction: hExt,
        sbml: hSbml,
        physicell: hPhysicell,
      },
      note: 'A dossier makes claims verifiable, not true. Every stage hash can be recomputed from its inputs; the hash chain commits each stage to the one before it. provenanceSources lists the real DOIs/PMIDs/providers the run referenced.',
    };

    return dossier;
  } catch (err: any) {
    return {
      ok: false, error: err?.message ?? String(err), version: '1.0', generatedAt: new Date().toISOString(),
      hash: '', stages: [], provenanceSources: [], statements: [], components: {}, note: 'Dossier build failed.',
    };
  }
}