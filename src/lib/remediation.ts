/**
 * remediation.ts — the closed loop from a stuck *service* to an operational fix
 * (Wave: self-repair → policy → approval → deploy actuator).
 *
 * When self-repair marks a service-kind subsystem stuck (e.g. a sidecar host is
 * unreachable), asking a model for a code patch is the wrong tool. This module
 * turns that signal into a concrete operational action (`docker compose
 * restart`/redeploy), gated by the policy engine: `allow` runs it, `deny`
 * refuses, and `require_approval` queues a human approval and does nothing until
 * an approved `approvalId` is supplied. The result is fed back as a win/loss so
 * a failed remediation escalates rather than silently repeating.
 *
 * Everything external (command runner, policy, approvals) is injected, so the
 * whole flow is unit-testable without Docker.
 */
import type { PolicyDecision, PolicyEngine, PolicyAction } from './policy';
import type { ApprovalStore } from './approvals';
import { runDeployPlan, type CommandRunner, type DeployPlan, type DeployRunResult } from './deploy';

export type RemediationKind = 'redeploy' | 'restart';

export interface RemediationRequest {
  issueId: string;
  /** docker-compose service name (e.g. 'ollama', 'kg-sidecar'). */
  service: string;
  cwd: string;
  kind?: RemediationKind;
  healthUrl?: string;
  reason: string;
  /** An approved approval id from the approval queue, when required. */
  approvalId?: string;
}

export interface RemediationOutcome {
  status: 'denied' | 'pending_approval' | 'applied' | 'failed';
  action: PolicyAction;
  decision: PolicyDecision;
  approvalId?: string;
  deploy?: DeployRunResult;
  reason: string;
  /** Feedback for self-repair/learner: did the operational fix work? */
  feedback: { outcome: 'win' | 'loss' | 'pending'; detail: string };
}

export interface RemediationDeps {
  policy: PolicyEngine;
  approvals: ApprovalStore;
  /** Command runner for the deploy actuator (defaults to the real one). */
  runner?: CommandRunner;
  now?: () => number;
}

export const REMEDIATION_ACTION_KIND = 'deploy.run';

/** Build a plan that restarts one compose service (no rebuild). */
export function buildComposeRestartPlan(service: string, cwd: string): DeployPlan {
  return {
    service,
    cwd,
    steps: [
      {
        name: 'compose restart',
        async run(ctx) {
          const res = await ctx.run(['docker', 'compose', 'restart', service], { cwd: ctx.cwd, timeoutMs: ctx.timeoutMs });
          if (!res.ok) throw new Error(`restart failed (code ${res.code}): ${(res.stderr || res.stdout).slice(0, 400)}`);
        },
      },
    ],
    rollback: [],
  };
}

/**
 * Resolve which compose service a stuck issue refers to. Operator-configured via
 * `RECOURSE_REMEDIATE_SERVICES` (JSON `{ "oncology:host": "overlay-oncology" }`).
 * Unknown issues resolve to null — Recourse never guesses a service to restart.
 */
export function resolveRemediationService(
  issueId: string,
  map: Record<string, string> | null,
): string | null {
  if (!map) return null;
  const service = map[issueId];
  return typeof service === 'string' && service.trim() ? service.trim() : null;
}

export function parseRemediationMap(raw: string | undefined): Record<string, string> | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, string>;
  } catch {
    return null;
  }
}

export async function attemptRemediation(
  req: RemediationRequest,
  deps: RemediationDeps,
): Promise<RemediationOutcome> {
  const kind: RemediationKind = req.kind ?? 'restart';
  const action: PolicyAction = { kind: REMEDIATION_ACTION_KIND, target: req.service, mutating: true };
  const decision = deps.policy.evaluate(action);

  if (decision.effect === 'deny') {
    return {
      status: 'denied',
      action,
      decision,
      reason: `policy denied ${REMEDIATION_ACTION_KIND} on "${req.service}": ${decision.reason}`,
      feedback: { outcome: 'pending', detail: 'no action taken (policy denied)' },
    };
  }

  if (decision.effect === 'require_approval') {
    const existing = req.approvalId ? deps.approvals.get(req.approvalId) : undefined;
    const approved = existing && existing.status === 'approved' && existing.action.kind === action.kind;
    if (!approved) {
      const entry = deps.approvals.request({
        action,
        requestedBy: 'self-repair',
        reason: `self-repair remediation for ${req.issueId}: ${req.reason}`,
      });
      return {
        status: 'pending_approval',
        action,
        decision,
        approvalId: entry.id,
        reason: `remediation for "${req.service}" queued for human approval (${entry.id})`,
        feedback: { outcome: 'pending', detail: 'awaiting approval' },
      };
    }
  }

  // Allowed (or explicitly approved): execute the operational fix.
  const plan = kind === 'restart' ? buildComposeRestartPlan(req.service, req.cwd) : buildRedeployPlan(req.service, req.cwd);
  const deploy = await runDeployPlan(plan, deps.runner, { now: deps.now });
  if (deploy.ok) {
    return {
      status: 'applied',
      action,
      decision,
      deploy,
      reason: `${kind} of "${req.service}" succeeded`,
      feedback: { outcome: 'win', detail: `${kind} succeeded in ${deploy.durationMs}ms` },
    };
  }
  return {
    status: 'failed',
    action,
    decision,
    deploy,
    reason: deploy.error ?? `${kind} of "${req.service}" failed`,
    feedback: { outcome: 'loss', detail: deploy.error ?? 'remediation failed' },
  };
}

/** Redeploy via docker compose (build + up). Kept here so remediation does not
 *  need to import the deploy module's compose builder (and its health fetch). */
function buildRedeployPlan(service: string, cwd: string): DeployPlan {
  const step = (name: string, argv: string[]) => ({
    name,
    async run(ctx: any) {
      const res = await ctx.run(argv, { cwd: ctx.cwd, timeoutMs: ctx.timeoutMs });
      if (!res.ok) throw new Error(`${name} failed (code ${res.code}): ${(res.stderr || res.stdout).slice(0, 400)}`);
    },
  });
  return {
    service,
    cwd,
    steps: [
      step('compose build', ['docker', 'compose', 'build', service]),
      step('compose up', ['docker', 'compose', 'up', '-d', service]),
    ],
    rollback: [],
  };
}
