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
function __forge_call(fn) {
  try { return { ok: true, out: __forge_json(fn()) }; } catch (e) { return { ok: false, out: 'throw' }; }
}
function __forge_same(cand, ref) {
  var r = __forge_call(ref);
  if (!r.ok) return true;
  var c = __forge_call(cand);
  return c.ok && c.out === r.out;
}
function __forge_terminates(fn) { __forge_call(fn); return true; }
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

function differential(
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
  if (!usable.length) return { available: true, checked: 0, agreed: 0, mismatches: [] };

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

function robustness(input: ForgeQualityInput, candidate: string, seeds: unknown[][]): NonNullable<ForgeQualityReport['robustness']> {
  if (!seeds.length) return { checked: 0, deterministic: true, mutatesInput: false, notes: ['no JSON-safe suite inputs to probe'] };
  const src = `${candidate}\n${HELPERS}`;
  const det = seeds.map((a) => `assert __forge_det(() => ${input.name}(...${JSON.stringify(a)}));`).join('\n');
  const mut = seeds
    .filter((a) => a.some((x) => typeof x === 'object' && x !== null))
    .map((a) => `assert __forge_nomut(${JSON.stringify(JSON.stringify(a))}, (args) => ${input.name}(...args));`)
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
export function assessForgeCandidate(input: ForgeQualityInput, candidate: string): ForgeQualityReport {
  const t = forgeQualityThresholds();
  const reasons: string[] = [];
  const code = stripComments(candidate);
  const nondeterministicApis = NONDETERMINISTIC.filter((n) => n.re.test(code)).map((n) => n.id);
  const hardcoded = input.kind === 'class' ? [] : hardcodedSuiteLiterals(candidate, input.refSuite, input.name);
  const jsdoc = /\/\*\*[\s\S]*?\*\//.test(candidate);
  const lines = meaningfulLineCount(candidate);

  let diff: ForgeQualityReport['differential'] = null;
  let rob: ForgeQualityReport['robustness'] = null;
  if (input.kind !== 'class' && IDENT.test(input.name)) {
    const seedSet = new Map<string, unknown[]>();
    for (const v of suiteVectors(input.refSuite, input.name)) seedSet.set(JSON.stringify(v), v);
    for (const v of input.vectors ?? []) {
      if (Array.isArray(v)) seedSet.set(JSON.stringify(v), v);
    }
    const seeds = [...seedSet.values()].slice(0, 16);
    try {
      if (input.reference && input.reference.trim()) diff = differential(input, candidate, seeds);
    } catch (e) {
      diff = { available: false, checked: 0, agreed: 0, mismatches: [`differential harness error: ${(e as Error).message}`] };
    }
    try {
      rob = robustness(input, candidate, seeds);
    } catch (e) {
      rob = { checked: 0, deterministic: true, mutatesInput: false, notes: [`robustness harness error: ${(e as Error).message}`] };
    }
  }

  // ---- hard gate -----------------------------------------------------------
  if (hardcoded.length >= 2) reasons.push(`special-cases suite inputs (${hardcoded.slice(0, 4).join(', ')})`);
  if (nondeterministicApis.length) reasons.push(`nondeterministic API use: ${nondeterministicApis.join(', ')}`);
  if (rob && !rob.deterministic) reasons.push('nondeterministic output on suite inputs');
  const agreement = diff && diff.checked > 0 ? diff.agreed / diff.checked : null;
  if (agreement !== null && agreement < t.minAgreement) {
    reasons.push(`disagrees with the reference on ${diff!.checked - diff!.agreed}/${diff!.checked} inputs`);
  }

  // ---- score ---------------------------------------------------------------
  const parts: Array<[number, number]> = []; // [weight, value]
  if (agreement !== null) parts.push([0.45, agreement]);
  if (rob && rob.checked > 0) parts.push([0.2, (rob.deterministic ? 0.6 : 0) + (rob.mutatesInput ? 0 : 0.4)]);
  parts.push([0.1, jsdoc ? 1 : 0]);
  parts.push([0.1, nondeterministicApis.length ? 0 : 1]);
  parts.push([0.1, hardcoded.length === 0 ? 1 : hardcoded.length === 1 ? 0.5 : 0]);
  parts.push([0.05, lines > 0 && lines <= 200 ? 1 : 0.3]);
  const wsum = parts.reduce((s, [w]) => s + w, 0);
  const score = Math.round((parts.reduce((s, [w, v]) => s + w * v, 0) / wsum) * 1000) / 1000;
  if (score < t.minScore) reasons.push(`quality score ${score} below ${t.minScore}`);

  return {
    score,
    gate: { ok: reasons.length === 0, reasons },
    differential: diff,
    robustness: rob,
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
