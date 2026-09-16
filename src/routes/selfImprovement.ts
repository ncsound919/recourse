/**
 * selfImprovement.ts — operator surface for Wave 5 verified self-modification
 * and the nightly autonomous cycle.
 *
 *   GET  /status              nightly run state + pending self-mod approvals
 *   POST /run                 run (or force) tonight's cycle
 *   GET  /report              the latest self-attested upgrade report
 *   POST /classify            preview the self-mod policy for a target path
 *   GET  /approvals           pending self-modification approvals
 *   POST /approvals/:id/decide  approve/reject a self-modification
 *
 * Writes are behind the shared mutation secret. Reads that could leak operator
 * intent stay guarded too; the report is public-safe (metrics only).
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import type { ApprovalStore } from '../lib/approvals.js';
import type { NightlyRun, NightlyStore } from '../lib/nightlyLoop.js';
import { requireMutationAuthIfConfigured } from '../lib/mutationAuth.js';
import {
  classifySelfModTarget,
  evaluateSelfModification,
  SELF_MOD_APPROVAL_RULES,
  SELF_MOD_SAFETY_RULES,
} from '../lib/selfModification.js';

export interface SelfImprovementDeps {
  nightly: NightlyStore;
  approvals: ApprovalStore;
  requireMutationAuth: (req: Request, res: Response) => boolean;
  /** Run tonight's cycle using the server's real loop runners. */
  runCycle: (force: boolean) => Promise<NightlyRun>;
  /** Applied/reverted harness patch counts (from the fleet journal). */
  patchStatus?: () => { applied: number; reverted: number; ciGate: boolean };
}

function selfModApprovals(approvals: ApprovalStore) {
  return approvals.list({ limit: 200 }).filter((r) => r.action.kind.startsWith('self.modify'));
}

export function createSelfImprovementRouter(deps: SelfImprovementDeps): Router {
  const router = Router();

  router.get('/status', (req, res) => {
    if (!requireMutationAuthIfConfigured(req, res)) return;
    const status = deps.nightly.status();
    res.json({
      success: true,
      nightly: {
        runCount: status.runCount,
        lastKey: status.lastKey ?? null,
        lastFinishedAt: status.lastRun?.finishedAt ?? null,
        lastSteps: status.lastRun?.steps ?? [],
      },
      approvals: {
        pending: selfModApprovals(deps.approvals).filter((r) => r.status === 'pending').length,
      },
      patches: deps.patchStatus?.() ?? null,
      policy: { safety: SELF_MOD_SAFETY_RULES, approval: SELF_MOD_APPROVAL_RULES },
    });
  });

  router.post('/run', async (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    try {
      const force = req.body?.force === true;
      const run = await deps.runCycle(force);
      res.json({ success: true, run: { ...run, reportMarkdown: undefined }, skipped: run.skipped });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e?.message || 'nightly cycle failed' });
    }
  });

  router.get('/report', (req, res) => {
    if (!requireMutationAuthIfConfigured(req, res)) return;
    const latest = deps.nightly.latest();
    if (!latest) {
      res.status(404).json({ success: false, error: 'no nightly run recorded yet' });
      return;
    }
    if (req.query.format === 'md') {
      res.type('text/markdown').send(latest.reportMarkdown ?? '');
      return;
    }
    res.json({ success: true, key: latest.key, finishedAt: latest.finishedAt, steps: latest.steps, reportMarkdown: latest.reportMarkdown });
  });

  router.post('/classify', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const file = String(req.body?.file ?? '');
    if (!file) {
      res.status(400).json({ success: false, error: 'file is required' });
      return;
    }
    res.json({
      success: true,
      file,
      targetClass: classifySelfModTarget(file),
      decision: evaluateSelfModification({ file, autoApprove: req.body?.autoApprove === true }),
    });
  });

  router.get('/approvals', (req, res) => {
    if (!requireMutationAuthIfConfigured(req, res)) return;
    const status = typeof req.query.status === 'string' ? (req.query.status as any) : undefined;
    res.json({ success: true, approvals: selfModApprovals(deps.approvals).filter((r) => (status ? r.status === status : true)) });
  });

  router.post('/approvals/:id/decide', (req, res) => {
    if (!deps.requireMutationAuth(req, res)) return;
    const status = req.body?.status;
    if (status !== 'approved' && status !== 'rejected') {
      res.status(400).json({ success: false, error: 'status must be approved|rejected' });
      return;
    }
    const decidedBy = typeof req.body?.decidedBy === 'string' ? req.body.decidedBy : 'operator';
    const result = deps.approvals.decide(req.params.id, status, decidedBy, req.body?.note);
    if ('error' in result) {
      res.status(409).json({ success: false, error: result.error });
      return;
    }
    res.json({ success: true, approval: result });
  });

  return router;
}
