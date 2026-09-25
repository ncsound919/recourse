/**
 * Deterministic, no-LLM OpenSpec verify-queue consumer.
 *
 * Pure fs + regex scanning of <changesDir>/<name>/{proposal.md,design.md,tasks.md}.
 * Honest fail-soft: missing dirs/files are reported, never fabricated.
 * Optional `recourse-verify` fenced attachments in tasks.md are executed through
 * the real sandbox (executeTestSuite); anything unparseable is skipped honestly
 * with detail 'no verifiable attachments'.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { executeTestSuite } from './executionSandbox';

export interface SpecTaskCounts {
  total: number;
  done: number;
}

export interface SpecQueueEntry {
  name: string;
  hasProposal: boolean;
  hasDesign: boolean;
  hasTasks: boolean;
  taskCounts: SpecTaskCounts;
  complete: boolean;
}

export interface SpecCheck {
  check: string;
  passed: boolean;
  detail: string;
}

export interface SpecVerification {
  name: string;
  checks: SpecCheck[];
  passed: boolean;
}

const TASK_CHECKBOX_RE = /^\s*-\s*\[( |x|X)\]/gm;
const VERIFY_FENCE_RE = /```recourse-verify[^\S\r\n]*\r?\n([\s\S]*?)```/g;

function safeRead(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function countTasks(tasksContent: string | null): SpecTaskCounts {
  if (!tasksContent) return { total: 0, done: 0 };
  const matches = tasksContent.match(TASK_CHECKBOX_RE) ?? [];
  const done = matches.filter((m) => /\[x\]/i.test(m)).length;
  return { total: matches.length, done };
}

function orchestratorRootFromHere(): string | null {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    // specQueue.ts lives at <orchestrator-root>/agents/recourse/src/lib/
    return path.resolve(here, '..', '..', '..', '..');
  } catch {
    return null;
  }
}

/**
 * Resolve the OpenSpec changes dir. Never throws.
 * Priority: OPENSPEC_CHANGES_DIR env, else <orchestrator-root>/openspec/changes
 * (two levels up from agents/recourse), else <cwd>/openspec/changes.
 */
export function resolveChangesDir(): { path: string; exists: boolean } {
  try {
    const fromEnv = (process.env.OPENSPEC_CHANGES_DIR || '').trim();
    if (fromEnv) {
      return { path: fromEnv, exists: fs.existsSync(fromEnv) };
    }
    const root = orchestratorRootFromHere();
    if (root) {
      const p = path.join(root, 'openspec', 'changes');
      return { path: p, exists: fs.existsSync(p) };
    }
    const fallback = path.join(process.cwd(), 'openspec', 'changes');
    return { path: fallback, exists: fs.existsSync(fallback) };
  } catch {
    try {
      const fallback = path.join(process.cwd(), 'openspec', 'changes');
      return { path: fallback, exists: false };
    } catch {
      return { path: 'openspec/changes', exists: false };
    }
  }
}

/** List spec dirs in changesDir with proposal/design/tasks presence + task counts. Never throws. */
export function scanSpecQueue(changesDir: string): SpecQueueEntry[] {
  try {
    if (!changesDir || !fs.existsSync(changesDir)) return [];
    const stat = fs.statSync(changesDir);
    if (!stat.isDirectory()) return [];
    const names = fs
      .readdirSync(changesDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    return names.map((name) => {
      try {
        const dir = path.join(changesDir, name);
        const proposal = safeRead(path.join(dir, 'proposal.md'));
        const design = safeRead(path.join(dir, 'design.md'));
        const tasks = safeRead(path.join(dir, 'tasks.md'));
        const hasProposal = proposal !== null && proposal.trim().length > 0;
        const hasDesign = design !== null;
        const taskCounts = countTasks(tasks);
        const hasTasks = tasks !== null && taskCounts.total > 0;
        const complete =
          hasProposal && hasDesign && hasTasks && taskCounts.total > 0 && taskCounts.done === taskCounts.total;
        return { name, hasProposal, hasDesign, hasTasks, taskCounts, complete };
      } catch {
        return {
          name,
          hasProposal: false,
          hasDesign: false,
          hasTasks: false,
          taskCounts: { total: 0, done: 0 },
          complete: false,
        };
      }
    });
  } catch {
    return [];
  }
}

function extractVerifyAttachments(tasksContent: string): Array<{ sourceCode: string; testSuiteCode: string }> {
  const out: Array<{ sourceCode: string; testSuiteCode: string }> = [];
  try {
    VERIFY_FENCE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = VERIFY_FENCE_RE.exec(tasksContent)) !== null) {
      const raw = (m[1] || '').trim();
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const sourceCode = parsed['sourceCode'];
        const testSuiteCode = parsed['testSuiteCode'] ?? parsed['test'];
        if (typeof sourceCode === 'string' && sourceCode.trim().length > 0 && typeof testSuiteCode === 'string') {
          out.push({ sourceCode, testSuiteCode });
        }
      } catch {
        // Unparseable fence — not a verifiable attachment, skip honestly.
      }
    }
  } catch {
    // Regex/extraction failure — caller reports 'no verifiable attachments'.
  }
  return out;
}

/**
 * Verify one spec dir. Never throws; a missing spec yields passed:false with a
 * spec-exists check explaining why. `name` must be a bare dir name (no
 * traversal); anything else is treated as not found.
 */
export function verifySpecDir(changesDir: string, name: string): SpecVerification {
  const noTraversal = typeof name === 'string' && name.trim().length > 0 && !/(\.\.|[/\\])/.test(name);
  const clean = noTraversal ? path.basename(name.trim()) : '';
  if (!noTraversal || clean !== name.trim()) {
    return {
      name,
      checks: [{ check: 'spec-exists', passed: false, detail: `spec "${name}" not found` }],
      passed: false,
    };
  }
  try {
    const dir = path.join(changesDir, clean);
    if (!changesDir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      return {
        name: clean,
        checks: [{ check: 'spec-exists', passed: false, detail: `spec "${clean}" not found in ${changesDir}` }],
        passed: false,
      };
    }

    const checks: SpecCheck[] = [];
    const proposal = safeRead(path.join(dir, 'proposal.md'));
    const design = safeRead(path.join(dir, 'design.md'));
    const tasks = safeRead(path.join(dir, 'tasks.md'));

    const proposalLen = proposal === null ? 0 : proposal.trim().length;
    checks.push({
      check: 'proposal-exists',
      passed: proposal !== null && proposalLen > 0,
      detail:
        proposal === null
          ? 'proposal.md missing'
          : proposalLen === 0
            ? 'proposal.md empty'
            : `proposal.md present (${proposalLen} chars)`,
    });

    checks.push({
      check: 'design-exists',
      passed: design !== null,
      detail: design === null ? 'design.md missing' : 'design.md present',
    });

    const taskCounts = countTasks(tasks);
    checks.push({
      check: 'tasks-exist',
      passed: tasks !== null && taskCounts.total > 0,
      detail:
        tasks === null
          ? 'tasks.md missing'
          : taskCounts.total === 0
            ? 'tasks.md has no checklist tasks'
            : `tasks.md has ${taskCounts.done}/${taskCounts.total} tasks complete`,
    });

    checks.push({
      check: 'proposal-substance',
      passed: proposalLen > 50,
      detail:
        proposalLen > 50
          ? `proposal substantive (${proposalLen} chars)`
          : `proposal too short or TODO-only (${proposalLen} chars, need >50)`,
    });

    const attachments = tasks === null ? [] : extractVerifyAttachments(tasks);
    if (attachments.length === 0) {
      checks.push({ check: 'code-attachments', passed: true, detail: 'no verifiable attachments' });
    } else {
      attachments.forEach((a, i) => {
        try {
          const suite = executeTestSuite(a.sourceCode, a.testSuiteCode);
          const fails = suite.testDetails.filter((d) => d.startsWith('[FAIL]')).length;
          checks.push({
            check: `code-attachment-${i + 1}`,
            passed: suite.passed,
            detail: suite.passed
              ? `attachment ${i + 1} passed (score ${suite.score})`
              : `attachment ${i + 1} FAILED (${fails} failing assertions, score ${suite.score})`,
          });
        } catch (err) {
          checks.push({
            check: `code-attachment-${i + 1}`,
            passed: false,
            detail: `attachment ${i + 1} could not be executed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      });
    }

    return { name: clean, checks, passed: checks.every((c) => c.passed) };
  } catch (err) {
    return {
      name: clean,
      checks: [
        { check: 'spec-exists', passed: false, detail: `verify failed: ${err instanceof Error ? err.message : String(err)}` },
      ],
      passed: false,
    };
  }
}
