import { describe, it, expect } from 'vitest';
import {
  extractDeclaredRelations,
  extractTranslationRelations,
  mergeRelations,
  relationsForMethod,
} from '../../src/lib/synergy/relationExtract';
import { extractMethod } from '../../src/lib/synergy/methodIndex';

describe('extractDeclaredRelations', () => {
  it('parses allowlisted @rel annotations', () => {
    const src = `// @rel maps_to abundance biomass\n// @rel increases dose response\nfunction f() {}`;
    const out = extractDeclaredRelations(src, 'ecology');
    expect(out.basis).toBe('declared');
    expect(out.relations.map((r) => r.functor)).toEqual(['maps_to', 'increases']);
    expect(out.relations[0].args).toContain('abundance');
    expect(out.relations[0].order).toBe(1);
  });

  it('rejects off-vocabulary functors rather than inventing relations', () => {
    const out = extractDeclaredRelations('// @rel frobnicate a b\nfunction f(){}', 'x');
    expect(out.relations).toHaveLength(0);
    expect(out.basis).toBeNull();
    expect(out.notes.join(' ')).toMatch(/off-vocabulary/);
  });

  it('returns empty for source with no annotations', () => {
    const out = extractDeclaredRelations('function f() {}', 'x');
    expect(out).toEqual({ relations: [], basis: null, confidence: 0, notes: [] });
  });
});

describe('extractTranslationRelations', () => {
  it('maps real term pairs onto maps_to relations with carried confidence', () => {
    const out = extractTranslationRelations(
      [
        { source: 'Basketball Spacing', target: 'Cell Density', confidence: 0.7 },
        { source: 'Assist Rate', target: 'Signaling Flux' },
      ],
      'translation',
    );
    expect(out.basis).toBe('translation');
    expect(out.relations).toHaveLength(2);
    expect(out.relations[0].functor).toBe('maps_to');
    expect(out.relations[0].args).toEqual(['basketball_spacing', 'cell_density']);
    expect(out.confidence).toBeCloseTo((0.7 + 0.8) / 2, 5);
  });

  it('skips empty pairs and reports empty when nothing remains', () => {
    const out = extractTranslationRelations([{ source: '', target: 'x' }], 'translation');
    expect(out.relations).toHaveLength(0);
    expect(out.basis).toBeNull();
    expect(out.notes.join(' ')).toMatch(/empty/);
  });
});

describe('mergeRelations', () => {
  it('de-duplicates and prefers the first basis', () => {
    const a = extractDeclaredRelations('// @rel maps_to a b', 'x');
    const b = extractTranslationRelations([{ source: 'a', target: 'b' }, { source: 'c', target: 'd' }], 'x');
    const merged = mergeRelations(a, b);
    expect(merged.relations).toHaveLength(2); // maps_to a b (deduped) + maps_to c d
    expect(merged.basis).toBe('declared');
  });
});

describe('methodIndex integration (un-fail-close)', () => {
  it('sets relationBasis declared when real relations exist, placeholder otherwise', () => {
    const withRels = extractMethod({
      id: 'm1', name: 'M1', domain: 'ecology', source: 'tool',
      sourceCode: '// @rel increases dose response\nfunction f() {}',
      relations: extractDeclaredRelations('// @rel increases dose response\nfunction f() {}', 'ecology').relations,
    });
    expect(withRels.ok).toBe(true);
    if (withRels.ok) expect(withRels.method.relationBasis).toBe('declared');

    const without = extractMethod({
      id: 'm2', name: 'M2', domain: 'ecology', source: 'tool',
      primitives: [],
      sourceCode: 'function g() {}',
    });
    expect(without.ok).toBe(true);
    if (without.ok) expect(without.method.relationBasis).toBe('placeholder');
  });

  it('relationsForMethod combines declared annotations and provided relations', () => {
    const out = relationsForMethod({
      sourceCode: '// @rel derives x y',
      relations: [{ functor: 'part_of', type: 'rel', args: ['a', 'b'], order: 1 }],
      domain: 'ecology',
    });
    expect(out.relations.map((r) => r.functor).sort()).toEqual(['derives', 'part_of']);
    expect(out.basis).toBe('declared');
  });
});
