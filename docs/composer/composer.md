# Recourse Composer — style-driven creative generation

**Status:** Phase 0 foundation + learner loop + steely-dan deepening landed in
`src/lib/composer/`.
**Goal:** Recourse composes ORIGINAL tracks *"in the vein of"* four studied acts,
deterministically per seed, and delivers them as a DAW-ready `.mid` + a SoundLab
playable `.seq` pocket. Recourse *learns from its styles and its own productions*
via the human-rated learner loop below.

This file is the written study + the build contract. The machine-consumable form
is the style lexicons in `src/lib/composer/lexicons.ts` (what the engine reads).

---

## What "in the vein of" means here — and honestly doesn't

These are **original, evocative compositions**, not reproductions or covers. The
four acts differ enormously; each is encoded as a *style lexicon* (DNA knobs),
not as a transcription database. The generator samples from that DNA to explore
new material while staying recognizably in the idiom.

Realism anchors (the operator's re-typed goals are respected):
- **Jasper = soul BALLAD**, quiet-storm/gospel side — *not* the uptempo Isley funk.
- **Steely Dan** = the harmonic-complexity engine (mu chords, chromatic half-step
  cadences, altered colors). "Getting better at it" is the recursion goal, not a
  fixed preset.
- **D'Angelo × Robert Glasper** = neo-soul intelligence: gospel/blues vamp ×
  jazz reharmonization (static minor vamps, maj7/6-9/m9/13 color, quartal/upper
  structure, behind-the-beat pocket).
- **Airplane** = psychedelic rock: modal vamps/drones, open triadic harmony,
  build-and-release dynamics (the "White Rabbit" bolero-march is the noted
  exception, not the default).

## Four studied style lexicons (what the research distilled)

Every `StyleLexicon` in `lexicons.ts` carries:
`keys` (favored tonal centers), `bpm` range, `qualityWeights` (chord-color
vocabulary), `rootSteps` (semitone root-motion — the harmonic engine), `archetypes`
(fixed multi-bar seeds), `voicing` (spread register), `bassOctave`,
`signature` (device flags), plus a shared 16-step `Groove` per style.

| Style | Harmonic engine | Signature device |
|---|---|---|
| `steely-dan` | chromatic half-step + circle motion; mu/maj7#11/alt-dominant/ m9-m11 colors | mu(add2) adjacent-tone voicing; half-step cadences; written-chart form feel |
| `jasper-ballad` | extended triads over I/vi/ii/V & gospel IV→I | **final-chorus upward key lift**; held-note space; 60–84 BPM |
| `dangelo-glasper` | static / two-chord minor vamps, high hold-bar & static-vamp chance | one-chord vamp + jazz reharm color; 55–88 BPM |
| `airplane` | modal drones (i–bVII, mixolydian I–bVII–IV), high static-vamp | triadic openness, no jazz extensions; ~96–124 BPM |

Provenance note: the underlying research drew on published harmonic analysis for
Steely Dan (e.g. the mu-chord rule; the half-step "Aja" engine), and for the other
three on well-corroborated style/personnel/tempo/arrangement documentation where
note-for-note charts are not public. Details in `tests/composer` + lexicon
comments. **Sonic judgment is still yours** — a rules engine approximates voicing
taste and micro-timing; it does not equal it.

## Architecture

```
brief {style,key?,major?,bpm?,bars 4|8|16,seed?,title?}
   │
   ▼  composer.compose()
resolve style lexicon + key/tempo/loop  ─┐
generate chords (1/bar, loop-closed)     ├─ deterministic on seed
realize events (keys voicing, bass,      │
  16-step groove, sparse lead hook)      ┘
   │
   ├─► encode/midi  : Standard MIDI File (DAW)          .mid
   └─► encode/seq   : SoundLab v2 pocket                 .seq
```

`Track` is the single realized model both encoders consume, so MIDI and grid stay
consistent. Public entry: `src/lib/composer/index.ts` (`compose`, `composeToOutcome`,
`toMidiBytes`, `encodeToSeq`). Unit coverage in `tests/composer/composer.test.ts`
(determinism, bar-length, timeline bounds, MIDI parse-back validity, `.seq` schema,
style differentiation).

## Steely Dan deepening (first fidelity pass)

Beyond the base lexicon, steely-dan opts into a specialized voicer
(`lexicons.ts` `voicer: 'steely'`, `theory.ts`):
- **mu(add2) voicing rule** — the added 2nd is voiced *adjacent* (whole tone) to
  the 3rd in the same octave, per Becker & Fagen's documented rule, not a generic
  spread that separates them (`voiceMuChord`).
- **Rootless dominant/altered voicings** — 7/9/13/7b9/7#9/7#11/7b13/7sus keys
  layer voices only the upper structure; the bass owns the root so the color
  tensions ring (`voiceRootless`).
- Altered-dominant color raised in the steely quality palette.
Covered by `tests/composer/voicing.test.ts`.

## Recursive improvement (the "gets better" loop) — IMPLEMENTED

Ratings are the only signal; there is no fake autonomy:

1. **Generate** candidates per style over varied seeds/bars (`POST /api/recourse/compose`
   or MCP `recourse.compose`).
2. **You rate** each produced track (`POST /api/recourse/compose/rate` or MCP
   `recourse.rate_track`): 1–5 (+ optional tags).
3. Recourse records an **episode** keyed by the reproducible `(style,seed,bars)`
   and captures the exact chords/root-motion (`ComposerLearner` in `learner.ts`).
4. The learner derives **quality-weight biases** (boost what you rate ≥4, penalize
   ≤2) and every subsequent compose **steers toward them** via
   `composeWithLearner` / `adjustedLexicon`. Bypass per-call with `learn:false`.
5. **Inspect** the state: `GET /api/recourse/compose/learned` (leaderboard +
   per-style adjustments) or MCP `recourse.learned`; `GET .../suggest` proposes
   seeds near ones you liked. `data/composer-learner.json` persists across runs.

So the more you rate real loads of the `.mid`, the better the composer gets at
each style — including at Steely Dan complexity.

## Surfaces

- **HTTP (Recourse):** `POST /api/recourse/compose` (guarded write — writes files;
  requires `RECOURSE_API_SECRET`), `GET /api/recourse/compose/styles`,
  `POST /api/recourse/compose/rate` (guarded), `GET /api/recourse/compose/learned`,
  `GET /api/recourse/compose/suggest`. Files land under `composer-out/<style>/`
  (override `RECOURSE_COMPOSE_DIR`). Body `mode: 'arr'` composes a non-looping
  written-out arc instead of a loop.
- **MCP:** `recourse.compose` (mode loop|arr), `recourse.rate_track`, `recourse.learned`.
- **Library:** importable by any Recourse gene/forge module.

## Signature nuances in the creation process

Per-style loop nuances are realized into the parts (`lexicons.ts` `nuance` +
`realize`): **Steely Dan** written-chart horn stabs + stacked bg-vox accents;
**Jasper** sustained string/pad wash + bg-vox (gospel); **D'Angelo** laid-back
behind-the-beat timing on harmonic/melodic parts (drums stay tight) + a dynamic
climax swell; **Airplane** build-and-release dynamics across the loop.
Covered by `tests/composer/nuance.test.ts`.

## Arrangement mode (`arr:`) — the non-looping arc

Section-changes and the final key-lift can't live in a self-closing loop, so they
are delivered by `composeArrangement` / `mode:'arr'`: a written-out arc of
`intro → A → bridge (new changes — the SD "written charts" trait) → final chorus
→ outro`, over 16 bars. Jasper's **final-chorus whole-step key lift** is applied
to the final section (`sections[].lift`). Arrangement output is **`.mid` only**
(SoundLab's `.seq` cannot hold a multi-bar progression). Covered by
`tests/composer/arrange.test.ts`.

## How you turn output into productions

1. Open the `.mid` in your DAW — this is the **full multi-bar arrangement**
   (harmony, bass, drums, hook), freely editable into a production.
2. Open the `.seq` in SoundLab for the **1-bar pocket** (groove + head chord on
   `bass/keys/lead/kick/snare/hat` layers). Honest limitation: a `.seq` carries one
   pattern's rows and NO voices — it only sounds on layers your kit already has (or
   rows you remap), and SoundLab's step grid is monophonic-per-step, so multi-bar
   progressions belong to the `.mid`, not the `.seq`.

## Next increments (in order)
1. Voice/sample sourcing guidance so SoundLab timbres approach the targets.
2. Optional SoundLab injection seam (small Tauri/HTTP hook in soundlab) so a
   `.seq` can be loaded live rather than by file-open.
3. Richer section-specific arrangement (per-section tempo/groove changes, real
   horn/solo sections over the SD per-soloist "new changes" trait).
