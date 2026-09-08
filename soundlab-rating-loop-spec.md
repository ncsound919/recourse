# SoundLab Human-Rating Loop — Data Schema & UI Spec

**Target repo:** `ncsound919/ncsoundlab` · **Status:** draft for implementation
**Goal:** blind pairwise A/B rating of evolved variations, fully local-first, whose output feeds an Elo/Bradley-Terry ranking that becomes the next evolve generation's parent selection — a real human-in-the-loop evolutionary loop.

**Design basis:** pairwise forced-choice is the reliability standard for single-rater music preference (the 2025 15k-comparison benchmark used pairwise binary choices, not absolute scores); MUSHRA-style hidden reference anchors the scale; ratings capture the dimensions producers judge (quality, novelty, naturalness, rhythm feel) [cite:55][cite:54][cite:75].

---

## 1. New module layout

```
src/lib/rating/
  types.ts            // all interfaces below (re-exported from src/types.ts if you prefer one types file)
  ratingStore.ts      // IndexedDB persistence (extends src/lib/db.ts pattern)
  ratingSession.ts    // session state machine: setup -> active -> summary
  pairBuilder.ts      // builds blind pairs w/ hidden anchors + attention checks
  elo.ts              // online Elo update + export of standings
  ratingExport.ts     // JSON export envelope (download via Blob)
src/components/
  RatingSessionView.tsx       // the whole modal flow
  RatingPairPlayer.tsx        // blind A/B playback + forced choice
  RatingSessionSummary.tsx    // end-of-session stats + export + parent CTA
```

**Reuses, does not duplicate:** `CompareEngine.ts` (A/B playback), `evolutionEngine.ts` (variation metadata), `analytics.ts` (`trackEvent`), `db.ts` (IndexedDB open/version pattern). No new audio code — the player wraps the existing CompareEngine with a blinding layer.

---

## 2. Data schema

### 2.1 Core types (`src/lib/rating/types.ts`)

```ts
// ---------- Stable variation identity (survives across sessions) ----------
/** Fingerprint of the synthesis params that produced this sound.
 *  SHA-256 of the canonical JSON of the param object, hex, 16 chars.
 *  Two variations with identical params share an id — that is intentional:
 *  the Elo table keys on it so re-renders accumulate rating, not duplicate rows. */
export type ParamHash = string; // e.g. 'a3f9c2b81e77d045'

export interface VariationDescriptor {
  paramHash: ParamHash;
  params: Record<string, number | string | boolean>; // the actual synth params (copied, not referenced)
  seedId: string;            // id of the parent/seed patch this evolved from
  generation: number;         // 0 = seed itself, 1+ = evolve batch depth
  origin: 'evolve' | 'seed' | 'hand_tuned';
  renderDurationMs: number;  // length of the rendered loop that is played
  createdAt: number;         // epoch ms
}

// ---------- One rated pair ----------
export type PairKind = 'normal' | 'hidden_anchor' | 'attention_check';

export interface RatingPair {
  pairId: string;            // crypto.randomUUID() — never Math.random
  sessionId: string;
  indexInSession: number;    // 0-based; powers fatigue analysis
  kind: PairKind;
  a: VariationDescriptor;
  b: VariationDescriptor;
  // Rendering order is decided at build time (pairBuilder) so the pair is
  // reproducible from this record alone. For 'attention_check', a.paramHash === b.paramHash.
  insertedAt: number;
}

// ---------- One choice ----------
export type RatingChoiceValue = 'A' | 'B';

export interface DimensionTags {
  /** Producer-vocabulary dimensions, multi-select, optional (empty array = none). */
  tags: Array<
    | 'knock'            // transient punch / attack
    | 'warmth'           // low-mid body
    | 'movement'        // modulation/evolution over the loop
    | 'character'       // distinctiveness vs generic
    | 'usable_in_beat'  // would keep it in a track as-is
  >;
  /** One-line free note, optional, capped at 200 chars (no PII prompt). */
  note?: string;
}

export interface RatingChoice {
  pairId: string;
  sessionId: string;
  choice: RatingChoiceValue;
  confidence: 1 | 2 | 3;          // 1 = coin-flip, 3 = sure — optional, default 2
  dimensions: DimensionTags;
  listenMsA: number;              // accumulated playback ms actually heard for A
  listenMsB: number;
  decidedAt: number;              // epoch ms
  elapsedMs: number;              // time from pair start to decision (fatigue signal)
  // Anchors/checks are stored but flagged so elo.ts can exclude them from updates:
  attentionPassed?: boolean;      // attention_check pairs only
}

// ---------- Session ----------
export type SessionSource = 'evolution_panel' | 'compare_engine' | 'manual';

export interface RatingSession {
  sessionId: string;            // crypto.randomUUID()
  schemaVersion: 1;
  appVersion: string;           // from the same source autosave writes (e.g. '1.1.0')
  startedAt: number;
  endedAt?: number;
  source: SessionSource;
  seedId: string;
  plannedPairs: number;         // how many pairs were queued
  completedPairs: number;
  skippedPairs: number;         // hard-capped at 2 per session (see 3.4)
  ratingSystem: 'elo_128'       // bump the string when the update rule changes
  ;
  // Audio conditions at session time — affects reproducibility of judgments:
  contextLatencyHint: string;   // 'playback' | 'interactive' — what the AudioContext used
  outputDeviceLabel?: string;   // navigator.mediaDevices label if available (optional)
}

// ---------- Standings (derived, recomputed on demand) ----------
export interface EloStanding {
  paramHash: ParamHash;
  rating: number;               // start 1200, K=32 (see 5.1)
  wins: number;
  losses: number;
  exposures: number;            // total times played (win, lose, or skipped)
  lastSeenAt: number;
  seedId: string;
  generation: number;
}
```

### 2.2 IndexedDB stores (extend `src/lib/db.ts`, bump DB version)

Two new object stores in the existing database:

| Store | Key | Indexes | Notes |
|---|---|---|---|
| `rating_sessions` | `sessionId` | `by_startedAt`, `by_seedId` | One row per session |
| `rating_choices` | `pairId` | `by_sessionId`, `by_paramHash` | One row per decided pair (skips recorded with `choice` absent — see 3.4 — stored as `{ skipped: true }` variant) |

Plus one derived table:

| Store | Key | Indexes | Notes |
|---|---|---|---|
| `rating_elo` | `paramHash` | `by_seedId`, `by_rating` | Standings; rebuilt from `rating_choices` if deleted (source of truth is the raw choices) |

**Rules:**
- Raw choices are the ledger — Elo rows are a cache. A "rebuild standings" function re-derives every Elo row by replaying all choices in timestamp order (same bit-for-bit replay philosophy as the Recourse learner ledger).
- Retention: keep the newest 200 sessions; on write, LRU-trim sessions and orphan choices (cascade via `by_sessionId` index). Never trim `rating_elo`.
- All writes follow the existing store patterns: request-token guards, try/catch, no silent data loss.

### 2.3 Export envelope (`ratingExport.ts`)

"Export ratings" produces a single JSON file, named
`soundlab-ratings-YYYYMMDD-HHmm.json`:

```ts
export interface RatingExportEnvelope {
  format: 'soundlab.ratings.v1';
  exportedAt: number;
  appVersion: string;
  sessions: RatingSession[];
  choices: RatingChoice[];     // all, across sessions, chronological
  standings: EloStanding[];    // current derived table at export time
}
```

Download via `Blob` + anchor click (no server, no upload). The envelope is what we analyze together — I'll compute win rates per param region, fatigue drift (choice latency vs `indexInSession`), and dimension-tag correlates of wins.

### 2.4 Analytics events (`analytics.ts` — honesty pattern)

Only session-level metadata goes to analytics; **never** audio params of user content, never free-text notes:

- `rating_session_started` `{ source, seed_id_kind, planned_pairs }`
- `rating_pair_submitted` `{ kind, index_in_session, has_tags }` — no choice value (that's user data, stays local)
- `rating_session_completed` `{ completed, skipped, duration_s }`
- `rating_exported` `{ session_count }`
- `rating_parent_promoted` `{ generation }` — when the winner is sent back as evolve parent

No `purchased` event from this flow, ever — same integrity rule as the demo gate fix (`unlock_clicked` vs `purchased`).

---

## 3. UI spec

### 3.1 `RatingSessionView` — the flow

Three states, one modal (match the app's existing modal chrome; keyboard-friendly; `Escape` = pause, not destroy):

**Setup screen**
- Source selector: "Rate latest evolve batch" (pulls the 24-variation render from `evolutionEngine.ts`) or "Rate two specific patches" (manual).
- Session length: 10 / 20 / 40 pairs (default 10 — ~5–7 minutes; rater fatigue is the #1 threat to signal quality).
- Seed selection is implied by the batch; shown as a locked label.
- "Start blind session" → `pairBuilder` runs (3.5) → active screen.
- Existing Elo standings shown if any ("continuing a lineage with 3 prior sessions, 42 rated pairs").

**Active screen** → `RatingPairPlayer` (3.2–3.4), one pair at a time.

**Summary screen** → `RatingSessionSummary` (3.6).

### 3.2 `RatingPairPlayer` — blind A/B

Layout: two large buttons side by side, **no labels other than A and B**. Variation names, param hashes, and origins are NOT rendered anywhere during the active pair. After the session ends, a reveal screen shows every pair's identities (blind during, transparent after — keeps trust without biasing choices).

**Playback:**
- A/B buttons are play/switch: pressing B while A plays does a 30 ms crossfade switch (reuses `CompareEngine`'s switch behavior; no click, no dead air).
- Loop toggle, default ON, loops `renderDurationMs`.
- Both tracks play from the same start position on switch (same 0-point) — comparing "where you are in the loop" must never differ.
- Keyboard: `1` / `A` = play A, `2` / `B` = play B, `Space` = replay from top, `S` = skip (if skips remain), `Enter` = confirm choice.

**Listen gating:** the "A" / "B" *choice* buttons stay disabled until BOTH sides have accumulated ≥ 60% of `renderDurationMs` of listening. This is the minimum-barrier against snap judgments; track `listenMsA/B` by summing playback spans (a small `listenTracker` helper inside the component, reset per pair).

**Forced choice:** two big "Choose A" / "Choose B" buttons activate after gating. No neutral option (pairwise research standard) — skipping is a separate, capped action (3.4).

**Post-choice micro-form (single screen, ≤ 5 seconds to clear):**
- Dimension tags: the 5 producer tags as toggle chips (0..n, all optional).
- Confidence: 3-segment control, default middle.
- Optional note: single input, 200-char cap.
- "Continue →" advances; everything except Continue is skippable by just clicking Continue.

### 3.3 Anchors and checks (the MUSHRA borrow)

- **Hidden anchor (`hidden_anchor` pairs, ~1 in 5):** one side is the unmutated seed render, relabeled as a normal variation. If the seed consistently loses to its own children, evolution is genuinely working — that's your headline metric. If the seed *wins*, the anchor catches a degenerate batch before it pollutes the Elo table.
- **Attention check (`attention_check` pairs, exactly 1 per 10):** both sides are the same render. Any choice "passes"; the real check is listen-time — if `listenMsA + listenMsB < 60%` of gating on the one pair where they're identical, the session's later pairs get flagged low-confidence in analysis (we do this in the offline analysis, not by nagging the user in the UI).
- Anchors and checks are excluded from Elo updates (they measure the rater, not the sound).

### 3.4 Skips

- Max 2 skips per session. Skip stores a `RatingChoice` variant with `skipped: true` and no choice value, excluded from Elo, but kept in the export (skip patterns are signal too — "nothing in this pair was close to usable").
- Skip button shows the remaining budget ("Skip (2 left)") and is disabled at 0.

### 3.5 `pairBuilder` — queue construction

```
buildPairs(batch: VariationDescriptor[], sessionLen: number, seed: VariationDescriptor, priorStandings?: EloStanding[]): RatingPair[]
```

Rules (all deterministic given a session-scoped seed so a session is reproducible from `sessionId`):
1. Shuffle batch (Fisher-Yates over a seeded PRNG — the app's existing deterministic PRNG, not Math.random).
2. Take variations greedily but balance exposures: prefer pairing high-Elo vs low-Elo (strong-vs-weak explores; equal-Elo refines) in a 60/40 mix — this is a cheap bandit-flavored schedule without implementing a real one in v1.
3. Insert a `hidden_anchor` pair every 5th pair; insert exactly one `attention_check` at pair index `floor(sessionLen/2)`.
4. Randomize A/B side assignment per pair.
5. Never pair two sounds that differ only by a param the rater can't hear (e.g. inactive chain toggles) — if the param diff is empty after filtering to audible params, skip that pairing and pull the next variation.

### 3.6 `RatingSessionSummary`

- Session stats: pairs completed, skips, mean decision latency, tag frequency.
- **Lineage board:** current Elo standings for this seed's lineage (top 10 by rating, with exposures) — this is where blind lifting stops: names/hashes now visible.
- **"Use #1 as next evolve parent" CTA** → sets `evolutionEngine` parent params and deep-links to the Evolution panel (`#stage=` hash pattern already exists). Fires `rating_parent_promoted`.
- **"Export ratings JSON"** → writes the envelope (2.3) and fires `rating_exported`.
- **"Rate another batch"** → back to setup, prior standings now influence pairing (3.5 rule 2).

---

## 4. Elo update rule (`elo.ts`)

Standard online Elo, the smallest rule that produces a usable ranking from ~20+ pairs:

```
E_A' = E_A + K * (1 - 1 / (1 + 10^((E_B - E_A) / 400)))   // if A wins
E_B' = E_B + K * (0 - ...)                                 // symmetric; K=32
```

- Start 1200, K = 32 flat in v1 (`ratingSystem: 'elo_128'` is the version stamp — hmm, rename to `'elo_v1_k32'`; the string exists so future rule changes can't silently mix tables).
- Confidence 1 choices count at half K (K=16); confidence 3 at full K. This is a light proxy for vote entropy without a full Bayesian model.
- Only `normal` pairs update ratings.
- Rebuild path: `rebuildStandings()` replays all `normal` choices chronologically over a fresh table — used if the derived store is ever lost, and as the determinism test (replay must match the live table bit-for-bit).

## 5. Testing plan (matches the repo's coverage-gate discipline)

**Unit (`elo.test.ts`, `pairBuilder.test.ts`):**
- Elo: symmetric sum conservation (E_A + E_B constant per match), confidence-weighted K, anchor/check exclusion, rebuild-replay equals live table.
- pairBuilder: anchor cadence, exactly-one attention check per 10, no same-param normal pairs, seeded determinism (same session seed → same queue).
- ratingStore: index queries, cascade trim at 200 sessions, skip-variant round-trip.

**Component (`RatingPairPlayer.test.tsx` — mock Tone/CompareEngine per the existing mock pattern):**
- Gating: choice buttons disabled before 60% listen on both sides.
- Listen accumulation counts crossfade-switched spans correctly.
- Post-choice form: tags optional, note capped, Continue advances.
- Skip budget enforcement.
- Blind guarantee: no paramHash/variation-name text reachable in the rendered DOM during active state (assert the querySelector is empty — this is the anti-theater test for the whole feature).

**E2E (Playwright, port discipline per existing setup):** full 3-pair session (2 normal + 1 anchor), summary shows correct counts, export downloads a parseable v1 envelope.

**Coverage gate:** the new-code gate (`check-new-code-coverage.mjs`) applies automatically; new files should land at 100% on the scheduling/gating/elo paths as usual.

## 6. Implementation order

1. `types.ts` + `ratingStore.ts` + DB version bump (schema first, everything else depends on it)
2. `elo.ts` + tests (pure, no UI, immediately testable)
3. `pairBuilder.ts` + tests (pure)
4. `RatingPairPlayer` + gating/listenTracker (the only genuinely new UX)
5. `RatingSessionView` + `RatingSessionSummary` + export
6. Evolution-panel CTA wiring + e2e
7. After first real export: we run the offline analysis together (win rates by param region, fatigue curves, tag correlates) and tune pair scheduling from what the data says — v2 candidates: per-dimension Elo, Bradley-Terry MLE instead of online Elo, and MAP-Elites niches over the param space so the "top-K parents" become diverse by construction rather than by rank alone.

## 7. Explicitly out of scope (v1)

- No server, no accounts, no telemetry of choices — ratings are the user's private musical taste, stored locally, exported only on demand.
- No automated metric (FAD/embedding distance) in the loop — research is clear these correlate poorly with preference; they can join later as a *correlate* column in analysis, never as a gate.
- No rater identity beyond device. Multi-rater aggregation (with consent, shared exports) is a v3 conversation.
