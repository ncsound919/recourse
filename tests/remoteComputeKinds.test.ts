import { describe, it, expect } from 'vitest';
import { buildRemoteJob, buildSurvivalNotebook, buildMetaAnalysisNotebook } from '../src/lib/remoteCompute.js';

describe('train_survival kind', () => {
  it('builds a CPU Cox notebook with the envelope and lifelines install', () => {
    const job = buildRemoteJob('train_survival', {
      features: [[1, 2], [2, 1], [3, 3], [4, 1]],
      durations: [5, 6, 7, 8],
      events: [1, 1, 0, 1],
    });
    expect(job).not.toBeNull();
    expect(job!.hardware?.type).toBe('cpu');
    const src = (job!.payload as any).cells[0].source as string;
    expect(src).toContain('__RECOURSE_RESULT__');
    expect(src).toContain('CoxPHFitter');
    expect(src).toContain('pip');
  });
  it('rejects mismatched lengths', () => {
    expect(buildRemoteJob('train_survival', { features: [[1]], durations: [1, 2], events: [1, 0] })).toBeNull();
  });
});

describe('meta_analysis kind', () => {
  it('builds a DL random-effects notebook with bootstrap', () => {
    const nb = buildMetaAnalysisNotebook({ items: [{ conform: 5, total: 8 }, { conform: 6, total: 8 }] });
    const src = nb.notebook.cells[0].source as string;
    expect(src).toContain('__RECOURSE_RESULT__');
    expect(src).toContain('tau2');
    expect(src).toContain('percentile');
  });
  it('gates on <2 items', () => {
    expect(buildRemoteJob('meta_analysis', { items: [{ conform: 1, total: 2 }] })).toBeNull();
    expect(buildRemoteJob('meta_analysis', { items: [{ conform: 5, total: 8 }, { conform: 6, total: 8 }] })).not.toBeNull();
  });
});
