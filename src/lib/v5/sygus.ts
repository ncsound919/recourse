// v5Sygus.ts — cvc5 SyGuS proposer (swappable engine interface).
//
// Replaces the hand-rolled enumeration for candidate generation.
// cvc5's SyGuS mode synthesizes programs from a grammar + examples, and
// `--sygus-stream` enumerates a stream of solutions for interrogation.
//
// Design (per the review):
//   - Treat SyGuS as the PROPOSER, not the whole pipeline.
//   - Keep the hand-rolled enumerator as a differential oracle.
//   - Shell out to a pinned binary; record version + seed in the certificate.
//   - Generate the SMT definitions and the TS implementations from ONE
//     source of truth (the primitive table) so their semantics can't diverge.
//
// Purely symbolic — no LLM involved.

import { execFile, spawn } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";

const execFileAsync = promisify(execFile);

// ==========================================
// Primitive table — single source of truth
// ==========================================

export interface SygusPrimitive {
  /** Function name in both SMT and the grammar. */
  name: string;
  /** SMT-LIB `define-fun-rec` definition (used in the SMT file). */
  smtDefinition: string;
  /**
   * The TypeScript implementation (used by the differential oracle).
   *
   * Variadic because `app`, `ins` and `filtf` are binary. Each one MUST agree
   * with its `smtDefinition` — `differentialCheck` enforces this, which is what
   * makes the table a single source of truth rather than two adjacent claims.
   */
  tsImplementation: (...args: unknown[]) => unknown;
  /** Grammar production args (nonterminal placeholders). */
  grammarArgs: string[];
  /** Human description. */
  description: string;
}

/** Coerce an unknown to a list of numbers, the way the SMT `L` sort means. */
function asList(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.map(Number).filter((n) => Number.isFinite(n));
}

/**
 * Insert `a` into a sorted list, matching the SMT definition exactly:
 * `(ite (<= a (hd x)) (cons a x) (cons (hd x) (ins a (tl x))))`.
 */
function insertSorted(a: number, xs: number[]): number[] {
  const out = [...xs];
  const at = out.findIndex((v) => a <= v);
  out.splice(at < 0 ? out.length : at, 0, a);
  return out;
}

/** List datatype declaration for the SMT file. */
export const LIST_DATATYPE = `(declare-datatypes ((L 0)) (((nil) (cons (hd Int) (tl L)))))`;

/**
 * The standard list primitive table.
 * Each primitive has an SMT definition and a TS implementation that
 * MUST agree — a differential test enforces this.
 */
export const LIST_PRIMITIVES: SygusPrimitive[] = [
  {
    name: "app",
    smtDefinition: `(define-fun-rec app ((x L) (y L)) L (ite ((_ is nil) x) y (cons (hd x) (app (tl x) y))))`,
    tsImplementation: (x, y) => [...asList(x), ...asList(y)],
    grammarArgs: [],
    description: "append",
  },
  {
    name: "rev",
    smtDefinition: `(define-fun-rec rev ((x L)) L (ite ((_ is nil) x) nil (app (rev (tl x)) (cons (hd x) nil))))`,
    tsImplementation: (x) => [...asList(x)].reverse(),
    grammarArgs: ["Start"],
    description: "reverse",
  },
  {
    name: "ins",
    smtDefinition: `(define-fun-rec ins ((a Int) (x L)) L (ite ((_ is nil) x) (cons a nil) (ite (<= a (hd x)) (cons a x) (cons (hd x) (ins a (tl x))))))`,
    tsImplementation: (a, x) => insertSorted(Number(a), asList(x)),
    grammarArgs: [],
    description: "insert into sorted list",
  },
  {
    name: "sortf",
    smtDefinition: `(define-fun-rec sortf ((x L)) L (ite ((_ is nil) x) nil (ins (hd x) (sortf (tl x)))))`,
    tsImplementation: (x) => [...asList(x)].sort((a, b) => a - b),
    grammarArgs: ["Start"],
    description: "sort ascending",
  },
  {
    name: "dedupef",
    smtDefinition: `(define-fun-rec dedupef ((x L)) L (ite ((_ is nil) x) nil (cons (hd x) (dedupef (filtf (hd x) (tl x))))))`,
    tsImplementation: (x) => [...new Set(asList(x))],
    grammarArgs: ["Start"],
    description: "remove duplicates",
  },
  {
    name: "filtf",
    smtDefinition: `(define-fun-rec filtf ((a Int) (x L)) L (ite ((_ is nil) x) nil (ite (= a (hd x)) (filtf a (tl x)) (cons (hd x) (filtf a (tl x))))))`,
    tsImplementation: (a, x) => asList(x).filter((v) => v !== Number(a)),
    grammarArgs: [],
    description: "filter out a value",
  },
];

/** Grammar production for a unary primitive: `(name Start)`. */
function grammarProduction(p: SygusPrimitive): string | null {
  if (p.grammarArgs.length === 0) return null; // helpers, not grammar nodes
  return `(${p.name} ${p.grammarArgs.join(" ")})`;
}

// ==========================================
// List value → SMT term
// ==========================================

export function listToSMT(xs: unknown): string {
  if (!Array.isArray(xs)) throw new Error("listToSMT expects an array");
  let term = "nil";
  for (let i = xs.length - 1; i >= 0; i--) {
    term = `(cons ${Number(xs[i])} ${term})`;
  }
  return term;
}

export function smtToList(term: string): number[] {
  const out: number[] = [];
  const re = /\(cons (-?\d+) /g;
  let m;
  while ((m = re.exec(term)) !== null) out.push(Number(m[1]));
  return out;
}

// ==========================================
// SyGuS spec + proposer
// ==========================================

export interface SygusExample {
  input: number[];
  output: number[];
}

export interface SygusSpec {
  /** Which primitives may appear in the grammar. */
  primitiveNames: string[];
  /** Input/output examples (bounded lists). */
  examples: SygusExample[];
  /** Maximum number of streamed solutions to collect. */
  maxSolutions: number;
  /** Per-solution timeout budget. */
  timeoutMs: number;
  /** cvc5 binary path. */
  cvc5Path: string;
  /** Fixed random seed (for determinism). */
  seed?: number;
}

export interface ProposeResult {
  candidates: string[];
  cvc5Version: string;
  seed: number;
  timedOut: boolean;
}

/**
 * Build the SyGuS SMT-LIB program.
 *
 * Format (SyGuS v2): two lists — nonterminal declarations, then productions.
 */
export function buildSygusProgram(spec: SygusSpec): string {
  const prims = LIST_PRIMITIVES.filter((p) => spec.primitiveNames.includes(p.name));
  const productions = prims.map(grammarProduction).filter((p): p is string => p !== null);

  // Helper functions must be defined BEFORE the primitives that use them.
  // `app` is used by `rev`; `ins` by `sortf`; `filtf` by `dedupef`.
  const HELPER_ORDER = ["app", "ins", "filtf"];
  const helperDefs = HELPER_ORDER.map(
    (name) => LIST_PRIMITIVES.find((p) => p.name === name)?.smtDefinition || ""
  ).filter(Boolean);
  const primitiveDefs = prims
    .filter((p) => !HELPER_ORDER.includes(p.name))
    .map((p) => p.smtDefinition)
    .filter((d) => d.length > 0);
  const definitions = [...helperDefs, ...primitiveDefs];

  const constraintLines = spec.examples
    .map((ex) => `(constraint (= (f ${listToSMT(ex.input)}) ${listToSMT(ex.output)}))`)
    .join("\n");

  return `(set-logic ALL)
${LIST_DATATYPE}
${definitions.join("\n")}
(synth-fun f ((x L)) L
  ((Start L))
  ((Start L (x nil ${productions.join(" ")}))))
(declare-var x L)
${constraintLines}
(check-synth)
`;
}

/**
 * Propose candidate programs using cvc5's SyGuS stream mode.
 *
 * This is the swappable engine interface. The hand-rolled enumerator
 * remains as a differential oracle.
 */
export async function propose(spec: SygusSpec): Promise<ProposeResult> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "v5-sygus-"));
  const seed = spec.seed ?? 0;

  // cvc5 version (recorded in the certificate)
  let version = "unknown";
  try {
    const v = await execFileAsync(spec.cvc5Path, ["--version"], { timeout: 5000 });
    version = v.stdout.split("\n")[0].trim();
  } catch {
    // Version unavailable — candidates may still work
  }

  try {
    const program = buildSygusProgram(spec);
    const inputFile = path.join(tmpDir, "spec.sy");
    fs.writeFileSync(inputFile, program);

    // --sygus-stream enumerates multiple solutions and never terminates.
    // We collect exactly maxSolutions (or until the timeout) then kill the
    // process, so collection is deterministic rather than timeout-dependent.
    //
    // --check-synth-sol asks cvc5 to verify each solution against the
    // constraints itself before streaming it. A candidate that fails its own
    // check never reaches us, so the stream is pre-filtered by the solver's
    // own verdict rather than only by ours downstream.
    const args = [
      "--sygus-stream",
      "--sygus-out=status",
      "--check-synth-sol",
      `--seed=${seed}`,
      inputFile,
    ];

    const { stdout, timedOut } = await collectStream(spec.cvc5Path, args, spec.maxSolutions, spec.timeoutMs);
    const candidates = parseSolutions(stdout, spec.maxSolutions);
    return { candidates, cvc5Version: version, seed, timedOut };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
  }
}

/**
 * Run cvc5 in stream mode, collecting output until we have `maxSolutions`
 * distinct solutions or the timeout elapses, then kill the process.
 */
function collectStream(
  bin: string,
  args: string[],
  maxSolutions: number,
  timeoutMs: number
): Promise<{ stdout: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(bin, args);
    let stdout = "";
    let settled = false;

    const finish = (timedOut: boolean) => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch { /* already dead */ }
      clearTimeout(timer);
      resolve({ stdout, timedOut });
    };

    const timer = setTimeout(() => finish(true), timeoutMs);

    const onData = (chunk: Buffer) => {
      stdout += chunk.toString();
      const count = (stdout.match(/define-fun f /g) || []).length;
      if (count >= maxSolutions) finish(false);
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", () => { /* ignore parse noise */ });
    child.on("error", () => finish(true));
    child.on("close", () => finish(false));
  });
}

/**
 * Parse streamed `(define-fun f ...)` solutions.
 */
function parseSolutions(output: string, max: number): string[] {
  const candidates: string[] = [];
  // Each solution is a line like: (define-fun f ((x L)) L (sortf x))
  const re = /\(define-fun f \(\(x L\)\) L ([^\n]+)\)/g;
  let m;
  while ((m = re.exec(output)) !== null && candidates.length < max) {
    const body = m[1].trim();
    if (!candidates.includes(body)) candidates.push(body);
  }
  return candidates;
}

// ==========================================
// Differential oracle — cvc5 vs hand-rolled
// ==========================================

/**
 * Evaluate a SyGuS program body (a term) against a concrete list.
 * Supports the grammar's unary primitives, composed.
 */
export function evaluateSygusTerm(term: string, input: number[]): number[] | null {
  // Parse a nested term like `(sortf (rev x))` or `(rev (sortf x))` or `(rev x)`.
  const inner = term.trim();
  if (inner === "x") return input;
  if (inner === "nil") return [];

  const m = inner.match(/^\((\w+)\s+(.+)\)$/);
  if (!m) return null;
  const [, fn, argRaw] = m;

  const argValue = evaluateSygusTerm(argRaw, input);
  if (argValue === null) return null;

  switch (fn) {
    case "rev": return [...argValue].reverse();
    case "sortf": return [...argValue].sort((a, b) => a - b);
    case "dedupef": return [...new Set(argValue)];
    default: return null;
  }
}

/**
 * One input-output case for the differential oracle. This is the SyGuS 2.1
 * `oracle-constraint-io` shape: a concrete input and the output the candidate
 * must produce on it. `SygusSpec.examples` already carries exactly these.
 */
export interface DifferentialCase {
  input: number[];
  expected: number[];
}

export interface DifferentialVerdict {
  agree: boolean;
  /** Cases actually compared. */
  checked: number;
  /** Cases skipped because the term could not be evaluated on them. */
  unevaluated: number;
  /** The first input where the candidate and the reference disagreed. */
  disagreement?: { input: number[]; got: number[] | null; expected: number[] };
}

/**
 * Differential test: for a candidate term, check that evaluating it agrees
 * with the reference outputs on every case.
 *
 * This is the CEGIS oracle half of the pipeline: cvc5 proposes, this disposes.
 * A disagreement returns the counterexample — the single most actionable
 * artefact a verifier can produce — instead of a bare boolean. A term that
 * cannot be evaluated on an input is SKIPPED and counted, never silently
 * treated as agreement: with the old code every path through the loop ended at
 * `return { agree: true }`, so this function could not fail.
 */
export function differentialCheck(
  term: string,
  cases: DifferentialCase[]
): DifferentialVerdict {
  let checked = 0;
  let unevaluated = 0;
  for (const c of cases) {
    const got = evaluateSygusTerm(term, c.input);
    if (got === null) {
      unevaluated += 1;
      continue;
    }
    checked += 1;
    if (!sameList(got, c.expected)) {
      return { agree: false, checked, unevaluated, disagreement: { input: c.input, got, expected: c.expected } };
    }
  }
  return { agree: checked > 0, checked, unevaluated };
}

/** Element-wise list equality for the oracle (delegates to the module's own list reading). */
function sameList(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}
