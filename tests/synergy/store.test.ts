// tests/synergy/store.test.ts
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { synergyMapPath, readSynergyMap, writeSynergyMap } from '../../src/lib/synergy/store.js';
import type { SynergyMap } from '../../src/lib/synergy/types.js';

const TEST_FILE = join(tmpdir(), `recourse-test-synergy-map-${process.pid}.json`);

beforeAll(() => {
  process.env.SYNERGY_MAP_FILE = TEST_FILE;
  fs.rmSync(TEST_FILE, { force: true });
});

const map: SynergyMap = {
  engineVersion: '0.1.0', generatedAtRun: 'run:test', domains: ['a', 'b'],
  edges: [], candidates: [], manifestHash: 'deadbeef',
};

describe('synergy map store', () => {
  it('reads null when the file is absent (fail-soft)', () => {
    expect(readSynergyMap()).toBeNull();
    expect(synergyMapPath()).toBe(TEST_FILE);
  });

  it('round-trips a map', () => {
    writeSynergyMap(map);
    expect(readSynergyMap()).toEqual(map);
  });

  it('throws on corrupt content rather than treating it as absent', () => {
    fs.writeFileSync(TEST_FILE, '{not json', 'utf-8');
    expect(() => readSynergyMap()).toThrow(/corrupt/);
  });

  it('throws on an unexpected shape', () => {
    fs.writeFileSync(TEST_FILE, JSON.stringify({ nope: true }), 'utf-8');
    expect(() => readSynergyMap()).toThrow(/corrupt/);
  });
});
