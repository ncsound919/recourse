// src/lib/synergy/adapters.ts
/**
 * Deterministic CBR operator ladder for adaptation. Operators are conservative
 * pure string transforms over a method's stored source; each candidate is still
 * execution-gated by the resolver, so an operator can never fabricate a pass.
 *
 * Operators (applied in order):
 *   null          — the source as-is
 *   reinstantiate — rename the declared symbol to the one the acceptance test
 *                   references (a pure rename; no semantic change)
 */
export type LadderOperator = 'null' | 'reinstantiate';

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
  return out;
}
