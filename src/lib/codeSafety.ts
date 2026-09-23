/**
 * Static screen for model-generated code that is about to be evaluated
 * IN-PROCESS (`new Function` / `node:vm`), i.e. without isolated-vm.
 *
 * Neither `new Function` nor `node:vm` is a security boundary: generated code
 * can reach `process` (directly, via `globalThis`, or through the
 * `fn.constructor.constructor('return process')()` chain) and from there the
 * whole host. Recourse feeds untrusted web content (HN/RSS/arXiv/GitHub intake,
 * corpus text) into the prompts that produce this code, so prompt-injected
 * payloads are a realistic threat.
 *
 * This screen is DEFENSE IN DEPTH, not a sandbox. It rejects the known escape
 * vocabulary (host globals, dynamic code construction, prototype-chain
 * walking, identifier/string obfuscation primitives). Pure algorithmic code —
 * what the forge, dream engine and math loop are supposed to produce — never
 * needs any of it, so false positives only cost a rejected candidate.
 * isolated-vm remains the real boundary; prefer it wherever available.
 */

export interface CodeSafetyVerdict {
  ok: boolean;
  /** Human-readable reasons (empty when ok). */
  violations: string[];
}

const RULES: Array<{ re: RegExp; why: string }> = [
  { re: /\bprocess\b/, why: 'host global `process`' },
  { re: /\brequire\s*\(/, why: '`require(...)`' },
  { re: /\bimport\s*\(/, why: 'dynamic `import(...)`' },
  { re: /^\s*import\s+[\w{*'"]/m, why: 'static `import`' },
  { re: /\bglobalThis\b/, why: '`globalThis`' },
  { re: /\bglobal\s*[.[]/, why: 'Node `global` object' },
  { re: /\b(?:module|exports)\s*[.[]/, why: 'CommonJS `module`/`exports`' },
  { re: /\beval\s*\(/, why: '`eval(...)`' },
  { re: /\bFunction\s*\(/, why: '`Function(...)` constructor' },
  // Class method declarations (`constructor(x) {`) are fine; property access
  // (`fn.constructor`, `o['constructor']`) is the classic vm escape.
  { re: /\.\s*constructor\b|['"`]constructor['"`]/, why: '`constructor` property access (prototype-chain escape)' },
  { re: /__proto__|__defineGetter__|__defineSetter__|__lookupGetter__/, why: 'legacy prototype accessors' },
  { re: /\b(?:getPrototypeOf|setPrototypeOf|getOwnPropertyDescriptors?)\b/, why: 'prototype introspection' },
  { re: /\bReflect\b/, why: '`Reflect`' },
  { re: /\bProxy\b/, why: '`Proxy`' },
  { re: /\bWebAssembly\b/, why: '`WebAssembly`' },
  { re: /\b(?:fetch|XMLHttpRequest|WebSocket)\b/, why: 'network access' },
  { re: /\bchild_process\b|\bnode:/, why: 'Node builtin module reference' },
  { re: /\b(?:atob|btoa|fromCharCode|fromCodePoint|unescape|decodeURIComponent|decodeURI)\b/, why: 'string de-obfuscation primitive' },
  { re: /\\u\{?[0-9a-fA-F]|\\x[0-9a-fA-F]{2}/, why: 'escaped identifier/string (obfuscation)' },
  { re: /\[\s*(['"`])[^\]\n]*?\1\s*\+/, why: 'computed member built by string concatenation' },
  { re: /\[\s*`[^`\]]*\$\{/, why: 'computed member built from a template literal' },
  { re: /\[[^\]\n]*\.(?:join|concat|reverse|replace|split)\s*\(/, why: 'computed member built by string transformation' },
  { re: /[\w\])]\s*\[\s*\[/, why: 'computed member keyed by an array literal' },
  { re: /\bwith\s*\(/, why: '`with` statement' },
  { re: /\bdebugger\b/, why: '`debugger`' },
];

/** Strip // and /* *\/ comments so prose in comments cannot trip the screen. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
}

export function screenInProcessCode(source: string): CodeSafetyVerdict {
  const code = stripComments(String(source ?? ''));
  const violations: string[] = [];
  for (const rule of RULES) {
    if (rule.re.test(code)) violations.push(rule.why);
  }
  return { ok: violations.length === 0, violations };
}

export class UnsafeCodeError extends Error {
  readonly violations: string[];
  constructor(violations: string[]) {
    super(`unsafe code rejected before in-process evaluation: ${violations.join('; ')}`);
    this.name = 'UnsafeCodeError';
    this.violations = violations;
  }
}

/** Throws UnsafeCodeError when the screen fails. */
export function assertInProcessSafe(source: string): void {
  const v = screenInProcessCode(source);
  if (!v.ok) throw new UnsafeCodeError(v.violations);
}

/** Strict mode: refuse the in-process fallback entirely when isolated-vm is
 *  unavailable (RECOURSE_REQUIRE_ISOLATION=1). Default: screen, then run. */
export function isolationRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.RECOURSE_REQUIRE_ISOLATION === '1';
}

/** Combined gate for an in-process fallback run. Returns an error string when
 *  the run must not happen, or null when it may proceed. */
export function inProcessFallbackRefusal(...sources: string[]): string | null {
  if (isolationRequired()) {
    return 'isolated-vm is unavailable and RECOURSE_REQUIRE_ISOLATION=1 forbids the in-process fallback';
  }
  const violations = sources.flatMap((s) => screenInProcessCode(s).violations);
  if (violations.length) {
    return `unsafe code rejected before in-process evaluation: ${[...new Set(violations)].join('; ')}`;
  }
  return null;
}
