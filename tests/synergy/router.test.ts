import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { createSynergyRouter } from '../../src/routes/synergy.js';
import { writeSynergyMap } from '../../src/lib/synergy/store.js';
import { buildSynergyMap } from '../../src/lib/synergy/synergyMap.js';
import type { RawMethod } from '../../src/lib/synergy/methodIndex.js';
import type { RecourseProblem } from '../../src/lib/problemArchive.js';
import type { TransferCandidate } from '../../src/lib/synergy/types.js';

const TEST_FILE = `${process.cwd()}\\data\\test-synergy-router-map.json`;
const TEST_LEDGER = `${process.cwd()}\\data\\test-synergy-router-ledger.jsonl`;

beforeAll(() => {
  process.env.SYNERGY_MAP_FILE = TEST_FILE;
  process.env.TREND_LEDGER_FILE = TEST_LEDGER;
  fs.rmSync(TEST_FILE, { force: true });
  fs.rmSync(TEST_LEDGER, { force: true });
});

function handler(path: string) {
  const router = createSynergyRouter() as any;
  const layer = (router.stack ?? []).find((l: any) => l?.route?.path === path);
  return layer.route.stack[0].handle;
}

describe('synergy router', () => {
  it('registers the synergy routes', () => {
    const router = createSynergyRouter() as any;
    const paths = (router.stack ?? []).map((l: any) => l?.route?.path).filter(Boolean);
    for (const p of ['/synergy/domains', '/synergy/map', '/synergy/candidates', '/synergy/score/:domain', '/synergy/scan']) {
      expect(paths).toContain(p);
    }
  });

  it('domains returns the registry + unverified list', async () => {
    const res = { json: (v: unknown) => (res as any).payload = v } as any;
    await handler('/synergy/domains')({} as any, res);
    expect(res.payload.success).toBe(true);
    expect(res.payload.domains.length).toBe(7);
  });

  it('score returns 0 when no map exists yet', async () => {
    const res = { json: (v: unknown) => (res as any).payload = v } as any;
    await handler('/synergy/score/:domain')({ params: { domain: 'logistics' } } as any, res);
    expect(res.payload.value).toBe(0);
  });

  it('scan builds and persists a map from real method/problem payloads', async () => {
    const method: RawMethod = { id: 'trendAnalyzer', name: 'Trend analyzer', domain: 'mathematics', source: 'tool', primitives: ['prediction', 'statistics'] };
    // A third non-overlapping method keeps the corpus at 3 docs so the shared
    // bridges are not over-general (df=2 <= 0.9 * 3) and a candidate can form.
    const cipher: RawMethod = { id: 'cipher', name: 'Cipher', domain: 'cybersecurity', source: 'tool', primitives: ['control'] };
    const problem: RecourseProblem = {
      id: 'repro:forecast', domain: 'logistics', title: 'Forecast demand',
      statement: 'Compute a prediction and statistics from a series.',
      acceptanceTest: 'assert true;',
    };
    const res = { json: (v: unknown) => (res as any).payload = v } as any;
    await handler('/synergy/scan')({ body: { methods: [method, cipher], problems: [problem] } } as any, res);
    expect(res.payload.success).toBe(true);
    expect(res.payload.candidates.length).toBeGreaterThan(0);
    expect(res.payload.manifest).toHaveLength(64);
  });

  it('rejects malformed scan bodies with structured 400s', async () => {
    const cases: unknown[] = [
      { methods: 'x', problems: [] },
      { methods: [], problems: [] },
      { methods: [null], problems: [{ id: 'p', acceptanceTest: 'assert true;' }] },
      { methods: [{ id: 'm', name: 'M', domain: 'd', source: 'tool' }], problems: [{ id: 'p' }] },
      { methods: [{ id: 'm', name: 'M', domain: 'd', source: 'tool' }], problems: [{ id: 'p', acceptanceTest: 'x' }], knownPairs: 5 },
    ];
    for (const body of cases) {
      const res: any = {
        status: (c: number) => { res.code = c; return res; },
        json: (v: unknown) => { res.payload = v; return res; },
      };
      await handler('/synergy/scan')({ body } as any, res);
      expect(res.code).toBe(400);
      expect(res.payload.success).toBe(false);
    }
  });

  it('resolve runs the acceptance test, admits a passing adaptation, and records a resolved edge', async () => {
    const candidate: TransferCandidate = {
      id: 'tc_resolve', methodId: 'm', problemId: 'p', fromDomain: 'mathematics', toDomain: 'logistics',
      bridges: [], score: 0.8, support: 1, prediction: 'pass', falsification: 'f', filters: [], engineVersion: '0.1.0',
    };
    writeSynergyMap(buildSynergyMap([candidate], { generatedAtRun: 'run:resolve' }));
    const body = {
      candidate,
      acceptanceTest: 'const a = Mod.f([1,2,3]); assert a === 6;',
      sourceCode: 'export class Mod { static f(xs) { return xs.reduce(function (s, x) { return s + x; }, 0); } }',
    };
    const res: any = { json: (v: unknown) => (res.payload = v) };
    await handler('/synergy/resolve')({ body } as any, res);
    expect(res.payload.success).toBe(true);
    expect(res.payload.result.outcome).toBe('passed');
    expect(res.payload.decision.status).toBe('reproduced');
    expect(res.payload.map.manifestHash).toHaveLength(64);
    const stored = JSON.parse(fs.readFileSync(TEST_FILE, 'utf-8'));
    const edge = stored.edges.find((e: any) => e.from === 'mathematics' && e.to === 'logistics' && e.kind === 'resolved');
    expect(edge).toBeTruthy();
    expect(edge.passes).toBe(1);
  });

  it('rejects malformed resolve bodies with structured 400s', async () => {
    const good: TransferCandidate = {
      id: 'tc_bad', methodId: 'm', problemId: 'p', fromDomain: 'a', toDomain: 'b',
      bridges: [], score: 0.5, support: 1, prediction: 'pass', falsification: 'f', filters: [], engineVersion: '0.1.0',
    };
    const cases: unknown[] = [
      {},
      { candidate: { id: 'x' }, acceptanceTest: 'a', sourceCode: 'c' },
      { candidate: good, acceptanceTest: 5, sourceCode: 'c' },
      { candidate: good, acceptanceTest: 'a', sourceCode: 'c', adaptedBy: 'nope' },
    ];
    for (const body of cases) {
      const res: any = {
        status: (c: number) => { res.code = c; return res; },
        json: (v: unknown) => { res.payload = v; return res; },
      };
      await handler('/synergy/resolve')({ body } as any, res);
      expect(res.code).toBe(400);
      expect(res.payload.success).toBe(false);
    }
  });

  it('returns a structured 500 when the stored map is corrupt', async () => {
    fs.writeFileSync(TEST_FILE, '{not json', 'utf-8');
    const res: any = {
      status: (c: number) => { res.code = c; return res; },
      json: (v: unknown) => { res.payload = v; return res; },
    };
    await handler('/synergy/map')({} as any, res);
    expect(res.code).toBe(500);
    expect(res.payload.success).toBe(false);
  });
});
