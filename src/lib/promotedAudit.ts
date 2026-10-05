/**
 * Promoted-tool quality audit.
 *
 * WHY THIS EXISTS
 * The forge's quality gate (`assessForgeCandidate`) only ever ran on NEW
 * candidates. Boot re-verification re-ran the stored 3-assertion suite, so a
 * promoted tool that was correct-by-test and wrong-in-fact kept reporting
 * `passed_verifier: true, score: 1, healthStatus: healthy` forever. The live
 * instance of that was `powerMod`: a double-precision modular exponentiation
 * that is exactly right on the suite's small moduli and returns 976371253
 * where the true answer is 976371285.
 *
 * So the fix is not "verify more tools" — it is "hold promoted tools to the
 * same bar as new ones". This module does that, incrementally:
 *  - verdicts are keyed by the source hash, so a tool is re-audited only when
 *    its code actually changes;
 *  - the sweep takes a budget per run, because the registry holds ~1300 tools
 *    and the gate runs real sandbox executions;
 *  - tools that CANNOT be audited (no suite, no single entrypoint, a JSON claim
 *    rather than code) are reported as unaudited, never as clean.
 *
 * A verdict that fails the gate degrades the tool. A tool that passes its suite
 * but has never been audited is honest about that in `verifier_notes`, so
 * "healthy" can never mean "healthy and unchecked".
 */

import type { ToolEntry, ToolVersion } from '../types.js';
import { assessForgeCandidate, type ForgeQualityReport } from './forgeQuality.js';
import { FORGE_AGENDA } from './capabilityForge.js';
import { verifyCodingCode } from './verifiers.js';

/** Why a version could not be judged, when it could not. */
export type AuditSkipReason =
  | 'not_promoted'
  | 'not_current'
  | 'no_source'
  | 'no_suite'
  | 'claim_not_code'
  | 'no_entrypoint';

export interface AuditSkip {
  tool: string;
  reason: AuditSkipReason;
}

export interface AuditedVersion {
  tool: string;
  version: string;
  hash: string;
  gateOk: boolean;
  score: number;
  reasons: string[];
  /**
   * The strongest evidence actually gathered, weakest case included. `suite`
   * means correctness rests on the stored asserts and nothing else — which is
   * exactly the condition that let `powerMod` look healthy.
   */
  evidence: AuditEvidence;
  /** A reference oracle was available for this tool. */
  oracled: boolean;
  ms: number;
}

/**
 * `differential` — compared against a reference on unseen inputs.
 * `scale`     — probed at magnitudes the suite never reached.
 * `probes`    — determinism / input-mutation only (weak: most wrong code is
 *               deterministic and non-mutating).
 * `suite`     — nothing beyond the stored assertions ran.
 * `none`      — not audited at all (unjudgeable version, cached as such).
 */
export type AuditEvidence = 'differential' | 'scale' | 'probes' | 'suite' | 'none';

export interface PromotedAuditSummary {
  considered: number;
  audited: number;
  cached: number;
  skipped: number;
  /** Audited, gate-passing. */
  passed: number;
  /** Audited, gate-failing — these are degraded. */
  failed: number;
  /** Audited but resting on the suite alone: no oracle, no scale probe. */
  behavioralGap: number;
  stillPending: number;
  ms: number;
  failures: AuditedVersion[];
  skips: AuditSkip[];
  /**
   * How much of the promoted registry has actually been through the ENHANCED
   * gate, broken down by the strongest evidence class each current version holds.
   *
   * WHY THIS IS PUBLISHED. The sweep is budgeted (15 per run by default) and
   * risk-ordered, so it converges over hours, not minutes. Measured on
   * 2026-10-04: of 1288 current versions, only 17 held oracle or scale evidence
   * and 1159 rested on the suite alone. That is a correct steady state for a
   * budgeted sweep and a serious hidden gap at the same time — a tool with
   * `evidence: 'none'` reports health derived from the OLD weak gate, exactly the
   * `powerMod` failure mode, and nothing on any dashboard said so.
   *
   * `enhancedCovered` is the number that matters: how many tools could the
   * scale/oracle checks actually speak to. `suiteOnly` is the exposure.
   */
  coverage: {
    total: number;
    /** Strongest evidence: a reference oracle (differential testing). */
    differential: number;
    /** Strongest evidence: the large-magnitude scale probe. */
    scale: number;
    /** Determinism / mutation / robustness probes. */
    probes: number;
    /** Suite alone — no oracle, no scale probe. This is the exposure. */
    suiteOnly: number;
    /** No quality audit at all. */
    unaudited: number;
    /** differential + scale: what the enhanced gate can actually judge. */
    enhancedCovered: number;
  };
}

/** Stable identity of the code that was judged. */
function hashOf(source: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    h ^= source.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * The symbol a suite actually exercises.
 *
 * A registry entry is named for the tool (`cache_optimizer_l2`), not for the
 * code it carries (`L2Cache`). Guessing wrong here would probe a name the
 * source never defines, so the derivation is explicit and gives up rather than
 * guessing: a version with two equally plausible entrypoints is reported as
 * unauditable.
 */
export function entrypointFor(tool: ToolEntry, version: ToolVersion): { name: string; kind: 'function' | 'class' } | undefined {
  const source = version.source_code ?? '';
  if (!source.trim()) return undefined;
  const suite = version.test_suite_code ?? '';

  const declared: Array<{ name: string; kind: 'function' | 'class' }> = [];
  const push = (name: string, kind: 'function' | 'class') => {
    if (IDENT.test(name) && !declared.some((d) => d.name === name)) declared.push({ name, kind });
  };
  for (const m of source.matchAll(/export\s+(?:async\s+)?(function\s*\*?|class|const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)) {
    push(m[2], m[1] === 'class' ? 'class' : 'function');
  }
  if (!declared.length) {
    for (const m of source.matchAll(/(?:^|\n)\s*(?:async\s+)?(function\s*\*?|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)) {
      push(m[2], m[1] === 'class' ? 'class' : 'function');
    }
  }
  if (!declared.length) return undefined;

  // Prefer a declaration the suite actually calls. `new L2Cache()` still counts.
  const called = declared.filter((d) => suite.includes(`${d.name}(`));
  if (called.length === 1) return called[0];
  if (called.length > 1) return undefined; // ambiguous: refuse rather than guess
  // Forge entries name the entrypoint after the tool; trust that only when the
  // source really declares it.
  if (IDENT.test(tool.name) && declared.some((d) => d.name === tool.name)) {
    return declared.find((d) => d.name === tool.name);
  }
  return declared.length === 1 ? declared[0] : undefined;
}

/** A forge spec for this tool name, if the tool came from the forge agenda. */
function specFor(toolName: string) {
  return FORGE_AGENDA.find((s) => s.name === toolName);
}

export interface AuditContext {
  /** Runs the stored suite. Defaults to the shared coding verifier. */
  verifySuite?: (source: string, suite: string) => { passed: boolean; summary: string; score: number };
  /** Runs the quality gate. Injectable for tests. */
  assess?: (input: { name: string; refSuite: string; reference?: string; vectors?: unknown[]; kind?: 'function' | 'class' }, candidate: string, opts: { requireBehavioral?: boolean }) => ForgeQualityReport;
  now?: () => number;
}

function defaultVerify(source: string, suite: string) {
  const r = verifyCodingCode(source, suite);
  return { passed: r.passed, summary: r.summary, score: r.score };
}

/**
 * Judge one promoted version. Returns `undefined` when the version cannot be
 * audited, with the reason — an unjudgeable tool is a reporting gap, not a
 * pass.
 */
export function auditVersion(
  tool: ToolEntry,
  version: ToolVersion,
  ctx: AuditContext = {},
): AuditedVersion | AuditSkip | undefined {
  const started = Date.now();
  const source = version.source_code ?? '';
  if (!source.trim()) return { tool: tool.name, reason: 'no_source' };
  if (/^\s*\{/.test(source) && tool.domain === 'biotech') return { tool: tool.name, reason: 'claim_not_code' };
  const suite = version.test_suite_code ?? '';
  if (!suite.trim()) return { tool: tool.name, reason: 'no_suite' };
  const entry = entrypointFor(tool, version);
  if (!entry) return { tool: tool.name, reason: 'no_entrypoint' };

  const spec = specFor(tool.name);
  const reference = spec?.reference;
  const verify = ctx.verifySuite ?? defaultVerify;
  const gate = verify(source, suite);
  if (!gate.passed) {
    return {
      tool: tool.name,
      version: version.version,
      hash: hashOf(source),
      gateOk: false,
      score: 0,
      reasons: [`stored suite fails: ${gate.summary}`],
      evidence: 'suite',
      oracled: false,
      ms: Date.now() - started,
    };
  }

  const assess = ctx.assess ?? ((i, c, o) => assessForgeCandidate(i, c, o));
  const report = assess(
    { name: entry.name, refSuite: suite, ...(reference ? { reference } : {}), ...(spec?.vectors ? { vectors: spec.vectors } : {}), kind: entry.kind },
    source,
    // A promoted tool is never retired for weak evidence (see
    // `assessForgeCandidate`'s `requireBehavioral`), but a gate failure here
    // must mean a REAL defect, not "we could not check it".
    { requireBehavioral: false },
  );
  const evidence: AuditEvidence =
    (report.differential?.checked ?? 0) > 0
      ? 'differential'
      : (report.scale?.checked ?? 0) > 0
        ? 'scale'
        : (report.robustness?.checked ?? 0) > 0
          ? 'probes'
          : 'suite';

  return {
    tool: tool.name,
    version: version.version,
    hash: hashOf(source),
    gateOk: report.gate.ok,
    score: report.score,
    reasons: report.gate.reasons,
    evidence,
    oracled: Boolean(reference),
    ms: Date.now() - started,
  };
}

/** Verdict stored on a version; invalidated by any source change. */
export function cachedVerdict(version: ToolVersion, sourceHash: string) {
  const q = version.quality_audit;
  return q && q.sourceHash === sourceHash ? q : undefined;
}

export interface SweepOptions extends AuditContext {
  /** Max versions judged this run. 0 means "just count". */
  budget?: number;
  /** Re-judge even when a verdict for this source hash is cached. */
  force?: boolean;
  now?: () => number;
}

function isSkip(x: AuditedVersion | AuditSkip | undefined): x is AuditSkip {
  return !!x && Object.prototype.hasOwnProperty.call(x, 'reason');
}

/**
 * Audit promoted, current versions until the budget runs out.
 *
 * Ordering is risk-first, because the sweep is budgeted and cannot reach 1300
 * tools at once: judge first the tools whose audit can actually DETECT a defect.
 * Tier 0 is forge-materialized tools with a reference oracle (differential
 * testing on unseen inputs — the check that caught `powerMod`), then forge
 * tools with only a scale probe available, then everything else, weakest suite
 * first. Ordering is deterministic, so successive runs advance evenly instead
 * of re-examining the same head of the list.
 */
export function sweepPromotedTools(registry: ToolEntry[], opts: SweepOptions = {}): PromotedAuditSummary {
  const t0 = Date.now();
  const budget = opts.budget ?? 0;
  const summary: PromotedAuditSummary = {
    considered: 0,
    audited: 0,
    cached: 0,
    skipped: 0,
    passed: 0,
    failed: 0,
    behavioralGap: 0,
    stillPending: 0,
    ms: 0,
    failures: [],
    skips: [],
    coverage: { total: 0, differential: 0, scale: 0, probes: 0, suiteOnly: 0, unaudited: 0, enhancedCovered: 0 },
  };

  // Coverage is measured over EVERY current promoted version, not just the ones
  // this run judged, so it reports standing exposure rather than this run's work.
  for (const tool of registry) {
    const v = tool.versions?.find((x) => x.promoted && x.version === tool.currentVersion);
    summary.coverage.total++;
    if (!v || !v.quality_audit) {
      summary.coverage.unaudited++;
      continue;
    }
    const evidence = v.quality_audit.evidence;
    if (evidence === 'differential') summary.coverage.differential++;
    else if (evidence === 'scale') summary.coverage.scale++;
    else if (evidence === 'probes') summary.coverage.probes++;
    else summary.coverage.suiteOnly++;
  }
  summary.coverage.enhancedCovered = summary.coverage.differential + summary.coverage.scale;

  type Candidate = { tool: ToolEntry; version: ToolVersion; source: string; hash: string; tier: number; weak: boolean };
  const queue: Candidate[] = [];

  for (const tool of registry) {
    const version = tool.versions?.find((v) => v.promoted && v.version === tool.currentVersion);
    if (!version) continue;
    summary.considered++;
    const source = version.source_code ?? '';
    if (!source.trim()) continue;
    const hash = hashOf(source);
    const cached = opts.force ? undefined : cachedVerdict(version, hash);
    if (cached) {
      summary.cached++;
      applyVerdict(tool, version, cached, summary);
      continue;
    }
    const spec = specFor(tool.name);
    const asserts = (version.test_suite_code?.match(/\bassert\b/g) ?? []).length;
    queue.push({ tool, version, source, hash, tier: spec ? (spec.reference ? 0 : 1) : 2, weak: asserts <= 4 });
  }

  queue.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.weak !== b.weak) return a.weak ? -1 : 1;
    return a.tool.name.localeCompare(b.tool.name);
  });

  for (const item of queue) {
    if (summary.audited >= budget) {
      summary.stillPending++;
      continue;
    }
    const verdict = auditVersion(item.tool, item.version, opts);
    const at = opts.now ? opts.now() : Date.now();
    if (!verdict || isSkip(verdict)) {
      const reason = verdict && isSkip(verdict) ? verdict.reason : 'no_source';
      summary.skipped++;
      summary.skips.push({ tool: item.tool.name, reason });
      // Cached as an explicit "not audited" so it is never re-run every tick and
      // never read as a pass.
      item.version.quality_audit = {
        sourceHash: item.hash,
        gateOk: false,
        score: 0,
        reasons: [`not audited: ${reason}`],
        evidence: 'none',
        audited: false,
        at,
      };
      continue;
    }
    const stored = {
      sourceHash: verdict.hash,
      gateOk: verdict.gateOk,
      score: verdict.score,
      reasons: verdict.reasons,
      evidence: verdict.evidence,
      audited: true,
      at,
    };
    item.version.quality_audit = stored;
    summary.audited++;
    applyVerdict(item.tool, item.version, stored, summary);
  }

  summary.ms = Date.now() - t0;
  return summary;
}

/**
 * A stored verdict must be able to move health DOWN, never up. A version that
 * fails the gate after passing its suite is degraded: that is the whole point
 * of the audit.
 */
function applyVerdict(
  tool: ToolEntry,
  version: ToolVersion,
  q: { gateOk: boolean; reasons: string[]; evidence: AuditEvidence },
  summary: PromotedAuditSummary,
) {
  if (q.gateOk) {
    summary.passed++;
    if (q.evidence === 'suite') summary.behavioralGap++;
    return;
  }
  summary.failed++;
  summary.failures.push({
    tool: tool.name,
    version: version.version,
    hash: version.quality_audit?.sourceHash ?? '',
    gateOk: false,
    score: version.quality_audit?.score ?? 0,
    reasons: q.reasons,
    evidence: q.evidence,
    oracled: false,
    ms: 0,
  });
  version.passed_verifier = false;
  version.score = version.quality_audit?.score ?? 0;
  version.verifier_notes =
    `GENESIS RE-VERIFIED: suite passed, QUALITY GATE FAILED — ${q.reasons.slice(0, 3).join('; ')}`;
  if (tool.currentVersion === version.version) tool.healthStatus = 'degraded';
}

/** One-line human summary for the ledger and /status. */
export function describeAuditSummary(s: PromotedAuditSummary): string {
  const bits = [
    `${s.audited} audited`,
    `${s.passed} gate-pass`,
    `${s.failed} gate-fail`,
    `${s.cached} cached`,
    `${s.stillPending} pending`,
  ];
  if (s.skipped) bits.push(`${s.skipped} not auditable`);
  if (s.behavioralGap) bits.push(`${s.behavioralGap} suite-only (no oracle)`);
  return bits.join(', ');
}