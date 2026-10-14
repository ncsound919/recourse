/**
 * moduleContract.ts — normalize a model's code reply into the self-hosting
 * module contract.
 *
 * The contract (selfHosting.generateStatelessSelfHostedModuleSource) is: the
 * module exports exactly one function named `entrypointName`.
 *
 * WHY DEFENSIVE NORMALIZATION (not just a prompt): the forge's system prompt
 * already says "Return ONLY JavaScript source. No Markdown fences and no prose
 * outside code comments" — and models still wrap replies in ``` fences, prefix
 * a "Here is the function:" preamble, or omit the `export` keyword. That is the
 * published behaviour of instruction-tuned models, and the recommended remedy
 * is to strip defensively in the parsing layer regardless of the instruction
 * (NIST-style "enforce at multiple layers": prompt + normalize + validate).
 * Measured here 2026-10-12: a correct body without `export` was discarded by
 * the substance gate; that is a capability lost to formatting, not to logic.
 *
 * Every transformation is FAITHFUL: it moves or unwraps code the model wrote,
 * adds the `export` keyword to the matching declaration, and never invents a
 * declaration. If the entrypoint is absent, the source is returned with no
 * changes and the gates refuse it, which is correct.
 */

const FENCE_RE = /```[a-zA-Z0-9_+-]*\s*\n([\s\S]*?)```/g;

/** Largest fenced code block, if the reply wrapped code. */
export function stripFences(source: string): string {
  const s = String(source ?? '');
  if (!s.includes('```')) return s;
  const blocks = [...s.matchAll(FENCE_RE)].map((m) => m[1]);
  if (!blocks.length) return s;
  return blocks.sort((a, b) => b.length - a.length)[0];
}

const CODE_START_RE = /^\s*(?:export\s+|async\s+|module\.exports|exports\.|function\b|const\b|let\b|var\b|class\b|\/\/|\/\*)/;

/** Drop a prose preamble before the first code-looking line. */
export function stripPreamble(source: string): string {
  const lines = String(source ?? '').split(/\r?\n/);
  const idx = lines.findIndex((l) => CODE_START_RE.test(l));
  if (idx <= 0) return String(source ?? '');
  // Only strip when the dropped lines look like prose (no code punctuation run).
  const preamble = lines.slice(0, idx).join('\n').trim();
  if (!preamble || /=>|\bfunction\b|;|\)\s*\{/.test(preamble)) return String(source ?? '');
  return lines.slice(idx).join('\n');
}

/**
 * Unwrap a CommonJS export into an ESM declaration the self-host contract
 * accepts. Handles `module.exports = function NAME(...)`,
 * `module.exports.NAME = function (...)` and `exports.NAME = (...) => ...`.
 */
export function unwrapCommonJs(source: string, entrypointName: string): string {
  const s = String(source ?? '');
  const name = String(entrypointName || '').trim();
  if (!name || !/\b(?:module\.)?exports\b/.test(s)) return s;

  // module.exports = function NAME(...) -> function NAME(...)
  const direct = new RegExp(`module\\.exports\\s*=\\s*(async\\s+)?function\\s+${escapeRe(name)}\\b`);
  if (direct.test(s)) return s.replace(/module\.exports\s*=\s*/g, '');

  // module.exports = { NAME } or module.exports = { NAME: NAME }
  const objShorthand = new RegExp(`module\\.exports\\s*=\\s*\\{\\s*${escapeRe(name)}\\s*(?::\\s*${escapeRe(name)}\\s*)?\\}`);
  if (objShorthand.test(s)) return s.replace(objShorthand, '');

  // `exports.NAME = function (...)` / `exports.NAME = (...) => ...` -> function NAME(...)
  const assigned = new RegExp(`(^|\\n)\\s*(?:module\\.)?exports\\.${escapeRe(name)}\\s*=\\s*`);
  if (assigned.test(s)) {
    return s.replace(assigned, (_m, nl) => `${nl}function ${name} `).replace(/function\s+([A-Za-z0-9_$]+)\s*=/, 'function $1');
  }
  return s;
}

function escapeRe(v: string): string {
  return v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const HAS_ANY_EXPORT = /\bexport\s+(default\s+)?(async\s+)?(function|const|let|var|class)\b/;

export function ensureExported(source: string, entrypointName: string): string {
  const s = String(source ?? '');
  if (!s.trim()) return s;
  if (HAS_ANY_EXPORT.test(s)) return s; // already exports something — leave it to the gates

  const name = escapeRe(String(entrypointName || '').trim());
  if (!name) return s;

  // `(async )?function NAME(` at the start of a line -> `export async? function NAME(`
  const fn = new RegExp(`(^|\\n)([ \\t]*)(async[ \\t]+)?function[ \\t]+${name}[ \\t]*\\(`);
  if (fn.test(s)) {
    return s.replace(fn, (_m, nl, indent, isAsync) => `${nl}${indent}export ${isAsync || ''}function ${entrypointName}(`);
  }
  // `const NAME =` / `let NAME =` / `var NAME =` -> `export const NAME =`
  const decl = new RegExp(`(^|\\n)([ \\t]*)(const|let|var)[ \\t]+${name}[ \\t]*=`);
  if (decl.test(s)) {
    return s.replace(decl, (_m, nl, indent, kw) => `${nl}${indent}export ${kw} ${entrypointName} =`);
  }
  // No declaration of the entrypoint at all: return unchanged (the gates will
  // refuse it, which is correct — the name contract was not met).
  return s;
}

export interface NormalizeResult {
  source: string;
  /** What was changed, in order — recorded in provenance so the fix is auditable. */
  changes: string[];
}

/**
 * The full reply→module normalization pipeline, in order:
 * fences -> prose preamble -> CommonJS unwrap -> ensure `export`.
 */
export function normalizeGeneratedModule(source: string, entrypointName: string): NormalizeResult {
  const changes: string[] = [];
  let s = String(source ?? '');

  const fenced = stripFences(s);
  if (fenced !== s) { s = fenced; changes.push('stripped markdown code fence'); }

  const unpreambled = stripPreamble(s);
  if (unpreambled !== s) { s = unpreambled; changes.push('stripped prose preamble'); }

  const unwrapped = unwrapCommonJs(s, entrypointName);
  if (unwrapped !== s) { s = unwrapped; changes.push('unwrapped CommonJS export into an ESM declaration'); }

  const exported = ensureExported(s, entrypointName);
  if (exported !== s) { s = exported; changes.push('added the missing `export` keyword to the entrypoint declaration'); }

  return { source: s, changes };
}
