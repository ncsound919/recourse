/**
 * testStrength.ts — is a model-written test suite actually worth trusting?
 *
 * A dreamed model thought ships BOTH its code and the tests that grade it. The
 * sandbox only proves the code passes tests the same model wrote, so a thought
 * with `assert true` — or an assert that never calls the function — verifies
 * perfectly. That is the model marking its own homework.
 *
 * Two cheap, deterministic checks before such a thought may crystallize:
 *   1. static: no tautologies, and the suite calls the code it claims to test;
 *   2. mutation: apply small single-token mutations to the code. A suite worth
 *      anything fails on most of them ("kills" them). A mutant the suite still
 *      passes is behaviour the tests do not pin down.
 *
 * Both are honest, not complete: an equivalent mutant (one that does not change
 * behaviour) survives for a good reason, hence a threshold rather than 100%.
 * The runner is injected so this is testable without the sandbox.
 */

export type SuiteRunner = (code: string, tests: string) => { passed: boolean; testDetails: string[] };

export interface Mutant { id: string; description: string; source: string }

/** Same-length copy of `code` with comment and string/template contents blanked, so operator search cannot hit prose. */
export function maskLiterals(code: string): string {
  const out = code.split('');
  let i = 0;
  const blank = (from: number, to: number) => { for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' '; };
  while (i < code.length) {
    const c = code[i];
    const n = code[i + 1];
    if (c === '/' && n === '/') { const e = code.indexOf('\n', i); const end = e === -1 ? code.length : e; blank(i, end); i = end; continue; }
    if (c === '/' && n === '*') { const e = code.indexOf('*/', i + 2); const end = e === -1 ? code.length : e + 2; blank(i, end); i = end; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < code.length && code[j] !== c) { if (code[j] === '\\') j++; j++; }
      blank(i + 1, Math.min(j, code.length));
      i = j + 1;
      continue;
    }
    i++;
  }
  return out.join('');
}

const OPERATORS: Array<{ re: RegExp; to: string; label: string }> = [
  { re: /===/g, to: '!==', label: '=== → !==' },
  { re: /!==/g, to: '===', label: '!== → ===' },
  // Comparison mutants NEGATE rather than nudge the boundary: `<` → `<=` is very
  // often an equivalent mutant (clamp, min/max), which would punish good tests.
  { re: /<=/g, to: '>', label: '<= → >' },
  { re: />=/g, to: '<', label: '>= → <' },
  { re: /(?<![<>=!])<(?![<=])/g, to: '>=', label: '< → >=' },
  { re: /(?<![<>=!-])>(?![>=])/g, to: '<=', label: '> → <=' },
  { re: /&&/g, to: '||', label: '&& → ||' },
  { re: /\|\|/g, to: '&&', label: '|| → &&' },
  { re: /(?<=[\w)\]] )\+(?= [\w(])/g, to: '-', label: '+ → -' },
  { re: /(?<=[\w)\]] )-(?= [\w(])/g, to: '+', label: '- → +' },
  { re: /(?<=[\w)\]] )\*(?= [\w(])/g, to: '+', label: '* → +' },
  { re: /\breturn true\b/g, to: 'return false', label: 'return true → false' },
  { re: /\breturn false\b/g, to: 'return true', label: 'return false → true' },
];

/** Up to `max` single-site mutants, spread across operators (deterministic order). */
export function generateMutants(code: string, max = 12): Mutant[] {
  const masked = maskLiterals(code);
  const perOp: Mutant[][] = OPERATORS.map((op) => {
    const found: Mutant[] = [];
    for (const m of masked.matchAll(op.re)) {
      const at = m.index!;
      found.push({
        id: `${op.label}@${at}`,
        description: `${op.label} at offset ${at}`,
        source: code.slice(0, at) + op.to + code.slice(at + m[0].length),
      });
    }
    return found;
  });
  // Round-robin so one operator cannot crowd out the rest.
  const out: Mutant[] = [];
  for (let round = 0; out.length < max; round++) {
    let any = false;
    for (const list of perOp) {
      if (round < list.length) { out.push(list[round]); any = true; if (out.length >= max) break; }
    }
    if (!any) break;
  }
  return out;
}

export interface MutationReport { total: number; killed: number; survived: string[]; score: number | null }

export function mutationScore(code: string, tests: string, run: SuiteRunner, max = 12): MutationReport {
  let total = 0;
  let killed = 0;
  const survived: string[] = [];
  for (const m of generateMutants(code, max)) {
    let r: ReturnType<SuiteRunner>;
    try { r = run(m.source, tests); } catch { continue; }
    // A mutant that does not even compile says nothing about the tests.
    if (r.testDetails.some((d) => d.startsWith('[COMPILATION ERROR]'))) continue;
    total += 1;
    if (!r.passed) killed += 1; else survived.push(m.description);
  }
  return { total, killed, survived, score: total === 0 ? null : killed / total };
}

const TAUTOLOGY = /^\s*assert\s*\(?\s*(true|1|!0|!!1|'[^']*'|"[^"]*"|(\d+)\s*===?\s*\2)\s*\)?\s*[;,]?\s*$/;

/** Reasons the suite is unfit regardless of the code. Empty = passed the static screen. */
export function staticTestIssues(code: string, tests: string): string[] {
  const issues: string[] = [];
  const lines = tests.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^assert\b/.test(l));
  if (lines.length === 0) { issues.push('no assert lines'); return issues; }
  const real = lines.filter((l) => !TAUTOLOGY.test(l));
  if (real.length === 0) issues.push('every assert is a tautology');
  const names = [...new Set([...code.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))];
  if (names.length && !names.some((n) => new RegExp(`\\b${n}\\s*\\(`).test(tests))) {
    issues.push(`tests never call the exported function (${names.join(', ')})`);
  }
  return issues;
}

export interface TestStrength {
  ok: boolean;
  reasons: string[];
  mutation: MutationReport | null;
}

/** Minimum fraction of mutants a trustworthy suite must kill (when enough mutants exist). */
export const MIN_MUTATION_SCORE = 0.5;
const MIN_MUTANTS_TO_JUDGE = 2;

export function assessModelTests(code: string, tests: string, run: SuiteRunner): TestStrength {
  const reasons = staticTestIssues(code, tests);
  if (reasons.length) return { ok: false, reasons, mutation: null };
  const mutation = mutationScore(code, tests, run);
  if (mutation.total >= MIN_MUTANTS_TO_JUDGE && (mutation.score ?? 0) < MIN_MUTATION_SCORE) {
    return {
      ok: false,
      reasons: [`weak tests: killed ${mutation.killed}/${mutation.total} mutants (need ≥ ${Math.round(MIN_MUTATION_SCORE * 100)}%); survived: ${mutation.survived.slice(0, 3).join('; ')}`],
      mutation,
    };
  }
  return { ok: true, reasons: [], mutation };
}
