import { describe, it, expect } from 'vitest';
import {
  executeToolFunction,
  executeTestSuite,
  prepareExecutableCode,
} from '../src/lib/executionSandbox';

describe('Honest sandbox contract', () => {
  it('fails assertions that reference undeclared variables (no injected fixtures)', () => {
    const r = executeTestSuite('function mul(a, b) { return a * b; }', 'assert throughput > 500000;');
    expect(r.passed).toBe(false);
    expect(r.testDetails.some((d) => d.startsWith('[FAIL]'))).toBe(true);
  });

  it('does not treat truthy objects as passing assertions', () => {
    const r = executeTestSuite('function foo() { return { ok: 1 }; }', 'assert foo();');
    expect(r.passed).toBe(false);
  });

  it('runs setup lines and assertions in one shared scope', () => {
    const r = executeTestSuite(
      'export class Bag { constructor() { this.m = new Map(); } put(k, v) { this.m.set(k, v); } get(k) { return this.m.get(k); } }',
      `const b = new Bag();
b.put('k', 42);
assert b.get('k') === 42;`
    );
    expect(r.passed).toBe(true);
    expect(r.score).toBe(1);
  });

  it('reports real results only when every assertion is true', () => {
    const r = executeTestSuite('function mul(a, b) { return a * b; }', 'assert mul(2, 3) === 6;\nassert mul(4, 5) === 20;');
    expect(r.passed).toBe(true);
    expect(r.score).toBe(1);
  });

  it('fails closed when no callable entrypoint is found', () => {
    const r = executeToolFunction('const nothing = 1;');
    expect(r.success).toBe(false);
    expect(r.error).toContain('No callable entrypoint');
  });

  it('returns plain JSON payloads as data', () => {
    const r = executeToolFunction('{ "asset_name": "X", "evidence_tier": 2 }');
    expect(r.success).toBe(true);
    expect(r.returnValue.asset_name).toBe('X');
  });

  it('transpiles TypeScript genes through esbuild before execution', () => {
    const code = prepareExecutableCode(
      `export class L2Cache {
  private store = new Map();
  get(k: string) { return this.store.get(k); }
  set(k: string, v: number) { this.store.set(k, v); }
}`
    );
    expect(code).not.toContain('export');
    expect(code).not.toContain('private');
    expect(code).not.toContain(': string');
    const r = executeTestSuite(code, `const c = new L2Cache();\nc.set('k', 7);\nassert c.get('k') === 7;`);
    expect(r.passed).toBe(true);
  });

  it('flags genuinely broken syntax as a compilation failure', () => {
    const r = executeTestSuite('export function execute() { <<<SYNTAX_CORRUPT>>> }', 'assert execute() !== null;');
    expect(r.passed).toBe(false);
  });

  it('supports Node-style assert.equal/strictEqual written by real local models', () => {
    const r = executeTestSuite(
      'export function area(l, w) { return l * w; }',
      "assert.equal(area(2, 3), 6, '2x3=6'),assert.strictEqual(area(0, 0), 0),assert.equal(area(-1, 2), -2)"
    );
    expect(r.passed).toBe(true);
    expect(r.testDetails.filter((d) => d.startsWith('[PASS]')).length).toBe(3);
  });

  it('evaluates every assertion even when one would fail', () => {
    const r = executeTestSuite(
      'export function area(l, w) { return l * w; }',
      "assert.equal(area(2, 3), 6),assert.equal(area(1, 1), 99)"
    );
    expect(r.passed).toBe(false);
    expect(r.testDetails.filter((d) => d.startsWith('[FAIL]')).length).toBe(1);
    expect(r.testDetails.filter((d) => d.startsWith('[PASS]')).length).toBe(1);
  });
});
