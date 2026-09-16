/**
 * scheduler.ts — the job-scheduler API (extracted from the `server.ts`
 * monolith). Thin, stateless wrappers over the autonomy governor in
 * `src/lib/jobScheduler.ts`: read per-job status, toggle a job, trigger a manual
 * run. The host supplies an `onJobToggled` hook so legacy autopilot flags and
 * provenance stay in sync without this router knowing about server state.
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import { getSchedulerStatus, setJobEnabled, triggerJob } from '../lib/jobScheduler.js';

export interface SchedulerRouterDeps {
  /** Called after a successful toggle (e.g. to mirror legacy flags + record provenance). */
  onJobToggled?: (id: string, enabled: boolean) => void;
  /**
   * Guard for the mutating routes (toggle/trigger). Config-gated on the host so
   * local runs stay open while a configured secret is enforced.
   */
  requireMutationAuth?: (req: Request, res: Response) => boolean;
}

export function createSchedulerRouter(deps: SchedulerRouterDeps = {}): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({ success: true, ...getSchedulerStatus() });
  });

  router.post('/toggle', (req, res) => {
    if (deps.requireMutationAuth && !deps.requireMutationAuth(req, res)) return;
    const { id, enabled } = (req.body ?? {}) as { id?: string; enabled?: boolean };
    if (!id || typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'id (string) and enabled (boolean) required' });
    }
    const r = setJobEnabled(id, enabled);
    if (r.ok === false) return res.status(404).json({ success: false, error: r.error });
    deps.onJobToggled?.(id, enabled);
    res.json({ success: true, ...r });
  });

  router.post('/trigger', async (req, res) => {
    if (deps.requireMutationAuth && !deps.requireMutationAuth(req, res)) return;
    const { id } = (req.body ?? {}) as { id?: string };
    if (!id) return res.status(400).json({ success: false, error: 'id (string) required' });
    const r = await triggerJob(id);
    if (r.ok === false) return res.status(409).json({ success: false, error: r.error });
    res.json({ success: true, ...r });
  });

  return router;
}
