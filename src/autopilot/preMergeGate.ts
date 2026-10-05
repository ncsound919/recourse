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
 * The sandbox step runs one of two lanes, chosen by the proposal's verification
 * (`verificationLane`):
 *   - lane A: the change imports nothing from the repo, so its verified files
 *     are flattened into one program and the acceptance test runs in the
 *     isolated sandbox. A top-level name shared by two files is REFUSED, never
 *     silently merged.
 *   - lane B: the change imports existing repo modules (or ships a vitest file),
 *     which flattening cannot express. It is materialized into a temp worktree
 *     and proven by the repo's real `tsc --noEmit` plus `vitest run <testFile>`.
 *     Nothing is written to the live tree before that passes.
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
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { GateResult, verificationLane, verificationPaths, type GateResultT, type ProposalVerificationT, type UpgradeProposalT } from './loopTypes';
import { executeTestSuite } from '../lib/executionSandbox';
import { bundleModulesDetailed, type ModuleSource } from '../lib/multiFileForge';
import { behaviorFor } from './qualityTier';
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

const _importMetaUrl: string | undefined =
  typeof import.meta !== 'undefined' && import.meta.url ? import.meta.url : undefined;
const THIS_MODULE_DIR =
  typeof __filename !== 'undefined'
    ? path.dirname(__filename)
    : _importMetaUrl
      ? path.dirname(fileURLToPath(_importMetaUrl))
      : process.cwd();
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

/** The repo's own `tsc` entry, resolved from the repo under verification. */
function resolveTscCliJs(repoPath: string): string | null {
  const candidates = [
    path.join(repoPath, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc'),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

/** The repo's own `vitest` entry, resolved from the repo under verification. */
function resolveVitestCliJs(repoPath: string): string | null {
  const candidates = [
    path.join(repoPath, 'node_modules', 'vitest', 'vitest.mjs'),
    path.join(repoPath, 'node_modules', 'vitest', 'vitest.js'),
    path.join(REPO_ROOT, 'node_modules', 'vitest', 'vitest.mjs'),
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

/** Directories never copied into a lane-B worktree, and the deps linked in. */
const WORKTREE_SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.recourse']);

/**
 * Copy the repo into a temp directory (skipping build output and VCS state) and
 * link the real `node_modules` back in, so `tsc` and `vitest` can actually run.
 *
 * The proposal's files are written into the copy, never into the live tree: lane
 * B must be able to prove or disprove a change before anything is applied. The
 * caller owns removal via `cleanupLaneBWorktree`.
 */
export function materializeLaneBWorktree(repoPath: string): string {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'recourse-lane-b-'));
  const copy = (from: string, to: string): void => {
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      if (WORKTREE_SKIP.has(entry.name)) continue;
      const src = path.join(from, entry.name);
      const dst = path.join(to, entry.name);
      if (entry.isDirectory()) {
        fs.mkdirSync(dst, { recursive: true });
        copy(src, dst);
      } else if (entry.isFile()) {
        fs.copyFileSync(src, dst);
      }
    }
  };
  fs.mkdirSync(dest, { recursive: true });
  copy(repoPath, dest);

  // A junction is the Windows equivalent of a directory symlink and needs no
  // elevated privilege; on POSIX this is a plain symlink.
  const realModules = path.join(repoPath, 'node_modules');
  if (fs.existsSync(realModules)) {
    try {
      fs.symlinkSync(realModules, path.join(dest, 'node_modules'), 'junction');
    } catch (err) {
      throw new Error(
        `node_modules link failed (${err instanceof Error ? err.message : String(err)}): lane B cannot run tsc/vitest without dependencies`,
      );
    }
  }
  return dest;
}

/** Remove a lane-B worktree, ignoring failures (it is always a temp dir). */
export function cleanupLaneBWorktree(dir: string | null): void {
  if (!dir) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* a leftover temp dir must never fail the gate */
  }
}

/**
 * Lane B: materialize the change, then run the repo's real `tsc --noEmit` and
 * `vitest run <testFile>`. Passes only when both exit 0. The temp worktree is
 * removed on every path, pass or fail.
 */
function runLaneB(ctx: GateContext, verification: ProposalVerificationT): ExecutorResult {
  const repoPath = ctx.repoPath;
  const tsc = resolveTscCliJs(repoPath);
  if (!tsc) {
    return {
      passed: false,
      output: 'lane_b_unavailable: no typescript in node_modules; a change that imports repo modules cannot be proven',
      error: 'lane_b_unavailable',
    };
  }
  let worktree: string | null = null;
  try {
    worktree = materializeLaneBWorktree(repoPath);
    const written = applyProposalFiles(ctx.proposal!, worktree);
    const tsconfig = path.join(worktree, 'tsconfig.json');
    const typecheckArgs = fs.existsSync(tsconfig) ? ['--noEmit', '-p', '.'] : ['--noEmit'];
    try {
      const tscOut = runNode(tsc, typecheckArgs, worktree);
      if (tscOut.stdout.trim() || tscOut.stderr.trim()) {
        return {
          passed: false,
          output: `tsc failed:\n${[tscOut.stdout.trim(), tscOut.stderr.trim()].filter(Boolean).join('\n')}`,
          error: 'lane_b typecheck failed',
        };
      }
    } catch (err) {
      return { passed: false, output: `tsc failed: ${errMsg(err)}`, error: 'lane_b typecheck failed' };
    }

    const testFile = verification.testFile;
    if (!testFile) {
      return {
        passed: true,
        output: `lane_b typecheck passed for ${written.changedFiles.length} file(s); no testFile declared`,
      };
    }
    const vitest = resolveVitestCliJs(worktree);
    if (!vitest) {
      return {
        passed: false,
        output: 'lane_b_unavailable: vitest is not installed, so the declared testFile cannot be run',
        error: 'lane_b_unavailable',
      };
    }
    const testAbs = path.join(worktree, testFile.replace(/\\/g, '/'));
    if (!fs.existsSync(testAbs)) {
      return {
        passed: false,
        output: `lane_b: testFile "${testFile}" does not exist in the materialized worktree`,
        error: 'lane_b test file missing',
      };
    }
    try {
      const { stdout } = runNode(vitest, ['run', testFile], worktree);
      return {
        passed: true,
        output: `lane_b typecheck + vitest passed for ${testFile}\n${stdout.trim().slice(-2000)}`,
      };
    } catch (err) {
      return { passed: false, output: `vitest failed: ${errMsg(err)}`, error: 'lane_b vitest failed' };
    }
  } catch (err) {
    return { passed: false, output: `lane_b failed: ${errMsg(err)}`, error: 'lane_b failed' };
  } finally {
    cleanupLaneBWorktree(worktree);
  }
}

/** Lane A: flatten the verified files into one program and run the suite. */
function runLaneA(
  proposal: UpgradeProposalT,
  verification: ProposalVerificationT,
): ExecutorResult {
  const wanted = verificationPaths(verification).map(toPosix);
  const files = proposal.files.filter((f) => wanted.includes(toPosix(f.path)));
  if (files.length === 0) {
    return {
      passed: false,
      output: `verification references ${wanted.join(', ') || '(no file)'} but the proposal has none of them`,
      error: 'verification file not found in proposal',
    };
  }
  const missingContent = files.filter((f) => f.content.trim() === '');
  if (missingContent.length > 0) {
    return {
      passed: false,
      output: `verification file(s) ${missingContent.map((f) => f.path).join(', ')} have no content`,
      error: 'verification file has no content',
    };
  }
  const modules: ModuleSource[] = files.map((f) => ({ rel: f.path, source: f.content }));
  const bundle = bundleModulesDetailed(modules);
  if (bundle.collisions.length > 0) {
    const detail = bundle.collisions
      .map((c) => `'${c.name}' declared by ${c.modules.join(', ')}`)
      .join('; ');
    return {
      passed: false,
      output: `lane_a cannot flatten these files into one program: ${detail}`,
      error: 'top-level name collision',
    };
  }
  const run = executeTestSuite(bundle.source, verification.acceptanceTest);
  const failures = run.testDetails.filter((d) => d.startsWith('[FAIL'));
  return run.passed
    ? {
        passed: true,
        output: `sandbox suite passed for ${files.map((f) => f.path).join(', ')} (${run.testDetails.length - 1} assertion(s))`,
      }
    : {
        passed: false,
        output: failures.join('\n') || 'sandbox suite failed',
        error: `sandbox verification failed for ${files.map((f) => f.path).join(', ')}`,
      };
}

const sandbox: Executor = (ctx) => {
  if (ctx.proposal?.requiresSandboxVerify === true) {
    // Real verification when the proposal carries an acceptance test: run it
    // against the changed files' content. A proposal that requires
    // verification but supplies no test is refused honestly (never a
    // fabricated pass).
    const verification = ctx.proposal.verification;
    if (!verification) {
      return { passed: false, output: 'requires_sandbox_not_available' };
    }
    // A change that imports existing repo modules cannot be proven by
    // flattening it, so it is materialized and typechecked for real instead.
    if (verificationLane(verification) === 'lane_b') return runLaneB(ctx, verification);
    return runLaneA(ctx.proposal, verification);
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

/**
 * A gate pass only authorises an auto-merge when the proposal's tier actually
 * permits one. `qualityTier` is the table that says so; the generator stamps
 * the proposal with the result. A proposal that carries no stamp falls back to
 * the tier's own table rather than defaulting to "allowed".
 */
export function autoDeployAllowedFor(proposal: UpgradeProposalT): {
  allowed: boolean;
  reason: string;
} {
  if (proposal.autoDeployAllowed === false) {
    return {
      allowed: false,
      reason: `tier ${proposal.tier} artifacts are never auto-deployable (${behaviorFor(proposal.tier).decisionAuthority} decides)`,
    };
  }
  if (proposal.autoDeployAllowed === true && !behaviorFor(proposal.tier).autoDeploy) {
    // The proposal claims auto-deploy but its tier disagrees; the tier wins.
    return {
      allowed: false,
      reason: `proposal claims auto-deploy but tier ${proposal.tier} is ${behaviorFor(proposal.tier).decisionAuthority}-gated`,
    };
  }
  const behavior = behaviorFor(proposal.tier);
  return {
    allowed: behavior.autoDeploy,
    reason: behavior.autoDeploy
      ? `tier ${behavior.tier} artifacts are auto-deployable; required markers: ${behavior.requiredMarkers.join(', ') || '(none)'}`
      : `tier ${behavior.tier} artifacts (${behavior.decisionAuthority}) are NEVER auto-deployable`,
  };
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
