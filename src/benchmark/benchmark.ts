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
import crypto from 'node:crypto';
import type { BenchmarkProblem, BenchmarkRun, BenchmarkTier } from '../intake/types';
import type { ToolDomain, ToolEntry } from '../types';
import { executeTestSuite } from '../lib/executionSandbox';
import { EDGE_PROBLEMS } from './edgeProblems';
import { GENERATED_PROBLEMS } from './generatedProblems';

/**
 * The stable baseline: 15 happy-path micro-tasks. Kept as its own export for
 * back-compat; the scored set is `allBenchmarkProblems()` (baseline + robustness
 * + generated), so the score can be < 100% and has real headroom.
 */
const BASELINE_PROBLEMS = [
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
    description: 'Wrap out-of-range byte values modulo 256 into [0, 255].',
    functionName: 'sanitizeBuffer',
    hiddenSuite: `const clean = sanitizeBuffer([1, 256, 300]);
assert clean.length === 3;
assert clean[0] === 1;
assert clean[1] === 0;
assert clean[2] === 44;`,
  },
  {
    id: 'p_bell_state',
    domain: 'quantum_sim',
    title: 'Bell-state construction',
    description: 'Construct a maximally-entangled 2-qubit Bell state vector (two amplitudes of 1/sqrt(2)) that is normalized.',
    functionName: 'createBellState',
    hiddenSuite: `const s = createBellState();
assert s.stateVector.length === 4;
const norm = s.stateVector.reduce((a, x) => a + x * x, 0);
assert Math.abs(norm - 1) < 1e-9;
const nz = s.stateVector.filter((x) => Math.abs(x) > 1e-9);
assert nz.length === 2;
assert nz.every((x) => Math.abs(Math.abs(x) - Math.SQRT1_2) < 1e-9);`,
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
] satisfies BenchmarkProblem[];

export const BENCHMARK_PROBLEMS: BenchmarkProblem[] = BASELINE_PROBLEMS.map((p) => ({ ...p, tier: 'baseline' as const }));

/**
 * The scored set: baseline + robustness + generated. `robustness` exposes genes
 * that only solve the happy path; `generated` gives unbounded headroom (specs no
 * gene implements yet), so the score can be < 100% and can rise only when the
 * system produces working code for a new spec.
 *
 * Computed at call time (not a frozen array) so problems appended by the
 * activator's benchmark-refresh are included in the same run.
 */
const extraProblems: BenchmarkProblem[] = [];

export function allBenchmarkProblems(): BenchmarkProblem[] {
  return [...BENCHMARK_PROBLEMS, ...EDGE_PROBLEMS, ...GENERATED_PROBLEMS, ...extraProblems];
}

/**
 * Append a real generated problem to the scored set. Only the activator's
 * benchmark-refresh calls this, and only after the current set is fully solved —
 * so the yardstick gains headroom as capability catches up.
 */
export function appendBenchmarkProblem(problem: BenchmarkProblem): void {
  if (!extraProblems.some((p) => p.id === problem.id)) extraProblems.push(problem);
}

/**
 * The runtime-appended problems, in append order. The server persists this so
 * the scored set — and therefore `total` and `problemSetHash` — is identical
 * after a restart. Without it, a restart shrinks the set while the persisted
 * history still reports the old `total`, making `deltaSolved` go negative.
 */
export function appendedBenchmarkProblems(): BenchmarkProblem[] {
  return [...extraProblems];
}

/**
 * Replace the appended set from persisted state at boot. Dedupes by id and
 * ignores malformed entries, so a corrupt payload cannot poison the scored set.
 */
export function restoreBenchmarkProblems(problems: readonly BenchmarkProblem[]): void {
  extraProblems.length = 0;
  const seen = new Set<string>();
  for (const p of problems) {
    if (!p || typeof p.id !== 'string' || !p.id || seen.has(p.id)) continue;
    seen.add(p.id);
    extraProblems.push(p);
  }
}

/** Stable hash of the scored set (ids + suites), so a set change is visible. */
export function benchmarkProblemSetHash(problems: BenchmarkProblem[] = allBenchmarkProblems()): string {
  const parts = problems.map((p) => `${p.id}:${p.functionName}:${crypto.createHash('sha256').update(p.hiddenSuite).digest('hex').slice(0, 12)}`).sort();
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex');
}

const TIERS: BenchmarkTier[] = ['baseline', 'robustness', 'generated'];

/**
 * Current PROMOTED source of a tool (live code, exactly what the sandbox runs).
 * A tool with no promoted version is not scored: counting unpromoted/rejected
 * code as capability would make the benchmark measure the registry, not results.
 */
export function currentToolSource(tool: ToolEntry): { source: string; name: string; domain: ToolDomain } | null {
  if (!tool.versions?.length) return null;
  const v = [...tool.versions].reverse().find((x) => x.promoted && x.source_code);
  if (!v?.source_code) return null;
  return { source: v.source_code, name: tool.name, domain: tool.domain };
}

/**
 * Score the registry against every benchmark problem. A problem is solved when
 * any current gene's live source passes the hidden suite in the real sandbox.
 * Reports a per-tier breakdown so a flat overall score cannot hide a failing tier.
 */
export function runBenchmark(registry: ToolEntry[]): BenchmarkRun {
  const sources: Array<{ source: string; name: string }> = [];
  for (const t of registry) {
    const cur = currentToolSource(t);
    if (cur) sources.push({ source: cur.source, name: t.name });
  }

  const problems = allBenchmarkProblems();
  const solvedIds: string[] = [];
  const byTier: Record<string, { solved: number; total: number }> = {};
  for (const tier of TIERS) byTier[tier] = { solved: 0, total: 0 };

  for (const problem of problems) {
    const tier = problem.tier ?? 'baseline';
    if (!byTier[tier]) byTier[tier] = { solved: 0, total: 0 };
    byTier[tier].total += 1;
    const solved = sources.some((gene) => executeTestSuite(gene.source, problem.hiddenSuite).passed);
    if (solved) {
      solvedIds.push(problem.id);
      byTier[tier].solved += 1;
    }
  }

  return {
    at: Date.now(),
    solved: solvedIds.length,
    total: problems.length,
    solvedIds,
    byTier,
    problemSetHash: benchmarkProblemSetHash(problems),
  };
}

/**
 * Attest exactly which live sources were scored. The hash covers each tool name
 * and its current source, so a ledger record proves what the run measured.
 */
export function registryAttestation(registry: ToolEntry[]): string {
  const parts = registry
    .map((t) => {
      const cur = currentToolSource(t);
      return cur
        ? `${t.name}:${crypto.createHash('sha256').update(cur.source).digest('hex').slice(0, 16)}`
        : `${t.name}:none`;
    })
    .sort();
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex');
}

export function benchmarkSummary(run: BenchmarkRun | null): { solved: number; total: number; pct: number } {
  if (!run) return { solved: 0, total: allBenchmarkProblems().length, pct: 0 };
  return {
    solved: run.solved,
    total: run.total,
    pct: Math.round((run.solved / run.total) * 10000) / 100,
  };
}
