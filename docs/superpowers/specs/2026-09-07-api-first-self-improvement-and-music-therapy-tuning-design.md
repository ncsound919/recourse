# API-First Self-Improvement + Music-Therapy Tuning Research — Design Spec

**Date:** 2026-09-07
**Status:** Approved (operator, 2026-09-07)
**Author:** Recourse evolution design

## 1. Problem

Three linked gaps:

1. **Self-improvement still carries local-model coupling.** Recourse's generation already
   routes to the remote API (Phoenix Grove, `deepseek-v4-flash-0731`) via
   `src/lib/modelProvider.ts`, and `.env` has `API_MODEL_*` configured. But residual
   Ollama-first plumbing remains: `capabilityForge.ts` still defaults its model config to
   `localhost:11434` with an `'ollama'` key, `vectorMemory.ts` probes
   `localhost:11434/api/embed` on every embed, `server.ts` exposes a live `/api/ollama/*`
   surface including an `ollama pull` CLI manager, and the dream/swarm loops still label
   thoughts and tasks "local model". The operator's laptop is too weak for a local model; the
   only viable generation target is the API. Local plumbing should be inert, not first.
2. **The music-therapy research instrument cannot represent the tuning question.** The
   system designs reproducible music-therapy trials and models biomarker responses from
   literature priors, but `tuningHz` (432/440/443) is **inert** — `modelBiomarkerResponse`
   only uses bpm/mode/intensity. The live evidence feed additionally **structurally
   excludes** the 432-vs-440/443 head-to-head literature (`musicTherapyFullText.ts` demotes
   music-vs-music comparisons as "not a music-vs-control effect"). The operator provided a
   research brief (Hohneck et al. 2025, BMC Complement Med Ther; Cochrane 2021 CD006911;
   Calamassi 2019/2020; Aravena 2020) showing: 432 Hz produces a modest, mostly
   non-significant physiological edge over 443 Hz — significant only for heart rate
   (p=0.04) and pulse wave velocity (p<0.001) — while psychological distress improves
   equally under both tunings and standard music therapy already captures most of the
   benefit.
3. **No UI surface.** The music-therapy system is API/library only, and the "LOCAL OLLAMA
   MODELS" tab (`OllamaView.tsx`) is a legacy local-model UI that includes an
   honestly-labeled-but-fake "Lego orchestration demo".

## 2. Goals

1. **API-first self-improvement.** Make the remote API the single, explicit generation
   target across all self-improvement loops (forge, dream, swarm, vector memory). Remove
   Ollama-first defaults and probe behavior. Local remains in code but inert and
   documented — reversible, never first.
2. **A tuning-contrast research layer.** Add a dedicated, seeded head-to-head evidence base
   (432 vs 440/443) with an honest contrast model: significant only where the literature
   supports it, psych distress tuning-invariant, PWV baseline-asymmetry caveat surfaced,
   benchmarked against Cochrane music-vs-control.
3. **A real UI.** A MUSIC THERAPY tab (design studio + tuning evidence + benchmark +
   evidence feed) and an API-first AI PROVIDER tab replacing the local-model Ollama view.
4. **Preserve the honesty contract.** Models labeled as estimates with uncertainty, offline
   reported as offline, no fabricated p-values, no invented measurements, no claims that
   music treats cancer.

## 3. Non-Goals

1. Not deleting local-model plumbing (operator chose "surgical, local inert").
2. Not merging music-vs-music tuning records into the music-vs-control meta-analysis axis.
3. Not building audio playback; the composer already emits sequences/notes — unchanged.
4. Not auto-applying any "432 Hz is better" claim; the layer surfaces evidence and caveats.
5. Not touching the OOM/state-bloat fix beyond the heap bump already applied at runtime.

## 4. Workstream A — API-First Self-Improvement Remodel (surgical)

### A.1 `src/lib/capabilityForge.ts`

- `forgeConfig()` fallback becomes: `FORGE_MODEL_*` → `API_MODEL_*` → `MODEL_*` → API
  defaults (`https://api.pgsgrove.com/v1`, `deepseek-v4-flash-0731`, empty key). Drop
  `LOCAL_MODEL_BASE_URL`/`localhost:11434`/`'ollama'` from the chain.
- `forgeChat()` profile resolution defaults to `'api'`; resolve `'local'` only when an
  explicit `FORGE_MODEL_BASE_URL` is set and targets a localhost/`:11434` endpoint. The
  `'local'` branch stays functional for an operator who deliberately configures it.

### A.2 `src/lib/vectorMemory.ts`

- Replace the `embedWithOllama` probe (`http://localhost:11434/api/embed`) with an API
  `/embeddings` attempt that runs **only** when `EMBEDDING_MODEL` is set. Base URL:
  `EMBEDDING_BASE_URL || API_MODEL_BASE_URL || MODEL_BASE_URL` (stripped `/v1` for
  native-style endpoints). On any failure (model not set, HTTP error, timeout) fall back to
  the existing lexical-hash embedder.
- Rename the backend label `'ollama'` → `'api'` in the `backend` union and persisted
  `embedBackend`/`embedder` values; keep `'lexical'`. Update `tests/vectorMemory.test.ts`.

### A.3 `server.ts`

- Gate the local-model manager `/api/ollama/manage` (real `ollama pull`/`serve` spawn)
  behind `OLLAMA_MANAGER_ENABLED === '1'` (default off). When off, return
  `{ success: false, disabled: true, note: 'Local model manager disabled (OLLAMA_MANAGER_ENABLED not set). Generation runs through the API provider.' }`
  and never spawn.
- Keep `/api/ollama/status` and `/api/ollama/chat` as compatibility routes (they already
  route through `chatComplete`, which targets the active API profile), but relabel their
  messaging to the configured provider, not "local model server".
- Relabel dream/swarm strings "via local model"/"no local model server" to the configured
  provider (see §4.4/§4.5).

### A.4 `src/dream/mutator.ts` + `mutator-types.ts`

- Add `'api_model'` to the `GeneOrigin` union (and the `engine` union in
  `MutateResult`-style types). Model synthesis (already calling `chatCompleteProfile('api')`)
  sets `engine = 'api_model'`. `'local_model'` stays a valid union value for reading old
  persisted records but is no longer produced unless a local profile is explicitly used.
- `getActiveModel()` returns the configured API model
  (`API_MODEL_NAME || MODEL_NAME || 'deepseek-v4-flash-0731'`) instead of the qwen default.

### A.5 `src/dream/engine.ts`

- When the model produces a thought, set `origin: 'api_model'` (was `'local_model'`).
  `'rule_based'` unchanged. Update `tests/dreamModel.test.ts` expectations.

### A.6 `.env.example`

- Update provider comments: API is the sole generation target; local profile is inert and
  reports offline unless `LOCAL_MODEL_BASE_URL` is set.
- Add `OLLAMA_MANAGER_ENABLED`, `EMBEDDING_BASE_URL`, `EMBEDDING_MODEL` documented blocks.

## 5. Workstream B — Music-Therapy Tuning-Contrast Research Layer

### B.1 Extend `src/lib/musicTherapyTuning.ts` (already wired to `/tuning` + publish path)

> Pre-execution note: an earlier session built a working coarse tuning layer (3-metric contrast, benchmark, caveats, publish path). This section EXTENDS it additively — every existing export and behavior is preserved; the seeded per-trial records and 12-parameter detailed contrast are added alongside.

**Seeded head-to-head evidence** (real published records, tuned-source attributed, no
fabrication). Shape:

```ts
type TuningComparator = '443' | '440';
interface TuningRecord {
  id: string;
  parameter: TuningParameter;      // 'hr' | 'hrvRmssd' | 'pwv' | 'bpSystolic' |
                                   // 'bpDiastolic' | 'aorticDbp' | 'vascularResistance' |
                                   // 'vascularStiffness' | 'cortisol' | 'sleep' |
                                   // 'respRate' | 'anxiety' | 'stress' | 'fatigue' | 'wellbeing'
  comparator: TuningComparator;    // 443 or 440
  effect432: number | null;        // within-432-arm change (sign = direction for the measure)
  effectComparator: number | null; // within-comparator-arm change
  between: number | null;          // 432 minus comparator where reported
  betweenP: number | null;         // null when no between-frequency test reported (honest)
  significant: boolean;            // computed from betweenP < 0.05 only when betweenP != null
  n: number | null;
  population: string;              // 'oncology (Mannheim crossover)' etc.
  design: string;
  year: number;
  source: string;
  pmid: string | null;
  detail: string;
  caveats?: string[];
}
```

Seeded records (all from the operator's research brief):

| Source | Population | Parameters |
|---|---|---|
| Hohneck 2025 (BMC, PMID via brief) | 43 oncology, 432-vs-443 crossover, chest monochord | HR (−3 vs −1, between p=0.04 **sig**), HRV RMSSD (+3ms vs none, between p=0.17 ns), SBP (both reduced, between ns), DBP (none), vascular resistance (−5% vs none, between p=0.18 ns), vascular stiffness/age (reduced vs none, between ns), PWV (−0.5 m/s vs none, between p<0.001 **sig**), aortic DBP (−3 mmHg vs none, between p=0.07 trend), anxiety/stress/fatigue/wellbeing (equal improvement, between ns) |
| Calamassi 2019 | healthy listeners, 432-vs-440 crossover | HR (−4.79 bpm favoring 432, p=0.05), SBP/DBP/resp small ns |
| Aravena 2020 | 42 dental-extraction RCT, 432 vs 440 vs control | anxiety reduced both vs control; cortisol fell only at 432 (0.49 vs 1.35 vs 1.59 µg/dL, p<0.05) |
| Calamassi 2020 | 12 SCI patients, 432 vs 440 | sleep +3.6 at 432 (p=0.02) vs −1.5 at 440 (p=0.34); stress ns both |
| Emergency-nurse RCT (COVID) | double-blind RCT | state anxiety down in all arms; resp rate −2.7/min and SBP −3.8 mmHg only at 432 |

**Contrast model** — `tuningContrastModel(tuningHz: number, opts?): TuningContrastResult[]`.
Honest rule: a between-frequency difference is *significant* only when the literature
reports `betweenP < 0.05`. Under the seeded base, at 432 vs 440/443:

- HR: additional −2 bpm (between p=0.04) — **significant**
- PWV: additional −0.5 m/s (between p<0.001) — **significant**, always carries the
  baseline-asymmetry caveat
- HRV RMSSD, vascular resistance, aortic DBP, stiffness, SBP, all psych VAS: **non-
  significant** (their reported p when known, else `p: null` labeled "no between-frequency
  test reported")
- Psych distress: explicitly tuning-invariant (both tunings improve equally; baseline VAS
  floor at 0)
- `tuningHz = 415`: flagged `untested:true` with the "lower-is-calmer hypothesis proposed
  by Hohneck et al." note; no effect asserted.
- `tuningHz = 440` or `443`: the comparator side; HR/PWV deltas sign-flipped to zero/null
  (the anchor literature contrasts 432 against the standard).

**Benchmark** — `musicVsControlBenchmark()` returns the Cochrane 2021 (CD006911) anchors
used elsewhere: anxiety −7.73 SAI (17 studies, n=1381), HR −3.4 bpm (95% CI −5.58 to
−1.23), SBP −4.18 mmHg (95% CI −6.7 to −1.66), plus the explicit framing that standard
music therapy captures most of the benefit regardless of tuning.

**Caveats** — `TUNING_CAVEATS: string[]` covering: small samples (largest n=43), PWV
baseline asymmetry (median 9 vs 8 m/s, p=0.003), VAS floor effect (median baseline 0),
blinding impossible/expectancy (65% noticed a difference), vibrotactile delivery confound,
no active-control arm, no long-term follow-up, acute physiological lability. Rendered in
the API and the UI.

**Report** — `renderTuningSummary(records, contrast, benchmark): string` for the fleet
readout.

### B.2 `src/lib/musicTherapyResearch.ts`

- `MusicTherapyTrial` gains `tuningContrast: TuningContrastResult[]` and
  `tuningNote: string`.
- `designMusicTherapyTrial`: after composing + modeling the 6 music-vs-control biomarkers
  (unchanged, tuning-invariant — this is the honest finding), compute the tuning contrast
  from `params.tuningHz` and attach it. The claim string gains a tuning line. Artifact
  params already include `tuningHz`, so reproducibility is preserved.
- `renderTrialBatch` includes the tuning-contrast line per trial.

### B.3 Server routes

- Extend the existing `GET /api/recourse/music-therapy/tuning` (do not duplicate it) → `{ success, source, grid, contrasts, detailedContrast, records, benchmark, benchmarkRows, benchmarkNote, caveats, render, report, honestNote }`.
- `POST /api/recourse/music-therapy/design` response: each trial gains `tuningContrast`
  and `tuningNote`.

## 6. Workstream C — UI

### C.1 New `src/components/MusicTherapyView.tsx`

New tab **MUSIC THERAPY**. Sections:

1. **Design studio** — params form (bpm, key, mode, style, tuningHz, intensity, variants) →
   `POST /api/recourse/music-therapy/design` → trial cards showing the 6-biomarker model
   and a tuning-contrast strip (HR/PWV flagged significant; "psych distress:
   tuning-invariant" note).
2. **Tuning evidence** — `GET /api/recourse/music-therapy/tuning` head-to-head table
   (parameter | 432 effect | 443/440 effect | between p | verdict) with significance badges
   and the PWV baseline-asymmetry warning.
3. **Benchmark comparison** — Cochrane music-vs-control vs the tuning signal.
4. **Evidence feed** — refresh button → `POST /api/recourse/music-therapy/evidence/refresh`
   + pooled-calibration summary.
5. Honest framing banner throughout: "estimates, not measurements; supportive, not a
   cancer treatment."

Style: match existing components (slate-900 cards, lucide-react icons, mono labels).

### C.2 New `src/components/ProviderView.tsx` (replaces `OllamaView`)

Tab relabeled **AI PROVIDER**. Content:

- Real provider status (endpoint, model, online, last error) from
  `GET /api/recourse/settings/provider` (existing route backed by `providerSettingsView()`).
- Local profile shown as **disabled** with the honest note.
- A chat box routing through `/api/ollama/chat` (which already calls `chatComplete` → API),
  labeled as the configured provider terminal.
- **No** fake Lego demo, **no** `ollama pull` manager UI.

### C.3 `src/App.tsx` + `src/components/index.ts`

- Add `TabKey 'music-therapy'` and a MUSIC THERAPY tab; rename the `ollama` tab key to
  `provider` (label "AI PROVIDER") and render `ProviderView` in place of `OllamaView`.
- Export the new components from `src/components/index.ts`.

## 7. Honesty Contract

- Every tuning record carries a real source + PMID; nothing is invented.
- `betweenP` is `null` (never fabricated) when the source reported no between-frequency
  test; `significant` is derived from `betweenP < 0.05` and is `false`/null-guarded
  otherwise.
- The contrast model is mostly null on purpose — it reflects the literature, not hype.
- Psych distress is tuning-invariant; standard music therapy remains the benchmark.
- No claim that any tuning treats cancer.

## 8. Testing Strategy

- New `tests/musicTherapyTuning.test.ts`: seeded records present with PMIDs/values;
  contrast significant only for HR+PWV at 432; psych parameters non-significant; 440/443
  produce null/inverse contrast; 415 `untested:true`; benchmark numbers correct; no
  fabricated p (null-preserving).
- Update `tests/musicTherapyResearch.test.ts`: 432 changes HR/PWV contrast but **not** the
  anxiety effect; determinism preserved (same params → same id/hash).
- Update `tests/dreamModel.test.ts` (origin `api_model`), `tests/vectorMemory.test.ts`
  (embedder `api`|`lexical`).
- `npm test`, `npm run lint` (typecheck + oxlint) green.

## 9. File Inventory

**New:** `src/components/MusicTherapyView.tsx`,
`src/components/ProviderView.tsx`, `tests/musicTherapyTuning.test.ts`.

**Extended (pre-existing, additive only):** `src/lib/musicTherapyTuning.ts`
(seeded records + detailed contrast alongside the existing 3-metric API).

**Modified:** `src/lib/capabilityForge.ts`, `src/lib/vectorMemory.ts`,
`src/lib/musicTherapyResearch.ts`, `src/dream/mutator.ts`, `src/dream/mutator-types.ts`,
`src/dream/engine.ts`, `server.ts`, `src/App.tsx`, `src/components/index.ts`,
`.env.example`, `tests/musicTherapyResearch.test.ts`, `tests/dreamModel.test.ts`,
`tests/vectorMemory.test.ts`.

## 10. Compatibility Notes

- `'local_model'` and `'ollama'` labels remain in their type unions so persisted JSON from
  earlier runs still type-checks; new writes use `'api_model'`/`'api'`.
- The `/api/ollama/*` HTTP surface stays routable (status/chat) so any fleet client that
  calls it keeps working; only the CLI manager is config-gated off by default.
- No existing test fixture relies on the removed forge/embedding defaults.