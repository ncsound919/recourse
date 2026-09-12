import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { createSynergyRouter } from '../../src/routes/synergy.js';
import type { RawMethod } from '../../src/lib/synergy/methodIndex.js';
import type { RecourseProblem } from '../../src/lib/problemArchive.js';

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
});
