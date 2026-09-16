import { describe, it, expect } from 'vitest';
import {
  analysisReward,
  toStuckSignals,
  toRepairRows,
  buildRemediationPlan,
  buildLearnResult,
  summarizeAnalysis,
  GHIDRA_RISK_FAIL_THRESHOLD,
} from '../src/lib/ghidraLearning';
import type { GhidraFindings } from '../src/lib/ghidraSidecarClient';

function findings(over: Partial<GhidraFindings> = {}): GhidraFindings {
  return {
    heuristic: true,
    note: 'test',
    riskScore: 0,
    indicatorCount: 0,
    indicators: [],
    suspiciousImports: [],
    counts: { functions: 10, symbols: 20, strings: 5, sections: 4, decompiled: 10 },
    ...over,
  };
}

describe('ghidra -> learner/repair bridge (pure)', () => {
  it('a clean, decompilable binary scores a high reward', () => {
    const r = analysisReward(findings({ riskScore: 0, counts: { functions: 10, symbols: 1, strings: 1, sections: 1, decompiled: 10 } }));
    expect(r).toBeGreaterThan(0.9);
  });

  it('a high-risk, poorly-decompiled binary scores a low reward', () => {
    const r = analysisReward(findings({ riskScore: 100, counts: { functions: 100, symbols: 1, strings: 1, sections: 1, decompiled: 0 } }));
    expect(r).toBeLessThan(0.1);
  });

  it('reward is bounded 0..1 even for out-of-range input', () => {
    const r = analysisReward(findings({ riskScore: 999 }));
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(1);
  });

  it('emits a failing anomaly signal at/above the fail threshold', () => {
    const s = toStuckSignals({ binaryName: 'evil.exe', findings: findings({ riskScore: GHIDRA_RISK_FAIL_THRESHOLD, indicatorCount: 2, indicators: [{ kind: 'rwx_section', severity: 'high', detail: 'rwx' }] }) });
    expect(s).toHaveLength(1);
    expect(s[0].failing).toBe(true);
    expect(s[0].id).toBe('ghidra:evil.exe');
    expect(s[0].kind).toBe('anomaly');
  });

  it('emits a non-failing signal for a clean binary (resets streaks honestly)', () => {
    const s = toStuckSignals({ binaryName: 'ok.dll', findings: findings({ riskScore: 10 }) });
    expect(s[0].failing).toBe(false);
  });

  it('produces repair rows only when risk is high', () => {
    expect(toRepairRows({ binaryName: 'ok', findings: findings({ riskScore: 10 }) })).toHaveLength(0);
    const rows = toRepairRows({
      binaryName: 'bad',
      findings: findings({
        riskScore: 70,
        indicatorCount: 1,
        indicators: [{ kind: 'suspicious_import', severity: 'high', detail: 'strcpy' }],
      }),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].weakness_score).toBe(70);
    expect(rows[0].reasons[0]).toContain('suspicious_import');
  });

  it('maps every fired indicator to a remediation + build tip', () => {
    const plan = buildRemediationPlan(findings({
      indicators: [
        { kind: 'suspicious_import', severity: 'high', detail: 'x' },
        { kind: 'rwx_section', severity: 'high', detail: 'y' },
        { kind: 'packer_or_runtime_hint', severity: 'medium', detail: 'z' },
        { kind: 'oversized_function', severity: 'low', detail: 'w' },
      ],
    }));
    expect(plan).toHaveLength(4);
    for (const p of plan) {
      expect(p.recommendation.length).toBeGreaterThan(0);
      expect(p.buildTip.length).toBeGreaterThan(0);
    }
  });

  it('buildLearnResult bundles learner tools, signals, rows and a summary', () => {
    const res = buildLearnResult({
      binaryName: 'sample.bin',
      findings: findings({
        riskScore: 80,
        indicatorCount: 1,
        indicators: [{ kind: 'rwx_section', severity: 'high', detail: 'rwx' }],
      }),
      analysis: { program: 'sample.bin', format: 'ELF', sha256: 'a'.repeat(64) },
    });
    expect(res.domain).toBe('cyber_defense');
    expect(res.tools[0].name).toBe('ghidra:sample.bin');
    expect(res.signals[0].failing).toBe(true);
    expect(res.repairRows).toHaveLength(1);
    expect(res.summary).toContain('risk=80/100');
    expect(summarizeAnalysis({
      binaryName: 'sample.bin',
      findings: findings({ riskScore: 80 }),
    })).toContain('Ghidra[sample.bin]');
  });
});
