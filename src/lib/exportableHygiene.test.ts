import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildExportableResponse } from './exportableHygiene';
import { behaviorKey, type RegistryToolLike } from './registryHygiene';

const passed = (name: string, score = 1): RegistryToolLike => ({
  name,
  domain: 'coding',
  versions: [{ version: '1.0.0', passed_verifier: true, score }],
  currentVersion: '1.0.0',
});

const degraded = (name: string): RegistryToolLike => ({
  name,
  domain: 'coding',
  versions: [{ version: '1.0.0', passed_verifier: false, score: 0 }],
  currentVersion: '1.0.0',
});

describe('buildExportableResponse', () => {
  it('collapses duplicate variants and prunes degraded tools', () => {
    const tools: RegistryToolLike[] = [
      passed('learner_coding_lru_cache_2332', 0.7),
      passed('learner_coding_lru_cache_3444', 1),
      passed('learner_coding_lru_cache_5997', 0.9),
      passed('dedupeStable'),
      degraded('CODI_CYCLOMATIC_6dc2'),
    ];
    const r = buildExportableResponse(tools);
    expect(r.success).toBe(true);
    expect(r.count).toBe(2); // one LRU representative + dedupeStable
    expect(r.tools.map((t) => t.name).sort()).toEqual(['dedupeStable', 'learner_coding_lru_cache_3444']);
    expect(r.hygiene.total).toBe(5);
    expect(r.hygiene.degraded).toBe(1);
    expect(r.hygiene.duplicate).toBe(2);
  });

  it('raw: true preserves the full unfiltered list', () => {
    const tools = [passed('a_1'), passed('a_2'), degraded('b')];
    const r = buildExportableResponse(tools, { raw: true });
    expect(r.count).toBe(3);
    expect(r.tools).toHaveLength(3);
  });

  it('property: the cleaned set is always a subset and free of duplicate keys', () => {
    const tool = fc.record({
      name: fc.oneof(
        fc.constant('learner_coding_lru_cache_2332'),
        fc.constant('learner_coding_lru_cache_3444'),
        fc.string({ minLength: 1, maxLength: 16 }).filter((s) => s.trim().length > 0),
      ),
      passed: fc.boolean(),
    });
    fc.assert(
      fc.property(fc.array(tool, { maxLength: 20 }), (rows) => {
        const tools: RegistryToolLike[] = rows.map((r) => ({
          name: r.name,
          versions: [{ version: '1.0.0', passed_verifier: r.passed, score: r.passed ? 1 : 0 }],
          currentVersion: '1.0.0',
        }));
        const out = buildExportableResponse(tools);
        expect(out.count).toBeLessThanOrEqual(tools.length);
        expect(out.tools.every((t) => tools.includes(t))).toBe(true);
        const keys = out.tools.map((t) => behaviorKey(t.name));
        expect(new Set(keys).size).toBe(keys.length);
      }),
    );
  });
});
