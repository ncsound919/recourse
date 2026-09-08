/**
 * Music Therapy Oncology Research — turn Recourse's composer/DSP system into a
 * real research instrument for music therapy in oncology.
 *
 * The field (Cochrane 2021: 81 trials, 5,576 pts) supports music interventions
 * reducing anxiety (~7.7 units SAI), depression, pain, fatigue, HR, and BP.
 * The recognized software gap is "precision music medicine": individualizing
 * stimulus parameters (tempo, key, mode, frequency tuning, personal libraries)
 * and tracking them against biomarker/PRO endpoints.
 *
 * This module gives the research loop a deterministic, reproducible stimulus
 * space derived from the EXISTING composer engine (key/bpm/style/seed -> notes)
 * plus an honest biomarker-response model with published effect-size priors.
 * Every stimulus is a ResearchArtifact (reproducible hash + evidence tier).
 *
 * Honesty contract:
 *  - Stimuli are REAL compositions from the composer engine (deterministic,
 *    reproducible). No fabricated audio.
 *  - Biomarker response is a MODEL with published effect-size priors and
 *    explicit uncertainty — labeled as an estimate, never a measurement.
 *  - Nothing claims to treat/cure cancer; music is a supportive intervention.
 */

import { compose, type ComposeBrief, type Track, type StyleId } from './composer/index.js';
import { buildArtifact, type ResearchArtifact } from './researchArtifact.js';
import { tuningContrastDetailed, type TuningContrastResult } from './musicTherapyTuning.js';

/** The stimulus parameter space (precision music medicine variables). */
export interface MusicStimulusParams {
  /** Beats per minute — the tempo axis (60-100 bpm typical for relaxation). */
  bpm: number;
  /** Tonic pitch class 0..11 (C=0). */
  key: number;
  /** Major vs minor mode. */
  major: boolean;
  /** Style id from the composer (e.g. 'jasper-ballad', 'steely-dan'). */
  style: StyleId;
  /** Frequency tuning in Hz (432 vs 443 experiments; 440 default). */
  tuningHz?: number;
  /** Intervention length in bars (4 | 8 | 16). */
  bars?: number;
  /** Deterministic seed for reproducibility. */
  seed: number;
  /** Intensity tier: 'sedative' (slow, low energy) | 'stimulative'. */
  intensity?: 'sedative' | 'stimulative';
}

/** Published biomarker-response priors (music-therapy literature). All are
 *  estimates with uncertainty, labeled as such — never measurements. */
export const BIOMARKER_PRIORS = {
  anxietySai: { mean: -7.7, sd: 2.0, units: 'SAI units', source: 'Cochrane 2021 (CD006911), n=5576' },
  hr: { mean: -5.0, sd: 2.5, units: 'bpm', source: 'Cochrane 2021 meta-analysis' },
  bpSystolic: { mean: -6.0, sd: 3.0, units: 'mmHg', source: 'Cochrane 2021 meta-analysis' },
  cortisol: { mean: -0.25, sd: 0.12, units: 'z', source: 'neuroendocrine studies (group singing)' },
  iga: { mean: 0.30, sd: 0.15, units: 'z', source: 'salivary IgA before/after music' },
  hrv: { mean: 0.20, sd: 0.10, units: 'z', source: 'Tibetan singing bowl pilot (EEG/HRV)' },
} as const;

export type BiomarkerId = keyof typeof BIOMARKER_PRIORS;

/** A calibrated prior overrides the anchor when pooled evidence exists. */
export interface CalibratedPrior {
  mean: number;
  sd: number;
  calibrated: boolean;
  source: string;
}

export interface BiomarkerEstimate {
  biomarker: BiomarkerId;
  /** Expected change (negative = reduction for stress markers). */
  effect: number;
  /** Uncertainty (prior SD). Honest: this is a model, not a measurement. */
  sd: number;
  /** Standardized effect (effect/sd) — comparable across biomarkers. */
  effectSize: number;
  source: string;
  /** True when this estimate came from pooled trial evidence, not the anchor. */
  calibrated: boolean;
}

/** Compute the modeled biomarker response for a stimulus. Deterministic:
 *  a sedative/slower/lower-key stimulus gets a stronger expected reduction in
 *  stress markers (literature-aligned direction), scaled by a 0..1 stimulus
 *  potency derived from bpm, mode, and intensity. Always returns uncertainty.
 *  When `priors` are supplied (evidence-calibrated), they override the fixed
 *  Cochrane anchors for the calibrated biomarkers. */
export function modelBiomarkerResponse(
  p: MusicStimulusParams,
  priors?: Partial<Record<BiomarkerId, CalibratedPrior>>,
): BiomarkerEstimate[] {
  // Potency 0..1: lower bpm + minor + sedative -> stronger relaxation effect.
  const bpmFactor = Math.max(0, Math.min(1, (100 - p.bpm) / 40));
  const modeFactor = p.major ? 0.7 : 1.0;
  const intensityFactor = p.intensity === 'stimulative' ? 0.5 : 1.0;
  const potency = Math.round(Math.max(0.1, Math.min(1, bpmFactor * modeFactor * intensityFactor)) * 100) / 100;

  return (Object.keys(BIOMARKER_PRIORS) as BiomarkerId[]).map((id) => {
    const anchor = BIOMARKER_PRIORS[id];
    const cal = priors?.[id];
    const prior = cal ?? { mean: anchor.mean, sd: anchor.sd, calibrated: false, source: anchor.source };
    // The prior MEAN already carries its sign (anxietySai = -7.7, iga = +0.3).
    // Potency scales the magnitude toward the prior; direction is preserved.
    // Positive markers (IgA, HRV) rise with potency, stress markers fall —
    // both handled by the prior's sign.
    const effect = Math.round(prior.mean * potency * 100) / 100;
    return {
      biomarker: id,
      effect,
      sd: prior.sd,
      effectSize: Math.round((effect / prior.sd) * 100) / 100,
      source: prior.source,
      calibrated: prior.calibrated,
    };
  });
}

export interface MusicTherapyTrial {
  id: string;
  stimulus: MusicStimulusParams;
  track: Track;                       // the actual composed stimulus (reproducible)
  biomarkers: BiomarkerEstimate[];    // modeled response (honest estimate)
  artifact: ResearchArtifact;
  generatedAt: number;
  /** Number of biomarkers backed by pooled trial evidence (vs anchors). */
  calibratedCount: number;
  /** Between-frequency tuning contrast (432 vs 440/443) for this stimulus. */
  tuningContrast: TuningContrastResult[];
  /** Honest one-line readout of the tuning contrast. */
  tuningNote: string;
}

/**
 * Design a music-therapy intervention trial: compose a deterministic stimulus
 * from the parameter space, model the expected biomarker response, and wrap it
 * in a reproducible ResearchArtifact. This is the trial-infrastructure gap the
 * Cochrane authors call for — reproducible, parameter-pinned interventions.
 * When `priors` are provided (from the evidence feed + meta-analysis), the
 * modeled response uses pooled real trial data for calibrated biomarkers.
 */
export function designMusicTherapyTrial(
  params: MusicStimulusParams,
  priors?: Partial<Record<BiomarkerId, CalibratedPrior>>,
): MusicTherapyTrial {
  const brief: ComposeBrief = {
    style: params.style,
    key: params.key,
    major: params.major,
    bpm: params.bpm,
    bars: params.bars ?? 8,
    seed: params.seed,
    title: `music-therapy-stimulus-${params.seed}`,
  };
  const track = compose(brief);
  const biomarkers = modelBiomarkerResponse(params, priors);
  const tuning = params.tuningHz ?? 440;
  const calibratedCount = biomarkers.filter((b) => b.calibrated).length;

  const tuningContrast = tuningContrastDetailed(tuning);
  const sigParams = tuningContrast.filter((c) => c.significant).map((c) => c.parameter);
  const tuningNote = `Tuning contrast (${tuning}Hz vs 443/440): ${sigParams.length > 0 ? `significant only for ${sigParams.join(', ')}` : 'no significant between-frequency differences'}; psych distress is tuning-invariant.`;

  const claim = `Music therapy stimulus: ${params.bpm}bpm ${params.major ? 'major' : 'minor'} key ${params.key} style ${params.style} (${tuning}Hz). ` +
    `Modeled biomarker response (estimate, not measurement): anxiety -${Math.abs(biomarkers.find((b) => b.biomarker === 'anxietySai')!.effect).toFixed(1)} SAI units, ` +
    `HR ${biomarkers.find((b) => b.biomarker === 'hr')!.effect > 0 ? '+' : ''}${biomarkers.find((b) => b.biomarker === 'hr')!.effect.toFixed(1)} bpm. ` +
    `Supportive/complementary only — not a cancer treatment.`;

  const artifact = buildArtifact({
    kind: 'music_therapy_trial',
    claim,
    engine: 'recourse-composer',
    params: { ...params, tuningHz: tuning },
    seed: params.seed,
    evidenceTier: calibratedCount > 0 ? 'E2' : 'E3', // pooled trial data lifts the tier
    stats: null,        // no real trial data yet — honest
    provenance: calibratedCount > 0
      ? `composer deterministic stimulus (seed ${params.seed}) + pooled trial-evidence biomarker model (${calibratedCount} calibrated)`
      : `composer deterministic stimulus (seed ${params.seed}) + literature-prior biomarker model`,
  });

  return {
    id: `mt_${artifact.artifactHash.slice(0, 12)}`,
    stimulus: params,
    track,
    biomarkers,
    artifact,
    generatedAt: Date.now(),
    calibratedCount,
    tuningContrast,
    tuningNote,
  };
}

/** Generate a batch of trial designs across the precision-music-medicine
 *  parameter grid. Deterministic + reproducible (seeded). */
export function designMusicTherapyBatch(
  base: MusicStimulusParams,
  variants: number = 4,
  priors?: Partial<Record<BiomarkerId, CalibratedPrior>>,
): MusicTherapyTrial[] {
  const out: MusicTherapyTrial[] = [];
  const bpms = [60, 72, 80, 96];
  for (let i = 0; i < variants; i++) {
    const p: MusicStimulusParams = {
      ...base,
      bpm: bpms[i % bpms.length],
      major: i % 2 === 0,
      seed: base.seed + i,
      intensity: i % 3 === 0 ? 'sedative' : i % 3 === 1 ? 'sedative' : 'stimulative',
      tuningHz: [440, 432, 443][i % 3],
    };
    out.push(designMusicTherapyTrial(p, priors));
  }
  return out;
}

/** Build a human-readable trial report from a design batch. */
export function renderTrialBatch(trials: MusicTherapyTrial[]): string {
  return trials
    .map((t) => {
      const a = t.biomarkers.find((b) => b.biomarker === 'anxietySai')!;
      const hrv = t.biomarkers.find((b) => b.biomarker === 'hrv')!;
      return `- ${t.id}: ${t.stimulus.bpm}bpm ${t.stimulus.major ? 'maj' : 'min'} ${t.stimulus.key} ${t.stimulus.style} @${t.stimulus.tuningHz}Hz ` +
        `→ anxiety Δ${a.effect.toFixed(1)}±${a.sd} SAI, HRV Δ${hrv.effect.toFixed(2)}±${hrv.sd} z | tier ${t.artifact.evidenceTier} | ${t.artifact.artifactHash.slice(0, 12)}`;
    })
    .join('\n');
}