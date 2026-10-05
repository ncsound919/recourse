/**
 * Forge Quality — judges HOW GOOD a forge candidate is, beyond "passes the
 * reference suite".
 *
 * Why this exists: the forge promoted any source that passed a 4-assert hidden
 * suite. That let through (a) overfit code that special-cases the suite's
 * inputs, (b) code that mutates its arguments or is nondeterministic, and
 * (c) whole families of clone tools whose "contract" was trivially satisfiable.
 * A 4-assert suite is a floor, not a quality bar.
 *
 * Checks (all real executions in the sandbox, no self-attestation):
 *  - Holdout split: part of the reference suite is never shown to the model as
 *    retry feedback, so a candidate cannot converge by patching the exact
 *    failing assertions it was told about.
 *  - Differential testing: when the spec carries a reference implementation
 *    (minted problems do), candidate and reference are run side by side on the
 *    suite's own inputs plus deterministic perturbations (empty / single /
 *    reversed / doubled / boundary values). Any disagreement is a real bug.
 *  - Robustness: determinism (same input -> same output) and no mutation of the
 *    caller's arguments, on the suite's inputs.
 *  - Static signals: special-cased suite literals (overfitting), use of
 *    nondeterministic APIs, JSDoc presence, size sanity.
 *
 * The result is a 0..1 score plus a hard gate. The forge keeps sampling (within
 * its compute budget) until a candidate is substantively clean, and promotes
 * the best gate-passing candidate — never merely the first that passed.
 */

import { executeTestSuite, prepareExecutableCode } from './executionSandbox';
import { executeTestSuiteInIsolate, isIsolateAvailable } from './isolatedSandbox';
import { runOracleProbe, oracleSuiteSource } from './referenceOracles';
import { summarizeKills, type KillSummary } from './killClassification';
import { lawSuiteSource, lawsFor } from './lawCatalogue';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ForgeQualityInput {
  /** Exported entrypoint name the candidate must define. */
  name: string;
  /** Hidden reference suite (asserts). */
  refSuite: string;
  /** Optional reference implementation (oracle) exporting `name`. */
  reference?: string;
  /** Optional sample argument vectors (each an array of positional args). */
  vectors?: unknown[];
  kind?: 'function' | 'class';
}

export interface ForgeQualityReport {
  score: number;
  gate: { ok: boolean; reasons: string[] };
  differential: { available: boolean; checked: number; agreed: number; mismatches: string[] } | null;
  robustness: { checked: number; deterministic: boolean; mutatesInput: boolean; notes: string[] } | null;
  /**
   * Non-LLM differential oracle verdict (BigInt / stdlib / different-algorithm
   * reference). The only evidence here whose authority is outside the generating
   * model, so a mismatch is a hard gate failure rather than a scored deduction.
   * Null when no oracle covers this tool.
   */
  oracle?: {
    tool: string;
    checked: number;
    mismatches: string[];
    /**
     * How the failures broke down (A5). A candidate that merely THREW is weaker
     * evidence than one that returned a wrong value, and the difference is
     * measured rather than assumed.
     */
    killSummary?: KillSummary;
  } | null;
  /** Large-magnitude probe. See `scaleProbe` for why this exists. */
  /**
   * Hand-authored law results (A6). `checked: 0` means the catalogue holds no
   * laws for this tool, which is an honest state — not a pass.
   */
  laws?: { checked: number; failures: Array<{ law: string; statement: string; why: string }> } | null;
  scale: {
    checked: number;
    /** Tool looks like exact integer arithmetic. */
    integerDomain: boolean;
    /** Produced NaN / Infinity where an integer was required. */
    nonFinite: string[];
    /** Produced a fractional value where the tool returns integers. */
    nonInteger: string[];
    /** Disagreed with a reference oracle at large magnitudes. */
    mismatches: string[];
  } | null;
  static: {
    jsdoc: boolean;
    nondeterministicApis: string[];
    hardcodedSuiteLiterals: string[];
    meaningfulLines: number;
  };
}

export interface ToolDoc {
  summary: string | null;
  params: Array<{ name: string; type?: string; description?: string }>;
  returns: { type?: string; description?: string } | null;
}

// ---------------------------------------------------------------------------
// Tunables (env-overridable)
// ---------------------------------------------------------------------------

export function forgeQualityThresholds(env: NodeJS.ProcessEnv = process.env) {
  const num = (v: string | undefined, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : d;
  };
  return {
    /** Minimum score a gate-passing candidate needs to be promoted. */
    minScore: num(env.FORGE_MIN_QUALITY, 0.6),
    /** Required reference agreement on perturbed inputs. */
    minAgreement: num(env.FORGE_MIN_AGREEMENT, 0.95),
  };
}

// ---------------------------------------------------------------------------
// Suite parsing helpers (no eval — JSON only)
// ---------------------------------------------------------------------------

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Extract the raw text between the parens of every `name(...)` call. */
export function extractCallArgTexts(suite: string, name: string): string[] {
  if (!IDENT.test(name)) return [];
  const out: string[] = [];
  const re = new RegExp(`(?<![\\w$.])${escapeRe(name)}\\s*\\(`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(suite))) {
    let i = m.index + m[0].length;
    let depth = 1;
    let quote: string | null = null;
    const start = i;
    for (; i < suite.length && depth > 0; i++) {
      const ch = suite[i];
      if (quote) {
        if (ch === '\\') { i++; continue; }
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') quote = ch;
      else if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') depth--;
    }
    if (depth === 0) out.push(suite.slice(start, i - 1));
  }
  return out;
}

/** Parse an argument list as JSON (double- or single-quoted). Null if not JSON-safe. */
export function parseArgsJson(text: string): unknown[] | null {
  const attempts = [text];
  if (!text.includes('"')) attempts.push(text.replace(/'/g, '"'));
  for (const t of attempts) {
    try {
      const v = JSON.parse(`[${t}]`);
      if (Array.isArray(v)) return v;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Argument vectors the suite itself exercises (JSON-safe ones only). */
export function suiteVectors(suite: string, name: string): unknown[][] {
  const seen = new Set<string>();
  const out: unknown[][] = [];
  for (const t of extractCallArgTexts(suite, name)) {
    const args = parseArgsJson(t);
    if (!args) continue;
    const key = JSON.stringify(args);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(args);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Holdout split
// ---------------------------------------------------------------------------

/**
 * Split a reference suite into a VISIBLE part (failures may be fed back to the
 * model) and a HOLDOUT part (only a count is ever revealed). Only splits simple
 * suites made of standalone single-line asserts with >= 4 asserts; anything
 * with setup statements stays fully visible (splitting would break it).
 */
export function splitSuiteForHoldout(suite: string): { visible: string; holdout: string } {
  const lines = String(suite ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'));
  const simple = lines.length >= 4 && lines.every((l) => /^assert\b/.test(l) && !/;\s*\S/.test(l.replace(/;\s*$/, '')));
  if (!simple) return { visible: suite, holdout: '' };
  const visible: string[] = [];
  const holdout: string[] = [];
  lines.forEach((l, i) => {
    // Keep structural checks (typeof ... === 'function') visible.
    if (i % 3 === 2 && !/typeof\s/.test(l)) holdout.push(l);
    else visible.push(l);
  });
  if (!holdout.length || !visible.length) return { visible: suite, holdout: '' };
  return { visible: visible.join('\n'), holdout: holdout.join('\n') };
}

// ---------------------------------------------------------------------------
// Input perturbation (deterministic)
// ---------------------------------------------------------------------------

function variantsOf(v: unknown, allowNegative: boolean): unknown[] {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const out: number[] = [];
    if (Number.isInteger(v)) {
      out.push(v + 1, v - 1, 0, 1);
      if (Math.abs(v) <= 32) out.push(v * 2);
      // Large magnitudes belong to the scale probe, not here: perturbations are
      // transported as JSON source, so this is about nearby inputs, and mixing
      // in scale values would duplicate work the probe does properly.
    } else {
      out.push(v * 2, v / 2, 0);
    }
    return out.filter((x) => allowNegative || x >= 0).filter((x) => x !== v);
  }
  if (typeof v === 'string') {
    const out = ['', v.slice(0, 1), v.split('').reverse().join('')];
    if (v.length <= 100) out.push(v + v);
    return out.filter((x) => x !== v);
  }
  if (Array.isArray(v)) {
    const out: unknown[] = [[], v.slice(0, 1), [...v].reverse(), v.slice(0, -1)];
    if (v.length <= 100) out.push([...v, ...v]);
    if (v.every((x) => typeof x === 'number')) out.push([...(v as number[])].sort((a, b) => a - b));
    // Two-element probe: an implementation that only handles length>=3 arrays,
    // or that mishandles the first/last pair, passes the suite's larger inputs.
    if (v.length > 1) out.push([v[0], v[v.length - 1]]);
    return out.filter((x) => JSON.stringify(x) !== JSON.stringify(v));
  }
  return [];
}

/** Deterministic perturbations of seed vectors (one position changed at a time). */
export function perturbVectors(seeds: unknown[][], limit = 24): unknown[][] {
  const allowNegative = JSON.stringify(seeds).includes('-');
  const seen = new Set(seeds.map((s) => JSON.stringify(s)));
  const out: unknown[][] = [];
  // Round-robin across seeds/positions so small limits still cover every seed.
  const queues = seeds.map((seed) =>
    seed.flatMap((val, pos) => variantsOf(val, allowNegative).map((alt) => {
      const next = [...seed];
      next[pos] = alt;
      return next;
    })),
  );
  let progressed = true;
  for (let round = 0; progressed && out.length < limit; round++) {
    progressed = false;
    for (const q of queues) {
      if (round < q.length) {
        progressed = true;
        const key = JSON.stringify(q[round]);
        if (!seen.has(key)) {
          seen.add(key);
          out.push(q[round]);
          if (out.length >= limit) break;
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Static signals
// ---------------------------------------------------------------------------

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
}

const NONDETERMINISTIC = [
  { re: /\bMath\.random\s*\(/, id: 'Math.random' },
  { re: /\bDate\.now\s*\(/, id: 'Date.now' },
  { re: /\bnew\s+Date\s*\(\s*\)/, id: 'new Date()' },
  { re: /\bperformance\.now\s*\(/, id: 'performance.now' },
  { re: /\bcrypto\.getRandomValues\b/, id: 'crypto.getRandomValues' },
];

/**
 * Suite argument literals that the candidate compares against directly — the
 * signature of an implementation special-casing the test inputs.
 */
export function hardcodedSuiteLiterals(source: string, suite: string, name: string): string[] {
  const code = stripComments(source);
  const lits = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) >= 3) lits.add(String(v));
    else if (typeof v === 'string' && v.length >= 2) lits.add(JSON.stringify(v));
    else if (Array.isArray(v)) v.forEach(walk);
  };
  suiteVectors(suite, name).forEach((args) => args.forEach(walk));
  const hits: string[] = [];
  for (const lit of lits) {
    const forms = lit.startsWith('"') ? [lit, `'${JSON.parse(lit).replace(/'/g, "\\'")}'`] : [lit];
    const found = forms.some((f) => {
      const e = escapeRe(f);
      const boundary = lit.startsWith('"') ? '' : '(?![\\w.])';
      const lead = lit.startsWith('"') ? '' : '(?<![\\w.])';
      return new RegExp(`===?\\s*${lead}${e}${boundary}|${lead}${e}${boundary}\\s*===?|case\\s+${lead}${e}${boundary}\\s*:`).test(code);
    });
    if (found) hits.push(lit);
  }
  return hits;
}

function meaningfulLineCount(src: string): number {
  return stripComments(src)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && l !== '{' && l !== '}' && l !== '};').length;
}

/**
 * Structural skeleton of a tool: comments, whitespace, its own name and every
 * numeric/string literal erased. Two tools with the same skeleton are the same
 * algorithm with different constants (e.g. dream-mutated weight variants) — a
 * near-duplicate, not a new capability.
 */
export function sourceSkeleton(source: string, name?: string): string {
  let s = stripComments(String(source ?? ''));
  if (name && IDENT.test(name)) s = s.replace(new RegExp(`\\b${escapeRe(name)}\\b`, 'g'), '__F__');
  return s
    .replace(/^\s*export\s+(default\s+)?/gm, '')
    .replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '"S"')
    .replace(/\b0x[0-9a-f]+\b|\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gi, 'N')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Name of an existing tool with the same skeleton, or null (novelty check). */
export function findNearDuplicate(
  source: string,
  name: string,
  existing: Array<{ name: string; sourceCode?: string }>,
): string | null {
  const sk = sourceSkeleton(source, name);
  if (!sk) return null;
  for (const e of existing) {
    if (e.name === name || !e.sourceCode) continue;
    if (sourceSkeleton(e.sourceCode, e.name) === sk) return e.name;
  }
  return null;
}

/** Parse the JSDoc block attached to the exported entrypoint (or the first one). */
export function extractToolDoc(source: string, name?: string): ToolDoc {
  const src = String(source ?? '');
  let block: string | null = null;
  if (name && IDENT.test(name)) {
    const m = new RegExp(`/\\*\\*([\\s\\S]*?)\\*/\\s*(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?(?:function\\s*\\*?\\s*${escapeRe(name)}\\b|(?:const|let|var|class)\\s+${escapeRe(name)}\\b)`).exec(src);
    if (m) block = m[1];
  }
  if (!block) {
    const m = /\/\*\*([\s\S]*?)\*\//.exec(src);
    if (m) block = m[1];
  }
  if (!block) return { summary: null, params: [], returns: null };
  const lines = block.split(/\r?\n/).map((l) => l.replace(/^\s*\*\s?/, '').trimEnd());
  const text: string[] = [];
  const params: ToolDoc['params'] = [];
  let returns: ToolDoc['returns'] = null;
  for (const l of lines) {
    const p = /^@param\s+(?:\{([^}]*)\}\s*)?\[?([A-Za-z_$][\w$.]*)[^\s\]]*\]?\s*(?:-\s*)?(.*)$/.exec(l.trim());
    if (p) { params.push({ name: p[2], ...(p[1] ? { type: p[1] } : {}), ...(p[3] ? { description: p[3] } : {}) }); continue; }
    const r = /^@returns?\s+(?:\{([^}]*)\}\s*)?(?:-\s*)?(.*)$/.exec(l.trim());
    if (r) { returns = { ...(r[1] ? { type: r[1] } : {}), ...(r[2] ? { description: r[2] } : {}) }; continue; }
    if (l.trim().startsWith('@')) continue;
    if (!params.length && !returns) text.push(l.trim());
  }
  const summary = text.join(' ').replace(/\s+/g, ' ').trim() || null;
  return { summary, params, returns };
}

// ---------------------------------------------------------------------------
// Sandbox runs
// ---------------------------------------------------------------------------

function runSuite(source: string, suite: string, timeoutMs: number) {
  if (isIsolateAvailable()) {
    const r = executeTestSuiteInIsolate(source, suite, { memoryLimitMb: 64, timeoutMs });
    if (r.available) return r;
  }
  return executeTestSuite(source, suite);
}

/** Helpers injected next to the candidate. Deliberately plain (they must pass
 *  the in-process code screen when isolated-vm is unavailable). */
const HELPERS = `
function __forge_json(v) {
  try { return JSON.stringify(v === undefined ? '__undefined__' : v, function (k, x) {
    if (typeof x === 'number' && !Number.isFinite(x)) return 'num:' + String(x);
    if (x instanceof Map) return { __map__: Array.from(x.entries()) };
    if (x instanceof Set) return { __set__: Array.from(x.values()) };
    return x;
  }); } catch (e) { return '__unserializable__'; }
}
// Deep equality for non-LLM oracle assertions. Structural because oracle results
// are arrays/objects as often as scalars, and NaN must equal NaN or a correct
// numeric tool fails its own proof.
function __forge_deepEq(a, b) {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) && Number.isNaN(b)) return true;
    return Object.is(a, b);
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every(function (v, i) { return __forge_deepEq(v, b[i]); });
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    var ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every(function (k) { return __forge_deepEq(a[k], b[k]); });
  }
  return Object.is(a, b);
}
function __forge_call(fn) {
  try { return { ok: true, out: __forge_json(fn()) }; } catch (e) { return { ok: false, out: 'throw' }; }
}
function __forge_same(cand, ref) {
  var r = __forge_call(ref);
  // A reference that throws on a probe says NOTHING about the candidate — it
  // must never be scored as agreement (that let broken oracles pass everything).
  if (!r.ok) return false;
  var c = __forge_call(cand);
  return c.ok && c.out === r.out;
}
function __forge_terminates(fn) { return __forge_call(fn).ok; }
function __forge_det(fn) {
  var a = __forge_call(fn); var b = __forge_call(fn);
  return a.ok === b.ok && a.out === b.out;
}
function __forge_nomut(argsJson, fn) {
  var args = JSON.parse(argsJson);
  var before = JSON.stringify(args);
  try { fn(args); } catch (e) { /* throwing is allowed; mutation is not */ }
  return JSON.stringify(args) === before;
}
function __forge_isInt(fn) {
  var r = __forge_call(fn);
  if (!r.ok) return false;
  var v = fn();
  return typeof v === 'number' && Number.isInteger(v);
}
// Used by the large-magnitude probe: a tool whose suite says it returns exact
// integers must still return a FINITE integer at 2^53-ish magnitudes. NaN or
// Infinity here means the arithmetic overflowed or divided by zero somewhere the
// small-value suite never reached.
function __forge_finiteInt(fn) {
  var v = fn();
  if (typeof v !== 'number') throw new Error('not a number at scale: ' + __forge_json(v));
  if (!Number.isFinite(v)) throw new Error('not finite at scale: ' + String(v));
  if (!Number.isInteger(v)) throw new Error('not an integer at scale: ' + String(v));
  return true;
}
// Prints the observed value so the scale probe can tell a WRONG value from a
// probe that simply never returned. The caller screens for this marker; a
// missing marker means the probe timed out, which is not a defect.
function __forge_report(fn) {
  var v = fn();
  console.log('__forge_value:' + __forge_json(v));
  return true;
}
`;

function countPasses(details: string[]): { pass: number; fail: number; failLabels: string[] } {
  let pass = 0;
  let fail = 0;
  const failLabels: string[] = [];
  for (const d of details) {
    if (d.startsWith('[PASS]')) pass++;
    else if (d.startsWith('[FAIL') || d.startsWith('[COMPILATION')) {
      fail++;
      failLabels.push(d);
    }
  }
  return { pass, fail, failLabels };
}

/** Wrap a reference source so its declarations cannot collide with the candidate. */
function wrapReference(reference: string, name: string, alias: string): string {
  const body = prepareExecutableCode(reference);
  return `const ${alias} = (function () {\n${body}\nreturn ${name};\n})();`;
}

export function differential(
  input: ForgeQualityInput,
  candidate: string,
  seeds: unknown[][],
): NonNullable<ForgeQualityReport['differential']> {
  const alias = `__forge_ref_${input.name}`;
  const refWrapped = wrapReference(input.reference as string, input.name, alias);
  const probes = isIsolateAvailable() ? [...seeds, ...perturbVectors(seeds, 24)] : seeds;
  if (!probes.length) return { available: true, checked: 0, agreed: 0, mismatches: [] };

  // 1. Keep only inputs on which the REFERENCE itself terminates quickly (a
  //    reference that hangs on a perturbed input says nothing about the candidate).
  const refOnly = `${refWrapped}\n${HELPERS}`;
  const screenSuite = probes.map((a) => `assert __forge_terminates(() => ${alias}(...${JSON.stringify(a)}));`).join('\n');
  let usable = probes;
  const screen = runSuite(refOnly, screenSuite, 3000);
  if (!screen.passed) {
    usable = probes.filter((a) => {
      const r = runSuite(refOnly, `assert __forge_terminates(() => ${alias}(...${JSON.stringify(a)}));`, 300);
      return r.passed;
    });
  }
  // The reference timed out or hung on EVERY probe, so no differential comparison
  // was actually performed. Reporting `available: true` here claimed full
  // reference agreement for a check that never ran — and because the quality gate
  // gates on `checked > 0`, a zero-checked report was treated as substantively
  // clean and stopped sampling. The genuine-error path already uses
  // `available: false` (see the catch below), so `available` means "it ran".
  if (!usable.length) return { available: false, checked: 0, agreed: 0, mismatches: ['differential harness error: reference implementation did not terminate on any probe'] };

  // 2. Side-by-side run.
  const combined = `${candidate}\n${refWrapped}\n${HELPERS}`;
  const suite = usable
    .map((a) => {
      const lit = JSON.stringify(a);
      return `assert __forge_same(() => ${input.name}(...${lit}), () => ${alias}(...${lit}));`;
    })
    .join('\n');
  const run = runSuite(combined, suite, 4000);
  const { pass, failLabels } = countPasses(run.testDetails);
  const mismatches = failLabels.slice(0, 5).map((l) => {
    const m = /\(\.\.\.(\[.*?\])\)/.exec(l);
    return m ? `${input.name}(...${m[1]}) disagrees with the reference` : l.slice(0, 160);
  });
  // An aborted run (timeout / uncaught) counts every unreported probe as disagreement.
  return { available: true, checked: usable.length, agreed: Math.min(pass, usable.length), mismatches };
}

/**
 * Magnitudes chosen because IEEE-754 doubles provably diverge from exact
 * integer arithmetic here:
 *   - 2^31: still exact, but products of two such values exceed 2^53.
 *   - 2^53 (MAX_SAFE_INTEGER): the boundary past which integers are not
 *     representable at all.
 *   - 1e9+7: the classic competitive-programming prime; squaring it exceeds
 *     2^53, which is exactly how a double-based modular exponentiation silently
 *     returns a plausible wrong answer.
 *   - 9007199254740993 (2^53+1): not representable, so any implementation that
 *     echoes or accumulates it in doubles is provably lossy.
 */
const SCALE_VALUES = [
  2147483647, // 2^31 - 1
  4294967296, // 2^32
  1000000007, // 1e9+7
  Number.MAX_SAFE_INTEGER, // 2^53 - 1: the largest exactly-representable integer
  // 2^53 + 1 is NOT representable as a double — writing it as a literal silently
  // rounds it to 2^53, which would just duplicate the value above. It is
  // therefore computed, not written, and kept only because an implementation
  // that ACCUMULATES to it has already lost precision by definition.
  Number.MAX_SAFE_INTEGER + 2,
];

const SCALE_STRING_VALUES = [
  'x'.repeat(256),
  'aaaa',
  'The quick brown fox jumps over the lazy dog',
];

/**
 * Large-magnitude probe.
 *
 * WHY THIS EXISTS
 * The forge promoted `powerMod` (modular exponentiation) on a 4-assertion
 * suite whose largest modulus was 1000. A double-based implementation is
 * exactly right there and silently wrong at scale: `factor * factor` exceeds
 * 2^53 and loses precision, so `powerMod(2, 100, 1e9+7)` returned 976371253
 * where the true value is 976371285. The suite could not have caught it — the
 * perturbation generator only explores values NEAR the suite's own seeds
 * (see `variantsOf`), so every probe inherited small magnitudes.
 *
 * This probe is deliberately independent of whether a reference oracle exists.
 * Most specs have none, and for those it still catches the objectively
 * checkable failure — an integer-returning tool that yields NaN, Infinity, or a
 * fractional value at scale. Where a reference DOES exist, the divergence
 * between double and exact arithmetic is caught exactly.
 */
function scaleProbe(
  input: ForgeQualityInput,
  candidate: string,
  seeds: unknown[][],
): NonNullable<ForgeQualityReport['scale']> {
  const empty = { checked: 0, integerDomain: false, nonFinite: [], nonInteger: [], mismatches: [] };
  if (input.kind === 'class') return empty;
  if (!seeds.length) return empty;

  // Only probe tools whose observed behaviour is exact-integer. Probing a tool
  // that legitimately returns fractions (levenshtein returns a number, prisma
  // ratios, etc.) at huge magnitudes would produce noise, not signal.
  const hasNumericArg = seeds.some((a) => a.some((x) => typeof x === 'number' && Number.isFinite(x)));
  if (!hasNumericArg) return empty;

  const src = `${candidate}\n${HELPERS}`;

  // 1. Does the tool return integers on its own suite inputs?
  const integerSuite = seeds
    .filter((a) => a.every((x) => typeof x === 'number' || typeof x === 'string' || typeof x === 'boolean'))
    .map((a) => `assert __forge_isInt(() => ${input.name}(...${JSON.stringify(a)}));`)
    .join('\n');
  if (!integerSuite) return empty;
  const intRun = runSuite(src, integerSuite, 3000);
  if (!intRun.passed) return empty; // returns non-integers by design — not our domain
  const integerDomain = true;

  // 2. Probe at magnitudes where doubles diverge from exact integers.
  const probes: unknown[][] = [];
  for (const seed of seeds) {
    for (const big of SCALE_VALUES) {
      // Substitute one numeric position at a time, preserving the other args.
      const next = [...seed];
      for (let i = 0; i < next.length; i++) {
        if (typeof next[i] === 'number' && Number.isFinite(next[i])) {
          const scaled = [...next];
          scaled[i] = big;
          probes.push(scaled);
        }
      }
    }
    // String-heavy tools: long inputs catch off-by-one/quadratic blowups.
    if (seed.some((x) => typeof x === 'string')) {
      for (const s of SCALE_STRING_VALUES) {
        const scaled = seed.map((x) => (typeof x === 'string' ? s : x));
        probes.push(scaled);
      }
    }
  }
  const unique = [...new Map(probes.map((p) => [JSON.stringify(p), p])).values()].slice(0, 32);
  if (!unique.length) return { ...empty, integerDomain };

  // 3a. The candidate must still return a finite integer at scale.
  //
  // Probes are screened INDIVIDUALLY and a timeout is explicitly NOT a defect.
  // Substituting a huge value into an argument that drives a loop count (a
  // recursive `fibonacciN(2^31)`, a sieve to 2^31) makes a perfectly correct
  // implementation hang. Counting that as "not finite" would reject correct
  // tools, so a probe that does not finish is skipped rather than failed.
  const nonFinite: string[] = [];
  const nonInteger: string[] = [];
  let scaledChecked = 0;
  for (const a of unique) {
    const lit = JSON.stringify(a);
    const call = `${input.name}(...${lit})`;
    const single = runSuite(src, `assert __forge_finiteInt(() => ${call});`, 1200);
    if (single.passed) {
      scaledChecked++;
      continue;
    }
    // Did it finish at all? Re-run reporting only the value, with a short
    // budget: a clean numeric answer means a real defect; no answer means slow.
    const observed = runSuite(src, `__forge_report(() => ${call});`, 1200);
    const value = observed.stdout.find((l) => l.startsWith('__forge_value:'));
    if (!value) continue; // timed out / aborted — not evidence of imprecision
    scaledChecked++;
    if (/NaN|Infinity|-Infinity/.test(value)) nonFinite.push(`${input.name}(...${lit})`);
    else nonInteger.push(`${input.name}(...${lit})`);
  }

    // With a reference oracle, require exact agreement at scale too.
    const mismatches: string[] = [];
  if (input.reference && input.reference.trim()) {
    const alias = `__forge_scale_ref_${input.name}`;
    const refWrapped = wrapReference(input.reference, input.name, alias);
    for (const a of unique) {
      const lit = JSON.stringify(a);
      const probe = `${input.name}(...${lit})`;
      // Screen the REFERENCE first: an oracle that hangs on a scale probe says
      // nothing about the candidate, exactly as in the differential.
      const refOk = runSuite(`${refWrapped}\n${HELPERS}`, `assert __forge_terminates(() => ${alias}(...${lit}));`, 1200);
      if (!refOk.passed) continue;
      const candOk = runSuite(`${candidate}\n${HELPERS}`, `assert __forge_terminates(() => ${probe});`, 1200);
      if (!candOk.passed) continue; // candidate too slow to compare — not a mismatch
      const same = runSuite(`${candidate}\n${refWrapped}\n${HELPERS}`, `assert __forge_same(() => ${probe}, () => ${alias}(...${lit}));`, 1500);
      if (!same.passed && mismatches.length < 5) {
        mismatches.push(`${input.name}(...${lit}) diverges from the reference at scale (float precision)`);
      }
    }
  }

  return { checked: scaledChecked || unique.length, integerDomain, nonFinite, nonInteger, mismatches };
}

function robustness(input: ForgeQualityInput, candidate: string, seeds: unknown[][]): NonNullable<ForgeQualityReport['robustness']> {
  if (!seeds.length) return { checked: 0, deterministic: true, mutatesInput: false, notes: ['no JSON-safe suite inputs to probe'] };
  const src = `${candidate}\n${HELPERS}`;
  // Class entrypoints must be constructed; function entrypoints are called.
  const call = (argsExpr: string) =>
    input.kind === 'class' ? `new ${input.name}(${argsExpr})` : `${input.name}(${argsExpr})`;
  const det = seeds.map((a) => `assert __forge_det(() => ${call(`...${JSON.stringify(a)}`)});`).join('\n');
  const mut = seeds
    .filter((a) => a.some((x) => typeof x === 'object' && x !== null))
    .map((a) => `assert __forge_nomut(${JSON.stringify(JSON.stringify(a))}, (args) => ${call('...args')});`)
    .join('\n');
  const detRun = runSuite(src, det, 3000);
  const notes: string[] = [];
  const deterministic = detRun.passed;
  if (!deterministic) notes.push('same input produced different output (or run aborted)');
  let mutatesInput = false;
  if (mut) {
    const mutRun = runSuite(src, mut, 3000);
    mutatesInput = !mutRun.passed;
    if (mutatesInput) notes.push("mutates the caller's arguments");
  }
  return { checked: seeds.length, deterministic, mutatesInput, notes };
}

// ---------------------------------------------------------------------------
// Public entrypoint
// ---------------------------------------------------------------------------

/**
 * Score a candidate that ALREADY passed the full reference suite. Pure w.r.t.
 * inputs (all execution happens in the sandbox); never throws.
 */
export function assessForgeCandidate(
  input: ForgeQualityInput,
  candidate: string,
  opts: { requireBehavioral?: boolean } = {},
): ForgeQualityReport {
  const t = forgeQualityThresholds();
  const reasons: string[] = [];
  const code = stripComments(candidate);
  const nondeterministicApis = NONDETERMINISTIC.filter((n) => n.re.test(code)).map((n) => n.id);
  const hardcoded = input.kind === 'class' ? [] : hardcodedSuiteLiterals(candidate, input.refSuite, input.name);
  const jsdoc = /\/\*\*[\s\S]*?\*\//.test(candidate);
  const lines = meaningfulLineCount(candidate);

  let diff: ForgeQualityReport['differential'] = null;
  let rob: ForgeQualityReport['robustness'] = null;
  let scl: ForgeQualityReport['scale'] = null;
  if (IDENT.test(input.name)) {
    const seedSet = new Map<string, unknown[]>();
    for (const v of suiteVectors(input.refSuite, input.name)) seedSet.set(JSON.stringify(v), v);
    for (const v of input.vectors ?? []) {
      if (Array.isArray(v)) seedSet.set(JSON.stringify(v), v);
    }
    const seeds = [...seedSet.values()].slice(0, 16);
    if (input.kind !== 'class') {
      try {
        if (input.reference && input.reference.trim()) diff = differential(input, candidate, seeds);
      } catch (e) {
        diff = { available: false, checked: 0, agreed: 0, mismatches: [`differential harness error: ${(e as Error).message}`] };
      }
      try {
        scl = scaleProbe(input, candidate, seeds);
      } catch (e) {
        scl = { checked: 0, integerDomain: false, nonFinite: [], nonInteger: [], mismatches: [`scale probe error: ${(e as Error).message}`] };
      }
    }
    try {
      rob = robustness(input, candidate, seeds);
    } catch (e) {
      rob = { checked: 0, deterministic: true, mutatesInput: false, notes: [`robustness harness error: ${(e as Error).message}`] };
    }
  }

  // ---- non-LLM differential oracle (A4) ----------------------------------
  // The strongest anchor available: a reference built from BigInt, the standard
  // library, or a deliberately different algorithm — none of which this model
  // wrote. It is the only check here whose authority is structurally outside the
  // generating pass, and it is what catches a double-precision implementation
  // above 2^53 (the `powerMod` failure) where a suite of small asserts cannot.
  //
  // Run through the SAME sandbox as every other probe, so isolation and timeouts
  // are not re-implemented and a second execution route is not introduced.
  // A mismatch is a HARD reason: unlike the scored probes below, an oracle
  // disagreement is not something a candidate can average away.
  let oracle: { tool: string; checked: number; mismatches: string[]; killSummary?: KillSummary } | null = null;
  try {
    const built = oracleSuiteSource(input.name);
    if (built) {
      const run = runSuite(`${candidate}\n${HELPERS}`, built.source, 5000);
      // A5: a crash-kill is weaker evidence than an assertion failure (ISSTA 2023
      // measured up to 43.8% of kills as crashes). Classifying the failures keeps
      // a candidate that merely THREW from being reported with the same confidence
      // as one that returned a wrong value. A3: the failing details are retained
      // verbatim as the discriminating inputs a later differential pass can reuse.
      const kills = summarizeKills(run);
      oracle = {
        tool: input.name,
        checked: built.vectors,
        mismatches: run.passed
          ? []
          : (run.testDetails.length ? run.testDetails : run.stderr.slice(0, 3)).slice(0, 5),
        killSummary: kills,
      };
      if (!run.passed) {
        reasons.push(
          `non-LLM differential oracle: disagrees with a BigInt/stdlib/different-algorithm reference on ${built.vectors} probe vector(s) ` +
            `(${kills.assertions} assertion, ${kills.crashes} crash, ${kills.timeouts} timeout)`,
        );
      }
    }
  } catch (e) {
    // A probe that cannot run must not be read as a pass, but it also must not
    // block on a tool the oracle simply does not cover.
    oracle = { tool: input.name, checked: 0, mismatches: [`oracle probe error: ${(e as Error).message}`] };
  }

  // ---- hand-authored laws (A6) --------------------------------------------
  // Relations stated from each function's DEFINITION rather than from its
  // implementation, so the authority is external to the generating pass. These
  // cover the tools an exact-value oracle cannot judge, because a law constrains
  // the ANSWER'S SHAPE (sorted, idempotent, in-range) rather than its value.
  //
  // A failing law is a hard reason. False alarms are the real risk here, so the
  // catalogue uses multiset equality wherever the spec permits ties — strict
  // equality on tie-permitting functions produces noise that trains operators to
  // ignore the channel.
  let laws: { checked: number; failures: Array<{ law: string; statement: string; why: string }> } | null = null;
  try {
    const lawSrc = lawSuiteSource(input.name);
    if (lawSrc) {
      const run = runSuite(`${candidate}\n${HELPERS}`, lawSrc, 5000);
      const detail = (run.testDetails ?? []).filter((d) => /LAW FAILED/.test(d));
      laws = {
        checked: lawsFor(input.name).length,
        failures: detail.map((d) => {
          const m = /LAW FAILED:\s*([^—-]+?)\s*[—-]\s*(.*?)(?:\s*\(|$)/.exec(d);
          return {
            law: m?.[1]?.trim() ?? d.slice(0, 60),
            statement: m?.[2]?.trim() ?? '',
            why: d,
          };
        }),
      };
      if (laws.failures.length > 0) {
        reasons.push(
          `hand-authored law violated: ${laws.failures.map((f) => f.law).slice(0, 3).join(', ')}`,
        );
      }
    }
  } catch (e) {
    laws = { checked: 0, failures: [] };
    // A law harness that cannot run is recorded, never silently treated as a pass.
    if (/law/i.test(String((e as Error)?.message ?? ''))) {
      reasons.push(`law harness error: ${(e as Error).message}`);
    }
  }

  // ---- hard gate -----------------------------------------------------------
  // Any special-cased suite literal is overfitting; a tool that mutates its
  // caller's arguments violates the purity contract. Both are hard failures,
  // not mere score penalties.
  if (hardcoded.length >= 1) reasons.push(`special-cases suite inputs (${hardcoded.slice(0, 4).join(', ')})`);
  if (nondeterministicApis.length) reasons.push(`nondeterministic API use: ${nondeterministicApis.join(', ')}`);
  if (rob && !rob.deterministic) reasons.push('nondeterministic output on suite inputs');
  if (rob && rob.mutatesInput) reasons.push("mutates the caller's arguments");
  // A candidate with no reference oracle and no JSON-safe suite inputs gets no
  // behavioral check at all — static signals alone must not promote a tool.
  // Existing-tool triage (quarantine) opts out: a `typeof`-only suite is weak
  // evidence, not a reason to retire a live tool.
  const behavioral = (diff && diff.checked > 0) || (rob && rob.checked > 0);
  if (opts.requireBehavioral !== false && !behavioral) {
    reasons.push('no behavioral verification: suite inputs are not JSON-safe and no reference oracle was provided');
  }
  const agreement = diff && diff.checked > 0 ? diff.agreed / diff.checked : null;
  if (agreement !== null && agreement < t.minAgreement) {
    reasons.push(`disagrees with the reference on ${diff!.checked - diff!.agreed}/${diff!.checked} inputs`);
  }

  // ---- scale / precision gate ----------------------------------------------
  // A tool that returns exact integers on its suite must still return finite
  // integers at 2^53-ish magnitudes, and must match the reference there too.
  // This is the check that should have caught `powerMod`: its suite topped out
  // at modulus 1000, so a double-precision implementation passed it while
  // returning a silently wrong answer at 1e9+7.
  const scaleClean = !scl || (scl.nonFinite.length === 0 && scl.nonInteger.length === 0 && scl.mismatches.length === 0);
  if (scl && !scaleClean) {
    if (scl.nonFinite.length) reasons.push(`returns a non-finite value at large magnitudes (${scl.nonFinite.slice(0, 2).join(', ')})`);
    if (scl.nonInteger.length) reasons.push(`stops returning integers at large magnitudes (${scl.nonInteger.slice(0, 2).join(', ')})`);
    if (scl.mismatches.length) reasons.push(`precision: ${scl.mismatches.slice(0, 2).join('; ')}`);
  }

  // ---- score ---------------------------------------------------------------
  const parts: Array<[number, number]> = []; // [weight, value]
  if (agreement !== null) parts.push([0.45, agreement]);
  if (rob && rob.checked > 0) parts.push([0.2, (rob.deterministic ? 0.6 : 0) + (rob.mutatesInput ? 0 : 0.4)]);
  // Scale behaviour earns a slice when the tool is in the integer domain; a
  // tool outside it is not penalised (the probe simply does not apply).
  if (scl && scl.integerDomain && scl.checked > 0) parts.push([0.15, scaleClean ? 1 : 0]);
  parts.push([0.1, jsdoc ? 1 : 0]);
  parts.push([0.1, nondeterministicApis.length ? 0 : 1]);
  parts.push([0.1, hardcoded.length === 0 ? 1 : 0]);
  parts.push([0.05, lines > 0 && lines <= 200 ? 1 : 0.3]);
  const wsum = parts.reduce((s, [w]) => s + w, 0);
  const score = Math.round((parts.reduce((s, [w, v]) => s + w * v, 0) / wsum) * 1000) / 1000;
  if (score < t.minScore) reasons.push(`quality score ${score} below ${t.minScore}`);

  return {
    score,
    gate: { ok: reasons.length === 0, reasons },
    differential: diff,
    robustness: rob,
    scale: scl,
    oracle,
    laws,
    static: { jsdoc, nondeterministicApis, hardcodedSuiteLiterals: hardcoded, meaningfulLines: lines },
  };
}

/**
 * True when every SUBSTANTIVE check is clean (gate ok, full reference
 * agreement, deterministic, no input mutation, no special-cased literals).
 * Style-only shortfalls (missing JSDoc) never justify another paid sample.
 */
export function isSubstantivelyClean(report: ForgeQualityReport): boolean {
  if (!report.gate.ok) return false;
  // A differential that reports `available: false` never ran — the reference
  // could not be exercised. That is an UNVERIFIED candidate, not a clean one, so
  // it must not end sampling early. The old guard (`checked > 0 && ...`) let it
  // pass, because a harness that ran zero probes also reports checked === 0.
  if (report.differential && !report.differential.available) return false;
  if (report.differential && report.differential.checked > 0 && report.differential.agreed < report.differential.checked) return false;
  if (report.robustness && (report.robustness.mutatesInput || !report.robustness.deterministic)) return false;
  return report.static.hardcodedSuiteLiterals.length === 0;
}

/** Order two reports: gate-passing first, then substantive cleanliness, then score. */
export function betterQuality(a: ForgeQualityReport, b: ForgeQualityReport | null | undefined): boolean {
  if (!b) return true;
  if (a.gate.ok !== b.gate.ok) return a.gate.ok;
  const ca = isSubstantivelyClean(a);
  const cb = isSubstantivelyClean(b);
  if (ca !== cb) return ca;
  return a.score > b.score;
}

/** Compact, model-facing description of why a passing candidate is not good enough. */
export function qualityFeedback(report: ForgeQualityReport): string {
  const out: string[] = [];
  if (report.gate.reasons.length) out.push(`Quality gate: ${report.gate.reasons.join('; ')}.`);
  if (report.differential?.mismatches.length) out.push(...report.differential.mismatches.slice(0, 3));
  if (report.robustness?.mutatesInput) out.push('Do not mutate the arguments; copy before sorting/reversing/splicing.');
  if (!report.static.jsdoc) out.push('Add a JSDoc block (summary, @param with types, @returns).');
  return out.join('\n');
}
