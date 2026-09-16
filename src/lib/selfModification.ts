/**
 * selfModification.ts — the safety + verification policy for Recourse modifying
 * its OWN source (Phase 5, "verified self-modification").
 *
 * The verified-patch intake (`fleetDevelopment.verifyAndApplyPatch`) already
 * enforces sandbox + lint + a compile gate before a patch touches disk. What it
 * does NOT decide is *whether this file may be auto-modified at all*. This
 * module is that decision point, so a runaway driver can never silently rewrite
 * the gate, the policy engine, CI, or the secret surface.
 *
 * Three tiers, evaluated most-restrictive-first:
 *   - safety  : NEVER auto-modified (gate/policy/approvals/CI/secrets/lockfile)
 *   - harness : requires explicit human approval unless the operator has armed
 *               unattended application (`RECOURSE_SELF_MOD_APPLY=1`)
 *   - auto    : docs/config/data — verified + applied without a human
 *
 * It also upgrades the "CI-green" harness gate from a bare `tsc --noEmit` to a
 * composite typecheck + lint (+ optional test) gate, with an injectable command
 * runner so the behavior is unit-testable and honest when a tool is missing.
 */
import { verifyAndApplyPatch, type BootGreenGate, type PatchResult, type ProposedPatch } from './fleetDevelopment.js';
import type { ApprovalStore } from './approvals.js';

// ---------------------------------------------------------------------------
// Target classification
// ---------------------------------------------------------------------------

export type SelfModTargetClass = 'safety' | 'harness' | 'auto';

export interface SelfModRule {
  id: string;
  effect: 'allow' | 'require_approval' | 'deny';
  /** Glob over the repo-relative path (forward slashes). */
  match: string;
  reason: string;
}

/** Paths that may never be modified by an automated self-modification pass. */
export const SELF_MOD_SAFETY_RULES: SelfModRule[] = [
  { id: 'safety-this-module', effect: 'deny', match: 'src/lib/selfModification.ts', reason: 'the self-modification policy cannot modify itself' },
  { id: 'safety-gate', effect: 'deny', match: 'src/autopilot/preMergeGate.ts', reason: 'the pre-merge gate is protected' },
  { id: 'safety-policy', effect: 'deny', match: 'src/lib/policy.ts', reason: 'the policy engine is protected' },
  { id: 'safety-approvals', effect: 'deny', match: 'src/lib/approvals.ts', reason: 'the approval queue is protected' },
  { id: 'safety-fleet', effect: 'deny', match: 'src/lib/fleetDevelopment.ts', reason: 'the verified-patch intake is protected' },
  { id: 'safety-ci', effect: 'deny', match: '.github/**', reason: 'CI configuration is protected' },
  { id: 'safety-env', effect: 'deny', match: '.env', reason: 'the environment file holds secrets' },
  { id: 'safety-env-any', effect: 'deny', match: '*.env*', reason: 'environment files hold secrets' },
  { id: 'safety-secret', effect: 'deny', match: '*secret*', reason: 'secret-bearing path' },
  { id: 'safety-token', effect: 'deny', match: '*token*', reason: 'token-bearing path' },
  { id: 'safety-key', effect: 'deny', match: '*key*', reason: 'key-bearing path' },
  { id: 'safety-lockfile', effect: 'deny', match: 'package-lock.json', reason: 'the lockfile must change only via npm' },
  { id: 'safety-dot-recourse', effect: 'deny', match: '.recourse/**', reason: 'the rollback journal must not be self-modified' },
];

/** Paths that need an explicit human approval unless unattended mode is armed. */
export const SELF_MOD_APPROVAL_RULES: SelfModRule[] = [
  { id: 'approve-server', effect: 'require_approval', match: 'server.ts', reason: 'the server monolith is core harness' },
  { id: 'approve-src-ts', effect: 'require_approval', match: 'src/**/*.ts', reason: 'harness source requires approval' },
  { id: 'approve-src-tsx', effect: 'require_approval', match: 'src/**/*.tsx', reason: 'harness source requires approval' },
  { id: 'approve-package', effect: 'require_approval', match: 'package.json', reason: 'dependency/script changes require approval' },
  { id: 'approve-tsconfig', effect: 'require_approval', match: 'tsconfig.json', reason: 'build config requires approval' },
  { id: 'approve-vitest', effect: 'require_approval', match: 'vitest.config.ts', reason: 'test config requires approval' },
];

/** Paths an automated pass may change after the verified gate (docs/data). */
export const SELF_MOD_AUTO_RULES: SelfModRule[] = [
  { id: 'auto-markdown', effect: 'allow', match: '**/*.md', reason: 'documentation is auto-eligible' },
  { id: 'auto-docs', effect: 'allow', match: 'docs/**', reason: 'documentation is auto-eligible' },
  { id: 'auto-data', effect: 'allow', match: 'data/**', reason: 'data artifacts are auto-eligible' },
];

function toPosix(p: string): string {
  return String(p ?? '').replace(/\\/g, '/');
}

/** Glob matcher: `**` spans separators, `*` spans anything (safe over-match). */
export function matchPathGlob(pattern: string, relPath: string): boolean {
  const p = toPosix(pattern).toLowerCase();
  const r = toPosix(relPath).toLowerCase().replace(/^\.\//, '');
  if (!p.includes('*')) {
    if (r === p) return true;
    return r.split('/').some((seg) => seg === p);
  }
  let rx = '';
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (ch === '*' && p[i + 1] === '*') {
      rx += '.*';
      i += 1;
    } else if (ch === '*') {
      rx += '[^/]*';
    } else {
      rx += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${rx}$`).test(r);
}

export function classifySelfModTarget(file: string): SelfModTargetClass {
  const rel = toPosix(file);
  if (SELF_MOD_SAFETY_RULES.some((r) => matchPathGlob(r.match, rel))) return 'safety';
  if (SELF_MOD_APPROVAL_RULES.some((r) => matchPathGlob(r.match, rel))) return 'harness';
  return 'auto';
}

export interface SelfModDecision {
  allowed: boolean;
  requiresApproval: boolean;
  targetClass: SelfModTargetClass;
  reason: string;
  ruleId?: string;
}

/**
 * Decide whether a self-modification may proceed. `autoApprove` (unattended
 * mode) promotes harness targets to auto, but NEVER overrides a safety target.
 */
export function evaluateSelfModification(input: {
  file: string;
  /** When true, harness targets may proceed without approval (never safety). */
  autoApprove?: boolean;
  extraRules?: SelfModRule[];
}): SelfModDecision {
  const rel = toPosix(input.file);
  const rules = [...SELF_MOD_SAFETY_RULES, ...SELF_MOD_APPROVAL_RULES, ...SELF_MOD_AUTO_RULES, ...(input.extraRules ?? [])];
  const matched = rules.filter((r) => matchPathGlob(r.match, rel));
  const severity = { allow: 1, require_approval: 2, deny: 3 } as const;
  const worst = matched.sort((a, b) => severity[b.effect] - severity[a.effect])[0];
  const targetClass = classifySelfModTarget(rel);

  if (worst?.effect === 'deny') {
    return { allowed: false, requiresApproval: false, targetClass, reason: worst.reason, ruleId: worst.id };
  }
  const needsApproval = worst?.effect === 'require_approval';
  if (needsApproval && !input.autoApprove) {
    return {
      allowed: true,
      requiresApproval: true,
      targetClass,
      reason: `${worst!.reason}; awaiting human approval`,
      ruleId: worst!.id,
    };
  }
  return {
    allowed: true,
    requiresApproval: false,
    targetClass,
    reason: needsApproval
      ? `${worst!.reason}; unattended self-modification armed`
      : worst?.reason ?? 'auto-eligible path',
    ...(worst ? { ruleId: worst.id } : {}),
  };
}

// ---------------------------------------------------------------------------
// Composite harness gate (typecheck + lint [+ test])
// ---------------------------------------------------------------------------

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type CommandRunner = (command: string, args: string[], cwd: string, timeoutMs: number) => Promise<CommandResult>;

export type HarnessCheckId = 'typecheck' | 'lint' | 'test';

export interface HarnessCheckResult {
  name: HarnessCheckId;
  passed: boolean;
  output: string;
}

export interface HarnessGateOptions {
  cwd?: string;
  checks?: HarnessCheckId[];
  runner?: CommandRunner;
  timeoutMs?: number;
}

/** Default runner: no shell; resolves the real npm CLI and runs `npm <args>`. */
function defaultRunner(): CommandRunner {
  return async (command, args, cwd, timeoutMs) => {
    const { spawn } = await import('node:child_process');
    return await new Promise<CommandResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      const done = (code: number) => {
        if (settled) return;
        settled = true;
        resolve({ code, stdout, stderr });
      };
      let child;
      try {
        child = spawn(command, args, { cwd, shell: process.platform === 'win32' });
      } catch (err: any) {
        resolve({ code: -1, stdout: '', stderr: err?.message || 'spawn failed' });
        return;
      }
      const timer = setTimeout(() => {
        try { child.kill(); } catch { /* best effort */ }
        done(-1);
      }, timeoutMs);
      child.stdout?.on('data', (d) => { stdout += String(d); });
      child.stderr?.on('data', (d) => { stderr += String(d); });
      child.on('error', (err: any) => { clearTimeout(timer); stderr += err?.message || 'spawn error'; done(-1); });
      child.on('close', (code: number | null) => { clearTimeout(timer); done(code ?? -1); });
    });
  };
}

function planFor(checks: HarnessCheckId[]): Array<{ name: HarnessCheckId; command: string; args: string[] }> {
  return checks.map((name) => {
    if (name === 'typecheck') return { name, command: 'npm', args: ['run', 'typecheck'] };
    if (name === 'lint') return { name, command: 'npm', args: ['run', 'lint'] };
    return { name, command: 'npm', args: ['test'] };
  });
}

/** Read the default checks from env: `RECOURSE_HARNESS_GATE_CHECKS`. */
export function defaultHarnessChecks(): HarnessCheckId[] {
  const raw = (process.env.RECOURSE_HARNESS_GATE_CHECKS || 'typecheck,lint').toLowerCase();
  const parsed = raw.split(',').map((s) => s.trim()).filter(Boolean) as HarnessCheckId[];
  const valid = parsed.filter((c): c is HarnessCheckId => c === 'typecheck' || c === 'lint' || c === 'test');
  return valid.length ? valid : ['typecheck', 'lint'];
}

export interface HarnessGateResult {
  ok: boolean;
  error?: string;
  checks: HarnessCheckResult[];
}

/** Run the composite harness checks in-process (used by the gate and status). */
export async function runHarnessChecks(opts: HarnessGateOptions = {}): Promise<HarnessGateResult> {
  const cwd = opts.cwd ?? process.cwd();
  const checks = opts.checks ?? defaultHarnessChecks();
  const runner = opts.runner ?? defaultRunner();
  const timeoutMs = opts.timeoutMs ?? Number(process.env.RECOURSE_HARNESS_GATE_TIMEOUT_MS || 600_000);
  const results: HarnessCheckResult[] = [];
  for (const step of planFor(checks)) {
    const r = await runner(step.command, step.args, cwd, timeoutMs);
    const output = [r.stdout.trim(), r.stderr.trim()].filter(Boolean).join('\n').slice(0, 4000);
    const passed = r.code === 0;
    results.push({ name: step.name, passed, output: passed ? `${step.name} passed` : output || `${step.name} exited ${r.code}` });
    if (!passed) {
      return { ok: false, error: `${step.name} failed`, checks: results };
    }
  }
  return { ok: true, checks: results };
}

/**
 * A `BootGreenGate` that runs the composite checks before any harness patch is
 * written. Honest: a missing/disabled check reports as a real failure with the
 * runner's output, never a fabricated pass.
 */
export function makeHarnessGate(opts: HarnessGateOptions = {}): BootGreenGate {
  return async () => {
    const result = await runHarnessChecks(opts);
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  };
}

// ---------------------------------------------------------------------------
// Gated application
// ---------------------------------------------------------------------------

export type SelfModStatus = 'applied' | 'awaiting_approval' | 'denied' | 'rejected';

export interface SelfModApplicationResult {
  status: SelfModStatus;
  file: string;
  reason: string;
  decision: SelfModDecision;
  patch?: PatchResult;
}

export interface ApplySelfModificationInput {
  patch: ProposedPatch;
  root?: string;
  /** Precomputed decision, or computed from `autoApprove` when omitted. */
  decision?: SelfModDecision;
  autoApprove?: boolean;
  /** True when an approval request for this patch has been approved. */
  approvalApproved?: boolean;
  lint?: boolean;
  bootGreen?: BootGreenGate;
  /** Injectable verifier for tests (defaults to the real intake). */
  apply?: (patch: ProposedPatch, opts: { root?: string; lint?: boolean; bootGreen?: BootGreenGate }) => Promise<PatchResult>;
}

/**
 * The only sanctioned path for a self-modification to reach disk: classify ->
 * policy decision -> (optional approval) -> verified patch intake.
 */
export async function applySelfModification(input: ApplySelfModificationInput): Promise<SelfModApplicationResult> {
  const { patch } = input;
  const decision = input.decision ?? evaluateSelfModification({ file: patch.file, autoApprove: input.autoApprove });

  if (!decision.allowed) {
    return { status: 'denied', file: patch.file, reason: decision.reason, decision };
  }
  if (decision.requiresApproval && !input.approvalApproved) {
    return { status: 'awaiting_approval', file: patch.file, reason: decision.reason, decision };
  }

  const apply = input.apply ?? verifyAndApplyPatch;
  const result = await apply(patch, { root: input.root, lint: input.lint, bootGreen: input.bootGreen });
  if (result.applied === true) {
    return { status: 'applied', file: patch.file, reason: 'verified and applied', decision, patch: result };
  }
  return { status: 'rejected', file: patch.file, reason: 'error' in result ? result.error : 'patch not applied', decision, patch: result };
}

// ---------------------------------------------------------------------------
// Approval-backed guard (for the verified-patch intake seam)
// ---------------------------------------------------------------------------

export interface SelfModGuardResult {
  allowed: boolean;
  status: 'allow' | 'awaiting_approval' | 'deny';
  reason: string;
  approvalId?: string;
  targetClass: SelfModTargetClass;
}

/**
 * Build a synchronous guard suitable for `verifyAndApplyPatch`/`applyDriverProposal`.
 * Harness targets are allowed only when an operator has APPROVED a pending
 * `self.modify` request for that file (or unattended mode is armed); otherwise a
 * pending request is created and the patch is withheld. Safety targets are
 * always refused, and no approval is even offered.
 */
export function createSelfModGuard(opts: {
  approvals: ApprovalStore;
  /** Unattended mode (RECOURSE_SELF_MOD_APPLY=1 in the server). */
  autoApprove?: () => boolean;
  requestedBy?: string;
}): (file: string) => SelfModGuardResult {
  return (file) => {
    const decision = evaluateSelfModification({ file, autoApprove: opts.autoApprove?.() === true });
    if (!decision.allowed) {
      return { allowed: false, status: 'deny', reason: decision.reason, targetClass: decision.targetClass };
    }
    if (!decision.requiresApproval) {
      return { allowed: true, status: 'allow', reason: decision.reason, targetClass: decision.targetClass };
    }
    const existing = opts.approvals
      .list({ limit: 500 })
      .filter((r) => r.action.kind === 'self.modify' && r.action.target === file);
    const approved = existing.find((r) => r.status === 'approved');
    if (approved) {
      return { allowed: true, status: 'allow', reason: `approved by ${approved.decidedBy ?? 'operator'}`, approvalId: approved.id, targetClass: decision.targetClass };
    }
    const pending = existing.find((r) => r.status === 'pending');
    if (pending) {
      return { allowed: false, status: 'awaiting_approval', reason: `awaiting approval ${pending.id}`, approvalId: pending.id, targetClass: decision.targetClass };
    }
    const created = opts.approvals.request({
      action: { kind: 'self.modify', target: file, mutating: true },
      requestedBy: opts.requestedBy ?? 'self-modification',
      reason: `${decision.reason} — approve to let the verified patch touch ${file}`,
    });
    return { allowed: false, status: 'awaiting_approval', reason: `created approval ${created.id}`, approvalId: created.id, targetClass: decision.targetClass };
  };
}
