// tests/synergy/methodIndex.test.ts
import { describe, it, expect } from 'vitest';
import {
  detectNonDeterminism,
  extractMethod,
  extractMethods,
  type RawMethod,
} from '../../src/lib/synergy/methodIndex.js';

const pure: RawMethod = {
  id: 'predictMaintenance',
  name: 'Predictive maintenance',
  domain: 'logistics',
  source: 'tool',
  primitives: ['prediction', 'statistics'],
  suite: 'assert predictMaintenance(vehicle).length === 0;',
  sourceCode: 'export function trend(v){ return v[v.length-1] - v[0]; }',
};

describe('method index', () => {
  it('extracts a pure method with stable id, primitives, and suite hash', () => {
    const r = extractMethod(pure);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.method.id).toBe('method:tool:predictmaintenance');
      expect(r.method.primitives).toEqual(['prediction', 'statistics']);
      expect(r.method.deterministic).toBe(true);
      expect(r.method.suiteHash).toHaveLength(64);
    }
  });

  it('rejects non-deterministic sources with an explicit reason', () => {
    expect(detectNonDeterminism('return new Date().toISOString();')).toContain('new Date');
    expect(detectNonDeterminism('return Date.now();')).toContain('Date.now');
    expect(detectNonDeterminism('return Math.random();')).toContain('Math.random');
    expect(detectNonDeterminism('const t = values[values.length-1];')).toBeNull();

    const r = extractMethod({ ...pure, id: 'buildDossier', sourceCode: 'return new Date().toISOString();' });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.rejected).toContain('new Date');
  });

  it('extractMethods sorts by id and reports rejections', () => {
    const { methods, rejected } = extractMethods([
      { ...pure, id: 'zMethod', name: 'Z' },
      pure,
      { ...pure, id: 'buildDossier', sourceCode: 'return Date.now();' },
    ]);
    const ids = methods.map((m) => m.id);
    expect(ids).toEqual([...ids].sort());
    expect(ids[0]).toBe('method:tool:predictmaintenance');
    expect(ids[1]).toBe('method:tool:zmethod');
    expect(rejected).toHaveLength(1);
    expect(rejected[0].id).toBe('buildDossier');
  });

  it('flags additional non-deterministic sources and declarative rejection', () => {
    expect(detectNonDeterminism('return performance.now();')).toContain('performance.now');
    expect(detectNonDeterminism('const d = Date();')).toContain('Date');
    expect(detectNonDeterminism('crypto.randomUUID();')).toContain('crypto.random');
    expect(detectNonDeterminism('const t = process.hrtime();')).toContain('process.hrtime');
    expect(extractMethod({ ...pure, id: 'x', deterministic: false }).ok).toBe(false);
    expect(extractMethod({ ...pure, id: '' }).ok).toBe(false);
  });
});
