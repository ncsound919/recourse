import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { recordSynergyScan } from '../../src/lib/synergy/ledger.js';
import { readLedger, verifyLedgerChain } from '../../src/lib/trendLedger.js';
import type { SynergyMap } from '../../src/lib/synergy/types.js';

const TEST_LEDGER = `${process.cwd()}\\data\\test-synergy-ledger.jsonl`;

beforeAll(() => {
  process.env.TREND_LEDGER_FILE = TEST_LEDGER;
  fs.rmSync(TEST_LEDGER, { force: true });
});

const map: SynergyMap = {
  engineVersion: '0.1.0', generatedAtRun: 'run:test', domains: ['mathematics', 'logistics'],
  edges: [{ from: 'mathematics', to: 'logistics', kind: 'candidate', score: 0.8, passes: 0, attempts: 1, backingIds: ['tc_1'] }],
  candidates: [{
    id: 'tc_1', methodId: 'm', problemId: 'p', fromDomain: 'mathematics', toDomain: 'logistics',
    bridges: [], score: 0.8, support: 1, prediction: 'pass', falsification: '', filters: [], engineVersion: '0.1.0',
  }],
  manifestHash: 'abc123',
};

describe('synergy ledger wiring', () => {
  it('appends a chained crossdomain_bridge insight', () => {
    const before = readLedger().length;
    const rec = recordSynergyScan(map);
    expect(rec).not.toBeNull();
    expect(rec?.templateId).toBe('crossdomain_bridge');
    expect(rec?.provenanceRoot).toBe('abc123');
    expect(rec?.hypothesisId).toBe('tc_1');
    expect(rec?.confidence).toBe(0.8);
    const verify = verifyLedgerChain();
    expect(verify.valid).toBe(true);
    expect(verify.length).toBe(before + 1);
  });

  it('handles an empty map honestly', () => {
    const rec = recordSynergyScan({ ...map, candidates: [] });
    expect(rec?.hypothesisId).toBe('none');
    expect(rec?.confidence).toBe(0);
  });

  it('chains consecutive records', () => {
    const r1 = recordSynergyScan(map);
    const r2 = recordSynergyScan({ ...map, manifestHash: 'def456' });
    expect(r2?.prevInsightHash).toBe(r1?.hash);
  });
});
