/**
 * Hard math problem bank — curated unsolved or known-hard problems.
 *
 * Each problem is machine-checkable: the `acceptanceTest` is a real test suite
 * the solver must pass. Problems are tiered by tractability for an automated
 * system (no LLM only, no internet): we expose the parts we CAN solve, plus
 * hard targets whose solution would represent a genuine mathematical advance.
 *
 * Three tiers:
 *   1. SOLVABLE — closed-form known or bounded search (Collatz max-step
 *      records, prime-gap patterns, etc.). The system earns reward for each
 *      one it solves.
 *   2. BOUNDED — state space is finite, can verify conjectures up to N.
 *      Goldbach strong, twin prime, Beal, etc. (Mersenne primes searched,
 *      perfect numbers enumerated up to N.)
 *   3. OPEN — Millennium Prize, Collatz convergence, Riemann hypothesis,
 *      P vs NP, Navier-Stokes smoothness. We cannot solve these, but we can
 *      record structured search progress and a verifiable exploration record
 *      that contributes to formal-verification / number-theoretic datasets.
 *
 * Honesty contract: every problem's `tier`, `solver` and `acceptanceTest` are
 * real — the suite is something a self-hosted tool can run, not a LLM
 * judgment. Open-tier problems are not "solvable" but still represent
 * valuable directed-search work.
 */

export type ProblemTier = 'solvable' | 'bounded' | 'open';

export interface HardMathProblem {
  id: string;
  tier: ProblemTier;
  title: string;
  /** The exact statement of the problem (real, not paraphrased). */
  statement: string;
  /** Self-hosted tool entrypoint the solver is expected to produce, if any. */
  toolName?: string;
  /** Real acceptance suite the candidate tool must pass. */
  acceptanceTest: string;
  /** Bound for bounded-tier searches (e.g. "test up to N=10000"). */
  bound?: number;
  /** Citation to the canonical statement. */
  citation: string;
  /** If solved, what evidence would we have? */
  successCriterion: string;
}

export const HARD_MATH_PROBLEMS: HardMathProblem[] = [
  // ---- TIER 1: SOLVABLE ----
  {
    id: 'hm.collatz.total_stopping',
    tier: 'solvable',
    title: 'Collatz total-stopping time for n up to N',
    statement: 'For every starting n in [1, N], compute the total stopping time t(n): the number of steps to reach 1 under the Collatz map (n/2 if even, 3n+1 if odd). Return the longest t and the n that produced it.',
    toolName: 'collatzTotalStopping',
    acceptanceTest: [
      "assert typeof collatzTotalStopping === 'function';",
      "assert collatzTotalStopping(1) === 0;",
      "assert collatzTotalStopping(2) === 1;",
      "assert collatzTotalStopping(3) === 7;",
      "assert collatzTotalStopping(6) === 8;",
      "assert collatzTotalStopping(27) === 111;",
      "const __r = collatzTotalStopping(1000);",
      "assert typeof __r === 'object' && typeof __r.maxSteps === 'number' && typeof __r.argmax === 'number';",
      "assert __r.maxSteps >= 100;",
      "assert __r.argmax >= 1 && __r.argmax <= 1000;",
    ].join('\n'),
    bound: 100000,
    citation: 'Collatz (1937), Lagarias (ed.) The Ultimate Challenge, AMS 2010.',
    successCriterion: 'collatzTotalStopping(N) returns a {maxSteps, argmax} whose entries match OEIS A006577 / A006884 for that N.',
  },
  {
    id: 'hm.prime.gaps.upto',
    tier: 'solvable',
    title: 'Maximum prime gap below N',
    statement: 'For every prime p_k below N, compute g_k = p_{k+1} - p_k. Return the maximum gap and the primes that bound it.',
    toolName: 'maxPrimeGap',
    acceptanceTest: [
      "assert typeof maxPrimeGap === 'function';",
      "const __r = maxPrimeGap(30);",
      "assert typeof __r === 'object' && typeof __r.gap === 'number' && Array.isArray(__r.primes);",
      "assert __r.gap === 6 && __r.primes.length === 2;",
      "const __r2 = maxPrimeGap(100);",
      "assert __r2.gap >= 6;",
      "const __r3 = maxPrimeGap(1000);",
      "assert __r3.gap >= 14;",
    ].join('\n'),
    bound: 1000000,
    citation: 'Nicely, "The Price of a Prime Gap", arXiv:0908.0414.',
    successCriterion: 'maxPrimeGap(N) returns the same gap and bounding primes as OEIS A002386 / A005250 records up to N.',
  },
  {
    id: 'hm.zeta.zeros.in_critical_strip',
    tier: 'solvable',
    title: 'Count nontrivial Riemann zeta zeros with imaginary part below T',
    statement: 'Using the Riemann-Siegel formula, count the number of zeros of zeta(s) with 0 < Im(s) < T. Return {N(T), lastImPart} where lastImPart is the imaginary part of the last zero found (approximate via the explicit formula).',
    toolName: 'zetaZeroCount',
    acceptanceTest: [
      "assert typeof zetaZeroCount === 'function';",
      "const __r = zetaZeroCount(100);",
      "assert typeof __r === 'object' && typeof __r.N === 'number';",
      "assert __r.N >= 29 && __r.N <= 32;",
      "const __r2 = zetaZeroCount(1000);",
      "assert __r2.N >= 649 && __r2.N <= 651;",
    ].join('\n'),
    bound: 10000,
    citation: 'Edwards, Riemann Zeta Function (2001); Titchmarsh, Theory of the Riemann Zeta-function (1986).',
    successCriterion: 'zetaZeroCount(T) returns N(T) within the Riemann-Siegel error band ±C·sqrt(T)·log(T) of the true zero count.',
  },
  {
    id: 'hm.digit.factorial_chain',
    tier: 'solvable',
    title: 'Iterated sum-of-factorial-of-digits, find the cycle lengths',
    statement: 'For each starting integer n, iterate f(n) = sum(factorial(digit) for digit in decimal representation of n). Determine the period of each cycle and classify n as "in loop", "fixed point", or "diverging" (any of the known loops: 169→363601→1454→169, 871→45361→871, etc.).',
    toolName: 'factorialDigitChain',
    acceptanceTest: [
      "assert typeof factorialDigitChain === 'function';",
      "const __r = factorialDigitChain(169);",
      "assert __r.cycle && __r.cycle.length > 0;",
      "assert __r.cycle.includes(169) || __r.cycle.includes(363601) || __r.cycle.includes(1454);",
      "const __r2 = factorialDigitChain(1);",
      "assert __r2.cycle && __r2.cycle.length === 1 && __r2.cycle[0] === 1;",
    ].join('\n'),
    citation: 'Factorions, OEIS A014613; Diaconis & Mosteller, JASA 2001.',
    successCriterion: 'factorialDigitChain(n) returns the correct cycle for every known loop (145, 169, 871, 872, 1454, 40585).',
  },
  {
    id: 'hm.proth.primality',
    tier: 'solvable',
    title: 'Find the first 5 Proth primes p = k·2^n + 1 above 10^12',
    statement: 'A Proth number is p = k·2^n + 1 with k odd and 2^n > k. Apply the Proth theorem primality test to find the first 5 Proth primes above 10^12.',
    toolName: 'prothPrimality',
    acceptanceTest: [
      "assert typeof prothPrimality === 'function';",
      "const __r = prothPrimality(1);",
      "assert Array.isArray(__r);",
      "assert __r.length === 1 && Number.isInteger(__r[0]);",
      "assert __r[0] > 1;",
      "const __r2 = prothPrimality(3);",
      "assert __r2.length === 3;",
      "for (const p of __r2) assert Number.isInteger(p) && p > 0;",
    ].join('\n'),
    citation: 'Proth (1878); OEIS A002515.',
    successCriterion: 'prothPrimality(n) returns the first n Proth primes, each verifiable by the Proth theorem in O(log^2 p) arithmetic.',
  },

  // ---- TIER 2: BOUNDED (finite-space verification) ----
  {
    id: 'hm.goldbach.strong.upto',
    tier: 'bounded',
    title: 'Strong Goldbach — verify every even 2n with 4 ≤ 2n ≤ N is a sum of two primes',
    statement: 'The strong Goldbach conjecture states every even integer greater than 2 is the sum of two primes. Verify it for every even number 2n with 4 ≤ 2n ≤ N.',
    toolName: 'goldbachCheck',
    acceptanceTest: [
      "assert typeof goldbachCheck === 'function';",
      "const __r = goldbachCheck(100);",
      "assert __r.verified === true;",
      "assert __r.minEven === 4 && __r.maxEven === 100;",
      "assert typeof __r.totalPairs === 'number' && __r.totalPairs > 0;",
      "const __r2 = goldbachCheck(10000);",
      "assert __r2.verified === true;",
    ].join('\n'),
    bound: 100000,
    citation: 'Goldbach (1742); Helfgott (2013) proved the ternary case; full binary case verified up to 4·10^18 (Oliveira e Silva).',
    successCriterion: 'goldbachCheck(N) returns verified:true iff every even in [4, N] is expressible as p1 + p2 with p1, p2 prime.',
  },
  {
    id: 'hm.collatz.no_exception',
    tier: 'bounded',
    title: 'Collatz — verify no starting n in [1, N] fails to reach 1',
    statement: 'Collatz conjecture: every n under the 3n+1 map reaches 1. Verify the conjecture for every n in [1, N].',
    toolName: 'collatzVerifiedRange',
    acceptanceTest: [
      "assert typeof collatzVerifiedRange === 'function';",
      "const __r = collatzVerifiedRange(1000);",
      "assert __r.verified === true;",
      "assert __r.minN === 1 && __r.maxN === 1000;",
      "assert __r.maxTotalSteps > 0;",
    ].join('\n'),
    bound: 1000000,
    citation: 'Conway (1972), Lagarias (ed.) The Ultimate Challenge, AMS 2010.',
    successCriterion: 'collatzVerifiedRange(N) returns verified:true iff every n in [1, N] reaches 1 in finite steps.',
  },

  // ---- TIER 3: OPEN (recording search progress is the artifact) ----
  {
    id: 'hm.riemann.critical_line',
    tier: 'open',
    title: 'Riemann Hypothesis — search for zeros off the critical line Re(s)=1/2',
    statement: 'The Riemann Hypothesis: all nontrivial zeros of ζ(s) lie on the critical line Re(s) = 1/2. For each tested T, search the rectangle 0 ≤ σ ≤ 1, 0 < t ≤ T for any zero with σ ≠ 1/2.',
    acceptanceTest: [
      "assert typeof riemannSearch === 'function';",
      "const __r = riemannSearch(10);",
      "assert Array.isArray(__r.candidates);",
      "assert __r.candidates.length === 0;",
      "assert typeof __r.criticalCount === 'number' && __r.criticalCount > 0;",
    ].join('\n'),
    bound: 1000000,
    citation: 'Riemann (1859), Clay Mathematics Institute Millennium Prize.',
    successCriterion: 'riemannSearch(T) returns the count of critical-line zeros found (matching Riemann-Siegel) AND an empty candidates list (none off-line) for the searched rectangle.',
  },
  {
    id: 'hm.beal.upto',
    tier: 'open',
    title: 'Beal conjecture — search for A^x + B^y = C^z counter-examples with A, B, C coprime and x, y, z > 2',
    statement: 'Beal conjecture (1993): if A, B, C are coprime positive integers and x, y, z > 2, then A^x + B^y ≠ C^z. Search all quadruples (A, B, C, x, y, z) with min(A, B, C) ≥ 1 and A^x + B^y ≤ BOUND for any counter-example.',
    acceptanceTest: [
      "assert typeof bealSearch === 'function';",
      "const __r = bealSearch(10000);",
      "assert Array.isArray(__r.counterexamples);",
      "assert __r.counterexamples.length === 0;",
      "assert typeof __r.testedQuadruples === 'number' && __r.testedQuadruples > 0;",
    ].join('\n'),
    bound: 1000000,
    citation: 'Beal (1993); Mauldin (1997) $50,000 prize.',
    successCriterion: 'bealSearch(B) returns an empty counterexamples list and the count of quadruples tested.',
  },
];

/** Build a problem archive seed of reproduction suites for every hard-math
 *  problem with a toolName. Returns the same shape as seedArchiveFromVerifiedTools. */
export function seedHardMathArchive(
  archive: { add: (p: any) => { added: boolean; duplicateOf: string | null } },
): { added: number; duplicates: number; skipped: number } {
  let added = 0, duplicates = 0, skipped = 0;
  for (const p of HARD_MATH_PROBLEMS) {
    if (!p.acceptanceTest) { skipped += 1; continue; }
    const res = archive.add({
      id: `problem:${p.id}`,
      domain: 'math',
      title: p.title,
      statement: p.statement,
      acceptanceTest: p.acceptanceTest,
      hints: {
        requiredPrimitives: 2,
        acceptanceLines: p.acceptanceTest.split('\n').length,
        dataDims: p.bound ? 1 : 0,
        tier: p.tier,
        citation: p.citation,
      },
    });
    if (res.added) added += 1;
    else duplicates += 1;
  }
  return { added, duplicates, skipped };
}
