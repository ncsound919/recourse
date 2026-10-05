/**
 * promotedAudit.test.ts — the re-verify gap, closed.
 *
 * The forge's quality gate only ran on NEW candidates. Boot re-verification
 * re-ran the stored suite, so `powerMod` — promoted as a double-precision
 * modular exponentiation — kept reporting `passed_verifier: true, score: 1,
 * healthStatus: healthy` while returning 976371253 where the true answer is
 * 976371285. These tests pin the audit that closes that, using the real
 * verifier and the real forge spec (so the oracle travels the real path).
 */
import { describe, it, expect, vi } from 'vitest';

// Spawn-heavy suite: these tests drive the real isolate sandbox (and, for
// promotedAudit / staticAuditSignal, a real external analyzer). Measured alone,
// forgeQuality runs its 18 tests in ~15s. Run alongside the other sandbox suites
// under full-suite parallel load the same file stretched past the 30s suite-wide
// default and failed on TIMEOUT while every assertion held — so the suite's
// verdict became a function of machine load rather than of correctness, which
// makes it useless as a gate.
//
// This is the same remedy already applied in tests/codeSafetyOss.test.ts, whose
// header records exactly this: "under full-suite load these spawns stretched past
// 30s and failed on timeout even though every assertion held. The assertion, not
// the clock, is the signal here." Raising it per-file keeps the global 30s
// default tight for the other ~300 files, so a genuine hang is still caught
// everywhere it matters.
vi.setConfig({ testTimeout: 180000, hookTimeout: 180000 });
import { auditVersion, entrypointFor, sweepPromotedTools, type AuditedVersion, type AuditSkip } from '../src/lib/promotedAudit';
import { FORGE_AGENDA } from '../src/lib/capabilityForge';
import type { ToolEntry, ToolVersion } from '../src/types';

const POWERMOD = FORGE_AGENDA.find((s) => s.name === 'powerMod')!;

/** The implementation that was actually promoted and is still registered. */
const DOUBLE_BASED = `
/**
 * Computes (base^exp) mod mod using fast exponentiation.
 * @param {number} base base
 * @param {number} exp exponent
 * @param {number} mod modulus
 * @returns {number} result
 */
export function powerMod(base, exp, mod) {
  let result = 1 % mod;
  let factor = ((base % mod) + mod) % mod;
  let exponent = exp;
  while (exponent > 0) {
    if (exponent % 2 === 1) result = (result * factor) % mod;
    factor = (factor * factor) % mod;
    exponent = Math.floor(exponent / 2);
  }
  return result;
}
`;

/** Exact: BigInt arithmetic, no float loss. */
const EXACT = POWERMOD.reference!;

function powerModTool(source: string, suite = POWERMOD.refSuite): ToolEntry {
  const version: ToolVersion = {
    version: '1.0.0-forge',
    hash: 'deadbeef',
    created_at: Date.now(),
    passed_verifier: true,
    score: 1,
    promoted: true,
    verifier_notes: 'GENESIS RE-VERIFIED: PASSED (100% of 4 assertions)',
    source_code: source,
    test_suite_code: suite,
  };
  return {
    name: 'powerMod',
    domain: 'math',
    entrypoint: '.selfhosted/tools/powerMod.mjs',
    description: '[Capability Forge] Modular exponentiation',
    currentVersion: '1.0.0-forge',
    versions: [version],
    healthStatus: 'healthy',
    anomalyCount: 0,
  };
}

describe('promoted-tool quality audit', () => {
  it('catches the promoted powerMod that passes its suite but is wrong at scale', () => {
    const tool = powerModTool(DOUBLE_BASED);
    const verdict = auditVersion(tool, tool.versions[0]) as AuditedVersion | AuditSkip;

    expect('gateOk' in verdict).toBe(true);
    const audited = verdict as AuditedVersion;
    expect(audited.gateOk).toBe(false);
    expect(audited.reasons.join(' ')).toMatch(/precision|diverges from the reference at scale/);
    // The suite verdict was genuinely green — the gate is what rejects it.
    expect(audited.reasons.join(' ')).not.toMatch(/stored suite fails/);
  });

  it('passes the exact implementation', () => {
    const tool = powerModTool(EXACT);
    const verdict = auditVersion(tool, tool.versions[0]) as { gateOk: boolean; evidence: string };
    expect(verdict.gateOk).toBe(true);
    expect(verdict.evidence).toBe('differential');
  });

  it('degrades the tool and clears passed_verifier when the gate fails', () => {
    const tool = powerModTool(DOUBLE_BASED);
    const summary = sweepPromotedTools([tool], { budget: 5 });

    expect(summary.failed).toBe(1);
    expect(summary.passed).toBe(0);
    expect(tool.healthStatus).toBe('degraded');
    expect(tool.versions[0].passed_verifier).toBe(false);
    expect(tool.versions[0].verifier_notes).toMatch(/QUALITY GATE FAILED/);
    expect(tool.versions[0].quality_audit?.gateOk).toBe(false);
  });

  it('leaves a correct tool healthy', () => {
    const tool = powerModTool(EXACT);
    sweepPromotedTools([tool], { budget: 5 });

    expect(tool.healthStatus).toBe('healthy');
    expect(tool.versions[0].passed_verifier).toBe(true);
    expect(tool.versions[0].quality_audit?.gateOk).toBe(true);
  });

  it('caches by source hash, so an unchanged tool is judged once', () => {
    const tool = powerModTool(EXACT);
    const first = sweepPromotedTools([tool], { budget: 5 });
    expect(first.audited).toBe(1);

    const second = sweepPromotedTools([tool], { budget: 5 });
    expect(second.audited).toBe(0);
    expect(second.cached).toBe(1);

    // A code change invalidates the verdict and it is judged again.
    tool.versions[0].source_code = `${EXACT}\n// touched\n`;
    const third = sweepPromotedTools([tool], { budget: 5 });
    expect(third.audited).toBe(1);
  });

  it('reports unjudgeable versions as skips, never as passes', () => {
    const noSuite = powerModTool(EXACT, '');
    const ambiguous = powerModTool(
      'export function alpha(){return 1;}\nexport function beta(){return 2;}',
      'assert alpha() === 1;\nassert beta() === 2;',
    );
    const summary = sweepPromotedTools([noSuite, ambiguous], { budget: 5 });

    expect(summary.passed).toBe(0);
    expect(summary.skipped).toBe(2);
    expect(summary.skips.map((s) => s.reason).sort()).toEqual(['no_entrypoint', 'no_suite']);
  });

  it('never claims behavioral evidence it did not gather', () => {
    // No forge spec by this name, so no oracle: only determinism/mutation run,
    // which most wrong code passes. Correctness rests on the asserts alone and
    // the verdict says so.
    const tool: ToolEntry = {
      name: 'mysteryTool',
      domain: 'coding',
      entrypoint: '.selfhosted/tools/mysteryTool.mjs',
      description: 'unknown provenance',
      currentVersion: '1.0.0',
      healthStatus: 'healthy',
      versions: [
        {
          version: '1.0.0',
          hash: 'abc',
          created_at: Date.now(),
          passed_verifier: true,
          score: 1,
          promoted: true,
          verifier_notes: 'GENESIS RE-VERIFIED: PASSED (100% of 2 assertions)',
          source_code: '/** t */\nexport function mysteryTool(o) { return o; }',
          // Unquoted object keys: the suite calls the tool, but the call args are
          // not JSON-safe, so no probe has any input to run on.
          test_suite_code: 'assert mysteryTool({a: 1}).a === 1;\nassert mysteryTool({b: 2}).b === 2;',
        },
      ],
    };
    const summary = sweepPromotedTools([tool], { budget: 5 });
    expect(summary.passed).toBe(1);
    expect(summary.behavioralGap).toBe(1);
    expect(tool.versions[0].quality_audit?.evidence).toBe('suite');
    expect(tool.healthStatus).toBe('healthy');
  });

  it('respects the budget and reports what is still pending', () => {
    const registry = [1, 2, 3].map(() => powerModTool(EXACT));
    // Distinct tools so the hash cache does not collapse them; only the name matters here.
    registry.forEach((t, i) => {
      t.name = `powerMod${i}`;
    });
    const summary = sweepPromotedTools(registry, { budget: 1 });
    expect(summary.audited).toBe(1);
    expect(summary.stillPending).toBe(2);
  });
});

describe('entrypoint derivation', () => {
  const version = (source: string, suite = ''): ToolVersion => ({
    version: '1.0.0',
    hash: 'h',
    created_at: 0,
    passed_verifier: true,
    score: 1,
    promoted: true,
    verifier_notes: '',
    source_code: source,
    test_suite_code: suite,
  });
  const tool = (name: string): ToolEntry => ({
    name,
    domain: 'coding',
    entrypoint: '',
    description: '',
    versions: [],
  });

  it('prefers the symbol the suite actually calls, even when the tool is named differently', () => {
    // The registry names tools, not symbols: `cache_optimizer_l2` carries L2Cache.
    const e = entrypointFor(tool('cache_optimizer_l2'), version('export class L2Cache { get(){ return 1; } }', 'const c = new L2Cache();'));
    expect(e).toEqual({ name: 'L2Cache', kind: 'class' });
  });

  it('refuses to guess between two symbols the suite exercises', () => {
    const e = entrypointFor(
      tool('twoUp'),
      version('export function a(){return 1;}\nexport function b(){return 2;}', 'assert a() === 1;\nassert b() === 2;'),
    );
    expect(e).toBeUndefined();
  });

  it('returns nothing for a version with no source', () => {
    expect(entrypointFor(tool('x'), version(''))).toBeUndefined();
  });
});