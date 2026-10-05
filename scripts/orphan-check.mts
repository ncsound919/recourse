#!/usr/bin/env tsx
/**
 * orphan-check.mts — fail CI when a module with exports has no production
 * importer.
 *
 * Why: 22 modules under src/ were reachable only from their own test file.
 * Every one of them read as a working capability while nothing in the product
 * could ever call it, which is how a suite of 3,900 green tests coexisted with
 * an autopilot that produced almost no real change.
 *
 * What counts as an importer:
 *   - a static `import`/`export ... from`, or a `require()`, of the module from
 *     a NON-TEST file (src, server.ts, mcp-server.ts, api, scripts);
 *   - a dynamic `import()` of a path containing the module's directory;
 *   - an explicit allowlist entry in scripts/orphan-allowlist.json, which must
 *     carry a reason (so "we'll wire it later" is visible, not silent).
 *
 * Exit 1 on any orphan. `--json` prints the report instead of the prose, for
 * tooling.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ALLOWLIST_PATH = path.join(ROOT, 'scripts', 'orphan-allowlist.json');

/** Roots scanned for production importers. */
const PROD_ROOTS = ['src', 'api', 'scripts', 'server.ts', 'mcp-server.ts'];
/** Directories/patterns whose importers do not count. */
const PROD_SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.recourse', 'tests', 'test']);
const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/i;

const SOURCE_EXT_RE = /\.[cm]?[jt]sx?$/i;
/** Ambient declaration files are never imported by design; they declare shapes
 *  for modules that have no types of their own. */
const AMBIENT_DTS_RE = /\.d\.[cm]?ts$/i;
/**
 * Committed codegen artefacts. `scripts/gen-v1-client.ts` writes
 * `src/lib/v1Client.generated.ts` and `tests/openapiV1.test.ts` asserts the
 * committed file is byte-identical to the generator's output, so it must stay
 * on disk while having no importer — that is what a generated artefact is.
 */
const GENERATED_FILES = new Set(['src/lib/v1Client.generated.ts']);
const GENERATED_HEADER_RE = /@generated|Code generated .* DO NOT EDIT/;

interface Orphan {
  file: string;
  exports: number;
  allowlisted: string | null;
}

function walk(root: string, out: string[], skipProd: boolean): void {
  let stat: fs.Stats | undefined;
  try {
    stat = fs.statSync(root, { throwIfNoEntry: false });
  } catch {
    return;
  }
  if (!stat) return;
  if (!stat.isDirectory()) {
    out.push(root);
    return;
  }
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (PROD_SKIP.has(entry.name)) continue;
    const abs = path.join(root, entry.name);
    const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
    if (skipProd && TEST_FILE_RE.test(rel)) continue;
    if (AMBIENT_DTS_RE.test(rel)) continue;
    if (entry.isDirectory()) walk(abs, out, skipProd);
    else if (SOURCE_EXT_RE.test(entry.name)) out.push(abs);
  }
}

function listFiles(skipTests: boolean): string[] {
  const out: string[] = [];
  for (const candidate of PROD_ROOTS) {
    walk(path.join(ROOT, candidate), out, skipTests);
  }
  return out;
}

/** Own declarations (not re-exports) exported by a source file. */
function countExports(source: string): number {
  const decls = source.match(
    /^[ \t]*export[ \t]+(?:default[ \t]+)?(?:(?:async)[ \t]+)?(?:function\*?|class|const|let|var|interface|type|enum)[ \t]+[A-Za-z_$][\w$]*/gm,
  );
  return decls?.length ?? 0;
}

/** True when a file only re-exports other modules (a barrel). */
function isBarrel(source: string): boolean {
  if (countExports(source) > 0) return false;
  return /export[ \t]*(\*|\{[^}]*\})[ \t]*from[ \t]*['"]/.test(source);
}

/** Every import specifier in a file, static or dynamic. */
function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const re = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;
  for (let m = re.exec(source); m !== null; m = re.exec(source)) specs.push(m[1]);
  return specs;
}

/**
 * Resolve an import specifier to a repo-relative file path, the way the build
 * does. Returns null for anything that is not a relative/absolute file spec.
 *
 * The `.js` -> `.ts` substitution matters here: this repo writes ESM-style
 * `./foo.js` specifiers that TypeScript resolves to `foo.ts` on disk. Without it
 * almost every import looks unresolved and the report is 344 false orphans.
 */
function resolveSpecifier(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith('.')) {
    base = path.resolve(path.dirname(fromFile), spec);
  } else if (spec.startsWith('/')) {
    base = path.join(ROOT, spec.slice(1));
  } else {
    return null; // a bare package specifier: node_modules, not the tree
  }
  const ext = path.extname(base);
  const stem = ext ? base.slice(0, -ext.length) : base;
  const candidates = [
    base,
    ...(ext === '.js' || ext === '.jsx' || ext === '.mjs'
      ? [`${stem}.ts`, `${stem}.tsx`, `${stem}.mts`]
      : []),
    ...(ext === '' ? ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs'].map((e) => base + e) : []),
  ];
  for (const dir of ['index.ts', 'index.tsx', 'index.js']) candidates.push(path.join(base, dir));
  for (const c of candidates) {
    try {
      if (fs.statSync(c, { throwIfNoEntry: false })?.isFile()) {
        return path.relative(ROOT, c).replace(/\\/g, '/');
      }
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

function loadAllowlist(): Record<string, string> {
  try {
    const raw = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8')) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw ?? {})) {
      // Keys starting with `_` are documentation for humans, not entries.
      if (k.startsWith('_')) continue;
      out[k] = typeof v === 'string' ? v : '(no reason given)';
    }
    return out;
  } catch {
    console.warn('[orphan-check] no scripts/orphan-allowlist.json (treating every orphan as a failure)');
    return {};
  }
}

function main(): void {
  const json = process.argv.includes('--json');
  const prodFiles = listFiles(true);
  const prodSources = new Map<string, string>();
  for (const f of prodFiles) {
    try {
      prodSources.set(path.relative(ROOT, f).replace(/\\/g, '/'), fs.readFileSync(f, 'utf8'));
    } catch {
      /* unreadable file: it simply cannot import anything */
    }
  }
  /** resolvedPath -> set of importing repo-relative files */
  const importers = new Map<string, Set<string>>();
  for (const [rel, source] of prodSources) {
    for (const spec of importSpecifiers(source)) {
      const target = resolveSpecifier(spec, path.join(ROOT, rel));
      if (!target) continue;
      const set = importers.get(target) ?? new Set<string>();
      set.add(rel);
      importers.set(target, set);
    }
  }

  const allowlist = loadAllowlist();
  const orphans: Orphan[] = [];
  const skipped: Array<{ file: string; why: string }> = [];
  for (const [rel, source] of prodSources) {
    if (TEST_FILE_RE.test(rel)) continue;
    if (!rel.startsWith('src/')) continue;
    if (GENERATED_FILES.has(rel) || GENERATED_HEADER_RE.test(source)) {
      skipped.push({ file: rel, why: 'generated artefact' });
      continue;
    }
    if (isBarrel(source)) {
      // A barrel is an alternate entry point, not a capability. Its children are
      // each checked on their own; counting the barrel would fail the build for
      // a file nobody imports *by preference*.
      skipped.push({ file: rel, why: 'barrel (re-exports modules that are checked individually)' });
      continue;
    }
    const n = countExports(source);
    if (n === 0) {
      skipped.push({ file: rel, why: 'no exports' });
      continue;
    }
    const who = importers.get(rel);
    if (who && who.size > 0) continue;
    orphans.push({ file: rel, exports: n, allowlisted: allowlist[rel] ?? null });
  }
  orphans.sort((a, b) => a.file.localeCompare(b.file));

  const failures = orphans.filter((o) => !o.allowlisted);

  if (json) {
    console.log(JSON.stringify({ orphans, failures, skipped }, null, 2));
  } else {
    console.log(`[orphan-check] ${prodSources.size} production source files, ${orphans.length} without a production importer (${skipped.length} skipped as barrel/generated/no-exports)`);
    for (const o of orphans) {
      const tag = o.allowlisted ? `allowlisted: ${o.allowlisted}` : 'FAIL';
      console.log(`  ${o.allowlisted ? '~' : 'x'} ${o.file} (${o.exports} exports) — ${tag}`);
    }
    const unknownAllow = Object.keys(allowlist).filter(
      (k) => !orphans.some((o) => o.file === k),
    );
    for (const k of unknownAllow) console.log(`  ! allowlist entry ${k} no longer matches an orphan`);
  }

  if (failures.length > 0) {
    console.error(
      `[orphan-check] ${failures.length} module(s) exported but never imported by production code. ` +
        'Wire them, delete them, or add a reasoned entry to scripts/orphan-allowlist.json.',
    );
    process.exitCode = 1;
  }
}

main();
