// v5OracleRun.ts — End-to-end orchestrator for the Example-Only Synthesizer.
//
// Engine: exhaustive small-scope enumeration (fast, deterministic).
// cvc5 is demoted to a DIFFERENTIAL CHECK, not the candidate source.
//
// Flow: examples → enumerate → filter → group by behavior → ask best split
//       → converge (one class) or return `ambiguous` when the budget runs out.
//
// A silent wrong answer (q=0, wrong program) is impossible by construction:
// the only way to converge is one behavior class on the exhaustive scope.
//
// Purely symbolic — no LLM involved.

import crypto from "crypto";
import {
  LIST_GRAMMAR,
  DEFAULT_SCOPE,
  enumeratePrograms,
  consistentPrograms,
  groupByBehavior,
  bestSplitInput,
  runProgram,
  randomLongLists,
  type Grammar,
  type Program,
  type Example,
} from "./enumerate";

// ==========================================
// Types
// ==========================================

export interface AnswerEvent {
  index: number;
  input: number[];
  chosen: string;
  /** Number of behavior classes before this answer. */
  classesBefore: number;
  /** Number of behavior classes after this answer. */
  classesAfter: number;
  contradiction: boolean;
}

export type OracleStatus = "converged" | "ambiguous" | "contradiction" | "outside-grammar";

export interface Certificate {
  taskId: string;
  status: OracleStatus;
  examplesUsed: number;
  questionsAsked: number;
  answerLog: AnswerEvent[];
  /** Scope used for behavior grouping (size + description). */
  scope: { size: number; description: string };
  /** Rivals when ambiguous. */
  rivals: string[];
  separatingInput?: number[];
  /** Long-list backstop result. */
  backstopPassed: boolean;
  trustTier: string;
  hash: string;
}

export interface OracleRunConfig {
  taskId: string;
  examples: Example[];
  maxDepth: number;
  maxQuestions: number;
  grammar?: Grammar;
  scope?: number[][];
  askUser: (question: { input: number[]; options: string[] }) => Promise<string>;
  /** Number of long random lists for the backstop. */
  backstopSamples?: number;
  /**
   * Confirmation pass: show the winning program's output on a few diverse
   * inputs and let the user reject it. Catches a silently-wrong convergence
   * that no rollback could detect (a wrong answer consistent with earlier ones).
   * Returns the CORRECT output (equal to `proposed` when confirmed).
   */
  confirmUser?: (proposal: { input: number[]; proposed: string }) => Promise<string>;
  /** How many confirmation samples to show. */
  confirmSamples?: number;
}

export interface OracleRunResult {
  success: boolean;
  code?: string;
  status: OracleStatus;
  certificate?: Certificate;
  rivals?: string[];
  separatingInput?: number[];
  answerLog: AnswerEvent[];
  error?: string;
}

// ==========================================
// Append-only answer log with rollback
// ==========================================

export class AnswerLog {
  private events: AnswerEvent[] = [];
  private snapshots: Array<{ examples: Example[] }> = [];

  append(event: AnswerEvent): void {
    this.events.push(event);
  }

  snapshot(examples: Example[]): void {
    this.snapshots.push({ examples: examples.map((e) => ({ input: [...e.input], output: [...e.output] })) });
  }

  rollbackTo(index: number): { examples: Example[] } | null {
    if (index < 0 || index >= this.snapshots.length) return null;
    this.events = this.events.slice(0, index);
    this.snapshots = this.snapshots.slice(0, index + 1);
    const snap = this.snapshots[index];
    return { examples: snap.examples.map((e) => ({ input: [...e.input], output: [...e.output] })) };
  }

  detectContradiction(input: number[], chosen: string): boolean {
    const key = JSON.stringify(input);
    return this.events.some(
      (ev) => JSON.stringify(ev.input) === key && ev.chosen !== chosen && !ev.contradiction
    );
  }

  get length(): number {
    return this.events.length;
  }

  all(): AnswerEvent[] {
    return [...this.events];
  }
}

// ==========================================
// Certificate
// ==========================================

export function buildCertificate(input: {
  taskId: string;
  status: OracleStatus;
  examples: Example[];
  answerLog: AnswerEvent[];
  scopeSize: number;
  scopeDescription: string;
  rivals: string[];
  separatingInput?: number[];
  backstopPassed: boolean;
}): Certificate {
  const trustTier =
    input.status === "converged" && input.backstopPassed
      ? "bounded-checked (scope + backstop)"
      : input.status === "converged"
      ? "tested-only"
      : input.status;

  const base = {
    taskId: input.taskId,
    status: input.status,
    examplesUsed: input.examples.length,
    questionsAsked: input.answerLog.length,
    answerLog: input.answerLog,
    scope: { size: input.scopeSize, description: input.scopeDescription },
    rivals: input.rivals,
    separatingInput: input.separatingInput,
    backstopPassed: input.backstopPassed,
    trustTier,
  };
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(base, Object.keys(base).sort()))
    .digest("hex");
  return { ...base, hash };
}

// ==========================================
// Orchestrator
// ==========================================

export async function runOracleLoop(config: OracleRunConfig): Promise<OracleRunResult> {
  const grammar = config.grammar ?? LIST_GRAMMAR;
  const scope = config.scope ?? DEFAULT_SCOPE;
  const answerLog = new AnswerLog();
  const examples: Example[] = config.examples.map((e) => ({ input: [...e.input], output: [...e.output] }));

  // Reject inconsistent examples
  const seen = new Map<string, string>();
  for (const ex of examples) {
    const key = JSON.stringify(ex.input);
    if (seen.has(key) && seen.get(key) !== JSON.stringify(ex.output)) {
      const cert = buildCertificate({
        taskId: config.taskId, status: "contradiction", examples, answerLog: answerLog.all(),
        scopeSize: scope.length, scopeDescription: scopeDesc(scope), rivals: [], backstopPassed: false,
      });
      return { success: false, status: "contradiction", certificate: cert, answerLog: answerLog.all(), error: "Inconsistent input examples" };
    }
    seen.set(key, JSON.stringify(ex.output));
  }

  const programs = enumeratePrograms(grammar, config.maxDepth);

  while (true) {
    const consistent = consistentPrograms(grammar, programs, examples);

    if (consistent.length === 0) {
      const cert = buildCertificate({
        taskId: config.taskId, status: "contradiction", examples, answerLog: answerLog.all(),
        scopeSize: scope.length, scopeDescription: scopeDesc(scope), rivals: [], backstopPassed: false,
      });
      return {
        success: false, status: "contradiction", certificate: cert, answerLog: answerLog.all(),
        error: "No program in the grammar is consistent with the examples (outside grammar or contradictory answers)",
      };
    }

    const classes = groupByBehavior(grammar, consistent, scope);
    const representatives = Array.from(classes.values()).map((ps) => ps[0].term);

    // Converged: exactly one behavior class on the scope
    if (classes.size === 1) {
      const representative = representatives[0];

      // Confirmation pass: a wrong answer that did not contradict earlier ones
      // can silently eliminate the correct class. Show the winner's output on
      // diverse inputs; if the user rejects one, add the true output and re-loop.
      if (config.confirmUser) {
        const confirmInputs = pickConfirmInputs(scope, examples, config.confirmSamples ?? 3);
        let rejected: { input: number[]; actual: string } | null = null;
        for (const input of confirmInputs) {
          const proposed = JSON.stringify(runProgram(grammar, representative, input));
          const actual = await config.confirmUser({ input, proposed });
          if (actual !== proposed) {
            rejected = { input, actual };
            break;
          }
        }
        if (rejected) {
          examples.push({ input: rejected.input, output: JSON.parse(rejected.actual) });
          continue;
        }
      }

      // Long-list backstop: any member of the class that differs from the
      // representative on a long random list is a scope miss.
      const backstop = randomLongLists(config.backstopSamples ?? 200, 8, [0, 1, 2, 3, 4, 5]);
      let scopeMiss: { input: number[]; rival: string } | null = null;
      for (const member of classes.values().next().value as Program[]) {
        if (member.term === representative) continue;
        for (const input of backstop) {
          const a = runProgram(grammar, representative, input);
          const b = runProgram(grammar, member.term, input);
          if (a && b && JSON.stringify(a) !== JSON.stringify(b)) {
            scopeMiss = { input, rival: member.term };
            break;
          }
        }
        if (scopeMiss) break;
      }

      const cert = buildCertificate({
        taskId: config.taskId, status: "converged", examples, answerLog: answerLog.all(),
        scopeSize: scope.length, scopeDescription: scopeDesc(scope),
        rivals: scopeMiss ? [scopeMiss.rival] : [],
        separatingInput: scopeMiss?.input,
        backstopPassed: !scopeMiss,
      });

      if (scopeMiss) {
        return {
          success: false, status: "ambiguous", certificate: cert, code: representative,
          rivals: [scopeMiss.rival], separatingInput: scopeMiss.input, answerLog: answerLog.all(),
          error: `Scope miss: "${scopeMiss.rival}" agrees on the scope but differs on ${JSON.stringify(scopeMiss.input)}`,
        };
      }

      return { success: true, status: "converged", code: representative, certificate: cert, answerLog: answerLog.all() };
    }

    // Ambiguous and out of budget → report honestly
    if (answerLog.length >= config.maxQuestions) {
      const split = bestSplitInput(grammar, representatives, scope);
      const cert = buildCertificate({
        taskId: config.taskId, status: "ambiguous", examples, answerLog: answerLog.all(),
        scopeSize: scope.length, scopeDescription: scopeDesc(scope), rivals: representatives,
        separatingInput: split?.input, backstopPassed: false,
      });
      return {
        success: false, status: "ambiguous", certificate: cert, rivals: representatives,
        separatingInput: split?.input, answerLog: answerLog.all(),
        error: `Ambiguous after ${answerLog.length} questions — ${classes.size} behavior classes remain`,
      };
    }

    // Ask the best-splitting input
    const split = bestSplitInput(grammar, representatives, scope);
    if (!split) break;

    answerLog.snapshot(examples);
    const chosen = await config.askUser({ input: split.input, options: split.outputs });

    // "none of these" — the user's intent is not expressible in the grammar.
    if (chosen === "none") {
      const cert = buildCertificate({
        taskId: config.taskId, status: "outside-grammar", examples, answerLog: answerLog.all(),
        scopeSize: scope.length, scopeDescription: scopeDesc(scope), rivals: representatives,
        separatingInput: split.input, backstopPassed: false,
      });
      return {
        success: false, status: "outside-grammar", certificate: cert, rivals: representatives,
        separatingInput: split.input, answerLog: answerLog.all(),
        error: `User rejected all options at ${JSON.stringify(split.input)} — grammar/library gap`,
      };
    }

    if (answerLog.detectContradiction(split.input, chosen)) {
      answerLog.append({
        index: answerLog.length, input: split.input, chosen,
        classesBefore: classes.size, classesAfter: classes.size, contradiction: true,
      });
      const rolled = answerLog.rollbackTo(answerLog.length - 2);
      if (rolled) examples.splice(0, examples.length, ...rolled.examples);
      continue;
    }

    const output = JSON.parse(chosen) as number[];
    examples.push({ input: split.input, output });

    const after = groupByBehavior(grammar, consistentPrograms(grammar, programs, examples), scope);
    answerLog.append({
      index: answerLog.length, input: split.input, chosen,
      classesBefore: classes.size, classesAfter: after.size, contradiction: false,
    });
  }

  return {
    success: false, status: "ambiguous", answerLog: answerLog.all(),
    error: "Loop exited without convergence",
  };
}

function scopeDesc(scope: number[][]): string {
  return `all lists of length ≤ 4 over {0,1,2,3} (${scope.length} inputs)`;
}

/**
 * Pick diverse inputs for the confirmation pass: inputs not already in the
 * examples, spread across lengths, preferring ones with repeated values
 * (where programs most often diverge).
 */
function pickConfirmInputs(
  scope: number[][],
  examples: Example[],
  count: number
): number[][] {
  const used = new Set(examples.map((e) => JSON.stringify(e.input)));
  const candidates = scope.filter((inp) => !used.has(JSON.stringify(inp)));

  // Prefer inputs with repeated values, then by length, then by value spread
  const scored = candidates.map((inp) => {
    const hasRepeat = new Set(inp).size < inp.length;
    const spread = new Set(inp).size;
    return { inp, score: (hasRepeat ? 4 : 0) + Math.min(inp.length, 4) + spread };
  });
  scored.sort((a, b) => b.score - a.score);

  // Take a spread across distinct lengths
  const picked: number[][] = [];
  const seenLengths = new Set<number>();
  for (const { inp } of scored) {
    if (picked.length >= count) break;
    if (!seenLengths.has(inp.length)) {
      seenLengths.add(inp.length);
      picked.push(inp);
    }
  }
  // Fill remaining from the top if we ran out of distinct lengths
  for (const { inp } of scored) {
    if (picked.length >= count) break;
    if (!picked.includes(inp)) picked.push(inp);
  }
  return picked;
}
