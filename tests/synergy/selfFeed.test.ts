import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import {
  registryMethodSignatures,
  archiveProblemSignatures,
  selfFeedSynergyScan,
} from '../../src/lib/synergy/selfFeed.js';
import type { ToolEntry } from '../../src/types.js';
import type { RecourseProblem } from '../../src/lib/problemArchive.js';

const TEST_FILE = join(tmpdir(), `recourse-test-self-feed-map-${process.pid}.json`);
const TEST_LEDGER = join(tmpdir(), `recourse-test-self-feed-ledger-${process.pid}.jsonl`);

beforeAll(() => {
  process.env.SYNERGY_MAP_FILE = TEST_FILE;
  process.env.TREND_LEDGER_FILE = TEST_LEDGER;
  fs.rmSync(TEST_FILE, { force: true });
  fs.rmSync(TEST_LEDGER, { force: true });
});

afterAll(() => {
  fs.rmSync(TEST_FILE, { force: true });
  fs.rmSync(TEST_LEDGER, { force: true });
  delete process.env.SYNERGY_MAP_FILE;
  delete process.env.TREND_LEDGER_FILE;
});

function tool(name: string, domain: ToolEntry['domain'], source: string, suite?: string): ToolEntry {
  return {
    name,
    domain,
    entrypoint: `src/tools/${name}.ts`,
    description: name,
    currentVersion: '1.0.0',
    versions: [{ version: '1.0.0', hash: 'h', created_at: 0, passed_verifier: true, score: 1, promoted: true, verifier_notes: 'test', source_code: source, ...(suite ? { test_suite_code: suite } : {}) }],
    healthStatus: 'healthy',
    anomalyCount: 0,
  };
}

function problem(id: string, domain: string, title: string, acceptanceTest: string): RecourseProblem {
  return { id, domain, title, statement: `${title} statement`, acceptanceTest };
}

describe('registryMethodSignatures', () => {
  it('extracts a method from a current promoted source', () => {
    const { methods, rejected } = registryMethodSignatures([
      tool('sumList', 'math', 'export function sumList(xs) { return xs.reduce(function (s, x) { return s + x; }, 0); }'),
    ]);
    expect(rejected.length).toBe(0);
    expect(methods.length).toBe(1);
    expect(methods[0].name).toBe('sumList');
    expect(methods[0].domain).toBe('math');
    expect(methods[0].source).toBe('tool');
  });

  it('rejects a non-deterministic source with a recorded reason', () => {
    const { methods, rejected } = registryMethodSignatures([
      tool('rand', 'math', 'export function rand() { return Math.random(); }'),
    ]);
    expect(methods.length).toBe(0);
    expect(rejected.length).toBe(1);
    expect(rejected[0].reason).toMatch(/rng/);
  });

  it('skips tools with no current source', () => {
    const t = tool('empty', 'math', '');
    const { methods } = registryMethodSignatures([t]);
    expect(methods.length).toBe(0);
  });
});

describe('archiveProblemSignatures', () => {
  it('extracts a problem with a real acceptance test', () => {
    const out = archiveProblemSignatures([
      problem('p1', 'math', 'Sum a list', 'assert sumList([1,2,3]) === 6;'),
    ]);
    expect(out.length).toBe(1);
    expect(out[0].domain).toBe('math');
    expect(out[0].acceptanceTest).toContain('sumList');
  });

  it('drops problems with no acceptance test', () => {
    const out = archiveProblemSignatures([
      { id: 'p2', domain: 'math', title: 'No test', statement: 'x', acceptanceTest: '' },
    ]);
    expect(out.length).toBe(0);
  });
});

describe('selfFeedSynergyScan', () => {
  it('produces cross-domain candidates from the live corpus', () => {
    const registry: ToolEntry[] = [
      tool('demandForecast', 'math', 'export function demandForecast(series) { const prediction = series[0]; return prediction; }'),
      tool('caesarCipher', 'cyber_defense', 'export function caesarCipher(s, n) { return s; }'),
    ];
    const problems: RecourseProblem[] = [
      problem('p_forecast', 'logistics', 'Forecast demand', 'assert demandForecast([1,2,3]) === 1;'),
    ];
    // The problem statement shares the controlled-vocabulary term 'prediction'
    // with the method source, bridging math -> logistics.
    problems[0].statement = 'Compute a prediction from a series of demand observations.';
    const scan = selfFeedSynergyScan(registry, problems);
    expect(scan.methods.length).toBe(2);
    expect(scan.problems.length).toBe(1);
    expect(scan.candidates.length).toBeGreaterThan(0);
    expect(scan.manifest).toHaveLength(64);
    expect(scan.map.candidates.length).toBe(scan.candidates.length);
  });

  it('yields an empty map (never fabricates) for an empty corpus', () => {
    const scan = selfFeedSynergyScan([], []);
    expect(scan.methods.length).toBe(0);
    expect(scan.problems.length).toBe(0);
    expect(scan.candidates.length).toBe(0);
    expect(scan.map.candidates.length).toBe(0);
  });
});
