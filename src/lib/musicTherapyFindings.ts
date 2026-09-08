/**
 * Music Therapy → Global Lens findings bridge.
 *
 * Turns the deterministic music-therapy research layer into publishable
 * ScienceFinding records that the Global Lens publisher can compose into
 * articles + papers. Every record carries a real ResearchArtifact
 * (reproducible hash + evidence tier), so the publish path treats it exactly
 * like a science-conductor finding.
 *
 * Honesty contract:
 *  - Biomarker numbers are literature-prior MODELS with uncertainty, labeled
 *    estimates — never measurements.
 *  - Priors come from the real evidence pipeline: pooled Europe PMC
 *    meta-analysis when a feed refresh has run, else the fixed Cochrane 2021
 *    anchors (published, attributed).
 *  - The ONLY tuning-sensitive numbers are the seeded tuning-contrast records;
 *    the 6 music-vs-control biomarkers stay tuning-invariant. 415 Hz is
 *    reported as untested, not asserted.
 *  - No fabricated p-values or PMIDs (tuning PMIDs are null pending feed
 *    verification).
 */

import { buildArtifact, type ResearchArtifact } from './researchArtifact.js';
import {
  designMusicTherapyBatch,
  BIOMARKER_PRIORS,
  type CalibratedPrior,
  type BiomarkerId,
  type MusicStimulusParams,
} from './musicTherapyResearch.js';
import { calibratePriors, type TrialEvidence } from './musicTherapyEvidence.js';
import {
  TUNING_GRID,
  TUNING_CAVEATS,
  benchmarkComparison,
  tuningContrastModel,
} from './musicTherapyTuning.js';
import type { ScienceFinding } from './scienceConductor.js';

/** Same anchors the server's /music-therapy/design route uses. */
export const MUSIC_THERAPY_ANCHORS: Record<string, { mean: number; sd: number; source: string }> = {
  anxietySai: { mean: -7.7, sd: 2.0, source: 'Cochrane 2021 (CD006911), n=5576' },
  hr: { mean: -5.0, sd: 2.5, source: 'Cochrane 2021 meta-analysis' },
  bpSystolic: { mean: -6.0, sd: 3.0, source: 'Cochrane 2021 meta-analysis' },
  cortisol: { mean: -0.25, sd: 0.12, source: 'neuroendocrine studies (group singing)' },
  iga: { mean: 0.30, sd: 0.15, source: 'salivary IgA before/after music' },
  hrv: { mean: 0.20, sd: 0.10, source: 'Tibetan singing bowl pilot (EEG/HRV)' },
};

export interface MusicTherapyFindingsOptions {
  /** Live Europe PMC evidence from a feed refresh; empty → Cochrane anchors. */
  evidence?: TrialEvidence[];
  /** Trial designs to emit (1..24). */
  limit?: number;
}

export interface MusicTherapyFindingsResult {
  findings: Array<ScienceFinding & { artifact: ResearchArtifact }>;
  calibratedCount: number;
  evidenceSource: string;
}

/** Map a designed trial into a publishable ScienceFinding (real artifact). */
function trialToFinding(t: {
  id: string;
  biomarkers: Array<{ biomarker: string; effect: number }>;
  artifact: ResearchArtifact;
}): ScienceFinding & { artifact: ResearchArtifact } {
  const byId: Record<string, number> = {};
  for (const b of t.biomarkers) byId[b.biomarker] = b.effect;
  const numbers: Record<string, number | null> = {};
  for (const id of Object.keys(BIOMARKER_PRIORS) as BiomarkerId[]) {
    numbers[id] = typeof byId[id] === 'number' ? Math.round(byId[id] * 100) / 100 : null;
  }
  return {
    kind: 'music_therapy_trial',
    hypothesisId: t.id,
    problemId: 'MT-EVIDENCE',
    claim: t.artifact.claim,
    numbers,
    provenance: t.artifact.provenance,
    mode: 'local_deterministic',
    cycle: 0,
    artifact: t.artifact,
  };
}

/** Build a publishable artifact for a seeded tuning-contrast record. Emits only
 *  the INFORMATIVE records: significant contrasts (432 HR + PWV), the
 *  psych-distress tuning-invariance note, and the 443 null result. The 440
 *  reference and redundant zero records stay out of the brief. 415 is untested
 *  → caveat, never a claim. */
function contrastToFinding(c: ReturnType<typeof tuningContrastModel>[number]): (ScienceFinding & { artifact: ResearchArtifact }) | null {
  if (!c.tested) return null; // 415 Hz untested → caveat, not a claim.
  const informative =
    c.significant ||
    (c.metric === 'psych_distress' && c.tuningHz === 440) || // one tuning-invariance note
    (c.tuningHz === 443 && c.metric === 'HR'); // null-result demonstration
  if (!informative) return null;

  const metric = c.metric;
  const unit = metric === 'PWV' ? 'm/s' : metric === 'HR' ? 'bpm' : '';
  const claim = c.significant
    ? `Tuning contrast @${c.tuningHz}Hz: ${metric} Δ${c.delta}${unit ? ' ' + unit : ''} vs 440Hz reference — significant (p=${c.p}, ${c.source}). Estimates, not measurements.`
    : `Tuning contrast @${c.tuningHz}Hz: ${metric} Δ${c.delta}${unit ? ' ' + unit : ''} vs 440Hz reference — not significant (${c.source}).`;
  const artifact = buildArtifact({
    kind: 'music_therapy_tuning',
    claim,
    engine: 'music-therapy-tuning (seeded head-to-head)',
    params: { tuningHz: c.tuningHz, metric: c.metric, delta: c.delta, p: c.p },
    seed: null,
    evidenceTier: 'E3', // seeded literature records, not pooled meta-analysis
    stats: c.p !== null ? { test: 'between-group contrast', n: 0, effect: c.delta, p: c.p } : null,
    provenance: c.source,
  });
  return {
    kind: 'tuning_contrast',
    hypothesisId: `MT-TUNING-${c.tuningHz}-${c.metric}`,
    problemId: 'MT-EVIDENCE',
    claim,
    numbers: { delta: c.delta, p: c.p ?? null },
    provenance: c.source,
    mode: 'local_deterministic',
    cycle: 0,
    artifact,
  };
}

/**
 * Real, publishable music-therapy findings: trial designs across the tuning
 * grid + seeded tuning-contrast records + the Cochrane benchmark. Empty
 * evidence feed falls back to the published Cochrane anchors (still real).
 */
export function musicTherapyFindings(opts: MusicTherapyFindingsOptions = {}): MusicTherapyFindingsResult {
  const limit = Math.max(1, Math.min(24, opts.limit ?? 12));

  let priors: Partial<Record<BiomarkerId, CalibratedPrior>> | undefined;
  let evidenceSource = 'Cochrane 2021 (CD006911) anchors, n=5576';
  if (opts.evidence && opts.evidence.length > 0) {
    const calibrated = calibratePriors(opts.evidence, MUSIC_THERAPY_ANCHORS);
    priors = Object.fromEntries(
      calibrated.map((p) => [p.biomarker, { mean: p.mean, sd: p.sd, calibrated: p.calibrated, source: p.source }]),
    );
    const poolable = calibrated.filter((p) => p.calibrated).length;
    if (poolable > 0) evidenceSource = `pooled Europe PMC meta-analysis (${poolable} calibrated biomarkers)`;
  }

  const base: MusicStimulusParams = {
    bpm: 60,
    key: 0,
    major: true,
    style: 'jasper-ballad',
    seed: 7,
    intensity: 'sedative',
    tuningHz: 440,
  };
  const trials = designMusicTherapyBatch(base, limit, priors);
  const trialFindings = trials.map(trialToFinding);

  const contrastFindings: Array<ScienceFinding & { artifact: ResearchArtifact }> = [];
  for (const hz of TUNING_GRID) {
    for (const c of tuningContrastModel(hz)) {
      const f = contrastToFinding(c);
      if (f) contrastFindings.push(f);
    }
  }

  const benchmark = benchmarkComparison();
  const benchmarkClaim = `Cochrane benchmark for music-therapy-vs-control: SAI ${benchmark.anxietySai}, HR ${benchmark.hr} bpm, systolic BP ${benchmark.bpSystolic} mmHg (${benchmark.source}).`;
  const benchmarkArtifact = buildArtifact({
    kind: 'music_therapy_benchmark',
    claim: benchmarkClaim,
    engine: 'music-therapy-benchmark (Cochrane meta-analysis)',
    params: { anxietySai: benchmark.anxietySai, hr: benchmark.hr, bpSystolic: benchmark.bpSystolic },
    seed: null,
    evidenceTier: 'E2', // published meta-analytic point estimates
    stats: null,
    provenance: benchmark.source,
  });

  return {
    findings: [
      ...trialFindings,
      ...contrastFindings,
      {
        kind: 'music_therapy_benchmark',
        hypothesisId: 'MT-BENCHMARK',
        problemId: 'MT-EVIDENCE',
        claim: benchmarkClaim,
        numbers: { anxietySai: benchmark.anxietySai, hr: benchmark.hr, bpSystolic: benchmark.bpSystolic },
        provenance: benchmark.source,
        mode: 'local_deterministic',
        cycle: 0,
        artifact: benchmarkArtifact,
      },
    ],
    calibratedCount: trials.filter((t) => t.calibratedCount > 0).length,
    evidenceSource,
  };
}

export { TUNING_CAVEATS };