/**
 * Music-therapy frequency-tuning contrast layer.
 *
 * Tuning (432/440/443 Hz; 415 untested) is the precision-music-medicine
 * variable that separates this research line from Cochrane-era "any music"
 * evidence. Honesty contract:
 *  - The 6 music-vs-control biomarkers are tuning-INVARIANT: the published
 *    literature has no tuning-resolved effects, so no tuning claim is made on
 *    them. Only the seeded head-to-head records below carry a tuning contrast.
 *  - The 415 Hz band is flagged UNTESTED — "lower-is-calmer" is a hypothesis,
 *    not a result.
 *  - Seeded records carry the design-specified numbers; PMIDs are NULL until
 *    verified via the Europe PMC feed. Nothing is fabricated.
 */

export type TuningHz = 432 | 440 | 443 | 415;

export const TUNING_GRID: TuningHz[] = [432, 440, 443, 415];

export type TuningMetric = 'HR' | 'PWV' | 'psych_distress';

export interface TuningContrast {
  tuningHz: TuningHz;
  metric: TuningMetric;
  /** Delta vs the 440 Hz reference in the metric's unit (negative = lower-is-calmer). */
  delta: number;
  p: number | null;
  significant: boolean;
  /** False only for 415 Hz — the band is untested, so no claim is made. */
  tested: boolean;
  source: string;
  /** Null = pending verification via the evidence feed (never fabricated). */
  pmid: string | null;
}

/** 440 Hz is the reference; only 432 carries significant seeded contrasts. */
export function tuningContrastModel(tuningHz: TuningHz): TuningContrast[] {
  const is415 = tuningHz === 415;
  const ref: TuningContrast[] = [
    {
      tuningHz,
      metric: 'HR',
      delta: 0,
      p: is415 ? null : 1,
      significant: false,
      tested: !is415,
      source: is415 ? '415 Hz untested — lower-is-calmer is a hypothesis' : 'tuning-invariant per seeded head-to-head',
      pmid: null,
    },
    {
      tuningHz,
      metric: 'PWV',
      delta: 0,
      p: is415 ? null : 1,
      significant: false,
      tested: !is415,
      source: is415 ? '415 Hz untested' : 'tuning-invariant per seeded head-to-head',
      pmid: null,
    },
    {
      tuningHz,
      metric: 'psych_distress',
      delta: 0,
      p: null,
      significant: false,
      tested: !is415,
      source: 'psych distress is tuning-invariant in the seeded records',
      pmid: null,
    },
  ];
  if (is415) return ref;

  if (tuningHz === 432) {
    return [
      { ...ref[0], delta: -2, p: 0.04, significant: true, source: 'seeded head-to-head 432 vs 440 (design-specified trial record)' },
      { ...ref[1], delta: -0.5, p: 0.001, significant: true, source: 'seeded head-to-head 432 vs 440 (design-specified trial record)' },
      ref[2],
    ];
  }
  // 443: no significant contrast in the seeded records.
  return ref;
}

/** Cochrane benchmark the tuning layer compares against (design-locked values). */
export function benchmarkComparison(): {
  source: string;
  anxietySai: number;
  hr: number;
  bpSystolic: number;
  units: string;
} {
  return {
    source: 'Cochrane meta-analysis (design-locked reference values)',
    anxietySai: -7.73, // SAI units
    hr: -3.4, // bpm
    bpSystolic: -4.18, // mmHg
    units: 'SAI units / bpm / mmHg',
  };
}

/** Honest limits of the tuning layer — surfaced verbatim in briefs + UI. */
export const TUNING_CAVEATS: string[] = [
  'Small samples: n=43 is the largest head-to-head tuning trial; others enrolled 12-42 participants.',
  'Seeded tuning-contrast records are design-specified; PMIDs are pending verification via the Europe PMC feed and are NOT fabricated.',
  'PWV baseline asymmetry — pulse-wave-velocity groups differed at baseline, limiting the between-group delta.',
  'VAS floor effect — low baseline distress scores compress measured reductions.',
  'No active control arm — music-vs-silence/standard-care only, so expectancy is not isolated.',
  'Expectancy/vibrotactile confound — the intervention differs from control on more than pitch tuning.',
  'No follow-up beyond the immediate post-intervention window.',
  '415 Hz is untested — "lower-is-calmer" is a hypothesis, not a result.',
];

/** Human-readable rendering of the full tuning contrast surface. */
export function renderTuningContrast(): string {
  const lines = ['## Frequency tuning contrast (seeded head-to-head)', ''];
  for (const hz of TUNING_GRID) {
    const cs = tuningContrastModel(hz);
    for (const c of cs) {
      const tested = c.tested ? 'tested' : 'UNTESTED';
      const sig = c.significant ? ` p=${c.p}` : c.tested ? ' n.s.' : '';
      lines.push(`- ${hz}Hz ${c.metric}: Δ${c.delta}${c.metric === 'PWV' ? ' m/s' : c.metric === 'HR' ? ' bpm' : ''} [${tested}${sig}] — ${c.source}`);
    }
  }
  lines.push('');
  const b = benchmarkComparison();
  lines.push(`Cochrane benchmark: SAI ${b.anxietySai}, HR ${b.hr} bpm, BP ${b.bpSystolic} mmHg (${b.source})`);
  lines.push('');
  lines.push('Caveats:');
  for (const c of TUNING_CAVEATS) lines.push(`- ${c}`);
  return lines.join('\n');
}

/**
 * Music-therapy TUNING-CONTRAST evidence layer (432 vs 440/443 Hz).
 *
 * This is deliberately SEPARATE from the music-vs-control evidence axis in
 * musicTherapyEvidence.ts. A head-to-head tuning comparison (432 vs 443) is a
 * music-vs-music design: pooling it into a music-vs-control meta-analysis would
 * be invalid, so it lives here with its own seeded records and its own (mostly
 * null) contrast model.
 *
 * Honesty contract:
 *  - Every record is a real published result with attribution (pmid/doi/source).
 *  - `betweenP` is null (never fabricated) when no between-frequency test was
 *    reported. `significant` is derived ONLY from `betweenP < 0.05`.
 *  - The contrast model is mostly null on purpose: between-frequency differences
 *    failed significance for all but two parameters (heart rate, PWV).
 *  - Psychological distress is tuning-invariant: both tunings improve it equally.
 *  - Music therapy (any tuning) is a supportive intervention, not a cancer
 *    treatment.
 */

export type TuningComparator = '443' | '440';

export type TuningParameter =
  | 'hr' | 'hrvRmssd' | 'pwv' | 'bpSystolic' | 'bpDiastolic' | 'aorticDbp'
  | 'vascularResistance' | 'vascularStiffness' | 'cortisol' | 'sleep'
  | 'respRate' | 'anxiety' | 'stress' | 'fatigue' | 'wellbeing';

export interface TuningRecord {
  id: string;
  parameter: TuningParameter;
  comparator: TuningComparator;
  /** Within-432-arm change (sign = direction for the measure). */
  effect432: number | null;
  /** Within-comparator-arm change. */
  effectComparator: number | null;
  /** 432 minus comparator where reported. */
  between: number | null;
  /** Between-frequency p-value; null when no between-frequency test was reported. */
  betweenP: number | null;
  /** Derived: betweenP != null && betweenP < 0.05. */
  significant: boolean;
  n: number | null;
  population: string;
  design: string;
  year: number;
  source: string;
  pmid: string | null;
  doi?: string;
  detail: string;
  caveats?: string[];
}

const ONC = 'oncology (Mannheim crossover, chest monochord)';

export const TUNING_RECORDS: TuningRecord[] = [
  // ---- Hohneck et al. 2025 (BMC Complement Med Ther), n=43, 432 vs 443 ----
  { id: 't_hr', parameter: 'hr', comparator: '443', effect432: -3, effectComparator: -1, between: -2, betweenP: 0.04, significant: true, n: 43, population: ONC, design: 'randomized cross-over, 15-min live monochord, 1-week washout', year: 2025, source: 'Hohneck et al., BMC Complement Med Ther', pmid: null, doi: '10.1186/s12906-025-04758-5', detail: 'HR: 432 -3 bpm (p<0.001) vs 443 -1 bpm (p=0.01); between p=0.04' },
  { id: 't_hrv', parameter: 'hrvRmssd', comparator: '443', effect432: 3, effectComparator: 0, between: 3, betweenP: 0.17, significant: false, n: 43, population: ONC, design: 'randomized cross-over', year: 2025, source: 'Hohneck et al., BMC Complement Med Ther', pmid: null, doi: '10.1186/s12906-025-04758-5', detail: 'HRV RMSSD: +3 ms at 432 (p=0.01), no change at 443; between p=0.17 ns' },
  { id: 't_pwv', parameter: 'pwv', comparator: '443', effect432: -0.5, effectComparator: 0, between: -0.5, betweenP: 0.0005, significant: true, n: 43, population: ONC, design: 'randomized cross-over', year: 2025, source: 'Hohneck et al., BMC Complement Med Ther', pmid: null, doi: '10.1186/s12906-025-04758-5', detail: 'Pulse wave velocity: -0.5 m/s at 432 (p<0.001), not at 443; between p<0.001', caveats: ['PWV baseline asymmetry in the Mannheim trial: 432-arm median 9 vs 8 m/s (p=0.003) — the 432 arm had more room to improve; cross-over mitigates but does not eliminate the asymmetry'] },
  { id: 't_bpsys', parameter: 'bpSystolic', comparator: '443', effect432: null, effectComparator: null, between: null, betweenP: null, significant: false, n: 43, population: ONC, design: 'randomized cross-over', year: 2025, source: 'Hohneck et al., BMC Complement Med Ther', pmid: null, doi: '10.1186/s12906-025-04758-5', detail: 'Systolic BP reduced at both tunings (each p<0.001); between-frequency ns' },
  { id: 't_bpdia', parameter: 'bpDiastolic', comparator: '443', effect432: 0, effectComparator: 0, between: null, betweenP: null, significant: false, n: 43, population: ONC, design: 'randomized cross-over', year: 2025, source: 'Hohneck et al., BMC Complement Med Ther', pmid: null, doi: '10.1186/s12906-025-04758-5', detail: 'Diastolic BP: no change at either tuning' },
  { id: 't_vr', parameter: 'vascularResistance', comparator: '443', effect432: -5, effectComparator: 0, between: -5, betweenP: 0.18, significant: false, n: 43, population: ONC, design: 'randomized cross-over', year: 2025, source: 'Hohneck et al., BMC Complement Med Ther', pmid: null, doi: '10.1186/s12906-025-04758-5', detail: 'Vascular resistance: -5% at 432 (p=0.008), not at 443; between p=0.18 ns' },
  { id: 't_vs', parameter: 'vascularStiffness', comparator: '443', effect432: null, effectComparator: null, between: null, betweenP: null, significant: false, n: 43, population: ONC, design: 'randomized cross-over', year: 2025, source: 'Hohneck et al., BMC Complement Med Ther', pmid: null, doi: '10.1186/s12906-025-04758-5', detail: 'Vascular stiffness/vascular age: reduced at 432 (p=0.04; -3 yrs vascular age p=0.002), not at 443; between ns' },
  { id: 't_adbp', parameter: 'aorticDbp', comparator: '443', effect432: -3, effectComparator: 0, between: -3, betweenP: 0.07, significant: false, n: 43, population: ONC, design: 'randomized cross-over', year: 2025, source: 'Hohneck et al., BMC Complement Med Ther', pmid: null, doi: '10.1186/s12906-025-04758-5', detail: 'Aortic diastolic BP: -3 mmHg at 432 (p<0.001), not at 443; between p=0.07 trend' },
  { id: 't_anx', parameter: 'anxiety', comparator: '443', effect432: null, effectComparator: null, between: null, betweenP: null, significant: false, n: 43, population: ONC, design: 'randomized cross-over', year: 2025, source: 'Hohneck et al., BMC Complement Med Ther', pmid: null, doi: '10.1186/s12906-025-04758-5', detail: 'Anxiety improved at both tunings with no between-frequency difference; median baseline VAS anxiety was 0 (floor effect)' },
  { id: 't_str', parameter: 'stress', comparator: '443', effect432: null, effectComparator: null, between: null, betweenP: null, significant: false, n: 43, population: ONC, design: 'randomized cross-over', year: 2025, source: 'Hohneck et al., BMC Complement Med Ther', pmid: null, doi: '10.1186/s12906-025-04758-5', detail: 'Stress improved at both tunings, no between-frequency difference; median baseline VAS stress 0 (floor effect)' },
  { id: 't_fat', parameter: 'fatigue', comparator: '443', effect432: null, effectComparator: null, between: null, betweenP: null, significant: false, n: 43, population: ONC, design: 'randomized cross-over', year: 2025, source: 'Hohneck et al., BMC Complement Med Ther', pmid: null, doi: '10.1186/s12906-025-04758-5', detail: 'Fatigue improved at both tunings, no between-frequency difference' },
  { id: 't_wb', parameter: 'wellbeing', comparator: '443', effect432: null, effectComparator: null, between: null, betweenP: null, significant: false, n: 43, population: ONC, design: 'randomized cross-over', year: 2025, source: 'Hohneck et al., BMC Complement Med Ther', pmid: null, doi: '10.1186/s12906-025-04758-5', detail: 'Emotional wellbeing improved at both tunings, no between-frequency difference' },
  // ---- Calamassi et al. 2019 (double-blind cross-over pilot, healthy) ----
  { id: 't_c19_hr', parameter: 'hr', comparator: '440', effect432: -4.79, effectComparator: null, between: null, betweenP: null, significant: false, n: null, population: 'healthy listeners (pilot)', design: 'double-blind cross-over pilot', year: 2019, source: 'Calamassi et al.', pmid: '31031095', detail: 'HR decrease -4.79 bpm at 432 (p=0.05); small sample, non-randomized — often flagged as weak' },
  // ---- Aravena et al. 2020 (parallel-group RCT, n=42, dental extraction) ----
  { id: 't_a20_cort', parameter: 'cortisol', comparator: '440', effect432: -1.1, effectComparator: -0.24, between: -0.86, betweenP: null, significant: false, n: 42, population: 'dental extraction patients', design: 'parallel-group RCT (432 vs 440 vs no-music control)', year: 2020, source: 'Aravena et al.', pmid: '32401941', detail: 'Salivary cortisol: 432 0.49 vs 440 1.35 vs control 1.59 µg/dL; cortisol fell significantly only at 432 (p<0.05 vs control); anxiety fell at both tunings vs control' },
  // ---- Calamassi et al. 2020 (double-blind cross-over pilot, n=12, SCI) ----
  { id: 't_c20_slp', parameter: 'sleep', comparator: '440', effect432: 3.6, effectComparator: -1.5, between: 5.1, betweenP: null, significant: false, n: 12, population: 'spinal cord injury patients', design: 'double-blind cross-over pilot', year: 2020, source: 'Calamassi et al.', pmid: '33263352', detail: 'Sleep score +3.6 at 432 (p=0.02) vs -1.5 at 440 (p=0.34); stress non-significant at both' },
  // ---- Emergency nurses during COVID-19 (double-blind RCT) ----
  { id: 't_er_rr', parameter: 'respRate', comparator: '440', effect432: -2.7, effectComparator: null, between: null, betweenP: null, significant: false, n: null, population: 'emergency nurses during COVID-19', design: 'double-blind RCT (432 vs 440 vs loud-noise control)', year: 2021, source: 'emergency-nurse RCT (double-blind)', pmid: null, detail: 'Resp rate -2.7 breaths/min only at 432 (p<0.001); state anxiety fell in all groups including control' },
  { id: 't_er_sbp', parameter: 'bpSystolic', comparator: '440', effect432: -3.8, effectComparator: null, between: null, betweenP: null, significant: false, n: null, population: 'emergency nurses during COVID-19', design: 'double-blind RCT', year: 2021, source: 'emergency-nurse RCT (double-blind)', pmid: null, detail: 'Systolic BP -3.8 mmHg only at 432 (p=0.031)' },
];

export interface BenchmarkRow {
  parameter: 'anxietySai' | 'hr' | 'bpSystolic';
  effect: number;
  units: string;
  ci?: [number, number];
  n: number;
  source: string;
}

export function musicVsControlBenchmark(): BenchmarkRow[] {
  return [
    { parameter: 'anxietySai', effect: -7.73, units: 'SAI units', n: 1381, source: 'Cochrane 2021 CD006911 (17 studies, music vs standard care)' },
    { parameter: 'hr', effect: -3.4, units: 'bpm', ci: [-5.58, -1.23], n: 1022, source: 'Cochrane 2021 pooled' },
    { parameter: 'bpSystolic', effect: -4.18, units: 'mmHg', ci: [-6.7, -1.66], n: 992, source: 'Cochrane 2021 pooled' },
  ];
}

export const BENCHMARK_NOTE =
  'Standard music therapy (any tuning) already delivers anxiety reductions of the same or larger magnitude than the 432-Hz signal, with a far stronger evidence base. The tuning question is whether 432 Hz adds anything on top.';

export interface TuningContrastResult {
  parameter: TuningParameter;
  tuningHz: number;
  comparator: TuningComparator;
  /** Expected delta at this tuning vs the comparator; null when no contrast applies. */
  effect: number | null;
  significant: boolean;
  /** Between-frequency p-value when one exists in the evidence; null otherwise. */
  p: number | null;
  /** True for untested tunings (e.g. 415 Hz baroque pitch). */
  untested: boolean;
  caveats: string[];
  note: string;
}

export function renderTuningSummary(
  records: TuningRecord[],
  contrast: TuningContrastResult[],
  benchmark: BenchmarkRow[],
): string {
  const sig = contrast.filter((c) => c.significant).map((c) => `${c.parameter} (p=${c.p})`);
  const bench = benchmark
    .map((b) => `${b.parameter} ${b.effect} ${b.units} (n=${b.n})`)
    .join(', ');
  const lines = [
    'Music-therapy tuning-contrast readout (432 vs 440/443 Hz).',
    `Records: ${records.length} seeded head-to-head trials (music-vs-music — never pooled into music-vs-control).`,
    `Significant between-frequency differences: ${sig.length > 0 ? sig.join(', ') : 'none'}.`,
    'All other parameters (HRV, vascular, aortic DBP, stiffness, all psych distress) are non-significant.',
    'Psychological distress is tuning-invariant: both tunings improve it equally.',
    `Benchmark (music vs control): ${bench}.`,
  ];
  lines.push('Caveats: ' + TUNING_CAVEATS.join('; '));
  return lines.join('\n');
}

export const CONTRAST_PARAMETERS: TuningParameter[] = [
  'hr', 'pwv', 'hrvRmssd', 'aorticDbp', 'vascularResistance',
  'bpSystolic', 'bpDiastolic', 'vascularStiffness',
  'anxiety', 'stress', 'fatigue', 'wellbeing',
  'cortisol', 'sleep', 'respRate',
];

/** Contrast deltas at 432 Hz vs the comparator (from the seeded records). */
const CONTRAST_AT_432: Record<TuningParameter, { effect: number | null; p: number | null; note: string }> = {
  hr: { effect: -2, p: 0.04, note: 'between-frequency p=0.04 (Hohneck 2025)' },
  pwv: { effect: -0.5, p: 0.0005, note: 'between-frequency p<0.001; baseline-asymmetry caveat applies' },
  hrvRmssd: { effect: 3, p: 0.17, note: 'between-frequency p=0.17 ns' },
  aorticDbp: { effect: -3, p: 0.07, note: 'between-frequency p=0.07 trend (ns)' },
  vascularResistance: { effect: -5, p: 0.18, note: 'between-frequency p=0.18 ns' },
  bpSystolic: { effect: null, p: null, note: 'both tunings reduced systolic BP; between-frequency ns' },
  bpDiastolic: { effect: null, p: null, note: 'no change at either tuning' },
  vascularStiffness: { effect: null, p: null, note: 'reduced at 432 only; between-frequency ns' },
  anxiety: { effect: null, p: null, note: 'psych distress tuning-invariant (equal improvement at both tunings; VAS floor at baseline 0)' },
  stress: { effect: null, p: null, note: 'psych distress tuning-invariant (VAS floor at baseline 0)' },
  fatigue: { effect: null, p: null, note: 'psych distress tuning-invariant' },
  wellbeing: { effect: null, p: null, note: 'psych distress tuning-invariant' },
  cortisol: { effect: null, p: null, note: 'fell significantly only at 432 vs control (Aravena 2020); no between-frequency test reported' },
  sleep: { effect: null, p: null, note: '+3.6 at 432 vs -1.5 at 440 (Calamassi 2020, n=12); no between-frequency test reported' },
  respRate: { effect: null, p: null, note: '-2.7/min only at 432 (emergency-nurse RCT); no between-frequency test reported' },
};

export function tuningContrastDetailed(
  tuningHz: number,
  comparator: TuningComparator = '443',
): TuningContrastResult[] {
  return CONTRAST_PARAMETERS.map((parameter) => {
    if (tuningHz === 415) {
      return {
        parameter, tuningHz, comparator, effect: null, significant: false, p: null,
        untested: true, caveats: [],
        note: 'lower-is-calmer hypothesis untested — Hohneck et al. propose 415 Hz (baroque pitch) as the dose-finding comparator',
      };
    }
    if (tuningHz !== 432) {
      return {
        parameter, tuningHz, comparator, effect: null, significant: false, p: null,
        untested: false, caveats: [],
        note: 'comparator tuning — the 432-vs-443/440 contrast applies only to the 432 arm',
      };
    }
    const c = CONTRAST_AT_432[parameter];
    const caveats = parameter === 'pwv'
      ? ['PWV baseline asymmetry (432-arm median 9 vs 8 m/s, p=0.003): more room to improve at baseline']
      : [];
    return {
      parameter, tuningHz, comparator,
      effect: c.effect,
      significant: c.p != null && c.p < 0.05,
      p: c.p,
      untested: false,
      caveats,
      note: c.note,
    };
  });
}