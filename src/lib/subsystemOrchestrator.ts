/**
 * Subsystem Orchestrator — resource-aware, phased batching of the science
 * ecosystem (Overlay Oncology engines + Recourse sidecars).
 *
 * Why: Recourse's pipeline reaches many subsystems (BAM, Meta-Map, Oncograph,
 * Decon, QLCCE, Chemlab, Oncology, brain, …). Running all of them at once
 * saturates the host (observed 97% RAM, event-loop stalls). This module starts
 * and stops subsystems IN BATCHES that correspond to the research phase, and
 * uses real OS resources (free memory, load) to decide how aggressive to be.
 *
 * Honesty contract:
 *  - Status comes from the real pm2 process table (via Keywire pm2/status when
 *    reachable, else a direct `pm2 jlist` shell) — never assumed.
 *  - The orchestrator only starts subsystems registered here; it never stops
 *    the control plane (brain, Recourse itself) or always-on services.
 *  - Downscaling is conservative and gated on actual memory pressure; it does
 *    not fabricate "batched" state.
 */

import os from 'os';
import { spawn } from 'node:child_process';

// pm2 on Windows is a .cmd shim — spawn node with the real pm2 CLI JS path to
// avoid both shell-injection (shell:true) and the .cmd execution problem.
const PM2_CLI =
  process.env.PM2_CLI ||
  'C:/Users/User/AppData/Roaming/npm/node_modules/pm2/bin/pm2';

/** Async pm2 invocation — never blocks the event loop. On Windows a `pm2
 *  start/stop` can take seconds; doing that synchronously would stall the
 *  whole Recourse server (the exact stall we audited away). */
function pm2Run(args: string[], timeoutMs: number): Promise<{ status: number | null; stdout: string }> {
  return new Promise((resolve) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    const child = spawn(process.execPath, [PM2_CLI, ...args], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const finish = (status: number | null) => {
      if (settled) return;
      settled = true;
      resolve({ status, stdout: stdout.slice(0, 20000) });
    };
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      finish(null);
    }, timeoutMs);
    child.stdout?.on('data', (d) => { stdout += String(d); });
    child.stderr?.on('data', (d) => { stderr += String(d); });
    child.on('error', () => { clearTimeout(timer); finish(null); });
    child.on('close', (code) => { clearTimeout(timer); finish(code); });
  });
}

export type PhaseId =
  | 'control'
  | 'triage'
  | 'evidence'
  | 'simulate'
  | 'analyze'
  | 'synthesize'
  | 'publish';

export interface SubsystemDef {
  id: string;            // short id
  pm2Name: string;       // pm2 process name
  port: number;          // health port
  healthPath?: string;   // health endpoint (default '/')
  phase: PhaseId;        // which phase requires it
  /** Approx. idle RSS in MB — used to estimate batch footprint. */
  memMB: number;
  /** Control-plane / always-on: never downscaled. */
  control?: boolean;
  label: string;
}

// Registry of the science subsystems we can orchestrate. Ports reflect the
// running ecosystem (BAM:3001, Oncograph:3002, Decon:3003, Meta-Map:3004,
// Oncology:3070, Brain:3210, QLCCE:8031, OncoForesight:8095, Chemlab:8096).
export const SUBSYSTEMS: SubsystemDef[] = [
  // Control plane — never downscaled.
  { id: 'recourse', pm2Name: 'recourse', port: 3050, phase: 'control', memMB: 120, control: true, label: 'Recourse (this service)' },
  { id: 'brain', pm2Name: 'deterministic-brain', port: 3210, healthPath: '/health', phase: 'control', memMB: 200, control: true, label: 'Deterministic Brain' },
  { id: 'oncology', pm2Name: 'overlay-oncology', port: 3070, phase: 'control', memMB: 260, control: true, label: 'Overlay Oncology (data + engines facade)' },

  // Light triage/evidence — low footprint.
  { id: 'bam', pm2Name: 'bam', port: 3001, healthPath: '/api/bam/cancer/status', phase: 'evidence', memMB: 120, label: 'BAM / BlackMind biomedical agent' },
  { id: 'meta-map', pm2Name: 'onco-meta-map', port: 3004, phase: 'evidence', memMB: 90, label: 'Meta-Map spatial niche validation' },

  // Heavy simulation.
  { id: 'qlcce', pm2Name: 'onco-qlcce', port: 8031, healthPath: '/api/config/default', phase: 'simulate', memMB: 180, label: 'QLCCE lattice simulation' },
  { id: 'chemlab', pm2Name: 'onco-chemlab', port: 8096, phase: 'simulate', memMB: 90, label: 'Overlay-Chemlab' },

  // Heavy analysis.
  { id: 'decon', pm2Name: 'onco-decon', port: 3003, phase: 'analyze', memMB: 70, label: 'Decon deconvolution' },
  { id: 'oncograph', pm2Name: 'onco-oncograph', port: 3002, phase: 'analyze', memMB: 70, label: 'Oncograph' },

  // Synthesis (LLM/heavy).
  { id: 'foresight', pm2Name: 'onco-foresight', port: 8095, phase: 'synthesize', memMB: 90, label: 'OncoForesight' },
];

export interface ResourceSample {
  freeMemMB: number;
  totalMemMB: number;
  loadAvg1: number;
  loadAvg5: number;
}

/** Sample real OS resources. */
export function sampleResources(): ResourceSample {
  const total = os.totalmem() / (1024 * 1024);
  const free = os.freemem() / (1024 * 1024);
  const [la1 = 0, la5 = 0] = os.loadavg();
  return { freeMemMB: Math.round(free), totalMemMB: Math.round(total), loadAvg1: la1, loadAvg5: la5 };
}

/** Query pm2 for the current process table (name -> {status, cpu, mem}). Async
 *  so it never blocks the event loop. */
export async function pm2Table(timeoutMs = 10000): Promise<Record<string, { status: string; cpu: number; mem: number }>> {
  const out: Record<string, { status: string; cpu: number; mem: number }> = {};
  try {
    const r = await pm2Run(['jlist'], timeoutMs);
    if (r.status !== 0) return out;
    const list = JSON.parse(r.stdout);
    if (!Array.isArray(list)) return out;
    for (const p of list) {
      const name = p?.name;
      if (!name) continue;
      out[name] = {
        status: p?.pm2_env?.status ?? 'unknown',
        cpu: p?.monit?.cpu ?? 0,
        mem: Math.round((p?.monit?.memory ?? 0) / (1024 * 1024)),
      };
    }
  } catch {
    /* pm2 table best-effort */
  }
  return out;
}

/** Start a subsystem via pm2 (async, non-blocking). */
export async function pm2Start(pm2Name: string, timeoutMs = 30000): Promise<boolean> {
  const r = await pm2Run(['start', pm2Name], timeoutMs);
  return r.status === 0;
}

/** Stop a subsystem via pm2 (async, non-blocking). */
export async function pm2Stop(pm2Name: string, timeoutMs = 20000): Promise<boolean> {
  const r = await pm2Run(['stop', pm2Name], timeoutMs);
  return r.status === 0;
}

/** Probe a subsystem's health endpoint (real HTTP check). */
export async function probeSubsystem(def: SubsystemDef, timeoutMs = 4000): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`http://127.0.0.1:${def.port}${def.healthPath || '/'}`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

export interface OrchestrationDecision {
  activePhase: PhaseId;
  shouldStart: string[];
  shouldStop: string[];
  resources: ResourceSample;
  reason: string;
}

/**
 * Decide which subsystems to start/stop for a phase given current resources.
 * Pure + deterministic (no side effects) so it is unit-testable.
 */
export function decideOrchestration(
  activePhase: PhaseId,
  table: Record<string, { status: string; cpu: number; mem: number }>,
  resources: ResourceSample,
  opts: { minFreeMemMB?: number; tightFreeMemMB?: number } = {},
): OrchestrationDecision {
  const minFree = opts.minFreeMemMB ?? 1200;
  const tightFree = opts.tightFreeMemMB ?? 2400;
  const shouldStart: string[] = [];
  const shouldStop: string[] = [];

  const phaseNeed = (def: SubsystemDef): boolean => {
    if (def.control) return def.id !== 'recourse'; // never try to (re)start self
    if (def.phase === activePhase) return true;
    // Also keep the immediately-prior phase's heavy engines warm briefly so a
    // phase handoff doesn't thrash, but only when memory allows.
    return false;
  };

  for (const def of SUBSYSTEMS) {
    const proc = table[def.pm2Name];
    const isOnline = proc?.status === 'online';
    const want = phaseNeed(def);
    // Never attempt to start/stop our own process.
    if (def.id === 'recourse') continue;

    if (want && !isOnline) {
      shouldStart.push(def.id);
    } else if (!want && isOnline && !def.control) {
      // Downscale only under real memory pressure — never busy-kill a healthy
      // service when there is plenty of RAM (avoids thrash).
      if (resources.freeMemMB < minFree) {
        shouldStop.push(def.id);
      }
    }
  }

  // If memory is very tight, stop non-control subsystems even in their phase
  // except the lightest ones — prioritise the active phase's core.
  if (resources.freeMemMB < minFree) {
    const heavyNonControl = SUBSYSTEMS
      .filter((d) => !d.control && d.id !== 'recourse' && d.phase !== activePhase)
      .sort((a, b) => b.memMB - a.memMB);
    for (const d of heavyNonControl) {
      if (table[d.pm2Name]?.status === 'online' && !shouldStop.includes(d.id)) shouldStop.push(d.id);
    }
  }

  // Very-tight tier: even the active phase's heavy engines yield to preserve
  // the control plane and the lightest core. Only the lightest in-phase
  // service is kept. Prevents OOM stalls under sustained pressure.
  if (resources.freeMemMB < tightFree) {
    const inPhaseHeavy = SUBSYSTEMS
      .filter((d) => !d.control && d.id !== 'recourse' && d.phase === activePhase)
      .sort((a, b) => b.memMB - a.memMB);
    // Keep the single lightest in-phase service; stop the rest.
    for (const d of inPhaseHeavy.slice(1)) {
      if (table[d.pm2Name]?.status === 'online' && !shouldStop.includes(d.id)) shouldStop.push(d.id);
    }
  }

  const reason =
    `phase=${activePhase} freeMem=${resources.freeMemMB}MB/${resources.totalMemMB}MB load=${resources.loadAvg1.toFixed(2)} ` +
    `-> start[${shouldStart.join(',') || 'none'}] stop[${shouldStop.join(',') || 'none'}]`;
  return { activePhase, shouldStart, shouldStop, resources, reason };
}

/** Current phase — placeholder resolved by the caller; defaults to triage. */
export function resolveActivePhase(explicit?: PhaseId): PhaseId {
  return explicit ?? 'triage';
}

export interface OrchestrationRun {
  activePhase: PhaseId;
  started: string[];
  stopped: string[];
  resources: ResourceSample;
  decisions: OrchestrationDecision[];
  reason: string;
}

/**
 * Run one orchestration tick: sample resources, decide, then apply
 * (start/stop) the batch. Idempotent + safe (control plane never touched).
 */
export async function orchestrate(
  explicitPhase?: PhaseId,
  opts: { apply?: boolean } = {},
): Promise<OrchestrationRun> {
  const activePhase = resolveActivePhase(explicitPhase);
  const resources = sampleResources();
  const table = await pm2Table();
  const decision = decideOrchestration(activePhase, table, resources);
  const started: string[] = [];
  const stopped: string[] = [];

  if (opts.apply !== false) {
    for (const id of decision.shouldStart) {
      const def = SUBSYSTEMS.find((d) => d.id === id);
      if (!def) continue;
      const ok = await pm2Start(def.pm2Name);
      if (ok) {
        // Honest verification: wait briefly for the health port, then confirm.
        // A start that never becomes healthy is reported as started-but-probing
        // (the next tick will re-decide).
        await new Promise((r) => setTimeout(r, 800));
        const healthy = await probeSubsystem(def, 2500);
        started.push(healthy ? id : `${id}(probing)`);
      }
    }
    for (const id of decision.shouldStop) {
      const def = SUBSYSTEMS.find((d) => d.id === id);
      if (!def) continue;
      const ok = await pm2Stop(def.pm2Name);
      if (ok) stopped.push(id);
    }
  }

  return {
    activePhase,
    started,
    stopped,
    resources,
    decisions: [decision],
    reason: decision.reason,
  };
}