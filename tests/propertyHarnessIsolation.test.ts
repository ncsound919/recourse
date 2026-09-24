import { describe, it, expect, vi, beforeEach } from 'vitest';

// Simulate a host where isolated-vm cannot load. The property harness must then
// REFUSE in-process evaluation by default (node:vm is not a security boundary),
// rather than silently dropping to it.
vi.mock('../src/lib/isolatedSandbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/isolatedSandbox')>();
  return { ...actual, isIsolateAvailable: () => false };
});

import { propertyScore, scoreGeneWithProperties } from '../src/dream/property-harness';

const PURE = 'function g(input) { return input; }';

describe('property-harness fails closed without isolation', () => {
  beforeEach(() => {
    delete process.env.RECOURSE_ALLOW_INPROCESS_EVAL;
    delete process.env.RECOURSE_REQUIRE_ISOLATION;
  });

  it('refuses to evaluate when isolated-vm is unavailable (no opt-in)', () => {
    const report = propertyScore(PURE, [1], 1, 5);
    expect(report.available).toBe(false);
    expect(report.score).toBe(0);
  });

  it('returns no reward rather than an in-process score', () => {
    const { reward, propertyReport } = scoreGeneWithProperties(PURE, [1], 1);
    expect(propertyReport.available).toBe(false);
    expect(reward).toBe(0);
  });

  it('with the explicit opt-in it evaluates in-process (unsafe but deliberate)', () => {
    process.env.RECOURSE_ALLOW_INPROCESS_EVAL = '1';
    const report = propertyScore(PURE, [1], 1, 5);
    expect(report.available).toBe(true);
  });
});
