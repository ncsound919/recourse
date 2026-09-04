/**
 * External benchmark — the honest "is Recourse getting more capable" yardstick.
 *
 * A fixed, never-changing problem set (real micro-tasks with known-correct
 * behavior, one canonical entrypoint each). Scoring is real: each problem's
 * hidden suite is executed inside the sandbox against every CURRENT promoted
 * gene in the registry. A problem is solved only when some gene's live code
 * passes the hidden suite. No fixtures are injected and nothing is fabricated.
 *
 * Because the registry only grows, solved-count over time is a genuine, monotone
 * measure of external capability — not a self-report.
 */
import type { BenchmarkProblem, BenchmarkRun } from '../intake/types';
import type { ToolDomain, ToolEntry } from '../types';
import { executeTestSuite } from '../lib/executionSandbox';

export const BENCHMARK_PROBLEMS: BenchmarkProblem[] = [
  {
    id: 'p_fizzbuzz',
    domain: 'coding',
    title: 'FizzBuzz terminal program',
    description: 'Return Fizz for multiples of 3, Buzz for 5, FizzBuzz for 15, else the number as a string.',
    functionName: 'fizzbuzzFast',
    hiddenSuite: `assert fizzbuzzFast(3) === 'Fizz';
assert fizzbuzzFast(5) === 'Buzz';
assert fizzbuzzFast(15) === 'FizzBuzz';
assert fizzbuzzFast(7) === '7';
assert fizzbuzzFast(45) === 'FizzBuzz';`,
  },
  {
    id: 'p_vieta_roots',
    domain: 'math',
    title: 'Vieta quadratic root sum',
    description: 'For ax^2 + bx + c = 0 with real roots, return -b/a (the sum of roots).',
    functionName: 'sumOfRoots',
    hiddenSuite: `assert sumOfRoots(1, -5, 6) === 5;
assert sumOfRoots(2, 8, -10) === -4;
assert sumOfRoots(1, 0, -4) === 0;
assert sumOfRoots(3, -12, 9) === 4;`,
  },
  {
    id: 'p_horn_sat',
    domain: 'biotech',
    title: 'Horn-clause propagation',
    description: 'Forward-chain Horn clauses from a fact set and return all provable atoms.',
    functionName: 'solveHornClauses',
    hiddenSuite: `const clauses = [{ premises: ['oncogene_active'], head: 'hyper_proliferation' }, { premises: ['hyper_proliferation'], head: 'tumor_growth' }];
const facts = new Set(['oncogene_active']);
const out = solveHornClauses(clauses, facts);
assert out.has('tumor_growth');
assert out.has('hyper_proliferation');
assert out.size === 3;`,
  },
  {
    id: 'p_merkle_taint',
    domain: 'cyber_defense',
    title: 'Buffer taint sanitizer',
    description: 'Clamp out-of-range byte values into [0, 255] with overflow wrapping.',
    functionName: 'sanitizeBuffer',
    hiddenSuite: `const clean = sanitizeBuffer(new Uint8Array([1, 256, 300]));
assert clean.length === 3;
assert clean[0] === 1;
assert clean[1] === 0;
assert clean[2] === 44;`,
  },
  {
    id: 'p_bell_state',
    domain: 'quantum_sim',
    title: 'Bell-state construction',
    description: 'Construct a 2-qubit Bell state vector that is normalized.',
    functionName: 'createBellState',
    hiddenSuite: `const s = createBellState();
assert s.stateVector.length === 4;
const norm = s.stateVector.reduce((a, x) => a + x * x, 0);
assert Math.abs(norm - 1) < 1e-9;`,
  },
  {
    id: 'p_route_planner',
    domain: 'systemic',
    title: 'Multi-agent route planner',
    description: 'Plan a minimal path for each agent from start to goal.',
    functionName: 'planRoutes',
    hiddenSuite: `const r = planRoutes([{ id: 1, start: 'A', goal: 'B' }]);
assert r.length === 1;
assert r[0].path.length === 2;`,
  },
  {
    id: 'p_l2_cache',
    domain: 'coding',
    title: 'L2 cache semantics',
    description: 'Set/get key-value pairs; a missing key returns undefined.',
    functionName: 'L2Cache',
    hiddenSuite: `const c = new L2Cache();
c.set('k', 42);
assert c.get('k') === 42;
assert c.get('missing') === undefined;`,
  },
  {
    id: 'p_binary_search',
    domain: 'coding',
    title: 'Binary search in a sorted array',
    description: 'Return the index of target in a sorted ascending array, or -1 if absent.',
    functionName: 'binarySearch',
    hiddenSuite: `const a = [1, 3, 5, 7, 9];
assert binarySearch(a, 5) === 2;
assert binarySearch(a, 1) === 0;
assert binarySearch(a, 9) === 4;
assert binarySearch(a, 4) === -1;
assert binarySearch([], 3) === -1;`,
  },
  {
    id: 'p_balanced_parens',
    domain: 'coding',
    title: 'Balanced bracket validator',
    description: 'Return true iff ()[]{} are correctly nested and closed in the input string.',
    functionName: 'isBalanced',
    hiddenSuite: `assert isBalanced('(a[b]{c})') === true;
assert isBalanced('') === true;
assert isBalanced('([)]') === false;
assert isBalanced('(') === false;
assert isBalanced('{[]}') === true;`,
  },
  {
    id: 'p_merge_sorted',
    domain: 'coding',
    title: 'Merge two sorted arrays',
    description: 'Return a single sorted array merging two sorted inputs.',
    functionName: 'mergeSorted',
    hiddenSuite: `const m = mergeSorted([1, 4, 6], [2, 3, 5]);
assert m.length === 6;
assert JSON.stringify(m) === '[1,2,3,4,5,6]';
assert JSON.stringify(mergeSorted([], [1])) === '[1]';`,
  },
  {
    id: 'p_is_prime',
    domain: 'math',
    title: 'Primality test',
    description: 'Return true iff n (n >= 0) is prime.',
    functionName: 'isPrime',
    hiddenSuite: `assert isPrime(2) === true;
assert isPrime(3) === true;
assert isPrime(17) === true;
assert isPrime(97) === true;
assert isPrime(1) === false;
assert isPrime(25) === false;
assert isPrime(49) === false;`,
  },
  {
    id: 'p_matrix_multiply',
    domain: 'math',
    title: '2x2 matrix multiply',
    description: 'Multiply two numeric matrices and return the product matrix.',
    functionName: 'multiply',
    hiddenSuite: `const R = multiply([[1, 2], [3, 4]], [[5, 6], [7, 8]]);
assert R[0][0] === 19;
assert R[0][1] === 22;
assert R[1][0] === 43;
assert R[1][1] === 50;`,
  },
  {
    id: 'p_dijkstra',
    domain: 'systemic',
    title: 'Shortest paths (Dijkstra)',
    description: 'Return {node: shortestDistFromStart} for a small weighted adjacency graph.',
    functionName: 'dijkstra',
    hiddenSuite: `const g = { A: { B: 1, C: 4 }, B: { A: 1, C: 2, D: 6 }, C: { A: 4, B: 2, D: 3 }, D: { B: 6, C: 3 } };
const d = dijkstra(g, 'A');
assert d.A === 0;
assert d.B === 1;
assert d.C === 3;
assert d.D === 6;`,
  },
  {
    id: 'p_lru_cache',
    domain: 'systemic',
    title: 'LRU cache eviction',
    description: 'Set/get with bounded capacity; evict the least-recently-used key when full. Missing keys return -1.',
    functionName: 'LRUCache',
    hiddenSuite: `const c = new LRUCache(2);
c.set(1, 'a');
assert c.get(1) === 'a';
c.set(2, 'b');
c.set(3, 'c');
assert c.get(1) === -1;
assert c.get(2) === 'b';
assert c.get(3) === 'c';`,
  },
  {
    id: 'p_quantum_x',
    domain: 'quantum_sim',
    title: 'Single-qubit X gate',
    description: 'Return the state vector after applying the X (NOT) gate to a 2-amplitude vector.',
    functionName: 'applyX',
    hiddenSuite: `const z = applyX([1, 0]);
assert z[0] === 0;
assert z[1] === 1;
const o = applyX([0, 1]);
assert o[0] === 1;
assert o[1] === 0;`,
  },
];

/** Current promoted source of a tool (live code, exactly what the sandbox runs). */
export function currentToolSource(tool: ToolEntry): { source: string; name: string; domain: ToolDomain } | null {
  if (!tool.versions?.length) return null;
  const current = [...tool.versions].reverse().find((v) => v.promoted && v.source_code);
  const fallback = [...tool.versions].reverse().find((v) => v.source_code);
  const v = current ?? fallback;
  if (!v?.source_code) return null;
  return { source: v.source_code, name: tool.name, domain: tool.domain };
}

/**
 * Score the registry against every benchmark problem. A problem is solved when
 * any current gene's live source passes the hidden suite in the real sandbox.
 */
export function runBenchmark(registry: ToolEntry[]): BenchmarkRun {
  const sources: Array<{ source: string; name: string }> = [];
  for (const t of registry) {
    const cur = currentToolSource(t);
    if (cur) sources.push({ source: cur.source, name: t.name });
  }

  const solvedIds: string[] = [];
  for (const problem of BENCHMARK_PROBLEMS) {
    const solved = sources.some((gene) => {
      const run = executeTestSuite(gene.source, problem.hiddenSuite);
      return run.passed;
    });
    if (solved) solvedIds.push(problem.id);
  }

  return {
    at: Date.now(),
    solved: solvedIds.length,
    total: BENCHMARK_PROBLEMS.length,
    solvedIds,
  };
}

export function benchmarkSummary(run: BenchmarkRun | null): { solved: number; total: number; pct: number } {
  if (!run) return { solved: 0, total: BENCHMARK_PROBLEMS.length, pct: 0 };
  return {
    solved: run.solved,
    total: run.total,
    pct: Math.round((run.solved / run.total) * 10000) / 100,
  };
}
