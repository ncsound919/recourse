/**
 * repoIndex.ts — a deterministic export index of the repository, so the code
 * planner can be told what already exists instead of guessing.
 *
 * Why this exists: the planner used to be prompted to emit "exactly ONE new
 * self-contained file with NO imports". It therefore had no way to call any
 * existing function, which is the main reason almost every upgrade it produced
 * was a micro-step that could not do anything useful. `relevantEntries` gives
 * the prompt a real, ranked slice of the codebase's public surface.
 *
 * Everything here is deterministic: same tree => byte-identical index. No
 * clock, no randomness, no model. A build error in one file is contained (that
 * file is skipped, not the run).
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { hashString } from '../dream/engine';

/** One exported symbol found in the tree. */
export interface IndexEntry {
  /** Repo-relative path, `/` separators. */
  file: string;
  /** Exported identifier. */
  name: string;
  /** 'function' | 'async function' | 'const' | 'class' | 'interface' | 'type'. */
  kind: string;
  /** First doc comment (`/** ... *\/`) or `//` header line above the export. */
  summary: string;
}

export const REPO_INDEX_CACHE = '.recourse/repo-index.json';

const SOURCE_EXT_RE = /\.(ts|tsx|mts|cts)$/i;
/** Path segments that never contain production source. */
const SKIP_SEGMENTS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.recourse', 'tests', 'test']);
/** Substrings that mark a file as a test regardless of directory. */
const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/i;

const MAX_FILES = 4000;
const MAX_FILE_BYTES = 512_000;
const MAX_SUMMARY_CHARS = 180;

const EXPORT_DECL_RE =
  /^[ \t]*export[ \t]+(?:default[ \t]+)?(?:(async)[ \t]+)?(function\*?|class|const|let|var|interface|type|enum)[ \t]+([A-Za-z_$][\w$]*)/gm;
const EXPORT_LIST_RE = /^[ \t]*export[ \t]*\{([^}]*)\}[ \t]*(?:from[ \t]*['"][^'"]*['"])?/gm;

function isSkipped(rel: string): boolean {
  const segments = rel.split('/');
  if (segments.some((s) => SKIP_SEGMENTS.has(s))) return true;
  return TEST_FILE_RE.test(rel);
}

/** Walk `src` (when present) plus the repo root's top-level source dirs. */
export function listSourceFiles(root: string): string[] {
  const roots = ['src', 'server.ts', 'mcp-server.ts', 'api'].filter((c) => {
    try {
      return fs.existsSync(path.join(root, c));
    } catch {
      return false;
    }
  });
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(dir, entry.name);
      const rel = path.relative(root, abs).replace(/\\/g, '/');
      if (isSkipped(rel)) continue;
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile() && SOURCE_EXT_RE.test(entry.name)) {
        out.push(rel);
      }
      if (out.length >= MAX_FILES) return;
    }
  };
  for (const candidate of roots) {
    const abs = path.join(root, candidate);
    if (fs.statSync(abs, { throwIfNoEntry: false })?.isDirectory()) walk(abs);
    else if (SOURCE_EXT_RE.test(candidate)) out.push(candidate);
  }
  return out;
}

/** The doc comment or `//` header immediately above `index`, else ''. */
function summaryAbove(source: string, index: number): string {
  const before = source.slice(0, index);
  const lines = before.split(/\r?\n/);
  const collected: string[] = [];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim();
    if (line === '') {
      if (collected.length > 0) break;
      continue;
    }
    if (line.startsWith('//')) {
      const text = line.replace(/^\/\/\s?/, '');
      if (text) collected.unshift(text);
      continue;
    }
    if (line.startsWith('*') || line.startsWith('/*')) {
      // The closing ` */` of a doc block strips to nothing; drop it so the
      // summary does not end in a stray `*/`.
      const text = line.replace(/^\/?\*+\/?\s?/, '');
      if (text && text !== '/') collected.unshift(text);
      continue;
    }
    break;
  }
  const text = collected.join(' ').trim();
  if (!text) return '';
  return text.length > MAX_SUMMARY_CHARS ? `${text.slice(0, MAX_SUMMARY_CHARS - 1)}…` : text;
}

function parseFile(rel: string, source: string): IndexEntry[] {
  const entries: IndexEntry[] = [];
  const seen = new Set<string>();
  const push = (name: string, kind: string, index: number): void => {
    if (!name || seen.has(name)) return;
    seen.add(name);
    entries.push({ file: rel, name, kind, summary: summaryAbove(source, index) });
  };

  EXPORT_DECL_RE.lastIndex = 0;
  for (let m = EXPORT_DECL_RE.exec(source); m !== null; m = EXPORT_DECL_RE.exec(source)) {
    const [, asyncKw, declKind, name] = m;
    push(name, `${asyncKw ? 'async ' : ''}${declKind}`, m.index);
  }
  // `export { a, b as c }` — only re-exports are listed (the origin file already
  // indexed the declaration, so bare names would double-count).
  EXPORT_LIST_RE.lastIndex = 0;
  for (let m = EXPORT_LIST_RE.exec(source); m !== null; m = EXPORT_LIST_RE.exec(source)) {
    if (!/\bfrom\b/.test(m[0])) continue;
    for (const raw of m[1].split(',')) {
      const alias = raw.trim().split(/\s+as\s+/i);
      const name = (alias[1] ?? alias[0] ?? '').trim().replace(/^type\s+/, '');
      push(name, 're-export', m.index);
    }
  }
  return entries;
}

/**
 * buildRepoIndex(root) — every exported symbol under the source tree, sorted by
 * `file` then `name` so the output is byte-stable for a given tree.
 */
export function buildRepoIndex(root: string): IndexEntry[] {
  const entries: IndexEntry[] = [];
  for (const rel of listSourceFiles(root)) {
    const abs = path.join(root, rel);
    let stat: fs.Stats | undefined;
    try {
      stat = fs.statSync(abs);
    } catch {
      continue;
    }
    if (stat.size > MAX_FILE_BYTES) continue;
    let source: string;
    try {
      source = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    entries.push(...parseFile(rel, source));
  }
  entries.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
  return entries;
}

const STOP = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'add', 'fix',
  'code', 'file', 'files', 'use', 'used', 'using', 'make', 'need', 'needs',
  'should', 'must', 'can', 'has', 'have', 'when', 'then', 'than', 'not',
  'gap', 'repo', 'repository', 'improve', 'missing', 'function', 'module',
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 2 && !STOP.has(t));
}

/**
 * relevantEntries(index, gapText, k) — BM25-lite ranking of the index against
 * the gap text. Token overlap weighted by IDF over the index, with a small
 * bonus for a name that is itself a query token. Deterministic; ties break on
 * `file`/`name` so the same index always yields the same slice.
 */
export function relevantEntries(index: IndexEntry[], gapText: string, k = 25): IndexEntry[] {
  if (index.length === 0 || k <= 0) return [];
  const docs = index.map((e) => tokens(`${e.name} ${e.summary} ${e.file}`));
  const df = new Map<string, number>();
  for (const doc of docs) {
    for (const t of new Set(doc)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const n = index.length;
  const query = new Set(tokens(gapText));
  if (query.size === 0) return [];

  const k1 = 1.5;
  const b = 0.75;
  const avgLen = docs.reduce((a, d) => a + d.length, 0) / n || 1;

  const scored = index.map((entry, i) => {
    const doc = docs[i];
    const counts = new Map<string, number>();
    for (const t of doc) counts.set(t, (counts.get(t) ?? 0) + 1);
    let score = 0;
    for (const t of query) {
      const tf = counts.get(t);
      if (!tf) continue;
      const idf = Math.log(1 + n / (1 + (df.get(t) ?? 0)));
      score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (doc.length / avgLen))));
    }
    if (score > 0 && query.has(tokens(entry.name)[0] ?? '')) score *= 1.5;
    return { entry, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.file.localeCompare(b.entry.file) || a.entry.name.localeCompare(b.entry.name))
    .slice(0, k)
    .map((s) => s.entry);
}

/** Render entries as `file :: name :: summary` lines for the planner prompt. */
export function renderRepoContext(entries: IndexEntry[]): string {
  if (entries.length === 0) return '';
  return entries.map((e) => `${e.file} :: ${e.name} :: ${e.summary || e.kind}`).join('\n');
}

/** Git tree hash of the working directory, or null when git is unavailable. */
export function gitTreeKey(root: string): string | null {
  try {
    const stdout = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 15_000,
      encoding: 'utf8',
    });
    const head = String(stdout).trim();
    return head === '' ? null : head;
  } catch {
    return null;
  }
}

/**
 * Cache key for `root`: the git HEAD hash when available, otherwise a
 * fingerprint over every indexed file's path, size and mtime.
 *
 * The fallback matters — without it a non-git checkout (or a git repo whose
 * HEAD the caller cannot resolve) would produce the key `null` on every call
 * and a stale cache would be served forever.
 */
export function repoCacheKey(root: string): string {
  const head = gitTreeKey(root);
  if (head !== null) return `git:${head}`;
  const parts: string[] = [];
  for (const rel of listSourceFiles(root)) {
    const stat = fs.statSync(path.join(root, rel), { throwIfNoEntry: false });
    if (!stat) continue;
    parts.push(`${rel}:${stat.size}:${Math.floor(stat.mtimeMs)}`);
  }
  const digest = hashString(parts.join('|')).toString(16);
  return `fs:${digest}:${parts.length}`;
}

interface RepoIndexCache {
  treeHash: string | null;
  entries: IndexEntry[];
}

function readCache(cacheFile: string): RepoIndexCache | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as RepoIndexCache;
    if (parsed && Array.isArray(parsed.entries)) return parsed;
  } catch {
    /* a missing or corrupt cache is simply a cache miss */
  }
  return null;
}

function writeCache(cacheFile: string, cache: RepoIndexCache): void {
  const tmp = `${cacheFile}.tmp`;
  try {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(cache), 'utf8');
    fs.renameSync(tmp, cacheFile);
  } catch (err) {
    console.warn(`[repoIndex] cache write failed: ${err instanceof Error ? err.message : String(err)}`);
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* nothing further to do; the cache is an optimization */
    }
  }
}

/**
 * Cached repo index for `root`, keyed by `repoCacheKey(root)` (git HEAD, or a
 * filesystem fingerprint when git is unavailable). A cache miss rebuilds and
 * rewrites it. A cache write failure is non-fatal: the caller still gets a
 * correct index, just recomputed next time.
 */
export function loadRepoIndex(root: string, cachePath: string = REPO_INDEX_CACHE): IndexEntry[] {
  const treeHash = repoCacheKey(root);
  const cacheFile = path.isAbsolute(cachePath) ? cachePath : path.join(root, cachePath);
  const cached = readCache(cacheFile);
  if (cached && cached.treeHash === treeHash) return cached.entries;
  const entries = buildRepoIndex(root);
  writeCache(cacheFile, { treeHash, entries });
  return entries;
}