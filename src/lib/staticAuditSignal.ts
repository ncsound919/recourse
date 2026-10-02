/**
 * staticAuditSignal.ts — run a REAL static analyzer over Recourse's own source
 * and report it as a stuck-signal, so the existing self-repair loop can act on
 * it.
 *
 * WHY THIS EXISTS
 * Recourse runs ~30 OSS integration clients but only ever called two of them for
 * actual work (`fuzz`, `kg` in scienceConductor's capability phase). The other
 * 16 were health-scouted once per science cycle and never asked to do anything.
 * Meanwhile the repair loop watched jobs, self-hosted tools, forge quarantine,
 * anomalies and verifier pass-rate — and never looked at Recourse's own code
 * with a real analyzer. A bug in Recourse's source was invisible to the loop whose
 * job is to repair Recourse.
 *
 * This closes that gap with an installed, external tool (Semgrep) rather than a
 * new self-report. Semgrep is not part of Recourse; it is a third-party static
 * analyzer whose rules we do not author, and its findings are produced by
 * pattern-matching Recourse's real files. That makes it a genuine external
 * opinion — the same property that makes a repo's own test suite a good verifier:
 * the judge is not the thing being judged.
 *
 * HONESTY CONTRACT
 *  - A missing/broken analyzer is NOT a finding. It reports `available:false`
 *    and emits no signals, so the repair loop cannot escalate a phantom.
 *  - Scan errors are surfaced separately from findings. A partial parse does not
 *    become "code is clean"; it is reported so the coverage gap is visible.
 *  - Finding counts are never inflated: one signal per RULE, carrying the real
 *    count, not one signal per occurrence. Otherwise a single systemic pattern
 *    would flood the stuck list and drown real issues.
 *  - Only rules that actually match are reported. A clean scan yields no signals.
 *  - This module is READ-ONLY. It never edits, and it never applies a fix.
 */

import path from 'node:path';

import { runProcess, commandExists } from './codingPipelines/subprocess.js';
import type { StuckSignal, StuckSignalKind } from './selfRepairLoop.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One rule that matched, with its real occurrence count. */
export interface StaticAuditRuleFinding {
  /** Semgrep rule id, e.g. `javascript.lang.security.spawn-shell-true`. */
  rule: string;
  /** How many places matched. */
  count: number;
  /** Example locations, newest-first, capped. */
  examples: Array<{ file: string; line: number }>;
  /** First line of the rule's message, for the operator. */
  message: string;
}

export interface StaticAuditScanError {
  type: string;
  message: string;
}

export interface StaticAuditResult {
  /** False when the analyzer could not be run at all. Never a finding. */
  available: boolean;
  /** Analyzer version string when it ran. */
  version?: string;
  /** True when a scan actually completed (findings may still be empty). */
  scanned: boolean;
  findings: StaticAuditRuleFinding[];
  /** Parse/rule errors — a coverage gap, not a clean bill of health. */
  errors: StaticAuditScanError[];
  durationMs: number;
  /** Files actually scanned, when the analyzer reports it. */
  filesScanned?: number;
  /** Populated only when `available` is false. */
  reason?: string;
}

export interface StaticAuditOptions {
  /** Repo root to scan. Defaults to the Recourse checkout. */
  root?: string;
  /** Sub-paths relative to root. Defaults to the server's own code. */
  targets?: string[];
  /** Semgrep config. `auto` pulls curated rules from the registry. */
  config?: string;
  timeoutMs?: number;
  /** Rules to suppress (exact id or id prefix). */
  excludeRules?: string[];
  /** Max example locations kept per rule. */
  maxExamples?: number;
}

const DEFAULT_TARGETS = ['src/lib', 'server.ts'];
const DEFAULT_TIMEOUT_MS = 300_000;

/** Rule ids we deliberately do not treat as repair signals. */
const DEFAULT_EXCLUDES = [
  // Informational style rule: fires on any non-literal RegExp construction and
  // is not a defect on its own.
  'detect-non-literal-regexp',
];

// ---------------------------------------------------------------------------
// Semgrep JSON (only the fields we use — the tool emits much more)
// ---------------------------------------------------------------------------

interface RawResult {
  check_id?: string;
  path?: string;
  start?: { line?: number };
  extra?: { message?: string };
}

interface RawSemgrepJson {
  version?: string;
  results?: RawResult[];
  // `type` is an array of strings in semgrep's JSON error shape.
  errors?: Array<{ type?: string[] | string; message?: string }>;
  paths?: { scanned?: string[] };
}

/** Pull the stable, comparable identity off a check id. */
function ruleKey(checkId: string): string {
  const parts = checkId.split('.');
  // Keep the language + last rule segment: `javascript.lang.security.spawn-shell-true.spawn-shell-true`
  // -> `spawn-shell-true`. The duplicate tail is semgrep's own convention.
  return parts[parts.length - 1] || checkId;
}

function isExcluded(rule: string, excludes: string[]): boolean {
  return excludes.some((ex) => rule === ex || ex.endsWith('*') && rule.startsWith(ex.slice(0, -1)));
}

function relFile(root: string, file: string): string {
  const rel = path.relative(root, file);
  return rel.startsWith('..') ? file : rel.split(path.sep).join('/');
}

// ---------------------------------------------------------------------------
// The scan
// ---------------------------------------------------------------------------

/**
 * Run the analyzer. Never throws: an analyzer that cannot run comes back as
 * `{available:false}` with a reason, which the caller must not escalate.
 */
export async function runStaticAudit(opts: StaticAuditOptions = {}): Promise<StaticAuditResult> {
  const started = Date.now();
  const root = path.resolve(opts.root || process.env.RECOURSE_AUDIT_ROOT || process.cwd());
  const targets = opts.targets?.length ? opts.targets : DEFAULT_TARGETS;
  const config = opts.config || process.env.RECOURSE_AUDIT_CONFIG || 'auto';
  const excludes = [...DEFAULT_EXCLUDES, ...(opts.excludeRules ?? [])];
  const maxExamples = opts.maxExamples ?? 3;

  if (!commandExists('semgrep')) {
    return {
      available: false,
      scanned: false,
      findings: [],
      errors: [],
      durationMs: Date.now() - started,
      reason: 'semgrep is not on PATH — no external opinion available',
    };
  }

  const args = [
    '--config', config,
    '--json',
    '--quiet',
    '--timeout', String(Math.floor((opts.timeoutMs ?? DEFAULT_TIMEOUT_MS) / 1000)),
    // Bound the scan so a large tree cannot hang the repair job.
    '--max-target-bytes', '2000000',
    '--jobs', '4',
    ...targets,
  ];

  const res = await runProcess('semgrep', args, {
    cwd: root,
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    // Semgrep's JSON can be large; give it room but keep a hard cap.
    maxOutputBytes: 16 * 1024 * 1024,
  });

  if (res.error && !res.stdout) {
    return {
      available: false,
      scanned: false,
      findings: [],
      errors: [],
      durationMs: Date.now() - started,
      reason: `semgrep could not be executed: ${res.error}`,
    };
  }
  if (res.timedOut) {
    return {
      available: false,
      scanned: false,
      findings: [],
      errors: [],
      durationMs: Date.now() - started,
      reason: `semgrep timed out after ${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`,
    };
  }

  let parsed: RawSemgrepJson;
  try {
    parsed = JSON.parse(res.stdout) as RawSemgrepJson;
  } catch {
    return {
      available: false,
      scanned: false,
      findings: [],
      errors: [],
      durationMs: Date.now() - started,
      // Keep the tail: semgrep prints diagnostics there, and swallowing them
      // turns a config error into a mystery.
      reason: `semgrep output was not JSON (exit ${res.code}): ${res.stderr.slice(-300) || res.stdout.slice(-300)}`,
    };
  }

  // Group by rule so one systemic pattern is one signal, not N.
  const byRule = new Map<string, StaticAuditRuleFinding>();
  for (const r of parsed.results ?? []) {
    if (!r.check_id) continue;
    const rule = ruleKey(r.check_id);
    if (isExcluded(rule, excludes)) continue;
    const entry = byRule.get(rule) ?? { rule, count: 0, examples: [], message: '' };
    entry.count += 1;
    if (!entry.message && r.extra?.message) {
      entry.message = String(r.extra.message).split('\n')[0].slice(0, 200);
    }
    if (entry.examples.length < maxExamples) {
      entry.examples.push({ file: relFile(root, r.path ?? ''), line: r.start?.line ?? 0 });
    }
    byRule.set(rule, entry);
  }

  const findings = [...byRule.values()].sort((a, b) => b.count - a.count || a.rule.localeCompare(b.rule));

  return {
    available: true,
    scanned: true,
    version: parsed.version,
    findings,
    errors: (parsed.errors ?? []).slice(0, 10).map((e) => ({
      // semgrep mixes strings and nested objects in `type`; keep only the
      // strings so a mixed array does not stringify to "[object Object]".
      type: (Array.isArray(e.type) ? e.type : [e.type])
        .filter((t): t is string => typeof t === 'string')
        .join('+') || 'unknown',
      message: String(e.message ?? '').split('\n')[0].slice(0, 300),
    })),
    durationMs: Date.now() - started,
    filesScanned: parsed.paths?.scanned?.length,
  };
}

// ---------------------------------------------------------------------------
// Signal projection
// ---------------------------------------------------------------------------

/**
 * Severity band for a rule. This is deliberately coarse: the analyzer does not
 * rank rules for us, and inventing a false precision here would be worse than
 * a blunt band an operator can argue with.
 */
function bandFor(count: number): { score: number; threshold: number } {
  // More occurrences of one rule = more systemic = more worth a look, but never
  // enough to make a self-repair pass treat it as urgent on its own.
  if (count >= 10) return { score: 45, threshold: 3 };
  if (count >= 5) return { score: 38, threshold: 3 };
  return { score: 32, threshold: 3 };
}

/**
 * Project a scan into stuck-signals.
 *
 * Contract: an unavailable or unscanned analyzer yields ZERO signals. That is
 * the whole point — an absent opinion must never be laundered into a finding.
 */
export function staticAuditSignals(result: StaticAuditResult, kind: StuckSignalKind = 'service'): StuckSignal[] {
  if (!result.available || !result.scanned) return [];

  const signals: StuckSignal[] = result.findings.map((f) => {
    const { score, threshold } = bandFor(f.count);
    const where = f.examples.map((e) => `${e.file}:${e.line}`).join(', ');
    return {
      id: `static-audit:${f.rule}`,
      name: `Static analysis: ${f.rule}`,
      kind,
      failing: true,
      threshold,
      detail: `semgrep ${result.version ?? ''} matched "${f.rule}" ${f.count}x${where ? ` (e.g. ${where})` : ''}${f.message ? ` — ${f.message}` : ''}`.slice(0, 400),
    };
  });

  return signals;
}

/** One-line summary for a job return value / operator log. */
export function staticAuditSummary(result: StaticAuditResult): string {
  if (!result.available) return `unavailable: ${result.reason ?? 'unknown'}`;
  if (!result.scanned) return 'not scanned';
  const hits = result.findings.reduce((n, f) => n + f.count, 0);
  const errNote = result.errors.length ? `, ${result.errors.length} scan error(s)` : '';
  return `${result.findings.length} rule(s) matched, ${hits} occurrence(s)${errNote}, ${result.filesScanned ?? 0} file(s) in ${(result.durationMs / 1000).toFixed(1)}s`;
}
