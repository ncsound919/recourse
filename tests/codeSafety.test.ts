import { describe, it, expect, afterEach } from 'vitest';
import { screenInProcessCode, assertInProcessSafe, inProcessFallbackRefusal, UnsafeCodeError } from '../src/lib/codeSafety';

describe('screenInProcessCode', () => {
  it('accepts ordinary algorithmic code, including class constructors', () => {
    const ok = [
      'export function gcdPair(a, b) { while (b) { [a, b] = [b, a % b]; } return a; }',
      'export class LRU { constructor(n) { this.n = n; this.m = new Map(); } get(k) { return this.m.get(k); } }',
      'export function rev(s) { return s.split("").reverse().join(""); } // http://example.com',
      'export function pick(o, k) { return o[k]; }',
    ];
    for (const src of ok) expect(screenInProcessCode(src)).toEqual({ ok: true, violations: [] });
  });

  it('rejects the classic escape vocabulary', () => {
    const bad = [
      'export function f() { return process.env; }',
      'export function f() { return globalThis.process; }',
      'export function f() { return (() => 0).constructor("return this")(); }',
      'export function f(o) { return o["constr" + "uctor"]; }',
      'export function f(o) { return o[["con","structor"].join("")]; }',
      'export function f(o) { return o[atob("Y29uc3RydWN0b3I=")]; }',
      'export function f() { return require("fs"); }',
      'export async function f() { return import("node:child_process"); }',
      'export function f() { return eval("1"); }',
      'export function f() { return new Function("return 1")(); }',
      'export function f(o) { return o.__proto__; }',
      'export function f() { return Reflect.ownKeys({}); }',
      'export function f() { return fetch("http://x"); }',
      'export function f(o) { return o["\\u0063onstructor"]; }',
    ];
    for (const src of bad) expect(screenInProcessCode(src).ok, src).toBe(false);
  });

  it('ignores forbidden words that only appear in comments', () => {
    expect(screenInProcessCode('// do not touch process here\nexport function f(x) { return x; }').ok).toBe(true);
  });

  it('assertInProcessSafe throws a typed error', () => {
    expect(() => assertInProcessSafe('process.exit(1)')).toThrow(UnsafeCodeError);
  });
});

describe('inProcessFallbackRefusal', () => {
  const ORIG = process.env.RECOURSE_REQUIRE_ISOLATION;
  afterEach(() => {
    if (ORIG === undefined) delete process.env.RECOURSE_REQUIRE_ISOLATION; else process.env.RECOURSE_REQUIRE_ISOLATION = ORIG;
  });

  it('allows safe code by default and refuses unsafe code', () => {
    delete process.env.RECOURSE_REQUIRE_ISOLATION;
    expect(inProcessFallbackRefusal('export function f(x) { return x + 1; }')).toBeNull();
    expect(inProcessFallbackRefusal('export function f() { return process; }')).toMatch(/unsafe code/);
  });

  it('refuses everything in strict isolation mode', () => {
    process.env.RECOURSE_REQUIRE_ISOLATION = '1';
    expect(inProcessFallbackRefusal('export function f(x) { return x; }')).toMatch(/RECOURSE_REQUIRE_ISOLATION/);
  });
});
