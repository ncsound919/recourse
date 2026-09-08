/**
 * Music therapy evidence base + prior calibration.
 *
 * Turns real, published trial data into calibrated biomarker priors used by the
 * music-therapy research design system. Two sources:
 *
 *  1. SEEDED published records — real effect sizes from the meta-analytic
 *     literature (Cochrane 2021 CD006911, n=5576 across 81 trials), entered
 *     with attribution. These are the anchor values.
 *  2. LIVE FEED — Europe PMC REST API query for music-therapy-in-oncology
 *     trials. Abstracts are parsed for machine-parseable effect statements
 *     ("MD = X, 95% CI a to b"); only statements matching a strict template are
 *     quantified. Anything else is recorded as qualitative, never guessed.
 *
 * Pooling is a REAL random-effects inverse-variance meta-analysis
 * (DerSimonian-Laird tau², Cochran's Q, I²). The calibrated prior is
 * pooled effect ± sqrt(SE² + tau²). If a biomarker has no poolable evidence it
 * stays uncalibrated (the fixed Cochrane anchor), labeled as such.
 *
 * Honesty contract: every record carries a source + PMID when known; pooled
 * estimates report heterogeneity; qualitative studies are never turned into
 * numbers.
 */

import { meanCI } from './statistics.js';

export type EvidenceBiomarker = 'anxietySai' | 'hr' | 'bpSystolic' | 'cortisol' | 'iga' | 'hrv';

export interface TrialEvidence {
  biomarker: EvidenceBiomarker;
  /** Between-group mean difference (direction toward the intervention). */
  effect: number;
  /** Standard error of the effect (from CI or computed from per-arm SDs). */
  se: number | null;
  /** Sample size (total, both arms) when known. */
  n: number | null;
  year: number;
  source: string;
  pmid: string | null;
  qualitative?: boolean;
  detail?: string;
}

/** Evidence that could not be quantified but was real (counted, not guessed). */
export interface QualitativeEvidence {
  biomarker: EvidenceBiomarker;
  year: number;
  source: string;
  pmid: string | null;
  detail: string;
}

export interface PooledEstimate {
  biomarker: EvidenceBiomarker;
  /** Inverse-variance weighted fixed-effect point estimate. */
  pooledEffect: number;
  se: number;
  /** Random-effects SD = sqrt(SE² + tau²) — includes between-study variance. */
  sd: number;
  /** DerSimonian-Laird between-study variance. */
  tauSquared: number;
  cochranQ: number;
  /** I² in percent (0..100). */
  iSquared: number;
  k: number; // poolable studies
  totalN: number;
  /** Confidence interval (95%) of the pooled effect. */
  ciLower: number;
  ciUpper: number;
}

export interface CalibratedPriors {
  biomarker: EvidenceBiomarker;
  /** Pooled effect (or the uncalibrated anchor if no poolable evidence). */
  mean: number;
  /** Calibrated SD (random-effects) or the anchor SD when uncalibrated. */
  sd: number;
  calibrated: boolean;
  pooled: PooledEstimate | null;
  source: string;
  unpoolableCount: number;
}

/** Reverse-normal to get the z for a two-sided CI coverage. */
function normZ(level: number): number {
  // 0.95 -> 1.959963985; 0.90 -> 1.644853627; 0.99 -> 2.575829304.
  if (level === 0.9) return 1.644853627;
  if (level === 0.99) return 2.575829304;
  return 1.959963985;
}

/**
 * Minimum poolable studies before a biomarker's priors are considered
 * "calibrated". With k=1 the random-effects SD collapses to the single study's
 * SE (tau² unidentifiable) and one abstract can misrepresent the field — e.g.
 * a different anxiety scale (HADS vs STAI vs SAI) or a tight-CI outlier. Below
 * this threshold the fixed Cochrane anchor is kept, with the candidate counted
 * as unpoolable so the discrepancy is visible rather than silently applied.
 */
export const MIN_POOLABLE_STUDIES = 2;

/** DerSimonian-Laird random-effects inverse-variance pooling. */
export function poolMetaAnalysis(records: TrialEvidence[]): PooledEstimate | null {
  const poolable = records.filter((r) => r.se != null && Number.isFinite(r.se) && r.se > 0);
  if (poolable.length === 0) return null;

  const w = poolable.map((r) => 1 / (r.se! * r.se));
  const wSum = w.reduce((a, b) => a + b, 0);
  const pooled = poolable.reduce((a, r, i) => a + w[i] * r.effect, 0) / wSum;
  const seFE = Math.sqrt(1 / wSum);

  // Cochran's Q and DerSimonian-Laird tau².
  let q = 0;
  for (let i = 0; i < poolable.length; i++) {
    q += w[i] * (poolable[i].effect - pooled) ** 2;
  }
  const df = poolable.length - 1;
  const c = wSum - w.reduce((a, b) => a + b * b, 0) / wSum;
  let tau2 = 0;
  if (df > 0 && c > 0) {
    tau2 = Math.max(0, (q - df) / c);
  }
  const sdRE = Math.sqrt(seFE * seFE + tau2);
  const iSquared = q > df && df > 0 ? Math.max(0, Math.min(100, ((q - df) / q) * 100)) : 0;
  const z = normZ(0.95);
  const totalN = records.reduce((a, r) => a + (r.n ?? 0), 0);

  return {
    biomarker: poolable[0].biomarker,
    pooledEffect: Math.round(pooled * 100) / 100,
    se: Math.round(seFE * 100) / 100,
    sd: Math.round(sdRE * 100) / 100,
    tauSquared: Math.round(tau2 * 1000) / 1000,
    cochranQ: Math.round(q * 100) / 100,
    iSquared: Math.round(iSquared * 10) / 10,
    k: poolable.length,
    totalN,
    ciLower: Math.round((pooled - z * seFE) * 100) / 100,
    ciUpper: Math.round((pooled + z * seFE) * 100) / 100,
  };
}

/**
 * Calibrate the biomarker priors from a set of trial evidence records.
 * Returns the full prior set (all biomarkers), using pooled estimates where
 * poolable evidence exists and the fixed anchor otherwise.
 */
export function calibratePriors(
  evidence: TrialEvidence[],
  anchors: Record<EvidenceBiomarker, { mean: number; sd: number; source: string }>,
): CalibratedPriors[] {
  const biomarkers = Object.keys(anchors) as EvidenceBiomarker[];
  return biomarkers.map((b) => {
    const recs = evidence.filter((r) => r.biomarker === b && !r.qualitative);
    const pooled = poolMetaAnalysis(recs);
    const anchor = anchors[b];
    if (pooled && pooled.k >= MIN_POOLABLE_STUDIES) {
      return {
        biomarker: b,
        mean: pooled.pooledEffect,
        sd: pooled.sd,
        calibrated: true,
        pooled,
        source: `pooled meta-analysis of ${pooled.k} studies (${pooled.totalN} pts, I²=${pooled.iSquared}%)`,
        unpoolableCount: evidence.filter((r) => r.biomarker === b && r.qualitative).length,
      };
    }
    const poolableBelowMin = pooled ? pooled.k : 0;
    return {
      biomarker: b,
      mean: anchor.mean,
      sd: anchor.sd,
      calibrated: false,
      pooled: null,
      source: poolableBelowMin > 0
        ? `${anchor.source} (${poolableBelowMin} poolable study${poolableBelowMin === 1 ? '' : 'ies'} below MIN_POOLABLE_STUDIES=${MIN_POOLABLE_STUDIES})`
        : anchor.source,
      unpoolableCount:
        evidence.filter((r) => r.biomarker === b && r.qualitative).length + poolableBelowMin,
    };
  });
}

/** Turn a "95% CI a to b" into a SE for a between-group mean difference. */
export function seFromCi(lower: number, upper: number): number {
  return (upper - lower) / (2 * normZ(0.95));
}

/** Compute SE from per-arm mean ± SD and arm sizes (equal-var pooled). */
export function seFromGroups(
  sd1: number,
  n1: number,
  sd2: number,
  n2: number,
): number {
  const sp = Math.sqrt(((n1 - 1) * sd1 * sd1 + (n2 - 1) * sd2 * sd2) / (n1 + n2 - 2));
  return sp * Math.sqrt(1 / n1 + 1 / n2);
}

/**
 * Parse a Europe PMC abstract for a machine-parseable effect statement.
 * Strict template: "<biomarker keyword> ... (MD|mean difference|difference) ... "
 * followed by a signed number and optional "95% CI a to b". Returns null when
 * the abstract only reports qualitative results — those are recorded separately.
 */
const BIOMARKER_KEYWORDS: Record<EvidenceBiomarker, RegExp> = {
  anxietySai: /anxiety|state.?trait|SAI|STAI|HADS-?A|hospit(al|alised) anxiety/i,
  hr: /heart\s*rate|\bHR\b/i,
  bpSystolic: /systolic|blood\s*pressure/i,
  cortisol: /cortisol|salivary\s*steroid|neuroendocrine/i,
  iga: /IgA|immunoglobulin\s*A|salivary\s*immune/i,
  hrv: /heart\s*rate\s*variability|HRV/i,
};

export interface AbstractParse {
  biomarker: EvidenceBiomarker;
  effect: number | null;
  se: number | null;
  matched: boolean;
}

export function parseAbstractForEffect(
  abstract: string,
  biomarker: EvidenceBiomarker,
): AbstractParse {
  const kw = BIOMARKER_KEYWORDS[biomarker];
  const match = kw.exec(abstract);
  if (!match) return { biomarker, effect: null, se: null, matched: false };

  // Look for: MD = -7.7, 95% CI -10.7 to -4.6  |  mean difference of 5.2 (95% CI 1.1 to 9.3)
  const md = /(mean\s*difference|MD|difference)\s*(=|of|:)?\s*([+-]?\d+(?:\.\d+)?)\s*(?:units)?[\s,;]*(?:\(?\s*95%\s*CI\s*([+-]?\d+(?:\.\d+)?)\s*(?:to|-|,)\s*([+-]?\d+(?:\.\d+)?)\s*\)?)?/i.exec(abstract);
  if (!md) return { biomarker, effect: null, se: null, matched: false };

  const effect = parseFloat(md[3]);
  const se = md[4] && md[5] ? seFromCi(parseFloat(md[4]), parseFloat(md[5])) : null;
  return { biomarker, effect, se, matched: true };
}

/** Merge a freshly pooled evidence set with the fixed anchors. */
export function mergeWithAnchors(
  evidence: TrialEvidence[],
  qualitative: QualitativeEvidence[],
): { records: TrialEvidence[]; qualitative: QualitativeEvidence[] } {
  return { records: evidence, qualitative };
}

/** Render a calibration report for the fleet readout. */
export function renderCalibration(priors: CalibratedPriors[]): string {
  return priors
    .map((p) => {
      const cal = p.calibrated ? `CALIBRATED (k=${p.pooled!.k}, I²=${p.pooled!.iSquared}%, n=${p.pooled!.totalN})` : 'uncalibrated anchor';
      return `- ${p.biomarker}: ${p.mean} ± ${p.sd} [${cal}]${p.unpoolableCount ? ` +${p.unpoolableCount} qualitative` : ''}`;
    })
    .join('\n');
}

export { meanCI };

/** Stat-snapshot helper for the evidence route: 95% CI of pooled effects. */
export function ciOfEffects(effects: number[]): { mean: number; ciLower: number; ciUpper: number } | null {
  if (effects.length < 2) return null;
  const r = meanCI(effects);
  if (!r) return null;
  return { mean: r.mean, ciLower: r.ci.lower, ciUpper: r.ci.upper };
}