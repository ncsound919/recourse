import { describe, it, expect, vi } from 'vitest';

// Force the in-process `new Function` fallback path of the execution sandbox.
// This is a REAL test of the fallback engine (transpile, console interception,
// assert rewriting, honest failure reporting) — the native isolate backend is
// simply reported unavailable, which is a legitimate runtime condition the
// module is explicitly designed to degrade to.
vi.mock('../src/lib/isolatedSandbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/isolatedSandbox')>();
  return { ...actual, isIsolateAvailable: () => false };
});

import {
  executeToolFunction,
  executeTestSuite,
  prepareExecutableCode,
} from '../src/lib/executionSandbox';

describe('executionSandbox — in-process fallback path (isolated-vm unavailable)', () => {
  it('prepares code and executes a named function', () => {
    const r = executeToolFunction('function area(l, w) { return l * w; }', 'area', [3, 4]);
    expect(r.success).toBe(true);
    expect(r.returnValue).toBe(12);
  });

  it('captures console.log/info into stdout and warn/error into stderr', () => {
    const code = `function run() {
      console.log('out-a');
      console.info('info-b');
      console.warn('warn-c');
      console.error('err-d');
      return 1;
    }`;
    const r = executeToolFunction(code, 'run', []);
    expect(r.success).toBe(true);
    expect(r.stdout.some((l) => l.includes('out-a'))).toBe(true);
    expect(r.stdout.some((l) => l.includes('info-b'))).toBe(true);
    expect(r.stderr.some((l) => l.includes('warn-c'))).toBe(true);
    expect(r.stderr.some((l) => l.includes('err-d'))).toBe(true);
  });

  it('serializes object console args in stdout', () => {
    const r = executeToolFunction('function run() { console.log({ a: 1 }); return 1; }', 'run', []);
    expect(r.success).toBe(true);
    expect(r.stdout.some((l) => l.includes('a') && l.includes('1'))).toBe(true);
  });

  it('fails closed when no callable entrypoint is found', () => {
    const r = executeToolFunction('const nothing = 1;');
    expect(r.success).toBe(false);
    expect(r.error).toContain('No callable entrypoint');
    expect(r.error).toContain('Pass an explicit functionName');
  });

  it('reports the named-function mismatch in the failure message', () => {
    const r = executeToolFunction('function other() { return 1; }', 'missing');
    expect(r.success).toBe(false);
    expect(r.error).toContain('"missing" is not defined');
  });

  it('reports a runtime throw as a failure with captured stderr', () => {
    const r = executeToolFunction('function boom() { throw new Error("fallback boom"); }', 'boom', []);
    expect(r.success).toBe(false);
    expect(r.error).toContain('fallback boom');
    expect(r.stderr.some((l) => l.includes('fallback boom'))).toBe(true);
  });

  it('calls default entrypoint names (execute/run) without an explicit name', () => {
    expect(executeToolFunction('function execute() { return 7; }').returnValue).toBe(7);
    expect(executeToolFunction('function run() { return 8; }').returnValue).toBe(8);
    expect(executeToolFunction('function fizzbuzz(n) { return n; }', undefined, [5]).returnValue).toBe(5);
    expect(executeToolFunction('function sumOfRoots(a,b,c) { return -b/a; }').success).toBe(true);
  });

  it('instantiates recognized class entrypoints (LRUCache, L2Cache)', () => {
    const lru = executeToolFunction(
      'class LRUCache { constructor(c){ this.c=c; this.m=new Map(); } }'
    );
    expect(lru.success).toBe(true);
    const l2 = executeToolFunction('class L2Cache { constructor(){ this.m=new Map(); } }');
    expect(l2.success).toBe(true);
    const guard = executeToolFunction('class ReentrancyGuard { constructor(){} }');
    expect(guard.success).toBe(true);
    const mutex = executeToolFunction('class AsyncMutex { constructor(){} }');
    expect(mutex.success).toBe(true);
  });
});

describe('executionSandbox — in-process executeTestSuite assert rewriting', () => {
  it('handles bare assert statements', () => {
    const r = executeTestSuite('function mul(a,b){return a*b;}', 'assert mul(2,3) === 6;');
    expect(r.passed).toBe(true);
    expect(r.score).toBe(1);
  });

  it('handles assert() call form with and without a message', () => {
    const ok1 = executeTestSuite('function f(){return 5;}', 'assert(f() === 5);');
    expect(ok1.passed).toBe(true);
    const ok2 = executeTestSuite('function f(){return 5;}', "assert(f() === 5, 'f is five');");
    expect(ok2.passed).toBe(true);
  });

  it('treats a no-argument assert() as an aborted body (no bindings injected)', () => {
    const r = executeTestSuite('function f(){return 1;}', 'assert();');
    expect(r.passed).toBe(false);
  });

  it('handles all node-style assert forms with two args', () => {
    const src = 'function f(){return 5;}';
    const eq = executeTestSuite(src, "assert.equal(f(), 5)");
    expect(eq.passed).toBe(true);
    const se = executeTestSuite(src, "assert.strictEqual(f(), 5)");
    expect(se.passed).toBe(true);
    const ne = executeTestSuite(src, "assert.notEqual(f(), 6)");
    expect(ne.passed).toBe(true);
    const nse = executeTestSuite(src, "assert.notStrictEqual(f(), '5')");
    expect(nse.passed).toBe(true);
    const de = executeTestSuite('function g(){return [1,2];}', "assert.deepEqual(g(), [1,2])");
    expect(de.passed).toBe(true);
    const ok = executeTestSuite('function h(){return true;}', "assert.ok(h(), 'h is ok')");
    expect(ok.passed).toBe(true);
  });

  it('flags a node-style assert with a single argument as aborted (no injected assert)', () => {
    const r = executeTestSuite('function h(){return true;}', 'assert.ok(true)');
    expect(r.passed).toBe(false);
  });

  it('reports compilation errors for genuinely broken source', () => {
    const r = executeTestSuite('export function execute() { <<<SYNTAX_CORRUPT>>> }', 'assert execute() !== null;');
    expect(r.passed).toBe(false);
    expect(r.testDetails.some((d) => d.startsWith('[COMPILATION ERROR]'))).toBe(true);
  });

  it('aborts and reports when a plain statement throws', () => {
    const r = executeTestSuite('function f(){return 1;}', 'throw new Error("suite boom");');
    expect(r.passed).toBe(false);
  });

  it('passes the no-assertions fallback when code returns a defined value', () => {
    const r = executeTestSuite('function execute(){ return 42; }', '');
    expect(r.passed).toBe(true);
    expect(r.score).toBe(1);
  });

  it('fails the no-assertions fallback when nothing is callable', () => {
    const r = executeTestSuite('const x = 1;', '');
    expect(r.passed).toBe(false);
  });

  it('reports a false assertion honestly even with empty source', () => {
    const r = executeTestSuite('', 'assert false;');
    expect(r.passed).toBe(false);
  });

  it('keeps a multi-line pass across comma-joined node-style asserts', () => {
    const r = executeTestSuite(
      'function area(l,w){return l*w;}',
      "assert.equal(area(2,3), 6),assert.strictEqual(area(0,0), 0),assert.equal(area(-1,2), -2)"
    );
    expect(r.passed).toBe(true);
    expect(r.testDetails.filter((d) => d.startsWith('[PASS]')).length).toBe(3);
  });
});
