// v5Enumerate.ts — Exhaustive small-scope enumeration for convergence.
//
// Replaces the mutation + 7-probe proxy with the real thing:
//   1. Enumerate every program in the grammar up to depth D
//   2. Filter to those consistent with all examples
//   3. Group by behavior on an exhaustive small scope
//   4. If >1 behavior class remains, ask the best-splitting input
//   5. Stop only when one class remains; otherwise return `ambiguous`
//
// The small-scope hypothesis: two programs equal on all lists of length ≤ N
// over a small alphabet usually agree everywhere. It is a heuristic, not a
// proof, so the certificate records the scope and a long-list backstop runs.
//
// Purely symbolic — no LLM involved.

// ==========================================
// Scope: all lists up to maxLen over the alphabet
// ==========================================

export function allLists(maxLen: number, alphabet: number[]): number[][] {
  const out: number[][] = [[]];
  let frontier: number[][] = [[]];
  for (let len = 1; len <= maxLen; len++) {
    const next: number[][] = [];
    for (const prefix of frontier) {
      for (const v of alphabet) next.push([...prefix, v]);
    }
    out.push(...next);
    frontier = next;
  }
  return out;
}

/** Default scope: all lists of length ≤ 4 over {0,1,2,3} = 341 inputs. */
export const DEFAULT_SCOPE: number[][] = allLists(4, [0, 1, 2, 3]);

// ==========================================
// Program grammar (explicit, small)
// ==========================================

export interface Grammar {
  /** Unary operators: name → implementation. */
  unary: Record<string, (x: number[]) => number[]>;
  /** Whether the nullary `nil` constructor is available. */
  hasNil: boolean;
}

export const LIST_GRAMMAR: Grammar = {
  unary: {
    rev: (x) => [...x].reverse(),
    sortf: (x) => [...x].sort((a, b) => a - b),
    dedupef: (x) => [...new Set(x)],
    inc: (x) => x.map((n) => n + 1),
    pos: (x) => x.filter((n) => n > 0),
    neg: (x) => x.filter((n) => n < 0),
  },
  hasNil: true,
};

export interface Program {
  term: string;
  depth: number;
}

/**
 * Enumerate every program up to depth D.
 * depth 0: x, nil
 * depth k: (op P) for P at depth k-1
 */
export function enumeratePrograms(grammar: Grammar, maxDepth: number): Program[] {
  const byDepth: Program[][] = [];

  byDepth[0] = [{ term: "x", depth: 0 }];
  if (grammar.hasNil) byDepth[0].push({ term: "nil", depth: 0 });

  const all: Program[] = [...byDepth[0]];

  for (let d = 1; d <= maxDepth; d++) {
    const level: Program[] = [];
    for (const op of Object.keys(grammar.unary)) {
      for (const sub of byDepth[d - 1]) {
        level.push({ term: `(${op} ${sub.term})`, depth: d });
      }
    }
    byDepth[d] = level;
    all.push(...level);
  }

  return all;
}

// ==========================================
// Evaluation
// ==========================================

export function runProgram(grammar: Grammar, term: string, input: number[]): number[] | null {
  const t = term.trim();
  if (t === "x") return input;
  if (t === "nil") return [];

  const m = t.match(/^\((\w+)\s+(.+)\)$/);
  if (!m) return null;
  const [, fn, argRaw] = m;
  const op = grammar.unary[fn];
  if (!op) return null;

  const arg = runProgram(grammar, argRaw, input);
  if (arg === null) return null;
  return op(arg);
}

// ==========================================
// Consistency + behavior classes
// ==========================================

export interface Example {
  input: number[];
  output: number[];
}

export function matchesExamples(grammar: Grammar, term: string, examples: Example[]): boolean {
  for (const ex of examples) {
    const out = runProgram(grammar, term, ex.input);
    if (out === null) return false;
    if (JSON.stringify(out) !== JSON.stringify(ex.output)) return false;
  }
  return true;
}

export function consistentPrograms(
  grammar: Grammar,
  programs: Program[],
  examples: Example[]
): Program[] {
  return programs.filter((p) => matchesExamples(grammar, p.term, examples));
}

/** Signature of a program's behavior across the scope. */
export function behaviorSignature(grammar: Grammar, term: string, scope: number[][]): string {
  return scope.map((inp) => JSON.stringify(runProgram(grammar, term, inp) ?? null)).join("|");
}

/**
 * Group consistent programs into behavior classes.
 * Returns a map from signature → representative programs.
 */
export function groupByBehavior(
  grammar: Grammar,
  programs: Program[],
  scope: number[][]
): Map<string, Program[]> {
  const classes = new Map<string, Program[]>();
  for (const p of programs) {
    const sig = behaviorSignature(grammar, p.term, scope);
    if (!classes.has(sig)) classes.set(sig, []);
    classes.get(sig)!.push(p);
  }
  return classes;
}

/**
 * Find the input that splits the behavior classes most evenly (max entropy).
 */
export function bestSplitInput(
  grammar: Grammar,
  representatives: string[],
  scope: number[][]
): { input: number[]; outputs: string[] } | null {
  let best: { input: number[]; outputs: string[] } | null = null;
  let bestEntropy = -Infinity;

  for (const input of scope) {
    const outputs = representatives.map((t) => JSON.stringify(runProgram(grammar, t, input) ?? null));
    const counts = new Map<string, number>();
    for (const o of outputs) counts.set(o, (counts.get(o) || 0) + 1);
    if (counts.size < 2) continue;

    let entropy = 0;
    for (const c of counts.values()) {
      const p = c / representatives.length;
      entropy -= p * Math.log2(p);
    }
    if (entropy > bestEntropy) {
      bestEntropy = entropy;
      // Represent each distinct output once (dedup options)
      const distinct = Array.from(new Set(outputs));
      best = { input, outputs: distinct };
    }
  }

  return best;
}

// ==========================================
// Longer random backstop
// ==========================================

export function randomLongLists(n: number, maxLen: number, alphabet: number[], rng = Math.random): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < n; i++) {
    const len = Math.floor(rng() * (maxLen + 1));
    const list: number[] = [];
    for (let j = 0; j < len; j++) list.push(alphabet[Math.floor(rng() * alphabet.length)]);
    out.push(list);
  }
  return out;
}
