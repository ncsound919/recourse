// src/lib/synergy/adapters.ts
/**
 * Deterministic CBR operator ladder for adaptation. Operators are conservative
 * pure string transforms over a method's stored source; each candidate is still
 * execution-gated by the resolver, so an operator can never fabricate a pass.
 *
 * Operators (applied in order):
 *   null              — the source as-is
 *   reinstantiate     — rename the declared symbol to the one the acceptance
 *                       test references (a pure rename; no semantic change)
 *   parameter_adjust  — scale numeric literals by a deterministic factor
 *   abstract_respecialize — wrap the return value in a generic container
 */
export type LadderOperator = 'null' | 'reinstantiate' | 'parameter_adjust' | 'abstract_respecialize';

export interface LadderCandidate {
  operator: LadderOperator;
  sourceCode: string;
  note: string;
}

const KEYWORDS = new Set([
  'assert', 'JSON', 'Math', 'console', 'Object', 'Array', 'String', 'Number', 'Boolean',
  'Date', 'Set', 'Map', 'Promise', 'process', 'require', 'module', 'exports', 'if', 'for',
  'while', 'return', 'function', 'new', 'typeof', 'await', 'async', 'const', 'let', 'var',
]);

/**
 * The symbol the acceptance test drives: the object of a member call
 * (`Mod.f(...)` -> `Mod`) if present, else the first bare identifier call that
 * is not a known global.
 */
export function targetSymbolFromTest(acceptanceTest: string): string | null {
  const member = acceptanceTest.match(/\b([A-Za-z_$][\w$]*)\s*\.\s*[A-Za-z_$][\w$]*\s*\(/);
  if (member && !KEYWORDS.has(member[1])) return member[1];
  const bare = acceptanceTest.match(/\b([A-Za-z_$][\w$]*)\s*\(/g);
  if (bare) {
    for (const call of bare) {
      const name = call.replace(/\s*\($/, '');
      if (!KEYWORDS.has(name)) return name;
    }
  }
  return null;
}

/** The name a source declares (class/function/const/let/var), if any. */
export function declaredSymbol(source: string): string | null {
  const cls = source.match(/(?:export\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/);
  if (cls) return cls[1];
  const v = source.match(/(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/);
  return v ? v[1] : null;
}

/** Rename a declared symbol throughout the source (pure textual rename). */
export function renameDeclaration(source: string, target: string): { code: string; renamedFrom?: string } {
  const from = declaredSymbol(source);
  if (!from || from === target) return { code: source };
  const re = new RegExp(`\\b${from.replace(/[$]/g, '\\$')}\\b`, 'g');
  return { code: source.replace(re, target), renamedFrom: from };
}

/** Scale all numeric literals by a deterministic factor (default 2). */
export function adjustParameters(source: string, factor = 2): { code: string; adjusted: number } {
  let adjusted = 0;
  const code = source.replace(/\b(\d+\.?\d*)\b/g, (match, num) => {
    const val = parseFloat(num);
    if (isNaN(val)) return match;
    adjusted++;
    return String(Math.round(val * factor * 10000) / 10000);
  });
  return { code, adjusted };
}

/** Wrap the return value in a generic container (deterministic abstraction).
 *  Only applies to simple functions without nested function expressions. */
export function abstractRespecialize(source: string): { code: string; wrapped: boolean } {
  const fnMatch = source.match(/(?:export\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/);
  if (!fnMatch) return { code: source, wrapped: false };
  if (/\bfunction\s*[({]/.test(source) || /=>/.test(source)) return { code: source, wrapped: false };
  const re = /(\breturn\s+)([^;]+)(;)/g;
  let wrapped = false;
  const code = source.replace(re, (match, prefix, value: string, suffix) => {
    const trimmed = value.trim();
    if (/^[\d.]+$/.test(trimmed) || /^[A-Za-z_$][\w$]*$/.test(trimmed)) {
      return match;
    }
    wrapped = true;
    return `${prefix}{ value: ${trimmed} }${suffix}`;
  });
  return wrapped ? { code, wrapped } : { code: source, wrapped: false };
}

/**
 * Build the ordered ladder for a candidate. Duplicate code shapes are removed so
 * the resolver never runs the same source twice.
 */
export function ladderCandidates(input: { sourceCode?: string; acceptanceTest: string }): LadderCandidate[] {
  const out: LadderCandidate[] = [];
  const seen = new Set<string>();
  const push = (operator: LadderOperator, sourceCode: string, note: string) => {
    if (!sourceCode || !sourceCode.trim() || seen.has(sourceCode)) return;
    seen.add(sourceCode);
    out.push({ operator, sourceCode, note });
  };

  if (input.sourceCode) push('null', input.sourceCode, 'source as-is');

  const target = targetSymbolFromTest(input.acceptanceTest);
  if (input.sourceCode && target) {
    const renamed = renameDeclaration(input.sourceCode, target);
    if (renamed.renamedFrom) {
      push('reinstantiate', renamed.code, `renamed ${renamed.renamedFrom} -> ${target}`);
    }
  }

  if (input.sourceCode) {
    const adjusted = adjustParameters(input.sourceCode, 2);
    if (adjusted.adjusted > 0) {
      push('parameter_adjust', adjusted.code, `scaled ${adjusted.adjusted} numeric literals by 2`);
    }
    const abstracted = abstractRespecialize(input.sourceCode);
    if (abstracted.wrapped) {
      push('abstract_respecialize', abstracted.code, 'wrapped return value in container');
    }
  }

  return out;
}
