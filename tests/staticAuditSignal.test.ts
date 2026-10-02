// Tests for the external static-analysis stuck-signal source.
//
// The behaviour that matters is NOT "semgrep finds things" — that depends on an
// external binary being installed. It is the honesty contract around the edges:
// an absent analyzer must never become a finding, an unscanned tree must never
// read as clean, and a systemic rule must collapse to ONE signal rather than N.

import { describe, it, expect } from 'vitest';

import {
  runStaticAudit,
  staticAuditSignals,
  staticAuditSummary,
  type StaticAuditResult,
} from '../src/lib/staticAuditSignal.js';

const ok = (findings: StaticAuditResult['findings']): StaticAuditResult => ({
  available: true,
  scanned: true,
  version: '1.162.0',
  findings,
  errors: [],
  durationMs: 1234,
  filesScanned: 40,
});

describe('staticAuditSignals — honesty contract', () => {
  it('emits ZERO signals when the analyzer is unavailable', () => {
    const result: StaticAuditResult = {
      available: false, scanned: false, findings: [], errors: [], durationMs: 0,
      reason: 'semgrep is not on PATH',
    };
    // The critical property: absence of an opinion must not be laundered into
    // a finding the repair loop would escalate.
    expect(staticAuditSignals(result)).toEqual([]);
  });

  it('emits ZERO signals when available but never scanned', () => {
    const result: StaticAuditResult = {
      available: true, scanned: false, findings: [], errors: [], durationMs: 0,
    };
    expect(staticAuditSignals(result)).toEqual([]);
  });

  it('emits ZERO signals for a clean scan (does not invent work)', () => {
    expect(staticAuditSignals(ok([]))).toEqual([]);
  });

  it('collapses one systemic rule into ONE signal carrying the real count', () => {
    const result = ok([{
      rule: 'path-join-resolve-traversal',
      count: 41,
      examples: [{ file: 'src/lib/fleetDevelopment.ts', line: 120 }],
      message: 'Possible path traversal',
    }]);
    const signals = staticAuditSignals(result);
    expect(signals).toHaveLength(1);
    expect(signals[0].id).toBe('static-audit:path-join-resolve-traversal');
    expect(signals[0].detail).toContain('41x');
  });

  it('never escalates on threshold 1 — needs repeated passes to count as stuck', () => {
    // A single external opinion should not, by itself, trigger repair dispatch.
    const signals = staticAuditSignals(ok([{ rule: 'spawn-shell-true', count: 2, examples: [], message: '' }]));
    expect(signals[0].threshold).toBeGreaterThan(1);
    expect(signals[0].failing).toBe(true);
  });

  it('caps detail length so a huge finding cannot bloat the stuck list', () => {
    const signals = staticAuditSignals(ok([{
      rule: 'x'.repeat(50),
      count: 3,
      examples: Array.from({ length: 20 }, () => ({ file: 'a'.repeat(80), line: 9 })),
      message: 'm'.repeat(500),
    }]));
    expect(signals[0].detail.length).toBeLessThanOrEqual(400);
  });

  it('uses the caller-supplied signal kind', () => {
    const signals = staticAuditSignals(ok([{ rule: 'r', count: 4, examples: [], message: '' }]), 'verifier');
    expect(signals[0].kind).toBe('verifier');
  });
});

describe('staticAuditSummary', () => {
  it('says unavailable rather than implying a clean scan', () => {
    const s = staticAuditSummary({
      available: false, scanned: false, findings: [], errors: [], durationMs: 0,
      reason: 'semgrep is not on PATH',
    });
    expect(s).toContain('unavailable');
    expect(s).not.toContain('clean');
  });

  it('reports real counts and surfaces scan errors as a coverage gap', () => {
    const s = staticAuditSummary({
      ...ok([{ rule: 'a', count: 5, examples: [], message: '' }, { rule: 'b', count: 2, examples: [], message: '' }]),
      errors: [{ type: 'PartialParsing', message: 'boom' }],
    });
    expect(s).toContain('2 rule(s) matched');
    expect(s).toContain('7 occurrence(s)');
    expect(s).toContain('1 scan error(s)');
  });
});

describe('runStaticAudit', () => {
  it('always returns a shaped result and never throws', async () => {
    // This is the invariant that matters, and it is deliberately exercised
    // WITHOUT spawning semgrep: run against a nonexistent target so the scan is
    // guaranteed not to produce findings, whatever is installed. The property
    // under test is the shape and the unscanned->no-signals guarantee, not
    // semgrep's rule set.
    //
    // The semgrep-spawning path is covered by scripts/_verify-static-audit.mts
    // against the real tree. Spawning it here previously starved
    // tests/codeSafetyOss.test.ts (7 semgrep processes) of CPU under parallel
    // load, producing flaky timeouts in an unrelated file.
    const result = await runStaticAudit({ root: process.cwd(), targets: ['src/lib/__no_such_dir__'], timeoutMs: 30_000 });
    expect(typeof result.available).toBe('boolean');
    expect(typeof result.scanned).toBe('boolean');
    expect(Array.isArray(result.findings)).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);
    // An unscanned or empty result must project to no signals. This is the rule
    // that stops a missing analyzer from being laundered into a finding.
    expect(staticAuditSignals(result)).toEqual([]);
  }, 60_000);
});
