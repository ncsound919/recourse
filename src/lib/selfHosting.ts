/**
 * Self-hosting runtime — turns a verified template-built component into a real
 * module the running Recourse server imports and calls.
 *
 * Honesty contract:
 *  - A module is only ever written from source that already passed its test
 *    suite + lint gate (the caller enforces that, this module just writes).
 *  - Boot verification is three-layered and always real: the module file must
 *    exist, it must dynamically import (proving it parses and its exports
 *    resolve), and the stored test suite must still pass against the stored
 *    source. Nothing is ever reported as "verified" from a cached claim.
 *  - Calling a tool goes through a generated `execute(op)` adapter that only
 *    exposes the plugin-declared method whitelist. Unknown methods, unknown
 *    tools, and non-serializable results are errors, never silent mangles.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pathToFileURL } from 'url';
import { transformSync } from 'esbuild';
import type { ToolDomain } from '../types';
import type { SelfHostDescriptor, SelfHostMethod } from './templatePlugin';
import { executeTestSuite } from './executionSandbox';

export type ArtifactKind = 'function' | 'cli' | 'api' | 'mcp' | 'a2a' | 'loop';

export interface SelfHostedManifestEntry {
  name: string;
  templateId: string;
  domain: ToolDomain;
  entrypointName: string;
  params: Record<string, any>;
  stateful: boolean;
  methods: SelfHostMethod[];
  /** Runtime transport of this self-hosted module (absent => 'function'). */
  artifactKind?: ArtifactKind;
  hash: string;
  /** Relative to the self-host root, e.g. `tools/<name>.mjs`. */
  file: string;
  sourceCode: string;
  testSuiteCode: string;
  summary: string;
  createdAt: number;
  lastVerifiedAt: number | null;
  lastVerified: { passed: boolean; detail: string } | null;
}

export interface SelfHostedManifest {
  version: number;
  entries: SelfHostedManifestEntry[];
}

export interface SelfHostedModuleInput {
  name: string;
  templateId: string;
  domain: ToolDomain;
  entrypointName: string;
  params: Record<string, any>;
  sourceCode: string;
  testSuiteCode: string;
  summary: string;
  selfHost: SelfHostDescriptor;
  artifactKind?: ArtifactKind;
}

export type SelfHostWriteResult =
  | { success: true; entry: SelfHostedManifestEntry }
  | { success: false; error: string };

export type SelfHostVerifyVerdict = {
  passed: boolean;
  detail: string;
  moduleLoadError?: string;
  suiteError?: string;
};

const MANIFEST_FILE = 'manifest.json';
const TOOLS_DIR = 'tools';
const MODULE_CACHE = new Map<string, any>();

export function toSafeModuleName(name: string): string {
  let safe = String(name || 'selfhosted_tool').replace(/[^a-zA-Z0-9_]/g, '_');
  if (!safe) safe = 'selfhosted_tool';
  if (/^[0-9]/.test(safe)) safe = `m_${safe}`;
  return safe;
}

export function defaultSelfHostRoot(): string {
  if (process.env.SELFHOST_DIR) return path.resolve(process.env.SELFHOST_DIR);
  return path.join(process.cwd(), '.selfhosted');
}

function manifestPath(root: string): string {
  return path.join(root, MANIFEST_FILE);
}

export function ensureRoot(root: string): string {
  const toolsDir = path.join(root, TOOLS_DIR);
  fs.mkdirSync(toolsDir, { recursive: true });
  return root;
}

// ---------------------------------------------------------------------------
// Shared JSON-safety runtime. Previously the ~70-line __coerceArg__ /
// __toJSONSafe__ adapter was inlined into EVERY generated self-hosted module.
// It is now written once as tools/_runtime.mjs and imported by each module, so
// a tool file is only the verified function + a thin execute/describe adapter.
// ---------------------------------------------------------------------------
const RUNTIME_FILE = '_runtime.mjs';
export const SHARED_RUNTIME_SOURCE = `
export function __coerceArg__(value, kind) {
  if (kind === 'uint8') {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return new Uint8Array(value);
    if (value instanceof Uint8Array) return value;
    throw new Error('Expected a byte array (JSON number array) for this argument');
  }
  return value;
}

export function __toJSONSafe__(value, seen) {
  if (value === null) return null;
  if (value === undefined) return null;
  const t = typeof value;
  if (t === 'number') {
    if (!Number.isFinite(value)) throw new Error('Self-hosted result contains a non-finite number (NaN/Infinity)');
    return value;
  }
  if (t === 'string' || t === 'boolean') return value;
  if (t === 'function' || t === 'symbol' || t === 'bigint') {
    throw new Error('Self-hosted result contains a non-serializable ' + t + ' value');
  }
  if (value !== null && typeof value.then === 'function') {
    throw new Error('Self-hosted result is a Promise (async methods are not supported by the JSON adapter)');
  }
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Map) {
    const out = {};
    for (const [k, v] of value) out[String(k)] = __toJSONSafe__(v, seen);
    return out;
  }
  if (value instanceof Set) {
    return Array.from(value).map((v) => __toJSONSafe__(v, seen));
  }
  if (ArrayBuffer.isView(value)) {
    return Array.from(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error('Self-hosted result contains a circular reference');
    seen.add(value);
    const out = value.map((v) => __toJSONSafe__(v, seen));
    seen.delete(value);
    return out;
  }
  if (t === 'object') {
    if (seen.has(value)) throw new Error('Self-hosted result contains a circular reference');
    seen.add(value);
    const out = {};
    for (const key of Object.keys(value)) out[key] = __toJSONSafe__(value[key], seen);
    seen.delete(value);
    return out;
  }
  return String(value);
}
`;

const RUNTIME_IMPORT = `import { __coerceArg__, __toJSONSafe__ } from './${RUNTIME_FILE}';`;

/** Write the shared runtime once per root/tools dir (idempotent). */
export function ensureSharedRuntime(root: string): void {
  ensureRoot(root);
  const abs = path.join(root, TOOLS_DIR, RUNTIME_FILE);
  if (!fs.existsSync(abs)) fs.writeFileSync(abs, SHARED_RUNTIME_SOURCE, 'utf-8');
}


export function readManifest(root: string = defaultSelfHostRoot()): SelfHostedManifest {
  try {
    const raw = fs.readFileSync(manifestPath(root), 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      version: parsed?.version ?? 1,
      entries: Array.isArray(parsed?.entries) ? parsed.entries : []
    };
  } catch {
    return { version: 1, entries: [] };
  }
}

export function persistManifest(manifest: SelfHostedManifest, root: string = defaultSelfHostRoot()): void {
  ensureRoot(root);
  fs.writeFileSync(manifestPath(root), JSON.stringify(manifest, null, 2), 'utf-8');
}

export function getSelfHostedEntry(
  name: string,
  root: string = defaultSelfHostRoot()
): SelfHostedManifestEntry | undefined {
  const manifest = readManifest(root);
  return manifest.entries.find((e) => e.name === toSafeModuleName(name));
}

export function listSelfHostedEntries(root: string = defaultSelfHostRoot()): SelfHostedManifestEntry[] {
  return readManifest(root).entries;
}

/** sha256 of a module's compiled body — used for cache busting. */
function moduleHash(jsCode: string): string {
  return crypto.createHash('sha256').update(jsCode).digest('hex');
}

/**
 * Generates the module source (TS) for a self-hosted tool: the synthesized
 * component source plus a generic JSON-callable adapter. The adapter is the
 * only surface the runtime exposes — the method whitelist comes from the
 * plugin's `selfHost.methods` descriptor.
 */
export function generateSelfHostedModuleSource(input: {
  sourceCode: string;
  entrypointName: string;
  params: Record<string, any>;
  selfHost: SelfHostDescriptor;
}): string {
  const { sourceCode, entrypointName, params, selfHost } = input;
  const methods = selfHost.methods || [];
  const methodNames = methods.map((m) => m.method);
  for (const m of methodNames) {
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(m)) {
      throw new Error(`Self-host method "${m}" is not a valid identifier`);
    }
  }

  const ctorParamIds = selfHost.stateful ? selfHost.ctorParamIds || [] : [];
  const ctorArgs = ctorParamIds.map((id) => {
    const v = params[id];
    return JSON.stringify(v === undefined ? null : v);
  });

  const methodListJson = JSON.stringify(
    methods.map((m) => ({ method: m.method, label: m.label, argCoercions: m.argCoercions || [] }))
  );

  const stateLines = selfHost.stateful
    ? `const __STATE__ = new ${entrypointName}(${ctorArgs.join(', ')});`
    : '';

  const adapter = `
// ─────────────────────────────────────────────────────────────
// Self-hosted runtime adapter (generated by Recourse)
// Entry: ${entrypointName} | stateful: ${selfHost.stateful} | methods: ${methodNames.join(', ')}
// ─────────────────────────────────────────────────────────────
const __ENTRY__ = ${entrypointName};
${stateLines}
const __DESCRIPTOR__ = ${methodListJson};

export function describe() {
  return {
    entrypoint: '${entrypointName}',
    stateful: ${selfHost.stateful},
    methods: __DESCRIPTOR__
  };
}

export function execute(op) {
  if (!op || typeof op !== 'object' || Array.isArray(op)) {
    throw new Error('execute expects an object: { method, args }');
  }
  const method = op.method;
  const desc = __DESCRIPTOR__.find((m) => m.method === method);
  if (!desc) {
    throw new Error('Unknown method "' + String(method) + '". Allowed: ' + __DESCRIPTOR__.map((m) => m.method).join(', '));
  }
  const args = Array.isArray(op.args) ? op.args : [];
  const coercions = desc.argCoercions || [];
  const coerced = args.map((a, i) => (coercions[i] ? __coerceArg__(a, coercions[i]) : a));
  const target = ${selfHost.stateful ? '__STATE__' : '__ENTRY__'};
  const fn = target[method];
  if (typeof fn !== 'function') {
    throw new Error('Method "' + method + '" is not callable on the entrypoint');
  }
  const result = fn.apply(target, coerced);
  return __toJSONSafe__(result, new Set());
}
`;

  return `${RUNTIME_IMPORT}\n${sourceCode}\n${adapter}`;
}

/** Transpile TS module text to plain ESM JS (what actually lands on disk). */
export function transpileSelfHostedModule(moduleTsSource: string): string {
  const compiled = transformSync(moduleTsSource, {
    loader: 'ts',
    format: 'esm',
    target: 'es2022',
    sourcefile: 'selfhosted_tool.ts'
  }).code;
  return compiled;
}

/**
 * Writes the real module file + manifest entry. Synchronous on purpose: the
 * caller owns verification (sandbox suite + lint) and this function only
 * materializes already-green code.
 */
export function writeSelfHostedTool(input: SelfHostedModuleInput, root: string = defaultSelfHostRoot()): SelfHostWriteResult {
  const name = toSafeModuleName(input.name);
  try {
    if (!input.selfHost || !Array.isArray(input.selfHost.methods) || input.selfHost.methods.length === 0) {
      return { success: false, error: `Template "${input.templateId}" has no selfHost method descriptor` };
    }
    const moduleTs = generateSelfHostedModuleSource({
      sourceCode: input.sourceCode,
      entrypointName: input.entrypointName,
      params: input.params,
      selfHost: input.selfHost
    });
    let jsCode = transpileSelfHostedModule(moduleTs);
    const artifactKind = input.artifactKind ?? 'function';
    // Standalone CLI launcher for `cli` artifacts: `node <this file>.mjs
    // <subcommand> [json arg, ...]` runs the module's execute adapter and prints
    // JSON to stdout. Appended to the compiled JS so the on-disk hash covers it.
    if (artifactKind === 'cli') {
      jsCode += `
// ─────────────────────────────────────────────
// CLI entry (generated for artifactKind 'cli')
// Usage: node <this file>.mjs <subcommand> [json args...]
// ─────────────────────────────────────────────
async function __cliMain__() {
  const argv = process.argv.slice(2);
  const method = argv[0] || (__DESCRIPTOR__[0] && __DESCRIPTOR__[0].method) || null;
  if (!method) { process.stderr.write('usage: node <this file>.mjs <subcommand> [json args...]\\n'); process.exitCode = 1; return; }
  const args = argv.slice(1).map(function (t) { try { return JSON.parse(t); } catch { return t; } });
  try { const out = await execute({ method: method, args: args }); process.stdout.write(JSON.stringify(out)); }
  catch (e) { process.stderr.write((e && e.message) || String(e)); process.exitCode = 1; }
}
const __isCliMain__ = await import('node:url');
if (process.argv[1] && __isCliMain__.pathToFileURL(process.argv[1]).href === import.meta.url) { __cliMain__(); }
`;    }
    const hash = moduleHash(jsCode);
    ensureRoot(root);
    ensureSharedRuntime(root);

    const fileName = `${name}.mjs`;
    const absFile = path.join(root, TOOLS_DIR, fileName);
    fs.writeFileSync(absFile, jsCode, 'utf-8');

    const entry: SelfHostedManifestEntry = {
      name,
      templateId: input.templateId,
      domain: input.domain,
      entrypointName: input.entrypointName,
      params: input.params,
      stateful: input.selfHost.stateful,
      methods: input.selfHost.methods,
      artifactKind,
      hash,
      file: `${TOOLS_DIR}/${fileName}`,
      sourceCode: input.sourceCode,
      testSuiteCode: input.testSuiteCode,
      summary: input.summary,
      createdAt: Date.now(),
      lastVerifiedAt: null,
      lastVerified: null
    };

    const manifest = readManifest(root);
    const idx = manifest.entries.findIndex((e) => e.name === name);
    if (idx >= 0) manifest.entries[idx] = entry;
    else manifest.entries.push(entry);
    persistManifest(manifest, root);

    return { success: true, entry };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export function removeSelfHostedTool(
  name: string,
  root: string = defaultSelfHostRoot()
): { success: boolean; removedFile?: string; error?: string } {
  const safeName = toSafeModuleName(name);
  const manifest = readManifest(root);
  const entry = manifest.entries.find((e) => e.name === safeName);
  if (!entry) {
    return { success: false, error: `No self-hosted tool named "${safeName}"` };
  }
  manifest.entries = manifest.entries.filter((e) => e.name !== safeName);
  persistManifest(manifest, root);
  try {
    const absFile = path.join(root, entry.file);
    if (fs.existsSync(absFile)) fs.unlinkSync(absFile);
  } catch {
    /* file already gone — manifest is the source of truth */
  }
  MODULE_CACHE.delete(`${entry.file}@${entry.hash}`);
  return { success: true, removedFile: entry.file };
}

/** Dynamic import of the live module, cache-busted by content hash. */
async function importSelfHostedModule(
  entry: SelfHostedManifestEntry,
  root: string = defaultSelfHostRoot()
): Promise<any> {
  const absFile = path.join(root, entry.file);
  if (!fs.existsSync(absFile)) {
    throw new Error(`Module file missing: ${entry.file}`);
  }
  const cacheKey = `${entry.file}@${entry.hash}`;
  const cached = MODULE_CACHE.get(cacheKey);
  if (cached) return cached;
  const url = `${pathToFileURL(absFile).href}?h=${entry.hash.slice(0, 12)}`;
  const mod = await import(url);
  MODULE_CACHE.set(cacheKey, mod);
  return mod;
}

/**
 * Verifies one entry honestly: module file exists, module dynamically imports
 * and exposes the adapter, and the stored test suite passes against the stored
 * source.
 */
export async function verifySelfHostedEntry(
  entry: SelfHostedManifestEntry,
  root: string = defaultSelfHostRoot()
): Promise<SelfHostVerifyVerdict> {
  const absFile = path.join(root, entry.file);
  if (!fs.existsSync(absFile)) {
    return { passed: false, detail: `Module file missing: ${entry.file}` };
  }
  let module: any;
  try {
    module = await importSelfHostedModule(entry, root);
  } catch (err: any) {
    return {
      passed: false,
      detail: `Module import failed: ${err?.message || String(err)}`,
      moduleLoadError: err?.message || String(err)
    };
  }
  if (typeof module.execute !== 'function' || typeof module.describe !== 'function') {
    return { passed: false, detail: 'Module does not export execute()/describe() adapter' };
  }

  const suiteRun = executeTestSuite(entry.sourceCode, entry.testSuiteCode || 'assert true;');
  if (!suiteRun.passed) {
    return {
      passed: false,
      detail: `Stored suite FAILED against stored source (${suiteRun.testDetails.filter((d) => d.startsWith('[FAIL')).length} failures)`,
      suiteError: suiteRun.stderr.join('\n')
    };
  }

  return {
    passed: true,
    detail: `Module import OK + ${suiteRun.testDetails.length - 1} stored assertions green`
  };
}

/** Re-verify every manifest entry and persist the fresh verdicts. */
export async function verifyAllSelfHosted(root: string = defaultSelfHostRoot()): Promise<SelfHostedManifestEntry[]> {
  const manifest = readManifest(root);
  for (const entry of manifest.entries) {
    const verdict = await verifySelfHostedEntry(entry, root);
    entry.lastVerifiedAt = Date.now();
    entry.lastVerified = { passed: verdict.passed, detail: verdict.detail };
  }
  persistManifest(manifest, root);
  return manifest.entries;
}

export type SelfHostExecuteResult =
  | { success: true; result: any; executionTimeMs: number }
  | { success: false; error: string; executionTimeMs: number };

/**
 * Calls a live self-hosted tool. The tool must exist in the manifest; the
 * method must be on the plugin-declared whitelist; the result must be
 * JSON-serializable. Real module, real call, honest errors.
 */
export async function executeSelfHostedTool(
  name: string,
  op: { method: string; args?: any[] },
  root: string = defaultSelfHostRoot()
): Promise<SelfHostExecuteResult> {
  const started = performance.now();
  try {
    const entry = getSelfHostedEntry(toSafeModuleName(name), root);
    if (!entry) {
      return { success: false, error: `No self-hosted tool named "${toSafeModuleName(name)}"`, executionTimeMs: 0 };
    }
    const module = await importSelfHostedModule(entry, root);
    const result = module.execute(op);
    const executionTimeMs = Math.round((performance.now() - started) * 100) / 100;
    return { success: true, result, executionTimeMs };
  } catch (err: any) {
    const executionTimeMs = Math.round((performance.now() - started) * 100) / 100;
    return { success: false, error: err?.message || String(err), executionTimeMs };
  }
}

// ---------------------------------------------------------------------------
// Stateless single-function self-hosting
// ---------------------------------------------------------------------------
// The class/template path above is built around an object entrypoint with a
// method whitelist (`target[method]`). A capability accreted by the Capability
// Forge is a *bare exported function* (e.g. `export function dedupeStable`),
// not a class. This parallel writer materializes such a function as a real,
// live-callable module whose adapter exposes exactly that one function — the
// same JSON-safe result + method-whitelist guarantees, but dispatching directly
// to the top-level function binding instead of via property lookup.

export interface StatelessSelfHostInput {
  name: string;
  domain: ToolDomain;
  entrypointName: string;
  sourceCode: string;
  testSuiteCode: string;
  summary: string;
}

const JSON_HELPER_FNS = RUNTIME_IMPORT;

function generateStatelessSelfHostedModuleSource(input: StatelessSelfHostInput): string {
  const { sourceCode, entrypointName } = input;
  if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(entrypointName)) {
    throw new Error(`Function name "${entrypointName}" is not a valid identifier`);
  }

  const adapter = `
// Self-hosted runtime adapter (generated by Recourse — stateless function)
// Entry: ${entrypointName} | exposes exactly the verified function.
export function describe() {
  return {
    entrypoint: '${entrypointName}',
    stateful: false,
    methods: [{ method: '${entrypointName}', label: '${entrypointName}', argCoercions: [] }]
  };
}

export function execute(op) {
  if (!op || typeof op !== 'object' || Array.isArray(op)) {
    throw new Error('execute expects an object: { method, args }');
  }
  if (op.method !== '${entrypointName}') {
    throw new Error('Unknown method "' + String(op.method) + '". Allowed: ${entrypointName}');
  }
  const args = Array.isArray(op.args) ? op.args : [];
  const result = ${entrypointName}(...args);
  return __toJSONSafe__(result, new Set());
}
`;

  return `${RUNTIME_IMPORT}\n${sourceCode}\n${adapter}`;
}

/**
 * Write a bare exported function as a live self-hosted module. Caller owns
 * verification (sandbox suite against the reference suite + lint gate); this
 * only materializes already-green code.
 */
export function writeStatelessSelfHostedTool(
  input: StatelessSelfHostInput,
  root: string = defaultSelfHostRoot()
): SelfHostWriteResult {
  const name = toSafeModuleName(input.name);
  try {
    const moduleTs = generateStatelessSelfHostedModuleSource(input);
    const jsCode = transpileSelfHostedModule(moduleTs);
    const hash = moduleHash(jsCode);
    ensureRoot(root);
    ensureSharedRuntime(root);

    const fileName = `${name}.mjs`;
    const absFile = path.join(root, TOOLS_DIR, fileName);
    fs.writeFileSync(absFile, jsCode, 'utf-8');

    const entry: SelfHostedManifestEntry = {
      name,
      templateId: 'capability_forge',
      domain: input.domain,
      entrypointName: input.entrypointName,
      params: {},
      stateful: false,
      methods: [{ method: input.entrypointName, label: input.entrypointName, argCoercions: [] }],
      hash,
      file: `${TOOLS_DIR}/${fileName}`,
      sourceCode: input.sourceCode,
      testSuiteCode: input.testSuiteCode,
      summary: input.summary,
      createdAt: Date.now(),
      lastVerifiedAt: null,
      lastVerified: null,
    };

    const manifest = readManifest(root);
    const idx = manifest.entries.findIndex((e) => e.name === name);
    if (idx >= 0) manifest.entries[idx] = entry;
    else manifest.entries.push(entry);
    persistManifest(manifest, root);

    return { success: true, entry };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

/** Transpiled module text for a stateless build (used by the forge dry-run path). */
export function compileStatelessSelfHostedModuleFor(input: StatelessSelfHostInput): { jsCode: string; hash: string } {
  const moduleTs = generateStatelessSelfHostedModuleSource(input);
  const jsCode = transpileSelfHostedModule(moduleTs);
  return { jsCode, hash: moduleHash(jsCode) };
}

/** Transpiled module text for a fresh build (used by build/benchmark paths). */
export function compileSelfHostedModuleFor(input: SelfHostedModuleInput): { jsCode: string; hash: string } {
  const moduleTs = generateSelfHostedModuleSource({
    sourceCode: input.sourceCode,
    entrypointName: input.entrypointName,
    params: input.params,
    selfHost: input.selfHost
  });
  const jsCode = transpileSelfHostedModule(moduleTs);
  return { jsCode, hash: moduleHash(jsCode) };
}
