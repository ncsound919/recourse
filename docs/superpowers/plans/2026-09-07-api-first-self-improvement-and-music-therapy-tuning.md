# API-First Self-Improvement + Music-Therapy Tuning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the remote API the single generation target across Recourse's self-improvement loops (local inert), add a seeded 432-vs-443/440 tuning-contrast research layer to the music-therapy instrument, and surface both in new UI tabs.

**Architecture:** Three coordinated workstreams. (A) API-first remodel touches `capabilityForge.ts`, `vectorMemory.ts`, `server.ts`, `src/dream/*`, and their tests — local plumbing stays inert but reversible. (B) A new self-contained `musicTherapyTuning.ts` seeds real head-to-head tuning records and a mostly-null contrast model; `musicTherapyResearch.ts` attaches the contrast to each designed trial; `server.ts` gains a `/tuning` route. (C) Two new React components (`MusicTherapyView`, `ProviderView`) replace/join the existing tabs.

**Tech Stack:** TypeScript (Node 18+, vitest, tsx), React 19 + lucide-react, Express. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-07-api-first-self-improvement-and-music-therapy-tuning-design.md`

> **Line-number caveat:** `server.ts` line references in later tasks (Task 8) point at the file state AFTER earlier tasks (Task 4) have inserted code. When a line number no longer matches, locate the target by the code/message text quoted in the step.

---

## File Map

**New files:**
- `src/lib/musicTherapyTuning.ts` — tuning evidence seeds + contrast model + benchmark + caveats + renderer
- `src/components/MusicTherapyView.tsx` — MUSIC THERAPY tab
- `src/components/ProviderView.tsx` — AI PROVIDER tab (replaces OllamaView)
- `tests/musicTherapyTuning.test.ts`
- `tests/apiFirstRemodel.test.ts`

**Modified files:**
- `src/lib/musicTherapyResearch.ts` — attach `tuningContrast`/`tuningNote` to trials
- `src/lib/capabilityForge.ts` — API-only forge defaults; export `forgeConfig`
- `src/lib/vectorMemory.ts` — API `/embeddings` path + `'api'` backend label
- `src/dream/mutator.ts` — `'api_model'` engine, API `getActiveModel()`
- `src/dream/mutator-types.ts` — add `'api_model'` to `GeneOrigin`/`engine`
- `src/dream/types.ts` — add `'api_model'` to thought origin union
- `src/dream/engine.ts` — `origin: 'api_model'`
- `server.ts` — gate `/api/ollama/manage`, relabel provider messages, add `/music-therapy/tuning` route, extend `/design` response
- `src/App.tsx` — tabs (`music-therapy`, `provider`)
- `src/components/index.ts` — export new components
- `.env.example` — API-first docs, `OLLAMA_MANAGER_ENABLED`, embedding vars
- `tests/musicTherapyResearch.test.ts`, `tests/dreamModel.test.ts`, `tests/vectorMemory.test.ts`

---

## Phase 1 — Tuning-contrast research layer

### Task 1: Seeded tuning records, benchmark, caveats, renderer

**Files:**
- Create: `src/lib/musicTherapyTuning.ts`
- Test: `tests/musicTherapyTuning.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import {
  TUNING_RECORDS,
  TUNING_CAVEATS,
  musicVsControlBenchmark,
  renderTuningSummary,
} from '../src/lib/musicTherapyTuning';

describe('music therapy tuning-contrast evidence (seeded, real records)', () => {
  it('seeds the head-to-head records with real attribution', () => {
    expect(TUNING_RECORDS.length).toBeGreaterThanOrEqual(15);
    const hr = TUNING_RECORDS.find((r) => r.parameter === 'hr' && r.population.includes('oncology'));
    expect(hr).toBeDefined();
    expect(hr!.effect432).toBe(-3);       // Hohneck 2025: 432-arm HR change
    expect(hr!.effectComparator).toBe(-1); // 443-arm
    expect(hr!.between).toBe(-2);
    expect(hr!.betweenP).toBe(0.04);
    expect(hr!.significant).toBe(true);
    expect(hr!.doi).toBe('10.1186/s12906-025-04758-5');
    const pwv = TUNING_RECORDS.find((r) => r.parameter === 'pwv');
    expect(pwv!.significant).toBe(true);
    expect(pwv!.caveats!.length).toBeGreaterThan(0); // baseline asymmetry surfaced
    // Psych distress is NOT significant between frequencies.
    const anx = TUNING_RECORDS.find((r) => r.parameter === 'anxiety');
    expect(anx!.significant).toBe(false);
  });

  it('does not fabricate between-frequency p-values', () => {
    for (const r of TUNING_RECORDS) {
      if (r.betweenP != null) {
        expect(r.significant).toBe(r.betweenP < 0.05);
      } else {
        expect(r.significant).toBe(false);
      }
    }
  });

  it('benchmark matches the Cochrane music-vs-control anchors', () => {
    const b = musicVsControlBenchmark();
    const anx = b.find((x) => x.parameter === 'anxietySai')!;
    expect(anx.effect).toBe(-7.73);
    const hr = b.find((x) => x.parameter === 'hr')!;
    expect(hr.effect).toBe(-3.4);
    expect(hr.ci).toEqual([-5.58, -1.23]);
  });

  it('renders an honest text summary', () => {
    const s = renderTuningSummary(TUNING_RECORDS, [], musicVsControlBenchmark());
    expect(s).toContain('432');
    expect(s).toContain('significant');
    expect(s.toLowerCase()).not.toContain('cure');
  });

  it('lists the trial-design caveats (PWV asymmetry, floor effect, confounds)', () => {
    expect(TUNING_CAVEATS.some((c) => /baseline/i.test(c))).toBe(true);
    expect(TUNING_CAVEATS.some((c) => /floor/i.test(c))).toBe(true);
    expect(TUNING_CAVEATS.some((c) => /blinding|expectancy/i.test(c))).toBe(true);
    expect(TUNING_CAVEATS.some((c) => /control/i.test(c))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/musicTherapyTuning.test.ts`
Expected: FAIL with "Cannot find module '../src/lib/musicTherapyTuning'"

- [ ] **Step 3: Write the module**

Create `src/lib/musicTherapyTuning.ts` with this complete content:

```ts
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

/** Known limitations of the 432-vs-standard literature (surfaced, never hidden). */
export const TUNING_CAVEATS: string[] = [
  'Small samples: n=43 is the largest head-to-head tuning trial; others enrolled 12-42 participants.',
  'PWV baseline asymmetry in the Mannheim trial: the 432 arm started with significantly higher PWV (median 9 vs 8 m/s, p=0.003), giving it more room to improve.',
  'Psychological VAS floor effect: median baseline anxiety/stress was 0, so distress outcomes could not discriminate the interventions.',
  'Blinding is nearly impossible: 65% of patients noticed a difference between sessions; expectancy effects are uncontrolled.',
  'Delivery confound: the chest monochord adds vibrotactile stimulation and live-therapist presence, entangled with tuning.',
  'No active control arm: neither tuning can be compared against doing nothing.',
  'No long-term follow-up; only immediate pre/post effects were captured.',
  'Acute physiological lability: single measurements around a 15-minute session are sensitive to regression to the mean.',
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

export function renderTuningSummary(
  records: TuningRecord[],
  contrast: TuningContrastResult[],
  benchmark: BenchmarkRow[],
): string {
  const sig = contrast.filter((c) => c.significant).map((c) => `${c.parameter} (p=${c.p})`);
  const lines = [
    'Music-therapy tuning-contrast readout (432 vs 440/443 Hz).',
    `Records: ${records.length} seeded head-to-head trials (music-vs-music — never pooled into music-vs-control).`,
    `Significant between-frequency differences: ${sig.length > 0 ? sig.join(', ') : 'none'}.`,
    'All other parameters (HRV, vascular, aortic DBP, stiffness, all psych distress) are non-significant.',
    'Psychological distress is tuning-invariant: both tunings improve it equally.',
    'Benchmark (music vs control): anxiety -7.73 SAI, HR -3.4 bpm, systolic BP -4.18 mmHg.',
  ];
  lines.push('Caveats: ' + TUNING_CAVEATS.join('; '));
  return lines.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/musicTherapyTuning.test.ts`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/musicTherapyTuning.ts tests/musicTherapyTuning.test.ts
git commit -m "feat(music-therapy): seeded 432-vs-443/440 tuning-contrast evidence layer"
```

### Task 2: Contrast model

**Files:**
- Modify: `src/lib/musicTherapyTuning.ts` (append)
- Test: `tests/musicTherapyTuning.test.ts` (append)

- [ ] **Step 1: Write the failing test (append to the test file)**

```ts
import {
  tuningContrastModel,
  CONTRAST_PARAMETERS,
  type TuningContrastResult,
} from '../src/lib/musicTherapyTuning';

describe('tuning contrast model (mostly null — reflects the literature)', () => {
  it('flags only HR and PWV as significant at 432 Hz', () => {
    const c = tuningContrastModel(432);
    const sig = c.filter((x) => x.significant).map((x) => x.parameter);
    expect(sig).toEqual(['hr', 'pwv']);
    const hr = c.find((x) => x.parameter === 'hr')!;
    expect(hr.effect).toBe(-2);
    expect(hr.p).toBe(0.04);
    const pwv = c.find((x) => x.parameter === 'pwv')!;
    expect(pwv.effect).toBe(-0.5);
    expect(pwv.caveats.length).toBeGreaterThan(0);
  });

  it('keeps psych distress tuning-invariant (null effect, not significant)', () => {
    const c = tuningContrastModel(432);
    for (const p of ['anxiety', 'stress', 'fatigue', 'wellbeing'] as const) {
      const r = c.find((x) => x.parameter === p)!;
      expect(r.effect).toBeNull();
      expect(r.significant).toBe(false);
      expect(r.note.toLowerCase()).toContain('invariant');
    }
  });

  it('returns an untested, null contrast for the 415 Hz baroque-pitch comparator', () => {
    const c = tuningContrastModel(415);
    expect(c.length).toBe(CONTRAST_PARAMETERS.length);
    for (const r of c) {
      expect(r.untested).toBe(true);
      expect(r.effect).toBeNull();
      expect(r.significant).toBe(false);
    }
  });

  it('returns a null comparator-side contrast for 440/443 Hz', () => {
    for (const hz of [440, 443]) {
      const c = tuningContrastModel(hz);
      for (const r of c) {
        expect(r.effect).toBeNull();
        expect(r.significant).toBe(false);
        expect(r.untested).toBe(false);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/musicTherapyTuning.test.ts`
Expected: FAIL — `tuningContrastModel is not a function`

- [ ] **Step 3: Implement the contrast model (append to `src/lib/musicTherapyTuning.ts`)**

```ts
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

export const CONTRAST_PARAMETERS: TuningParameter[] = [
  'hr', 'pwv', 'hrvRmssd', 'aorticDbp', 'vascularResistance',
  'bpSystolic', 'bpDiastolic', 'vascularStiffness',
  'anxiety', 'stress', 'fatigue', 'wellbeing',
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
};

export function tuningContrastModel(
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/musicTherapyTuning.test.ts`
Expected: PASS (9 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/lib/musicTherapyTuning.ts tests/musicTherapyTuning.test.ts
git commit -m "feat(music-therapy): tuning-contrast model — significant only for HR and PWV"
```

---

## Phase 2 — Wire the contrast into trial design + server

### Task 3: `musicTherapyResearch.ts` attaches the tuning contrast

**Files:**
- Modify: `src/lib/musicTherapyResearch.ts`
- Test: `tests/musicTherapyResearch.test.ts` (append)

- [ ] **Step 1: Write the failing test (append)**

```ts
import { tuningContrastModel } from '../src/lib/musicTherapyTuning';

// ... (existing imports + describe stay)

describe('tuning contrast on designed trials', () => {
  it('attaches a tuning contrast that is significant only for HR/PWV at 432', () => {
    const t432 = designMusicTherapyTrial({ ...base, tuningHz: 432 });
    expect(t432.tuningContrast.length).toBeGreaterThan(0);
    const sig = t432.tuningContrast.filter((c) => c.significant).map((c) => c.parameter);
    expect(sig).toEqual(['hr', 'pwv']);
    expect(t432.tuningNote).toContain('invariant');
  });

  it('does NOT change the anxiety biomarker with tuning (psych distress is tuning-invariant)', () => {
    const a = designMusicTherapyTrial({ ...base, tuningHz: 432 });
    const b = designMusicTherapyTrial({ ...base, tuningHz: 443 });
    const anxA = a.biomarkers.find((x) => x.biomarker === 'anxietySai')!;
    const anxB = b.biomarkers.find((x) => x.biomarker === 'anxietySai')!;
    expect(anxA.effect).toBe(anxB.effect);
  });

  it('preserves determinism with tuning in the hash', () => {
    const a = designMusicTherapyTrial({ ...base, tuningHz: 432 });
    const b = designMusicTherapyTrial({ ...base, tuningHz: 432 });
    expect(a.id).toBe(b.id);
    expect(a.artifact.artifactHash).toBe(b.artifact.artifactHash);
  });

  it('flags 415 Hz as untested', () => {
    const t = designMusicTherapyTrial({ ...base, tuningHz: 415 });
    expect(t.tuningContrast.every((c) => c.untested)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/musicTherapyResearch.test.ts`
Expected: FAIL — `t.tuningContrast is undefined`

- [ ] **Step 3: Implement**

In `src/lib/musicTherapyResearch.ts`:

1. Add the import (top of file, after the existing imports):

```ts
import { tuningContrastModel, type TuningContrastResult } from './musicTherapyTuning.js';
```

2. Extend the `MusicTherapyTrial` interface (after `calibratedCount`):

```ts
  /** Between-frequency tuning contrast (432 vs 440/443) for this stimulus. */
  tuningContrast: TuningContrastResult[];
  /** Honest one-line readout of the tuning contrast. */
  tuningNote: string;
```

3. In `designMusicTherapyTrial`, after `const calibratedCount = ...` (line ~152), add:

```ts
  const tuningContrast = tuningContrastModel(tuning);
  const sigParams = tuningContrast.filter((c) => c.significant).map((c) => c.parameter);
  const tuningNote = `Tuning contrast (${tuning}Hz vs 443/440): ${sigParams.length > 0 ? `significant only for ${sigParams.join(', ')}` : 'no significant between-frequency differences'}; psych distress is tuning-invariant.`;
```

4. Add `tuningContrast` and `tuningNote` to the returned object (after `calibratedCount`):

```ts
    tuningContrast,
    tuningNote,
```

- [ ] **Step 4: Run the full research + tuning suites**

Run: `npx vitest run tests/musicTherapyResearch.test.ts tests/musicTherapyTuning.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/musicTherapyResearch.ts tests/musicTherapyResearch.test.ts
git commit -m "feat(music-therapy): attach tuning contrast to designed trials"
```

### Task 4: Server routes — `/tuning` + `/design` response

**Files:**
- Modify: `server.ts` (after line 8213, before the `composerLearner` comment)

- [ ] **Step 1: Add the `/tuning` route**

Insert after the `/music-therapy/evidence/refresh` route block (which ends at line 8213) and before the `// Episodes are human ratings...` comment (line 8214):

```ts
// Music-therapy TUNING-CONTRAST evidence (432 vs 440/443 Hz). Seeded from real
// head-to-head trials (Hohneck 2025; Calamassi 2019/2020; Aravena 2020). This
// axis is deliberately separate from the music-vs-control feed: a music-vs-music
// tuning comparison must never be pooled into the music-vs-control meta-analysis.
app.get('/api/recourse/music-therapy/tuning', async (_req, res) => {
  try {
    const { TUNING_RECORDS, TUNING_CAVEATS, tuningContrastModel, musicVsControlBenchmark, renderTuningSummary, BENCHMARK_NOTE } =
      await import('./src/lib/musicTherapyTuning.js');
    const contrast = {
      432: tuningContrastModel(432),
      440: tuningContrastModel(440),
      443: tuningContrastModel(443),
      415: tuningContrastModel(415),
    };
    res.json({
      success: true,
      source: 'seeded published head-to-head records (music-vs-music; never pooled into music-vs-control)',
      records: TUNING_RECORDS,
      contrast,
      benchmark: { rows: musicVsControlBenchmark(), note: BENCHMARK_NOTE },
      caveats: TUNING_CAVEATS,
      report: renderTuningSummary(TUNING_RECORDS, contrast[432], musicVsControlBenchmark()),
      honestNote: 'Estimates from real published trials with attribution. significant is derived only from a reported between-frequency p<0.05; absent p-values are never fabricated. Music therapy is supportive, not a cancer treatment.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? String(err) });
  }
});
```

- [ ] **Step 2: Extend the `/design` response**

In the `/api/recourse/music-therapy/design` handler (line 8116), add `tuningContrast` and `tuningNote` to the mapped trial object:

```ts
        calibratedCount: t.calibratedCount,
        tuningContrast: t.tuningContrast,
        tuningNote: t.tuningNote,
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors referencing `tuningContrast`/`tuningNote`/`musicTherapyTuning`

- [ ] **Step 4: Commit**

```bash
git add server.ts
git commit -m "feat(server): music-therapy tuning-contrast route + design response tuning fields"
```

---

## Phase 3 — Workstream A: API-first self-improvement remodel

### Task 5: Capability Forge — API-only defaults

**Files:**
- Modify: `src/lib/capabilityForge.ts:447-524`
- Test: `tests/apiFirstRemodel.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/apiFirstRemodel.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { forgeConfig } from '../src/lib/capabilityForge';
import { getActiveModel } from '../src/dream/mutator';

const ORIG = { ...process.env };

afterEach(() => {
  process.env = { ...ORIG };
});

describe('API-first self-improvement remodel', () => {
  it('forgeConfig defaults to the API provider, never localhost:11434', () => {
    delete process.env.FORGE_MODEL_BASE_URL;
    delete process.env.API_MODEL_BASE_URL;
    delete process.env.LOCAL_MODEL_BASE_URL;
    delete process.env.MODEL_BASE_URL;
    const cfg = forgeConfig();
    expect(cfg.baseUrl).toBe('https://api.pgsgrove.com/v1');
    expect(cfg.model).toBe('deepseek-v4-flash-0731');
    expect(cfg.apiKey).not.toBe('ollama');
    expect(cfg.baseUrl).not.toContain('11434');
  });

  it('forgeConfig prefers FORGE_* then API_MODEL_*', () => {
    process.env.API_MODEL_BASE_URL = 'https://api.example.test/v1';
    process.env.API_MODEL_NAME = 'api-model';
    const cfg = forgeConfig();
    expect(cfg.baseUrl).toBe('https://api.example.test/v1');
    expect(cfg.model).toBe('api-model');
  });

  it('getActiveModel returns the configured API model, not the qwen default', () => {
    process.env.API_MODEL_NAME = 'deepseek-v4-flash-0731';
    delete process.env.MODEL_NAME;
    expect(getActiveModel()).toBe('deepseek-v4-flash-0731');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/apiFirstRemodel.test.ts`
Expected: FAIL — `forgeConfig is not exported` and `getActiveModel()` returns the qwen default

- [ ] **Step 3: Implement `forgeConfig` API-only defaults + export**

In `src/lib/capabilityForge.ts`, replace the `forgeConfig()` body (lines 447-472):

```ts
export function forgeConfig() {
  const base = (
    process.env.FORGE_MODEL_BASE_URL ||
    process.env.API_MODEL_BASE_URL ||
    process.env.MODEL_BASE_URL ||
    'https://api.pgsgrove.com/v1'
  ).replace(/\/+$/, '');
  return {
    baseUrl: base,
    model:
      process.env.FORGE_MODEL_NAME ||
      process.env.API_MODEL_NAME ||
      process.env.MODEL_NAME ||
      'deepseek-v4-flash-0731',
    apiKey:
      process.env.FORGE_MODEL_API_KEY ||
      process.env.API_MODEL_API_KEY ||
      process.env.MODEL_API_KEY ||
      '',
    timeoutMs: Number(process.env.FORGE_MODEL_TIMEOUT_MS || process.env.MODEL_TIMEOUT_MS || 240_000),
  };
}
```

Also update the comment above it (lines 443-446) to:

```ts
// FORGE_MODEL_BASE_URL / FORGE_MODEL_NAME / FORGE_MODEL_API_KEY /
// FORGE_MODEL_TIMEOUT_MS override the global provider so the forge can pin a
// different model. Fallback chain: FORGE_* -> API_MODEL_* (Phoenix Grove) ->
// MODEL_* -> the API default. The local profile is inert (reports offline
// unless LOCAL_MODEL_BASE_URL is set) — the operator runs no local model.
```

- [ ] **Step 4: Fix `forgeChat` profile resolution**

In `forgeChat()` (line ~504), replace the profile resolution so it defaults to `'api'` and only uses `'local'` when an explicit `FORGE_MODEL_BASE_URL` targets a localhost endpoint:

```ts
  let profileId: 'api' | 'local' = 'api';
  if (process.env.FORGE_MODEL_BASE_URL && cfg.baseUrl === (process.env.FORGE_MODEL_BASE_URL || '').replace(/\/+$/, '')) {
    profileId = process.env.FORGE_MODEL_BASE_URL.includes(':11434') ? 'local' : 'api';
  }
```

- [ ] **Step 5: Run the API-first + forge tests**

Run: `npx vitest run tests/apiFirstRemodel.test.ts tests/capabilityForge.test.ts`
Expected: PASS (both files)

- [ ] **Step 6: Commit**

```bash
git add src/lib/capabilityForge.ts tests/apiFirstRemodel.test.ts
git commit -m "feat(forge): API-only provider defaults; local inert"
```

### Task 6: `getActiveModel` + mutator engine label

**Files:**
- Modify: `src/dream/mutator.ts:29-31`, `src/dream/mutator.ts:351-403`, `src/dream/mutator.ts:434`
- Modify: `src/dream/mutator-types.ts:16`, `:78`

- [ ] **Step 1: Update `mutator-types.ts` unions**

```ts
export type GeneOrigin = 'local_model' | 'api_model' | 'deterministic_fallback' | 'dream_engine';
```

and the `MutationResult.engine` field:

```ts
  engine?: 'local_model' | 'api_model' | 'deterministic_fallback';
```

- [ ] **Step 2: Update `getActiveModel` in `mutator.ts`**

```ts
export function getActiveModel(): string {
  return process.env.API_MODEL_NAME || process.env.MODEL_NAME || 'deepseek-v4-flash-0731';
}
```

- [ ] **Step 3: Rename the synthesis fn + engine value**

Rename `synthesizeWithLocalModel` → `synthesizeWithModel` (function name and its call site at line 432), update its header comment to say the API profile is the target, and change the engine value at line 434:

```ts
    if (candidate) {
      engine = 'api_model';
    } else {
      console.warn('[mutator:model_unavailable] provider returned nothing usable; using deterministic fallback');
    }
```

Also update the `let engine: 'local_model' | 'deterministic_fallback' = 'deterministic_fallback';` declaration (line 415) to:

```ts
  let engine: 'api_model' | 'local_model' | 'deterministic_fallback' = 'deterministic_fallback';
```

- [ ] **Step 4: Verify with existing mutator/dream tests**

Run: `npx vitest run tests/musicTherapyResearch.test.ts tests/apiFirstRemodel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/dream/mutator.ts src/dream/mutator-types.ts tests/apiFirstRemodel.test.ts
git commit -m "feat(dream): api_model origin + API getActiveModel default"
```

### Task 7: Vector memory — API embedding + honest label

**Files:**
- Modify: `src/lib/vectorMemory.ts:39-105`, `:244`
- Test: `tests/vectorMemory.test.ts:45`

- [ ] **Step 1: Update the failing test**

In `tests/vectorMemory.test.ts`, change line 45:

```ts
    expect(['api', 'lexical']).toContain(st.embedder);
```

Also update the doc comment at line 9 of the test file (optional) and the module header comment of `vectorMemory.ts` to reference the API embedder.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/vectorMemory.test.ts`
Expected: FAIL — embedder is `'ollama'`, not in `['api', 'lexical']`

- [ ] **Step 3: Replace the Ollama embedder**

In `src/lib/vectorMemory.ts`:

1. Update the header honesty comment (lines 9-12):

```ts
 *  - EMBEDDER: prefers the configured API embedding model (`EMBEDDING_MODEL` on
 *    `EMBEDDING_BASE_URL || API_MODEL_BASE_URL`); if unset/unavailable it falls
 *    back to a deterministic lexical hash vector. Both are FIXED at DIM=768 so
 *    rows never mix dimensions. The chosen backend is reported in `status()` —
 *    never implied. No localhost/Ollama probe is ever made.
```

2. Replace `MemoryStoreStatus.embedder` union (line 41) and `embedText` return backend (line 101) `'ollama' | 'lexical'` → `'api' | 'lexical'`, and `VectorMemory.embedBackend` (line 244) `'ollama' | 'lexical' | 'unknown'` → `'api' | 'lexical' | 'unknown'`.

3. Replace the `lastProbeOkAt` cooldown + `embedWithOllama` (lines 67-99) with an API embedder:

```ts
async function embedWithApi(text: string): Promise<number[] | null> {
  const model = process.env.EMBEDDING_MODEL;
  if (!model) return null;
  const base = (process.env.EMBEDDING_BASE_URL || process.env.API_MODEL_BASE_URL || process.env.MODEL_BASE_URL || '').replace(/\/+$/, '');
  if (!base) return null;
  const key = process.env.API_MODEL_API_KEY || process.env.MODEL_API_KEY || '';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2000);
  try {
    const res = await fetch(`${base}/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ model, input: text }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const j: any = await res.json();
    const vec: number[] | undefined = j?.data?.[0]?.embedding ?? j?.embeddings?.[0];
    if (!Array.isArray(vec) || vec.length === 0) return null;
    const out = Array.from({ length: VEC_DIM }, () => 0);
    for (let i = 0; i < Math.min(vec.length, VEC_DIM); i++) out[i] = vec[i];
    const norm = Math.sqrt(out.reduce((a, x) => a + x * x, 0)) || 1;
    return out.map((x) => x / norm);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
```

4. Replace `embedText` (lines 101-105):

```ts
export async function embedText(text: string): Promise<{ vec: number[]; backend: 'api' | 'lexical' }> {
  const api = await embedWithApi(text);
  if (api) return { vec: api, backend: 'api' };
  return { vec: lexicalEmbed(text), backend: 'lexical' };
}
```

- [ ] **Step 4: Run the vector memory tests**

Run: `npx vitest run tests/vectorMemory.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/vectorMemory.ts tests/vectorMemory.test.ts
git commit -m "feat(memory): API embeddings path with honest lexical fallback (no localhost probe)"
```

### Task 8: Server + dream messaging, gate the Ollama CLI manager

**Files:**
- Modify: `server.ts:3182-3324` (ollama routes), `:4734` (self-evolver message), `:5818/:5939/:5995/:6033` (swarm strings), `:10204` (provider persistence comment)
- Modify: `src/dream/engine.ts:559-561`
- Modify: `src/dream/types.ts:48`
- Test: `tests/dreamModel.test.ts:39,41`

- [ ] **Step 1: Update the failing dream test**

In `tests/dreamModel.test.ts`, change lines 39 and 41 to expect `'api_model'`:

```ts
    expect(newThought!.origin).toBe('api_model');
    expect(dreamState.recentThoughts.some((t) => t.origin === 'api_model')).toBe(true);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/dreamModel.test.ts`
Expected: FAIL — origin is `'local_model'`

- [ ] **Step 3: Update dream origin types + engine**

In `src/dream/types.ts` line 48:

```ts
  /** Where this thought came from: the configured API model, or the deterministic rule lexicon. */
  origin?: 'local_model' | 'api_model' | 'rule_based';
```

In `src/dream/engine.ts` lines 559-561:

```ts
      origin: 'api_model',
      invariantChecks: checks,
      provenance: ['api_model_rem'],
```

- [ ] **Step 4: Gate the Ollama CLI manager in `server.ts`**

In the `/api/ollama/manage` GET handler (line 3282) add at the top:

```ts
  if (process.env.OLLAMA_MANAGER_ENABLED !== '1') {
    return res.json({
      success: false,
      disabled: true,
      note: 'Local model manager disabled (OLLAMA_MANAGER_ENABLED not set). Generation runs through the API provider.',
    });
  }
```

In the `/api/ollama/manage` POST handler (line 3286) add the same guard at the top:

```ts
  if (process.env.OLLAMA_MANAGER_ENABLED !== '1') {
    return res.json({
      success: false,
      disabled: true,
      note: 'Local model manager disabled (OLLAMA_MANAGER_ENABLED not set). Generation runs through the API provider.',
    });
  }
```

- [ ] **Step 5: Relabel provider messaging**

- Line 3217 message: change to `'No model provider reachable at ' + cfg.baseUrl + '. Configure API_MODEL_BASE_URL / API_MODEL_NAME (or LOCAL_MODEL_* for an explicitly-configured local endpoint).'`
- Line 4734 message: change `'No local model server reachable at '` → `'No model provider reachable at '` and the suffix `'Configure MODEL_BASE_URL / MODEL_NAME and start the server.'` → `'Configure API_MODEL_BASE_URL / API_MODEL_NAME.'`
- Line 5818: `Running via local model:` → `Running via configured provider:`
- Line 5939: `Completed via local model:` → `Completed via configured provider:`
- Line 5995: `'queued tasks awaiting local model'` → `'queued tasks awaiting configured provider'`
- Line 6033: `'Task is QUEUED. It is only completed when the local model produces code that passes the real sandbox verifier.'` → `'Task is QUEUED. It is only completed when the configured provider produces code that passes the real sandbox verifier.'`

- [ ] **Step 6: Run the dream + related suites**

Run: `npx vitest run tests/dreamModel.test.ts tests/musicTherapyResearch.test.ts tests/musicTherapyTuning.test.ts tests/vectorMemory.test.ts tests/apiFirstRemodel.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server.ts src/dream/engine.ts src/dream/types.ts tests/dreamModel.test.ts
git commit -m "feat(api-first): gate ollama manager, relabel provider messaging, api_model dream origin"
```

---

## Phase 4 — UI

### Task 9: `MusicTherapyView.tsx`

**Files:**
- Create: `src/components/MusicTherapyView.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/MusicTherapyView.tsx` with this complete content:

```tsx
import React, { useState } from 'react';
import { Activity, Music2, RefreshCw, Scale, AlertTriangle } from 'lucide-react';

interface ContrastRow { parameter: string; tuningHz: number; effect: number | null; significant: boolean; p: number | null; untested: boolean; caveats: string[]; note: string; }
interface RecordRow { parameter: string; comparator: string; effect432: number | null; effectComparator: number | null; between: number | null; betweenP: number | null; significant: boolean; year: number; source: string; detail: string; }
interface BenchmarkRow { parameter: string; effect: number; units: string; n: number; source: string; }
interface TrialCard { id: string; stimulus: any; biomarkers: any[]; tuningContrast: ContrastRow[]; tuningNote: string; claim: string; }

const PARAM_LABEL: Record<string, string> = {
  hr: 'Heart rate', pwv: 'Pulse wave velocity (m/s)', hrvRmssd: 'HRV RMSSD (ms)',
  aorticDbp: 'Aortic diastolic BP (mmHg)', vascularResistance: 'Vascular resistance (%)', bpSystolic: 'Systolic BP',
  bpDiastolic: 'Diastolic BP', vascularStiffness: 'Vascular stiffness', anxiety: 'Anxiety', stress: 'Stress',
  fatigue: 'Fatigue', wellbeing: 'Wellbeing', cortisol: 'Salivary cortisol', sleep: 'Sleep', respRate: 'Respiratory rate',
  anxietySai: 'Anxiety (SAI)', hrv: 'HRV (z)', iga: 'IgA (z)',
};

const EMPTY_CONTRAST: Record<string, ContrastRow[]> = {};

export const MusicTherapyView: React.FC = () => {
  const [tuning, setTuning] = useState(432);
  const [bpm, setBpm] = useState(60);
  const [major, setMajor] = useState(false);
  const [intensity, setIntensity] = useState<'sedative' | 'stimulative'>('sedative');
  const [variants, setVariants] = useState(3);
  const [trials, setTrials] = useState<TrialCard[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [contrast, setContrast] = useState<Record<string, ContrastRow[]>>(EMPTY_CONTRAST);
  const [benchmark, setBenchmark] = useState<BenchmarkRow[]>([]);
  const [benchmarkNote, setBenchmarkNote] = useState('');
  const [caveats, setCaveats] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadTuning = async () => {
    setBusy(true);
    try {
      const j = await fetch('/api/recourse/music-therapy/tuning').then((r) => r.json());
      setRecords(j.records ?? []);
      setContrast(j.contrast ?? {});
      setBenchmark(j.benchmark?.rows ?? []);
      setBenchmarkNote(j.benchmark?.note ?? '');
      setCaveats(j.caveats ?? []);
    } catch (e: any) { setMsg(`tuning evidence fetch failed: ${e.message}`); }
    finally { setBusy(false); }
  };

  const design = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const j = await fetch('/api/recourse/music-therapy/design', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bpm, major, intensity, tuningHz: tuning, variants, seed: 42, style: 'jasper-ballad' }),
      }).then((r) => r.json());
      if (!j.success) { setMsg(j.error || 'design failed'); return; }
      setTrials(j.trials ?? []);
    } catch (e: any) { setMsg(`design failed: ${e.message}`); }
    finally { setBusy(false); }
  };

  const refreshFeed = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const j = await fetch('/api/recourse/music-therapy/evidence/refresh', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
      }).then((r) => r.json());
      setMsg(j.success ? `feed: ${j.poolableRecords} poolable, ${j.qualitativeRecords} qualitative, ${j.errors?.length ?? 0} errors` : j.error || 'refresh failed');
    } catch (e: any) { setMsg(`refresh failed: ${e.message}`); }
    finally { setBusy(false); }
  };

  const contrastRows = contrast[String(tuning)] ?? [];

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <div className="flex items-center gap-2">
          <Music2 className="w-5 h-5 text-indigo-400" />
          <h2 className="text-sm font-bold text-white font-mono">MUSIC-THERAPY RESEARCH INSTRUMENT — TUNING CONTRAST</h2>
        </div>
        <p className="text-[11px] text-slate-500 font-mono mt-1">
          Reproducible trial design + a 432-vs-440/443 tuning-contrast layer. Estimates are literature-prior models with
          uncertainty — never measurements. Supportive intervention, not a cancer treatment.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Design studio */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-400" /> DESIGN STUDIO</h3>
          <label className="block text-[11px] font-mono text-slate-400">Tuning (Hz)</label>
          <div className="flex gap-2">
            {[415, 432, 440, 443].map((hz) => (
              <button key={hz} onClick={() => setTuning(hz)}
                className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold border transition ${tuning === hz ? 'bg-indigo-950 border-indigo-500 text-indigo-300' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600'}`}>
                {hz}
              </button>
            ))}
          </div>
          <label className="block text-[11px] font-mono text-slate-400 mt-2">BPM ({bpm})</label>
          <input type="range" min={60} max={100} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} className="w-full" />
          <div className="flex gap-2">
            <button onClick={() => setMajor(false)} className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold border ${!major ? 'bg-emerald-950 border-emerald-700 text-emerald-300' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>MINOR</button>
            <button onClick={() => setMajor(true)} className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold border ${major ? 'bg-emerald-950 border-emerald-700 text-emerald-300' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>MAJOR</button>
            <button onClick={() => setIntensity(intensity === 'sedative' ? 'stimulative' : 'sedative')} className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold border ${intensity === 'sedative' ? 'bg-indigo-950 border-indigo-500 text-indigo-300' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>{intensity.toUpperCase()}</button>
          </div>
          <label className="block text-[11px] font-mono text-slate-400">Variants ({variants})</label>
          <input type="range" min={1} max={8} value={variants} onChange={(e) => setVariants(Number(e.target.value))} className="w-full" />
          <button onClick={design} disabled={busy} className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-mono text-xs font-bold rounded-lg">
            {busy ? 'DESIGNING...' : `DESIGN ${variants === 1 ? 'TRIAL' : 'BATCH'} @ ${tuning}Hz`}
          </button>
        </div>

        {/* Tuning evidence */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white font-mono">HEAD-TO-HEAD TUNING EVIDENCE (432 vs 440/443)</h3>
            <button onClick={loadTuning} disabled={busy} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-mono text-[11px] font-bold rounded-lg flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> LOAD
            </button>
          </div>
          {records.length === 0 && contrastRows.length === 0 ? (
            <div className="p-6 text-center text-slate-500 font-mono text-xs border border-dashed border-slate-800 rounded-xl">No evidence loaded. Press LOAD to pull the seeded tuning-contrast records.</div>
          ) : (
            <div className="space-y-4">
              {contrastRows.length > 0 && (
                <table className="w-full text-[11px] font-mono">
                  <thead><tr className="text-slate-500 border-b border-slate-800 text-left">
                    <th className="py-1.5">Parameter</th><th>Effect (432 vs 443)</th><th>p</th><th>Verdict</th>
                  </tr></thead>
                  <tbody>
                    {contrastRows.map((c) => (
                      <tr key={c.parameter} className="border-b border-slate-900">
                        <td className="py-1.5 text-slate-300">{PARAM_LABEL[c.parameter] ?? c.parameter}</td>
                        <td className="text-slate-400">{c.effect ?? (c.untested ? 'untested' : '—')}</td>
                        <td className="text-slate-400">{c.p ?? '—'}</td>
                        <td>
                          {c.untested ? <span className="text-amber-400 font-bold text-[10px]">UNTESTED (415 Hz dose-finding)</span>
                            : c.significant ? <span className="text-emerald-400 font-bold text-[10px]">SIGNIFICANT</span>
                            : <span className="text-slate-500 text-[10px]">ns</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="space-y-1.5 max-h-64 overflow-auto">
                {records.map((r) => (
                  <div key={`${r.parameter}-${r.year}-${r.comparator}`} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/60 text-[11px] font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-300">{PARAM_LABEL[r.parameter] ?? r.parameter} <span className="text-slate-600">(432 vs {r.comparator})</span></span>
                      <span className={r.significant ? 'text-emerald-400 font-bold' : 'text-slate-500'}>{r.significant ? 'SIG' : 'ns'}{r.betweenP != null ? ` p=${r.betweenP}` : ' · no between-p'}</span>
                    </div>
                    <p className="text-slate-500 mt-0.5">{r.detail}</p>
                    <p className="text-slate-600">{r.source} ({r.year})</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Benchmark + caveats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2 mb-3"><Scale className="w-4 h-4 text-indigo-400" /> BENCHMARK — STANDARD MUSIC THERAPY (MUSIC vs CONTROL)</h3>
          {benchmark.length === 0 ? <p className="text-slate-500 text-xs font-mono">Load evidence to see the Cochrane benchmark.</p> : (
            <>
              <table className="w-full text-[11px] font-mono">
                <thead><tr className="text-slate-500 border-b border-slate-800 text-left"><th className="py-1.5">Measure</th><th>Effect</th><th>n</th></tr></thead>
                <tbody>
                  {benchmark.map((b) => (
                    <tr key={b.parameter} className="border-b border-slate-900">
                      <td className="py-1.5 text-slate-300">{PARAM_LABEL[b.parameter] ?? b.parameter}</td>
                      <td className="text-emerald-400">{b.effect} {b.units}</td>
                      <td className="text-slate-500">{b.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] font-mono text-slate-500 mt-2">{benchmarkNote}</p>
            </>
          )}
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2 mb-3"><AlertTriangle className="w-4 h-4 text-amber-400" /> LIMITATIONS</h3>
          {caveats.length === 0 ? <p className="text-slate-500 text-xs font-mono">Load evidence to see the caveats.</p> : (
            <ul className="space-y-1.5 text-[11px] font-mono text-slate-400">
              {caveats.map((c, i) => <li key={i} className="flex gap-2"><span className="text-amber-500">▸</span>{c}</li>)}
            </ul>
          )}
          <button onClick={refreshFeed} disabled={busy} className="mt-3 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-mono text-[11px] font-bold rounded-lg flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> REFRESH MUSIC-VS-CONTROL FEED
          </button>
        </div>
      </div>

      {/* Trial cards */}
      {trials.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {trials.map((t) => (
            <div key={t.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-white font-mono">{t.id}</span>
                <span className="text-[10px] font-mono text-slate-500">{t.stimulus?.tuningHz}Hz · {t.stimulus?.bpm}bpm {t.stimulus?.major ? 'maj' : 'min'} · {t.stimulus?.intensity}</span>
              </div>
              <p className="text-[11px] font-mono text-slate-400 mb-2">{t.claim}</p>
              <p className="text-[11px] font-mono text-indigo-300 mb-2">{t.tuningNote}</p>
              <div className="space-y-1">
                {t.biomarkers?.map((b) => (
                  <div key={b.biomarker} className="flex justify-between text-[11px] font-mono text-slate-400">
                    <span>{b.biomarker}{b.calibrated ? ' (calibrated)' : ''}</span>
                    <span className={b.effect < 0 ? 'text-emerald-400' : 'text-indigo-300'}>{b.effect > 0 ? '+' : ''}{b.effect} ± {b.sd}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {msg && <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-[11px] font-mono text-slate-400">{msg}</div>}
    </div>
  );
};
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors from `MusicTherapyView.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/components/MusicTherapyView.tsx
git commit -m "feat(ui): MUSIC THERAPY tab — tuning contrast, benchmark, design studio"
```

### Task 10: `ProviderView.tsx` (replaces OllamaView)

**Files:**
- Create: `src/components/ProviderView.tsx`
- Delete: `src/components/OllamaView.tsx` (replaced; removed from index + App)

- [ ] **Step 1: Write the component**

Create `src/components/ProviderView.tsx`:

```tsx
import React, { useState, useEffect } from 'react';
import { Server, CheckCircle, XCircle, MessageSquare, Send, RefreshCw } from 'lucide-react';

interface ProviderState {
  mode: string;
  current: { baseUrl: string; model: string; online: boolean; lastError?: string };
  profiles: Array<{ id: string; label: string; baseUrl: string; model: string }>;
}

interface ChatMsg { role: 'user' | 'assistant'; content: string; error?: string }

export const ProviderView: React.FC = () => {
  const [provider, setProvider] = useState<ProviderState | null>(null);
  const [prompt, setPrompt] = useState('');
  const [history, setHistory] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);

  const load = async () => {
    try {
      const j = await fetch('/api/recourse/settings/provider').then((r) => r.json());
      setProvider({ mode: j.mode, current: j.current, profiles: j.profiles ?? [] });
    } catch { setProvider(null); }
  };

  useEffect(() => { load(); }, []);

  const send = async () => {
    if (!prompt.trim() || chatBusy) return;
    setChatBusy(true);
    setHistory((h) => [...h, { role: 'user', content: prompt }]);
    const text = prompt;
    setPrompt('');
    try {
      const j = await fetch('/api/ollama/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: text }),
      }).then((r) => r.json());
      if (j?.response) setHistory((h) => [...h, { role: 'assistant', content: j.response, error: j.error }]);
      else setHistory((h) => [...h, { role: 'assistant', content: '', error: j?.error || 'no response' }]);
    } catch (e: any) {
      setHistory((h) => [...h, { role: 'assistant', content: '', error: e.message }]);
    } finally { setChatBusy(false); }
  };

  const cur = provider?.current;
  const online = cur?.online === true;

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center gap-2">
          <Server className="w-5 h-5 text-indigo-400" />
          <h2 className="text-sm font-bold text-white font-mono">AI PROVIDER — CONFIGURED MODEL ENDPOINT</h2>
        </div>
        <p className="text-[11px] text-slate-500 font-mono mt-1">
          All self-improvement generation (dream, forge, swarm, mutator) routes through the configured API provider. The
          local (Ollama) profile is inert and reports offline unless LOCAL_MODEL_BASE_URL is explicitly set. Offline is
          reported as offline — never fabricated.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 lg:col-span-1">
          <h3 className="text-sm font-bold text-white font-mono">PROVIDER STATUS</h3>
          {!cur ? (
            <p className="text-xs font-mono text-slate-500">Provider settings unavailable (server route down).</p>
          ) : (
            <>
              <div className="flex justify-between items-center p-2.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs">
                <span className="text-slate-400">Status:</span>
                <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${online ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-red-950 text-red-400 border border-red-800'}`}>
                  {online ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1 font-mono text-xs">
                <div className="text-slate-500">Model: <span className="text-white">{cur.model}</span></div>
                <div className="text-slate-500 break-all">Endpoint: <span className="text-indigo-300">{cur.baseUrl || '(unset)'}</span></div>
                {cur.lastError && <div className="text-red-400 text-[10px] break-all">{cur.lastError}</div>}
              </div>
              <button onClick={load} className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white font-mono text-xs font-bold rounded-lg flex items-center justify-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" /> REFRESH
              </button>
            </>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 lg:col-span-2 flex flex-col h-[480px]">
          <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2 pb-3 border-b border-slate-800">
            <MessageSquare className="w-4 h-4 text-indigo-400" /> PROVIDER TERMINAL
          </h3>
          <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 overflow-y-auto space-y-2 font-mono text-xs">
            {history.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-600 text-center">Prompt the configured provider. Runs through /api/ollama/chat, which routes to the API profile.</div>
            ) : history.map((m, i) => (
              <div key={i} className={`p-2.5 rounded-lg border ${m.role === 'user' ? 'bg-indigo-950/20 border-indigo-900/50 text-indigo-200' : 'bg-slate-900 border-slate-800 text-slate-300'}`}>
                <div className="text-[10px] text-slate-500 mb-1 font-bold uppercase">{m.role === 'user' ? 'You' : (cur?.model ?? 'provider')}</div>
                {m.error && <div className="text-red-400 text-[10px] mb-1">{m.error}</div>}
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <input value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="Ask the configured provider..." disabled={chatBusy}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500 disabled:opacity-50" />
            <button onClick={send} disabled={chatBusy || !prompt.trim()} className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-mono text-xs font-bold rounded-xl flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5" /> {chatBusy ? 'WAITING...' : 'SEND'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h3 className="text-sm font-bold text-white font-mono mb-3">PROFILES</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(provider?.profiles ?? []).map((p) => (
            <div key={p.id} className="p-3 rounded-xl border border-slate-800 bg-slate-950 font-mono text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-200 font-bold">{p.label}</span>
                {p.id === 'api' ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-slate-600" />}
              </div>
              <div className="text-slate-500">Model: <span className="text-white">{p.model}</span></div>
              <div className="text-slate-500 break-all">{p.baseUrl || 'not configured'}</div>
            </div>
          ))}
        </div>
        <p className="text-[10px] font-mono text-slate-600 mt-3">
          Local profile is inert by design (no local model on this machine). Re-enable only by setting LOCAL_MODEL_BASE_URL /
          LOCAL_MODEL_NAME / LOCAL_MODEL_API_KEY and switching the provider mode.
        </p>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Remove `OllamaView.tsx` and update exports**

1. Delete `src/components/OllamaView.tsx`.
2. In `src/components/index.ts`, replace `export { OllamaView } from './OllamaView';` with:

```ts
export { ProviderView } from './ProviderView';
export { MusicTherapyView } from './MusicTherapyView';
```

- [ ] **Step 3: Wire tabs in `App.tsx`**

1. In the import block, replace `OllamaView,` with `ProviderView, MusicTherapyView,`.
2. In the `TabKey` union, replace `| 'ollama'` with `| 'provider'` and add `| 'music-therapy'`.
3. In `TABS`, replace the `ollama` entry:

```tsx
  {
    key: 'provider',
    label: 'AI PROVIDER',
    icon: <Server className="w-4 h-4 text-indigo-400" />,
    badge: () => (
      <span className="px-1.5 py-0.2 bg-indigo-950 text-indigo-300 text-[10px] rounded border border-indigo-800 font-bold">
        API
      </span>
    ),
  },
```

4. Add a new `music-therapy` tab entry after `provider` (place near `forge`/`recursive-math`):

```tsx
  {
    key: 'music-therapy',
    label: 'MUSIC THERAPY',
    icon: <Activity className="w-4 h-4 text-fuchsia-400" />,
    badge: () => (
      <span className="px-1.5 py-0.2 bg-fuchsia-950 text-fuchsia-300 text-[10px] rounded border border-fuchsia-800 font-bold">
        432Hz
      </span>
    ),
  },
```

5. Replace the render block:

```tsx
            {activeTab === 'ollama' && (
              <OllamaView />
            )}
```

with:

```tsx
            {activeTab === 'provider' && (
              <ProviderView />
            )}

            {activeTab === 'music-therapy' && (
              <MusicTherapyView />
            )}
```

- [ ] **Step 4: Verify compile + lint**

Run: `npx tsc --noEmit`
Run: `npm run lint`
Expected: both clean (no `OllamaView` references remain)

- [ ] **Step 5: Commit**

```bash
git add src/components/ProviderView.tsx src/components/MusicTherapyView.tsx src/components/index.ts src/App.tsx
git rm src/components/OllamaView.tsx
git commit -m "feat(ui): AI PROVIDER tab replaces OllamaView; add MUSIC THERAPY tab"
```

---

## Phase 5 — Docs + full verification

### Task 11: `.env.example` + end-to-end verification

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Update `.env.example` provider docs**

Replace the provider comment block (lines 1-32) with API-first documentation:

```
# Model provider: any OpenAI-compatible endpoint. The API profile is the SOLE
# generation target (the operator runs no local model — the laptop is too weak).
# All generative features (evolve, mutate, dream, forge, swarm) route here. When
# the endpoint is unreachable the app reports OFFLINE - it never fabricates
# responses or canned text.

# API provider (OpenAI-compatible /v1). Phoenix Grove default:
# API_MODEL_BASE_URL="https://api.pgsgrove.com/v1"
# API_MODEL_NAME="deepseek-v4-flash-0731"
# API_MODEL_API_KEY=""
# Fallback legacy names (still honored):
MODEL_BASE_URL="https://api.pgsgrove.com/v1"
MODEL_API_KEY=""
MODEL_NAME="deepseek-v4-flash-0731"
# Request timeout for model calls, in milliseconds.
MODEL_TIMEOUT_MS="60000"

# Local (Ollama) profile — INERT by design. It reports offline unless all of
# these are explicitly set AND the provider mode is switched to local:
# LOCAL_MODEL_BASE_URL="http://localhost:11434/v1"
# LOCAL_MODEL_NAME=""
# LOCAL_MODEL_API_KEY=""
# Local Model Manager (ollama pull / serve CLI) — disabled unless set to 1:
# OLLAMA_MANAGER_ENABLED="0"

# API embedding (vector memory). EMBEDDING_MODEL must be set to enable API
# embeddings; otherwise the honest lexical-hash embedder is used:
# EMBEDDING_BASE_URL=""
# EMBEDDING_MODEL=""
```

Note: only add the `MODEL_BASE_URL`/`MODEL_API_KEY`/`MODEL_NAME` lines if they were already present — otherwise just add the `API_MODEL_*`/`OLLAMA_MANAGER_ENABLED`/`EMBEDDING_*` blocks above the existing default block.

- [ ] **Step 2: Run the full unit suite**

Run: `npm test`
Expected: all suites pass (no regressions in existing dream/forge/vector-memory/evidence tests)

- [ ] **Step 3: Run lint + typecheck**

Run: `npm run lint`
Run: `npm run typecheck` (or `npx tsc --noEmit`)
Expected: clean

- [ ] **Step 4: Restart the server and smoke-test the new routes**

```powershell
Remove-Item -LiteralPath .recourse.lock -ErrorAction SilentlyContinue
$env:NODE_OPTIONS = '--max-old-space-size=3072'
Start-Process -FilePath "npx.cmd" -ArgumentList "tsx","server.ts" -WorkingDirectory "C:\Users\User\Downloads\recourse" -WindowStyle Hidden -RedirectStandardOutput "C:\Users\User\Downloads\recourse\recourse-restart.log" -RedirectStandardError "C:\Users\User\Downloads\recourse\recourse-restart.err"
Start-Sleep 30
```

Then verify:

```powershell
Invoke-RestMethod 'http://127.0.0.1:3050/api/recourse/music-therapy/tuning' | Select-Object -Property success, @{N='records';E={$_.records.Count}}, @{N='caveats';E={$_.caveats.Count}} | Format-List
```

Expected: `success: True`, `records: 17`, `caveats: 8`.

```powershell
$d = Invoke-RestMethod -Method Post 'http://127.0.0.1:3050/api/recourse/music-therapy/design' -ContentType 'application/json' -Body '{"tuningHz":432,"variants":2}'
$d.trials[0].tuningNote
```

Expected: the note contains "significant only for hr, pwv" and "invariant".

```powershell
Invoke-RestMethod 'http://127.0.0.1:3050/api/recourse/settings/provider' | Select-Object -Property mode, @{N='model';E={$_.current.model}} | Format-List
```

Expected: `mode: api`, `model: deepseek-v4-flash-0731` (or whatever API_MODEL_NAME is configured).

```powershell
Invoke-RestMethod 'http://127.0.0.1:3050/api/ollama/manage' | Select-Object disabled | Format-List
```

Expected: `disabled: True` (manager gated off).

- [ ] **Step 5: Commit**

```bash
git add .env.example
git commit -m "docs: API-first provider config, OLLAMA_MANAGER_ENABLED, embedding vars"
```

---

## Self-Review Notes (checked before handoff)

- Spec §4.1 → Task 5; §4.2 → Task 7; §4.3/§4.4/§4.5 → Tasks 6 + 8; §4.6 → Task 11.
- Spec §5.1 → Tasks 1 + 2; §5.2 → Task 3; §5.3 → Task 4.
- Spec §6.1 → Task 9; §6.2 → Task 10; §6.3 → Task 10.
- Spec §8 (testing) → Tasks 1-8 + 11.
- No placeholders; every code step is complete. Type names are consistent: `TuningRecord`, `TuningContrastResult`, `tuningContrastModel`, `musicVsControlBenchmark`, `TUNING_CAVEATS`, `CONTRAST_PARAMETERS` are defined in Task 1/2 and used identically in Tasks 3-4 and the UI in Task 9.