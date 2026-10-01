import { describe, it, expect } from 'vitest';
import { extractAstRelations, extractAstRelationsFromSource } from '../src/lib/astRelExtract';

describe('astRelExtract', () => {
  it('extracts @rel annotations from JSDoc comments', () => {
    const source = `
/**
 * @rel maps_to kras_g12c -> nsclc
 * @rel inhibits kras_signaling
 */
export function analyzeKRAS() {}
`;
    const result = extractAstRelations(source);
    expect(result.relations).toHaveLength(2);
    expect(result.relations[0].functor).toBe('maps_to');
    expect(result.relations[0].args).toEqual(['kras_g12c', 'nsclc']);
    expect(result.relations[1].functor).toBe('inhibits');
    expect(result.relations[1].args).toEqual(['kras_signaling']);
  });

  it('extracts @rel from single-line comments', () => {
    const source = `
// @rel causes tumor_growth
export function test() {}
`;
    const result = extractAstRelations(source);
    expect(result.relations).toHaveLength(1);
    expect(result.relations[0].functor).toBe('causes');
  });

  it('rejects off-vocabulary functors', () => {
    const source = `
/**
 * @rel invalid_functor arg1
 * @rel maps_to valid -> target
 */
export function test() {}
`;
    const result = extractAstRelations(source);
    expect(result.relations).toHaveLength(1);
    expect(result.relations[0].functor).toBe('maps_to');
  });

  it('returns empty for code without @rel annotations', () => {
    const source = `
/**
 * This is a regular comment without annotations.
 */
export function test() {}
`;
    const result = extractAstRelations(source);
    expect(result.relations).toHaveLength(0);
  });

  it('reports parse errors for invalid syntax', () => {
    const source = `export function broken( {`;
    const result = extractAstRelations(source);
    expect(result.parseErrors).toBe(true);
  });

  it('counts AST nodes', () => {
    const source = `export function test() { return 1; }`;
    const result = extractAstRelations(source);
    expect(result.nodeCount).toBeGreaterThan(0);
  });

  it('extracts line and column positions', () => {
    const source = `// @rel part_of system
export function test() {}`;
    const result = extractAstRelations(source);
    expect(result.relations[0].line).toBe(1);
    expect(result.relations[0].column).toBe(1);
  });

  it('handles multiple @rel in one comment block', () => {
    const source = `
/**
 * @rel maps_to a -> b
 * @rel depends_on c
 * @rel enables d
 */
export function test() {}
`;
    const result = extractAstRelations(source);
    expect(result.relations).toHaveLength(3);
  });

  it('convenience function returns just relations', () => {
    const source = `// @rel derives x
export function test() {}`;
    const rels = extractAstRelationsFromSource(source);
    expect(rels).toHaveLength(1);
    expect(rels[0].functor).toBe('derives');
  });
});
