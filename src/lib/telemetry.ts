/**
 * Environment telemetry — the "senses" for machine/git/filesystem state.
 *
 * Recourse's autopilot previously had no sense of whether the box was busy or
 * whether the repo had uncommitted changes. These sensors feed scheduling
 * decisions (do not launch heavy work on a saturated host) and the intake
 * stream. Everything is real: machine stats from `os`, git state from the real
 * `git` binary, filesystem events from `fs.watch`. A failure to read git is
 * reported, never guessed.
 */
import os from 'node:os';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

export interface MachineSnapshot {
  cpus: number;
  loadAvg: number[];
  freeMemBytes: number;
  totalMemBytes: number;
  usedMemPct: number;
  uptimeSec: number;
  platform: string;
}

export function machineSnapshot(): MachineSnapshot {
  const total = os.totalmem();
  const free = os.freemem();
  return {
    cpus: Math.max(1, os.cpus().length),
    loadAvg: os.loadavg().map((v) => Math.round(v * 100) / 100),
    freeMemBytes: free,
    totalMemBytes: total,
    usedMemPct: total > 0 ? Math.round(((total - free) / total) * 1000) / 10 : 0,
    uptimeSec: Math.round(os.uptime()),
    platform: `${os.platform()} ${os.release()}`,
  };
}

export interface GitSnapshot {
  ok: boolean;
  branch?: string;
  head?: string;
  dirtyCount?: number;
  error?: string;
}

/** Count changed paths in `git status --porcelain` output (pure). */
export function parseGitStatusCount(porcelain: string): number {
  return String(porcelain || '')
    .split('\n')
    .filter((l) => l.trim().length > 0).length;
}

export function gitSnapshot(repoRoot: string): GitSnapshot {
  const run = (args: string[]) =>
    spawnSync('git', args, { cwd: repoRoot, encoding: 'utf-8', windowsHide: true, timeout: 5000 });
  try {
    const head = run(['rev-parse', '--short', 'HEAD']);
    if (head.status !== 0) {
      return { ok: false, error: (head.stderr || 'git rev-parse failed').toString().trim().slice(0, 200) };
    }
    const branch = run(['rev-parse', '--abbrev-ref', 'HEAD']);
    const status = run(['status', '--porcelain']);
    return {
      ok: true,
      head: head.stdout.trim(),
      branch: branch.status === 0 ? branch.stdout.trim() : undefined,
      dirtyCount: parseGitStatusCount(status.stdout),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface WorkWindowDecision {
  allowHeavy: boolean;
  reason: string;
}

/**
 * Decide whether to launch heavy autonomous work now. Pure: same snapshot +
 * thresholds => same decision. Defaults are conservative so a busy machine is
 * not made worse.
 */
export function pickWorkWindow(
  m: MachineSnapshot,
  opts: { maxLoadPerCpu?: number; minFreeMemPct?: number } = {},
): WorkWindowDecision {
  const maxLoadPerCpu = opts.maxLoadPerCpu ?? 0.9;
  const minFreeMemPct = opts.minFreeMemPct ?? 15;
  const loadPerCpu = m.cpus > 0 ? (m.loadAvg[0] ?? 0) / m.cpus : 0;
  const freeMemPct = 100 - m.usedMemPct;
  if (loadPerCpu > maxLoadPerCpu) {
    return { allowHeavy: false, reason: `load ${loadPerCpu.toFixed(2)}/cpu exceeds ${maxLoadPerCpu}` };
  }
  if (freeMemPct < minFreeMemPct) {
    return { allowHeavy: false, reason: `free memory ${freeMemPct.toFixed(1)}% below ${minFreeMemPct}%` };
  }
  return { allowHeavy: true, reason: `load ${loadPerCpu.toFixed(2)}/cpu, free mem ${freeMemPct.toFixed(1)}%` };
}

export interface TelemetrySnapshot {
  at: number;
  machine: MachineSnapshot;
  git: GitSnapshot;
  workWindow: WorkWindowDecision;
}

export function collectTelemetry(repoRoot: string, at = Date.now()): TelemetrySnapshot {
  const machine = machineSnapshot();
  return { at, machine, git: gitSnapshot(repoRoot), workWindow: pickWorkWindow(machine) };
}

// ---------------------------------------------------------------------------
// Filesystem watcher (recursive where supported)
// ---------------------------------------------------------------------------

export interface FsWatchHandle {
  stop(): void;
  watching: string[];
}

/**
 * Watch directories recursively and invoke `onEvent` (debounced per path) for
 * change events. Best-effort: a directory that cannot be watched is skipped and
 * reported in the returned handle, never silently claimed.
 */
export function createFsWatcher(
  dirs: string[],
  onEvent: (ev: { dir: string; filename: string; eventType: string }) => void,
  opts: { debounceMs?: number } = {},
): FsWatchHandle {
  const debounceMs = opts.debounceMs ?? 500;
  const watchers: fs.FSWatcher[] = [];
  const watching: string[] = [];
  const lastSeen = new Map<string, number>();

  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      const w = fs.watch(dir, { recursive: true }, (eventType, filename) => {
        const key = `${dir}:${filename ?? ''}:${eventType}`;
        const now = Date.now();
        const prev = lastSeen.get(key) ?? 0;
        if (now - prev < debounceMs) return;
        lastSeen.set(key, now);
        onEvent({ dir, filename: String(filename ?? ''), eventType: String(eventType) });
      });
      watchers.push(w);
      watching.push(dir);
    } catch {
      /* directory not watchable — skip, do not claim it */
    }
  }

  return {
    watching,
    stop() {
      for (const w of watchers) {
        try {
          w.close();
        } catch {
          /* best effort */
        }
      }
    },
  };
}
