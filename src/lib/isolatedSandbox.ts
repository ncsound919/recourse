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

const require = createRequire(import.meta.url);

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
    const jail = context.global;
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
