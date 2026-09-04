# Recourse Composer — style-driven creative generation

**Status:** foundation (Phase 0) landed in `src/lib/composer/`.
**Goal:** Recourse composes ORIGINAL tracks *"in the vein of"* four studied acts,
deterministically per seed, and delivers them as a DAW-ready `.mid` + a SoundLab
playable `.seq` pocket. Recourse should *learn from its styles and its own
productions* to get better (see Recursive loop below).

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

## Surfaces

- **HTTP (Recourse):** `POST /api/recourse/compose` (guarded write — writes files;
  requires `RECOURSE_API_SECRET`), `GET /api/recourse/compose/styles`. Files land
  under `composer-out/<style>/` (override `RECOURSE_COMPOSE_DIR`).
- **MCP:** `recourse.compose` tool (style/key/major/bpm/bars/seed/title).
- **Library:** importable by any Recourse gene/forge module.

## How you turn output into productions

1. Open the `.mid` in your DAW — this is the **full multi-bar arrangement**
   (harmony, bass, drums, hook), freely editable into a production.
2. Open the `.seq` in SoundLab for the **1-bar pocket** (groove + head chord on
   `bass/keys/lead/kick/snare/hat` layers). Honest limitation: a `.seq` carries one
   pattern's rows and NO voices — it only sounds on layers your kit already has (or
   rows you remap), and SoundLab's step grid is monophonic-per-step, so multi-bar
   progressions belong to the `.mid`, not the `.seq`.

## Recursive improvement (the real "gets better" mechanism)

Autonomy without a signal is theater, so the loop is human-in-the-loop honest:

1. **Generate** a batch of candidates per style over varied seeds/bars.
2. **You rate** each produced track (load the `.mid`, judge, score 1–5 / tag).
3. Recourse **records an episode** `{brief, seed, produced structure, your rating}`
   — the seedable engine means any good seed is exactly reproducible.
4. Recourse **learns** from ratings: high-rated seeds/titles/chord-motion patterns
   are promoted as style priors; low-rated ones are down-weighted. This is where the
   dream/learner + vector-memory already in Recourse store and recombine the
   winning DNA ("get better at Steely Dan complexity").
5. **Iterate.** Ratings accumulate into a per-style memory the composer consults
   before generating, so the system improves on the styles *and its own outputs*.

The seedable engine + rating signal are the scaffolding for this. The learner
episode store + rating intake is the next increment to land on top of Phase 0.

## Next increments (in order)
1. Rating/intake + episode store wiring (start the recursion loop for real).
2. Fuller part model (horns/bg-vox/arrangement-section changes for the SD
   "written charts" trait) and the jasper final-chorus *audio* key-lift.
3. Optional SoundLab injection seam (small Tauri/HTTP hook in soundlab) so a
   `.seq` can be loaded live rather than by file-open.
4. Voice/sample sourcing guidance so SoundLab timbres approach the targets.
