// tests/synergy/sme.test.ts
import { describe, it, expect } from 'vitest';
import { dgroupFromRelations, matchHypotheses, isStructurallyConsistent, type DGroup } from '../../src/lib/synergy/sme.js';
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
    const bad = [{ baseFunctor: 'maps_to', targetFunctor: 'maps_to', argPairs: [['graph', 'schema'], ['graph', 'route']], score: 0.9 }];
    expect(isStructurallyConsistent(bad)).toBe(false);
  });

  it('accepts a one-to-one + parallel mapping', () => {
    const good = [{ baseFunctor: 'maps_to', targetFunctor: 'maps_to', argPairs: [['graph', 'schema'], ['sequence', 'route']], score: 0.9 }];
    expect(isStructurallyConsistent(good)).toBe(true);
  });
});
