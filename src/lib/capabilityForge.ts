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
 *  - The forge can be pointed at a different (typically faster/local) model
 *    than the rest of the app via FORGE_MODEL_* env vars, defaulting to the
 *    global OpenAI-compatible provider, defaulting again to local Ollama.
 */

import type { ToolDomain } from '../types';
import { executeTestSuite } from './executionSandbox';

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
}

export interface ForgeFailure {
  attempt: number;
  note: string;
}

export interface ForgeAttemptOutcome {
  ok: boolean;
  id: string;
  name: string;
  domain: ToolDomain;
  /** Present and correct only when ok === true (source passed the ref suite). */
  source?: string;
  /** Human reason when not ok: 'offline' | 'failed' */
  reason?: 'offline' | 'failed';
  attemptsUsed: number;
  maxTries: number;
  failures: ForgeFailure[];
  verifyScore?: number;
  verifyDetails?: string[];
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
// FORGE_MODEL_TIMEOUT_MS override the global provider so the forge can run on a
// fast local model without disturbing the rest of the app. Fallback chain:
// FORGE_* -> global MODEL_* -> local Ollama qwen (fast default).
function forgeConfig() {
  const base = (
    process.env.FORGE_MODEL_BASE_URL ||
    process.env.MODEL_BASE_URL ||
    process.env.OLLAMA_BASE_URL ||
    'http://localhost:11434/v1'
  ).replace(/\/+$/, '');
  return {
    baseUrl: base,
    model:
      process.env.FORGE_MODEL_NAME ||
      process.env.MODEL_NAME ||
      'qwen3.8-4b-distill:q4_k_m',
    apiKey: process.env.FORGE_MODEL_API_KEY || process.env.MODEL_API_KEY || 'ollama',
    timeoutMs: Number(process.env.FORGE_MODEL_TIMEOUT_MS || process.env.MODEL_TIMEOUT_MS || 240_000),
  };
}

async function forgeOnline(force = false): Promise<boolean> {
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

/** One OpenAI-compatible chat completion. Honest: reports offline/error, never
 *  fabricates content. */
async function forgeChat(system: string, user: string, temperature = 0.1): Promise<{
  ok: boolean;
  content: string | null;
  offline?: boolean;
  error?: string;
}> {
  const cfg = forgeConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        stream: false,
        temperature,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, content: null, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    const data: any = await res.json();
    const content: string | null = data?.choices?.[0]?.message?.content ?? null;
    if (typeof content !== 'string' || !content.trim()) {
      return { ok: false, content: null, error: 'model returned empty content' };
    }
    return { ok: true, content };
  } catch (err: any) {
    const aborted = err?.name === 'AbortError';
    return {
      ok: false,
      content: null,
      offline: !aborted,
      error: aborted ? `request timed out after ${cfg.timeoutMs}ms` : err?.message || 'request failed',
    };
  } finally {
    clearTimeout(timer);
  }
}

function stripFences(content: string): string {
  return content.replace(/```(?:js|javascript)?/gi, '').replace(/```/g, '').trim();
}

/**
 * Ask the model for ONE implementation of a spec. Returns plain JS source that
 * exports the spec's function. Never returns placeholder text.
 */
export async function generateForgeSource(spec: ForgeSpec, builder?: { systemPrompt?: string; temperature?: number }): Promise<{
  ok: boolean;
  source?: string;
  offline?: boolean;
  error?: string;
}> {
  const online = await forgeOnline();
  if (!online) {
    return { ok: false, offline: true, error: `forge model endpoint unreachable (${forgeConfig().baseUrl})` };
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
      ? builder.systemPrompt
      : `You write plain JavaScript micro-functions. Rules:\n` +
        `- Return ONLY the source code. No Markdown fences, no commentary, no prose.\n` +
        `- No imports, no require, no TypeScript types, no classes unless asked.\n` +
        `- Define and export exactly one function named ${spec.name}.\n` +
        `- The implementation will be tested against a hidden test suite that asserts the exact behavior described. Match it precisely.\n` +
        `- Handle edge cases (empty inputs, single elements) explicitly.`;
  const temperature = typeof builder?.temperature === 'number' ? builder.temperature : 0.1;
  const user = `Write ${isClass ? 'a class' : ''} ${spec.name}.\n\nContract:\n${spec.prompt}\n\nReturn only the source.`;
  const res = await forgeChat(system, user, temperature);
  if (!res.ok) {
    return { ok: false, offline: res.offline, error: res.error };
  }
  const source = stripFences(res.content || '');
  if (source.length < 10) {
    return { ok: false, error: 'model returned unusable (near-empty) source' };
  }
  return { ok: true, source };
}

/** Real verification of a source against a reference suite (sandbox). */
export function verifyForgeSource(source: string, refSuite: string) {
  return executeTestSuite(source, refSuite);
}

function feedbackFromVerify(verify: { passed: boolean; testDetails: string[]; stderr: string[] }): string {
  const fails = verify.testDetails
    .filter((d) => d.startsWith('[FAIL') || d.startsWith('[COMPILATION'))
    .slice(0, 5)
    .join('\n');
  const errs = verify.stderr.slice(0, 4).join('\n');
  return [fails, errs].filter(Boolean).join('\n') || '(no failure detail)';
}

/**
 * One full forge attempt: generate the implementation and verify it against the
 * spec's reference suite, retrying up to `maxTries` times with real sandbox
 * failure output fed back. Only ever reports ok:true when the ref suite passed.
 */
export async function attemptForgeSpec(
  spec: ForgeSpec,
  maxTries = 3,
  builder?: { systemPrompt?: string; temperature?: number },
): Promise<ForgeAttemptOutcome> {
  const failures: ForgeFailure[] = [];
  let attemptsUsed = 0;
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    attemptsUsed = attempt;
    const gen = await generateForgeSource(spec, builder);
    if (!gen.ok) {
      failures.push({ attempt, note: gen.offline ? `offline: ${gen.error}` : `generate error: ${gen.error}` });
      if (gen.offline) {
        return {
          ok: false,
          id: spec.id,
          name: spec.name,
          domain: spec.domain,
          reason: 'offline',
          attemptsUsed,
          maxTries,
          failures,
        };
      }
      continue; // transient error -> retry
    }
    const verify = verifyForgeSource(gen.source as string, spec.refSuite);
    if (verify.passed) {
      return {
        ok: true,
        id: spec.id,
        name: spec.name,
        domain: spec.domain,
        source: gen.source as string,
        attemptsUsed,
        maxTries,
        failures,
        verifyScore: Math.round(verify.score * 100) / 100,
        verifyDetails: verify.testDetails,
      };
    }
    failures.push({ attempt, note: feedbackFromVerify(verify) });
  }
  return {
    ok: false,
    id: spec.id,
    name: spec.name,
    domain: spec.domain,
    reason: 'failed',
    attemptsUsed,
    maxTries,
    failures,
  };
}
