import { describe, it, expect } from 'vitest';
import { diffSnapshots, renderUpgradeReport } from '../src/lib/upgradeReport';

describe('upgrade report builder (phase 5 #17)', () => {
  it('computes real before/after deltas', () => {
    const d = diffSnapshots(
      { registryTools: 10, liveSelfHosted: 2, promoted: 5, verifierPassRate: 0.9 },
      { registryTools: 12, liveSelfHosted: 3, promoted: 6, verifierPassRate: 0.95 },
    );
    expect(d.registryTools).toEqual({ before: 10, after: 12, delta: 2 });
    expect(d.liveSelfHosted.delta).toBe(1);
    expect(d.promoted.delta).toBe(1);
    expect(d.verifierPassRate.delta).toBe(0.05);
  });

  it('reports verified improvement only when a metric actually gained', () => {
    const md = renderUpgradeReport({
      before: { registryTools: 10, liveSelfHosted: 2, promoted: 5 },
      after: { registryTools: 11, liveSelfHosted: 3, promoted: 6 },
      date: new Date('2026-01-01'),
    });
    expect(md).toContain('Verdict: verified improvement this cycle');
    expect(md).toContain('2026-01-01');
    expect(md).toContain('+1');
  });

  it('honestly says no improvement when nothing cleared the gate', () => {
    const md = renderUpgradeReport({
      before: { registryTools: 10, liveSelfHosted: 2, promoted: 5, verifierPassRate: 0.9 },
      after: { registryTools: 10, liveSelfHosted: 2, promoted: 5, verifierPassRate: 0.9 },
    });
    expect(md).toContain('no measurable improvement this cycle');
  });

  it('flags a regression (pass rate fell)', () => {
    const md = renderUpgradeReport({
      before: { registryTools: 10, liveSelfHosted: 2, promoted: 5, verifierPassRate: 0.9 },
      after: { registryTools: 10, liveSelfHosted: 2, promoted: 5, verifierPassRate: 0.7 },
    });
    expect(md).toContain('regression detected');
  });

  it('renders notable events when provided', () => {
    const md = renderUpgradeReport({ before: {}, after: {}, events: ['promoted lru_cache v2'] });
    expect(md).toContain('promoted lru_cache v2');
  });
});
