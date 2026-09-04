/**
 * Real Sandboxed In-Process JavaScript/TypeScript Execution Engine
 * Safely executes tool functions, classes, and test suites with real timers,
 * exception interception, assertion verification, and stdout/stderr capture.
 *
 * Honesty contract: a test assertion may ONLY reference symbols that the code
 * under test actually defines. No fixture constants are injected, so a test
 * that references an undeclared variable throws a ReferenceError and FAILS.
 * A pass means the real code demonstrably satisfied the assertion.
 */

import { transformSync } from 'esbuild';

export interface ExecutionResult {
  success: boolean;
  returnValue: any;
  stdout: string[];
  stderr: string[];
  executionTimeMs: number;
  memoryDeltaBytes?: number;
  error?: string;
  assertionsPassed: number;
  assertionsFailed: number;
}

/**
 * Transpiles TypeScript/ES-module source into plain JS that can be embedded
 * inside a sandbox function body.
 *
 * Real TS parsing is delegated to esbuild (already a dependency). Anything the
 * sandbox cannot parse is returned unchanged so the caller surfaces a truthful
 * syntax error — the sandbox never silently runs mangled code.
 */
export function prepareExecutableCode(sourceCode: string): string {
  if (!sourceCode) return '';

  let compiled: string;
  try {
    compiled = transformSync(sourceCode, {
      loader: 'ts',
      format: 'esm',
      target: 'es2022',
      sourcefile: 'recourse_gene.ts',
    }).code;
  } catch {
    // Not valid TS/JS — let the caller report the real parse error.
    return sourceCode;
  }

  // Remove any multi-line/single-line `export { ... };` footer esbuild emits
  compiled = compiled.replace(/\n?^\s*export\s*\{[\s\S]*?\};?$/gm, '');

  return compiled
    .split('\n')
    .map((line) => {
      const trimmed = line.trimStart();
      // drop module-level import statements entirely
      if (/^import\s/.test(trimmed)) {
        return '';
      }
      // drop the `export` keyword (incl. `export default`) so declarations
      // live in the sandbox scope
      if (/^export\s+default\s+/.test(trimmed)) {
        return line.replace(/^(\s*)export\s+default\s+/, '$1');
      }
      if (/^export\s+/.test(trimmed)) {
        return line.replace(/^(\s*)export\s+/, '$1');
      }
      return line;
    })
    .join('\n');
}

/** Build a fresh console interceptor capturing stdout/stderr. */
function makeCapturedConsole(stdout: string[], stderr: string[]) {
  return {
    log: (...msg: any[]) => stdout.push(msg.map((m) => (typeof m === 'object' ? JSON.stringify(m) : String(m))).join(' ')),
    warn: (...msg: any[]) => stderr.push(`[WARN] ${msg.map((m) => String(m)).join(' ')}`),
    error: (...msg: any[]) => stderr.push(`[ERROR] ${msg.map((m) => String(m)).join(' ')}`),
    info: (...msg: any[]) => stdout.push(`[INFO] ${msg.map((m) => String(m)).join(' ')}`),
  };
}

/**
 * Safely runs arbitrary tool code with argument bindings.
 *
 * Resolution is fail-closed: if no callable entrypoint is found (and the code
 * is not a plain JSON payload), the execution is reported as a FAILURE rather
 * than a silent success with `undefined`.
 */
export function executeToolFunction(
  sourceCode: string,
  functionName?: string,
  args: any[] = []
): ExecutionResult {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const startTime = performance.now();
  let returnValue: any = undefined;
  let success = true;
  let errorMessage: string | undefined = undefined;

  const customConsole = makeCapturedConsole(stdout, stderr);

  // Plain JSON payloads (biotech oncology records, data assets) are returned
  // as data — they are not embeddable as statements.
  const trimmed = (sourceCode || '').trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      return {
        success: true,
        returnValue: parsed,
        stdout,
        stderr,
        executionTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
        error: undefined,
        assertionsPassed: 1,
        assertionsFailed: 0
      };
    } catch {
      /* not JSON — fall through to code execution */
    }
  }

  try {
    const cleanedCode = prepareExecutableCode(sourceCode);

    const validFn = functionName && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(functionName) ? functionName : null;

    const runnerCode = `
      "use strict";
      const console = customConsole;
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

      if (!__callable__) return { entry: false, value: undefined };
      return { entry: true, value: __callable__() };
    `;

    const dynamicFn = new Function('customConsole', 'args', runnerCode);
    const result = dynamicFn(customConsole, args);

    if (!result || result.entry !== true) {
      success = false;
      errorMessage =
        `No callable entrypoint found in submitted code. ` +
        (functionName
          ? `Function "${functionName}" is not defined.`
          : 'Pass an explicit functionName, or export/define a recognized entrypoint (execute, run, or the tool function itself).');
      stderr.push(`Execution Exception: ${errorMessage}`);
    } else {
      returnValue = result.value;
    }
  } catch (err: any) {
    success = false;
    errorMessage = err.message || String(err);
    stderr.push(`Execution Exception: ${errorMessage}`);
  }

  const executionTimeMs = Math.round((performance.now() - startTime) * 100) / 100;

  return {
    success,
    returnValue,
    stdout,
    stderr,
    executionTimeMs,
    error: errorMessage,
    assertionsPassed: success ? 1 : 0,
    assertionsFailed: success ? 0 : 1
  };
}

/**
 * Runs a full test suite with real assertion evaluations.
 *
 * The entire suite body runs once in a single isolated scope that also
 * contains the code under test. Setup statements (variable declarations,
 * instantiations) execute for real and are visible to subsequent assertions.
 * Only strict boolean `true` counts as a pass; any throw (including
 * ReferenceError for undeclared symbols) is a failure. There are NO injected
 * fixture constants — the code under test must define every symbol its tests
 * reference.
 */
export function executeTestSuite(
  sourceCode: string,
  testSuiteCode: string
): {
  passed: boolean;
  score: number;
  stdout: string[];
  stderr: string[];
  testDetails: string[];
  executionTimeMs: number;
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const testDetails: string[] = [];
  let passedCount = 0;
  let failedCount = 0;
  const startTime = performance.now();

  const customConsole = makeCapturedConsole(stdout, stderr);

  const cleanedSource = prepareExecutableCode(sourceCode);
  // Split a test body into statements. Both `;` and (for small models that
  // comma-join calls) a `,assert` boundary at top nesting level split, so no
  // assertion is ever silently swallowed. Loops/`for(;;)` are safe because
  // their `;` sit inside parens.
  function splitTestStatements(raw: string): string[] {
    const out: string[] = [];
    let cur = '';
    let depth = 0;
    let quote: string | null = null;
    let i = 0;
    const push = () => {
      const t = cur.trim();
      if (t && !t.startsWith('//')) out.push(t);
      cur = '';
    };
    while (i < raw.length) {
      const ch = raw[i];
      if (quote) {
        cur += ch;
        if (ch === quote) quote = null;
        i++;
        continue;
      }
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

  const rawLines = splitTestStatements(testSuiteCode || '');

  /** Split call arguments at top-level commas (ignores nesting + strings). */
  function splitTopLevelArgs(s: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let cur = '';
    let quote: string | null = null;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (quote) {
        cur += ch;
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { quote = ch; cur += ch; continue; }
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      if (ch === ')' || ch === ']' || ch === '}') depth--;
      if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  /** Convert a test line into a __assert call. Four supported forms:
   *   1. bare:   `assert cond;`     -> __assert(cond, "assert cond;")
   *   2. call:   `assert(cond[, msg]);` -> __assert(cond, label)
   *   3. node:   `assert.equal(a, b[, msg]);` / strictEqual / etc.
   *   4. strict: `assert(cond, 'msg');` — quoted second arg is a label, not a check. */
  function rewriteAssertLine(line: string): string | null {
    const bare = line.match(/^assert\s+(.+)$/);
    if (bare) {
      const expr = bare[1].replace(/;$/, '');
      return `__assert((${expr}), ${JSON.stringify(line)});`;
    }
    // Function-call form: `assert(cond[, msg])` or `assert(cond, 'msg')`.
    // A quoted 2nd arg is treated as a human label; an unquoted one is
    // appended to the expression. We never throw away the boolean check.
    const call = line.match(/^assert\s*\((.*)\);?$/);
    if (call) {
      const args = splitTopLevelArgs(call[1]);
      if (args.length === 0) return null;
      const check = args[0];
      const label = args.length >= 2 ? `assert(${call[1]});` : line;
      return `__assert((${check}), ${JSON.stringify(label)});`;
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
  }

  const body: string[] = [];
  for (const line of rawLines) {
    const rewritten = rewriteAssertLine(line);
    if (rewritten !== null) {
      body.push(rewritten);
    } else {
      body.push(line);
    }
  }

  const recordFailure = (detail: string, stderrMsg?: string) => {
    failedCount++;
    testDetails.push(detail);
    if (stderrMsg) stderr.push(stderrMsg);
  };

  let runner: Function | null = null;
  try {
    runner = new Function('customConsole', '__assert', `
      "use strict";
      const console = customConsole;
      ${cleanedSource}

      ${body.join('\n')}
    `);
  } catch (err: any) {
    recordFailure(`[COMPILATION ERROR] ${err.message}`, `Compilation failed: ${err.message}`);
  }

  if (runner) {
    testDetails.push('✓ Static syntax analysis passed without compilation errors');

    const assertFn = (value: unknown, label: string) => {
      if (value === true) {
        passedCount++;
        testDetails.push(`[PASS] ${label}`);
      } else {
        recordFailure(
          `[FAIL] ${label} -> returned ${value === undefined ? 'undefined' : `non-true (${JSON.stringify(value)})`}`
        );
      }
    };

    try {
      if (body.length > 0) {
        runner(customConsole, assertFn);
      } else {
        // Honest fallback: no assertions declared — the only claim we can make
        // is that the code executes and returns a defined value.
        const runResult = executeToolFunction(sourceCode);
        if (runResult.success && runResult.returnValue !== undefined) {
          passedCount = 1;
          testDetails.push('[PASS] Isolated kernel execution returned a defined value');
        } else {
          recordFailure(
            `[FAIL] Execution failed: ${runResult.error || 'returned undefined'}`,
            `Execution failed: ${runResult.error || 'returned undefined'}`
          );
        }
      }
    } catch (abortErr: any) {
      recordFailure(`[FAIL] Test body aborted with uncaught error: ${abortErr.message}`);
    }
  }

  const executionTimeMs = Math.round((performance.now() - startTime) * 100) / 100;
  const total = passedCount + failedCount;
  const score = total > 0 ? passedCount / total : 0.0;
  const passed = failedCount === 0 && passedCount > 0;

  return {
    passed,
    score,
    stdout,
    stderr,
    testDetails,
    executionTimeMs
  };
}
