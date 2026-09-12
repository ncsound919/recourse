// tests/synergy/sme.test.ts
import { describe, it, expect } from 'vitest';
import { dgroupFromRelations, matchHypotheses, isStructurallyConsistent, align, farTransfer, type DGroup, type MatchHypothesis } from '../../src/lib/synergy/sme.js';
import type { Rel } from '../../src/lib/synergy/types.js';

const rel = (functor: string, args: string[], order = 1): Rel => ({ functor, type: 'rel', args, order });

const base: DGroup = dgroupFromRelations('math', [rel('maps_to', ['graph', 'sequence']), rel('depends_on', ['sequence', 'statistics'])], ['graph', 'sequence', 'statistics']);
const target: DGroup = dgroupFromRelations('logi', [rel('maps_to', ['schema', 'route']), rel('depends_on', ['route', 'cost'])], ['schema', 'route', 'cost']);

describe('sme dgroups + match hypotheses', () => {
  it('builds dgroups with relations and entities', () => {
    expect(base.domain).toBe('math');
    expect(base.relations.map((r) => r.functor)).toEqual(['maps_to', 'depends_on']);
    expect(base.entities).toContain('graph');
  });

  it('generates same-functor match hypotheses', () => {
    const mh = matchHypotheses(base, target);
    const functors = mh.map((m) => m.baseFunctor);
    expect(functors).toContain('maps_to');
    expect(functors).toContain('depends_on');
    // parallel connectivity: argument pairs come with each relation MH
    expect(mh.find((m) => m.baseFunctor === 'maps_to')?.argPairs.length).toBe(2);
  });

  it('rejects a mapping where one base entity maps to two targets (one-to-one)', () => {
    const bad: MatchHypothesis[] = [{ baseFunctor: 'maps_to', targetFunctor: 'maps_to', argPairs: [['graph', 'schema'], ['graph', 'route']], score: 0.9 }];
    expect(isStructurallyConsistent(bad)).toBe(false);
  });

  it('accepts a one-to-one + parallel mapping', () => {
    const good: MatchHypothesis[] = [{ baseFunctor: 'maps_to', targetFunctor: 'maps_to', argPairs: [['graph', 'schema'], ['sequence', 'route']], score: 0.9 }];
    expect(isStructurallyConsistent(good)).toBe(true);
  });

  it('align prefers a systematic (multi-relation) mapping over an isolated one', () => {
    const systematic = align(base, target);
    const isolatedBase: DGroup = dgroupFromRelations('m2', [rel('maps_to', ['graph', 'sequence'])], ['graph', 'sequence']);
    const isolated = align(isolatedBase, target);
    expect(systematic.gmapWeight).toBeGreaterThan(isolated.gmapWeight);
  });

  it('align is deterministic and consistent', () => {
    const a = align(base, target);
    const b = align(base, target);
    expect(a).toEqual(b);
    expect(a.consistent).toBe(true);
    expect(a.mappings.length).toBeGreaterThan(0);
  });

  it('farTransfer is high for high structure at low surface similarity', () => {
    const high = farTransfer(base, target);
    const near: DGroup = dgroupFromRelations('m', base.relations.map((r) => ({ ...r })), base.entities);
    const nearTransfer = farTransfer(base, near);
    expect(high).toBeGreaterThan(nearTransfer);
    expect(high).toBeLessThanOrEqual(1);
  });
});
