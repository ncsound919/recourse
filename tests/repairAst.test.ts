import { describe, it, expect } from 'vitest';
import { repairWithAst, detectFaultPattern } from '../src/lib/repairAst';

describe('repairAst', () => {
  it('detects division by zero pattern', () => {
    const code = 'export function divide(a: number, b: number) { return a / b; }';
    const result = repairWithAst(code);
    expect(result.repairs.some((r) => r.type === 'div-by-zero')).toBe(true);
  });

  it('detects NaN check pattern', () => {
    const code = 'export function test(x: number) { if (isNaN(x)) return 0; return x; }';
    const result = repairWithAst(code);
    expect(result.repairs.some((r) => r.type === 'nan-check')).toBe(true);
  });

  it('detects null return pattern', () => {
    const code = 'export function test() { return null; }';
    const result = repairWithAst(code);
    expect(result.repairs.some((r) => r.type === 'null-return')).toBe(true);
  });

  it('reports parse errors for invalid code', () => {
    const code = 'export function broken( {';
    const result = repairWithAst(code);
    expect(result.parseErrors).toBe(true);
  });

  it('counts AST nodes', () => {
    const code = 'export function test() { return 1; }';
    const result = repairWithAst(code);
    expect(result.nodeCount).toBeGreaterThan(0);
  });

  it('detects fault pattern in code', () => {
    const code = 'export function divide(a: number, b: number) { return a / b; }';
    const pattern = detectFaultPattern(code);
    expect(pattern).toBe('div-by-zero');
  });

  it('returns null for safe code', () => {
    const code = 'export function add(a: number, b: number) { return a + b; }';
    const pattern = detectFaultPattern(code);
    expect(pattern).toBeNull();
  });
});
