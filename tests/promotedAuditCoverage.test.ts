/**
 * Coverage accounting for the promoted-tool quality audit.
 *
 * WHY THIS FILE EXISTS: the sweep is budgeted and risk-ordered, so it converges
 * over hours. Measured 2026-10-04, only 17 of 1288 current versions held oracle
 * or scale evidence and 1159 rested on the suite alone — the exact `powerMod`
 * exposure — with nothing on any dashboard reporting it. These tests make the
 * coverage number trustworthy, because a coverage metric that cannot report its
 * own blind spot is the bug being fixed.
 */
import { describe, it, expect } from 'vitest';
import { sweepPromotedTools } from '../src/lib/promotedAudit.js';
import type { ToolEntry } from '../src/types.js';

function tool(name: string, evidence?: string, opts: { promoted?: boolean; current?: string } = {}): ToolEntry {
  const version = '1.0.0';
  return {
    name,
    currentVersion: opts.current ?? version,
    versions: [
      {
        version,
        promoted: opts.promoted ?? true,
        passed_verifier: true,
        score: 1,
        verifier_notes: 'x',
        source_code: `export function ${name}(a){return a}`,
        test_suite_code: `assert ${name}(1) === 1;`,
        ...(evidence ? { quality_audit: { gateOk: true, score: 1, reasons: [], audited: true, evidence, sourceHash: 'h' } } : {}),
      },
    ],
  } as unknown as ToolEntry;
}

describe('promoted audit coverage', () => {
  it('counts every current promoted version, not just the ones judged this run', () => {
    const registry = [
      tool('a', 'differential'),
      tool('b', 'scale'),
      tool('c', 'probes'),
      tool('d', 'suite'),
      tool('e'), // no quality audit at all
    ];
    const s = sweepPromotedTools(registry, { budget: 0 }); // budget 0 = count only
    expect(s.coverage.total).toBe(5);
    expect(s.coverage.differential).toBe(1);
    expect(s.coverage.scale).toBe(1);
    expect(s.coverage.probes).toBe(1);
    expect(s.coverage.suiteOnly).toBe(1);
    expect(s.coverage.unaudited).toBe(1);
  });

  it('enhancedCovered counts only what the enhanced gate can actually judge', () => {
    const registry = [tool('a', 'differential'), tool('b', 'scale'), tool('c', 'probes'), tool('d', 'suite')];
    const s = sweepPromotedTools(registry, { budget: 0 });
    // probes and suite are NOT enhanced-gate evidence — only an oracle or the
    // scale probe is. Counting them would overstate safety.
    expect(s.coverage.enhancedCovered).toBe(2);
  });

  it('reports full exposure when nothing has been audited', () => {
    const registry = Array.from({ length: 20 }, (_, i) => tool(`t${i}`));
    const s = sweepPromotedTools(registry, { budget: 0 });
    expect(s.coverage.enhancedCovered).toBe(0);
    expect(s.coverage.unaudited).toBe(20);
    expect(s.coverage.total).toBe(20);
  });

  it('coverage sums to the total — no tool silently uncounted', () => {
    const registry = [tool('a', 'differential'), tool('b'), tool('c', 'suite'), tool('d', 'scale')];
    const s = sweepPromotedTools(registry, { budget: 0 });
    const sum = s.coverage.differential + s.coverage.scale + s.coverage.probes + s.coverage.suiteOnly + s.coverage.unaudited;
    expect(sum).toBe(s.coverage.total);
  });

  it('ignores superseded versions — only the live one counts', () => {
    const t = tool('x', 'suite');
    // Add a historical version carrying strong evidence; it must NOT inflate
    // coverage, because coverage describes what is live right now.
    (t.versions as unknown as unknown[]).push({
      version: '0.9.0',
      promoted: false,
      passed_verifier: true,
      score: 1,
      verifier_notes: 'HISTORICAL',
      source_code: 'export function x(a){return a}',
      test_suite_code: 'assert x(1) === 1;',
      quality_audit: { gateOk: true, score: 1, reasons: [], audited: true, evidence: 'differential', sourceHash: 'old' },
    });
    const s = sweepPromotedTools([t], { budget: 0 });
    expect(s.coverage.total).toBe(1);
    expect(s.coverage.differential).toBe(0);
    expect(s.coverage.suiteOnly).toBe(1);
  });

  it('coverage is measured even when the sweep judges nothing', () => {
    const registry = [tool('a', 'differential'), tool('b', 'suite')];
    const s = sweepPromotedTools(registry, { budget: 0 });
    expect(s.audited).toBe(0);
    expect(s.coverage.total).toBe(2);
  });

  it('a tool with no promoted current version is counted as unaudited, not dropped', () => {
    // Regression guard: coverage.total must equal the registry size so the
    // exposure denominator can never be quietly narrowed.
    const registry = [tool('a', 'differential'), tool('b', 'suite', { promoted: false })];
    const s = sweepPromotedTools(registry, { budget: 0 });
    expect(s.coverage.total).toBe(registry.length);
  });
});
