import { describe, it, expect } from 'vitest';
import { runBenchmark, benchmarkSummary, BENCHMARK_PROBLEMS } from '../src/benchmark/benchmark';
import type { ToolEntry } from '../src/types';

/** Build a minimal registry entry whose live promoted source is `source`. */
function gene(name: string, domain: ToolEntry['domain'], source: string): ToolEntry {
  return {
    name,
    domain,
    entrypoint: `src/tools/${name}.ts`,
    description: 'test gene',
    currentVersion: '1.0.0',
    healthStatus: 'healthy',
    versions: [
      {
        version: '1.0.0',
        hash: 'abc',
        created_at: Date.now(),
        passed_verifier: true,
        score: 1,
        promoted: true,
        source_code: source,
        test_suite_code: '// n/a',
      },
    ],
  } as ToolEntry;
}

describe('external capability benchmark - real, not self-report', () => {
  it('marks a problem solved only when a gene passes its hidden suite in the sandbox', () => {
    // A gene that genuinely solves p_vieta_roots (sum of roots = -b/a) and
    // p_merkle_taint (byte clamp by & 255). Nothing is injected into the hidden
    // suite; the gene must really satisfy it.
    const vieta = gene(
      'quadratic_vieta_root_sum',
      'math',
      `export function sumOfRoots(a, b, c) { return -b / a; }`,
    );
    const taint = gene(
      'merkle_taint_sanitizer',
      'cyber_defense',
      `export function sanitizeBuffer(arr) { return arr.map((v) => v & 255); }`,
    );

    const run = runBenchmark([vieta, taint]);

    expect(run.total).toBe(BENCHMARK_PROBLEMS.length);
    expect(run.solved).toBeGreaterThanOrEqual(2);
    expect(run.solvedIds).toContain('p_vieta_roots');
    expect(run.solvedIds).toContain('p_merkle_taint');
    // solved <= total always
    expect(run.solved).toBeLessThanOrEqual(run.total);
  });

  it('does NOT credit a problem a wrong gene cannot solve', () => {
    const wrong = gene('always_zero', 'coding', `export function sumOfRoots(a, b, c) { return 0; }`);
    const run = runBenchmark([wrong]);
    expect(run.solvedIds).not.toContain('p_vieta_roots');
  });

  it('a single capable gene can solve many problems, and summary is honest', () => {
    const omni = gene(
      'omni',
      'math',
      `
export function sumOfRoots(a, b, c) { return -b / a; }
export function sanitizeBuffer(arr) { return arr.map((v) => v & 255); }
`,
    );
    const run = runBenchmark([omni]);
    const summary = benchmarkSummary(run);
    expect(summary.total).toBe(BENCHMARK_PROBLEMS.length);
    expect(summary.solved).toBeGreaterThanOrEqual(2);
    expect(summary.pct).toBeGreaterThan(0);
  });

  it('benchmarkSummary reports 0 honestly when there has been no run', () => {
    expect(benchmarkSummary(null).solved).toBe(0);
    expect(benchmarkSummary(null).pct).toBe(0);
    expect(benchmarkSummary(null).total).toBe(BENCHMARK_PROBLEMS.length);
  });

  it('every hidden suite is well-formed and solvable (no broken/theater benchmark)', () => {
    // Reference gene that correctly solves every NEW falsifiable problem. If a
    // hidden suite is malformed or impossible, this gene will not pass it and
    // the test fails - guaranteeing each benchmark problem is gradeable.
    const ref = gene(
      'ref',
      'coding',
      `
export function binarySearch(a, t) { let lo = 0, hi = a.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (a[m] === t) return m; if (a[m] < t) lo = m + 1; else hi = m - 1; } return -1; }
export function isBalanced(s) { const st = []; const map = { ')': '(', ']': '[', '}': '{' }; for (const ch of s) { if ('([{'.includes(ch)) st.push(ch); else if (map[ch]) { if (st.pop() !== map[ch]) return false; } } return st.length === 0; }
export function mergeSorted(a, b) { const r = []; let i = 0, j = 0; while (i < a.length && j < b.length) r.push(a[i] < b[j] ? a[i++] : b[j++]); while (i < a.length) r.push(a[i++]); while (j < b.length) r.push(b[j++]); return r; }
export function isPrime(n) { if (n < 2) return false; if (n < 4) return true; if (n % 2 === 0) return false; for (let i = 3; i * i <= n; i += 2) if (n % i === 0) return false; return true; }
export function multiply(A, B) { const rows = A.length, cols = B[0].length, n = A[0].length; const R = Array.from({ length: rows }, () => Array(cols).fill(0)); for (let i = 0; i < rows; i++) for (let k = 0; k < n; k++) { const av = A[i][k]; if (av === 0) continue; for (let j = 0; j < cols; j++) R[i][j] += av * B[k][j]; } return R; }
export function dijkstra(g, s) { const dist = {}; const visited = new Set(); const nodes = Object.keys(g); for (const n of nodes) dist[n] = Infinity; dist[s] = 0; while (visited.size < nodes.length) { let u = null, best = Infinity; for (const n of nodes) if (!visited.has(n) && dist[n] < best) { best = dist[n]; u = n; } if (u === null) break; visited.add(u); for (const v of Object.keys(g[u])) { const w = g[u][v]; if (dist[v] > dist[u] + w) dist[v] = dist[u] + w; } } return dist; }
export class LRUCache { constructor(cap) { this.cap = cap; this.m = new Map(); } get(k) { if (!this.m.has(k)) return -1; const v = this.m.get(k); this.m.delete(k); this.m.set(k, v); return v; } set(k, v) { if (this.m.has(k)) this.m.delete(k); this.m.set(k, v); if (this.m.size > this.cap) this.m.delete(this.m.keys().next().value); } }
export function applyX(v) { return [v[1], v[0]]; }
`,
    );
    const run = runBenchmark([ref]);
    const newIds = ['p_binary_search', 'p_balanced_parens', 'p_merge_sorted', 'p_is_prime', 'p_matrix_multiply', 'p_dijkstra', 'p_lru_cache', 'p_quantum_x'];
    const missing = newIds.filter((id) => !run.solvedIds.includes(id));
    expect(missing).toEqual([]);
  });
});
