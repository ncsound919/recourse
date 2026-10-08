/**
 * BOM audit for scaffolded DSH bundles.
 *
 * ## Why this exists separately from `bom-audit.mjs`
 *
 * That script audits what *this plugin* owns: its own tree and the profile it is
 * mounted into. Bundles Recourse generates land somewhere else — `.dsh-bundles`
 * by default — and they are read by the same JSON parsers that made a BOM in this
 * package drop an entire plugin half with no error on the page.
 *
 * The failure this catches is specific and invisible. A generated
 * `package.json` written with a leading `EF BB BF` fails
 * `JSON.parse(readFileSync(pkgPath, 'utf8'))` in
 * `@deepseek-ai/dsh-client-modules` and `@deepseek-ai/dsh-base`'s bundle loader.
 * The harness then drops the bundle: no entry in the boot graph, no error, and a
 * plugin that appears to load fine while contributing nothing.
 *
 * It is easy to reintroduce because the responsible command changes behaviour
 * between shell versions — PowerShell 5.1's `Set-Content -Encoding utf8` emits a
 * BOM, PowerShell 7.x does not.
 *
 * Recourse's own writer is BOM-free (it uses `fs.writeFileSync` with `'utf-8'`,
 * which never emits one). This script is the check that keeps it that way: it
 * audits what the generator actually produced rather than trusting the source.
 *
 * ## Usage
 *
 *   node scripts/bom-audit-bundles.mjs                # audit DSH_BUNDLE_ROOT
 *   node scripts/bom-audit-bundles.mjs --fix          # strip BOMs in place
 *   node scripts/bom-audit-bundles.mjs <dir> [...]    # audit specific roots
 *
 * Exits non-zero when a BOM is found, so it works as a CI or pre-commit gate.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

/** Generated, vendored, or irrelevant to what the harness parses. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.turbo', '.venv', '__pycache__']);

/**
 * Extensions worth checking.
 *
 * JSON and YAML are what the harness parses mechanically. `.ts` is included
 * because a scaffolded bundle that is later hand-edited should not carry one
 * into a build either.
 */
const EXTENSIONS = new Set([
  '.json', '.jsonc', '.yml', '.yaml', '.md', '.mdx', '.ts', '.tsx', '.js', '.mjs', '.cjs',
]);

/** The scaffold root. Must match Recourse's `DSH_BUNDLE_ROOT` default. */
function defaultRoot() {
  const configured = process.env.DSH_BUNDLE_ROOT?.trim();
  if (configured) return resolve(configured);
  return join(process.cwd(), '.dsh-bundles');
}

/** Where Recourse's own generator lives, for a cross-check note only. */
const RECOURSE_ROOT = 'C:/Users/User/Downloads/BUSINESS/INFRASTRUCTURE/recourse';

const args = process.argv.slice(2);
const fix = args.includes('--fix');
const explicit = args.filter((arg) => !arg.startsWith('--'));
const roots = explicit.length > 0 ? explicit : [defaultRoot(), join(homedir(), '.dsh', 'bundles')];

/** Every file under `dir`, skipping generated trees. */
function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // a root that does not exist yet is not a finding
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      if (entry.name === 'package-lock.json') continue;
      if (EXTENSIONS.has(extname(entry.name))) yield full;
    }
  }
}

/** Does this file start with a UTF-8 BOM? */
function hasBom(file) {
  const buf = readFileSync(file);
  return buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
}

/** Strip a leading BOM in place, preserving every other byte. */
function stripBom(file) {
  const buf = readFileSync(file);
  if (!(buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf)) return false;
  writeFileSync(file, buf.subarray(3));
  return true;
}

const findings = [];
let scanned = 0;
for (const root of roots) {
  const resolved = resolve(root);
  if (!existsAsDir(resolved)) continue;
  for (const file of walk(resolved)) {
    scanned += 1;
    if (!hasBom(file)) continue;
    findings.push(file);
    if (fix) stripBom(file);
  }
}

function existsAsDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

if (findings.length === 0) {
  console.log(`bom-audit-bundles: clean (${scanned} file(s) across ${roots.length} root(s))`);
  process.exit(0);
}

console.error(`bom-audit-bundles: ${findings.length} file(s) carry a UTF-8 BOM${fix ? ' (stripped)' : ''}:`);
for (const file of findings) console.error(`  ${file}`);
if (!fix) {
  console.error('');
  console.error('The harness resolves a bundle\'s package.json with JSON.parse, which does not');
  console.error('accept U+FEFF. A BOM here drops the whole bundle with no boot-graph entry.');
  console.error(`Fix: node scripts/bom-audit-bundles.mjs --fix   (or check the writer in ${RECOURSE_ROOT})`);
}
process.exit(1);