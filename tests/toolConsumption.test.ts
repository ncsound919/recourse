/**
 * toolConsumption.test.ts — the forge's dead-weight metric.
 *
 * The forge reported 17 materialized tools while no production path called a
 * single one; the only scheduled execution was the self-use watchdog, which
 * discards the result. These tests pin the measurement that makes that visible
 * (`unconsumed`), and the rule that a binding is a CLAIM about a call site which
 * must still match the source tree — otherwise a comfortable lie outlives the
 * code it describes.
 */
import { describe, it, expect } from 'vitest';
import { CONSUMER_BINDINGS, consumptionReport, describeConsumption, verifyBindings } from '../src/lib/toolConsumption';
import type { ToolEntry } from '../src/types';

function forgeTool(name: string): ToolEntry {
  return {
    name,
    domain: 'coding',
    entrypoint: `.selfhosted/tools/${name}.mjs`,
    description: '[Capability Forge]',
    currentVersion: '1.0.0-forge',
    healthStatus: 'healthy',
    versions: [
      {
        version: '1.0.0-forge',
        hash: 'abc',
        created_at: 0,
        passed_verifier: true,
        score: 1,
        promoted: true,
        verifier_notes: 'CAPABILITY FORGE: model impl passed HUMAN-authored reference suite',
        source_code: 'export function x() {}',
        test_suite_code: 'assert x() === undefined;',
      },
    ],
  };
}

describe('tool consumption bindings', () => {
  it('every binding points at a symbol that still exists in the source tree', () => {
    const statuses = verifyBindings();
    const dead = statuses.filter((s) => !s.live).map((s) => `${s.tool} -> ${s.file}:${s.symbol} (${s.note})`);
    expect(dead, `stale consumer bindings:\n${dead.join('\n')}`).toEqual([]);
  });

  it('classifies the load-bearing binding as load-bearing and the probes as probes', () => {
    const report = consumptionReport([forgeTool('levenshteinDistance'), forgeTool('gcdPair'), forgeTool('dedupeStable')]);
    const byName = new Map(report.rows.map((r) => [r.tool, r.cls]));
    expect(byName.get('levenshteinDistance')).toBe('load_bearing');
    // Served with synthetic inputs and compared-then-discarded: exercised, but
    // nothing depends on the answer. Calling that "consumed" is the disease.
    expect(byName.get('gcdPair')).toBe('probe_only');
    expect(byName.get('dedupeStable')).toBe('probe_only');
  });

  it('counts a materialized tool nothing calls as unconsumed', () => {
    const report = consumptionReport([forgeTool('levenshteinDistance'), forgeTool('mergeSorted'), forgeTool('applyX')]);
    expect(report.materialized).toBe(3);
    expect(report.loadBearing).toBe(1);
    expect(report.probeOnly).toBe(0);
    expect(report.unconsumed).toBe(2);
    expect(report.calledShare).toBeCloseTo(1 / 3, 3);
  });

  it('does not count non-forge registry entries as materialized', () => {
    const genesis = forgeTool('fizzbuzz_solver');
    genesis.description = 'FizzBuzz classifier (genesis seed)';
    genesis.entrypoint = 'src/tools/fizzbuzz.ts';
    genesis.versions[0].verifier_notes = 'GENESIS RE-VERIFIED: PASSED (100% of 4 assertions)';
    genesis.versions[0].version = '1.0.0';
    genesis.currentVersion = '1.0.0';
    const report = consumptionReport([genesis]);
    expect(report.materialized).toBe(0);
    expect(report.rows[0].cls).toBe('not_materialized');
  });

  it('reports no called share at all rather than a confident zero tools', () => {
    const report = consumptionReport([]);
    expect(report.materialized).toBe(0);
    expect(report.calledShare).toBe(0);
    expect(describeConsumption(report)).toMatch(/0 materialized/);
  });

  it('records the binding line so a reader can check the claim', () => {
    const binding = CONSUMER_BINDINGS.find((b) => b.tool === 'levenshteinDistance')!;
    const status = verifyBindings().find((s) => s.tool === 'levenshteinDistance')!;
    expect(status.live).toBe(true);
    expect(status.line).toBeGreaterThan(0);
    expect(binding.kind).toBe('load_bearing');
  });
});