// tests/synergy/decisionBridge.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { decisionSynergyInputs } from '../../src/lib/synergy/decisionBridge.js';
import { buildSynergyMap } from '../../src/lib/synergy/synergyMap.js';
import { writeSynergyMap } from '../../src/lib/synergy/store.js';
import type { TransferCandidate } from '../../src/lib/synergy/types.js';

const TEST_FILE = `${process.cwd()}\\data\\test-decision-bridge-map.json`;

function candidate(id: string, from: string, to: string, score: number): TransferCandidate {
  return {
    id, methodId: 'm', problemId: 'p', fromDomain: from, toDomain: to,
    bridges: [], score, support: 1, prediction: 'pass', falsification: '',
    filters: [], engineVersion: '0.1.0',
  };
}

beforeAll(() => {
  process.env.SYNERGY_MAP_FILE = TEST_FILE;
  fs.rmSync(TEST_FILE, { force: true });
});

afterAll(() => {
  fs.rmSync(TEST_FILE, { force: true });
  delete process.env.SYNERGY_MAP_FILE;
});

describe('decision bridge', () => {
  it('returns an honest empty input when no map exists', () => {
    fs.rmSync(TEST_FILE, { force: true });
    expect(decisionSynergyInputs()).toEqual({ crossDomainSynergyByDomain: {}, source: 'none' });
  });

  it('fails soft on a corrupt map instead of throwing', () => {
    fs.writeFileSync(TEST_FILE, '{not json', 'utf-8');
    expect(decisionSynergyInputs()).toEqual({ crossDomainSynergyByDomain: {}, source: 'none' });
  });

  it('maps sector scores onto ToolDomains and merges multiple sectors by max', () => {
    const map = buildSynergyMap(
      [
        candidate('tc_math', 'mathematics', 'logistics', 0.8),
        candidate('tc_sport', 'sports', 'health_oncology', 0.6),
        candidate('tc_aging', 'aging', 'health_oncology', 0.9),
      ],
      { generatedAtRun: 'run:test' },
    );
    writeSynergyMap(map);
    const out = decisionSynergyInputs();
    expect(out.source).toBe('map');
    expect(out.manifestHash).toBe(map.manifestHash);
    // Logistics maps to two ToolDomains.
    expect(out.crossDomainSynergyByDomain.systemic).toBeGreaterThan(0);
    expect(out.crossDomainSynergyByDomain.coding).toBeGreaterThan(0);
    // health_oncology + sports + aging all map to biotech; max (aging) must win,
    // not the average (0.375) or the minimum (0.3).
    expect(out.crossDomainSynergyByDomain.biotech).toBeGreaterThan(0.375);
    expect(out.crossDomainSynergyByDomain.biotech).toBeLessThanOrEqual(1);
  });

  it('is deterministic (canonical key order)', () => {
    const map = buildSynergyMap(
      [candidate('tc_math', 'mathematics', 'logistics', 0.8)],
      { generatedAtRun: 'run:test' },
    );
    writeSynergyMap(map);
    const a = decisionSynergyInputs();
    const b = decisionSynergyInputs();
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('ignores sectors that have no ToolDomain mapping', () => {
    const map = buildSynergyMap(
      [candidate('tc_u', 'unknown_a', 'unknown_b', 0.9)],
      { generatedAtRun: 'run:test' },
    );
    writeSynergyMap(map);
    const out = decisionSynergyInputs();
    expect(out.source).toBe('map');
    expect(out.crossDomainSynergyByDomain).toEqual({});
  });
});
