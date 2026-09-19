import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  behaviorKey,
  dedupeRegistry,
  pruneDegraded,
  hygieneReport,
  type RegistryToolLike,
} from './registryHygiene';

function makeTool(
  name: string,
  opts: { passed?: boolean; score?: number; current?: string; versions?: RegistryToolLike['versions'] } = {},
): RegistryToolLike {
  const current = opts.current ?? '1.0.0';
  const versions =
    opts.versions ??
    [{ version: current, passed_verifier: opts.passed ?? true, score: opts.score ?? 1 }];
  return {
    name,
    domain: 'coding',
    entrypoint: `src/tools/${name}.ts`,
    description: 'test tool',
    currentVersion: current,
    versions,
  };
}

describe('behaviorKey', () => {
  it('collapses the three learner_coding_lru_cache variants to one key', () => {
    const keys = [
      behaviorKey(makeTool('learner_coding_lru_cache_2332')),
      behaviorKey(makeTool('learner_coding_lru_cache_3444')),
      behaviorKey(makeTool('learner_coding_lru_cache_5997')),
    ];
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe('learner_coding_lru_cache');
  });

  it('folds separators and mixed alphanumeric machine ids', () => {
    expect(behaviorKey('learner-coding-lru-cache-5997')).toBe('learner_coding_lru_cache');
    expect(behaviorKey('ground-codi-a-micro-tool-can-com-0ke4')).toBe('ground_codi_a_micro_tool_can_com');
  });

  it('keeps meaningful names that merely contain digits', () => {
    expect(behaviorKey('isPrivateIpv4')).toBe('isprivateipv4');
    expect(behaviorKey('exponential_backoff_ms')).toBe('exponential_backoff_ms');
  });
});

describe('dedupeRegistry', () => {
  it('keeps the highest-scoring variant of the three LRU caches', () => {
    const low = makeTool('learner_coding_lru_cache_2332', { score: 0.4 });
    const high = makeTool('learner_coding_lru_cache_3444', { score: 0.9 });
    const mid = makeTool('learner_coding_lru_cache_5997', { score: 0.6 });

    const { kept, dropped } = dedupeRegistry([low, high, mid]);

    expect(kept.map((t) => t.name)).toEqual(['learner_coding_lru_cache_3444']);
    expect(dropped.map((t) => t.name)).toEqual([
      'learner_coding_lru_cache_2332',
      'learner_coding_lru_cache_5997',
    ]);
  });

  it('prefers a passing variant over a higher-scoring failing one', () => {
    const failing = makeTool('x_1111', { passed: false, score: 1 });
    const passing = makeTool('x_2222', { passed: true, score: 0.2 });

    const { kept, dropped } = dedupeRegistry([failing, passing]);

    expect(kept.map((t) => t.name)).toEqual(['x_2222']);
    expect(dropped.map((t) => t.name)).toEqual(['x_1111']);
  });

  it('keeps distinct behaviors intact', () => {
    const { kept, dropped } = dedupeRegistry([makeTool('alpha'), makeTool('beta')]);
    expect(kept).toHaveLength(2);
    expect(dropped).toHaveLength(0);
  });
});

describe('pruneDegraded', () => {
  it('drops tools whose current version does not pass', () => {
    const good = makeTool('good', { passed: true, score: 0.5 });
    const bad = makeTool('bad', { passed: false, score: 0.99 });
    const noVersions = makeTool('none', { versions: [] });

    const survivors = pruneDegraded([good, bad, noVersions]);

    expect(survivors.map((t) => t.name)).toEqual(['good']);
  });

  it('prunes a regression even when an older version passed', () => {
    const regressed = makeTool('regressed', {
      current: '2.0.0',
      versions: [
        { version: '1.0.0', passed_verifier: true, score: 1 },
        { version: '2.0.0', passed_verifier: false, score: 0 },
      ],
    });

    expect(pruneDegraded([regressed])).toHaveLength(0);
  });
});

describe('hygieneReport', () => {
  it('counts total, degraded, duplicate and kept', () => {
    const tools = [
      makeTool('learner_coding_lru_cache_2332', { score: 0.4 }),
      makeTool('learner_coding_lru_cache_3444', { score: 0.9 }),
      makeTool('learner_coding_lru_cache_5997', { score: 0.6 }),
      makeTool('good_tool', { passed: true, score: 1 }),
      makeTool('bad_tool', { passed: false, score: 1 }),
    ];

    const report = hygieneReport(tools);

    expect(report.total).toBe(5);
    expect(report.degraded).toBe(1);
    expect(report.duplicate).toBe(2);
    expect(report.kept).toBe(2);
    expect(report.duplicateGroups).toBe(1);
    expect(report.sample.duplicateKeys[0].key).toBe('learner_coding_lru_cache');
    expect(report.sample.degraded).toEqual(['bad_tool']);
  });
});

const toolArb: fc.Arbitrary<RegistryToolLike> = fc
  .record({
    name: fc.oneof(
      fc.constantFrom(
        'learner_coding_lru_cache_2332',
        'learner_coding_lru_cache_3444',
        'learner_coding_lru_cache_5997',
        'alpha',
        'beta_2',
        'gamma_0001',
      ),
      fc.string({ maxLength: 12 }),
    ),
    passed: fc.boolean(),
    score: fc.float({ min: 0, max: 1, noNaN: true }),
  })
  .map(({ name, passed, score }) => makeTool(name, { passed, score }));

describe('dedupeRegistry properties', () => {
  it('never increases count and preserves every kept key exactly once', () => {
    fc.assert(
      fc.property(fc.array(toolArb, { maxLength: 40 }), (tools) => {
        const { kept, dropped } = dedupeRegistry(tools);

        expect(kept.length + dropped.length).toBe(tools.length);
        expect(kept.length).toBeLessThanOrEqual(tools.length);

        const keptKeys = kept.map((t) => behaviorKey(t));
        expect(new Set(keptKeys).size).toBe(keptKeys.length);

        const keptKeySet = new Set(keptKeys);
        for (const tool of tools) {
          expect(keptKeySet.has(behaviorKey(tool))).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });
});
