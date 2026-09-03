# Recourse Mission Control UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a NASA mission-control aesthetic to the Recourse dashboard: a top mission status strip (always visible), a mission-control layout for the Dream Engine view, and a mission-control layout for the Lego NAS view.

**Architecture:** Three focused components. `MissionStatusStrip` polls status + swarm endpoints and renders a compact telemetry strip. `DreamMissionPanel` wraps the Dream Engine view with a phase command display, thought stream, and registry. `LegoMissionPanel` wraps the Lego view with a readiness gate bar, brick composition chain, and NAS telemetry. All CSS is inline Tailwind — no new stylesheets.

**Tech Stack:** React + Tailwind CSS (existing), lucide-react icons, `fetch` polling. No new dependencies.

---

## File Map

| Action | File |
|---------|------|
| Create | `src/components/MissionStatusStrip.tsx` |
| Modify | `src/components/index.ts` (export MissionStatusStrip) |
| Modify | `src/App.tsx` (add MissionStatusStrip below header) |
| Modify | `src/components/DreamingEngineView.tsx` (add mission header + reorganize layout) |
| Modify | `src/components/SelfAssemblingLegoView.tsx` (add mission header + reorganize layout) |
| Modify | `src/components/GenerationTicker.tsx` (minor: add `scrollbar-hide` class alias for consistent overflow) |

---

## Task 1: MissionStatusStrip Component

**Files:**
- Create: `src/components/MissionStatusStrip.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';
import React, { useState, useEffect, useRef } from 'react';

interface StatusData {
  generation: number;
  readinessScore: number;
  uptimeSeconds: number;
  activeAnomaliesCount: number;
  permitNextIteration: boolean;
  dreamState?: { isDreamingActive: boolean; currentPhase: string; tick: number };
  artifacts?: any[];
  selfRepair?: { activeAnomaliesCount: number };
}

interface SwarmData {
  subTeamStates?: Array<{ teamId: string; cycleCount: number; completedTasks: number }>;
  totalSwarmTasksCompleted: number;
}

function formatUptime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
}

function statusBadge(readiness: number, anomalies: number, permitNext: boolean): {
  label: string; color: string; bg: string; border: string; dot: string
} {
  if (readiness < 0.6 || permitNext === false) {
    return { label: 'CRITICAL', color: 'text-rose-400', bg: 'bg-rose-950', border: 'border-rose-800', dot: 'bg-rose-500' };
  }
  if (readiness < 0.85 || anomalies > 0) {
    return { label: 'CAUTION', color: 'text-amber-400', bg: 'bg-amber-950', border: 'border-amber-800', dot: 'bg-amber-500' };
  }
  return { label: 'NOMINAL', color: 'text-emerald-400', bg: 'bg-emerald-950', border: 'border-emerald-800', dot: 'bg-emerald-500' };
}

export const MissionStatusStrip: React.FC = () => {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [swarm, setSwarm] = useState<SwarmData | null>(null);
  const prevBadgeRef = useRef<string>('');

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const [sRes, swRes] = await Promise.all([
          fetch('/api/recourse/status').then(r => r.json()),
          fetch('/api/recourse/subagents/status').then(r => r.json()),
        ]);
        if (!alive) return;
        if (sRes?.status) setStatus(sRes.status);
        if (swRes?.swarmStatus) setSwarm(swRes.swarmStatus);
      } catch {}
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (!status) return null;

  const anomalies = status.selfRepair?.activeAnomaliesCount ?? 0;
  const badge = statusBadge(status.readinessScore ?? 0, anomalies, status.permitNextIteration !== false);
  const totalCompleted = swarm?.subTeamStates?.reduce((a, t) => a + t.completedTasks, 0) ?? 0;
  const totalCycles = swarm?.subTeamStates?.reduce((a, t) => a + t.cycleCount, 0) ?? 0;

  return (
    <div className="border-t border-cyan-500/40 bg-slate-950/90">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
        <div className="flex items-center gap-4 font-mono text-[11px] overflow-x-auto scrollbar-none">
          {/* Status badge */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded border ${badge.bg} ${badge.border} shrink-0`}>
            <span className={`relative flex h-2 w-2`}>
              {badge.label === 'NOMINAL' && (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </>
              )}
              {badge.label === 'CRITICAL' && <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500 animate-pulse"></span>}
              {badge.label === 'CAUTION' && <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>}
            </span>
            <span className={`font-bold tracking-wider ${badge.color}`}>{badge.label}</span>
          </div>

          {/* Separator */}
          <span className="text-slate-700 shrink-0">│</span>

          {/* Gen */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-slate-500">GEN</span>
            <span className="text-cyan-300 font-bold">{status.generation ?? '—'}</span>
          </div>

          <span className="text-slate-700 shrink-0">│</span>

          {/* Readiness */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-slate-500">R:</span>
            <span className={status.readinessScore >= 0.85 ? 'text-emerald-400' : status.readinessScore >= 0.6 ? 'text-amber-400' : 'text-rose-400'}>
              {status.readinessScore != null ? `${(status.readinessScore * 100).toFixed(1)}%` : '—'}
            </span>
          </div>

          <span className="text-slate-700 shrink-0">│</span>

          {/* Dream */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-slate-500">DREAM:</span>
            {status.dreamState?.isDreamingActive ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></span>
                <span className="text-purple-300">
                  {status.dreamState.currentPhase.replace(/_/g, ' ').toUpperCase().slice(0, 16)}
                </span>
              </>
            ) : (
              <span className="text-slate-600">OFF</span>
            )}
          </div>

          <span className="text-slate-700 shrink-0">│</span>

          {/* Lego */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-slate-500">LEGO:</span>
            <span className="text-amber-300">
              {status.artifacts?.length ?? 0} asm
            </span>
          </div>

          <span className="text-slate-700 shrink-0">│</span>

          {/* Swarm */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-slate-500">SWARM:</span>
            <span className="text-indigo-300">{totalCycles}C/{totalCompleted}T</span>
          </div>

          <span className="text-slate-700 shrink-0">│</span>

          {/* Uptime */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-slate-500">UP:</span>
            <span className="text-slate-300">{formatUptime(status.uptimeSeconds ?? 0)}</span>
          </div>

          {/* Anomalies */}
          {anomalies > 0 && (
            <>
              <span className="text-slate-700 shrink-0">│</span>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-rose-400 animate-pulse">⚠ {anomalies} DEFECT{anomalies > 1 ? 'S' : ''}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Export from index.ts**

Add to `src/components/index.ts`:
```ts
export { MissionStatusStrip } from './MissionStatusStrip';
```

- [ ] **Step 3: Add to App.tsx**

In `src/App.tsx`, after the Header component renders, add MissionStatusStrip:
```tsx
<Header ... />
<MissionStatusStrip />
<DeterminismBanner status={status} />
<MetricsOverview status={status} />
```

The exact insertion point is after line ~829 in the render block, after the `</header>` closing tag but before `<DeterminismBanner>`.

Search for `DeterminismBanner status={status}` and insert `<MissionStatusStrip />` on the line before it.

- [ ] **Step 4: Verify**

Open `http://localhost:3050` — the mission status strip should appear below the header, showing: NOMINAL/CAUTION/CRITICAL badge, GEN count, Readiness %, Dream phase, Lego assemblies, Swarm cycles/tasks, Uptime. All values update every 5 seconds.

- [ ] **Step 5: Commit**

```bash
git add src/components/MissionStatusStrip.tsx src/components/index.ts src/App.tsx
git commit -m "feat: add MissionStatusStrip (NASA telemetry bar)"
```

---

## Task 2: Dream Engine Mission Control Layout

**Files:**
- Modify: `src/components/DreamingEngineView.tsx`

The existing `DreamingEngineView` has ~445 lines. We will add a **Mission Control panel** as the first section inside the view's return, above the existing controls. We will not remove existing content — the mission panel is a new top zone.

- [ ] **Step 1: Read the current render return**

Search for `return (` in DreamingEngineView.tsx (around line 200) and note the structure. The component returns a `<div>` with the controls and thought list. We will insert the mission control header **before** the existing content.

The key data we need is already available from `dreamState`:
- `dreamState.currentPhase`, `dreamState.dreamCyclesCompleted`, `dreamState.cognitiveCoherence`
- `dreamState.lastSignalSnapshot`
- `dreamState.recentThoughts` (thought stream)
- `dreamState.registry` (crystallized genes)

- [ ] **Step 2: Add mission control panel inside the existing component**

Find the `return (` line and the first child `<div>` inside it. Insert this block **as the first child of the main container div**, before the existing content:

```tsx
// === MISSION CONTROL ZONE A: Phase Command Display ===
{dreamState && (
  <div className="mb-6 rounded-xl border border-cyan-800/60 bg-slate-950 overflow-hidden">
    {/* Top border accent */}
    <div className="h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />
    <div className="px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono text-slate-500 uppercase tracking-widest">DREAM ENGINE</span>
          {/* 6 phase dots */}
          <div className="flex items-center gap-1.5">
            {['rem_counterfactual_sim','synaptic_pruning','cross_pollination','theorem_induction','lucid_crystallization','memory_consolidation'].map((phase, idx) => {
              const PHASE_ORDER = ['rem_counterfactual_sim','synaptic_pruning','cross_pollination','theorem_induction','lucid_crystallization','memory_consolidation'];
              const currentIdx = PHASE_ORDER.indexOf(dreamState.currentPhase);
              const isCurrent = idx === currentIdx;
              const isDone = idx < currentIdx;
              return (
                <span key={phase} className={`w-2 h-2 rounded-full transition-all ${
                  isDone ? 'bg-cyan-400' : isCurrent ? 'bg-cyan-300 animate-pulse' : 'bg-slate-700'
                }`} title={phase.replace(/_/g, ' ')} />
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-4 font-mono text-[11px]">
          <span className="text-slate-500">CYCLE <span className="text-cyan-300">{dreamState.dreamCyclesCompleted}</span></span>
          <span className="text-slate-500">TICK <span className="text-cyan-300">{dreamState.tick}</span></span>
          <span className="text-slate-500">COG <span className={dreamState.cognitiveCoherence >= 0.8 ? 'text-emerald-400' : 'text-amber-400'}>
            {dreamState.cognitiveCoherence.toFixed(3)}
          </span>
        </div>
      </div>

      {/* Phase name */}
      <div className="text-xl font-mono font-bold text-cyan-200 tracking-wide mb-3">
        {dreamState.currentPhase.replace(/_/g, ' ').toUpperCase()}
      </div>

      {/* Signal snapshot */}
      {dreamState.lastSignalSnapshot && (
        <div className="flex items-center gap-1 font-mono text-[10px] text-slate-400">
          <span className="text-slate-600 uppercase tracking-widest">SIGNAL</span>
          <span className="text-slate-600 mx-1">│</span>
          {dreamState.lastSignalSnapshot.readinessScore != null && (
            <><span className="text-slate-500">r:</span><span className="text-emerald-400">{(dreamState.lastSignalSnapshot.readinessScore * 100).toFixed(1)}%</span><span className="text-slate-600 mx-1">│</span></>
          )}
          {dreamState.lastSignalSnapshot.learnerEpisode != null && (
            <><span className="text-slate-500">ep:</span><span className="text-purple-300">{dreamState.lastSignalSnapshot.learnerEpisode}</span><span className="text-slate-600 mx-1">│</span></>
          )}
          {dreamState.lastSignalSnapshot.learnerCalibration != null && (
            <><span className="text-slate-500">cal:</span><span className="text-amber-300">{dreamState.lastSignalSnapshot.learnerCalibration.toFixed(3)}</span><span className="text-slate-600 mx-1">│</span></>
          )}
          {dreamState.lastSignalSnapshot.legoAssemblyCount != null && (
            <><span className="text-slate-500">lego:</span><span className="text-amber-300">{dreamState.lastSignalSnapshot.legoAssemblyCount}</span></>
          )}
        </div>
      )}

      {/* Phase progress bar */}
      <div className="mt-3 h-1 bg-slate-900 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-cyan-600 to-purple-500 transition-all duration-700"
          style={{ width: `${(dreamState.dreamCyclesCompleted / Math.max(1, dreamState.tick)) * 100}%` }}
        />
      </div>
    </div>
    {/* Bottom border accent */}
    <div className="h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />
  </div>
)}
```

- [ ] **Step 3: Reorganize Zone B/C below the mission panel**

Find the existing thought list rendering (the `recentThoughts.map(...)` block). Wrap it in a 2-column grid:
- Left 60%: Thought stream (existing list)
- Right 40%: Registry (existing crystallized genes table)

Replace the existing thought list wrapper with:
```tsx
<div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
  {/* Thought stream — left 60% */}
  <div className="lg:col-span-3 space-y-2">
    <h3 className="text-[11px] font-mono text-slate-500 uppercase tracking-widest">THOUGHT STREAM</h3>
    {/* existing thought mapping here — unchanged */}
  </div>

  {/* Registry — right 40% */}
  <div className="lg:col-span-2 space-y-2">
    <h3 className="text-[11px] font-mono text-slate-500 uppercase tracking-widest">CRYSTALLIZED GENES ({dreamState.registry.length})</h3>
    {/* existing registry mapping — unchanged */}
  </div>
</div>
```

The exact change: find the `<div className="space-y-2">` that wraps `recentThoughts.map` and the registry, and replace it with the grid wrapper above.

- [ ] **Step 4: Verify**

Navigate to the Dream tab. The mission control zone A should appear at the top with: phase name, 6 dots (current lit cyan pulse), cycle/tick/cog numbers, signal snapshot row, progress bar. Below it: thought stream on left (60%), registry on right (40%).

- [ ] **Step 5: Commit**

```bash
git add src/components/DreamingEngineView.tsx
git commit -m "feat: add mission control layout to DreamingEngineView (phase display, thought stream, registry grid)"
```

---

## Task 3: Lego NAS Mission Control Layout

**Files:**
- Modify: `src/components/SelfAssemblingLegoView.tsx`

The existing Lego view has a large data table + DAG visualization. We will add a mission control header as the first section inside the view, above the existing content.

- [ ] **Step 1: Understand the existing data shape**

From the live API (`/api/lego/state`), the key fields are:
- `currentAssembly`: `{ name, generation, bricks: [{id, name, category}], edges: [], totalFlops, totalLatencyMs }`
- `nasController`: `{ episodes, candidateProposalsCount, acceptedAssembliesCount, policyGradients: number[] }`
- `lastSandboxReport`: `{ passedSandbox, peakFlops, durationMs }`
- `registry`: `Array<{ version, benchmarkScore, assembly: { topologicalOrder } }>`
- `systemIntegrityScore`: number

We also have a `readinessGate` field added in the engine.

- [ ] **Step 2: Add mission control header**

Find the `return (` in `SelfAssemblingLegoView.tsx`. Insert the following as the **first child** of the main container div:

```tsx
// === MISSION CONTROL ZONE A: Lego NAS Command Header ===
{legoState && (
  <div className="mb-6 rounded-xl border border-amber-800/60 bg-slate-950 overflow-hidden">
    <div className="h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
    <div className="px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono text-slate-500 uppercase tracking-widest">LEGO NAS</span>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-800">
            MISSION #{(legoState.nasController?.episodes ?? 0)}
          </span>
        </div>
        <div className="flex items-center gap-4 font-mono text-[11px]">
          <span className="text-slate-500">PROPOSED <span className="text-amber-300">{legoState.nasController?.candidateProposalsCount ?? 0}</span></span>
          <span className="text-slate-500">ACCEPTED <span className="text-emerald-400">{legoState.nasController?.acceptedAssembliesCount ?? 0}</span></span>
          <span className="text-slate-500">INTEGRITY <span className={legoState.systemIntegrityScore >= 0.9 ? 'text-emerald-400' : 'text-amber-400'}>{((legoState.systemIntegrityScore ?? 0) * 100).toFixed(1)}%</span></span>
        </div>
      </div>

      {/* Current assembly summary */}
      {legoState.currentAssembly && (
        <div className="flex items-center gap-3 font-mono text-[11px] mb-3">
          <span className="text-slate-500">ACTIVE:</span>
          <span className="text-amber-200 font-bold">{legoState.currentAssembly.name}</span>
          <span className="text-slate-600">│</span>
          <span className="text-slate-500">v{legoState.registry?.[0]?.version ?? '—'}</span>
          <span className="text-slate-600">│</span>
          <span className="text-slate-500">FLOPS <span className="text-cyan-300">{legoState.currentAssembly.totalFlops}</span></span>
          <span className="text-slate-600">│</span>
          <span className="text-slate-500">BRICKS <span className="text-cyan-300">{legoState.currentAssembly.bricks?.length ?? 0}</span></span>
          <span className="text-slate-600">│</span>
          <span className="text-slate-500">LATENCY <span className="text-cyan-300">{legoState.currentAssembly.totalLatencyMs?.toFixed(2) ?? '—'}ms</span></span>
        </div>
      )}

      {/* Readiness gate bar */}
      {(() => {
        const readiness = legoState.readinessGate ?? 0;
        const gate = 0.7;
        const eligible = readiness >= gate;
        return (
          <div className="mb-2">
            <div className="flex items-center justify-between font-mono text-[10px] mb-1">
              <span className="text-slate-500 uppercase tracking-wider">READINESS GATE</span>
              <div className="flex items-center gap-2">
                <span className={readiness >= gate ? 'text-emerald-400' : 'text-rose-400'}>
                  {readiness.toFixed(3)} / {gate.toFixed(2)}
                </span>
                <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                  eligible ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-rose-950 text-rose-300 border border-rose-800'
                }`}>
                  {eligible ? '✓ COMMIT ELIGIBLE' : '✗ GATE BLOCKED'}
                </span>
              </div>
            </div>
            <div className="relative h-2 bg-slate-900 rounded-full overflow-hidden">
              {/* Gate line */}
              <div className="absolute top-0 bottom-0 w-px bg-slate-500 z-10" style={{ left: `${gate * 100}%` }} title="0.70 gate" />
              {/* Bar */}
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  eligible ? 'bg-gradient-to-r from-cyan-600 to-emerald-500' : 'bg-rose-600'
                }`}
                style={{ width: `${Math.min(100, readiness * 100)}%` }}
              />
            </div>
          </div>
        );
      })()}

      {/* Policy gradient sparkline */}
      {legoState.nasController?.policyGradients?.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-slate-600 uppercase tracking-wider shrink-0">POLICY GRAD</span>
          <div className="flex items-end gap-0.5 h-4">
            {legoState.nasController.policyGradients.slice(-8).map((g, i) => {
              const max = Math.max(...legoState.nasController.policyGradients.slice(-8));
              const h = max > 0 ? (Math.abs(g) / max) * 16 : 0;
              return (
                <div
                  key={i}
                  className={`w-1.5 rounded-sm ${g >= 0 ? 'bg-emerald-500/70' : 'bg-rose-500/70'}`}
                  style={{ height: `${Math.max(2, h)}px` }}
                  title={`${g.toFixed(3)}`}
                />
              );
            })}
          </div>
          <span className="text-[10px] font-mono text-slate-600">
            → {legoState.nasController.policyGradients[legoState.nasController.policyGradients.length - 1]?.toFixed(2) ?? '—'}
          </span>
        </div>
      )}
    </div>
    <div className="h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
  </div>
)}
```

- [ ] **Step 3: Reorganize brick composition and telemetry**

Find the existing brick display (the `currentAssembly.bricks.map(...)` block). Wrap it in a 2-column grid with the NAS telemetry on the right:
- Left: Brick composition chain (existing)
- Right: NAS telemetry rows (new)

Replace the brick container div with:
```tsx
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  {/* Brick composition chain */}
  <div>
    <h3 className="text-[11px] font-mono text-slate-500 uppercase tracking-widest mb-3">BRICK COMPOSITION CHAIN</h3>
    {/* existing bricks mapping — unchanged */}
  </div>

  {/* NAS Telemetry */}
  <div className="space-y-2">
    <h3 className="text-[11px] font-mono text-slate-500 uppercase tracking-widest mb-3">NAS TELEMETRY</h3>
    {/* Candidates sparkline */}
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-mono text-slate-600 w-20 shrink-0">CANDIDATES</span>
      <span className="text-[11px] font-mono text-amber-300">{legoState.nasController?.candidateProposalsCount ?? 0}</span>
    </div>
    {/* Sandbox result */}
    {legoState.lastSandboxReport && (
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-slate-600 w-20 shrink-0">SANDBOX</span>
        <span className={`text-[11px] font-mono ${legoState.lastSandboxReport.passedSandbox ? 'text-emerald-400' : 'text-rose-400'}`}>
          {legoState.lastSandboxReport.passedSandbox ? 'PASSED' : 'FAILED'} · {legoState.lastSandboxReport.peakFlops} flops · {legoState.lastSandboxReport.durationMs?.toFixed(2) ?? '—'}ms
        </span>
      </div>
    )}
    {/* System integrity */}
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-mono text-slate-600 w-20 shrink-0">INTEGRITY</span>
      <span className={`text-[11px] font-mono ${(legoState.systemIntegrityScore ?? 0) >= 0.9 ? 'text-emerald-400' : 'text-amber-400'}`}>
        {((legoState.systemIntegrityScore ?? 0) * 100).toFixed(1)}%
      </span>
    </div>
    {/* Registry depth */}
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-mono text-slate-600 w-20 shrink-0">REGISTRY</span>
      <span className="text-[11px] font-mono text-amber-300">{legoState.registry?.length ?? 0} assemblies</span>
    </div>
    {/* Benchmark scores */}
    {legoState.registry?.slice(0, 5).map((entry, i) => (
      <div key={i} className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-slate-600 w-20 shrink-0">{entry.version}</span>
        <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500/70 rounded-full"
            style={{ width: `${(entry.benchmarkScore ?? 0) * 100}%` }}
          />
        </div>
        <span className="text-[10px] font-mono text-slate-400 w-10 text-right">{(entry.benchmarkScore ?? 0).toFixed(2)}</span>
      </div>
    ))}
  </div>
</div>
```

- [ ] **Step 4: Verify**

Navigate to the Lego tab. The mission control header should appear at top: amber border, phase name, mission number, proposed/accepted/integrity counters, current assembly summary, readiness gate bar with 0.70 line, policy gradient sparkline. Below: brick chain on left, NAS telemetry on right.

- [ ] **Step 5: Commit**

```bash
git add src/components/SelfAssemblingLegoView.tsx
git commit -m "feat: add mission control layout to SelfAssemblingLegoView (readiness gate, policy sparkline, telemetry grid)"
```

---

## Task 4: Polish — scrollbar-hide for all overflow areas

**Files:**
- Modify: `src/components/GenerationTicker.tsx`

- [ ] **Step 1: Update scrollbar-hide class**

In `GenerationTicker.tsx`, change `scrollbar-none` (non-standard) to `scrollbar-hide` (standard Tailwind):
```tsx
// Change: className="scrollbar-none" → className="scrollbar-hide"
```

- [ ] **Step 2: Verify**

Run `npx tsc --noEmit` to ensure no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/GenerationTicker.tsx
git commit -m "fix: use scrollbar-hide instead of scrollbar-none"
```

---

## Spec Coverage Check

| Spec Requirement | Task |
|----------------|------|
| Mission status strip always visible | Task 1 |
| NOMINAL/CAUTION/CRITICAL badge with real thresholds | Task 1 |
| Gen, readiness, dream phase, lego, swarm, uptime | Task 1 |
| Dream phase command display with 6 dots | Task 2 |
| Cognitive coherence numeric + bar | Task 2 |
| lastSignalSnapshot signal row | Task 2 |
| Thought stream left 60% / registry right 40% | Task 2 |
| Lego mission header with mission # | Task 3 |
| Readiness gate bar with 0.70 threshold line | Task 3 |
| Policy gradient sparkline | Task 3 |
| Brick chain left / NAS telemetry right | Task 3 |
| All panels poll every 5s | Tasks 1-3 |
| CSS-only pulse animations | Tasks 1-3 |
| Status badge logic (NOMINAL/CAUTION/CRITICAL thresholds) | Task 1 |

All spec requirements are covered. No gaps.
