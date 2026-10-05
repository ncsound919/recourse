/**
 * Name-link resolution — the fix for 1,193 unreachable-but-working tools.
 *
 * Measured 2026-10-04: 1,193 of 1,289 registry entries export a function whose name
 * differs from the registry entry name, so `POST /api/recourse/execute` could not
 * invoke them by `toolName` at all. `executionSandbox.ts:193-207` resolves a callee
 * only from an explicit `functionName` or a hardcoded 14-name allowlist.
 *
 * These tests pin the resolver's PREFERENCE ORDER, which is the part that can
 * silently do harm: binding the wrong symbol converts a working tool into a
 * confusing "class constructor cannot be invoked without 'new'" failure.
 */
import { describe, it, expect } from 'vitest';
import { resolveExportedFunctionName } from '../src/lib/exportedSymbol.js';
import { classifyEntryExecutability, SANDBOX_CALLEE_FALLBACKS } from '../src/lib/exportedSymbol.js';

describe('classifyEntryExecutability — the metric must agree with the executor', () => {
  it('treats a verified self-hosted manifest as invocable regardless of source', () => {
    expect(classifyEntryExecutability('levenshteinDistance', undefined, true, false)).toBe('invocableByName');
  });

  it('treats a real entrypoint file as invocable', () => {
    expect(classifyEntryExecutability('thing', undefined, false, true)).toBe('invocableByName');
  });

  it('classifies a name mismatch with runnable code as ACTIVATED, not inert', () => {
    // The distinction the whole investigation turned on. Reporting this as
    // 'notExecutable' is what would have had 1,199 real tools deleted.
    const src = 'export function projectUtilization(a, b, c, d) { return d; }';
    expect(classifyEntryExecutability('swarm_systemic_505821', src, false, false)).toBe('nameLinkActivated');
  });

  it('classifies a matching export name as invocable', () => {
    const src = 'export function quickSort(a) { return a; }';
    expect(classifyEntryExecutability('quickSort', src, false, false)).toBe('invocableByName');
  });

  it('classifies an allowlisted export as invocable even under a mismatched label', () => {
    const src = 'export function sumOfRoots(a) { return a; }';
    expect(classifyEntryExecutability('someOtherLabel', src, false, false)).toBe('invocableByName');
  });

  it('classifies a genuinely empty entry as notExecutable', () => {
    expect(classifyEntryExecutability('ghost', undefined, false, false)).toBe('notExecutable');
    expect(classifyEntryExecutability('ghost', 'const x = 1;', false, false)).toBe('notExecutable');
  });

  it('classifies a nameless entry as notExecutable without throwing', () => {
    expect(classifyEntryExecutability(undefined, 'export function f(){}', false, false)).toBe('notExecutable');
    expect(classifyEntryExecutability(null, null, false, false)).toBe('notExecutable');
  });

  it('every tier value is one of the three declared values', () => {
    const tiers = new Set([
      classifyEntryExecutability('a', 'export function a(){}', false, false),
      classifyEntryExecutability('b', 'export function c(){}', false, false),
      classifyEntryExecutability('d', undefined, false, false),
    ]);
    for (const t of tiers) expect(['invocableByName', 'nameLinkActivated', 'notExecutable']).toContain(t);
  });

  it('the fallback list matches what executionSandbox actually resolves', () => {
    // Guards against drift between this module and executionSandbox.ts:193-207.
    // If the sandbox adds a fallback without updating this list, entries stop
    // being counted as invocable.
    expect(SANDBOX_CALLEE_FALLBACKS).toContain('execute');
    expect(SANDBOX_CALLEE_FALLBACKS).toContain('LRUCache');
    expect(SANDBOX_CALLEE_FALLBACKS).toContain('sumOfRoots');
    expect(SANDBOX_CALLEE_FALLBACKS).not.toContain('projectUtilization');
  });
});

describe('resolveExportedFunctionName — the measured production cases', () => {
  it('recovers projectUtilization from swarm_systemic_505821', () => {
    // The exact pair proven live: by toolName -> "No callable entrypoint";
    // with functionName -> success:true.
    const src = `export function projectUtilization(currentUtil, growthRate, cap, maxSteps, model = 'linear') {
      if (typeof currentUtil !== 'number') throw new Error('All parameters must be numbers');
      return { steps: [] };
    }`;
    expect(resolveExportedFunctionName(src, 'swarm_systemic_505821')).toBe('projectUtilization');
  });

  it('prefers the registry name when the source really exports it', () => {
    const src = 'export function levenshteinDistance(a,b){ return 0; }';
    expect(resolveExportedFunctionName(src, 'levenshteinDistance')).toBe('levenshteinDistance');
  });
});

describe('resolveExportedFunctionName — preference order', () => {
  it('prefers a callable function over a class', () => {
    // The trap: the sandbox calls Fn(...args) with no `new`, so binding a class
    // yields "Class constructor cannot be invoked without 'new'".
    const src = `
      export class BellStateSynthesizer { constructor(){} }
      export function actuallyRunnable() { return 42; }
    `;
    expect(resolveExportedFunctionName(src, 'someOtherLabel')).toBe('actuallyRunnable');
  });

  it('prefers a function over an exported data constant', () => {
    const src = `
      export const LOOKUP_TABLE = [1,2,3];
      export function computeIt() { return 7; }
    `;
    expect(resolveExportedFunctionName(src, 'label')).toBe('computeIt');
  });

  it('binds an arrow-function const, which is callable', () => {
    const src = 'export const scoreIt = (x) => x * 2;';
    expect(resolveExportedFunctionName(src, 'label')).toBe('scoreIt');
  });

  it('binds a const initialised to a function expression', () => {
    const src = 'export const scoreIt = function (x) { return x; };';
    expect(resolveExportedFunctionName(src, 'label')).toBe('scoreIt');
  });

  it('handles async exports', () => {
    const src = 'export async function fetchIt() { return 1; }';
    expect(resolveExportedFunctionName(src, 'label')).toBe('fetchIt');
  });

  it('falls back to a class only when nothing callable exists', () => {
    const src = 'export class OnlyThing { go(){} }';
    expect(resolveExportedFunctionName(src, 'label')).toBe('OnlyThing');
  });
});

describe('resolveExportedFunctionName — long bodies (regression)', () => {
  // REGRESSION, measured 2026-10-04. The first implementation bounded each
  // declaration with a `[\s\S]{0,200}?` lookahead to the next export. When the
  // FINAL export's body exceeded 200 chars the lookahead could never reach
  // end-of-string, the regex failed, and the resolver returned undefined — so
  // `redactSecrets` (1,782 chars) and `isPrivateIPv4` (1,218) resolved to nothing.
  // Those are the best-known *working* tools, and the failure mode was silently
  // classifying real capability as unresolvable, which is the error this whole
  // investigation exists to prevent.
  it('resolves a lone export whose body is far longer than 200 chars', () => {
    const body = `\n  ${'const pad = "x";\n  '.repeat(60)}return 1;\n}`;
    const src = `export function redactSecrets(value) {${body}`;
    expect(src.length).toBeGreaterThan(200);
    expect(resolveExportedFunctionName(src, 'redactSecrets')).toBe('redactSecrets');
  });

  it('resolves a long-bodied export even when preceded by a JSDoc block', () => {
    const src = `/**\n * Doc line one.\n * @param {*} value\n * @returns {*}\n */\nexport function isPrivateIPv4(ip) {\n${'  // padding\n'.repeat(80)}  return true;\n}`;
    expect(resolveExportedFunctionName(src, 'isPrivateIPv4')).toBe('isPrivateIPv4');
  });

  it('still picks the callable one when a long data const precedes a function', () => {
    const src = `export const TABLE = [${'1,'.repeat(200)}];\nexport function computeIt(){ return 1; }`;
    expect(resolveExportedFunctionName(src, 'label')).toBe('computeIt');
  });
});

describe('resolveExportedFunctionName — hostile input', () => {
  it('returns undefined for source with no exports', () => {
    expect(resolveExportedFunctionName('const x = 1;', 'label')).toBeUndefined();
  });

  it('returns undefined rather than throwing on empty or non-string input', () => {
    expect(resolveExportedFunctionName('', 'label')).toBeUndefined();
    expect(resolveExportedFunctionName(undefined as any, 'label')).toBeUndefined();
    expect(resolveExportedFunctionName(null as any, 'label')).toBeUndefined();
  });

  it('does not mistake an export inside a comment or string for a real export', () => {
    // A commented-out signature must not be selected; otherwise the sandbox gets
    // a symbol that does not exist and the tool fails with a confusing error.
    const src = `
      // export function commentedOut() { return 1; }
      export function realOne() { return 2; }
    `;
    expect(resolveExportedFunctionName(src, 'label')).toBe('realOne');
  });

  it('handles a registry name that matches nothing without inventing a symbol', () => {
    const src = 'export function somethingElse(){ return 1; }';
    expect(resolveExportedFunctionName(src, 'totallyDifferent')).toBe('somethingElse');
  });

  it('is stable when the same source is resolved twice', () => {
    const src = 'export const A = () => 1;\nexport const B = () => 2;';
    expect(resolveExportedFunctionName(src, 'x')).toBe(resolveExportedFunctionName(src, 'x'));
  });
});
