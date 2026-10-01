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

describe('codeSafetyOss', () => {
  it('reports semgrep availability', () => {
    const available = isSemgrepAvailable();
    expect(typeof available).toBe('boolean');
  });

  it('screens safe code', () => {
    const result = screenCodeWithSemgrep('export function add(a: number, b: number) { return a + b; }');
    if (isSemgrepAvailable()) {
      expect(result.scanned).toBe(true);
      expect(result.violations.filter(v => v.severity === 'error').length).toBe(0);
    } else {
      expect(result.scanned).toBe(false);
      expect(result.reason).toContain('not installed');
    }
  });

  it('screens code with eval', () => {
    const result = screenCodeWithSemgrep('export function test() { return eval("1+1"); }');
    if (result.scanned) {
      expect(result.violations.length).toBeGreaterThan(0);
    }
  });

  it('screens code with process access', () => {
    const result = screenCodeWithSemgrep('export function test() { return process.env; }');
    if (result.scanned) {
      expect(result.violations.length).toBeGreaterThan(0);
    }
  });

  it('handles empty code', () => {
    const result = screenCodeWithSemgrep('');
    expect(result).toBeDefined();
  });

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
