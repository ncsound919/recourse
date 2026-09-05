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

/* -------------------------------------------------------------------------- */
/* Plain-language summary — the human "what changed, and why it matters".     */
/*                                                                             */
/* Tool names (e.g. CODI_CYCLOMATIC_481c, BIOT_GC_9e0f) mean nothing to a     */
/* non-expert, so this renderer explains the change in everyday terms: what   */
/* kind of work the new/upgraded tool does, which area it belongs to, and     */
/* whether it is actually passing. It is derived from real diff data only —   */
/* never padded, and it says plainly when nothing material changed.           */
/* -------------------------------------------------------------------------- */

/** Everyday label per domain — the "what area of work" in plain English. */
const DOMAIN_PLAIN: Record<string, string> = {
  math: 'math & formulas',
  coding: 'general programming & algorithms',
  biotech: 'biology / drug-discovery logic',
  systemic: 'systems & queue/capacity planning',
  neuro_symbolic: 'AI reasoning & symbol logic',
  cyber_defense: 'security & threat detection',
  quantum_sim: 'quantum-computing simulations',
};

/** Short, human title for a tool based on its (id-derived) kind, or its name. */
export function toolKindLabel(name: string): string {
  // The tool name encodes its kind, e.g. CODI_CYCLOMATIC_481c -> cyclomatic
  // pressure scorer, QUAN_QUBIT_8f62 -> qubit fidelity, BIOT_GC_9e0f -> gc skew.
  const m = name.toLowerCase().match(/(cyclomatic|token|entropy|fidelity|qubit|skew|gc_?content|lagrange|queue|pressure|contradiction|entanglement|amino|sanitiz|anomaly|zscore|idempoten|reverse|cache|dijkstra|matrix|prime|route|lru)/);
  if (!m) return 'a tool';
  const stem = m[1];
  const kinds: Record<string, string> = {
    cyclomatic: 'a code-complexity checker',
    token: 'a text/repetition analyzer',
    entropy: 'a randomness detector',
    fidelity: 'a quantum-quality tracker',
    qubit: 'a quantum-circuit validator',
    skew: 'a DNA sequence-analyzer',
    'gc_?content': 'a DNA composition analyzer',
    lagrange: 'a numerical math estimator',
    queue: 'a workload / capacity forecaster',
    pressure: 'a bottleneck / saturation scorer',
    contradiction: 'a logic rule-checker',
    entanglement: 'a quantum-connection checker',
    amino: 'a biology (protein) lookup tool',
    sanitiz: 'a security input-cleaner',
    anomaly: 'an anomaly / outlier detector',
    zscore: 'a statistical outlier detector',
    idempoten: 'a repeat-safety guard',
    reverse: 'a text-reversal utility',
    cache: 'a caching / memory helper',
    dijkstra: 'a path-finding helper',
    matrix: 'a matrix-math helper',
    prime: 'a number-theory helper',
    route: 'a routing / planning helper',
    lru: 'a cache / eviction helper',
  };
  for (const [pat, label] of Object.entries(kinds)) {
    if (stem.includes(pat)) return label;
  }
  return 'a new tool';
}

/** Describe a single tool change in plain terms. `describe` may map a tool
 *  name to a human sentence; when omitted the renderer falls back to the
 *  domain + kind of work. */
export function plainToolLine(
  kind: 'added' | 'upgraded' | 'removed' | 'fixed' | 'health',
  name: string,
  domain: ToolDomain | string,
  opts?: { describe?: (name: string) => string; healthNow?: string; healthBefore?: string },
): string {
  const area = DOMAIN_PLAIN[domain] ?? String(domain).replace(/_/g, ' ');
  const what = opts?.describe?.(name) ?? toolKindLabel(name);
  switch (kind) {
    case 'added':
      return `- **Added** — ${area}: ${what}.`;
    case 'upgraded':
      return `- **Improved** — ${area}: ${what} was rebuilt to a newer version.`;
    case 'removed':
      return `- **Removed** — ${area}: ${what} is no longer in the registry.`;
    case 'fixed': {
      const before = opts?.healthBefore && opts.healthBefore !== opts.healthNow
        ? ` (was ${opts.healthBefore})` : '';
      return `- **Fixed** — ${area}: ${what}${before}.`;
    }
    case 'health':
    default:
      return `- **Health change** — ${area}: ${what} now reports ${opts?.healthNow ?? 'different'} health.`;
  }
}

/** Render a short, human-friendly summary of the diff. Designed to be read in
 *  a minute: what got added, improved, fixed, and whether the system is
 *  healthier — no hashes, no version strings, no scores. */
export function renderPlainLanguageSummary(
  diff: SystemDiff,
  opts?: {
    describe?: (name: string) => string;
    maxItems?: number;
  },
): string {
  const cap = opts?.maxItems ?? 8;
  const describe = opts?.describe;
  const out: string[] = [];

  const toolCount = diff.totals.after - diff.totals.before;
  const lines: string[] = [];

  if (diff.addedTools.length > 0) {
    lines.push('New tools added:');
    for (const a of diff.addedTools.slice(0, cap)) {
      lines.push(plainToolLine('added', a.name, a.domain, { describe }));
    }
    if (diff.addedTools.length > cap) lines.push(`...and ${diff.addedTools.length - cap} more.`);
  }
  if (diff.upgradedTools.length > 0) {
    lines.push('Tools rebuilt to newer versions:');
    for (const u of diff.upgradedTools.slice(0, cap)) {
      lines.push(plainToolLine('upgraded', u.name, u.domain, { describe }));
    }
    if (diff.upgradedTools.length > cap) lines.push(`...and ${diff.upgradedTools.length - cap} more.`);
  }
  if (diff.healthChangedTools.length > 0) {
    const healthLines: string[] = [];
    for (const h of diff.healthChangedTools.slice(0, cap)) {
      const fixed = h.next?.passed && !h.old?.passed;
      healthLines.push(
        plainToolLine(fixed ? 'fixed' : 'health', h.name, h.domain, {
          describe,
          healthNow: h.next?.healthStatus,
          healthBefore: h.old?.healthStatus,
        }),
      );
    }
    lines.push('Health changes (things that started/failed working):');
    lines.push(...healthLines);
  }

  if (diff.benchmarkSolvedDelta !== null && diff.benchmarkSolvedDelta !== 0) {
    const n = Math.abs(diff.benchmarkSolvedDelta);
    lines.push(
      diff.benchmarkSolvedDelta > 0
        ? `The system now solves ${n} more external benchmark problem${n === 1 ? '' : 's'}.`
        : `The system now solves ${n} fewer external benchmark problem${n === 1 ? '' : 's'}.`,
    );
  }
  if (diff.selfhostedDelta !== 0) {
    const n = Math.abs(diff.selfhostedDelta);
    lines.push(
      diff.selfhostedDelta > 0
        ? `Recourse is now running ${n} more of its own functions on self-built tools.`
        : `Recourse is now running ${n} fewer of its own functions on self-built tools.`,
    );
  }

  const anyChange =
    diff.addedTools.length + diff.removedTools.length + diff.upgradedTools.length +
    diff.healthChangedTools.length + diff.capabilityChanges.length > 0 ||
    (diff.benchmarkSolvedDelta !== null && diff.benchmarkSolvedDelta !== 0) ||
    diff.selfhostedDelta !== 0;

  if (!anyChange) {
    out.push(
      `Since the last check, Recourse made **no measurable change** — nothing new was added, upgraded, or fixed. ` +
      `This is an honest result: no proposed upgrade cleared the verification gate, so nothing was promoted.`,
    );
    return out.join('\n');
  }

  out.push(`Here is what changed since the last check, in plain terms:`);
  if (toolCount !== 0) {
    out.push(`- The tool library went from ${diff.totals.before} to ${diff.totals.after} tools (net ${toolCount > 0 ? '+' : ''}${toolCount}).`);
  }
  out.push(lines.join('\n'));
  if (diff.removedTools.length > 0) {
    out.push(`Removed: ${diff.removedTools.map((r) => `**${r.name}**`).join(', ')}.`);
  }
  out.push(`Overall, ${diff.totals.after} tools are present in the registry.`);
  return out.join('\n');
}
