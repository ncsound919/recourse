/**
 * Robustness tier — edge and adversarial cases for the *same* functions the
 * baseline covers. A gene that solves the happy path but not these is not
 * actually correct; this tier makes that visible instead of hiding it behind a
 * 100% score.
 *
 * Every case here is unambiguous (no "first vs any occurrence" coin-flips) and
 * was verified to be fair: a correct general implementation passes it.
 */
import type { BenchmarkProblem } from '../intake/types';

export const EDGE_PROBLEMS: BenchmarkProblem[] = [
  {
    id: 'edge_fizzbuzz_zero', domain: 'coding', tier: 'robustness',
    title: 'FizzBuzz — zero is a multiple of fifteen',
    description: 'fizzbuzzFast must treat 0 as a multiple of both 3 and 5.',
    functionName: 'fizzbuzzFast',
    hiddenSuite: `assert fizzbuzzFast(0) === 'FizzBuzz';\nassert fizzbuzzFast(60) === 'FizzBuzz';\nassert fizzbuzzFast(91) === '91';`,
  },
  {
    id: 'edge_vieta_negative_a', domain: 'math', tier: 'robustness',
    title: 'Vieta root sum — negative leading coefficient',
    description: 'sumOfRoots must be correct for a < 0 and for b = 0.',
    functionName: 'sumOfRoots',
    hiddenSuite: `assert sumOfRoots(-2, 10, 8) === 5;\nassert sumOfRoots(4, 0, -9) === 0;\nassert sumOfRoots(1, -1, 0) === 1;`,
  },
  {
    id: 'edge_horn_cycle', domain: 'biotech', tier: 'robustness',
    title: 'Horn clauses — cycles and empty programs',
    description: 'solveHornClauses must terminate on cycles and return facts when there are no clauses.',
    functionName: 'solveHornClauses',
    hiddenSuite: `const a = solveHornClauses([], new Set(['x']));\nassert a.has('x');\nassert a.size === 1;\nconst c = solveHornClauses([{ premises: ['a'], head: 'b' }, { premises: ['b'], head: 'a' }], new Set(['a']));\nassert c.has('a') && c.has('b');\nassert c.size === 2;`,
  },
  {
    id: 'edge_sanitize_wrap', domain: 'cyber_defense', tier: 'robustness',
    title: 'Buffer sanitizer — wrapping beyond 512',
    description: 'sanitizeBuffer must wrap by modulo 256, not clamp, for values above 511.',
    functionName: 'sanitizeBuffer',
    hiddenSuite: `const c = sanitizeBuffer([256, 511, 767, 1024]);\nassert c[0] === 0;\nassert c[1] === 255;\nassert c[2] === 255;\nassert c[3] === 0;`,
  },
  {
    id: 'edge_bell_normalized', domain: 'quantum_sim', tier: 'robustness',
    title: 'Bell state — tight normalization',
    description: 'createBellState must return a normalized, non-zero state vector.',
    functionName: 'createBellState',
    hiddenSuite: `const s = createBellState();\nconst n = s.stateVector.reduce((a, x) => a + x * x, 0);\nassert Math.abs(n - 1) < 1e-12;\nassert s.stateVector.some((x) => Math.abs(x) > 0);`,
  },
  {
    id: 'edge_route_self', domain: 'systemic', tier: 'robustness',
    title: 'Route planner — start equals goal',
    description: 'planRoutes must return a single-node path when start === goal.',
    functionName: 'planRoutes',
    hiddenSuite: `const r = planRoutes([{ id: 1, start: 'A', goal: 'A' }]);\nassert r.length === 1;\nassert r[0].path.length === 1;`,
  },
  {
    id: 'edge_l2_overwrite', domain: 'coding', tier: 'robustness',
    title: 'L2 cache — overwrite semantics',
    description: 'L2Cache.set must overwrite an existing key.',
    functionName: 'L2Cache',
    hiddenSuite: `const c = new L2Cache();\nc.set('k', 1); c.set('k', 2);\nassert c.get('k') === 2;\nassert c.get('nope') === undefined;`,
  },
  {
    id: 'edge_bsearch_bounds', domain: 'coding', tier: 'robustness',
    title: 'Binary search — boundaries and duplicates',
    description: 'binarySearch must handle single elements, out-of-range targets, and duplicates.',
    functionName: 'binarySearch',
    hiddenSuite: `const a = [1, 2, 2, 2, 3];\nassert a[binarySearch(a, 2)] === 2;\nassert binarySearch([1, 2, 3], 0) === -1;\nassert binarySearch([1, 2, 3], 4) === -1;\nassert binarySearch([5], 5) === 0;`,
  },
  {
    id: 'edge_balanced_mixed', domain: 'coding', tier: 'robustness',
    title: 'Bracket validator — mixed nesting',
    description: 'isBalanced must reject interleaved closers and accept mixed text.',
    functionName: 'isBalanced',
    hiddenSuite: `assert isBalanced('{[()]}') === true;\nassert isBalanced('{[(])}') === false;\nassert isBalanced('a[b{c}d]e') === true;\nassert isBalanced('][') === false;`,
  },
  {
    id: 'edge_merge_empty_dups', domain: 'coding', tier: 'robustness',
    title: 'Merge sorted — empty and duplicates',
    description: 'mergeSorted must handle empty inputs and duplicate values.',
    functionName: 'mergeSorted',
    hiddenSuite: `assert JSON.stringify(mergeSorted([], [])) === '[]';\nassert JSON.stringify(mergeSorted([1, 1, 2], [1, 2])) === '[1,1,1,2,2]';\nassert JSON.stringify(mergeSorted([5], [1, 2, 3, 4])) === '[1,2,3,4,5]';`,
  },
  {
    id: 'edge_prime_large', domain: 'math', tier: 'robustness',
    title: 'Primality — large values',
    description: 'isPrime must be correct for large primes and composites, not a small lookup table.',
    functionName: 'isPrime',
    hiddenSuite: `assert isPrime(0) === false;\nassert isPrime(4) === false;\nassert isPrime(104729) === true;\nassert isPrime(104730) === false;\nassert isPrime(1000003) === true;`,
  },
  {
    id: 'edge_matrix_3x3', domain: 'math', tier: 'robustness',
    title: 'Matrix multiply — 3x3 (general, not hardcoded 2x2)',
    description: 'multiply must be a general matrix product, not a hardcoded 2x2.',
    functionName: 'multiply',
    hiddenSuite: `const R = multiply([[1, 2, 3], [4, 5, 6], [7, 8, 9]], [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);\nassert R[0][2] === 3;\nassert R[2][0] === 7;\nassert R[1][1] === 5;`,
  },
  {
    id: 'edge_dijkstra_relax', domain: 'systemic', tier: 'robustness',
    title: 'Dijkstra — requires relaxation',
    description: 'dijkstra must find the shortest path even when a two-hop route beats the direct edge.',
    functionName: 'dijkstra',
    hiddenSuite: `const g = { A: { B: 10, C: 1 }, B: { D: 1 }, C: { B: 1, D: 10 }, D: {} };\nconst d = dijkstra(g, 'A');\nassert d.D === 3;\nassert d.B === 2;`,
  },
  {
    id: 'edge_lru_recency', domain: 'systemic', tier: 'robustness',
    title: 'LRU cache — get() refreshes recency',
    description: 'LRUCache must evict by least-recently-used, where get() counts as use.',
    functionName: 'LRUCache',
    hiddenSuite: `const c = new LRUCache(2);\nc.set(1, 'a'); c.set(2, 'b'); c.get(1); c.set(3, 'c');\nassert c.get(2) === -1;\nassert c.get(1) === 'a';\nassert c.get(3) === 'c';`,
  },
  {
    id: 'edge_xgate_amplitudes', domain: 'quantum_sim', tier: 'robustness',
    title: 'X gate — swaps arbitrary amplitudes',
    description: 'applyX must swap amplitudes, not just map basis states.',
    functionName: 'applyX',
    hiddenSuite: `const z = applyX([0.6, 0.8]);\nassert Math.abs(z[0] - 0.8) < 1e-9;\nassert Math.abs(z[1] - 0.6) < 1e-9;`,
  },
];
