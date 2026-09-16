/**
 * ops.ts — operator surface for the Wave 2 safety layers: the policy engine,
 * the approval queue, metrics, and the deployment actuator.
 *
 * Mounted under `/api/recourse/ops` so it never collides with the existing
 * routes. Mutating routes require the same mutation secret as the rest of the
 * server; deployments additionally require an *approved* approval request when
 * policy marks them `require_approval`.
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import { metrics } from '../lib/metrics';
import { openPolicyEngine, type PolicyAction } from '../lib/policy';
import { openApprovalStore } from '../lib/approvals';
import { buildDockerComposePlan, runDeployPlan } from '../lib/deploy';

export interface OpsRouterDeps {
  requireMutationAuth: (req: Request, res: Response) => boolean;
}

export function createOpsRouter(deps: OpsRouterDeps): Router {
  const router = Router();
  const policy = openPolicyEngine();
  const approvals = openApprovalStore();

  // --- Policy -------------------------------------------------------------
  router.get('/policy', (_req, res) => {
    res.json({ success: true, rules: policy.rules() });
  });

  router.post('/policy/rules', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    try {
      const rules = req.body?.rules;
      if (!Array.isArray(rules)) return res.status(400).json({ success: false, error: 'rules must be an array' });
      policy.setRules(rules);
      res.json({ success: true, rules: policy.rules() });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  router.post('/policy/evaluate', (req, res) => {
    const action = req.body?.action as PolicyAction | undefined;
    if (!action || typeof action.kind !== 'string') {
      return res.status(400).json({ success: false, error: 'action.kind is required' });
    }
    res.json({ success: true, decision: policy.evaluate(action) });
  });

  // --- Approvals ----------------------------------------------------------
  router.get('/approvals', (_req, res) => {
    res.json({ success: true, pending: approvals.pendingCount(), requests: approvals.list({ limit: 50 }) });
  });

  router.post('/approvals/request', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const action = req.body?.action as PolicyAction | undefined;
    if (!action || typeof action.kind !== 'string') {
      return res.status(400).json({ success: false, error: 'action.kind is required' });
    }
    const decision = policy.evaluate(action);
    if (decision.effect === 'deny') {
      return res.status(403).json({ success: false, error: decision.reason, decision });
    }
    if (decision.effect === 'allow') {
      return res.json({ success: true, allowed: true, decision });
    }
    const entry = approvals.request({ action, requestedBy: req.body?.requestedBy, reason: req.body?.reason });
    res.json({ success: true, allowed: false, requiresApproval: true, request: entry, decision });
  });

  router.post('/approvals/:id/decide', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const status = req.body?.status;
    if (status !== 'approved' && status !== 'rejected') {
      return res.status(400).json({ success: false, error: "status must be 'approved' or 'rejected'" });
    }
    const result = approvals.decide(req.params.id, status, req.body?.decidedBy, req.body?.note);
    if ('error' in result) return res.status(404).json({ success: false, error: result.error });
    res.json({ success: true, request: result });
  });

  // --- Deployment ---------------------------------------------------------
  router.post('/deploy', async (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    try {
      const { service, cwd, healthUrl, dryRun, approvalId } = req.body ?? {};
      if (typeof service !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(service)) {
        return res.status(400).json({ success: false, error: 'a valid service name is required' });
      }
      const action: PolicyAction = { kind: 'deploy.run', target: service, mutating: true };
      const decision = policy.evaluate(action);

      if (decision.effect === 'deny') {
        return res.status(403).json({ success: false, error: decision.reason, decision });
      }
      if (decision.effect === 'require_approval' && !dryRun) {
        const approval = typeof approvalId === 'string' ? approvals.get(approvalId) : undefined;
        if (!approval || approval.status !== 'approved' || approval.action.kind !== action.kind) {
          return res.status(403).json({
            success: false,
            error: 'deployment requires an approved approval request',
            decision,
            hint: 'POST /api/recourse/ops/approvals/request then decide it, then pass approvalId',
          });
        }
      }

      const plan = buildDockerComposePlan({
        service,
        cwd: typeof cwd === 'string' && cwd ? cwd : process.cwd(),
        healthUrl: typeof healthUrl === 'string' ? healthUrl : undefined,
      });
      const result = await runDeployPlan(plan, undefined, { dryRun: Boolean(dryRun) });
      res.status(result.ok ? 200 : 500).json({ success: result.ok, decision, result });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  return router;
}

/** Prometheus text exposition of the process metrics registry. */
export function metricsText(): string {
  return metrics.render();
}
