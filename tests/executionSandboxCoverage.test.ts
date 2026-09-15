import { describe, it, expect } from 'vitest';
import {
  executeToolFunction,
  executeTestSuite,
  prepareExecutableCode,
} from '../src/lib/executionSandbox';

// Real (default) isolated-vm path: the primary backend is privilege isolation,
// so these tests assert real behavior of the actual execution engine. They
// deliberately run against whatever backend the environment provides.

describe('executionSandbox — real backend path', () => {
  it('returns plain JSON object payloads as data (early return)', () => {
    const r = executeToolFunction('{ "asset_name": "X", "evidence_tier": 2 }');
    expect(r.success).toBe(true);
    expect(r.returnValue.asset_name).toBe('X');
    expect(r.assertionsPassed).toBe(1);
  });

  it('returns plain JSON array payloads as data', () => {
    const r = executeToolFunction('[1, 2, 3]');
    expect(r.success).toBe(true);
    expect(r.returnValue).toEqual([1, 2, 3]);
  });

  it('falls through to code execution when a {..} payload is not valid JSON', () => {
    // Starts with '{' (triggers the JSON branch) but is not parseable, so the
    // engine falls through to real code execution and fails closed (no callable).
    const r = executeToolFunction('{ not valid json here');
    expect(r.success).toBe(false);
  });

  it('executes a named function and returns its value', () => {
    const code = 'function double(x) { return x * 2; }';
    const r = executeToolFunction(code, 'double', [21]);
    expect(r.success).toBe(true);
    expect(r.returnValue).toBe(42);
    expect(r.assertionsPassed).toBe(1);
  });

  it('reports a runtime throw as an honest failure', () => {
    const code = 'function boom() { throw new Error("kaboom"); }';
    const r = executeToolFunction(code, 'boom', []);
    expect(r.success).toBe(false);
    expect(r.assertionsFailed).toBe(1);
    expect((r.error || r.stderr.join(' ')).toLowerCase()).toContain('kaboom');
  });

  it('fails closed when no callable entrypoint exists', () => {
    const r = executeToolFunction('const nothing = 1;');
    expect(r.success).toBe(false);
    expect(r.error).toContain('No callable entrypoint');
  });

  it('executes a full test suite that passes', () => {
    const r = executeTestSuite(
      'function mul(a, b) { return a * b; }',
      'assert mul(2, 3) === 6;'
    );
    expect(r.passed).toBe(true);
    expect(r.score).toBe(1);
  });

  it('fails a suite referencing an undeclared symbol', () => {
    const r = executeTestSuite('function mul(a, b) { return a * b; }', 'assert throughput > 1;');
    expect(r.passed).toBe(false);
    expect(r.testDetails.some((d) => d.startsWith('[FAIL]'))).toBe(true);
  });

  it('runs setup + assertions in one shared scope', () => {
    const r = executeTestSuite(
      'export class Bag { constructor() { this.m = new Map(); } put(k, v) { this.m.set(k, v); } get(k) { return this.m.get(k); } }',
      `const b = new Bag();
b.put('k', 42);
assert b.get('k') === 42;`
    );
    expect(r.passed).toBe(true);
  });

  it('reports a suite with a failing assertion honestly', () => {
    const r = executeTestSuite('function f() { return 1; }', 'assert f() === 2;');
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
  });
});

describe('executionSandbox — prepareExecutableCode transforms', () => {
  it('returns empty string for empty input', () => {
    expect(prepareExecutableCode('')).toBe('');
    expect(prepareExecutableCode(undefined as unknown as string)).toBe('');
  });

  it('drops import lines and esbuild export footers from compiled output', () => {
    const src = prepareExecutableCode(
      'import "./side-effect.js";\nexport function helper() { return 1; }\nexport const K = 2;'
    );
    expect(src).not.toContain('import');
    expect(src).not.toContain('export');
  });

  it('strips a re-export line via the plain export branch', () => {
    // esbuild keeps `export * from "./y"` as a literal `export ` line, which the
    // transformer rewrites (drops the keyword) to keep the sandbox scope clean.
    const src = prepareExecutableCode('export * from "./y";');
    expect(src).not.toContain('export *');
  });

  it('returns broken source unchanged so callers surface the real syntax error', () => {
    const bad = 'export function x() { <<<SYNTAX_CORRUPT>>> }';
    expect(prepareExecutableCode(bad)).toBe(bad);
  });

  it('transpiles a TS class through esbuild', () => {
    const src = prepareExecutableCode(
      'export class L2Cache { private store = new Map(); get(k: string) { return this.store.get(k); } }'
    );
    expect(src).not.toContain('private');
    expect(src).not.toContain(': string');
  });
});
