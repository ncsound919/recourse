import { describe, it, expect, vi } from 'vitest';
import {
  isIsolateAvailable,
  executeToolInIsolate,
  executeTestSuiteInIsolate,
} from '../src/lib/isolatedSandbox';

const avail = isIsolateAvailable();

describe.skipIf(!avail)('isolated-vm tool entrypoint resolution', () => {
  it('accepts a valid explicit function name', () => {
    const res = executeToolInIsolate('export function add(a, b) { return a + b; }', 'add', [2, 3]);
    expect(res.available).toBe(true);
    expect(res.success).toBe(true);
    expect(res.returnValue).toBe(5);
    expect(res.memoryLimitMb).toBe(64);
    expect(res.executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('honors non-default memory and timeout options', () => {
    const res = executeToolInIsolate('export function add(a, b) { return a + b; }', 'add', [1, 2], {
      memoryLimitMb: 32,
      timeoutMs: 1000,
    });
    expect(res.available).toBe(true);
    expect(res.memoryLimitMb).toBe(32);
    expect(res.returnValue).toBe(3);
  });

  it('passes JSON-safe object arguments across the boundary', () => {
    const res = executeToolInIsolate(
      'export function len(o) { return o.list.length; }',
      'len',
      [{ list: [1, 2, 3] }]
    );
    expect(res.success).toBe(true);
    expect(res.returnValue).toBe(3);
  });

  it('rejects an invalid (non-identifier) function name honestly', () => {
    const res = executeToolInIsolate('export function add(a, b) { return a + b; }', 'add two', [1, 2]);
    expect(res.success).toBe(false);
    expect(res.error).toContain('"add two" not found');
  });

  it('reports no callable entrypoint when functionName is omitted', () => {
    const res = executeToolInIsolate('export function weird() { return 1; }');
    expect(res.success).toBe(false);
    expect(res.error).toContain('No callable entrypoint found');
  });

  it('falls back to the execute entrypoint', () => {
    const res = executeToolInIsolate('export function execute(a, b) { return a * b; }', undefined, [6, 7]);
    expect(res.success).toBe(true);
    expect(res.returnValue).toBe(42);
  });

  it('falls back to the run entrypoint', () => {
    const res = executeToolInIsolate('export function run() { return "ran"; }', undefined, []);
    expect(res.success).toBe(true);
    expect(res.returnValue).toBe('ran');
  });

  it('falls back to the solveHornClauses entrypoint', () => {
    const res = executeToolInIsolate('export function solveHornClauses(x) { return x; }', undefined, [true]);
    expect(res.success).toBe(true);
    expect(res.returnValue).toBe(true);
  });

  it('falls back to the sanitizeBuffer entrypoint', () => {
    const res = executeToolInIsolate('export function sanitizeBuffer(x) { return x; }', undefined, ['abc']);
    expect(res.success).toBe(true);
    expect(res.returnValue).toBe('abc');
  });

  it('falls back to the createBellState entrypoint', () => {
    const res = executeToolInIsolate(
      'export function createBellState() { return { q0: 0, q1: 0 }; }',
      undefined,
      []
    );
    expect(res.success).toBe(true);
    expect(res.returnValue).toEqual({ q0: 0, q1: 0 });
  });

  it('falls back to the groverDiffusion entrypoint', () => {
    const res = executeToolInIsolate('export function groverDiffusion(n) { return n * n; }', undefined, [3]);
    expect(res.success).toBe(true);
    expect(res.returnValue).toBe(9);
  });

  it('falls back to the planRoutes entrypoint', () => {
    const res = executeToolInIsolate('export function planRoutes(r) { return r[0]; }', undefined, [['A', 'B']]);
    expect(res.success).toBe(true);
    expect(res.returnValue).toBe('A');
  });

  it('falls back to the cosineDistance entrypoint', () => {
    const res = executeToolInIsolate(
      'export function cosineDistance(a, b) { return a.length + b.length; }',
      undefined,
      [[1], [2, 3]]
    );
    expect(res.success).toBe(true);
    expect(res.returnValue).toBe(3);
  });

  it('falls back to the sumOfRoots entrypoint', () => {
    const res = executeToolInIsolate('export function sumOfRoots(a, b) { return a + b; }', undefined, [1, 2]);
    expect(res.success).toBe(true);
    expect(res.returnValue).toBe(3);
  });

  it('falls back to the fizzbuzz entrypoint', () => {
    const res = executeToolInIsolate('export function fizzbuzz(n) { return n; }', undefined, [15]);
    expect(res.success).toBe(true);
    expect(res.returnValue).toBe(15);
  });

  it('falls back to constructing L2Cache', () => {
    const res = executeToolInIsolate('export class L2Cache { constructor(a) { this.size = a; } }', undefined, [42]);
    expect(res.success).toBe(true);
    expect(res.returnValue).toEqual({ size: 42 });
  });

  it('falls back to constructing LRUCache with a falsy default size', () => {
    const res = executeToolInIsolate('export class LRUCache { constructor(n) { this.cap = n; } }', undefined, [0]);
    expect(res.success).toBe(true);
    expect(res.returnValue).toEqual({ cap: 10 });
  });

  it('falls back to constructing LRUCache with an explicit size', () => {
    const res = executeToolInIsolate('export class LRUCache { constructor(n) { this.cap = n; } }', undefined, [7]);
    expect(res.success).toBe(true);
    expect(res.returnValue).toEqual({ cap: 7 });
  });

  it('falls back to constructing ReentrancyGuard', () => {
    const res = executeToolInIsolate(
      'export class ReentrancyGuard { constructor() { this.armed = true; } }',
      undefined,
      []
    );
    expect(res.success).toBe(true);
    expect(res.returnValue).toEqual({ armed: true });
  });

  it('falls back to constructing AsyncMutex', () => {
    const res = executeToolInIsolate(
      'export class AsyncMutex { constructor() { this.locked = false; } }',
      undefined,
      []
    );
    expect(res.success).toBe(true);
    expect(res.returnValue).toEqual({ locked: false });
  });
});

describe.skipIf(!avail)('isolated-vm tool output and failure semantics', () => {
  it('captures console log/warn/error/info into stdout and stderr', () => {
    const res = executeToolInIsolate(
      `export function talk() {
         console.log({ a: 1 }, 'hi');
         console.warn('warn');
         console.error('err');
         console.info('info');
         return 7;
       }`,
      'talk',
      []
    );
    expect(res.success).toBe(true);
    expect(res.returnValue).toBe(7);
    expect(res.stdout).toEqual(['{"a":1} hi', '[INFO] info']);
    expect(res.stderr).toEqual(['[WARN] warn', '[ERROR] err']);
  });

  it('reports a thrown entrypoint error, never a success', () => {
    const res = executeToolInIsolate('export function boom() { throw new Error("kapow"); }', 'boom', []);
    expect(res.success).toBe(false);
    expect(res.error).toContain('kapow');
  });

  it('reports a compile error in the submitted source', () => {
    const res = executeToolInIsolate('export function broken( {', 'broken', []);
    expect(res.available).toBe(true);
    expect(res.success).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it('reports a non-serializable host arg by dropping the args list', () => {
    const cyclic: any = {};
    cyclic.self = cyclic;
    const res = executeToolInIsolate('export function add(a, b) { return a + b; }', 'add', [cyclic, 1]);
    expect(res.available).toBe(true);
    expect(res.success).toBe(true);
    expect(res.returnValue).toBe(null);
  });

  it('reports an invalid JSON payload crossing the boundary', () => {
    const res = executeToolInIsolate(
      "JSON.stringify = () => '{invalid'; export function f() { return 1; }",
      'f',
      []
    );
    expect(res.available).toBe(true);
    expect(res.success).toBe(false);
    expect(res.error).toBe('result was not valid JSON');
    expect(res.stdout).toEqual([]);
    expect(res.stderr).toEqual([]);
  });

  it('enforces a wall-clock timeout and reports it', () => {
    const res = executeToolInIsolate('export function spin() { while (true) {} }', 'spin', [], {
      timeoutMs: 300,
    });
    expect(res.timedOut).toBe(true);
    expect(res.success).toBe(false);
    expect(res.error).toContain('timed out');
  });
});

describe.skipIf(!avail)('isolated-vm test suite execution', () => {
  const src = 'export function add(a, b) { return a + b; }';

  it('passes a bare assert statement', () => {
    const r = executeTestSuiteInIsolate(src, 'assert add(1,2) === 3;');
    expect(r.available).toBe(true);
    expect(r.passed).toBe(true);
    expect(r.score).toBe(1);
    expect(r.testDetails).toEqual(['[PASS] assert add(1,2) === 3']);
  });

  it('passes a bare assert without a trailing semicolon and a raw statement', () => {
    const r = executeTestSuiteInIsolate(src, 'const x = 1;\nassert add(2,2) === 4');
    expect(r.passed).toBe(true);
    expect(r.score).toBe(1);
    expect(r.testDetails).toEqual(['[PASS] assert add(2,2) === 4']);
  });

  it('passes an assert call with a single argument', () => {
    const r = executeTestSuiteInIsolate(src, 'assert(add(1,1) === 2)');
    expect(r.passed).toBe(true);
    expect(r.testDetails).toEqual(['[PASS] assert(add(1,1) === 2)']);
  });

  it('passes an assert call with a message label', () => {
    const r = executeTestSuiteInIsolate(src, `assert(add(2,3) === 5, 'two plus three')`);
    expect(r.passed).toBe(true);
    expect(r.testDetails).toEqual(["[PASS] assert(add(2,3) === 5, 'two plus three');"]);
  });

  it('passes node-style equal', () => {
    const r = executeTestSuiteInIsolate(src, 'assert.equal(add(1,2), 3)');
    expect(r.passed).toBe(true);
  });

  it('passes node-style strictEqual', () => {
    const r = executeTestSuiteInIsolate(src, 'assert.strictEqual(add(1,2), 3)');
    expect(r.passed).toBe(true);
  });

  it('passes node-style notEqual', () => {
    const r = executeTestSuiteInIsolate(src, 'assert.notEqual(add(1,2), 4)');
    expect(r.passed).toBe(true);
  });

  it('passes node-style notStrictEqual', () => {
    const r = executeTestSuiteInIsolate(src, 'assert.notStrictEqual(add(1,2), 4)');
    expect(r.passed).toBe(true);
  });

  it('passes node-style deepEqual via JSON comparison', () => {
    const r = executeTestSuiteInIsolate(src, 'assert.deepEqual([1,2,3],[1,2,3])');
    expect(r.passed).toBe(true);
  });

  it('passes node-style ok with a message', () => {
    const r = executeTestSuiteInIsolate(src, 'assert.ok(add(1,2) === 3, "ok works")');
    expect(r.passed).toBe(true);
  });

  it('runs a single-arg assert.ok through the DSL shim (no longer aborts)', () => {
    const r = executeTestSuiteInIsolate(src, 'assert.ok(add(1,2) === 3)');
    expect(r.available).toBe(true);
    // The shim binds assert.ok, so the body executes instead of aborting with
    // "assert is not defined"; with no __assert records it is still not a pass.
    expect(r.passed).toBe(false);
    expect(r.testDetails.some((d) => d.includes('aborted'))).toBe(false);
  });

  it('aborts on an empty assert call', () => {
    const r = executeTestSuiteInIsolate(src, 'assert()');
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
    expect(r.testDetails[0]).toContain('Test body aborted with uncaught error');
  });

  it('fails a false assertion with a FAIL detail', () => {
    const r = executeTestSuiteInIsolate(src, 'assert add(1,2) === 5;');
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
    expect(r.testDetails).toEqual(['[FAIL] assert add(1,2) === 5 -> returned false']);
  });

  it('computes a partial score for mixed pass/fail assertions', () => {
    const r = executeTestSuiteInIsolate(src, 'assert add(1,2) === 3; assert add(1,2) === 5;');
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0.5);
  });

  it('skips trailing comment statements', () => {
    const r = executeTestSuiteInIsolate(src, 'assert add(1,1) === 2; // assert add(1,1) === 99');
    expect(r.passed).toBe(true);
    expect(r.testDetails).toHaveLength(1);
  });

  it('swallows a leading comment line with its following statement', () => {
    const r = executeTestSuiteInIsolate(src, '// foo\nassert add(1,1) === 2;');
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
  });

  it('splits comma-joined assert calls at the top level', () => {
    const r = executeTestSuiteInIsolate(src, 'assert(add(1,2)===3),assert(add(2,2)===4)');
    expect(r.passed).toBe(true);
    expect(r.score).toBe(1);
    expect(r.testDetails).toHaveLength(2);
  });

  it('keeps delimiters inside strings and nested structures intact', () => {
    const r = executeTestSuiteInIsolate(
      src,
      `assert("a;b,c(d".length === 7); assert([1,2,3].length === 3); assert(({x:1}).x === 1);`
    );
    expect(r.passed).toBe(true);
    expect(r.score).toBe(1);
  });

  it('reports a compilation error in the source honestly', () => {
    const r = executeTestSuiteInIsolate('export function broken( {', 'assert true === true;');
    expect(r.available).toBe(true);
    expect(r.passed).toBe(false);
    expect(r.stderr[0]).toContain('[COMPILATION ERROR]');
  });

  it('times out a runaway suite and reports it', () => {
    const r = executeTestSuiteInIsolate(
      'export function spin() { while (true) {} }',
      'assert spin() === 1;',
      { timeoutMs: 300 }
    );
    expect(r.available).toBe(true);
    expect(r.passed).toBe(false);
    expect(r.stderr[0]).toContain('timed out');
  });

  it('scores an empty suite as a non-pass with zero score', () => {
    const r = executeTestSuiteInIsolate(src, '');
    expect(r.available).toBe(true);
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
  });

  it('reports a non-string payload as no returned payload', () => {
    const r = executeTestSuiteInIsolate(
      "JSON.stringify = () => 123; export function f() { return 1; }",
      'assert f() === 1;'
    );
    expect(r.available).toBe(true);
    expect(r.passed).toBe(false);
    expect(r.testDetails[0]).toContain('isolate returned no payload');
  });

  it('reports an unparsable JSON payload as no returned payload', () => {
    const r = executeTestSuiteInIsolate(
      "JSON.stringify = () => '{bad'; export function f() { return 1; }",
      'assert f() === 1;'
    );
    expect(r.available).toBe(true);
    expect(r.passed).toBe(false);
    expect(r.testDetails[0]).toContain('isolate returned no payload');
  });

  it('tolerates a minimal valid payload from the isolate boundary', () => {
    const r = executeTestSuiteInIsolate(
      `JSON.stringify = () => '{"ok":true}'; export function f() { return 1; }`,
      'assert f() === 1;'
    );
    expect(r.available).toBe(true);
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
    expect(r.stdout).toEqual([]);
    expect(r.stderr).toEqual([]);
    expect(r.testDetails).toEqual([]);
  });
});

describe('isolated-vm availability (host-level, no assumptions)', () => {
  it('is a boolean and never throws on repeated calls', () => {
    expect(typeof isIsolateAvailable()).toBe('boolean');
    expect(typeof isIsolateAvailable()).toBe('boolean');
  });
});

describe('isolated-vm unavailable fallback (dependency-boundary fake)', () => {
  it('reports unavailable and falls back without crashing', async () => {
    vi.doMock('node:module', () => {
      const realCreateRequire = require('node:module').createRequire;
      return {
        createRequire: (p: string) => {
          const realRequire = realCreateRequire(p);
          return (id: string) => {
            if (id === 'isolated-vm') throw new Error('probe: isolated-vm not loadable');
            return realRequire(id);
          };
        },
      };
    });
    vi.resetModules();
    // @ts-expect-error query suffix busts the module cache at runtime; TS cannot resolve it.
    const fb = await import('../src/lib/isolatedSandbox?fallback');

    expect(fb.isIsolateAvailable()).toBe(false);
    expect(fb.isIsolateAvailable()).toBe(false);

    const tool = fb.executeToolInIsolate('export function add(a, b) { return a + b; }', 'add', [1, 2]);
    expect(tool.available).toBe(false);
    expect(tool.success).toBe(false);
    expect(tool.error).toBe('isolated-vm not loadable');
    expect(tool.stdout).toEqual([]);
    expect(tool.stderr).toEqual([]);

    const suite = fb.executeTestSuiteInIsolate(
      'export function add(a, b) { return a + b; }',
      'assert add(1,2) === 3;'
    );
    expect(suite.available).toBe(false);
    expect(suite.passed).toBe(false);
    expect(suite.score).toBe(0);
    expect(suite.stderr).toEqual(['isolated-vm not loadable']);
  });
});