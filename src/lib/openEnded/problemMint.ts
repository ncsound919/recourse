/**
 * Model-driven problem minting (closes the "problem generation still needs a
 * model — follow-up" gap noted in `problemGenerator.ts`).
 *
 * `problemFromVerifiedTool` can only *re-express* an existing capability as a
 * problem. This module mints genuinely new problems — a task statement plus a
 * machine-checkable acceptance test — and, critically, proves each acceptance
 * test is SATISFIABLE before admitting it: the model must also supply a
 * reference implementation, and that reference must pass its own acceptance
 * test in the real sandbox. A problem whose own reference fails is rejected,
 * never archived. The reference is kept as a hidden oracle so the archive can
 * prove solvability without the solver ever seeing the answer.
 *
 * Honesty contract:
 *  - Pure parsing/validation is separated from the model call so it is fully
 *    testable without a network.
 *  - No problem is admitted on trust: `verify(referenceSource, acceptanceTest)`
 *    must return passed. A problem with no verified reference is `rejected`.
 *  - The acceptance test is scanned for disallowed host access (require/import/
 *    process/eval); anything that could escape the sandbox is rejected.
 */

import { canonicalToolKey } from './gates.js';

export const PROBLEM_DOMAINS = [
  'coding',
  'math',
  'biotech',
  'systemic',
  'neuro_symbolic',
  'cyber_defense',
  'quantum_sim',
] as const;

export type ProblemDomain = (typeof PROBLEM_DOMAINS)[number];

export interface ProblemDraft {
  title: string;
  domain: string;
  statement: string;
  /** required export name the solver must define */
  functionName: string;
  /** real JS suite (asserts) the solver's implementation must pass */
  acceptanceTest: string;
  /** hidden reference implementation — the oracle, never shown to the solver */
  referenceSource: string;
  /** sample argument lists used to seed the property gate's input shapes. */
  vectors?: unknown[];
}

export interface MintedProblem {
  id: string;
  domain: string;
  title: string;
  statement: string;
  functionName: string;
  acceptanceTest: string;
  /** hidden oracle: a reference that provably passes `acceptanceTest`. */
  referenceSource: string;
  /** sample arguments, so the property gate generates correctly-shaped inputs. */
  vectors?: unknown[];
  hints: { requiredPrimitives: number; acceptanceLines: number; dataDims: number };
  createdAt?: number;
}

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const FORBIDDEN_ACCEPTANCE = /\b(require\s*\(|import\s|process\.|globalThis|eval\s*\(|Function\s*\(|child_process|fs\.|fetch\s*\()/;

/** Strip Markdown fences a model may wrap JSON in. */
export function stripFences(text: string): string {
  return String(text ?? '')
    .replace(/```(?:json|javascript|js)?/gi, '')
    .replace(/```/g, '')
    .trim();
}

/**
 * Parse model JSON, applying bounded repairs only if strict parsing fails.
 * Small local models routinely emit single-quoted strings, trailing commas, or
 * comments; rejecting those outright would make the local-first loop useless.
 * Never throws and never invents structure — returns null when it cannot parse.
 */
export function lenientJsonParse(text: string): unknown | null {
  const raw = stripFences(text);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { /* attempt repair */ }
  let t = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')          // block comments (outside strings, best-effort)
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')       // line comments, but not `://`
    .replace(/,\s*([}\]])/g, '$1');             // trailing commas
  try { return JSON.parse(t); } catch { /* attempt quote repair */ }
  // Single-quoted strings -> double-quoted (escaping any inner double quotes).
  t = t.replace(/'((?:\\.|[^'\\])*)'/g, (_m, inner: string) => `"${inner.replace(/"/g, '\\"')}"`);
  try { return JSON.parse(t); } catch { return null; }
}

/** Prompt pair for the problem drafter. Deterministic; no clock. */
export function problemDraftPrompt(context: string, count: number, knownTitles: string[] = []): { system: string; user: string } {
  const system =
    'You design self-contained programming problems with machine-checkable tests. ' +
    'Return ONLY JSON (no prose, no Markdown). Each problem must be solvable by a single ' +
    'pure JavaScript function with no imports or host globals.';
  const avoid = knownTitles.length
    ? `\nDo NOT repeat or lightly reword these existing problems:\n${knownTitles.slice(0, 30).map((t) => `- ${t}`).join('\n')}\n`
    : '';
  const user =
    `Design ${count} NEW programming problem(s) in the spirit of: ${context}\n${avoid}\n` +
    'Return JSON of the form {"problems":[{"title":string,"domain":string,' +
    '"statement":string,"functionName":string,"acceptanceTest":string,"referenceSource":string,' +
    '"vectors":[[arg1,arg2,...]]}]}. ' +
    'Rules:\n' +
    '- domain is one of: ' + PROBLEM_DOMAINS.join(', ') + '.\n' +
    '- functionName is a JavaScript identifier.\n' +
    '- acceptanceTest is plain JS that uses `assert` (e.g. `assert f(2) === 3;`) and references functionName. No imports, require, process, eval, fs, or fetch.\n' +
    '- referenceSource defines and exports functionName (`export function ...`) and MUST pass acceptanceTest exactly.\n' +
    '- vectors is 2-3 sample argument lists (JSON values) for functionName, matching its real parameter shapes (arrays, strings, objects, numbers as appropriate).\n' +
    '- Prefer problems with genuine edge cases (empty inputs, bounds, overflow, ordering).';
  return { system, user };
}

interface ParseResult { ok: boolean; drafts?: ProblemDraft[]; error?: string }

/** Strictly parse a drafter response into one or more problem drafts. Pure. */
export function parseProblemDrafts(raw: string): ParseResult {
  const text = stripFences(raw);
  if (!text) return { ok: false, error: 'empty model response' };
  const parsed: unknown = lenientJsonParse(raw);
  if (parsed === null) return { ok: false, error: 'not valid JSON (even after lenient repair)' };
  const arr: unknown[] = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { problems?: unknown[] }).problems)
      ? ((parsed as { problems: unknown[] }).problems)
      : [];
  if (!arr.length) return { ok: false, error: 'no problems array in response' };

  const drafts: ProblemDraft[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const title = typeof o.title === 'string' ? o.title.trim() : '';
    const domainRaw = typeof o.domain === 'string' ? o.domain.trim() : '';
    const statement = typeof o.statement === 'string' ? o.statement.trim() : '';
    const functionName = typeof o.functionName === 'string' ? o.functionName.trim() : '';
    const acceptanceTest = typeof o.acceptanceTest === 'string' ? o.acceptanceTest.trim() : '';
    const referenceSource = typeof o.referenceSource === 'string' ? o.referenceSource.trim() : '';
    const vectors = Array.isArray(o.vectors) ? o.vectors : undefined;
    if (!title || !statement || !functionName || !acceptanceTest || !referenceSource) continue;
    if (!IDENT.test(functionName)) continue;
    if (!(PROBLEM_DOMAINS as readonly string[]).includes(domainRaw)) continue;
    if (!acceptanceTest.includes(functionName)) continue;
    drafts.push({ title, domain: domainRaw, statement, functionName, acceptanceTest, referenceSource, ...(vectors ? { vectors } : {}) });
  }
  if (!drafts.length) return { ok: false, error: 'no well-formed drafts (missing/!invalid fields)' };
  return { ok: true, drafts };
}

export interface MintVerifyResult {
  passed: boolean;
  testDetails?: string[];
}

export interface MintInput {
  /** Thematic context handed to the drafter (e.g. a dream hypothesis). */
  context: string;
  count: number;
  /** Injected model seam — returns raw text. */
  draft: (system: string, user: string) => Promise<string>;
  /** Injected real sandbox verifier (source, suite) -> pass/fail. */
  verify: (source: string, suite: string) => MintVerifyResult;
  knownTitles?: string[];
}

export interface MintedRejection {
  reason: string;
  title?: string;
  detail?: string;
}

export interface MintResult {
  minted: MintedProblem[];
  rejected: MintedRejection[];
  rawError?: string;
}

export function problemIdFor(domain: string, functionName: string): string {
  return `mint:${domain}:${canonicalToolKey(functionName)}`;
}

/** Estimate structural complexity for the difficulty heuristic. */
function hintsFor(functionName: string, acceptanceTest: string, referenceSource: string): MintedProblem['hints'] {
  return {
    requiredPrimitives: Math.max(1, Math.round(referenceSource.split('\n').length / 6)),
    acceptanceLines: acceptanceTest.split('\n').filter(Boolean).length,
    dataDims: Math.max(1, functionName.includes('arr') || referenceSource.includes('Array') ? 2 : 1),
  };
}

/**
 * Mint problems from the model, admitting only those whose reference
 * implementation passes its own acceptance test in the real sandbox. Returns
 * the admitted problems and an honest list of rejections.
 */
export async function mintProblems(input: MintInput): Promise<MintResult> {
  const knownTitles = input.knownTitles ?? [];
  const { system, user } = problemDraftPrompt(input.context, Math.max(1, input.count), knownTitles);
  let raw: string;
  try {
    raw = await input.draft(system, user);
  } catch (err) {
    return { minted: [], rejected: [], rawError: err instanceof Error ? err.message : String(err) };
  }

  const parsed = parseProblemDrafts(raw);
  if (!parsed.ok) return { minted: [], rejected: [{ reason: 'parse_error', detail: parsed.error }], rawError: parsed.error };

  const minted: MintedProblem[] = [];
  const rejected: MintedRejection[] = [];
  const seen = new Set<string>(knownTitles.map((t) => canonicalToolKey(t)));

  for (const d of parsed.drafts ?? []) {
    const canon = canonicalToolKey(d.title);
    if (seen.has(canon)) {
      rejected.push({ reason: 'duplicate_title', title: d.title });
      continue;
    }
    if (FORBIDDEN_ACCEPTANCE.test(d.acceptanceTest) || FORBIDDEN_ACCEPTANCE.test(d.referenceSource)) {
      rejected.push({ reason: 'unsafe_acceptance_test', title: d.title });
      continue;
    }
    let check: MintVerifyResult;
    try {
      check = input.verify(d.referenceSource, d.acceptanceTest);
    } catch (err) {
      rejected.push({ reason: 'verify_threw', title: d.title, detail: err instanceof Error ? err.message : String(err) });
      continue;
    }
    if (!check.passed) {
      rejected.push({
        reason: 'reference_failed_acceptance',
        title: d.title,
        detail: (check.testDetails ?? []).filter((x) => x.startsWith('[FAIL') || x.startsWith('[COMPILATION')).slice(0, 2).join('; '),
      });
      continue;
    }
    seen.add(canon);
    minted.push({
      id: problemIdFor(d.domain, d.functionName),
      domain: d.domain,
      title: d.title,
      statement: d.statement,
      functionName: d.functionName,
      acceptanceTest: d.acceptanceTest,
      referenceSource: d.referenceSource,
      ...(d.vectors ? { vectors: d.vectors } : {}),
      hints: hintsFor(d.functionName, d.acceptanceTest, d.referenceSource),
      createdAt: Date.now(),
    });
  }
  return { minted, rejected };
}

/**
 * Re-prove that a stored problem is still solvable by re-running its hidden
 * reference against its acceptance test. Used before handing the problem to a
 * solver so a corrupted suite never sends the loop chasing an impossible task.
 */
export function problemIsSolvable(
  problem: Pick<MintedProblem, 'referenceSource' | 'acceptanceTest'>,
  verify: (source: string, suite: string) => MintVerifyResult,
): boolean {
  if (!problem.referenceSource) return false;
  return verify(problem.referenceSource, problem.acceptanceTest).passed;
}
