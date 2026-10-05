/**
 * Capability Forge — the closed, honest self-improvement loop.
 *
 * Goal: turn an autonomous cycle into a *durable capability delta* — a new,
 * verified, live-callable self-hosted tool — instead of incrementing a counter.
 *
 * Honesty contract (anti-theater):
 *  - Every agenda item carries a HUMAN-authored reference suite describing
 *    known-correct behavior. The model only writes the implementation.
 *  - Verification runs the generated source against that reference suite in
 *    the real sandbox. A pass therefore means real behavioral correctness,
 *    NOT the model agreeing with its own (possibly wrong) self-written tests.
 *  - On failure the sandbox's real per-assertion output is fed back and the
 *    model retries (bounded). Nothing is promoted unless the reference suite
 *    passes. If the model never passes, the attempt is recorded honestly as
 *    failed — it is never faked into a "success".
 *  - The forge can be pointed at a different model than the rest of the app
 *    via FORGE_MODEL_* env vars, defaulting to the global API provider
 *    (FORGE_* -> API_MODEL_* -> MODEL_* -> the API default). The local
 *    profile is inert unless explicitly configured.
 */

import type { ToolDomain } from '../types';
import type { BenchmarkRun } from '../intake/types';
import { GENERATED_PROBLEMS } from '../benchmark/generatedProblems';
import { executeTestSuite } from './executionSandbox';
import { integrateAxiomTool, axiomReachable } from './axiomBridge.js';
import { skillAwareChat } from './skillContext.js';
import { adaptiveBudget, difficultyIndex } from './adaptiveCompute.js';
import {
  assessForgeCandidate,
  betterQuality,
  extractToolDoc,
  isSubstantivelyClean,
  qualityFeedback,
  splitSuiteForHoldout,
} from './forgeQuality.js';
import type { ForgeQualityReport, ToolDoc } from './forgeQuality.js';
import type { GroundingBundle } from './researchGrounding/types.js';
import { groundingSection } from './researchGrounding/prompt.js';

export interface ForgeSpec {
  id: string;
  /** Exact exported function name the implementation must define. */
  name: string;
  domain: ToolDomain;
  title: string;
  /** 'function' (default) emits a bare exported function that self-hosts. */
  kind?: 'function' | 'class';
  /** Behavioral contract shown to the model (description + examples). */
  prompt: string;
  /** Hidden reference suite (asserts) — the real judge. Not shown to model. */
  refSuite: string;
  /** Optional known-correct implementation (never shown to the model). When
   *  present the quality gate runs candidate and reference side by side on the
   *  suite's inputs plus perturbations (differential testing). */
  reference?: string;
  /** Optional representative argument vectors for differential/robustness probes. */
  vectors?: unknown[];
  /**
   * External research gathered for this spec, injected into the generation
   * prompt as fenced, trust-labelled excerpts.
   *
   * Deliberately alongside `refSuite`, not inside it. The suite is the judge of
   * whether the code is correct; evidence is evidence about whether the problem
   * was worth solving. They answer different questions and only the suite can
   * gate a promotion.
   */
  grounding?: GroundingBundle;
}

export interface ForgeFailure {
  attempt: number;
  note: string;
}

/**
 * Unsolved GENERATED benchmark problems as forge specs — the return leg that
 * makes the generated tier move.
 *
 * Without this, the generated tier is only headroom: no gene implements those
 * specs, so the score never rises. Feeding them to the forge means the loop
 * generates + sandbox-verifies a real implementation against the problem's own
 * hidden suite; a pass registers a tool the benchmark then counts. So
 * `deltaSolved` reflects capability, not a set change.
 */
export function benchmarkGapSpecs(run: Pick<BenchmarkRun, 'solvedIds'> | null | undefined): ForgeSpec[] {
  if (!run) return [];
  const solved = new Set(run.solvedIds ?? []);
  return GENERATED_PROBLEMS
    .filter((p) => !solved.has(p.id))
    .map((p) => ({
      id: `benchgap_${p.id}`,
      name: p.functionName,
      domain: p.domain,
      title: p.title,
      prompt: `${p.description}\n\nDefine and export exactly one function named "${p.functionName}" that satisfies the contract. Return only the code.`,
      refSuite: p.hiddenSuite,
      ...(p.referenceSource ? { reference: p.referenceSource } : {}),
      ...(p.sampleArgs ? { vectors: p.sampleArgs } : {}),
    }));
}

export interface ForgeAttemptOutcome {
  ok: boolean;
  id: string;
  name: string;
  domain: ToolDomain;
  /** Present and correct only when ok === true (source passed the ref suite). */
  source?: string;
  /** Overrides spec.refSuite when the source was renamed (dream-gene path). */
  refSuite?: string;
  /** Human reason when not ok: 'offline' | 'failed' | 'quality' (passed the
   *  reference suite but never cleared the quality gate). */
  reason?: 'offline' | 'failed' | 'quality';
  attemptsUsed: number;
  maxTries: number;
  failures: ForgeFailure[];
  verifyScore?: number;
  verifyDetails?: string[];
  /** Quality report of the promoted (or best rejected) candidate. */
  quality?: ForgeQualityReport;
  /** JSDoc-derived description of the promoted tool (for tool-calling). */
  doc?: ToolDoc;
  /** How many candidates passed the reference suite (best-of-N selection). */
  candidatesPassed?: number;
  /** The research this candidate was generated against, for the ledger. */
  grounding?: GroundingBundle;
}

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------
// Curated, well-scoped micro-capabilities that are NOT in the genesis registry.
// All pure, JSON-serializable, single-function, with known-correct behavior.
export const FORGE_AGENDA: ForgeSpec[] = [
  {
    id: 'forge_dedupe_stable',
    name: 'dedupeStable',
    domain: 'coding',
    title: 'Stable array deduplication',
    prompt:
      'Implement `export function dedupeStable(arr)`. Return a new array with duplicate primitive values removed, keeping the FIRST occurrence order (stable). Input is an array of strings/numbers. Example: dedupeStable([1,2,1,3,2,4]) -> [1,2,3,4]; dedupeStable(["a","b","a","c"]) -> ["a","b","c"]; dedupeStable([]) -> []. Do not mutate the input.',
    refSuite:
      'assert JSON.stringify(dedupeStable([1,2,1,3,2,4])) === JSON.stringify([1,2,3,4]);\n' +
      'assert dedupeStable(["a","b","a","c","b"]).length === 3;\n' +
      'assert dedupeStable([]).length === 0;\n' +
      'assert JSON.stringify(dedupeStable([5,5,5])) === JSON.stringify([5]);',
    // NO reference oracle here, deliberately.
    //
    // An earlier version shipped one that handled NaN and -0 (where a plain
    // `new Set` is wrong). It was removed because the probes that reach an
    // oracle travel as JSON source, in which NaN and -0 are unrepresentable —
    // so on every input the forge can actually generate, the oracle and the Set
    // implementation agree. An oracle that cannot discriminate is worse than
    // none: it looks like verification while proving nothing, and
    // tests/forgeAgendaReferences.test.ts now fails any such oracle. The
    // verification for this spec is its suite plus the behavioral checks.
  },
  {
    id: 'forge_chunk_array',
    name: 'chunkArray',
    domain: 'coding',
    title: 'Array chunking',
    prompt:
      'Implement `export function chunkArray(arr, size)`. Split arr into sub-arrays of length `size`; the last chunk may be shorter. size is a positive integer. Example: chunkArray([1,2,3,4,5],2) -> [[1,2],[3,4],[5]]; chunkArray([1,2,3],5) -> [[1,2,3]]; chunkArray([],2) -> []. Do not mutate input.',
    refSuite:
      'assert JSON.stringify(chunkArray([1,2,3,4,5],2)) === JSON.stringify([[1,2],[3,4],[5]]);\n' +
      'assert JSON.stringify(chunkArray([1,2,3],5)) === JSON.stringify([[1,2,3]]);\n' +
      'assert chunkArray([],2).length === 0;\n' +
      'assert JSON.stringify(chunkArray([1,2,3,4],2)) === JSON.stringify([[1,2],[3,4]]);',
    // Exact oracle: last chunk may be shorter. Off-by-one on the size guard
    // (returning [] for size<=0, or dropping the tail) is invisible to the suite.
    reference:
      'export function chunkArray(arr, size) {\n' +
      '  const n = Number(size);\n' +
      '  if (!Number.isFinite(n) || n <= 0) throw new Error("size must be positive");\n' +
      '  const step = Math.floor(n);\n' +
      '  const out = [];\n' +
      '  for (let i = 0; i < arr.length; i += step) out.push(arr.slice(i, i + step));\n' +
      '  return out;\n' +
      '}',
  },
  {
    id: 'forge_run_length_encode',
    name: 'runLengthEncode',
    domain: 'coding',
    title: 'Run-length string encoding',
    prompt:
      'Implement `export function runLengthEncode(str)`. Return a run-length encoded string: each run of identical consecutive characters becomes the character followed by its count. Example: "aaaabbc" -> "a4b2c1"; "abc" -> "a1b1c1"; "aaaa" -> "a4"; "" -> "".',
    refSuite:
      'assert runLengthEncode("aaaabbc") === "a4b2c1";\n' +
      'assert runLengthEncode("") === "";\n' +
      'assert runLengthEncode("abc") === "a1b1c1";\n' +
      'assert runLengthEncode("aaaa") === "a4";',
    // Exact oracle: empty input yields "", and multi-code-unit characters are
    // counted per code point (Array.from) rather than per UTF-16 unit.
    reference:
      'export function runLengthEncode(s) {\n' +
      '  const chars = Array.from(String(s));\n' +
      '  if (chars.length === 0) return "";\n' +
      '  let out = "";\n' +
      '  let run = chars[0];\n' +
      '  let count = 1;\n' +
      '  for (let i = 1; i < chars.length; i++) {\n' +
      '    if (chars[i] === run) { count++; continue; }\n' +
      '    out += run + count;\n' +
      '    run = chars[i];\n' +
      '    count = 1;\n' +
      '  }\n' +
      '  return out + run + count;\n' +
      '}',
  },
  {
    id: 'forge_fibonacci_n',
    name: 'fibonacciN',
    domain: 'math',
    title: 'Nth Fibonacci number',
    prompt:
      'Implement `export function fibonacciN(n)`. Return the nth Fibonacci number, 0-indexed: fibonacciN(0)=0, fibonacciN(1)=1, fibonacciN(2)=1. n is a non-negative integer. Examples: fibonacciN(0)=0, fibonacciN(1)=1, fibonacciN(10)=55, fibonacciN(20)=6765.',
    refSuite:
      'assert fibonacciN(0) === 0;\n' +
      'assert fibonacciN(1) === 1;\n' +
      'assert fibonacciN(10) === 55;\n' +
      'assert fibonacciN(20) === 6765;',
    // Exact oracle. The suite stops at n=20; a naive double loop is exact there
    // but silently rounds past n~78. BigInt keeps it exact for any n.
    reference:
      'export function fibonacciN(n) {\n' +
      '  if (n < 0) throw new Error("n must be non-negative");\n' +
      '  let a = 0n, b = 1n;\n' +
      '  for (let i = 0; i < n; i++) { const t = a + b; a = b; b = t; }\n' +
      '  return Number(a);\n' +
      '}',
  },
  {
    id: 'forge_gcd_pair',
    name: 'gcdPair',
    domain: 'math',
    title: 'Greatest common divisor',
    prompt:
      'Implement `export function gcdPair(a, b)`. Return the greatest common divisor of two non-negative integers using the Euclidean algorithm. gcd(a,0)=a. Examples: gcdPair(48,18)=6, gcdPair(17,5)=1, gcdPair(0,12)=12, gcdPair(100,0)=100.',
    refSuite:
      'assert gcdPair(48,18) === 6;\n' +
      'assert gcdPair(17,5) === 1;\n' +
      'assert gcdPair(0,12) === 12;\n' +
      'assert gcdPair(100,0) === 100;',
    // Exact oracle: Euclidean algorithm on BigInt. The suite's inputs are tiny;
    // a `%`-based gcd on doubles is wrong once the operands exceed 2^53.
    reference:
      'export function gcdPair(a, b) {\n' +
      '  let x = BigInt(a), y = BigInt(b);\n' +
      '  if (x < 0n) x = -x;\n' +
      '  if (y < 0n) y = -y;\n' +
      '  while (y) { const t = x % y; x = y; y = t; }\n' +
      '  return Number(x);\n' +
      '}',
  },
  {
    id: 'forge_levenshtein',
    name: 'levenshteinDistance',
    domain: 'systemic',
    title: 'Levenshtein edit distance',
    prompt:
      'Implement `export function levenshteinDistance(a, b)`. Return the minimum number of single-character edits (insert, delete, substitute) to turn string a into string b. Examples: ("kitten","sitting")=3, ("flaw","lawn")=2, ("","abc")=3, ("same","same")=0, ("a","b")=1. Use dynamic programming.',
    refSuite:
      'assert levenshteinDistance("kitten","sitting") === 3;\n' +
      'assert levenshteinDistance("flaw","lawn") === 2;\n' +
      'assert levenshteinDistance("","abc") === 3;\n' +
      'assert levenshteinDistance("same","same") === 0;\n' +
      'assert levenshteinDistance("a","b") === 1;',
  },
  {
    id: 'forge_top_k_frequent',
    name: 'topKFrequent',
    domain: 'systemic',
    title: 'Top-K most frequent elements (stable)',
    prompt:
      'Implement `export function topKFrequent(arr, k)`. Return the k elements with the highest frequency in arr, most frequent first; break ties by FIRST occurrence order (stable). Example: ([1,1,1,2,2,3],2) -> [1,2]; ([1,2,2,3,3,3],2) -> [3,2]; ([1,1,2,2,3,3],2) -> [1,2]; ([3,3,3,1,1,2,2,2],1) -> [3].',
    refSuite:
      'assert JSON.stringify(topKFrequent([1,1,1,2,2,3],2)) === JSON.stringify([1,2]);\n' +
      'assert JSON.stringify(topKFrequent([1,2,2,3,3,3],2)) === JSON.stringify([3,2]);\n' +
      'assert JSON.stringify(topKFrequent([1,1,2,2,3,3],2)) === JSON.stringify([1,2]);\n' +
      'assert JSON.stringify(topKFrequent([3,3,3,1,1,2,2,2],1)) === JSON.stringify([3]);',
  },
  // These seven specs are the exact function contracts of the OPEN external
  // benchmark problems (see src/benchmark/benchmark.ts). When the forge
  // materializes one, its real gene source satisfies the benchmark's hidden
  // suite, so benchmarkSolved rises - closing the loop between the honest
  // external yardstick and the autonomous builder.
  {
    id: 'forge_binary_search',
    name: 'binarySearch',
    domain: 'coding',
    title: 'Binary search in a sorted array',
    prompt:
      'Implement `export function binarySearch(arr, target)`. arr is a sorted ascending array of numbers. Return the index of target, or -1 if not present. Examples: ([1,3,5,7,9],5)->2; ([1,3,5,7,9],1)->0; ([1,3,5,7,9],9)->4; ([1,3,5,7,9],4)->-1; ([],3)->-1. Use O(log n).',
    refSuite:
      'const a = [1, 3, 5, 7, 9];\n' +
      'assert binarySearch(a, 5) === 2;\n' +
      'assert binarySearch(a, 1) === 0;\n' +
      'assert binarySearch(a, 9) === 4;\n' +
      'assert binarySearch(a, 4) === -1;\n' +
      'assert binarySearch([], 3) === -1;',
  },
  {
    id: 'forge_balanced_parens',
    name: 'isBalanced',
    domain: 'coding',
    title: 'Balanced bracket validator',
    prompt:
      'Implement `export function isBalanced(str)`. Return true iff (), [], {} are correctly nested and closed in str (non-bracket characters ignored). Examples: "(a[b]{c})"->true; ""->true; "([)]"->false; "("->false; "{[]}"->true.',
    refSuite:
      'assert isBalanced("(a[b]{c})") === true;\n' +
      'assert isBalanced("") === true;\n' +
      'assert isBalanced("([)]") === false;\n' +
      'assert isBalanced("(") === false;\n' +
      'assert isBalanced("{[]}") === true;',
    // Exact oracle: a stack, so nesting order is respected — "([)]" is false
    // even though the counts match, which a counter-only implementation misses.
    reference:
      'export function isBalanced(s) {\n' +
      '  const open = { "(": ")", "[": "]", "{": "}" };\n' +
      '  const close = { ")": true, "]": true, "}": true };\n' +
      '  const stack = [];\n' +
      '  for (const ch of Array.from(String(s))) {\n' +
      '    if (open[ch]) { stack.push(open[ch]); continue; }\n' +
      '    if (!close[ch]) continue;\n' +
      '    if (stack.pop() !== ch) return false;\n' +
      '  }\n' +
      '  return stack.length === 0;\n' +
      '}',
  },
  {
    id: 'forge_merge_sorted',
    name: 'mergeSorted',
    domain: 'coding',
    title: 'Merge two sorted arrays',
    prompt:
      'Implement `export function mergeSorted(a, b)`. a and b are each sorted ascending arrays of numbers. Return one sorted array merging both. Examples: ([1,4,6],[2,3,5])->[1,2,3,4,5,6]; ([],[1])->[1].',
    refSuite:
      'const m = mergeSorted([1, 4, 6], [2, 3, 5]);\n' +
      'assert m.length === 6;\n' +
      'assert JSON.stringify(m) === "[1,2,3,4,5,6]";\n' +
      'assert JSON.stringify(mergeSorted([], [1])) === "[1]";',
  },
  {
    id: 'forge_is_prime',
    name: 'isPrime',
    domain: 'math',
    title: 'Primality test',
    prompt:
      'Implement `export function isPrime(n)`. n is a non-negative integer. Return true iff n is prime. Examples: 2->true,3->true,17->true,97->true; 1->false,25->false,49->false. Handle n<2.',
    refSuite:
      'assert isPrime(2) === true;\n' +
      'assert isPrime(3) === true;\n' +
      'assert isPrime(17) === true;\n' +
      'assert isPrime(97) === true;\n' +
      'assert isPrime(1) === false;\n' +
      'assert isPrime(25) === false;\n' +
      'assert isPrime(49) === false;',
  },
  {
    id: 'forge_matrix_multiply',
    name: 'multiply',
    domain: 'math',
    title: '2x2 matrix multiply',
    prompt:
      'Implement `export function multiply(A, B)`. A and B are 2x2 matrices of numbers (arrays of arrays). Return their matrix product. Example: [[1,2],[3,4]] x [[5,6],[7,8]] -> [[19,22],[43,50]].',
    refSuite:
      'const R = multiply([[1, 2], [3, 4]], [[5, 6], [7, 8]]);\n' +
      'assert R[0][0] === 19;\n' +
      'assert R[0][1] === 22;\n' +
      'assert R[1][0] === 43;\n' +
      'assert R[1][1] === 50;',
  },
  {
    id: 'forge_dijkstra',
    name: 'dijkstra',
    domain: 'systemic',
    title: 'Shortest paths (Dijkstra)',
    prompt:
      'Implement `export function dijkstra(graph, start)`. graph maps node -> { neighbor: edgeWeight }. Return an object { node: shortestDistanceFromStart } using Dijkstra. start distance is 0; unreachable nodes are Infinity. Example graph: {A:{B:1,C:4},B:{A:1,C:2,D:6},C:{A:4,B:2,D:3},D:{B:6,C:3}} from A -> {A:0,B:1,C:3,D:6}.',
    refSuite:
      'const g = { A: { B: 1, C: 4 }, B: { A: 1, C: 2, D: 6 }, C: { A: 4, B: 2, D: 3 }, D: { B: 6, C: 3 } };\n' +
      'const d = dijkstra(g, "A");\n' +
      'assert d.A === 0;\n' +
      'assert d.B === 1;\n' +
      'assert d.C === 3;\n' +
      'assert d.D === 6;',
  },
  {
    id: 'forge_quantum_x',
    name: 'applyX',
    domain: 'quantum_sim',
    title: 'Single-qubit X gate',
    prompt:
      'Implement `export function applyX(vector)`. vector is a length-2 amplitude array. Apply the X (NOT) gate: return [vector[1], vector[0]]. Examples: applyX([1,0])->[0,1]; applyX([0,1])->[1,0].',
    refSuite:
      'const z = applyX([1, 0]);\n' +
      'assert z[0] === 0;\n' +
      'assert z[1] === 1;\n' +
      'const o = applyX([0, 1]);\n' +
      'assert o[0] === 1;\n' +
      'assert o[1] === 0;',
  },
  {
    id: 'forge_quicksort',
    name: 'quickSort',
    domain: 'coding',
    title: 'Quicksort (stable, non-mutating)',
    prompt:
      'Implement `export function quickSort(arr)`. Return a NEW sorted ascending array of numbers (do not mutate the input). Must be stable for equal elements. Examples: ([3,1,2])->[1,2,3]; ([])->[]; ([5,5,1])->[1,5,5]; ([9,7,8,7])->[7,7,8,9].',
    refSuite:
      'assert JSON.stringify(quickSort([3, 1, 2])) === "[1,2,3]";\n' +
      'assert JSON.stringify(quickSort([])) === "[]";\n' +
      'assert JSON.stringify(quickSort([5, 5, 1])) === "[1,5,5]";\n' +
      'assert JSON.stringify(quickSort([9, 7, 8, 7])) === "[7,7,8,9]";',
    // Exact oracle: non-mutating and median-pivot, so the worst case is
    // O(n log n). A naive last-element pivot degrades to O(n^2) — invisible to
    // the suite's tiny inputs but a real defect on real data.
    reference:
      'export function quickSort(arr) {\n' +
      '  const a = arr.slice();\n' +
      '  const swap = (i, j) => { const t = a[i]; a[i] = a[j]; a[j] = t; };\n' +
      '  const sort = (lo, hi) => {\n' +
      '    if (lo >= hi) return;\n' +
      '    const mid = lo + ((hi - lo) >> 1);\n' +
      '    swap(mid, hi);\n' +
      '    const pivot = a[hi];\n' +
      '    let store = lo;\n' +
      '    for (let i = lo; i < hi; i++) if (a[i] < pivot) { swap(i, store); store++; }\n' +
      '    swap(store, hi);\n' +
      '    sort(lo, store - 1);\n' +
      '    sort(store + 1, hi);\n' +
      '  };\n' +
      '  sort(0, a.length - 1);\n' +
      '  return a;\n' +
      '}',
  },
  {
    id: 'forge_flatten_deep',
    name: 'flattenDeep',
    domain: 'coding',
    title: 'Deep array flatten',
    prompt:
      'Implement `export function flattenDeep(arr)`. Recursively flatten arbitrarily nested arrays into a single flat array, preserving order. Examples: ([1,[2,[3,[4]],5]])->[1,2,3,4,5]; ([[],[[]]])->[]; ([1,2,3])->[1,2,3].',
    refSuite:
      'assert JSON.stringify(flattenDeep([1, [2, [3, [4]], 5]])) === "[1,2,3,4,5]";\n' +
      'assert JSON.stringify(flattenDeep([[], [[]]])) === "[]";\n' +
      'assert JSON.stringify(flattenDeep([1, 2, 3])) === "[1,2,3]";',
    // Exact oracle: recurses into ARRAYS only. An implementation that also
    // flattens strings or plain objects passes this suite and then silently
    // corrupts data — the classic JS spread-on-string bug.
    reference:
      'export function flattenDeep(arr) {\n' +
      '  const out = [];\n' +
      '  const walk = (v) => {\n' +
      '    if (Array.isArray(v)) { for (const x of v) walk(x); return; }\n' +
      '    out.push(v);\n' +
      '  };\n' +
      '  walk(arr);\n' +
      '  return out;\n' +
      '}',
  },
  {
    id: 'forge_sieve_primes',
    name: 'sievePrimes',
    domain: 'math',
    title: 'Sieve of Eratosthenes',
    prompt:
      'Implement `export function sievePrimes(n)`. n is a non-negative integer. Return all primes <= n in ascending order using the Sieve of Eratosthenes. Examples: (10)->[2,3,5,7]; (2)->[2]; (1)->[]; (20)->[2,3,5,7,11,13,17,19].',
    refSuite:
      'assert JSON.stringify(sievePrimes(10)) === "[2,3,5,7]";\n' +
      'assert JSON.stringify(sievePrimes(2)) === "[2]";\n' +
      'assert JSON.stringify(sievePrimes(1)) === "[]";\n' +
      'assert JSON.stringify(sievePrimes(20)) === "[2,3,5,7,11,13,17,19]";',
    // Exact oracle: primes are integers with no float representation concern,
    // but the sieve BOUNDS are — a float bound check misclassifies large n.
    reference:
      'export function sievePrimes(n) {\n' +
      '  const limit = Number(n);\n' +
      '  const out = [];\n' +
      '  if (limit < 2) return out;\n' +
      '  const sieve = new Uint8Array(limit + 1);\n' +
      '  for (let i = 2; i <= limit; i++) {\n' +
      '    if (sieve[i]) continue;\n' +
      '    out.push(i);\n' +
      '    for (let j = i * i; j <= limit; j += i) sieve[j] = 1;\n' +
      '  }\n' +
      '  return out;\n' +
      '}',
  },
  {
    id: 'forge_power_mod',
    name: 'powerMod',
    domain: 'math',
    title: 'Modular exponentiation',
    prompt:
      'Implement `export function powerMod(base, exp, mod)`. Compute (base^exp) mod mod for non-negative integer exp and positive integer mod, using fast exponentiation (no Math.pow overflow tricks needed for small values). Examples: (2,10,1000)->24; (3,0,5)->1; (5,3,13)->8; (10,5,7)->5.',
    refSuite:
      'assert powerMod(2, 10, 1000) === 24;\n' +
      'assert powerMod(3, 0, 5) === 1;\n' +
      'assert powerMod(5, 3, 13) === 8;\n' +
      'assert powerMod(10, 5, 7) === 5;',
    // Exact oracle. The hidden suite's largest modulus is 1000, so a
    // double-precision implementation passes it while returning a silently
    // WRONG answer at 1e9+7 (factor*factor exceeds 2^53). That implementation
    // was promoted once already. With this reference the differential and the
    // large-magnitude scale probe both run, and the float version is rejected.
    reference:
      'export function powerMod(base, exp, mod) {\n' +
      '  const m = BigInt(mod);\n' +
      '  if (m <= 0n) throw new Error("mod must be positive");\n' +
      '  let result = 1n % m;\n' +
      '  let factor = ((BigInt(base) % m) + m) % m;\n' +
      '  let e = BigInt(exp);\n' +
      '  while (e > 0n) {\n' +
      '    if (e % 2n === 1n) result = (result * factor) % m;\n' +
      '    factor = (factor * factor) % m;\n' +
      '    e = e / 2n;\n' +
      '  }\n' +
      '  return Number(result);\n' +
      '}',
  },
  {
    id: 'forge_backoff',
    name: 'exponentialBackoffMs',
    domain: 'systemic',
    title: 'Capped exponential backoff',
    prompt:
      'Implement `export function exponentialBackoffMs(attempt, baseMs, capMs)`. attempt is a non-negative integer retry count (0 = first retry). Return min(capMs, baseMs * 2^attempt), deterministic with no jitter. Examples: (0,100,5000)->100; (3,100,5000)->800; (10,100,5000)->5000; (2,250,1000)->1000.',
    refSuite:
      'assert exponentialBackoffMs(0, 100, 5000) === 100;\n' +
      'assert exponentialBackoffMs(3, 100, 5000) === 800;\n' +
      'assert exponentialBackoffMs(10, 100, 5000) === 5000;\n' +
      'assert exponentialBackoffMs(2, 250, 1000) === 1000;',
  },
  {
    id: 'forge_private_ipv4',
    name: 'isPrivateIPv4',
    domain: 'cyber_defense',
    title: 'Private IPv4 detector',
    prompt:
      'Implement `export function isPrivateIPv4(ip)`. ip is a dotted-decimal IPv4 string. Return true iff it is in a private range: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, or loopback 127.0.0.0/8. Return false for malformed input. Examples: "10.1.2.3"->true; "172.31.255.1"->true; "172.32.0.1"->false; "192.168.0.5"->true; "8.8.8.8"->false; "127.0.0.1"->true; "not-an-ip"->false.',
    refSuite:
      'assert isPrivateIPv4("10.1.2.3") === true;\n' +
      'assert isPrivateIPv4("172.31.255.1") === true;\n' +
      'assert isPrivateIPv4("172.32.0.1") === false;\n' +
      'assert isPrivateIPv4("192.168.0.5") === true;\n' +
      'assert isPrivateIPv4("8.8.8.8") === false;\n' +
      'assert isPrivateIPv4("127.0.0.1") === true;\n' +
      'assert isPrivateIPv4("not-an-ip") === false;',
  },
  {
    id: 'forge_redact_secrets',
    name: 'redactSecrets',
    domain: 'cyber_defense',
    title: 'Secret-field redactor',
    prompt:
      'Implement `export function redactSecrets(value)`. Deep-clone JSON-like input (objects, arrays, primitives). Replace the VALUE of any object key matching /password|secret|token|apikey|api_key/i with the string "***". Preserve all other values and structure. Do not mutate the input. Example: ({user:"a", password:"x", nested:{apiKey:"k", n:1}}) -> ({user:"a", password:"***", nested:{apiKey:"***", n:1}}).',
    refSuite:
      'const r1 = redactSecrets({ user: "a", password: "x", nested: { apiKey: "k", n: 1 } });\n' +
      'assert r1.user === "a";\n' +
      'assert r1.password === "***";\n' +
      'assert r1.nested.apiKey === "***";\n' +
      'assert r1.nested.n === 1;\n' +
      'assert JSON.stringify(redactSecrets({ list: [{ token: "t" }, { ok: 1 }] })) === JSON.stringify({ list: [{ token: "***" }, { ok: 1 }] });\n' +
      'assert redactSecrets("plain") === "plain";',
  },
  {
    id: 'forge_forward_chain',
    name: 'forwardChain',
    domain: 'neuro_symbolic',
    title: 'Horn-clause forward chainer',
    prompt:
      'Implement `export function forwardChain(facts, rules)`. facts is an array of strings (ground truths). rules is an array of { premises: string[], head: string }. Repeatedly derive heads whose premises are all known until fixpoint. Return a SORTED array of all known facts (originals + derived, deduplicated). Example: facts ["a"], rules [{premises:["a"],head:"b"},{premises:["b"],head:"c"}] -> ["a","b","c"]. A rule with unmet premises fires never.',
    refSuite:
      'assert JSON.stringify(forwardChain(["a"], [{ premises: ["a"], head: "b" }, { premises: ["b"], head: "c" }])) === JSON.stringify(["a", "b", "c"]);\n' +
      'assert JSON.stringify(forwardChain(["a"], [{ premises: ["z"], head: "b" }])) === JSON.stringify(["a"]);\n' +
      'assert JSON.stringify(forwardChain([], [{ premises: [], head: "t" }])) === JSON.stringify(["t"]);\n' +
      'assert JSON.stringify(forwardChain(["b", "a"], [])) === JSON.stringify(["a", "b"]);',
  },
  {
    id: 'forge_tokenize_logic',
    name: 'tokenizeLogic',
    domain: 'neuro_symbolic',
    title: 'Propositional-logic tokenizer',
    prompt:
      'Implement `export function tokenizeLogic(expr)`. Tokenize a propositional-logic string into an array of token strings. Token kinds: identifiers [A-Za-z][A-Za-z0-9_]*, "!", "&", "|", "->", "(", ")". Skip whitespace. Throw (or return null) on any illegal character. Examples: "p & !q" -> ["p","&","!","q"]; "(a -> b) | c" -> ["(","a","->","b",")","|","c"].',
    refSuite:
      'assert JSON.stringify(tokenizeLogic("p & !q")) === JSON.stringify(["p", "&", "!", "q"]);\n' +
      'assert JSON.stringify(tokenizeLogic("(a -> b) | c")) === JSON.stringify(["(", "a", "->", "b", ")", "|", "c"]);\n' +
      'assert JSON.stringify(tokenizeLogic("x")) === JSON.stringify(["x"]);',
  },
  {
    id: 'forge_hadamard',
    name: 'applyHadamard',
    domain: 'quantum_sim',
    title: 'Single-qubit Hadamard gate',
    prompt:
      'Implement `export function applyHadamard(vector)`. vector is a length-2 real amplitude array [a, b]. Apply the Hadamard gate: return [(a+b)/sqrt(2), (a-b)/sqrt(2)]. Examples: [1,0] -> [0.7071..., 0.7071...]; [0,1] -> [0.7071..., -0.7071...]. Use Math.SQRT1_2 (1/sqrt(2)).',
    refSuite:
      'const h0 = applyHadamard([1, 0]);\n' +
      'assert Math.abs(h0[0] - Math.SQRT1_2) < 1e-9;\n' +
      'assert Math.abs(h0[1] - Math.SQRT1_2) < 1e-9;\n' +
      'const h1 = applyHadamard([0, 1]);\n' +
      'assert Math.abs(h1[0] - Math.SQRT1_2) < 1e-9;\n' +
      'assert Math.abs(h1[1] + Math.SQRT1_2) < 1e-9;',
  },
  {
    id: 'forge_measure_probs',
    name: 'measureProbs',
    domain: 'quantum_sim',
    title: 'Qubit measurement probabilities',
    prompt:
      'Implement `export function measureProbs(vector)`. vector is a length-2 real amplitude array [a, b]. Return normalized measurement probabilities [a^2/n, b^2/n] where n = a^2+b^2. If n is 0 return [0.5, 0.5]. Examples: [1,0]->[1,0]; [1,1]->[0.5,0.5]; [0,0]->[0.5,0.5].',
    refSuite:
      'assert JSON.stringify(measureProbs([1, 0])) === "[1,0]";\n' +
      'assert JSON.stringify(measureProbs([1, 1])) === "[0.5,0.5]";\n' +
      'assert JSON.stringify(measureProbs([0, 0])) === "[0.5,0.5]";',
  },
  {
    id: 'forge_lru_cache',
    name: 'LRUCache',
    domain: 'systemic',
    title: 'LRU cache (bounded)',
    kind: 'class',
    prompt:
      'Implement `export class LRUCache` with constructor `new LRUCache(capacity)` where capacity is a positive integer. Methods: `set(key, value)` stores key->value (overwriting an existing key refreshes it as most-recently-used); `get(key)` returns the stored value, or -1 if the key is not present. When the cache exceeds capacity after a set, evict the least-recently-used key. Example: capacity 2: set(1,"a"); get(1)->"a"; set(2,"b"); set(3,"c") evicts 1; get(1)->-1; get(2)->"b"; get(3)->"c". Keys/values are integers/strings.',
    refSuite:
      'const c = new LRUCache(2);\n' +
      'c.set(1, "a");\n' +
      'assert c.get(1) === "a";\n' +
      'c.set(2, "b");\n' +
      'c.set(3, "c");\n' +
      'assert c.get(1) === -1;\n' +
      'assert c.get(2) === "b";\n' +
      'assert c.get(3) === "c";',
  },
];

export function forgeSpecById(id: string): ForgeSpec | undefined {
  return FORGE_AGENDA.find((s) => s.id === id);
}

// ---------------------------------------------------------------------------
// Forge model client (independent of the global provider)
// ---------------------------------------------------------------------------
// FORGE_MODEL_BASE_URL / FORGE_MODEL_NAME / FORGE_MODEL_API_KEY /
// FORGE_MODEL_TIMEOUT_MS override the global provider so the forge can pin a
// different model. Fallback chain: FORGE_* -> API_MODEL_* (Phoenix Grove) ->
// MODEL_* -> the API default. When FORGE_MODEL_BASE_URL points at a loopback
// endpoint it uses the local profile (the MiniCPM5 model via llama-server),
// reporting offline honestly unless LOCAL_MODEL_BASE_URL is configured.
//
// The chain deliberately does NOT consult LOCAL_MODEL_*: the forge pins its own
// endpoint, and falling through to the API profile is what produced 58
// consecutive `HTTP 401: plan tier does not include API access` ledger entries
// while a working llama-server sat unused on :11434. To use the local model,
// set FORGE_MODEL_BASE_URL to its /v1 URL explicitly.
export function forgeConfig() {
  const base = (
    process.env.FORGE_MODEL_BASE_URL ||
    process.env.API_MODEL_BASE_URL ||
    process.env.MODEL_BASE_URL ||
    'https://api.pgsgrove.com/v1'
  ).replace(/\/+$/, '');
  return {
    baseUrl: base,
    model:
      process.env.FORGE_MODEL_NAME ||
      process.env.API_MODEL_NAME ||
      process.env.MODEL_NAME ||
      'deepseek-v4-flash-0731',
    apiKey:
      process.env.FORGE_MODEL_API_KEY ||
      process.env.API_MODEL_API_KEY ||
      process.env.MODEL_API_KEY ||
      '',
    timeoutMs: Number(process.env.FORGE_MODEL_TIMEOUT_MS || process.env.MODEL_TIMEOUT_MS || 240_000),
  };
}

/**
 * Is the forge's pinned endpoint REACHABLE?
 *
 * This is a cheap `GET /models` reachability check, deliberately NOT a
 * generation probe. It runs at the top of every forge attempt, so a probe that
 * spends a real completion here would (a) double the model's calls on the hot
 * path and (b) — as the forge-quality tests caught — consume a stubbed reply
 * before the real candidate is generated.
 *
 * Reachable-but-unusable (a gateway that answers /models but rejects the key on
 * chat) is a real state and it used to be invisible. It is now reported, just
 * not from here: a generation that fails carries the server's own message into
 * the ledger ("HTTP 401: plan tier does not include API access"), and the
 * operator readout runs the deep usability probe explicitly. Both paths report
 * the truth; neither pays for it on every attempt.
 */
async function forgeOnline(_force = false): Promise<boolean> {
  const cfg = forgeConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`${cfg.baseUrl}/models`, { method: 'GET', signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** One chat completion via the SHARED provider layer (modelProvider.ts).
 *  The forge's FORGE_MODEL_* overrides configure the shared provider's profile
 *  (same env vars the rest of the app uses: API_MODEL_* / LOCAL_MODEL_*), so
 *  routing, health checks, retry/timeout semantics and usage accounting are
 *  unified instead of a second bespoke HTTP client. Honest: reports
 *  offline/error, never fabricates content. */
async function forgeChat(
  system: string,
  user: string,
  temperature = 0.1,
  // Forge generation completions are NOT cached: retries feed prior failures
  // back into the prompt, and a cached raw completion could be a known-bad
  // candidate. The forge's efficiency comes from verified sleep-time artifacts.
  useCache = false,
): Promise<{
  ok: boolean;
  content: string | null;
  offline?: boolean;
  error?: string;
  /**
   * Set when a pinned FORGE_MODEL_BASE_URL was unusable and the shared
   * generation policy answered instead. Recorded in the ledger so a tool built
   * by a different model than the pin intended is never invisible.
   */
  fellBackFrom?: string;
}> {
  const cfg = forgeConfig();
  // Explicit FORGE_MODEL_BASE_URL wins (profile matched by base URL). Otherwise
  // the forge joins the shared generation policy: local-first (MiniCPM5) with an
  // automatic API fallback.
  const explicitForge = Boolean(process.env.FORGE_MODEL_BASE_URL)
    && cfg.baseUrl === (process.env.FORGE_MODEL_BASE_URL || '').replace(/\/+$/, '');
  const forgeTargetsLocal = /:\/\/(127\.0\.0\.1|localhost|\[::1\]|0\.0\.0\.0|host\.docker\.internal)(:|\/)/i.test(cfg.baseUrl);
  const { chatCompleteProfile } = await import('./modelProvider.js');
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
  const chatOpts = { temperature, ...(useCache ? {} : { cache: false as const }) };
  const res = explicitForge
    ? await chatCompleteProfile(forgeTargetsLocal ? 'local' : 'api', messages, chatOpts)
    : await skillAwareChat(messages, chatOpts, user);
  if (!res.ok || res.content === null) {
    // A pinned forge endpoint that is quota-blocked or down must not stall the
    // whole loop. Falling back is recorded, never silent: `fellBackFrom` names
    // the endpoint that was skipped and why, and the caller writes it into the
    // ledger so a run built by a different model than intended is visible.
    const recoverable =
      res.status === 'offline' ||
      /402|429|insufficient|quota|credit|rate.?limit|too many requests/i.test(res.error ?? '');
    if (explicitForge && recoverable) {
      const fallback = await skillAwareChat(messages, { ...chatOpts, cache: false as const }, user);
      if (fallback.ok && fallback.content !== null) {
        return {
          ok: true,
          content: fallback.content,
          fellBackFrom: `${cfg.baseUrl} (${res.error ?? res.status})`,
        };
      }
      return {
        ok: false,
        content: null,
        offline: fallback.status === 'offline',
        error: `pinned endpoint ${cfg.baseUrl} unusable (${res.error ?? res.status}); fallback also failed: ${fallback.error ?? fallback.status}`,
      };
    }
    return {
      ok: false,
      content: null,
      offline: res.status === 'offline',
      error: res.error || 'model returned empty content',
    };
  }
  return { ok: true, content: res.content };
}

function stripFences(content: string): string {
  return content.replace(/```(?:js|javascript)?/gi, '').replace(/```/g, '').trim();
}

/** Optional generator overrides. The Builder Brain supplies the system prompt +
 *  temperature; the recursive learner's durable memory supplies
 *  `inspirationHint` (recalled prior solutions) so cross-run knowledge transfers
 *  into new tool generation. */
export interface ForgeBuilderOptions {
  systemPrompt?: string;
  temperature?: number;
  /** Extra context appended to the user prompt (e.g. recalled prior solutions). */
  inspirationHint?: string;
  /** Compute-optimal candidate budget for this spec. When set it overrides the
   *  fixed `maxTries`; callers derive it with `forgeSampleBudget`. Defaults to
   *  `maxTries` (unchanged behavior). */
  samples?: number;
  /** P1 sleep-time-compute artifact for this spec (pre-generated + verified
   *  offline). When present and still passing the reference suite, it is used
   *  with zero model calls. */
  precomputedSource?: string;
  /** Prior attempt's real sandbox failure, fed back into the next prompt
   *  (Reflexion-style) so retries are not identical re-rolls. */
  feedback?: string;
}

/**
 * Compute-optimal sample budget for one spec (P0.1). Easy / well-understood
 * capabilities get the minimum (1); only hard, uncertain ones earn extra
 * samples. Pure — see `adaptiveCompute.ts` (arXiv:2408.03314, arXiv:2510.07841).
 */
export function forgeSampleBudget(
  input: { uncertainty?: number; meanReward?: number; promptChars?: number; difficulty?: number },
  opts: { min?: number; max?: number } = {},
): number {
  return adaptiveBudget(difficultyIndex(input), { min: opts.min ?? 1, max: opts.max ?? 3 });
}

/** Non-negotiable quality rules appended to every function-generation prompt
 *  (including Builder Brain profiles, which only tune style/strategy). Each rule
 *  maps to a check in forgeQuality.ts, so the model is told what is measured. */
export const FORGE_QUALITY_RULES =
  `Quality rules (enforced by automated checks):\n` +
  `- Pure and deterministic: no Math.random, Date, performance.now, I/O, globals, console output.\n` +
  `- Never mutate the arguments; copy arrays/objects before sorting, reversing or splicing.\n` +
  `- Do not special-case the example inputs: the hidden suite and differential tests use other inputs.\n` +
  `- Handle boundary inputs the contract allows (empty, single element, zero, duplicates, large sizes) with the same logic, not with lookups.\n` +
  `- No require/import/eval/Function/globalThis/process/constructor access (rejected by the sandbox).`;

/** Default code-writing prompt: documented, production-grade micro-function. */
export function defaultForgeSystemPrompt(name: string): string {
  return (
    `You are a senior JavaScript engineer writing ONE production-quality, dependency-free function.\n` +
    `Output rules:\n` +
    `- Return ONLY JavaScript source. No Markdown fences and no prose outside code comments.\n` +
    `- No TypeScript types, no classes unless asked.\n` +
    `- Define and export exactly one function: \`export function ${name}(...)\`. Helpers must be non-exported.\n` +
    `- Put a JSDoc block directly above it: a one-sentence summary, @param {type} name - meaning for EVERY parameter, @returns {type} - meaning, and the time complexity.\n` +
    `- The implementation is judged by a hidden test suite plus differential tests against a reference on unseen inputs. Match the contract exactly, including edge cases.\n` +
    FORGE_QUALITY_RULES
  );
}

/**
 * Ask the model for ONE implementation of a spec. Returns plain JS source that
 * exports the spec's function. Never returns placeholder text.
 */
export async function generateForgeSource(spec: ForgeSpec, builder?: ForgeBuilderOptions): Promise<{
  ok: boolean;
  source?: string;
  offline?: boolean;
  error?: string;
  /** Set when the pinned forge endpoint was skipped in favour of the shared
   *  generation policy (quota-blocked or down). Recorded in the ledger. */
  fellBackFrom?: string;
}> {
  const online = await forgeOnline();
  if (!online) {
    return { ok: false, offline: true, error: `forge model endpoint unreachable (${forgeConfig().baseUrl})` };
  }

  // A loopback FORGE_MODEL_BASE_URL routes to the LOCAL llama.cpp profile. If
  // the local profile has no endpoint configured, generation cannot succeed
  // there — report offline rather than issuing a doomed call. (Distinct from
  // an endpoint that is merely down: this is a configuration that cannot work.)
  const forgeTargetsLocal = /:\/\/(127\.0\.0\.1|localhost|\[::1\]|0\.0\.0\.0|host\.docker\.internal)(:|\/)/i.test(
    forgeConfig().baseUrl,
  );
  if (forgeTargetsLocal && !(process.env.LOCAL_MODEL_BASE_URL || '').trim()) {
    return {
      ok: false,
      offline: true,
      error: `forge targets the local llama.cpp profile (${forgeConfig().baseUrl}) but LOCAL_MODEL_BASE_URL is not configured`,
    };
  }
  const isClass = spec.kind === 'class';
  // The Builder Brain can override the code-writing instructions + temperature so
  // the generator's own strategy is what meta-experiments tune (improve the
  // improver). Falls back to the current default system prompt when unset.
  // Class specs always use the class prompt (the function-oriented builder
  // prompts forbid classes, which would defeat a class spec).
  const system = isClass
    ? `You write plain JavaScript classes. Rules:\n` +
      `- Return ONLY the source code. No Markdown fences, no commentary, no prose.\n` +
      `- No imports, no require, no TypeScript types.\n` +
      `- Define and export exactly one class named ${spec.name} with the constructor signature and methods the contract requires.\n` +
      `- The implementation will be tested against a hidden test suite that asserts the exact behavior described. Match it precisely.\n` +
      `- Handle edge cases (empty inputs, capacity bounds) explicitly.`
    : builder?.systemPrompt?.trim()
      ? `${builder.systemPrompt}\n${FORGE_QUALITY_RULES}`
      : defaultForgeSystemPrompt(spec.name);
  const temperature = typeof builder?.temperature === 'number' ? builder.temperature : 0.1;
  const hint = builder?.inspirationHint?.trim();
  const feedback = builder?.feedback?.trim();
  // Placed after the contract and before the inspiration hint: the model reads
  // what to build, then what the literature says is a known way to build it, then
  // what this system already tried. Research in front of the recalled solutions
  // keeps a prior internal attempt from anchoring the model when the two
  // disagree.
  const grounding = spec.grounding ? `\n\n${groundingSection(spec.grounding)}` : '';
  const user =
    `Write ${isClass ? 'a class' : ''} ${spec.name}.\n\nContract:\n${spec.prompt}` +
    grounding +
    `${hint ? `\n\n${hint}` : ''}` +
    `${feedback ? `\n\nYour previous attempt was rejected. Fix it using this real verification output:\n${feedback}` : ''}` +
    `\n\nBefore writing, silently list the edge cases the contract implies and make sure each is handled. Return only the source.`;
  const res = await forgeChat(system, user, temperature);
  if (!res.ok) {
    return { ok: false, offline: res.offline, error: res.error };
  }
  const source = stripFences(res.content || '');
  if (source.length < 10) {
    return { ok: false, error: 'model returned unusable (near-empty) source' };
  }
  return { ok: true, source, fellBackFrom: res.fellBackFrom };
}

/** Real verification of a source against a reference suite (sandbox). */
export function verifyForgeSource(source: string, refSuite: string) {
  return executeTestSuite(source, refSuite);
}

/**
 * Retry feedback that never reveals HOLDOUT assertions. Visible failures are
 * shown verbatim; hidden failures are reported only as a count, so the model
 * cannot converge by patching the exact asserts it was told about.
 */
function holdoutAwareFeedback(source: string, split: { visible: string; holdout: string }, fullVerify: { passed: boolean; testDetails: string[]; stderr: string[] }): string {
  if (!split.holdout) return feedbackFromVerify(fullVerify);
  const visible = verifyForgeSource(source, split.visible);
  const hidden = verifyForgeSource(source, split.holdout);
  const hiddenFails = hidden.testDetails.filter((d) => d.startsWith('[FAIL') || d.startsWith('[COMPILATION')).length;
  const parts: string[] = [];
  if (!visible.passed) parts.push(feedbackFromVerify(visible));
  if (hiddenFails > 0) {
    parts.push(
      `${hiddenFails} hidden assertion(s) also failed. They test the same contract on other inputs — ` +
      're-read the contract for cases your code does not handle yet.',
    );
  }
  return parts.join('\n') || feedbackFromVerify(fullVerify);
}

function feedbackFromVerify(verify: { passed: boolean; testDetails: string[]; stderr: string[] }): string {
  const fails = verify.testDetails
    .filter((d) => d.startsWith('[FAIL') || d.startsWith('[COMPILATION'))
    .slice(0, 5)
    .join('\n');
  const errs = verify.stderr.slice(0, 4).join('\n');
  return [fails, errs].filter(Boolean).join('\n') || '(no failure detail)';
}

/** Candidate that passed the full reference suite, with its quality report. */
interface PassingCandidate {
  source: string;
  verify: { score: number; testDetails: string[] };
  quality: ForgeQualityReport;
  via: 'model' | 'sleep' | 'axiom';
}

function assessCandidate(spec: ForgeSpec, source: string): ForgeQualityReport {
  return assessForgeCandidate(
    { name: spec.name, refSuite: spec.refSuite, reference: spec.reference, vectors: spec.vectors, kind: spec.kind },
    source,
  );
}

function successOutcome(
  spec: ForgeSpec,
  best: PassingCandidate,
  attemptsUsed: number,
  maxTries: number,
  failures: ForgeFailure[],
  candidatesPassed: number,
): ForgeAttemptOutcome {
  const note =
    best.via === 'sleep' ? '[PASS] consumed sleep-time-compute artifact (re-verified)'
      : best.via === 'axiom' ? '[PASS] Verified via Axiom bridge + Recourse sandbox'
        : null;
  return {
    ok: true,
    id: spec.id,
    name: spec.name,
    domain: spec.domain,
    source: best.source,
    attemptsUsed,
    maxTries,
    failures,
    verifyScore: Math.round(best.verify.score * 100) / 100,
    verifyDetails: note ? [note, ...best.verify.testDetails] : best.verify.testDetails,
    quality: best.quality,
    doc: extractToolDoc(best.source, spec.name),
    candidatesPassed,
    ...(spec.grounding ? { grounding: spec.grounding } : {}),
  };
}

/**
 * One full forge attempt: generate implementations, verify each against the
 * spec's reference suite, score every passing one with the quality gate
 * (differential testing vs a reference when available, determinism, input
 * mutation, overfitting, docs), and promote the BEST gate-passing candidate.
 *
 * Sampling stops early once a candidate is substantively clean; otherwise the
 * next prompt carries the real failure (reference-suite failures with holdout
 * assertions hidden, or quality-gate findings). Only ever reports ok:true when
 * the full reference suite passed AND the quality gate passed.
 */
export async function attemptForgeSpec(
  spec: ForgeSpec,
  maxTries = 3,
  builder?: ForgeBuilderOptions,
): Promise<ForgeAttemptOutcome> {
  const failures: ForgeFailure[] = [];
  let attemptsUsed = 0;
  let best: PassingCandidate | null = null;
  let candidatesPassed = 0;
  const split = splitSuiteForHoldout(spec.refSuite);

  const consider = (source: string, via: PassingCandidate['via']): { passed: boolean; feedback?: string } => {
    const verify = verifyForgeSource(source, spec.refSuite);
    if (!verify.passed) return { passed: false, feedback: holdoutAwareFeedback(source, split, verify) };
    candidatesPassed++;
    const quality = assessCandidate(spec, source);
    const cand: PassingCandidate = { source, verify, quality, via };
    if (betterQuality(quality, best?.quality)) best = cand;
    return { passed: true, feedback: quality.gate.ok && isSubstantivelyClean(quality) ? undefined : qualityFeedback(quality) };
  };
  const bestIsClean = () => Boolean(best && best.quality.gate.ok && isSubstantivelyClean(best.quality));

  // P1 sleep-time compute: consume a pre-generated offline artifact when it
  // still passes the reference suite AND the quality gate. A cache, not trust.
  if (builder?.precomputedSource) {
    consider(builder.precomputedSource, 'sleep');
    if (bestIsClean()) return successOutcome(spec, best!, 0, 0, failures, candidatesPassed);
  }

  // Compute-optimal budget: `builder.samples` when the caller supplied one
  // (adaptive), else the fixed `maxTries` (unchanged default behavior).
  const budget = Math.max(1, Math.floor(builder?.samples ?? maxTries));
  // One extra "quality repair" sample (FORGE_QUALITY_RETRIES) when the budget is
  // spent on a candidate that passed the reference suite but not the quality
  // gate: the concrete gate findings make that retry cheap and targeted.
  const qualityRetries = Math.max(0, Math.min(3, Math.floor(Number(process.env.FORGE_QUALITY_RETRIES ?? 1)) || 0));
  let extraUsed = 0;
  let lastFailure: string | undefined;
  for (let attempt = 1; ; attempt++) {
    if (attempt > budget) {
      const needsRepair = best !== null && !(best as PassingCandidate).quality.gate.ok;
      if (!needsRepair || extraUsed >= qualityRetries) break;
      extraUsed++;
    }
    attemptsUsed = attempt;
    // Feed the previous real failure into the next prompt so retries are not
    // identical re-rolls (and remain cache-distinct when caching is on).
    const attemptBuilder = lastFailure ? { ...builder, feedback: lastFailure } : builder;
    const gen = await generateForgeSource(spec, attemptBuilder);
    // A build answered by the fallback rather than the pinned endpoint is
    // recorded in the ledger, so "which model actually wrote this" is always
    // answerable from the ledger instead of guessed at.
    if (gen.ok && gen.fellBackFrom) {
      failures.push({ attempt, note: `model fallback: ${gen.fellBackFrom}` });
    }
    if (!gen.ok) {
      lastFailure = gen.error || 'generate returned no source';
      failures.push({ attempt, note: gen.offline ? `offline: ${gen.error}` : `generate error: ${gen.error}` });
      if (gen.offline) {
        // Fallback: Axiom's autonomous builder. Its source goes through exactly
        // the same reference-suite + quality gates as a model candidate (and is
        // NOT self-hosted by the bridge — materialization stays with the caller).
        if (await axiomReachable()) {
          const axiomRes = await integrateAxiomTool(spec.name, spec.domain, spec.prompt, spec.refSuite, { selfHost: false });
          if (axiomRes.ok && axiomRes.sourceCode) {
            const r = consider(axiomRes.sourceCode, 'axiom');
            if (!r.passed) failures.push({ attempt, note: `Axiom source failed the reference suite: ${r.feedback}` });
          } else {
            failures.push({ attempt, note: `Axiom bridge failed: ${axiomRes.error}` });
          }
        }
        if (best && (best as PassingCandidate).quality.gate.ok) {
          return successOutcome(spec, best, attempt, budget, failures, candidatesPassed);
        }
        return {
          ok: false,
          id: spec.id,
          name: spec.name,
          domain: spec.domain,
          reason: best ? 'quality' : 'offline',
          attemptsUsed,
          maxTries: budget,
          failures,
          ...(best ? { quality: (best as PassingCandidate).quality, candidatesPassed } : {}),
        };
      }
      continue; // transient error -> retry
    }
    const r = consider(gen.source as string, 'model');
    if (bestIsClean()) break;
    lastFailure = r.feedback;
    failures.push({ attempt, note: r.passed ? `passed reference suite; quality: ${r.feedback}` : (r.feedback ?? 'failed') });
  }

  if (best && (best as PassingCandidate).quality.gate.ok) {
    return successOutcome(spec, best, attemptsUsed, budget, failures, candidatesPassed);
  }
  return {
    ok: false,
    id: spec.id,
    name: spec.name,
    domain: spec.domain,
    reason: best ? 'quality' : 'failed',
    attemptsUsed,
    maxTries: budget,
    failures,
    ...(best ? { quality: (best as PassingCandidate).quality, candidatesPassed } : {}),
  };
}
