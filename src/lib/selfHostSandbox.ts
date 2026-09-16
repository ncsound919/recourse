/**
 * Sandboxed execution + verification for self-hosted tools.
 *
 * This is the bridge between the self-hosting manifest (selfHosting.ts) and the
 * capability sandbox (wasmSandbox/). A tool's stored source is compiled into a
 * self-contained QuickJS guest program; every host capability it touches is
 * grant-checked (default deny). Stateful tools keep a persistent guest context,
 * so their behaviour matches the direct-import path.
 *
 * Nothing here fabricates a result: if the sandbox is unavailable or a tool
 * cannot be represented as a guest program, the failure is reported with a
 * machine-readable `kind` and the caller decides whether to fall back.
 */
import crypto from 'crypto';
import { buildGuestProgram, SHARED_RUNTIME_SOURCE, type SelfHostedManifestEntry } from './selfHosting';
import { buildSuiteStatements, prepareExecutableCode } from './executionSandbox';
import { SandboxHost } from './wasmSandbox/host';
import { QuickJsRuntime } from './wasmSandbox/quickjsRuntime';
import { createNodeDrivers, defaultSandboxFsRoot, type NodeDrivers } from './wasmSandbox/drivers';
import type { CapabilityGrants, GrantUseRecord, SandboxLimits, ToolExecutionRequest } from './wasmSandbox/types';

export type SandboxFailureKind = 'unavailable' | 'setup' | 'denied' | 'tool_error';

export interface SandboxExecuteResult {
  success: boolean;
  result?: unknown;
  error?: string;
  failureKind?: SandboxFailureKind;
  grantUse: GrantUseRecord[];
  executionTimeMs: number;
}

export interface SandboxSuiteResult {
  passed: boolean;
  score: number;
  stdout: string[];
  stderr: string[];
  testDetails: string[];
  executionTimeMs: number;
}

export interface SelfHostSandboxOptions {
  fsRoot?: string;
  timeoutMs?: number;
  memoryBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MEMORY_BYTES = 64 * 1024 * 1024;

let sharedRuntime: QuickJsRuntime | null = null;
let sharedDrivers: NodeDrivers | null = null;
let availabilityProbe: Promise<boolean> | null = null;
let spendSinkHook: ((cents: number, description: string, budgetToken: string) => void) | null = null;

/**
 * Install a process-wide spend sink. Called after the sandbox grant allows a
 * spend, so it can enforce a real budget (the wallet) and throw to refuse the
 * debit. The grant says *may*; the sink says *how much is left*.
 */
export function setSandboxSpendSink(fn: ((cents: number, description: string, budgetToken: string) => void) | null): void {
  spendSinkHook = fn;
}

/** The persistent QuickJS runtime (one guest context per tool+program). */
export function getSandboxRuntime(): QuickJsRuntime {
  if (!sharedRuntime) sharedRuntime = new QuickJsRuntime();
  return sharedRuntime;
}

function getDrivers(opts: SelfHostSandboxOptions): NodeDrivers {
  if (!sharedDrivers || (opts.fsRoot && sharedDrivers.fsRoot !== opts.fsRoot)) {
    sharedDrivers = createNodeDrivers({ fsRoot: opts.fsRoot ?? defaultSandboxFsRoot() });
  }
  return sharedDrivers;
}

/** True when quickjs-emscripten is installed and loadable. */
export async function isSandboxRuntimeAvailable(): Promise<boolean> {
  if (!availabilityProbe) {
    availabilityProbe = (async () => {
      try {
        const mod: any = await import(/* @vite-ignore */ 'quickjs-emscripten');
        const getQuickJS = mod.getQuickJS ?? mod.default?.getQuickJS;
        if (typeof getQuickJS !== 'function') return false;
        await getQuickJS();
        return true;
      } catch {
        return false;
      }
    })();
  }
  return availabilityProbe;
}

/** Drop every cached guest context (e.g. after a tool is re-written/removed). */
export function resetSandbox(): void {
  sharedRuntime?.reset();
}

function limitsFrom(opts: SelfHostSandboxOptions): SandboxLimits {
  const envTimeout = Number(process.env.SELFHOST_SANDBOX_TIMEOUT_MS);
  return {
    wallClockMs: opts.timeoutMs ?? (Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : DEFAULT_TIMEOUT_MS),
    memoryBytes: opts.memoryBytes ?? DEFAULT_MEMORY_BYTES,
  };
}

export class GuestSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GuestSetupError';
  }
}

/**
 * Compile a manifest entry into a QuickJS guest program. Throws
 * GuestSetupError when the entry cannot be represented (legacy stateful entry
 * missing its constructor params, invalid identifiers, …).
 */
export function buildGuestProgramFromEntry(entry: SelfHostedManifestEntry): { program: string; hash: string } {
  const kind: 'class' | 'function' =
    entry.entrypointKind ?? (entry.templateId === 'capability_forge' ? 'function' : 'class');

  let ctorArgs: any[] = [];
  if (kind === 'class' && entry.stateful) {
    const params = entry.params || {};
    if (entry.ctorParamIds === undefined && Object.keys(params).length > 0) {
      throw new GuestSetupError(
        `stateful tool "${entry.name}" predates ctorParamIds storage; cannot reconstruct constructor args`,
      );
    }
    ctorArgs = (entry.ctorParamIds ?? []).map((id) => params[id]);
  }

  try {
    return buildGuestProgram({
      mode: kind,
      sourceCode: entry.sourceCode,
      entrypointName: entry.entrypointName,
      methods: entry.methods,
      stateful: Boolean(entry.stateful),
      ctorArgs,
    });
  } catch (err) {
    throw new GuestSetupError(err instanceof Error ? err.message : String(err));
  }
}

function classifyFailure(error: string | undefined): SandboxFailureKind {
  if (!error) return 'tool_error';
  if (/denied:/.test(error)) return 'denied';
  if (/guest setup error/.test(error)) return 'setup';
  if (/not installed|not expose getQuickJS|Cannot find module/.test(error)) return 'unavailable';
  return 'tool_error';
}

/** Run one invocation of a self-hosted tool inside the sandbox. */
export async function executeSelfHostedSandboxed(
  entry: SelfHostedManifestEntry,
  op: { method: string; args?: any[] },
  opts: SelfHostSandboxOptions = {},
): Promise<SandboxExecuteResult> {
  const started = performance.now();
  const elapsed = () => Math.round((performance.now() - started) * 100) / 100;

  let compiled: { program: string; hash: string };
  try {
    compiled = buildGuestProgramFromEntry(entry);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      failureKind: 'setup',
      grantUse: [],
      executionTimeMs: elapsed(),
    };
  }

  if (!(await isSandboxRuntimeAvailable())) {
    return {
      success: false,
      error: 'quickjs-emscripten is not installed or does not expose getQuickJS()',
      failureKind: 'unavailable',
      grantUse: [],
      executionTimeMs: elapsed(),
    };
  }

  const grants: CapabilityGrants = entry.grants ?? {};
  const drivers = getDrivers(opts);
  const request: ToolExecutionRequest = {
    toolName: entry.name,
    code: compiled.program,
    input: op,
    grants,
    limits: limitsFrom(opts),
  };

  const host = new SandboxHost({
    runtime: getSandboxRuntime(),
    fsDriver: drivers.fsDriver,
    netDriver: drivers.netDriver,
    secretsSource: drivers.secretsSource,
    spendSink: (cents, description, budgetToken) => {
      drivers.spendSink(cents, description, budgetToken);
      spendSinkHook?.(cents, description, budgetToken);
    },
  });

  try {
    const result = await host.execute(request);
    if (result.ok) {
      return { success: true, result: result.value, grantUse: result.grantUse, executionTimeMs: elapsed() };
    }
    return {
      success: false,
      error: result.error || 'sandbox execution failed',
      failureKind: classifyFailure(result.error),
      grantUse: result.grantUse,
      executionTimeMs: elapsed(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: message,
      failureKind: /quickjs|Cannot find module|not installed/.test(message) ? 'unavailable' : 'tool_error',
      grantUse: [],
      executionTimeMs: elapsed(),
    };
  }
}

// ---------------------------------------------------------------------------
// Suite verification inside the sandbox
// ---------------------------------------------------------------------------

function buildSuiteGuestProgram(sourceCode: string, testSuiteCode: string): string {
  const { cleanedSource, statements } = buildSuiteStatements(sourceCode, testSuiteCode);
  const helpers = prepareExecutableCode(SHARED_RUNTIME_SOURCE);
  const prelude = `if (typeof console === 'undefined') {
  globalThis.console = { log: function () {}, warn: function () {}, error: function () {}, info: function () {} };
}`;
  return `"use strict";
${helpers}
${prelude}
var __results__ = [];
var __assert = function (value, label) {
  var ok = value === true;
  var actual = null;
  if (!ok) {
    try {
      if (typeof value === 'undefined') actual = 'undefined';
      else if (typeof value === 'function') actual = '[function]';
      else actual = JSON.stringify(value);
    } catch (e) { actual = String(value); }
  }
  __results__.push({ ok: ok, label: String(label), actual: actual });
};
${cleanedSource}
${statements.join('\n')}
globalThis.__recourse_dispatch = function () { var __out__ = __results__; __results__ = []; return __out__; };
`;
}

/**
 * Run a stored test suite inside the sandbox. Returns the same shape as
 * `executeTestSuite` so callers can drop it in. `ranInSandbox` is false when
 * the runtime is unavailable and the caller must use the in-process verifier.
 */
export async function verifySuiteInSandbox(
  sourceCode: string,
  testSuiteCode: string,
  opts: SelfHostSandboxOptions = {},
): Promise<(SandboxSuiteResult & { ranInSandbox: boolean }) | null> {
  const started = performance.now();
  const elapsed = () => Math.round((performance.now() - started) * 100) / 100;

  if (!(await isSandboxRuntimeAvailable())) return null;

  let program: string;
  try {
    program = buildSuiteGuestProgram(sourceCode, testSuiteCode);
  } catch {
    return null;
  }

  const drivers = getDrivers(opts);
  const host = new SandboxHost({
    runtime: getSharedSuiteRuntime(),
    fsDriver: drivers.fsDriver,
    netDriver: drivers.netDriver,
    secretsSource: drivers.secretsSource,
    spendSink: drivers.spendSink,
  });

  const suiteKey = `__suite__:${crypto.createHash('sha256').update(program).digest('hex').slice(0, 16)}`;
  let raw: any[] = [];
  try {
    const result = await host.execute({
      toolName: suiteKey,
      code: program,
      input: null,
      grants: {},
      limits: limitsFrom(opts),
    });
    if (!result.ok) {
      return {
        passed: false,
        score: 0,
        stdout: [],
        stderr: [result.error || 'sandbox suite run failed'],
        testDetails: [`[FAIL] suite aborted: ${result.error || 'unknown'}`],
        executionTimeMs: elapsed(),
        ranInSandbox: true,
      };
    }
    raw = Array.isArray(result.value) ? result.value : [];
  } catch (err) {
    return {
      passed: false,
      score: 0,
      stdout: [],
      stderr: [err instanceof Error ? err.message : String(err)],
      testDetails: [`[FAIL] suite aborted: ${err instanceof Error ? err.message : String(err)}`],
      executionTimeMs: elapsed(),
      ranInSandbox: true,
    };
  }

  const testDetails: string[] = ['✓ Static syntax analysis passed without compilation errors'];
  let passedCount = 0;
  let failedCount = 0;
  for (const item of raw) {
    const label = String(item?.label ?? 'assertion');
    if (item?.ok === true) {
      passedCount++;
      testDetails.push(`[PASS] ${label}`);
    } else {
      failedCount++;
      const actual = item?.actual ?? 'undefined';
      testDetails.push(`[FAIL] ${label} -> returned non-true (${actual})`);
    }
  }
  const total = passedCount + failedCount;
  return {
    passed: failedCount === 0 && passedCount > 0,
    score: total > 0 ? passedCount / total : 0,
    stdout: [],
    stderr: failedCount > 0 ? [`${failedCount} assertion(s) failed in sandbox`] : [],
    testDetails,
    executionTimeMs: elapsed(),
    ranInSandbox: true,
  };
}

// A suite run does not need persistent state; use a separate runtime so a
// pathologically long-running suite can be reset without disturbing tools.
let suiteRuntime: QuickJsRuntime | null = null;
function getSharedSuiteRuntime(): QuickJsRuntime {
  if (!suiteRuntime) suiteRuntime = new QuickJsRuntime({ maxContexts: 8 });
  return suiteRuntime;
}
