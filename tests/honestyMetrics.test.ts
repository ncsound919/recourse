import { describe, it, expect } from 'vitest';
import {
  assessSourceSubstance,
  isNovelHypothesis,
  normalizeHypothesis,
  domainHealth,
  capabilityReadiness,
  DOMAIN_BROKEN_MIN_GENES,
  DOMAIN_BROKEN_PASS_RATE,
} from '../src/lib/honestyMetrics';

describe('P1.4 assessSourceSubstance (registry quality gate)', () => {
  it('rejects a sub-substance stub (the 9-LOC forge output)', () => {
    expect(assessSourceSubstance('export function f() {}').ok).toBe(false);
    expect(assessSourceSubstance('// just a comment').ok).toBe(false);
  });

  it('rejects a declaration-only stub and a non-export', () => {
    expect(assessSourceSubstance('export function f() {}').ok).toBe(false); // empty body
    expect(assessSourceSubstance('function f() { return 1; }').ok).toBe(false); // no export
    expect(assessSourceSubstance('export const x = 1;').ok).toBe(false); // bare constant, no callable
  });

  it('accepts a real implementation', () => {
    const src = `export function gcdFast(a, b) {\n  while (b) {\n    [a, b] = [b, a % b];\n  }\n  return a;\n}`;
    const v = assessSourceSubstance(src);
    expect(v.ok).toBe(true);
    expect(v.meaningfulLines).toBeGreaterThanOrEqual(3);
  });

  it('ignores comments and blank/brace-only lines when counting substance', () => {
    const padded = `// header\n\n{\n}\nexport const add = (a, b) => a + b;\nexport const sub = (a, b) => a - b;\n`;
    expect(assessSourceSubstance(padded).ok).toBe(true);
  });
});

describe('P1.5 isNovelHypothesis (dream novelty gate)', () => {
  it('normalizes case/punctuation/space', () => {
    expect(normalizeHypothesis('A  Capped, Utilization!')).toBe('a capped utilization');
  });

  it('flags an exact repeat as not novel', () => {
    const recent = [{ hypothesis: 'A capped utilization projector with steps-to-saturation' }];
    expect(isNovelHypothesis('a capped utilization projector with steps to saturation', recent)).toBe(false);
  });

  it('accepts a genuinely new hypothesis', () => {
    const recent = [{ hypothesis: 'A capped utilization projector' }];
    expect(isNovelHypothesis('Entropy delta across windows is a cheaper repetition signal', recent)).toBe(true);
  });

  it('treats an empty hypothesis as not novel', () => {
    expect(isNovelHypothesis('', [])).toBe(false);
  });
});

describe('P1.6 domainHealth (domain honesty)', () => {
  it('marks a near-empty / near-zero domain BROKEN', () => {
    expect(domainHealth(1, 0.01).broken).toBe(true); // biotech's real reading
    expect(domainHealth(10, 0.1).broken).toBe(true);
    expect(domainHealth(DOMAIN_BROKEN_MIN_GENES - 1, 1).broken).toBe(true);
  });

  it('does not mark a healthy domain broken', () => {
    expect(domainHealth(200, 0.95).broken).toBe(false);
    expect(domainHealth(DOMAIN_BROKEN_MIN_GENES, DOMAIN_BROKEN_PASS_RATE).broken).toBe(false);
  });
});

describe('P1.7 capabilityReadiness', () => {
  it('is the mean of benchmark solved% and verified-repair rate', () => {
    const r = capabilityReadiness({ benchmarkSolved: 28, benchmarkTotal: 50, verified: 3, regressed: 1 });
    expect(r.score).toBe(0.66); // (0.56 + 0.75) / 2
  });

  it('is 0 when nothing has been measured (never a fabricated high number)', () => {
    expect(capabilityReadiness({ benchmarkSolved: 0, benchmarkTotal: 0, verified: 0, regressed: 0 }).score).toBe(0);
  });

  it('excludes pending repairs (only resolved outcomes count)', () => {
    const a = capabilityReadiness({ benchmarkSolved: 0, benchmarkTotal: 50, verified: 0, regressed: 0 });
    expect(a.score).toBe(0); // pending-only must not inflate
  });
});
