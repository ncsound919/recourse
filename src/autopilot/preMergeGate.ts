/**
 * preMergeGate.ts — pre-merge verification gate for autopilot upgrade
 * proposals. Runs before anything is allowed to auto-merge.
 *
 * Design: every check executor is injected. The tested path never touches
 * child_process directly; only DEFAULT_EXECUTORS shells out, and only when the
 * caller does not provide its own executor for a step.
 *
 * Gate step order is fixed: sandbox -> lint -> typecheck -> tests. The first
 * failing step short-circuits the gate (later steps never run), and the gate
 * reports exactly what it ran and why it stopped.
 *
 * Honesty rules (mirrors executionSandboxHonesty):
 *   - v1 has no real sandbox verifier. When a proposal requires sandbox
 *     verification, the gate says so (`requires_sandbox_not_available`) — it
 *     never fabricates a pass for unverified code.
 *   - executors that cannot run (no package.json script, nothing to check)
 *     report a passing no-op with an output that says what did NOT happen.
 *   - executor resolution: when NO executors object is passed, every step
 *     falls back to its real DEFAULT_EXECUTORS implementation. When a PARTIAL
 *     executors object is passed, only the steps it names run; the rest become
 *     explicit no-op passes (`<name> executor not provided`) so a partial
 *     override can never silently drop a step that the caller thought was
 *     still active. Spread DEFAULT_EXECUTORS to override one step of the full
 *     real pipeline: `{ ...DEFAULT_EXECUTORS, lint: myLint }`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { GateResult, type GateResultT, type UpgradeProposalT } from './loopTypes';
import type { RepoBindingT } from './businessProfile';

// ============================================================================
// Public types
// ============================================================================

export interface ExecutorResult {
  passed: boolean;
  output: string;
  error?: string;
}

export type Executor = (ctx: GateContext) => Promise<ExecutorResult> | ExecutorResult;

export interface GateContext {
  repoPath: string; // local repo root
  changedFiles: string[]; // absolute paths touched by proposal
  repoBinding: RepoBindingT | null;
  /** Present on the ctx handed to executors by runGate so default executors
   *  can honor proposal flags (e.g. requiresSandboxVerify). */
  proposal?: UpgradeProposalT;
}

export interface GateExecutors {
  sandbox?: Executor; // run isolated verification of changed code
  lint?: Executor; // oxlint on changed files
  typecheck?: Executor; // tsc --noEmit in repoPath
  tests?: Executor; // repo test suite (scoped)
}

// ============================================================================
// Gate step order + protected path defaults
// ============================================================================

const GATE_STEPS = ['sandbox', 'lint', 'typecheck', 'tests'] as const;
type GateStep = (typeof GATE_STEPS)[number];

const LINTABLE_EXT = /\.(cjs|mjs|js|jsx|ts|tsx|mts|cts)$/i;
const SYNTAX_EXT = /\.(cjs|mjs|js)$/i;

// Mirrors RepoBinding.protectedPaths defaults in businessProfile.ts. Used only
// when the caller passes repoBindingArg === null.
const DEFAULT_PROTECTED_PATHS: string[] = [
  '.env',
  'gh token.txt',
  '*.env*',
  '*secret*',
  '*token*',
  '*key*',
];

const EXEC_TIMEOUT_MS = 120_000;

// ============================================================================
// Path + glob helpers
// ============================================================================

function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

function normalizeRel(repoPath: string, absPath: string): string {
  return toPosix(path.relative(repoPath, absPath));
}

/** H3: every proposal path must resolve strictly UNDER the repo root. An
 *  absolute path or any `..` traversal that escapes the root is refused. This
 *  is the last line of defense against a malicious/tampered proposal writing
 *  anywhere on disk. */
function resolveUnderRoot(repoPath: string, filePath: string): string {
  const root = path.resolve(repoPath);
  const target = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(root, filePath);
  const rel = path.relative(root, target);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`path traversal refused: '${filePath}' resolves outside repo root`);
  }
  return target;
}

function resolveTarget(repoPath: string, filePath: string): string {
  return resolveUnderRoot(repoPath, filePath);
}

/** Simple glob-ish matcher: `*` and `**` both match any run of characters
 *  (including `/`). Over-matching only blocks MORE paths, which is the safe
 *  direction for a protection gate. Patterns without `*` match the full rel
 *  path, any single path segment, or the basename. Matching is case-
 *  insensitive so `*.env*` also catches `.ENV.local` on case-sensitive files
 *  systems where humans typo case. */
function patternMatches(pattern: string, relPath: string): boolean {
  const p = toPosix(pattern).toLowerCase();
  const r = toPosix(relPath).toLowerCase();
  if (!p.includes('*')) {
    if (r === p) return true;
    const segments = r.split('/');
    return segments.some((seg) => seg === p);
  }
  let rx = '';
  for (const ch of p) {
    if (ch === '*') rx += '.*';
    else rx += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${rx}$`).test(r);
}

export function checkProtectedPaths(
  changedRelPaths: string[],
  repoBindingArg: RepoBindingT | null,
): { allowed: boolean; violations: string[] } {
  const patterns = repoBindingArg?.protectedPaths ?? DEFAULT_PROTECTED_PATHS;
  const violations: string[] = [];
  for (const rel of changedRelPaths) {
    if (patterns.some((pattern) => patternMatches(pattern, rel))) {
      violations.push(rel);
    }
  }
  return { allowed: violations.length === 0, violations };
}

// ============================================================================
// File application
// ============================================================================

/**
 * Applies create/modify/delete to disk under repoPath. No-op operations (a
 * create/modify whose content is already on disk, or a delete of a file that
 * does not exist) are skipped. Returns the absolute paths actually changed.
 */
export function applyProposalFiles(
  proposal: UpgradeProposalT,
  repoPath: string,
): { changedFiles: string[] } {
  const changedFiles: string[] = [];
  for (const file of proposal.files) {
    const target = resolveTarget(repoPath, file.path);
    if (file.action === 'delete') {
      if (!fs.existsSync(target)) continue; // no-op
      fs.rmSync(target, { force: true });
      changedFiles.push(target);
      continue;
    }
    // create | modify
    if (fs.existsSync(target)) {
      const existing = fs.readFileSync(target, 'utf8');
      if (existing === file.content) continue; // no-op — identical content
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
    }
    fs.writeFileSync(target, file.content, 'utf8');
    changedFiles.push(target);
  }
  return { changedFiles };
}

// ============================================================================
// Real executors (used only when the caller injects nothing for a step)
// ============================================================================

function errMsg(err: unknown): string {
  if (err instanceof Error) {
    const e = err as Error & { stdout?: unknown; stderr?: unknown };
    const extra: string[] = [];
    if (typeof e.stderr === 'string' && e.stderr.trim()) extra.push(e.stderr.trim());
    if (typeof e.stdout === 'string' && e.stdout.trim()) extra.push(e.stdout.trim());
    return extra.length ? `${e.message}\n${extra.join('\n')}` : e.message;
  }
  return String(err);
}

/** npm/npx are .cmd shims on win32; execFileSync cannot run a .cmd without a
 *  shell. The no-shell fix (M1): execute the real JS CLI entry with
 *  process.execPath — `node <cli.js> ...args` — so file paths are passed as
 *  opaque argv and characters like `&`, `|`, backticks, `$()` can never be
 *  interpreted by a shell. There is intentionally NO shell in this module. */

const THIS_MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_MODULE_DIR, '..', '..');

/** The bundled npm CLI lives next to node.exe for official installs. */
function resolveNpmCliJs(): string | null {
  const candidates = [
    path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(REPO_ROOT, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

/** oxlint's real JS CLI in this repo's node_modules. */
function resolveOxlintCliJs(): string | null {
  const candidates = [
    path.join(REPO_ROOT, 'node_modules', 'oxlint', 'dist', 'cli.js'),
    path.join(REPO_ROOT, 'node_modules', 'oxlint', 'bin', 'oxlint'),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

function runNode(cliJs: string, args: string[], cwd: string): { stdout: string; stderr: string } {
  const stdout = execFileSync(process.execPath, [cliJs, ...args], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: EXEC_TIMEOUT_MS,
    encoding: 'utf8',
  });
  return { stdout: typeof stdout === 'string' ? stdout : '', stderr: '' };
}

const sandbox: Executor = (ctx) => {
  if (ctx.proposal?.requiresSandboxVerify === true) {
    return { passed: false, output: 'requires_sandbox_not_available' };
  }
  const jsFiles = ctx.changedFiles.filter((f) => SYNTAX_EXT.test(f));
  if (jsFiles.length === 0) {
    return { passed: true, output: 'no javascript files to syntax-check' };
  }
  const failures: string[] = [];
  for (const file of jsFiles) {
    try {
      execFileSync('node', ['--check', file], {
        cwd: ctx.repoPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: EXEC_TIMEOUT_MS,
        encoding: 'utf8',
      });
    } catch (err) {
      failures.push(`${path.basename(file)}: ${errMsg(err)}`);
    }
  }
  if (failures.length > 0) {
    return { passed: false, output: failures.join('\n'), error: failures.join('; ') };
  }
  return {
    passed: true,
    output: `node --check passed (${jsFiles.length} file${jsFiles.length === 1 ? '' : 's'})`,
  };
};

const lint: Executor = (ctx) => {
  const lintable = ctx.changedFiles.filter((f) => LINTABLE_EXT.test(f));
  if (lintable.length === 0) {
    return { passed: true, output: 'no lintable changed files' };
  }
  const cli = resolveOxlintCliJs();
  if (!cli) {
    return { passed: true, output: 'oxlint unavailable (no shell fallback); lint skipped' };
  }
  try {
    const { stdout, stderr } = runNode(cli, ['oxlint', ...lintable], ctx.repoPath);
    const tail = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
    return {
      passed: true,
      output: `oxlint passed on ${lintable.length} file(s)${tail ? `\n${tail}` : ''}`,
    };
  } catch (err) {
    const message = errMsg(err);
    return { passed: false, output: message, error: message };
  }
};

function readPackageScripts(repoPath: string): Record<string, string> | null {
  const pkgPath = path.join(repoPath, 'package.json');
  try {
    if (!fs.existsSync(pkgPath)) return null;
    const raw = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string> };
    return raw.scripts ?? {};
  } catch {
    return null;
  }
}

const typecheck: Executor = (ctx) => {
  const scripts = readPackageScripts(ctx.repoPath);
  if (!scripts || !scripts.typecheck) {
    return { passed: true, output: 'no typecheck script' };
  }
  const cli = resolveNpmCliJs();
  if (!cli) {
    return { passed: true, output: 'npm CLI unavailable (no shell fallback); typecheck skipped' };
  }
  try {
    const { stdout, stderr } = runNode(cli, ['run', 'typecheck'], ctx.repoPath);
    const tail = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
    return { passed: true, output: `npm run typecheck passed${tail ? `\n${tail}` : ''}` };
  } catch (err) {
    const message = errMsg(err);
    return { passed: false, output: message, error: message };
  }
};

const tests: Executor = (ctx) => {
  const scripts = readPackageScripts(ctx.repoPath);
  if (!scripts || !scripts.test) {
    return { passed: true, output: 'no test script' };
  }
  const changedTestFiles = ctx.changedFiles.filter((f) => {
    const rel = normalizeRel(ctx.repoPath, f);
    return rel.startsWith('tests/') || rel.includes('/tests/');
  });
  if (changedTestFiles.length === 0) {
    return { passed: true, output: 'no changed files under tests/; full suite skipped' };
  }
  const cli = resolveNpmCliJs();
  if (!cli) {
    return { passed: true, output: 'npm CLI unavailable (no shell fallback); tests skipped' };
  }
  try {
    const { stdout, stderr } = runNode(
      cli,
      ['test', '--', '--run', ...changedTestFiles],
      ctx.repoPath,
    );
    const tail = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
    return {
      passed: true,
      output: `npm test (scoped to ${changedTestFiles.length} file(s)) passed${tail ? `\n${tail}` : ''}`,
    };
  } catch (err) {
    const message = errMsg(err);
    return { passed: false, output: message, error: message };
  }
};

export const DEFAULT_EXECUTORS: Required<GateExecutors> = { sandbox, lint, typecheck, tests };

// ============================================================================
// runGate
// ============================================================================

export interface GateOptions {
  /** When false, proposal files are NOT written to disk (read-only dry gate).
   *  Executors still run, but against an empty changed-files set. */
  applyFiles?: boolean;
}

/** Snapshot of every file a proposal would touch, captured before apply so a
 *  failed gate can roll the working tree back to exactly its prior state. */
type Snapshot = Map<string, { existed: boolean; content?: string }>;

function captureSnapshot(proposal: UpgradeProposalT, repoPath: string): Snapshot {
  const snapshot: Snapshot = new Map();
  for (const file of proposal.files) {
    const target = resolveTarget(repoPath, file.path);
    if (file.action === 'delete' && !fs.existsSync(target)) continue;
    if (fs.existsSync(target)) {
      snapshot.set(target, { existed: true, content: fs.readFileSync(target, 'utf8') });
    } else {
      snapshot.set(target, { existed: false });
    }
  }
  return snapshot;
}

function rollbackSnapshot(snapshot: Snapshot): void {
  for (const [target, before] of snapshot) {
    try {
      if (before.existed) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, before.content ?? '', 'utf8');
      } else if (fs.existsSync(target)) {
        fs.rmSync(target, { force: true });
      }
    } catch {
      // Best-effort rollback: a restored file is better than a thrown gate.
    }
  }
}

function resolveExecutor(step: GateStep, executors: GateExecutors | undefined): Executor {
  // No executors object -> the full real pipeline.
  if (!executors) return DEFAULT_EXECUTORS[step];
  // Partial override -> named steps run, unknown steps become explicit no-ops.
  const injected = executors[step];
  if (injected) return injected;
  return () => ({ passed: true, output: `${step} executor not provided` });
}

export async function runGate(
  proposal: UpgradeProposalT,
  repoPath: string,
  executors?: GateExecutors,
  repoBindingArg: RepoBindingT | null = null,
  options: GateOptions = {},
): Promise<GateResultT> {
  const applyFiles = options.applyFiles ?? true;

  // 1. Protected-path check BEFORE anything touches disk. The blocked paths are
  //    the proposal's intended paths (create/modify/delete alike). A blocked
  //    proposal is never applied and never rolled back — nothing changed. A
  //    path that traverses outside the repo root (H3) is also refused here.
  let intendedRel: string[];
  try {
    intendedRel = proposal.files.map((f) =>
      normalizeRel(repoPath, resolveTarget(repoPath, f.path)),
    );
  } catch (err) {
    return GateResult.parse({
      proposalId: proposal.id,
      passed: false,
      checks: [
        {
          name: 'path_traversal',
          passed: false,
          output: errMsg(err),
          durationMs: 0,
        },
      ],
      rejectedReason: `path traversal: ${errMsg(err)}`,
    });
  }
  const protectedCheck = checkProtectedPaths(intendedRel, repoBindingArg);
  if (!protectedCheck.allowed) {
    const first = protectedCheck.violations[0] ?? '';
    return GateResult.parse({
      proposalId: proposal.id,
      passed: false,
      checks: [
        {
          name: 'protected_paths',
          passed: false,
          output: `blocked protected path(s): ${protectedCheck.violations.join(', ')}`,
          durationMs: 0,
        },
      ],
      rejectedReason: `Protected path: ${first}`,
    });
  }

  // 2. Apply files (unless this is a read-only dry gate). M2: the snapshot is
  //    rolled back on BOTH an apply failure (partial writes) and a normal
  //    completion — runGate is a VERIFIER; the autopilot commits to GitHub via
  //    REST, so the local clone must return to its exact prior state so a later
  //    post-merge audit measures remote truth, not an uncommitted local edit.
  const snapshot: Snapshot | null = applyFiles ? captureSnapshot(proposal, repoPath) : null;
  let changedFiles: string[] = [];
  if (applyFiles) {
    try {
      ({ changedFiles } = applyProposalFiles(proposal, repoPath));
    } catch (err) {
      if (snapshot) rollbackSnapshot(snapshot);
      return GateResult.parse({
        proposalId: proposal.id,
        passed: false,
        checks: [],
        rejectedReason: `apply failed: ${errMsg(err)}`,
      });
    }
  }

  // 3. Run executors in order; short-circuit on first failure. On failure the
  //    working tree is rolled back to the captured snapshot.
  const ctx: GateContext = { repoPath, changedFiles, repoBinding: repoBindingArg, proposal };
  const checks: GateResultT['checks'] = [];
  for (const step of GATE_STEPS) {
    const executor = resolveExecutor(step, executors);
    const start = performance.now();
    let result: ExecutorResult;
    try {
      result = await executor(ctx);
    } catch (err) {
      result = { passed: false, output: errMsg(err), error: errMsg(err) };
    }
    const durationMs = Math.max(0, Math.round(performance.now() - start));
    const check = {
      name: step,
      passed: result.passed,
      output: result.output,
      durationMs,
      ...(result.error ? { error: result.error } : {}),
    };
    checks.push(check);
    if (!result.passed) {
      const reason = result.error && result.error.trim() ? result.error : result.output;
      const failed = GateResult.parse({
        proposalId: proposal.id,
        passed: false,
        checks,
        overallScore: checks.filter((c) => c.passed).length / checks.length,
        rejectedReason: `${step} failed: ${reason}`,
      });
      if (snapshot) rollbackSnapshot(snapshot);
      return failed;
    }
  }

  // 4. All green — then roll the tree back (M2) so the verifier never leaves
  //    the local clone dirty.
  if (snapshot) rollbackSnapshot(snapshot);
  return GateResult.parse({
    proposalId: proposal.id,
    passed: true,
    checks,
    overallScore: 1,
  });
}
