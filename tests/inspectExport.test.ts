import { describe, it, expect } from 'vitest';
import { toInspectSamples, renderInspectJsonl } from '../src/lib/inspectExport';
import type { ToolEntry } from '../src/types';

function gene(name: string, src: string, suite: string, domain: any = 'coding'): ToolEntry {
  return {
    name, domain, entrypoint: `src/tools/${name}.ts`, description: 'desc',
    versions: [{ version: '1.0.0', hash: 'h1', created_at: 0, passed_verifier: true, score: 0.9, promoted: true, verifier_notes: '', source_code: src, test_suite_code: suite }],
    currentVersion: '1.0.0', healthStatus: 'healthy', anomalyCount: 0,
  } as ToolEntry;
}

describe('Inspect exporter', () => {
  it('emits one sample per gene with its source + suite for grading', () => {
    const samples = toInspectSamples([gene('merkle_a', 'export function a(){}', 'assert a();')]);
    expect(samples).toHaveLength(1);
    expect(samples[0].id).toBe('recourse-merkle_a');
    expect(samples[0].ideal).toBe('export function a(){}');
    expect(samples[0].metadata.test_suite_code).toBe('assert a();');
  });

  it('skips genes with no live source', () => {
    const g = gene('x', 'code', 'assert true;');
    g.versions[0].source_code = '';
    expect(toInspectSamples([g])).toHaveLength(0);
  });

  it('renders valid JSONL', () => {
    const samples = toInspectSamples([gene('a', 'export function a(){return 1}', 'assert a()===1;')]);
    const jsonl = renderInspectJsonl(samples);
    const lines = jsonl.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(() => JSON.parse(lines[0])).not.toThrow();
  });
});
