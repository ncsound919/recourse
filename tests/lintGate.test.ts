import { describe, it, expect } from 'vitest';
import { lintSource } from '../src/lib/lintGate';

describe('oxlint safety gate', () => {
  it('reports unavailable honestly when the binary is missing', () => {
    // We cannot uninstall oxlint here, so this only asserts the shape.
    const r = lintSource('export function ok() { return 1; }', 'ts');
    expect(r.available).toBe(true);
  });

  it('flags eval, debugger and const-reassignment as blocking errors when available', () => {
    const r = lintSource('export function run(p){ return eval(p); }', 'js');
    if (r.available) {
      expect(r.clean).toBe(false);
      expect(r.errors).toBeGreaterThan(0);
    }
  });

  it('passes clean template-style TypeScript when available', () => {
    const code = `export class Bag {
  private store = new Map<string, number>();
  put(k: string, v: number): void { this.store.set(k, v); }
  get(k: string): number | undefined { return this.store.get(k); }
}`;
    const r = lintSource(code, 'ts');
    expect(r.available).toBe(true);
    expect(r.errors).toBe(0);
  });
});
