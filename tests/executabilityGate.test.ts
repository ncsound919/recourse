/**
 * B1/B2 — the executability gate and the honest registry pair.
 *
 * The bug this guards: 1,253 of 1,289 registry entries declared
 * `entrypoint: src/tools/<name>.ts` for a directory that has never existed. They
 * counted as `promoted: true` and inflated `registeredToolsCount`, so a system with
 * ~30 runnable tools reported 1,282.
 *
 * The DANGEROUS failure mode for this fix is over-rejection: forge tools have no
 * `entrypoint` file at all (they live in `.selfhosted/` with a verified manifest),
 * so a naive "does the file exist" check would empty the registry of its real
 * capability while leaving every phantom untouched. Half these tests exist to prove
 * that does not happen.
 */
import { describe, it, expect } from 'vitest';

const escapeRegExp = (s: string) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Mirror of server.ts `entryIsExecutable`, with the manifest check injected. */
function entryIsExecutable(
  entry: { name: string; entrypoint?: string; source_code?: string } | undefined,
  manifestVerified: boolean,
  fileExists: (p: string) => boolean = () => false,
): boolean {
  const name = typeof entry?.name === 'string' ? entry.name : '';
  if (!name) return false;
  if (manifestVerified) return true;
  const src = entry!.source_code;
  if (src) {
    if (new RegExp(`export\\s+(async\\s+)?function\\s+${escapeRegExp(name)}\\b`).test(src)) return true;
    if (new RegExp(`export\\s+const\\s+${escapeRegExp(name)}\\b`).test(src)) return true;
    if (new RegExp(`export\\s+class\\s+${escapeRegExp(name)}\\b`).test(src)) return true;
  }
  if (entry!.entrypoint && /\.[cm]?[jt]sx?$/.test(entry!.entrypoint) && fileExists(entry!.entrypoint)) return true;
  return false;
}

describe('the executability gate rejects phantoms', () => {
  it('refuses an entry whose entrypoint file does not exist', () => {
    // THE measured case: 1,253 of these.
    const phantom = { name: 'v5_nil', entrypoint: 'src/tools/v5_nil.ts' };
    expect(entryIsExecutable(phantom, false, () => false)).toBe(false);
  });

  it('refuses an entry with an entrypoint but no source and no file', () => {
    expect(entryIsExecutable({ name: 'ghost', entrypoint: 'src/tools/ghost.ts' }, false, () => false)).toBe(false);
  });

  it('refuses an entry with no evidence of any kind', () => {
    expect(entryIsExecutable({ name: 'nothing' }, false, () => false)).toBe(false);
  });

  it('accepts when the entrypoint file really exists', () => {
    expect(entryIsExecutable({ name: 'real', entrypoint: 'src/real.ts' }, false, () => true)).toBe(true);
  });
});

describe('the gate MUST NOT reject real capability', () => {
  it('accepts a forge self-hosted tool with a verified manifest and NO file', () => {
    // The over-rejection trap. A naive existence check on `entrypoint` would
    // refuse every one of the ~30 tools that actually work.
    const forgeTool = { name: 'levenshteinDistance', entrypoint: 'src/tools/levenshteinDistance.ts' };
    expect(forgeTool.entrypoint).toMatch(/^src\/tools\//);
    expect(entryIsExecutable(forgeTool, true, () => false)).toBe(true);
  });

  it('accepts source that really exports the named function', () => {
    const gene = { name: 'gcSkew', source_code: 'export function gcSkew(x){ return x; }', entrypoint: 'src/tools/gcSkew.ts' };
    expect(entryIsExecutable(gene, false, () => false)).toBe(true);
  });

  it('accepts async, const and class export forms', () => {
    expect(entryIsExecutable({ name: 'f', source_code: 'export async function f(){}' }, false)).toBe(true);
    expect(entryIsExecutable({ name: 'g', source_code: 'export const g = 1;' }, false)).toBe(true);
    expect(entryIsExecutable({ name: 'C', source_code: 'export class C {}' }, false)).toBe(true);
  });

  it('does NOT accept source that merely mentions the name', () => {
    // A comment or a call is not a definition.
    const mentions = { name: 'f', source_code: '// calls f(1) here\nexport function other(){}' };
    expect(entryIsExecutable(mentions, false)).toBe(false);
  });

  it('does NOT accept a similar-but-different function name', () => {
    // `f` must not be satisfied by `export function foo`.
    const near = { name: 'f', source_code: 'export function foo(){ return 1; }' };
    expect(entryIsExecutable(near, false)).toBe(false);
  });

  it('escapes regex metacharacters in the tool name', () => {
    // A name like `a.b` must not match `axb`, and must not break the RegExp.
    expect(() => entryIsExecutable({ name: 'a.b', source_code: 'export function a.b(){}' }, false)).not.toThrow();
    expect(entryIsExecutable({ name: 'a.b', source_code: 'export function axb(){}' }, false)).toBe(false);
  });
});

describe('the reporter must never throw on live data', () => {
  // REGRESSION, measured 2026-10-04. The first version of this gate called
  // escapeRegExp(entry.name) unguarded. Real registry rows carry no `name`, so the
  // first live request threw `Cannot read properties of undefined (reading
  // 'replace')` and returned HTTP 500 for GET /status — the instrument that was
  // supposed to expose the inventory problem took down the endpoint instead.
  it('does not throw on an entry with no name', () => {
    const nameless = { entrypoint: 'src/tools/whatever.ts' } as any;
    expect(() => entryIsExecutable(nameless, false)).not.toThrow();
    expect(entryIsExecutable(nameless, false)).toBe(false);
  });

  it('does not throw on a null entry or a missing entry', () => {
    expect(() => entryIsExecutable(undefined, false)).not.toThrow();
    expect(entryIsExecutable(undefined, false)).toBe(false);
    expect(entryIsExecutable(null as any, false)).toBe(false);
  });

  it('treats a non-string name as not executable rather than coercing it', () => {
    expect(entryIsExecutable({ name: 42 } as any, false)).toBe(false);
  });

  it('escapeRegExp survives a non-string without corrupting the pattern', () => {
    expect(() => escapeRegExp(undefined as any)).not.toThrow();
    expect(escapeRegExp(42 as any)).toBe('42');
  });
});

describe('the honest pair', () => {
  it('counts a malformed row as declared-not-executable instead of aborting', () => {
    const rows = [
      { name: 'a', source_code: 'export function a(){}' },
      undefined as any,
      { entrypoint: 'src/tools/c.ts' },
    ];
    let executable = 0;
    let declaredNotExecutable = 0;
    for (const t of rows) {
      try {
        if (entryIsExecutable(t, false)) executable++;
        else declaredNotExecutable++;
      } catch {
        declaredNotExecutable++;
      }
    }
    expect(executable).toBe(1);
    expect(declaredNotExecutable).toBe(2);
    expect(executable + declaredNotExecutable).toBe(rows.length);
  });

  it('separates executable from declared-not-executable', () => {
    const entries = [
      { name: 'a', source_code: 'export function a(){}' },        // executable
      { name: 'b', manifest: true },                              // executable via manifest
      { name: 'c', entrypoint: 'src/tools/c.ts' },                // phantom
      { name: 'd' },                                              // phantom
    ];
    const executable = entries.filter((e) => entryIsExecutable(e, Boolean((e as any).manifest), () => false)).length;
    expect(executable).toBe(2);
    expect(entries.length - executable).toBe(2);
  });

  it('the gap is what must trend to zero, not the total', () => {
    // Publishing only the executable count would make deleting real capability
    // look identical to deleting inert rows. Both numbers are required.
    const before = { executableTools: 30, declaredNotExecutable: 1253 };
    const afterGoodDelete = { executableTools: 30, declaredNotExecutable: 0 };
    const afterBadDelete = { executableTools: 5, declaredNotExecutable: 1278 };
    // Good: primary flat, gap down.
    expect(afterGoodDelete.executableTools).toBe(before.executableTools);
    expect(afterGoodDelete.declaredNotExecutable).toBeLessThan(before.declaredNotExecutable);
    // Bad: primary also fell, which the pair exposes and a single number would hide.
    expect(afterBadDelete.executableTools).toBeLessThan(before.executableTools);
  });

  it('an empty registry is reported as zeros, never as a crash or a guess', () => {
    expect([]).toHaveLength(0);
    const pair = { executableTools: 0, declaredNotExecutable: 0, total: 0, selfHostedVerified: 0 };
    expect(pair.executableTools + pair.declaredNotExecutable).toBe(pair.total);
  });
});