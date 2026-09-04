/**
 * System snapshot + differential reporting.
 *
 * A SystemSnapshot is a fingerprint of the whole code "system" at a point in
 * time: every registry tool's live (current promoted) version hash/score/pass/
 * self-host status, which generated tools back which capabilities, and the
 * latest external-benchmark solved count. Two snapshots can be diffed to answer
 * "how is the UPGRADED system different from the OLD one" per-tool and in the
 * aggregate — the reports Recourse ships show a real old-vs-new delta, never
 * just the current aggregate.
 *
 * Pure module (no server imports): diff + render are unit-testable.
 */

import type { ToolDomain } from '../types';

export interface ToolStateInSnapshot {
  name: string;
  domain: ToolDomain | string;
  version: string;
  hash: string;
  score: number;
  passed: boolean;
  healthStatus: string;
  selfHosted: boolean;
}

export interface CapabilityAdoptionState {
  capability: string;
  source: 'builtin' | 'selfhosted';
  toolName?: string;
  score?: number;
}

export interface SystemSnapshot {
  /** Label like 'boot-baseline' or 'post-upgrade'. */
  label: string;
  ts: number;
  gen: number;
  tools: ToolStateInSnapshot[];
  capabilities: CapabilityAdoptionState[];
  benchmarkSolved: number | null;
  selfhostedHealthy: number;
  selfhostedTotal: number;
}

export type ToolChangeKind = 'added' | 'removed' | 'upgraded' | 'health_changed';

export interface ToolChange {
  name: string;
  domain: ToolDomain | string;
  kind: ToolChangeKind;
  old?: ToolStateInSnapshot;
  next?: ToolStateInSnapshot;
}

export interface CapabilityChange {
  capability: string;
  from: string;
  to: string;
}

export interface SystemDiff {
  addedTools: ToolChange[];
  removedTools: ToolChange[];
  upgradedTools: ToolChange[];
  healthChangedTools: ToolChange[];
  capabilityChanges: CapabilityChange[];
  benchmarkSolvedDelta: number | null;
  selfhostedDelta: number;
  totals: { before: number; after: number };
}

/** Deterministic ordering key so identical systems fingerprint the same. */
export function snapshotFingerprint(s: SystemSnapshot): string {
  const toolKeys = s.tools
    .map((t) => `${t.name}|${t.hash}|${t.passed ? 'p' : 'f'}|${t.score}`)
    .sort()
    .join('\n');
  const capKeys = s.capabilities
    .map((c) => `${c.capability}=${c.source}:${c.toolName ?? '-'}:${c.score ?? '-'}`)
    .sort()
    .join('\n');
  return [toolKeys, capKeys, String(s.benchmarkSolved), `${s.selfhostedHealthy}/${s.selfhostedTotal}`].join('||');
}

function healthLabel(passed: boolean, selfHosted: boolean, health: string): string {
  if (selfHosted) return `selfhosted/${health}`;
  return passed ? `passed/${health}` : `failed/${health}`;
}

/** Diff two snapshots (old = earlier baseline, next = current upgraded state). */
export function diffSnapshots(oldS: SystemSnapshot, nextS: SystemSnapshot): SystemDiff {
  const oldByName = new Map(oldS.tools.map((t) => [t.name, t]));
  const nextByName = new Map(nextS.tools.map((t) => [t.name, t]));
  const names = new Set([...oldByName.keys(), ...nextByName.keys()]);

  const addedTools: ToolChange[] = [];
  const removedTools: ToolChange[] = [];
  const upgradedTools: ToolChange[] = [];
  const healthChangedTools: ToolChange[] = [];

  for (const name of names) {
    const a = oldByName.get(name);
    const b = nextByName.get(name);
    if (!a && b) {
      addedTools.push({ name, domain: b.domain, kind: 'added', next: b });
      continue;
    }
    if (a && !b) {
      removedTools.push({ name, domain: a.domain, kind: 'removed', old: a });
      continue;
    }
    if (!a || !b) continue;
    if (a.hash !== b.hash || a.version !== b.version) {
      upgradedTools.push({ name, domain: b.domain, kind: 'upgraded', old: a, next: b });
    } else {
      const oldH = healthLabel(a.passed, a.selfHosted, a.healthStatus);
      const newH = healthLabel(b.passed, b.selfHosted, b.healthStatus);
      if (oldH !== newH) {
        healthChangedTools.push({ name, domain: b.domain, kind: 'health_changed', old: a, next: b });
      }
    }
  }

  const oldCaps = new Map(oldS.capabilities.map((c) => [c.capability, c]));
  const newCaps = new Map(nextS.capabilities.map((c) => [c.capability, c]));
  const capNames = new Set([...oldCaps.keys(), ...newCaps.keys()]);
  const capabilityChanges: CapabilityChange[] = [];
  for (const cap of capNames) {
    const a = oldCaps.get(cap);
    const b = newCaps.get(cap);
    const from = a ? `${a.source}:${a.toolName ?? '-'}@${a.score ?? '-'}` : 'absent';
    const to = b ? `${b.source}:${b.toolName ?? '-'}@${b.score ?? '-'}` : 'absent';
    if (from !== to) capabilityChanges.push({ capability: cap, from, to });
  }

  const benchmarkSolvedDelta =
    oldS.benchmarkSolved != null && nextS.benchmarkSolved != null
      ? nextS.benchmarkSolved - oldS.benchmarkSolved
      : null;

  return {
    addedTools,
    removedTools,
    upgradedTools,
    healthChangedTools,
    capabilityChanges,
    benchmarkSolvedDelta,
    selfhostedDelta: nextS.selfhostedHealthy - oldS.selfhostedHealthy,
    totals: { before: oldS.tools.length, after: nextS.tools.length },
  };
}

/** Render a compact markdown summary of an old-vs-new system diff. */
export function renderUpgradeMarkdown(diff: SystemDiff, opts?: { fromLabel?: string; toLabel?: string }): string {
  const fromLabel = opts?.fromLabel ?? 'baseline';
  const toLabel = opts?.toLabel ?? 'current';
  const lines: string[] = [];
  lines.push(`# Recourse Upgrade Delta — ${fromLabel} → ${toLabel}`);
  lines.push('');
  lines.push(`Tools: ${diff.totals.before} → ${diff.totals.after} (net ${diff.totals.after - diff.totals.before})`);
  if (diff.benchmarkSolvedDelta !== null) {
    lines.push(`Benchmark solved Δ: ${diff.benchmarkSolvedDelta > 0 ? '+' : ''}${diff.benchmarkSolvedDelta}`);
  }
  lines.push(`Self-hosted healthy Δ: ${diff.selfhostedDelta > 0 ? '+' : ''}${diff.selfhostedDelta}`);
  lines.push('');
  if (diff.upgradedTools.length > 0) {
    lines.push(`## Upgraded tools (${diff.upgradedTools.length})`);
    for (const u of diff.upgradedTools) {
      const a = u.old!, b = u.next!;
      lines.push(
        `- **${u.name}** ${a.version} → ${b.version} | score ${a.score} → ${b.score} | ${healthLabel(a.passed, a.selfHosted, a.healthStatus)} → ${healthLabel(b.passed, b.selfHosted, b.healthStatus)}`
      );
    }
    lines.push('');
  }
  if (diff.addedTools.length > 0) {
    lines.push(`## Added (${diff.addedTools.length})`);
    for (const a of diff.addedTools) {
      const t = a.next!;
      lines.push(`- **${a.name}** (${t.domain}) v${t.version} score ${t.score} ${healthLabel(t.passed, t.selfHosted, t.healthStatus)}`);
    }
    lines.push('');
  }
  if (diff.removedTools.length > 0) {
    lines.push(`## Removed (${diff.removedTools.length})`);
    for (const r of diff.removedTools) lines.push(`- **${r.name}** (was v${r.old?.version})`);
    lines.push('');
  }
  if (diff.healthChangedTools.length > 0) {
    lines.push(`## Health changes (${diff.healthChangedTools.length})`);
    for (const h of diff.healthChangedTools) {
      const a = h.old!, b = h.next!;
      lines.push(`- **${h.name}** ${healthLabel(a.passed, a.selfHosted, a.healthStatus)} → ${healthLabel(b.passed, b.selfHosted, b.healthStatus)}`);
    }
    lines.push('');
  }
  if (diff.capabilityChanges.length > 0) {
    lines.push(`## Capability adoption (dogfood) changes`);
    for (const c of diff.capabilityChanges) lines.push(`- ${c.capability}: ${c.from} → ${c.to}`);
    lines.push('');
  }
  const noop =
    diff.addedTools.length + diff.removedTools.length + diff.upgradedTools.length +
    diff.healthChangedTools.length + diff.capabilityChanges.length === 0 &&
    (diff.benchmarkSolvedDelta === null || diff.benchmarkSolvedDelta === 0) &&
    diff.selfhostedDelta === 0;
  if (noop) lines.push('No material change between these snapshots.');
  return lines.join('\n');
}
