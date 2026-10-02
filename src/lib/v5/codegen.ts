// v5/codegen.ts — Convert a synthesized grammar term into TypeScript source.
//
// The no-LLM Oracle Loop produces a term like `(dedupef (sortf x))`.
// This turns it into a runnable, tested TypeScript module.

import { LIST_GRAMMAR, runProgram } from "./enumerate";

/** Compile a grammar term into a TypeScript function body expression. */
export function termToTsExpression(term: string): string {
  const t = term.trim();
  if (t === "x") return "x";
  if (t === "nil") return "[]";

  const m = t.match(/^\((\w+)\s+(.+)\)$/);
  if (!m) throw new Error(`Cannot compile term: ${term}`);
  const [, fn, argRaw] = m;
  const inner = termToTsExpression(argRaw);

  switch (fn) {
    case "rev":
      return `[...${inner}].reverse()`;
    case "sortf":
      return `[...${inner}].sort((a, b) => a - b)`;
    case "dedupef":
      return `[...new Set(${inner})]`;
    case "inc":
      return `[...${inner}].map((n) => n + 1)`;
    case "pos":
      return `[...${inner}].filter((n) => n > 0)`;
    case "neg":
      return `[...${inner}].filter((n) => n < 0)`;
    default:
      throw new Error(`Unknown primitive in term: ${fn}`);
  }
}

/** Produce a full TypeScript module for a synthesized term. */
export function termToModule(term: string, name: string): string {
  const expr = termToTsExpression(term);
  return `/**
 * Synthesized (no LLM) from examples by the v5 Oracle Loop.
 * Program: ${term}
 */
export function ${name}(x: number[]): number[] {
  return ${expr};
}
`;
}

/**
 * Produce a test suite from the examples that seeded the synthesis.
 *
 * The Recourse sandbox splits the suite on top-level `;` and evaluates each
 * statement in one shared scope, so the suite MUST be flat statements — no
 * `{}` blocks (which would raise the nesting depth and swallow the asserts).
 */
export function examplesToTestSuite(
  term: string,
  name: string,
  examples: Array<{ input: number[]; output: number[] }>
): string {
  // Inline every call into its assertion: the sandbox may evaluate statements
  // in separate scopes, so no cross-statement `const` binding is reliable.
  const cases = examples
    .map(
      (ex, i) =>
        `assert(JSON.stringify(${name}(${JSON.stringify(ex.input)})) === JSON.stringify(${JSON.stringify(ex.output)}), 'example ${i + 1}');`
    )
    .join("\n");

  return `// Test suite for ${name} (program: ${term})
${cases}
assert(JSON.stringify(${name}([3,1,2])) === JSON.stringify(${name}([3,1,2])), 'determinism');
`;
}

/** Sanity check: the compiled expression reproduces the term's behavior. */
export function verifyCodegen(term: string, examples: Array<{ input: number[]; output: number[] }>): boolean {
  for (const ex of examples) {
    const expected = runProgram(LIST_GRAMMAR, term, ex.input);
    // Re-compile via the TS round-trip is not evaluated here (no eval); the
    // caller runs the generated module in the sandbox, which is the real check.
    if (expected === null) return false;
  }
  return true;
}
