import { describe, it, expect } from 'vitest';
import {
  isIsolateAvailable,
  executeToolInIsolate,
} from '../src/lib/isolatedSandbox';

const avail = isIsolateAvailable();

describe.skipIf(!avail)('isolated-vm sandbox hardening', () => {
  it('reports the native backend is available', () => {
    expect(avail).toBe(true);
  });

  it('executes a plain function and returns its JSON-safe value', () => {
    const res = executeToolInIsolate('export function add(a, b) { return a + b; }', 'add', [2, 3]);
    expect(res.available).toBe(true);
    expect(res.success).toBe(true);
    expect(res.returnValue).toBe(5);
  });

  it('returns an array/object value across the boundary', () => {
    const res = executeToolInIsolate('export function make(){ return { list: [1,2,3], n: 7 }; }', 'make', []);
    expect(res.success).toBe(true);
    expect(res.returnValue).toEqual({ list: [1, 2, 3], n: 7 });
  });

  it('does NOT expose host globals (no process) to the generated code', () => {
    const res = executeToolInIsolate('export function leak(){ return process.pid; }', 'leak', []);
    expect(res.success).toBe(false);
    expect(res.error && /process|not defined/i.test(res.error)).toBe(true);
  });

  it('enforces a wall-clock timeout on a runaway loop', () => {
    const res = executeToolInIsolate('export function spin(){ while(true){} }', 'spin', [], { timeoutMs: 300 });
    expect(res.timedOut).toBe(true);
    expect(res.success).toBe(false);
  });

  it('returns honest failure when no callable entrypoint exists', () => {
    const res = executeToolInIsolate('export function real(){ return 1; }', 'missing', []);
    expect(res.success).toBe(false);
    expect(res.error).toBeTruthy();
  });
});

describe('isolated-vm availability (host-level, no assumptions)', () => {
  it('is a boolean and never throws', () => {
    expect(typeof isIsolateAvailable()).toBe('boolean');
  });
});
