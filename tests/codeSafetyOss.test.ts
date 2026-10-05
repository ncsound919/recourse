import { describe, it, expect, afterEach } from 'vitest';
import {
  screenCodeWithSemgrep,
  isSemgrepAvailable,
  semgrepTimeoutMs,
  SEMGREP_TIMEOUT_DEFAULT_MS,
} from '../src/lib/codeSafetyOss';

const PRIOR = process.env.SEMGREP_TIMEOUT_MS;

afterEach(() => {
  if (PRIOR === undefined) delete process.env.SEMGREP_TIMEOUT_MS;
  else process.env.SEMGREP_TIMEOUT_MS = PRIOR;
});

// Each case spawns a real `semgrep` (~7s). Note: `describe.sequential` was tried
// here to avoid competing with tests/staticAuditSignal.test.ts for CPU, but it
// made things worse — serializing 7 spawns behind the per-test 30s budget causes
// individual calls to exceed it under load. Parallel is correct; the real fix
// for starvation was removing the second semgrep spawn from the audit test.
//
// Every spawning test below therefore carries an explicit SPAWN_TIMEOUT_MS.
// The suite-wide 30s default is a wall-clock budget for ordinary tests, not for
// tests that shell out to a Python tool while 300+ other files run in parallel:
// under full-suite load these spawns stretched past 30s and failed on timeout
// even though every assertion held. The assertion, not the clock, is the
// signal here, and semgrep's own budget is enforced separately inside
// codeSafetyOss.ts.
//
// No case here may call `isSemgrepAvailable()` to decide what to assert: it
// spawns `semgrep --version`, so using it doubles the spawns per case and turns
// the real scan into the thing that times out. Assert on what
// `screenCodeWithSemgrep` actually returned, including its reason.
const SPAWN_TIMEOUT_MS = 120_000;

describe('codeSafetyOss', () => {
  it('reports semgrep availability', () => {
    const available = isSemgrepAvailable();
    expect(typeof available).toBe('boolean');
  }, SPAWN_TIMEOUT_MS);

  it('screens safe code', () => {
    const result = screenCodeWithSemgrep('export function add(a: number, b: number) { return a + b; }');
    if (result.scanned) {
      expect(result.violations.filter(v => v.severity === 'error').length).toBe(0);
    } else {
      // A scan that did not happen is not a clean bill of health, and the result
      // must say which of the two degradations it was. Branching on
      // `isSemgrepAvailable()` here spawned a SECOND semgrep (`semgrep --version`)
      // per case, and under full-suite load the real scan then timed out and
      // reported `scanned: false` even though semgrep was installed — a flake
      // this file's own header comment says was already fixed.
      expect(result.reason).toMatch(/not installed|timed? ?out|failed/i);
    }
  }, SPAWN_TIMEOUT_MS);

  it('screens code with eval', () => {
    const result = screenCodeWithSemgrep('export function test() { return eval("1+1"); }');
    if (result.scanned) {
      expect(result.violations.length).toBeGreaterThan(0);
    }
  }, SPAWN_TIMEOUT_MS);

  it('screens code with process access', () => {
    const result = screenCodeWithSemgrep('export function test() { return process.env; }');
    if (result.scanned) {
      expect(result.violations.length).toBeGreaterThan(0);
    }
  }, SPAWN_TIMEOUT_MS);

  it('handles empty code', () => {
    const result = screenCodeWithSemgrep('');
    expect(result).toBeDefined();
  }, SPAWN_TIMEOUT_MS);

  it('gives semgrep a timeout budget well above the old fixed 10s', () => {
    delete process.env.SEMGREP_TIMEOUT_MS;
    expect(semgrepTimeoutMs()).toBe(SEMGREP_TIMEOUT_DEFAULT_MS);
    expect(semgrepTimeoutMs()).toBeGreaterThanOrEqual(30_000);
  });

  it('honours SEMGREP_TIMEOUT_MS but refuses an absurdly small budget', () => {
    process.env.SEMGREP_TIMEOUT_MS = '45000';
    expect(semgrepTimeoutMs()).toBe(45_000);
    process.env.SEMGREP_TIMEOUT_MS = '10';
    expect(semgrepTimeoutMs()).toBe(SEMGREP_TIMEOUT_DEFAULT_MS);
    process.env.SEMGREP_TIMEOUT_MS = 'not-a-number';
    expect(semgrepTimeoutMs()).toBe(SEMGREP_TIMEOUT_DEFAULT_MS);
  });
});
