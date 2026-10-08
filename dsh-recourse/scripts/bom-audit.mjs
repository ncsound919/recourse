/**
 * BOM audit.
 *
 * ## Why this exists
 *
 * A UTF-8 BOM is invisible in every editor and survives every round trip, and
 * it silently breaks JSON consumers. The concrete instance that cost real
 * debugging time: `dsh-recourse/package.json` was written by Windows
 * PowerShell 5.1's `Set-Content -Encoding utf8`, which emits `EF BB BF` by
 * default. `@deepseek-ai/dsh-client-modules` resolves a plugin's client bundle
 * with `JSON.parse(readFileSync(pkgPath, 'utf8'))`. Node's `readFileSync` does
 * not strip a BOM and U+FEFF is not JSON whitespace per RFC 8259, so the parse
 * threw and the harness dropped the plugin's entire client half -- with no error
 * on the page, no entry in the boot graph, and a plugin that appeared to load
 * fine while contributing nothing.
 *
 * PowerShell 7.x defaults to BOM-less UTF-8, which is exactly why this is easy
 * to reintroduce: the same command behaves differently depending on the host
 * shell version. Note also that `ConvertTo-Json | Set-Content` is the common
 * shape that produces it.
 *
 * ## Usage
 *
 *   node scripts/bom-audit.mjs                 # audit the default roots
 *   node scripts/bom-audit.mjs --fix           # strip BOMs in place
 *   node scripts/bom-audit.mjs <dir> [...]     # audit specific roots
 *
 * Exits non-zero when a BOM is found, so it works as a pre-commit or CI gate.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

/** Directories whose contents are generated, vendored, or irrelevant to config. */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.turbo',
  'backups', 'composer-out', 'coverage-baseline', '.venv', '__pycache__', '.pytest_cache',
  'skills-out', 'data', 'logs', 'sessions', 'storages', 'axiom-artifacts', 'speech-to-text',
]);

/**
 * Extensions worth checking.
 *
 * Config and source text is where a BOM changes behaviour: JSON is parsed by
 * machines, and YAML frontmatter is read by the harness and by skill loaders.
 * Binary and media formats are skipped because a BOM is often meaningful there.
 */
const EXTENSIONS = new Set([
  '.json', '.jsonc', '.yml', '.yaml', '.md', '.mdx', '.ts', '.tsx', '.js', '.mjs',
  '.cjs', '.jsx', '.css', '.html', '.txt', '.ps1', '.sh', '.toml', '.ini', '.cfg',
]);

/**
 * Default roots: only what this plugin owns and can be blamed for.
 *
 * A wider sweep is available with `--all`, and the ecosystem currently contains
 * ~71 BOM files, but they are not this gate's business:
 *
 * - ~65 are `.ts`/`.tsx`, where a BOM is harmless: both `tsc` and esbuild strip
 *   it before parsing. Most are in `Overlay-Global-Lens`, `ChordStudio`, and
 *   `Uplift Wealth`.
 * - the parser-relevant ones are two vendored compose files in
 *   `oss-marketing-stack` (`formbricks`, `twenty`), where the BOM is upstream's
 *   and stripping it would diverge the tree from its source.
 *
 * So the default audit covers the trees where a BOM is both this plugin's fault
 * and actually able to break something: this package and the harness profile it
 * is installed into.
 */
const OWNED_ROOTS = [
  'C:/Users/User/Downloads/BUSINESS/INFRASTRUCTURE/dsh-recourse',
  'C:/Users/User/.dsh/profiles',
  'C:/Users/User/.dsh/runtime/package.json',
];

/** Advisory sweep: the whole BUSINESS tree, for periodic auditing. */
const ECOSYSTEM_ROOTS = ['C:/Users/User/Downloads/BUSINESS', ...OWNED_ROOTS];

const args = process.argv.slice(2);
const fix = args.includes('--fix');
const all = args.includes('--all');
const roots = args.filter((arg) => !arg.startsWith('--'));

/** Report every finding but only fail the gate for files this plugin owns. */
const ADVISORY_ONLY = new Set([
  'C:\\Users\\User\\Downloads\\BUSINESS',
]);

function hasBom(buf) {
  return buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
}

/** Strip a leading BOM, preserving every other byte exactly. */
function stripBom(buf) {
  return buf.subarray(3);
}

const findings = [];
let scanned = 0;

function walk(path) {
  let stat;
  try {
    stat = statSync(path);
  } catch {
    return;
  }
  if (stat.isDirectory()) {
    let entries;
    try {
      entries = readdirSync(path, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
      walk(join(path, entry.name));
    }
    return;
  }
  if (!stat.isFile()) return;
  if (stat.size < 3) return;
  if (!EXTENSIONS.has(extname(path).toLowerCase())) return;

  let buf;
  try {
    buf = readFileSync(path);
  } catch {
    return;
  }
  scanned += 1;
  if (!hasBom(buf)) return;

  if (fix) {
    try {
      writeFileSync(path, stripBom(buf));
      findings.push({ path, fixed: true });
      return;
    } catch {
      /* fall through to report as unfixed */
    }
  }
  findings.push({ path, fixed: false });
}

for (const root of roots.length > 0 ? roots : all ? ECOSYSTEM_ROOTS : OWNED_ROOTS) {
  walk(resolve(root));
}

if (findings.length === 0) {
  console.log(`bom audit: clean (${scanned} text file(s) checked)`);
} else {
  for (const finding of findings) {
    console.log(`  ${finding.fixed ? 'fixed  ' : 'BOM    '} ${finding.path}`);
  }
  const unfixed = findings.filter((f) => !f.fixed).length;
  console.log(
    `\nbom audit: ${findings.length} file(s) had a UTF-8 BOM (${findings.length - unfixed} fixed, ${unfixed} unfixed)`,
  );
  console.log(
    'A BOM breaks JSON.parse and YAML frontmatter readers. If a file here was written by',
  );
  console.log('PowerShell, prefer Set-Content -Encoding utf8NoBOM (PS 7+) or write via node.');

  // In `--all` mode the ecosystem sweep is advisory: most findings are harmless
  // .ts/.tsx files or upstream vendored copies, and a red gate for files this
  // plugin does not own would train everyone to ignore it.
  const owned = findings.filter((f) => !ADVISORY_ONLY.has(f.path.slice(0, 32)));
  if (all && unfixed > 0 && owned.length === 0) {
    console.log('\nadvisory: no finding is in a tree this plugin owns; not failing the gate.');
  } else if (unfixed > 0) {
    process.exitCode = 1;
  }
}