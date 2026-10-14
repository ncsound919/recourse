/**
 * moduleContract.test.ts — the export-keyword normalization.
 *
 * A model that wrote the right function without `export` must not lose the
 * capability to the substance gate; a model that wrote the WRONG name must
 * still be refused (normalization adds a keyword, never invents a declaration).
 */
import { describe, it, expect } from 'vitest';
import {
  ensureExported, stripFences, stripPreamble, unwrapCommonJs, normalizeGeneratedModule,
} from './moduleContract.js';

describe('ensureExported', () => {
  it('adds export to a matching function declaration', () => {
    const src = 'function canary(x) {\n  return x > 0;\n}\n';
    const out = ensureExported(src, 'canary');
    expect(out).toContain('export function canary(');
    expect(out).toContain('return x > 0;'); // body untouched
  });

  it('handles async declarations and preserves the keyword', () => {
    const out = ensureExported('async function f(a) { return a; }', 'f');
    expect(out).toBe('export async function f(a) { return a; }');
  });

  it('adds export to a const/let/var arrow declaration', () => {
    expect(ensureExported('const score = (xs) => xs.length;', 'score')).toBe('export const score = (xs) => xs.length;');
    expect(ensureExported('let score = (xs) => xs.length;', 'score')).toContain('export let score =');
    expect(ensureExported('var score = (xs) => xs.length;', 'score')).toContain('export var score =');
  });

  it('is a no-op when the source already exports', () => {
    const src = 'export function canary(x) { return x; }';
    expect(ensureExported(src, 'canary')).toBe(src);
    const src2 = 'export default function (x) { return x; }';
    expect(ensureExported(src2, 'anything')).toBe(src2);
  });

  it('does NOT invent a declaration for a wrong name (the gate must still refuse)', () => {
    const src = 'function somethingElse(x) { return x; }';
    expect(ensureExported(src, 'canary')).toBe(src);
  });

  it('leaves empty/whitespace and missing-name inputs untouched', () => {
    expect(ensureExported('', 'canary')).toBe('');
    expect(ensureExported('function canary(){}', '')).toBe('function canary(){}');
  });

  it('only rewrites the first matching declaration line, not call sites', () => {
    const src = 'function canary(x) { return canary(x - 1); }';
    const out = ensureExported(src, 'canary');
    expect(out.startsWith('export function canary(x)')).toBe(true);
    expect(out).toContain('return canary(x - 1);'); // the recursive CALL is not touched
  });
});

describe('defensive reply normalization (the published remedy)', () => {
  it('stripFences takes the largest fenced block (models fence despite instructions)', () => {
    const reply = 'Here you go:\n```js\nfunction f(x) { return x; }\n```\nHope that helps!';
    expect(stripFences(reply).trim()).toBe('function f(x) { return x; }');
  });

  it('stripPreamble drops prose before the first code line, keeps code', () => {
    const reply = 'Sure! Here is the implementation:\nfunction f(x) { return x; }';
    expect(stripPreamble(reply)).toBe('function f(x) { return x; }');
    // A line that is itself code is never treated as prose.
    const codeFirst = 'const f = (x) => x;\nconst g = (y) => y;';
    expect(stripPreamble(codeFirst)).toBe(codeFirst);
  });

  it('unwrapCommonJs turns a CommonJS reply into a declaration', () => {
    expect(unwrapCommonJs('module.exports = function canary(x) { return x; }', 'canary')).toContain('function canary(x)');
    expect(unwrapCommonJs('module.exports = { canary }', 'canary')).not.toContain('module.exports');
    expect(unwrapCommonJs('exports.canary = function (x) { return x; }', 'canary')).toContain('function canary ');
  });

  it('normalizeGeneratedModule reports exactly what it changed, in order', () => {
    const reply = 'Here you go:\n```js\nmodule.exports = function canary(x) { return x > 0; }\n```';
    const r = normalizeGeneratedModule(reply, 'canary');
    expect(r.changes).toEqual(expect.arrayContaining(['stripped markdown code fence']));
    expect(r.source).toContain('export function canary(x)'); // fence stripped, CJS unwrapped, export added
    expect(r.source).not.toContain('```');
    expect(r.source).not.toContain('module.exports');
  });

  it('a correct reply is left untouched (no changes reported)', () => {
    const src = 'export function canary(x) {\n  return x > 0;\n}';
    const r = normalizeGeneratedModule(src, 'canary');
    expect(r.source).toBe(src);
    expect(r.changes).toEqual([]);
  });
});
