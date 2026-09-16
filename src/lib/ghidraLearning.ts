/**
 * Ghidra -> self-learning / self-repair bridge.
 *
 * Pure, deterministic mapping from a REAL Ghidra analysis result to:
 *  1. a learner reward + per-artifact tool belief (feeds RecursiveLearner),
 *  2. stuck/anomaly signals (feeds the stuck-aware self-repair loop),
 *  3. health-dossier repair rows (feeds the fleet repair team, e.g. Axiom),
 *  4. a deterministic remediation + secure-build plan (the "healing" advice).
 *
 * Honesty contract: nothing here invents an analysis. Every number derives from
 * the sidecar's real Ghidra output; `analysisReward` is a documented heuristic,
 * not a measured property. The functions are side-effect free so they can be
 * unit-tested without Ghidra or a network.
 */

import type { StuckSignal } from './selfRepairLoop.js';
import type { GhidraAnalysis, GhidraFindings } from './ghidraSidecarClient.js';

export interface GhidraLearnInput {
  binaryName: string;
  domain?: string;
  findings: GhidraFindings;
  analysis?: Partial<
    Pick<GhidraAnalysis, 'program' | 'format' | 'md5' | 'sha256' | 'functionCount' | 'symbolCount' | 'stringCount'>
  >;
}

export interface GhidraRemediation {
  indicatorKind: string;
  severity: string;
  detail: string;
  recommendation: string;
  buildTip: string;
}

export interface GhidraRepairRow {
  component_slug: string;
  component_name: string;
  weakness_score: number;
  reasons: string[];
  proposed_action: string;
}

export interface GhidraLearnResult {
  binaryName: string;
  domain: string;
  reward: number;
  tools: Array<{ name: string; domain: string; reward: number }>;
  signals: StuckSignal[];
  repairRows: GhidraRepairRow[];
  remediations: GhidraRemediation[];
  summary: string;
}

/** Risk at/above this makes a Ghidra signal count as failing. */
export const GHIDRA_RISK_FAIL_THRESHOLD = 50;
/** Consecutive high-risk analyses before the repair loop counts it stuck. */
export const GHIDRA_STUCK_THRESHOLD = 2;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Reward for a real analysis outcome, in 0..1. It blends:
 *  - safety (inverse of the heuristic risk score), and
 *  - understanding (share of non-trivial functions the decompiler resolved).
 * Both come from real Ghidra output; the blend is calibration, not a property.
 */
export function analysisReward(findings: GhidraFindings): number {
  const safety = 1 - clamp01(findings.riskScore / 100);
  const fn = findings.counts?.functions ?? 0;
  const dec = findings.counts?.decompiled ?? 0;
  const coverage = fn > 0 ? clamp01(dec / fn) : 0.5;
  return round4(0.6 * safety + 0.4 * coverage);
}

/** One learner tool entry for the analyzed artifact. */
export function toLearnerTools(input: GhidraLearnInput): Array<{ name: string; domain: string; reward: number }> {
  const reward = analysisReward(input.findings);
  return [{ name: `ghidra:${input.binaryName}`, domain: input.domain ?? 'cyber_defense', reward }];
}

/**
 * A real stuck/anomaly signal when the artifact's heuristic risk is high.
 * `failing:false` when the analysis is clean, so the loop can reset a streak.
 */
export function toStuckSignals(input: GhidraLearnInput): StuckSignal[] {
  const failing = input.findings.riskScore >= GHIDRA_RISK_FAIL_THRESHOLD;
  const kinds = [...new Set(input.findings.indicators.map((i) => i.kind))].slice(0, 6);
  return [
    {
      id: `ghidra:${input.binaryName}`,
      name: `Binary risk: ${input.binaryName}`,
      kind: 'anomaly',
      failing,
      detail: failing
        ? `heuristic risk ${input.findings.riskScore}/100 (${input.findings.indicatorCount} indicators: ${kinds.join(', ') || 'n/a'})`
        : `heuristic risk ${input.findings.riskScore}/100 below fail threshold ${GHIDRA_RISK_FAIL_THRESHOLD}`,
      threshold: GHIDRA_STUCK_THRESHOLD,
    },
  ];
}

const RECOMMENDATIONS: Record<string, { recommendation: string; buildTip: string }> = {
  suspicious_import: {
    recommendation:
      'Audit every call site of the flagged import. Replace unbounded/exec primitives with bounded, sandboxed equivalents and validate all inputs at the boundary.',
    buildTip:
      'Build with -D_FORTIFY_SOURCE=2 / /GS, prefer snprintf over sprintf, strncpy_s over strcpy, and never eval/shell-out on untrusted input.',
  },
  rwx_section: {
    recommendation:
      'Split writable+executable memory into W^X regions and remove self-modifying logic; enable DEP/NX.',
    buildTip:
      'Emit linker flags for RELRO, PIE/PIC, and NX; on Windows enable /NXCOMPAT and Control Flow Guard (CFG).',
  },
  packer_or_runtime_hint: {
    recommendation:
      'Unpack the artifact in an isolated sandbox before trusting its strings/imports; verify a signature or hash against a trusted source.',
    buildTip:
      'Ship signed, unpacked binaries; document interpreter runtimes (PyInstaller/Electron) so scans do not flag them as opaque.',
  },
  oversized_function: {
    recommendation:
      'Review the oversized function for generated/obfuscated code; split it and add focused unit tests around its behaviour.',
    buildTip:
      'Keep functions small and testable; generate code through a reviewed template rather than a monolithic emitter.',
  },
};

/** Deterministic remediation + secure-build guidance keyed by real indicators. */
export function buildRemediationPlan(findings: GhidraFindings): GhidraRemediation[] {
  return findings.indicators.map((ind) => {
    const rec = RECOMMENDATIONS[ind.kind] ?? {
      recommendation: 'Review the flagged condition and confirm whether it is expected for this artifact.',
      buildTip: 'Keep dependencies minimal, pin versions, and enable the platform hardening flags.',
    };
    return {
      indicatorKind: ind.kind,
      severity: ind.severity,
      detail: ind.detail,
      recommendation: rec.recommendation,
      buildTip: rec.buildTip,
    };
  });
}

/** Health-dossier rows the fleet repair team can action. */
export function toRepairRows(input: GhidraLearnInput): GhidraRepairRow[] {
  const { findings, binaryName } = input;
  if (findings.riskScore < GHIDRA_RISK_FAIL_THRESHOLD) return [];
  const reasons = findings.indicators
    .slice(0, 8)
    .map((i) => `[${i.severity}] ${i.kind}: ${i.detail}`);
  return [
    {
      component_slug: `ghidra:binary:${binaryName}`,
      component_name: `Ghidra binary risk: ${binaryName}`,
      weakness_score: Math.max(50, Math.min(100, findings.riskScore)),
      reasons:
        reasons.length > 0
          ? reasons
          : [`heuristic risk ${findings.riskScore}/100 from Ghidra analysis`],
      proposed_action:
        'Harden this artifact per the Ghidra remediation plan (W^X, bounded APIs, unpack/sign) and re-analyze to confirm the risk score drops.',
    },
  ];
}

/** Compact one-line summary for provenance/memory records. */
export function summarizeAnalysis(input: GhidraLearnInput): string {
  const f = input.findings;
  const hash = input.analysis?.sha256 ? ` sha256=${input.analysis.sha256.slice(0, 16)}…` : '';
  return `Ghidra[${input.binaryName}] risk=${f.riskScore}/100 indicators=${f.indicatorCount} functions=${f.counts?.functions ?? 0}${hash}`;
}

/** Fold a real analysis into the full learning/repair bundle. */
export function buildLearnResult(input: GhidraLearnInput): GhidraLearnResult {
  const reward = analysisReward(input.findings);
  return {
    binaryName: input.binaryName,
    domain: input.domain ?? 'cyber_defense',
    reward,
    tools: toLearnerTools(input),
    signals: toStuckSignals(input),
    repairRows: toRepairRows(input),
    remediations: buildRemediationPlan(input.findings),
    summary: summarizeAnalysis(input),
  };
}
