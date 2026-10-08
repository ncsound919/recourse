# Kaggle autonomy — chord-progression training + oncology compute aid

Status: **live as of 2026-10-06.** Auth is green (`djoochie`), the remote drain
job runs every 2 min, and the oncology intake is proven (54 Kaggle datasets +
10 news items entered the signal store on the first brain poll).

## Layer 0 — foundation (must be up for anything to run)

| Service | Port | Launcher | Notes |
|---|---|---|---|
| Chat model (Qwen3.5-2B, llama.cpp) | 11434 | `C:\Users\User\models\start-local.ps1` | multimodal, ctx 8192, `--jinja`. Fixed 2026-10-06: file was UTF-8 **without BOM** so PS 5.1 mis-decode corrupted the parse. Re-saved with BOM. |
| Embeddings (nomic-embed) | 11435 | `C:\Users\User\models\start-embed.ps1` | 768-dim, matches `VECTOR_DIM`. |
| Recourse | 3050 | `INFRASTRUCTURE\recourse\start-recourse.ps1` | safe-boot OFF, all gates open. |
| Deterministic brain | 3210 | `INFRASTRUCTURE\start-deterministic-brain.ps1` | Fixed 2026-10-06: launcher pointed at a deleted path; repointed to `Uplift\Draymond-Orchestrator\agents\deterministic-brain`. Powers genome-council + Kaggle/news intake. |

## Layer 1 — the remote conveyor (autonomous)

| Producer | Cadence | Guard | Lands in |
|---|---|---|---|
| `remote-compute` drain (`server.ts`) | 2 min (`REMOTE_COMPUTE_MS`) | applies only successes | forge artifacts, learner `externalScore`, repair verdicts |
| nightly `remote` step | nightly | skips if one active | learner calibration stress eval (CPU) |
| sleep-compute forge | every forge cycle | 1 batch, 6h fail backoff | specs the local model couldn't ready, re-verified locally |
| dream breadth | ~3h, 7 domains incl. `biotech` | 1 active, 6h fail backoff | hypotheses re-verified in sandbox |
| self-repair diagnose | on stuck goals | — | structured verdict next pass |

**Quota:** CPU jobs only; ~0.01–0.13h wall each; no weekly CPU cap is enforced
(GPU 30h / TPU 20h only). GPU is never touched unless explicitly requested.

### Required Kaggle-side secrets (else remote forge/dream fail closed)

The forge/dream notebooks read `RECOURSE_FORGE_BASE_URL`, `RECOURSE_FORGE_MODEL`
and `RECOURSE_FORGE_API_KEY` from their runtime env, then from Kaggle Secrets.

**This cannot be automated from this machine** (measured 2026-10-06): the Kaggle
CLI has no `secrets` command (`kaggle --help`), the `kaggle` python package ships
only `api`/`cli`/`models`, `kernel-metadata.json` (from `kaggle kernels init`)
has no secrets field, and `POST /v1/secrets.SecretsApiService/ListSecrets` → 404.

So it is a one-time manual step in the Kaggle UI:
1. Sign in as `djoochie` → profile menu → **Settings** → **Secrets** (account-wide
   secret store). Create three secrets named exactly:
   `RECOURSE_FORGE_BASE_URL`, `RECOURSE_FORGE_MODEL`, `RECOURSE_FORGE_API_KEY`.
   (Values: see `INFRASTRUCTURE\recourse\.env` `FORGE_MODEL_*` — do not paste them
   into any tracked file.)
2. Open the kernel `djoochie/recourse-forge-precompute` (or
   `recourse-dream-candidates`) → editor → **Add-ons → Secrets** → attach the
   three secrets to the notebook.
3. The kernels use a stable slug, so attaching once survives future pushes.

Until this is done, the remote forge/dream batches return an honest
"env not configured" and back off 6h (by design).

## Layer 2 — chord-progression model (source: ChordStudio)

The chord work lives in `C:\Users\User\Downloads\BUSINESS\CREATIVE\ChordStudio`
(a native JUCE app), **not** the external `ncsoundlab` repo. Recourse reads
ChordStudio's progression exports; it does not depend on ncsoundlab.

Wired 2026-10-06:
- `src/lib/chordStudioSource.ts` — reads ChordStudio `.progression` JSON
  (`{progression:{name,rootNote,scale,chords:[{name,role,notes}]}}`, its
  documented export) from `%APPDATA%\Chord Studio` (override `CHORDSTUDIO_DATA`),
  derives a fixed feature vector, target = progression `score`.
- `src/lib/composerTraining.ts` — the fallback source: Recourse's own composer
  episodes (`data/composer-learner.json`). `allEpisodes()` added to the learner.
- scheduler job `composer_retrain` (weekly, `COMPOSER_RETRAIN_MS`) — prefers the
  ChordStudio source, falls back to the composer learner, and trains (ridge,
  Kaggle CPU) only when a source yields ≥4 rows with ≥2 distinct targets.

**Target now wired.** As of 2026-10-06 ChordStudio writes its Critic score into
the `.progression` export:
- `Source/music/Progression.h` — `Progression` gains `int score = -1`.
- `Source/music/ProgressionFactory.cpp` — `progressionFromComposition` scores the
  arrangement via `applyStyleLens(critiqueComposition(comp), writerId, styleId)`.
- `Source/app/ProgressionLibraryController.cpp` — `exportProgression` writes
  `score` when `>= 0` (omitted for imported MIDI, which is never engine-scored).
- `Source/music/ProgressionIo.cpp` — `parseProgression` reads `score` back.
- Verified: `ChordTheoryTests` compiled + ran (641 checks, 0 failures) with new
  assertions that generated progressions carry the Critic's own 0..100 score;
  the two JUCE-side files were recompiled via MSBuild (0 errors).

So: export a few scored progressions from ChordStudio to
`%APPDATA%\Chord Studio` (or `%CHORDSTUDIO_DATA%`) and the weekly job trains with
no further Recourse change. Until then it refuses honestly (0 scored files).

**Result (2026-10-06):** a 300-progression engine corpus trains an MLP at
**R² 0.829** (RMSE ~16.8 on a 0–100 score). 20 features (voice-leading leaps,
`leap>=7` violation counts, bass/register collisions, harmonic vocabulary);
features are provided via `chordStudioSource.ts` and the export now carries
`bass`/`styleId`/`writerId`. The remaining ~17% is signal the collapsed export
does not contain (sections/arc, exact penalty weights). Regenerate the corpus
with `ChordProgressionCorpusGen <dir> <n>`.

## Layer 3 — oncology compute aid

- Wired 2026-10-06: `RECOURSE_INTAKE_BRAIN_KAGGLE_QUERIES` (oncology-first) +
  `RECOURSE_INTAKE_BRAIN_NEWS=1` in `.env`. Proven: `POST /intake/brain` →
  `kaggle: ok=true count=54`, `news: ok=true count=10`.
- Biotech dream batches run every ~3h and feed the science/oncology agenda.
- ~12 oncology bridges already exist (`docs/oncology-integration-plan.md`),
  availability-gated.

## Runbook

```
# stack
C:\Users\User\models\start-local.ps1
C:\Users\User\models\start-embed.ps1
INFRASTRUCTURE\start-deterministic-brain.ps1
INFRASTRUCTURE\recourse\start-recourse.ps1

# verify
npm run kaggle:smoke                                  # real kernel round-trip
GET  /api/recourse/compute/remote                     # queue + platforms
GET  /api/recourse/scheduler                          # job heads
GET  /api/recourse/intake/status                      # bySource incl. kaggle
POST /api/recourse/intake/brain                       # pull Kaggle+news now
POST /api/recourse/compute/remote/train/small-model   # {"rows","target",...,"platform":"kaggle"}
POST /api/recourse/compute/remote/drain
```

Mutating routes need `x-api-secret: <RECOURSE_API_SECRET>` (see `.env`).

## Known blockers / decisions

- **Keywire stays on `:3000` (operator decision) and its job stays disabled.**
  Port 3000 is answered by Grafana, so the job can only ever skip. The disable is
  now durable: `server.ts` boot self-arm respects an explicit persisted
  `false` (`isPersistedDisabled`), so it no longer re-enables on restart.
- **Kaggle secrets are a manual UI step** (see above) — not scriptable.
- **ChordStudio now exports its Critic score**; `composer_retrain` activates once
  scored `.progression` files exist (export a few — no code change needed).
- Remote forge/dream need the Kaggle secrets, or they fail closed with a 6h
  backoff (by design).
