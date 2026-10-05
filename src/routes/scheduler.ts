/**
 * scheduler.ts — the job-scheduler API (extracted from the `server.ts`
 * monolith). Thin, stateless wrappers over the autonomy governor in
 * `src/lib/jobScheduler.ts`: read per-job status, toggle a job, trigger a manual
 * run. The host supplies an `onJobToggled` hook so legacy autopilot flags and
 * provenance stay in sync without this router knowing about server state.
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  getSchedulerStatus,
  setJobEnabled,
  triggerJob,
  schedulerEffectiveness,
  jobEffectiveState,
} from '../lib/jobScheduler.js';

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
    const status = getSchedulerStatus();
    // Every job carries its effective state, and the response carries the
    // rollup. `armedJobs` on its own is the number that reads best and means
    // least: an enabled job whose guard is closed does nothing on every fire.
    const jobs = status.jobs.map((j) => ({ ...j, effective: jobEffectiveState(j) }));
    const effectiveness = schedulerEffectiveness(status);
    const headline =
      effectiveness.workingJobs === 0
        ? `no jobs are doing work (${effectiveness.armedJobs}/${effectiveness.total} armed, ${effectiveness.noOpJobs} enabled but idle)`
        : `${effectiveness.workingJobs}/${effectiveness.total} jobs working (${effectiveness.noOpJobs} enabled but idle, ${effectiveness.failingJobs} failing)`;
    res.json({ success: true, ...status, jobs, effectiveness, headline });
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
