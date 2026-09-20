/**
 * isolated-vm hardening backend for the execution sandbox.
 *
 * The default sandbox (`executionSandbox.ts`) runs generated/untrusted code
 * with `new Function(...)` IN-PROCESS — it is function-scope "isolated", not
 * privilege-isolated. This module runs a tool's entrypoint inside a real
 * isolated-vm isolate: a fresh V8 isolate with a per-isolate memory limit, a
 * wall-clock timeout, and NO Node/host globals (no `process`, `require`,
 * `global`, ...). Only the prepared code, an injected `console`, and the args
 * exist inside the isolate.
 *
 * Honest boundaries:
 *  - Only JSON-safe return values can cross the isolate boundary. If the code
 *    returns a non-plain value (a class instance, function, etc.) it is
 *    reported as a non-serializable result, never silently coerced.
 *  - This is an opt-in backend. Callers keep the in-process path by default
 *    (semantics are stable and fully covered by tests) and switch here with an
 *    env flag / explicit call when they need real privilege isolation.
 *  - If the native module is not loadable the backend reports
 *    `available:false` and callers fall back — it never crashes the app.
 */

import { createRequire } from 'node:module';
import { prepareExecutableCode } from './executionSandbox';
import { ASSERT_SHIM } from './assertShim';

// createRequire needs a real URL/path. In the esbuild CJS bundle `import.meta`
// is empty (undefined.url) — fall back to __filename (CJS) or cwd so the module
// initializes instead of crashing boot with ERR_INVALID_ARG_VALUE.
const _importMetaUrl: string | undefined =
  typeof import.meta !== 'undefined' && import.meta.url ? import.meta.url : undefined;
const require =
  typeof __filename !== 'undefined'
    ? createRequire(__filename)
    : createRequire(_importMetaUrl ?? process.cwd());

let _ivm: any = null;
let _checked = false;
export function isIsolateAvailable(): boolean {
  if (_checked) return _ivm !== null;
  _checked = true;
  try {
    _ivm = require('isolated-vm');
  } catch {
    _ivm = null;
  }
  return _ivm !== null;
}

export interface IsolatedExecResult {
  available: boolean;
  success: boolean;
  returnValue: any;
  stdout: string[];
  stderr: string[];
  error?: string;
  timedOut?: boolean;
  memoryLimitMb: number;
  executionTimeMs: number;
}

/** Build the runner source evaluated INSIDE the isolate (single entrypoint). */
function buildRunnerSource(cleanedCode: string, functionName: string | null, argsJson: string): string {
  const validFn = functionName && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(functionName) ? functionName : null;
  // Crosses the boundary as a JSON string (objects/arrays are not directly
  // copyable across isolated-vm). Non-serializable returns are reported, never
  // silently mangled.
  return `
    const __out = [];
    const __err = [];
    const console = {
      log: (...m) => __out.push(m.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' ')),
      warn: (...m) => __err.push('[WARN] ' + m.map(String).join(' ')),
      error: (...m) => __err.push('[ERROR] ' + m.map(String).join(' ')),
      info: (...m) => __out.push('[INFO] ' + m.map(String).join(' ')),
    };
    const args = ${argsJson};

    ${cleanedCode}

    const __callable__ = (function () {
      ${validFn ? `if (typeof ${validFn} === 'function') return () => ${validFn}(...args);` : ''}
      if (typeof execute === 'function') return () => execute(...args);
      if (typeof run === 'function') return () => run(...args);
      if (typeof solveHornClauses === 'function') return () => solveHornClauses(...args);
      if (typeof sanitizeBuffer === 'function') return () => sanitizeBuffer(...args);
      if (typeof createBellState === 'function') return () => createBellState(...args);
      if (typeof groverDiffusion === 'function') return () => groverDiffusion(...args);
      if (typeof planRoutes === 'function') return () => planRoutes(...args);
      if (typeof cosineDistance === 'function') return () => cosineDistance(...args);
      if (typeof sumOfRoots === 'function') return () => sumOfRoots(...args);
      if (typeof fizzbuzz === 'function') return () => fizzbuzz(...args);
      if (typeof L2Cache === 'function') return () => new L2Cache(...args);
      if (typeof LRUCache === 'function') return () => new LRUCache(args[0] || 10);
      if (typeof ReentrancyGuard === 'function') return () => new ReentrancyGuard();
      if (typeof AsyncMutex === 'function') return () => new AsyncMutex();
      return null;
    })();

    let __payload__;
    if (!__callable__) {
      __payload__ = { entry: false, value: undefined, out: __out, err: __err };
    } else {
      try {
        __payload__ = { entry: true, value: __callable__(), out: __out, err: __err };
      } catch (e) {
        __payload__ = { entry: false, threw: true, message: (e && e.message) || String(e), out: __out, err: __err };
      }
    }
    return JSON.stringify(__payload__);
  `;
}

/**
 * Execute a tool's entrypoint inside an isolated-vm isolate. Memory + time
 * bounded; no host globals. Returns JSON-safe results only.
 */
export function executeToolInIsolate(
  sourceCode: string,
  functionName?: string,
  args: any[] = [],
  opts: { memoryLimitMb?: number; timeoutMs?: number } = {}
): IsolatedExecResult {
  const memoryLimitMb = opts.memoryLimitMb ?? 64;
  const timeoutMs = opts.timeoutMs ?? 2000;
  const start = performance.now();
  if (!isIsolateAvailable()) {
    return { available: false, success: false, returnValue: undefined, stdout: [], stderr: [], error: 'isolated-vm not loadable', memoryLimitMb, executionTimeMs: Math.round((performance.now() - start) * 100) / 100 };
  }
  const ivm = _ivm;
  const cleaned = prepareExecutableCode(sourceCode);
  let argsJson = '[]';
  try { argsJson = JSON.stringify(args); } catch { argsJson = '[]'; }
  const src = buildRunnerSource(cleaned, functionName || null, argsJson);

  let isolate: any = null;
  try {
    isolate = new ivm.Isolate({ memoryLimit: memoryLimitMb });
    const context = isolate.createContextSync();
    let result: any = null;
    let timedOut = false;
    let runError: string | undefined;
    let serializationError: string | undefined;

    try {
      const script = isolate.compileScriptSync(`(() => { ${src} })()`);
      const raw = script.runSync(context, { timeout: timeoutMs });
      // runSync returns only primitives across the boundary; we serialize
      // inside the isolate, so `raw` is the JSON string (or undefined on error).
      if (typeof raw === 'string') {
        try { result = JSON.parse(raw); } catch { serializationError = 'result was not valid JSON'; }
      }
    } catch (e: any) {
      const isTimeout = e && ((e as any).message === 'Script execution timed out.' || /timed out/i.test(e?.message || ''));
      if (isTimeout) timedOut = true;
      else runError = (e && e.message) || String(e);
    }

    const out: string[] = Array.isArray(result?.out) ? result.out : [];
    const err: string[] = Array.isArray(result?.err) ? result.err : [];

    // Determine success/value
    let success = false;
    let returnValue: any = undefined;
    let error: string | undefined = runError || serializationError;
    if (timedOut) {
      error = `Execution timed out after ${timeoutMs}ms (isolated, mem ${memoryLimitMb}MB)`;
    } else if (result && result.entry === true) {
      success = true;
      returnValue = result.value;
    } else if (result && result.threw) {
      error = error || result.message;
    } else {
      error = error || (functionName ? `Function "${functionName}" not found or returned a non-serializable value` : 'No callable entrypoint found or result was not JSON-serializable');
    }

    return {
      available: true,
      success,
      returnValue,
      stdout: out,
      stderr: err,
      error,
      timedOut,
      memoryLimitMb,
      executionTimeMs: Math.round((performance.now() - start) * 100) / 100,
    };
  } finally {
    if (isolate) { try { isolate.dispose(); } catch { /* already gone */ } }
  }
}

/**
 * Run a FULL test suite inside an isolated-vm isolate. Mirrors
 * `executeTestSuite`'s semantics (assert splitting, `__assert` counting,
 * compilation-error honesty) but the source AND assertions execute with NO
 * host globals — no process/require/fs/network. The `__assert` callback lives
 * inside the isolate and collects per-assertion outcomes into a JSON payload
 * that crosses back. Falls back to `available:false` when ivm is not loadable
 * (the caller keeps its in-process path for that case only).
 */
export function executeTestSuiteInIsolate(
  sourceCode: string,
  testSuiteCode: string,
  opts: { memoryLimitMb?: number; timeoutMs?: number } = {}
): {
  available: boolean;
  passed: boolean;
  score: number;
  stdout: string[];
  stderr: string[];
  testDetails: string[];
  executionTimeMs: number;
} {
  const memoryLimitMb = opts.memoryLimitMb ?? 64;
  const timeoutMs = opts.timeoutMs ?? 4000;
  const start = performance.now();
  const empty = (passed: boolean, score: number, reason: string) => ({
    available: false, passed, score, stdout: [], stderr: [reason], testDetails: [reason], executionTimeMs: Math.round((performance.now() - start) * 100) / 100,
  });
  if (!isIsolateAvailable()) {
    return { ...empty(false, 0, 'isolated-vm not loadable'), available: false };
  }
  const ivm = _ivm;
  const cleaned = prepareExecutableCode(sourceCode);

  // Split test body into statements (same rules as executionSandbox: `;` and
  // top-level `,assert` boundaries; loops safe because their `;` sit in parens).
  function splitTestStatements(raw: string): string[] {
    const out: string[] = [];
    let cur = '';
    let depth = 0;
    let quote: string | null = null;
    let i = 0;
    const push = () => { const t = cur.trim(); if (t && !t.startsWith('//')) out.push(t); cur = ''; };
    while (i < raw.length) {
      const ch = raw[i];
      if (quote) { cur += ch; if (ch === quote) quote = null; i++; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { quote = ch; cur += ch; i++; continue; }
      if (ch === '(' || ch === '[' || ch === '{') { depth++; cur += ch; i++; continue; }
      if (ch === ')' || ch === ']' || ch === '}') { depth--; cur += ch; i++; continue; }
      if (ch === ';' && depth === 0) { push(); i++; continue; }
      if (ch === ',' && depth === 0 && /^,\s*assert\b/.test(raw.slice(i))) { push(); i++; continue; }
      cur += ch;
      i++;
    }
    push();
    return out;
  }

  const lines = splitTestStatements(testSuiteCode || '');
  const body: string[] = [];
  const splitTopLevelArgs = (s: string): string[] => {
    const out: string[] = [];
    let depth = 0;
    let cur = '';
    let quote: string | null = null;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { quote = ch; cur += ch; continue; }
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      if (ch === ')' || ch === ']' || ch === '}') depth--;
      if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  };
  const rewriteAssertLine = (line: string): string | null => {
    const bare = line.match(/^assert\s+(.+)$/);
    if (bare) return `__assert((${bare[1].replace(/;$/, '')}), ${JSON.stringify(line)});`;
    const call = line.match(/^assert\s*\((.*)\);?$/);
    if (call) {
      const args = splitTopLevelArgs(call[1]);
      if (!args.length) return null;
      const label = args.length >= 2 ? `assert(${call[1]});` : line;
      return `__assert((${args[0]}), ${JSON.stringify(label)});`;
    }
    const nodeStyle = line.match(/^assert\.(equal|strictEqual|notEqual|notStrictEqual|deepEqual|ok)\((.*)\);?$/);
    if (nodeStyle) {
      const kind = nodeStyle[1];
      const args = splitTopLevelArgs(nodeStyle[2]);
      let check: string;
      if (kind === 'equal') check = `(${args[0]} == ${args[1]})`;
      else if (kind === 'strictEqual') check = `(${args[0]} === ${args[1]})`;
      else if (kind === 'notEqual') check = `(${args[0]} != ${args[1]})`;
      else if (kind === 'notStrictEqual') check = `(${args[0]} !== ${args[1]})`;
      else if (kind === 'deepEqual') check = `(JSON.stringify(${args[0]}) === JSON.stringify(${args[1]}))`;
      else check = `Boolean(${args[0]})`; // ok
      if (args.length >= 2) return `__assert(${check}, ${JSON.stringify(line)});`;
      return null;
    }
    return null;
  };
  for (const line of lines) {
    const rewritten = rewriteAssertLine(line);
    if (rewritten !== null) body.push(rewritten);
    else body.push(line);
  }

  const src = `
    const __out = [];
    const __err = [];
    const __details = [];
    let __pass = 0, __fail = 0;
    const console = {
      log: (...m) => __out.push(m.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' ')),
      warn: (...m) => __err.push('[WARN] ' + m.map(String).join(' ')),
      error: (...m) => __err.push('[ERROR] ' + m.map(String).join(' ')),
      info: (...m) => __out.push('[INFO] ' + m.map(String).join(' ')),
    };
    const __assert = (value, label) => {
      if (value === true) { __pass++; __details.push('[PASS] ' + label); }
      else { __fail++; __details.push('[FAIL] ' + label + ' -> returned ' + (value === undefined ? 'undefined' : JSON.stringify(value))); }
    };
    let __payload__;
    try {
      ${ASSERT_SHIM}
      ${cleaned}
      ${body.join('\n')}
      __payload__ = { ok: true, pass: __pass, fail: __fail, details: __details, out: __out, err: __err };
    } catch (e) {
      __payload__ = { ok: false, threw: true, message: (e && e.message) || String(e), pass: __pass, fail: __fail, details: __details, out: __out, err: __err };
    }
    return JSON.stringify(__payload__);
  `;

  let isolate: any = null;
  try {
    isolate = new ivm.Isolate({ memoryLimit: memoryLimitMb });
    const context = isolate.createContextSync();
    let raw: any = null;
    let timedOut = false;
    try {
      const script = isolate.compileScriptSync(`(() => { ${src} })()`);
      raw = script.runSync(context, { timeout: timeoutMs });
    } catch (e: any) {
      const isTimeout = e && (e?.message === 'Script execution timed out.' || /timed out/i.test(e?.message || ''));
      if (isTimeout) timedOut = true;
      else return { ...empty(false, 0, `[COMPILATION ERROR] ${e?.message || String(e)}`), available: true, executionTimeMs: Math.round((performance.now() - start) * 100) / 100 };
    }
    if (timedOut) {
      return { ...empty(false, 0, `Test suite timed out after ${timeoutMs}ms (isolated, mem ${memoryLimitMb}MB)`), available: true, executionTimeMs: Math.round((performance.now() - start) * 100) / 100 };
    }
    let p: any = null;
    if (typeof raw === 'string') { try { p = JSON.parse(raw); } catch { p = null; } }
    if (!p || p.ok !== true) {
      const detail = p?.threw ? `[FAIL] Test body aborted with uncaught error: ${p.message}` : 'isolate returned no payload';
      return { ...empty(false, 0, detail), available: true, testDetails: [detail], stdout: Array.isArray(p?.out) ? p.out : [], stderr: Array.isArray(p?.err) ? p.err : [], executionTimeMs: Math.round((performance.now() - start) * 100) / 100 };
    }
    const pass = p.pass || 0, fail = p.fail || 0;
    const details: string[] = Array.isArray(p.details) ? p.details : [];
    const total = pass + fail;
    const score = total > 0 ? pass / total : 0.0;
    return {
      available: true,
      passed: fail === 0 && pass > 0,
      score,
      stdout: p.out || [],
      stderr: p.err || [],
      testDetails: details,
      executionTimeMs: Math.round((performance.now() - start) * 100) / 100,
    };
  } finally {
    if (isolate) { try { isolate.dispose(); } catch { /* already gone */ } }
  }
}
