// tests/synergy/macFac.test.ts
import { describe, it, expect } from 'vitest';
import { contentVector, macFilter, macFac } from '../../src/lib/synergy/macFac.js';
import { dgroupFromRelations, type DGroup } from '../../src/lib/synergy/sme.js';
import type { Rel } from '../../src/lib/synergy/types.js';

const rel = (functor: string, args: string[]): Rel => ({ functor, type: 'rel', args, order: 1 });
const target = dgroupFromRelations('t', [rel('maps_to', ['a', 'b'])], ['a', 'b']);
const near = dgroupFromRelations('n', [rel('maps_to', ['a', 'b'])], ['a', 'b']);
const far = dgroupFromRelations('f', [rel('depends_on', ['x', 'y'])], ['x', 'y']);

describe('mac/fac', () => {
  it('content vectors are deterministic functor histograms', () => {
    const v = contentVector(target);
    expect(v).toEqual(contentVector(target));
    expect(v.length).toBeGreaterThan(0);
  });

  it('macFilter returns the top-k by content similarity, deterministic', () => {
    const top = macFilter(target, [far, near], 1);
    expect(top).toHaveLength(1);
    expect(top[0].domain).toBe('n');
  });

  it('macFac returns alignment results for survivors', () => {
    const results = macFac(target, [far, near], { k: 2 });
    expect(results).toHaveLength(2);
    expect(results[0]).toHaveProperty('gmapWeight');
  });

  it('canonicalizes functor spelling in content vectors', () => {
    const messy: DGroup = { domain: 'm', entities: ['a', 'b'], relations: [rel('Maps_To', ['a', 'b'])] };
    const clean = dgroupFromRelations('c', [rel('maps_to', ['a', 'b'])], ['a', 'b']);
    expect(contentVector(messy)).toEqual(contentVector(clean));
  });
});
