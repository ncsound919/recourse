# Recourse Mission Control UI — Design Spec
**Date:** 2026-09-03
**Aesthetic:** NASA mission control
**Focus:** Deep-dive views (Lego + Dream Engine), top status strip

---

## Section 1 — Top Mission Status Strip

A persistent strip pinned below the header, styled like a NASA telemetry bar. Updates every poll cycle.

### Layout
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ MISSION STATUS  │  NOMINAL  │  GEN 602  │  E:12.4J  │  DREAM: lucid  │
│ LEGO: v3.0.69  │  SWARM: 6T/25C  │  LEARNER: ep 604  │  UPTIME 2h 41m │
└─────────────────────────────────────────────────────────────────────────────┘
```
- Thin 1px cyan top border on the strip
- Left: blinking NOMINAL / CAUTION / CRITICAL badge (driven by real status thresholds)
- Right: per-subsystem live metrics, compact monospace values
- Color coding: green = nominal, amber = degraded, red = halted
- Background: deep slate (#020617) with subtle gradient

### Logic
- `NOMINAL` when `readinessScore >= 0.85` and no active anomalies
- `CAUTION` when `readinessScore >= 0.6` or `activeAnomaliesCount > 0`
- `CRITICAL` when `readinessScore < 0.6` or `permitNextIteration === false`

### Component
- `MissionStatusStrip` in `Header.tsx` (below the main header bar)
- Polls `/api/recourse/status` + `/api/recourse/subagents/status` every 5s
- Animates only on state transitions (not on every poll)

---

## Section 2 — Dream Engine Deep-Dive

### Zone A — Phase Command Display
Full-width panel at the top:
```
┌─ DREAM ENGINE ───────────────────────────────────────────────────────────────┐
│  ◉ PHASE: lucid_crystallization    ◎ cog. coherence: 0.91  │  cycle: 47  │
│  ● ● ● ● ● ◉   ← 6 phase dots: done=cyan, current=bright pulse, future=slate │
└─────────────────────────────────────────────────────────────────────────────┘
```
- Phase name in large monospace type (16px)
- 6 small dots showing cycle progress, lit/pulse/future states
- Cognitive coherence numeric readout + inline progress bar
- `lastSignalSnapshot` rendered as a compact signal row:
  `SIGNAL │ readiness: 0.9274 │ lego asm: 3 │ learner ep 604 │ cal 0.093`

### Zone B — Thought Stream (left, 60%)
Scrollable list, max 10 visible:
- `domain badge` (color per domain) + `origin badge` (local_model=cyan border, rule_based=slate border)
- Hypothesis text (80 chars, truncated)
- Intensity bar + crystallization readiness %
- `[PASS n]` invariant count (cyan) or `[FAIL]` (red)
- `dt_abc123` ID in dim monospace

### Zone C — Registry (right, 40%)
Table: name | domain | score | time
Empty state: `AWAITING CRYSTALLIZATION` in dim monospace

### Component
- `DreamingEngineView` receives new `MissionControlDreamPanel` sub-component
- Fetches `/api/recourse/dream/status` every 5s
- Phase dots: 6 dots, index `0..5`, current = `phaseIndex` from `PHASE_ORDER.indexOf(currentPhase)`

---

## Section 3 — Lego Composable ML Deep-Dive

### Zone A — Current Mission Header
```
┌─ LEGO NAS  MISSION #21  ──────────────────────────────────────────────┐
│  ACTIVE ASSEMBLY  │ v3.0.69  │ score 0.691  │ flops 736  │ 4 bricks   │
│  READINESS GATE   │ ████████████░░  0.92 / 0.70  ✓ COMMIT ELIGIBLE   │
│  POLICY GRADIENT  │ ▁▂▅█ 0.51→0.20                                     │
└────────────────────────────────────────────────────────────────────────┘
```
- Readiness gate: horizontal bar, threshold line at 70%, bar extends to current readiness value
- Badge: `COMMIT ELIGIBLE` (green) or `GATE BLOCKED` (red) driven by `readinessGate >= 0.7`
- Policy gradient: 4-dot sparkline of recent gradient values from NAS controller state

### Zone B — Brick Composition (left, 50%)
Horizontal chain of connected nodes (not card grid):
```
┌──── FFT ────┐ → ┌── MLP ──┐ → ┌── Conv1D ──┐ → ┌── MoE ──┐
```
- Each node: brick name, type color stripe (top border), score badge
- Real edges with arrows, `contractStatus` shown on hover tooltip
- Node click expands to show params (collapsible)
- Category color coding: transform=cyan, router=purple, memory=amber, loss=rose

### Zone C — NAS Telemetry (right, 50%)
Stack of compact rows:
- `candidates proposed` count + 8-dot sparkline
- `accepted / committed` ratio as fraction
- `sandbox pass rate` horizontal bar
- `system integrity score` number + small ring
- `benchmark score trend` 10-dot sparkline with latest value

### Component
- `SelfAssemblingLegoView` receives new `MissionControlLegoPanel` sub-component
- Fetches `/api/lego/state` every 5s
- `readinessGate` surfaced from `getState().readinessGate`
- Brick chain uses SVG arrows between div nodes

---

## Shared Design Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--cyan-glow` | `0 0 8px rgba(34,211,238,0.4)` | Active states |
| `--amber-glow` | `0 0 8px rgba(251,191,36,0.4)` | Caution states |
| `--critical-red` | `#ef4444` | Halted / FAIL states |
| `--panel-bg` | `#020617` | Mission control panels |
| `--border` | `#0f172a` | Panel borders |
| `--border-bright` | `#1e3a5f` | Active panel borders |
| `--text-primary` | `#f1f5f9` | Primary text |
| `--text-secondary` | `#64748b` | Labels / secondary |
| `--font-mono` | `JetBrains Mono, monospace` | All data values |

---

## Status Badge Thresholds

| Badge | Condition |
|-------|-----------|
| NOMINAL (green pulse) | `readinessScore >= 0.85` AND `activeAnomaliesCount === 0` |
| CAUTION (amber) | `readinessScore >= 0.6` OR `activeAnomaliesCount > 0` |
| CRITICAL (red) | `readinessScore < 0.6` OR `permitNextIteration === false` |
| DREAM ACTIVE (cyan) | `dreamState.isDreamingActive === true` |
| LEGO COMMITTED (green) | `legoAssemblyCount > lastAssemblyCount` |

---

## Implementation Notes

1. All panels poll their respective `/api/` endpoints every **5 seconds** with a 2s debounce on state transitions.
2. No artificial animations — motion only on **real state change** (phase advance, new thought, new assembly).
3. The mission status strip is **always visible** regardless of which tab is active (pinned below header).
4. Existing tab content (Lego, Dream, Swarm views) is **not removed** — the mission-control layout wraps or replaces the existing detail view within those tabs.
5. CSS-only animations for pulse effects (no JS animation loops).
6. `scrollbar-hide` utility used for compact overflow areas.
