/**
 * forge.ts — capability-forge routes (snapshot, learner plan, mint, run,
 * autopilot toggle) extracted from the `server.ts` monolith.
 *
 * All forge engines/ledger/busy state live host-side and are injected; this
 * router is HTTP-only.
 */
import { Router } from 'express';

export interface ForgeRouterDeps {
  forgeSnapshot(): Record<string, unknown>;
  forgePlanSummary(): Promise<Record<string, unknown>>;
  mintForgeSpecFromLearnerPlan(): Promise<number>;
  runForgeCycle(): Promise<unknown>;
  forgeBusy(): boolean;
  setForgeBusy(busy: boolean): void;
  toggleForgeAutopilot(): boolean;
}

export function createForgeRouter(deps: ForgeRouterDeps): Router {
  const router = Router();

  router.get('/forge', (_req, res) => {
    res.json({ success: true, forge: deps.forgeSnapshot() });
  });

  // The recursive-learning plan the forge is following (which domain next, and
  // the learner-ordered agenda). Read-only.
  router.get('/forge/plan', async (_req, res) => {
    try {
      res.json({ success: true, plan: await deps.forgePlanSummary() });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Explicitly mint one new forge spec from the learner's top unmet target. The
  // autopilot does this automatically when the agenda is exhausted; this route
  // lets an operator trigger it on demand.
  router.post('/forge/mint', async (_req, res) => {
    try {
      const added = await deps.mintForgeSpecFromLearnerPlan();
      res.json({ success: true, added, forge: deps.forgeSnapshot() });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.post('/forge/run', async (req, res) => {
    try {
      if (deps.forgeBusy()) {
        return res.status(409).json({ success: false, error: 'forge busy (a cycle is already running)' });
      }
      deps.setForgeBusy(true);
      try {
        const count = Math.max(1, Math.min(3, Math.floor(Number(req.body?.count ?? 1) || 1)));
        const results: unknown[] = [];
        for (let i = 0; i < count; i++) {
          const r = await deps.runForgeCycle();
          results.push(r);
          if (r && typeof r === 'object' && (r as any).skipped) break;
        }
        res.json({ success: true, results, forge: deps.forgeSnapshot() });
      } finally {
        deps.setForgeBusy(false);
      }
    } catch (err: any) {
      deps.setForgeBusy(false);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/forge/autopilot/toggle', (_req, res) => {
    const on = deps.toggleForgeAutopilot();
    if (on && !deps.forgeBusy()) {
      deps.setForgeBusy(true);
      deps.runForgeCycle()
        .catch(() => {})
        .finally(() => deps.setForgeBusy(false));
    }
    res.json({ success: true, autopilot: on, forge: deps.forgeSnapshot() });
  });

  return router;
}
