// v5Benchmark.ts — Benchmark harness with a simulated oracle.
//
// 20 tasks, each with a HIDDEN reference program. The reference answers
// interrogation questions, making the experiment automatic and repeatable.
// A noisy-oracle variant tests rollback.
//
// Held-out equivalence is computed over the exhaustive scope PLUS longer
// random lists, so it does not depend on whichever inputs happened to be sampled.
//
// Purely symbolic — no LLM involved.

import { runOracleLoop } from "./oracleRun";
import {
  LIST_GRAMMAR,
  DEFAULT_SCOPE,
  runProgram,
  randomLongLists,
  type Example,
} from "./enumerate";

// ==========================================
// Task definitions
// ==========================================

export interface BenchmarkTask {
  id: string;
  /** Hidden reference program (a grammar term). */
  reference: string;
  /** Inputs used to seed the examples. */
  seedInputs: number[][];
}

const LONG_BACKSTOP = randomLongLists(300, 8, [0, 1, 2, 3, 4, 5], mulberry32(12345));

export const BENCHMARK_TASKS: BenchmarkTask[] = [
  { id: "sort", reference: "(sortf x)", seedInputs: [[3, 1, 2], [5, 4, 3]] },
  { id: "reverse", reference: "(rev x)", seedInputs: [[1, 2, 3], [4, 5]] },
  { id: "dedupe", reference: "(dedupef x)", seedInputs: [[1, 1, 2], [3, 3, 3, 4]] },
  { id: "sort-dedupe", reference: "(dedupef (sortf x))", seedInputs: [[3, 1, 2, 1], [5, 4, 4, 3]] },
  { id: "rev-sort", reference: "(rev (sortf x))", seedInputs: [[3, 1, 2], [5, 4, 3]] },
  { id: "sort-rev", reference: "(sortf (rev x))", seedInputs: [[3, 1, 2], [5, 4, 3]] },
  { id: "identity", reference: "x", seedInputs: [[1, 2, 3], [4, 5]] },
  { id: "dedupe-sort", reference: "(sortf (dedupef x))", seedInputs: [[1, 1, 2], [4, 3, 3, 4]] },
  { id: "rev-dedupe", reference: "(dedupef (rev x))", seedInputs: [[1, 2, 1], [3, 4, 3]] },
  { id: "dedupe-rev", reference: "(rev (dedupef x))", seedInputs: [[1, 2, 1], [3, 4, 3]] },
  { id: "rev-rev", reference: "(rev (rev x))", seedInputs: [[1, 2, 3], [4, 5, 6]] },
  { id: "sort-sort", reference: "(sortf (sortf x))", seedInputs: [[3, 1, 2], [6, 5, 4]] },
  { id: "dedupe-dedupe", reference: "(dedupef (dedupef x))", seedInputs: [[1, 1, 2], [3, 3, 4]] },
  { id: "sort-rev-sort", reference: "(sortf (rev (sortf x)))", seedInputs: [[3, 1, 2], [5, 4, 3]] },
  { id: "rev-sort-dedupe", reference: "(dedupef (rev (sortf x)))", seedInputs: [[3, 1, 2, 1], [5, 4, 4, 3]] },
  { id: "sort-dedupe-rev", reference: "(rev (dedupef (sortf x)))", seedInputs: [[3, 1, 2, 1], [5, 4, 4, 3]] },
  { id: "nil", reference: "nil", seedInputs: [[1, 2], [3, 4, 5]] },
  { id: "dedupe-sort-rev", reference: "(rev (sortf (dedupef x)))", seedInputs: [[1, 1, 2], [4, 3, 3, 4]] },
  { id: "rev-dedupe-sort", reference: "(sortf (dedupef (rev x)))", seedInputs: [[1, 2, 1], [3, 4, 3]] },
  { id: "idempotent-sort", reference: "(sortf (sortf (sortf x)))", seedInputs: [[3, 1, 2], [5, 4, 3]] },
  // Harder tasks: map/filter primitives and deeper compositions
  { id: "inc", reference: "(inc x)", seedInputs: [[3, 1, 2], [5, 4, 3]] },
  { id: "pos", reference: "(pos x)", seedInputs: [[3, -1, 2], [-5, 4, -3]] },
  { id: "inc-sort", reference: "(sortf (inc x))", seedInputs: [[3, 1, 2], [5, 4, 3]] },
  { id: "pos-sort", reference: "(sortf (pos x))", seedInputs: [[3, -1, 2], [-5, 4, -3]] },
  { id: "pos-dedupe", reference: "(dedupef (pos x))", seedInputs: [[1, -1, 2, 1], [-3, 3, 4, 3]] },
  { id: "inc-dedupe-sort", reference: "(sortf (dedupef (inc x)))", seedInputs: [[3, 1, 2, 1], [-1, 4, 4, 3]] },
  { id: "pos-inc-rev", reference: "(rev (inc (pos x)))", seedInputs: [[3, -1, 2], [-5, 4, -3]] },
  { id: "neg-rev", reference: "(rev (neg x))", seedInputs: [[3, -1, -2], [-5, 4, -3]] },
  { id: "pos-dedupe-rev", reference: "(rev (dedupef (pos x)))", seedInputs: [[1, -1, 2, 1], [-3, 3, 4, 3]] },
  { id: "inc-pos-sort", reference: "(sortf (pos (inc x)))", seedInputs: [[3, -1, 2], [-5, 4, -3]] },
];

// ==========================================
// Simulated oracle
// ==========================================

export function makeReferenceOracle(reference: string, noiseRate = 0, rng: () => number = Math.random) {
  return async (question: { input: number[]; options: string[] }): Promise<string> => {
    const refOut = runProgram(LIST_GRAMMAR, reference, question.input);
    if (refOut === null) return "none";

    // Options are OUTPUT strings (already evaluated), not program terms.
    // The reference's output must appear among them; if it does not, the user
    // says NONE — the harness must never guess.
    const refStr = JSON.stringify(refOut);
    if (!question.options.includes(refStr)) return "none";

    if (noiseRate > 0 && rng() < noiseRate) {
      const wrong = question.options.filter((o) => o !== refStr);
      if (wrong.length > 0) return wrong[Math.floor(rng() * wrong.length)];
    }
    return refStr;
  };
}

/**
 * Confirmation oracle: shows the winner's output on an input and returns the
 * reference's true output. A correct convergence returns `proposed` unchanged.
 */
export function makeReferenceConfirmer(reference: string) {
  return async (proposal: { input: number[]; proposed: string }): Promise<string> => {
    const refOut = runProgram(LIST_GRAMMAR, reference, proposal.input);
    return refOut === null ? proposal.proposed : JSON.stringify(refOut);
  };
}

// ==========================================
// Task runner
// ==========================================

export interface TaskResult {
  taskId: string;
  status: string;
  code: string;
  questionsAsked: number;
  /** Fraction of held-out inputs (scope + long lists) where result matches reference. */
  equivalence: number;
  timeMs: number;
  trustTier: string;
  rivals: string[];
  error?: string;
}

export async function runBenchmark(
  tasks: BenchmarkTask[],
  opts: { maxDepth: number; maxQuestions: number; noiseRate?: number; noiseSeed?: number; confirm?: boolean }
): Promise<TaskResult[]> {
  const results: TaskResult[] = [];

  for (const task of tasks) {
    const started = Date.now();
    const examples: Example[] = task.seedInputs.map((input) => ({
      input,
      output: runProgram(LIST_GRAMMAR, task.reference, input) ?? [],
    }));

    const rng = opts.noiseSeed !== undefined ? mulberry32(opts.noiseSeed) : Math.random;
    const oracle = makeReferenceOracle(task.reference, opts.noiseRate ?? 0, rng);

    try {
      const result = await runOracleLoop({
        taskId: task.id,
        examples,
        maxDepth: opts.maxDepth,
        maxQuestions: opts.maxQuestions,
        askUser: oracle,
        confirmUser: opts.confirm ? makeReferenceConfirmer(task.reference) : undefined,
      });

      const equivalence = result.code
        ? heldOutEquivalence(result.code, task.reference)
        : 0;

      results.push({
        taskId: task.id,
        status: result.status,
        code: result.code ?? (result.rivals?.[0] ?? ""),
        questionsAsked: result.answerLog.length,
        equivalence,
        timeMs: Date.now() - started,
        trustTier: result.certificate?.trustTier ?? result.status,
        rivals: result.rivals ?? [],
        error: result.error,
      });
    } catch (err: any) {
      results.push({
        taskId: task.id, status: "error", code: "", questionsAsked: 0,
        equivalence: 0, timeMs: Date.now() - started, trustTier: "error",
        rivals: [], error: err.message,
      });
    }
  }

  return results;
}

function heldOutEquivalence(candidate: string, reference: string): number {
  let matches = 0;
  let total = 0;
  const allInputs = [...DEFAULT_SCOPE, ...LONG_BACKSTOP];
  for (const input of allInputs) {
    const c = runProgram(LIST_GRAMMAR, candidate, input);
    const r = runProgram(LIST_GRAMMAR, reference, input);
    if (c === null || r === null) continue;
    total++;
    if (JSON.stringify(c) === JSON.stringify(r)) matches++;
  }
  return total > 0 ? matches / total : 0;
}

// Deterministic RNG for reproducible long backstops
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
