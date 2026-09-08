/**
 * EVIDENCE-TO-ODE KINETIC SYNTHESIZER — Phase 2 of the closed-loop
 * falsification program.
 *
 * Turns live evidence (Open Targets associations + PubTator co-occurrence, the
 * Phase 1 output) into a concrete `OdeSimulationParams` bundle that Overlay
 * Oncology's `solveOdeTumorImmuneSystem` engine accepts verbatim
 * (lib/engine-registry.ts OdeSimulationParams contract).
 *
 * HONESTY MODEL — every synthesized parameter carries:
 *   - `origin`: `evidence-derived` | `literature-prior` | `canonical` | `calibrated`
 *   - `confidence`: a HEURISTIC 0..1 label of evidence strength, NOT a
 *     statistical posterior. Only a real IC50 fit (e.g. Overlay's CCLE
 *     calibration-state.json) is reported as `calibrated` with real bootstrap
 *     CI bounds; everything else is a bounded, documented synthesis rule.
 *   - `evidence`: a human-readable source string (which provider / gene /
 *     score / tractability label produced the value).
 *
 * Nothing here is invented biology. Where the live providers give real numbers
 * (association scores, tractability labels, co-occurrence counts) those numbers
 * drive the mapping through deterministic, documented rules. Where they do not,
 * the parameter falls back to the canonical/literature value and says so.
 */

import { buildLiveOncologyGraph, type LiveGraphResult } from './liveOncologyGraph';
import type { OdeSimulationParams } from './types/odeContract';

export const CANONICAL_ODE: OdeSimulationParams = {
  initialS: 200,
  initialR: 5,
  initialE: 30,
  carryingCap_K: 1000,
  growthRate_S: 0.18,
  growthRate_R: 0.14,
  drugKill_S: 0.55,
  drugKill_R: 0.08,
  ic50_S: 1.0,
  ic50_R: 8.0,
  mutationRate_mu: 0.001,
  drugDose: 2.0,
  dosingIntervalDays: 3,
  totalDays: 120,
  therapyMode: 'continuous_mtd',
};

export type ParamOrigin = 'evidence-derived' | 'literature-prior' | 'canonical' | 'calibrated';

export interface KineticParam {
  key: keyof OdeSimulationParams;
  value: number;
  origin: ParamOrigin;
  confidence: number; // 0..1 HEURISTIC evidence-strength label (not a posterior)
  evidence?: string;
  ciLow?: number;
  ciHigh?: number;
}

export interface OdeKineticBundle {
  ok: boolean;
  error?: string;
  params: OdeSimulationParams;
  provenance: KineticParam[];
  synthesisNote: string;
  providers: { openTargets: { ok: boolean; error?: string }; pubTator: { ok: boolean; error?: string } };
  generatedAt: string;
}

export interface Ic50Fit {
  medianIc50: number;
  ciLow: number;
  ciHigh: number;
  n: number;
  source: string;
  mode: 'live_network' | 'manual';
}

export interface SynthesizeOptions {
  /** Use a prebuilt live graph instead of building one (tests / caching). */
  graph?: LiveGraphResult;
  /** Primary disease id to anchor target evidence to (defaults to the graph's first disease). */
  diseaseId?: string;
  /** A real IC50 fit to mark the dose-response as calibrated. */
  ic50Fit?: Ic50Fit | null;
  /** Dosing regime overrides (not evidence-derived). */
  dose?: {
    drugDose?: number;
    dosingIntervalDays?: number;
    totalDays?: number;
    therapyMode?: OdeSimulationParams['therapyMode'];
  };
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Genes whose amplification / mutation is a canonical proliferation driver. */
const DRIVER_GENES = new Set([
  'KRAS', 'NRAS', 'HRAS', 'EGFR', 'ERBB2', 'ERBB3', 'MET', 'BRAF', 'RAF1',
  'PIK3CA', 'AKT1', 'MTOR', 'ALK', 'RET', 'ROS1', 'NTRK1', 'NTRK2', 'NTRK3',
  'FGFR1', 'FGFR2', 'FGFR3', 'MYC', 'MYCN', 'CCND1', 'CDK4', 'CDK6', 'MDM2',
  'CTNNB1', 'PDGFRA', 'KIT', 'FLT3', 'ABL1', 'JAK2', 'IDH1', 'IDH2',
]);

/** Genes whose activation is a documented resistance/escape mechanism. */
const RESISTANCE_GENES = new Set([
  'KRAS', 'NRAS', 'BRAF', 'MAP2K1', 'MAP2K2', 'ERBB2', 'MET', 'AXL',
  'PIM1', 'MCL1', 'BCL2', 'TP53', 'RB1', 'STK11', 'KEAP1', 'NF1', 'NF2',
  'PTEN', 'AKT1', 'PIK3CA', 'EGFR', 'FGFR1', 'B2M', 'JAK1', 'JAK2',
]);

const clampConfidence = (x: number) => clamp(Math.round(x * 100) / 100, 0.05, 0.95);

// ---------------------------------------------------------------------------
// Pure mapping helpers (deterministic, unit-testable)
// ---------------------------------------------------------------------------

/**
 * Extract (symbol, associationScore) pairs for the given disease from an OT
 * disease node: `ot:target:<ensembl>` nodes with `label` = approvedSymbol.
 */
export function topTargetsForDisease(
  graph: LiveGraphResult,
  diseaseId?: string,
): Array<{ ensemblId: string; symbol: string; score: number }> {
  const diseaseKey = diseaseId ? `ot:disease:${diseaseId}` : null;
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const targetIds = new Set<string>();
  const scored = new Map<string, { symbol: string; score: number }>();

  for (const e of graph.edges) {
    const isTarget = e.source.startsWith('ot:target:');
    const isDisease = e.target.startsWith('ot:disease:');
    if (!isTarget || !isDisease) continue;
    if (diseaseKey && e.target !== diseaseKey) continue;
    const t = nodes.get(e.source);
    if (!t) continue;
    const symbol = String(t.attrs.label ?? t.attrs.approvedSymbol ?? e.source);
    const ensemblId = e.source.replace('ot:target:', '');
    targetIds.add(ensemblId);
    const cur = scored.get(ensemblId);
    if (!cur || (typeof e.weight === 'number' && e.weight > cur.score)) {
      scored.set(ensemblId, { symbol, score: typeof e.weight === 'number' ? e.weight : 0 });
    }
  }
  return [...scored.entries()]
    .map(([ensemblId, v]) => ({ ensemblId, symbol: v.symbol, score: v.score }))
    .sort((a, b) => b.score - a.score);
}

/** 0..1 resistance pressure signal from PubTator co-occurrence of resistance genes. */
export function resistanceSignal(graph: LiveGraphResult): number {
  const seen = new Set<string>();
  for (const e of graph.edges) {
    if (e.provenance !== 'pubtator') continue;
    const gene = e.source.startsWith('pt:gene:')
      ? e.source.replace('pt:gene:', '')
      : e.target.startsWith('pt:gene:')
        ? e.target.replace('pt:gene:', '')
        : null;
    if (gene && RESISTANCE_GENES.has(gene)) seen.add(gene);
  }
  if (seen.size === 0) return 0;
  // Saturating: 0..1 based on how many distinct resistance genes co-occur.
  return clamp(0.2 * seen.size, 0, 1);
}

/** DrugKill confidence from Open Targets tractability labels (real provider data). */
export function tractabilityConfidence(graph: LiveGraphResult): { hasApproved: boolean; labels: string[] } {
  const labels = new Set<string>();
  for (const n of graph.nodes) {
    const tr = n.attrs.tractability;
    if (Array.isArray(tr)) for (const l of tr) labels.add(String(l));
  }
  const hasApproved = [...labels].some((l) => /approved|advanced|phase/i.test(l));
  return { hasApproved, labels: [...labels] };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function synthesizeOdeKinetics(opts: SynthesizeOptions = {}): Promise<OdeKineticBundle> {
  const graph = opts.graph ?? (await buildLiveOncologyGraph());
  if (!graph.ok) {
    return { ok: false, error: graph.error ?? 'live graph build failed', params: { ...CANONICAL_ODE }, provenance: [], synthesisNote: 'No live evidence — returning canonical ODE params.', providers: { openTargets: graph.providers.openTargets, pubTator: graph.providers.pubTator }, generatedAt: new Date().toISOString() };
  }

  const provenance: KineticParam[] = [];
  const params: OdeSimulationParams = { ...CANONICAL_ODE };

  // --- 1. growthRate_S from top target association -------------------------
  const targets = topTargetsForDisease(graph, opts.diseaseId);
  const top = targets[0];
  const topDriver = top && DRIVER_GENES.has(top.symbol);
  if (top && topDriver && top.score > 0.4) {
    const boost = clamp(1 + 0.35 * top.score, 1, 1.4);
    params.growthRate_S = clamp(CANONICAL_ODE.growthRate_S * boost, 0.08, 0.45);
    provenance.push({
      key: 'growthRate_S', value: params.growthRate_S, origin: 'evidence-derived',
      confidence: clampConfidence(0.5 + 0.3 * top.score),
      evidence: `Driver ${top.symbol} (ENSG ${top.ensemblId}) association score ${top.score.toFixed(3)} → growth boost ×${boost.toFixed(2)}`,
    });
  } else {
    provenance.push({
      key: 'growthRate_S', value: params.growthRate_S, origin: 'literature-prior',
      confidence: 0.5,
      evidence: top ? `Top target ${top.symbol} (score ${top.score.toFixed(3)}) is not a canonical driver; no boost applied` : 'No Open Targets target evidence for this disease',
    });
  }

  // --- 2. growthRate_R from resistance signal ------------------------------
  const rSig = resistanceSignal(graph);
  if (rSig > 0) {
    params.growthRate_R = clamp(CANONICAL_ODE.growthRate_R * (1 + 0.5 * rSig), 0.06, 0.4);
    const cooccuringGenes = [...new Set(
      graph.edges
        .filter((e) => e.provenance === 'pubtator')
        .map((e) => e.source.startsWith('pt:gene:') ? e.source.replace('pt:gene:', '') : e.target.startsWith('pt:gene:') ? e.target.replace('pt:gene:', '') : null)
        .filter((g): g is string => !!g && RESISTANCE_GENES.has(g)),
    )].slice(0, 5).join(', ');
    provenance.push({
      key: 'growthRate_R', value: params.growthRate_R, origin: 'evidence-derived',
      confidence: clampConfidence(0.45 + 0.4 * rSig),
      evidence: `Resistance co-occurrence signal ${rSig.toFixed(2)} (${cooccuringGenes || 'none counted'})`,
    });
  } else {
    provenance.push({
      key: 'growthRate_R', value: params.growthRate_R, origin: 'literature-prior',
      confidence: 0.5, evidence: 'No resistance-gene co-occurrence in PubTator layer',
    });
  }

  // --- 2b. drugKill_R from resistance signal (a resistant subclone is killed
  //         LESS by the drug; a higher resistance signal lowers the rate) -----
  if (rSig > 0) {
    const reduction = clamp(1 - 0.6 * rSig, 0.3, 1); // up to 70% reduction
    params.drugKill_R = clamp(CANONICAL_ODE.drugKill_R * reduction, 0.02, 0.15);
    provenance.push({
      key: 'drugKill_R', value: params.drugKill_R, origin: 'evidence-derived',
      confidence: clampConfidence(0.45 + 0.35 * rSig),
      evidence: `Resistance signal ${rSig.toFixed(2)} reduces resistant-subclone drug kill to ${(reduction * 100).toFixed(0)}% of canonical`,
    });
  } else {
    provenance.push({
      key: 'drugKill_R', value: params.drugKill_R, origin: 'literature-prior',
      confidence: 0.4, evidence: 'No resistance evidence — canonical drugKill_R',
    });
  }

  // --- 3. drugKill_S from tractability -------------------------------------
  const tr = tractabilityConfidence(graph);
  if (tr.hasApproved) {
    params.drugKill_S = clamp(CANONICAL_ODE.drugKill_S * 1.15, 0.4, 0.8);
    provenance.push({
      key: 'drugKill_S', value: params.drugKill_S, origin: 'evidence-derived',
      confidence: clampConfidence(0.5 + 0.3 * (top?.score ?? 0.5)),
      evidence: `Open Targets tractability includes approved/advanced/phase labels (${tr.labels.slice(0, 4).join(', ')})`,
    });
  } else {
    provenance.push({
      key: 'drugKill_S', value: params.drugKill_S, origin: 'literature-prior',
      confidence: 0.4, evidence: 'No drug tractability labels from Open Targets',
    });
  }

  // --- 4. IC50: calibrated if a real fit is supplied, else canonical -------
  if (opts.ic50Fit) {
    const f = opts.ic50Fit;
    params.ic50_S = clamp(f.medianIc50, 0.01, 100);
    provenance.push({
      key: 'ic50_S', value: params.ic50_S, origin: 'calibrated',
      confidence: 0.9,
      ciLow: f.ciLow, ciHigh: f.ciHigh,
      evidence: `Real IC50 fit (n=${f.n}, median ${f.medianIc50.toFixed(2)}, CI ${f.ciLow.toFixed(2)}–${f.ciHigh.toFixed(2)}) from ${f.source} [${f.mode}]`,
    });
    // resistance IC50 multiplier widens with resistance signal
    const mult = 1 + 7 * (0.5 + rSig); // 4.5x..8x
    params.ic50_R = clamp(params.ic50_S * mult, 0.1, 200);
    provenance.push({
      key: 'ic50_R', value: params.ic50_R, origin: rSig > 0 ? 'evidence-derived' : 'literature-prior',
      confidence: clampConfidence(0.5 + 0.3 * rSig),
      evidence: `Resistant-subclone IC50 = ${params.ic50_S.toFixed(2)} × ${mult.toFixed(1)}${rSig > 0 ? ` (resistance signal ${rSig.toFixed(2)})` : ' (canonical resistance multiplier)'}`,
    });
  } else {
    provenance.push({
      key: 'ic50_S', value: params.ic50_S, origin: 'canonical', confidence: 0.4,
      evidence: 'No IC50 fit supplied — canonical 1.0 uM used (NOT calibrated)',
    });
    params.ic50_R = CANONICAL_ODE.ic50_R;
    provenance.push({
      key: 'ic50_R', value: params.ic50_R, origin: 'canonical', confidence: 0.4,
      evidence: 'Canonical resistant-subclone IC50 8.0 uM (NOT calibrated)',
    });
  }

  // --- 5. mutationRate from resistance signal ------------------------------
  params.mutationRate_mu = clamp(CANONICAL_ODE.mutationRate_mu * (1 + 5 * rSig), 0.0005, 0.01);
  provenance.push({
    key: 'mutationRate_mu', value: params.mutationRate_mu,
    origin: rSig > 0 ? 'evidence-derived' : 'literature-prior',
    confidence: clampConfidence(0.4 + 0.4 * rSig),
    evidence: rSig > 0
      ? `Resistance signal ${rSig.toFixed(2)} raises mutation/escape rate`
      : 'Canonical mutation rate (no resistance evidence)',
  });

  // --- 6. Dosing overrides (request-level, never evidence-derived) ---------
  if (opts.dose) {
    if (opts.dose.drugDose !== undefined) params.drugDose = opts.dose.drugDose;
    if (opts.dose.dosingIntervalDays !== undefined) params.dosingIntervalDays = opts.dose.dosingIntervalDays;
    if (opts.dose.totalDays !== undefined) params.totalDays = opts.dose.totalDays;
    if (opts.dose.therapyMode) params.therapyMode = opts.dose.therapyMode;
  }
  provenance.push({
    key: 'drugDose', value: params.drugDose, origin: 'canonical', confidence: 0.5,
    evidence: opts.dose?.drugDose !== undefined ? 'Request-level override' : 'Canonical dose',
  });

  const note =
    'Parameters are synthesized from live provider evidence via documented, deterministic rules. ' +
    '`confidence` is a HEURISTIC label of evidence strength (0..1), not a statistical posterior. ' +
    'Only an explicitly supplied IC50 fit is marked calibrated with real CI bounds. ' +
    'Growth rates, kill rates and mutation rate are synthesis rules bounded to biologically plausible ranges — they are NOT fitted to patient data.';

  return {
    ok: true,
    params,
    provenance,
    synthesisNote: note,
    providers: graph.providers,
    generatedAt: new Date().toISOString(),
  };
}