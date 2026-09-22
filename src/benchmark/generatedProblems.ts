/**
 * Generated benchmark tier — deterministic, seeded, unbounded headroom.
 *
 * The baseline 15 are all solved by the same genes; a yardstick pinned at 100%
 * cannot detect improvement. This tier adds concrete problems for function
 * names the registry does not implement yet, so the score can be < 100% and can
 * rise only when the system actually produces working code for a new spec.
 *
 * Determinism: a fixed seed means the same problem set every run, so runs stay
 * comparable and `deltaSolved` is meaningful. Expected values are computed by
 * reference implementations here — never hand-written guesses — and the suite
 * only asserts equality against those values.
 */
import type { BenchmarkProblem } from '../intake/types';
import type { ToolDomain } from '../types';

/** Deterministic PRNG (mulberry32) — reproducible from the seed alone. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ri = (rng: () => number, lo: number, hi: number): number => lo + Math.floor(rng() * (hi - lo + 1));

// --- reference implementations (the ground truth for expected values) ---
const refGcd = (a: number, b: number): number => { while (b) { [a, b] = [b, a % b]; } return a; };
const refLcm = (a: number, b: number): number => (a / refGcd(a, b)) * b;
const refReverseWords = (s: string): string => s.trim().split(/\s+/).reverse().join(' ');
const refCountVowels = (s: string): number => (s.match(/[aeiou]/gi) || []).length;
const refSumDigits = (n: number): number => String(Math.abs(n)).split('').reduce((a, c) => a + Number(c), 0);
const refIsPalindrome = (s: string): boolean => { const t = s.toLowerCase().replace(/[^a-z0-9]/g, ''); return t === [...t].reverse().join(''); };
const refDedupe = (a: number[]): number[] => [...new Set(a)];
const refClamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const refFactorialMod = (n: number, m: number): number => { let r = 1; for (let i = 2; i <= n; i++) r = (r * i) % m; return r; };
const refFib = (n: number): number => { let a = 0, b = 1; for (let i = 0; i < n; i++) { [a, b] = [b, a + b]; } return a; };

const WORDS = ['alpha', 'beta', 'gamma', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet'];

interface Template {
  key: string;
  domain: ToolDomain;
  functionName: string;
  description: string;
  /** Produce one concrete problem instance from the rng. */
  make: (rng: () => number) => { title: string; suite: string };
}

const TEMPLATES: Template[] = [
  {
    key: 'gcd', domain: 'math', functionName: 'gcdFast',
    description: 'Return the greatest common divisor of two non-negative integers.',
    make: (rng) => { const a = ri(rng, 2, 5000), b = ri(rng, 2, 5000); return { title: `gcd(${a}, ${b})`, suite: `assert gcdFast(${a}, ${b}) === ${refGcd(a, b)};` }; },
  },
  {
    key: 'lcm', domain: 'math', functionName: 'lcmFast',
    description: 'Return the least common multiple of two positive integers.',
    make: (rng) => { const a = ri(rng, 2, 60), b = ri(rng, 2, 60); return { title: `lcm(${a}, ${b})`, suite: `assert lcmFast(${a}, ${b}) === ${refLcm(a, b)};` }; },
  },
  {
    key: 'reverse', domain: 'coding', functionName: 'reverseWords',
    description: 'Reverse word order in a whitespace-separated string, collapsing runs of whitespace.',
    make: (rng) => { const n = ri(rng, 2, 5); const s = Array.from({ length: n }, () => WORDS[ri(rng, 0, WORDS.length - 1)]).join(' '); return { title: `reverseWords(${n} words)`, suite: `assert reverseWords(${JSON.stringify(s)}) === ${JSON.stringify(refReverseWords(s))};` }; },
  },
  {
    key: 'vowels', domain: 'coding', functionName: 'countVowels',
    description: 'Count the vowels (a e i o u, case-insensitive) in a string.',
    make: (rng) => { const s = Array.from({ length: ri(rng, 3, 10) }, () => WORDS[ri(rng, 0, WORDS.length - 1)]).join(''); return { title: `countVowels(${s.length} chars)`, suite: `assert countVowels(${JSON.stringify(s)}) === ${refCountVowels(s)};` }; },
  },
  {
    key: 'digits', domain: 'math', functionName: 'sumDigits',
    description: 'Return the sum of the decimal digits of the absolute value of an integer.',
    make: (rng) => { const n = ri(rng, 0, 999999); return { title: `sumDigits(${n})`, suite: `assert sumDigits(${n}) === ${refSumDigits(n)};` }; },
  },
  {
    key: 'palindrome', domain: 'coding', functionName: 'isPalindrome',
    description: 'Return true iff the string is a palindrome ignoring case and non-alphanumerics.',
    make: (rng) => { const w = WORDS[ri(rng, 0, WORDS.length - 1)]; const s = rng() < 0.5 ? w + [...w].reverse().join('') : w + 'x'; return { title: `isPalindrome(${JSON.stringify(s)})`, suite: `assert isPalindrome(${JSON.stringify(s)}) === ${refIsPalindrome(s)};` }; },
  },
  {
    key: 'dedupe', domain: 'coding', functionName: 'dedupePreserveOrder',
    description: 'Remove duplicates from an array preserving first-seen order.',
    make: (rng) => { const a = Array.from({ length: ri(rng, 4, 9) }, () => ri(rng, 0, 5)); return { title: `dedupe(${a.length})`, suite: `assert JSON.stringify(dedupePreserveOrder(${JSON.stringify(a)})) === ${JSON.stringify(JSON.stringify(refDedupe(a)))};` }; },
  },
  {
    key: 'clamp', domain: 'systemic', functionName: 'clampRange',
    description: 'Clamp a value into [lo, hi] inclusive.',
    make: (rng) => { const x = ri(rng, -50, 150), lo = ri(rng, 0, 20), hi = lo + ri(rng, 1, 50); return { title: `clamp(${x}, ${lo}, ${hi})`, suite: `assert clampRange(${x}, ${lo}, ${hi}) === ${refClamp(x, lo, hi)};` }; },
  },
  {
    key: 'factmod', domain: 'math', functionName: 'factorialMod',
    description: 'Return n! modulo m (n >= 0, m >= 1).',
    make: (rng) => { const n = ri(rng, 3, 12), m = ri(rng, 7, 1000); return { title: `factorialMod(${n}, ${m})`, suite: `assert factorialMod(${n}, ${m}) === ${refFactorialMod(n, m)};` }; },
  },
  {
    key: 'fib', domain: 'math', functionName: 'nthFibonacci',
    description: 'Return the nth Fibonacci number with F(0)=0, F(1)=1.',
    make: (rng) => { const n = ri(rng, 5, 40); return { title: `fib(${n})`, suite: `assert nthFibonacci(${n}) === ${refFib(n)};` }; },
  },
];

/** The fixed generated set: 2 instances per template (20 problems), seeded. */
export function generateProblems(perTemplate = 2, seed = 0x5eed_1234): BenchmarkProblem[] {
  const rng = mulberry32(seed);
  const out: BenchmarkProblem[] = [];
  for (let round = 1; round <= perTemplate; round++) {
    for (const t of TEMPLATES) {
      const { title, suite } = t.make(rng);
      out.push({
        id: `gen_${t.key}_${round}`,
        domain: t.domain,
        title: `${t.functionName} — ${title}`,
        description: t.description,
        functionName: t.functionName,
        hiddenSuite: suite,
        tier: 'generated',
      });
    }
  }
  return out;
}

/**
 * One more real generated problem, deterministic in `seq`. Used to grow the
 * benchmark only after the current set is fully solved — so the yardstick gains
 * headroom as capability catches up, and never from a hand-written pseudo-test.
 * `seq` must be >= GENERATED_PROBLEMS.length to avoid id collisions.
 */
export function makeGeneratedProblem(seq: number): BenchmarkProblem {
  const rng = mulberry32(0x5eed_1234 ^ Math.imul(seq + 1, 0x9e3779b1));
  const t = TEMPLATES[seq % TEMPLATES.length];
  const round = Math.floor(seq / TEMPLATES.length) + 1;
  const { title, suite } = t.make(rng);
  return {
    id: `gen_${t.key}_${round}`,
    domain: t.domain,
    title: `${t.functionName} — ${title}`,
    description: t.description,
    functionName: t.functionName,
    hiddenSuite: suite,
    tier: 'generated',
  };
}

export const GENERATED_PROBLEMS: BenchmarkProblem[] = generateProblems();
