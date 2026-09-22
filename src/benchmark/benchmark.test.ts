import { describe, it, expect, vi } from 'vitest';
import {
  BENCHMARK_PROBLEMS,
  allBenchmarkProblems,
  benchmarkProblemSetHash,
  runBenchmark,
} from './benchmark';
import { GENERATED_PROBLEMS, generateProblems, makeGeneratedProblem } from './generatedProblems';
import { EDGE_PROBLEMS } from './edgeProblems';
import { executeTestSuite } from '../lib/executionSandbox';

describe('benchmark set composition', () => {
  it('scores baseline + robustness + generated, not just the fixed 15', () => {
    const all = allBenchmarkProblems();
    expect(BENCHMARK_PROBLEMS).toHaveLength(15);
    expect(EDGE_PROBLEMS.length).toBeGreaterThan(0);
    expect(GENERATED_PROBLEMS).toHaveLength(20);
    expect(all).toHaveLength(BENCHMARK_PROBLEMS.length + EDGE_PROBLEMS.length + GENERATED_PROBLEMS.length);
  });

  it('tags every problem with a tier', () => {
    for (const p of allBenchmarkProblems()) {
      expect(['baseline', 'robustness', 'generated']).toContain(p.tier);
    }
  });

  it('has a stable problem-set hash', () => {
    expect(benchmarkProblemSetHash()).toBe(benchmarkProblemSetHash(allBenchmarkProblems()));
    expect(benchmarkProblemSetHash().length).toBeGreaterThan(32);
  });
});

describe('generated tier determinism', () => {
  it('produces the same set for the same seed', () => {
    expect(generateProblems()).toEqual(generateProblems());
  });

  it('makeGeneratedProblem is deterministic and id-unique beyond the initial set', () => {
    const a = makeGeneratedProblem(GENERATED_PROBLEMS.length);
    const b = makeGeneratedProblem(GENERATED_PROBLEMS.length);
    expect(a).toEqual(b);
    expect(a.tier).toBe('generated');
    const ids = new Set(GENERATED_PROBLEMS.map((p) => p.id));
    expect(ids.has(a.id)).toBe(false);
  });

  it('generated suites are real, executable asserts (a correct impl passes)', () => {
    // Reference implementations for two generated function names.
    const gcd = `function gcdFast(a, b) { while (b) { [a, b] = [b, a % b]; } return a; }`;
    const clamp = `function clampRange(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }`;
    const gcdProblems = GENERATED_PROBLEMS.filter((p) => p.functionName === 'gcdFast');
    const clampProblems = GENERATED_PROBLEMS.filter((p) => p.functionName === 'clampRange');
    expect(gcdProblems.length).toBeGreaterThan(0);
    expect(clampProblems.length).toBeGreaterThan(0);
    for (const p of gcdProblems) expect(executeTestSuite(gcd, p.hiddenSuite).passed, p.id).toBe(true);
    for (const p of clampProblems) expect(executeTestSuite(clamp, p.hiddenSuite).passed, p.id).toBe(true);
  });
});

describe('runBenchmark tiers', () => {
  it('reports per-tier totals and can score below 100% on an empty registry', () => {
    const run = runBenchmark([]);
    expect(run.solved).toBe(0);
    expect(run.total).toBe(allBenchmarkProblems().length);
    expect(run.byTier?.baseline.total).toBe(15);
    expect(run.byTier?.generated.total).toBe(20);
    expect(run.problemSetHash).toBeTruthy();
  });

  it('the benchmark can fail: generated problems are unsolved by baseline genes', () => {
    // A gene that only solves fizzbuzz cannot solve the generated specs.
    const fizzbuzz = `function fizzbuzzFast(n){ return n%15===0?'FizzBuzz':n%3===0?'Fizz':n%5===0?'Buzz':String(n); }`;
    const run = runBenchmark([{
      name: 'fizzbuzz_solver', domain: 'coding', entrypoint: 'x', description: '',
      currentVersion: '1.0.0', healthStatus: 'healthy', anomalyCount: 0,
      versions: [{ version: '1.0.0', promoted: true, source_code: fizzbuzz }],
    } as never]);
    expect(run.solved).toBeGreaterThan(0); // it does solve fizzbuzz problems
    expect(run.solved).toBeLessThan(run.total); // but not everything — the score can be < 100%
  });

  it('does NOT score an unpromoted (rejected) version', () => {
    const rejected = {
      name: 'rejected', domain: 'coding', entrypoint: 'x', description: '',
      currentVersion: '1.0.0', healthStatus: 'degraded', anomalyCount: 0,
      versions: [{ version: '1.0.0', promoted: false, passed_verifier: false, source_code: `export function fizzbuzzFast(n){ return n%15===0?'FizzBuzz':n%3===0?'Fizz':n%5===0?'Buzz':String(n); }` }],
    } as never;
    expect(runBenchmark([rejected]).solved).toBe(0);
  });

  it('problemSetHash changes when a function name changes (not only the suite)', () => {
    const base = allBenchmarkProblems();
    const before = benchmarkProblemSetHash(base);
    const mutated = base.map((p) => (p.id === 'p_fizzbuzz' ? { ...p, functionName: 'fizzbuzzFast2' } : p));
    expect(benchmarkProblemSetHash(mutated)).not.toBe(before);
  });
});

describe('every hidden suite is real and solvable (all tiers)', () => {
  // A correct general implementation of every function the benchmark scores.
  // If any hidden suite is malformed, impossible, or trivially-passable, this
  // reference gene either fails it (broken) or a stub also passes it (theater).
  const REF = `
export function fizzbuzzFast(n) { return n % 15 === 0 ? 'FizzBuzz' : n % 3 === 0 ? 'Fizz' : n % 5 === 0 ? 'Buzz' : String(n); }
export function sumOfRoots(a, b, c) { return -b / a; }
export function solveHornClauses(clauses, facts) { const out = new Set(facts); let changed = true; while (changed) { changed = false; for (const c of clauses) { if (!out.has(c.head) && c.premises.every((p) => out.has(p))) { out.add(c.head); changed = true; } } } return out; }
export function sanitizeBuffer(arr) { return arr.map((v) => ((v % 256) + 256) % 256); }
export function createBellState() { return { stateVector: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] }; }
export function planRoutes(routes) { return routes.map((r) => ({ id: r.id, path: r.start === r.goal ? [r.start] : [r.start, r.goal] })); }
export class L2Cache { constructor() { this.m = new Map(); } set(k, v) { this.m.set(k, v); } get(k) { return this.m.get(k); } }
export function binarySearch(a, t) { let lo = 0, hi = a.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (a[m] === t) return m; if (a[m] < t) lo = m + 1; else hi = m - 1; } return -1; }
export function isBalanced(s) { const st = []; const map = { ')': '(', ']': '[', '}': '{' }; for (const ch of s) { if ('([{'.includes(ch)) st.push(ch); else if (map[ch]) { if (st.pop() !== map[ch]) return false; } } return st.length === 0; }
export function mergeSorted(a, b) { const r = []; let i = 0, j = 0; while (i < a.length && j < b.length) r.push(a[i] < b[j] ? a[i++] : b[j++]); while (i < a.length) r.push(a[i++]); while (j < b.length) r.push(b[j++]); return r; }
export function isPrime(n) { if (n < 2) return false; if (n < 4) return true; if (n % 2 === 0) return false; for (let i = 3; i * i <= n; i += 2) if (n % i === 0) return false; return true; }
export function multiply(A, B) { const rows = A.length, cols = B[0].length, n = A[0].length; const R = Array.from({ length: rows }, () => Array(cols).fill(0)); for (let i = 0; i < rows; i++) for (let k = 0; k < n; k++) { const av = A[i][k]; if (av === 0) continue; for (let j = 0; j < cols; j++) R[i][j] += av * B[k][j]; } return R; }
export function dijkstra(g, s) { const dist = {}; const visited = new Set(); const nodes = Object.keys(g); for (const n of nodes) dist[n] = Infinity; dist[s] = 0; while (visited.size < nodes.length) { let u = null, best = Infinity; for (const n of nodes) if (!visited.has(n) && dist[n] < best) { best = dist[n]; u = n; } if (u === null) break; visited.add(u); for (const v of Object.keys(g[u])) { const w = g[u][v]; if (dist[v] > dist[u] + w) dist[v] = dist[u] + w; } } return dist; }
export class LRUCache { constructor(cap) { this.cap = cap; this.m = new Map(); } get(k) { if (!this.m.has(k)) return -1; const v = this.m.get(k); this.m.delete(k); this.m.set(k, v); return v; } set(k, v) { if (this.m.has(k)) this.m.delete(k); this.m.set(k, v); if (this.m.size > this.cap) this.m.delete(this.m.keys().next().value); } }
export function applyX(v) { return [v[1], v[0]]; }
export function gcdFast(a, b) { while (b) { [a, b] = [b, a % b]; } return a; }
export function lcmFast(a, b) { return (a / gcdFast(a, b)) * b; }
export function reverseWords(s) { return s.trim().split(/\\s+/).reverse().join(' '); }
export function countVowels(s) { return (s.match(/[aeiou]/gi) || []).length; }
export function sumDigits(n) { return String(Math.abs(n)).split('').reduce((a, c) => a + Number(c), 0); }
export function isPalindrome(s) { const t = s.toLowerCase().replace(/[^a-z0-9]/g, ''); return t === [...t].reverse().join(''); }
export function dedupePreserveOrder(a) { return [...new Set(a)]; }
export function clampRange(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
export function factorialMod(n, m) { let r = 1; for (let i = 2; i <= n; i++) r = (r * i) % m; return r; }
export function nthFibonacci(n) { let a = 0, b = 1; for (let i = 0; i < n; i++) { [a, b] = [b, a + b]; } return a; }
`;

  it('a correct general implementation passes every problem in every tier', () => {
    const failures = allBenchmarkProblems()
      .filter((p) => !executeTestSuite(REF, p.hiddenSuite).passed)
      .map((p) => `${p.tier}/${p.id}`);
    expect(failures).toEqual([]);
  });

  it('a no-op stub does not pass the wrapping/entanglement problems (not theater)', () => {
    const stub = `export function sanitizeBuffer(b) { return b; }\nexport function createBellState() { return { stateVector: [1, 0, 0, 0] }; }`;
    const taint = allBenchmarkProblems().find((p) => p.id === 'p_merkle_taint')!;
    const bell = allBenchmarkProblems().find((p) => p.id === 'p_bell_state')!;
    expect(executeTestSuite(stub, taint.hiddenSuite).passed).toBe(false);
    expect(executeTestSuite(stub, bell.hiddenSuite).passed).toBe(false);
  });
});

describe('appended problems survive a restart (persisted set)', () => {
  it('rehydrating the persisted appended set reproduces the same set and hash', async () => {
    vi.resetModules();
    const first = await import('./benchmark');
    const base = first.allBenchmarkProblems().length;
    const extra = {
      id: 'gen_persist_probe',
      domain: 'math' as const,
      title: 'persist probe',
      description: 'x',
      functionName: 'persistFn',
      hiddenSuite: 'assert persistFn() === 1;',
      tier: 'generated' as const,
    };
    first.appendBenchmarkProblem(extra);
    expect(first.allBenchmarkProblems().length).toBe(base + 1);
    const saved = first.appendedBenchmarkProblems();
    const hashWithExtra = first.benchmarkProblemSetHash();

    // Simulate a process restart: fresh module state, then rehydrate from disk.
    vi.resetModules();
    const second = await import('./benchmark');
    expect(second.allBenchmarkProblems().length).toBe(base); // lost without restore
    second.restoreBenchmarkProblems(saved);
    expect(second.allBenchmarkProblems().length).toBe(base + 1);
    // Same scored set => same hash, so the ledger is comparable across restarts.
    expect(second.benchmarkProblemSetHash()).toBe(hashWithExtra);
  });

  it('restore dedupes by id and ignores malformed entries', async () => {
    vi.resetModules();
    const b = await import('./benchmark');
    const base = b.allBenchmarkProblems().length;
    b.restoreBenchmarkProblems([
      { id: 'gen_keep', domain: 'math', title: 't', description: 'd', functionName: 'f', hiddenSuite: 'assert f();', tier: 'generated' },
      { id: 'gen_keep', domain: 'math', title: 't', description: 'd', functionName: 'f', hiddenSuite: 'assert f();', tier: 'generated' },
      null as never,
      { id: '' } as never,
    ]);
    expect(b.allBenchmarkProblems().length).toBe(base + 1);
  });
});
