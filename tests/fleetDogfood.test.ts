import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runFleetDogfoodCycle, readFleetDogfood, fleetDogfoodPath } from '../src/lib/fleetDogfood';

const dirs: string[] = [];
function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dogfood-'));
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  delete process.env.SYNERGY_MAP_FILE;
  delete process.env.FLEET_DOGFOOD_FILE;
  delete process.env.TREND_LEDGER_FILE;
  delete process.env.DRAYMOND_URL;
});

function writeSynergyMap(file: string) {
  fs.writeFileSync(file, JSON.stringify({
    engineVersion: '0.1.0',
    generatedAtRun: 'test',
    domains: ['health_oncology', 'sports'],
    manifestHash: 'mh',
    edges: [],
    candidates: [{
      id: 'tc_1', methodId: 'method:tool:fit', problemId: 'problem:protocol',
      fromDomain: 'health_oncology', toDomain: 'sports',
      bridges: [{ term: 'optimization', weightAB: 0.7, weightBC: 0.6, score: 0.6, docs: 3 }],
      score: 0.6, support: 1, prediction: 'pass', falsification: 'f', filters: [], engineVersion: '0.1.0',
    }],
  }), 'utf-8');
}

describe('fleetDogfood — the bidirectional loop runs and reports honestly', () => {
  it('builds a local cross-domain graph and persists a snapshot even offline', async () => {
    const dir = tmpDir();
    process.env.SYNERGY_MAP_FILE = path.join(dir, 'synergy-map.json');
    process.env.FLEET_DOGFOOD_FILE = path.join(dir, 'fleet-dogfood.json');
    process.env.TREND_LEDGER_FILE = path.join(dir, 'trend-ledger.jsonl');
    writeSynergyMap(process.env.SYNERGY_MAP_FILE);

    const snap = await runFleetDogfoodCycle({ localOnly: true });

    expect(snap.version).toBe(1);
    expect(snap.draymond.online).toBe(false);
    expect(snap.graph.structural).toBeGreaterThanOrEqual(1);
    expect(snap.graph.links).toBeGreaterThanOrEqual(1);
    expect(snap.links[0].from).toBe('health_oncology');
    // Draymond is offline, so the findings are assembled but not persisted.
    expect(snap.export.attempted).toBeGreaterThanOrEqual(1);
    expect(snap.export.persisted).toBe(0);
    expect(snap.steps.join(' ')).toContain('offline');

    // Snapshot is durable and readable.
    expect(readFleetDogfood()!.graph.manifestHash).toBe(snap.graph.manifestHash);
    expect(fs.existsSync(fleetDogfoodPath())).toBe(true);
  });

  it('is a no-op graph (not a fabricated one) when there is no synergy map', async () => {
    const dir = tmpDir();
    process.env.SYNERGY_MAP_FILE = path.join(dir, 'missing.json');
    process.env.FLEET_DOGFOOD_FILE = path.join(dir, 'fleet-dogfood.json');
    process.env.TREND_LEDGER_FILE = path.join(dir, 'trend-ledger.jsonl');

    const snap = await runFleetDogfoodCycle({ localOnly: true });
    expect(snap.graph.links).toBe(0);
    expect(snap.export.attempted).toBe(0);
  });
});
