/**
 * subagents.ts — the subagent-swarm API (extracted from the `server.ts`
 * monolith). The swarm's mutable state (status, team states, busy flag,
 * autopilot interval) lives in the host; this router depends only on injected
 * operations, so server state stays the single source of truth and the routes
 * are unit-testable with fakes.
 *
 * Honesty: a dispatched task is QUEUED, never claimed complete — it only
 * completes when the configured provider produces code that passes the real
 * sandbox verifier.
 */
import { Router } from 'express';

export interface SubagentsDeps {
  /** Current swarm snapshot for the status view. */
  status(): {
    swarmStatus: { agents: Array<{ id: string }>; isSwarmAutopilotActive: boolean; activeTaskQueue: Array<{ status: string }> };
    intervalMs: number;
    model: string;
    busy: boolean;
  };
  /** Flip the swarm autopilot; returns its new value. Handles ensure/stop + save. */
  toggleAutopilot(): boolean;
  /** Queue a task; returns the updated swarm + the new task. */
  dispatch(agentType: string, title: string, domain: string): { swarmStatus: unknown; newTask: unknown };
  /** Drive the real executor for up to `limit` queued tasks; returns processed count. */
  process(limit: number): Promise<number>;
}

export function createSubagentsRouter(deps: SubagentsDeps): Router {
  const router = Router();

  router.get('/status', (_req, res) => {
    const s = deps.status();
    res.json({
      success: true,
      swarmStatus: s.swarmStatus,
      autopilotIntervalMs: s.intervalMs,
      model: s.model,
      executorNote: s.busy
        ? 'busy'
        : s.swarmStatus.activeTaskQueue.some((t) => t.status === 'queued')
          ? 'queued tasks awaiting configured provider'
          : 'idle',
    });
  });

  router.post('/toggle-autopilot', (_req, res) => {
    const active = deps.toggleAutopilot();
    res.json({ success: true, isSwarmAutopilotActive: active });
  });

  router.post('/dispatch', (req, res) => {
    const { agentType, title, domain } = (req.body ?? {}) as { agentType?: string; title?: string; domain?: string };
    if (!agentType || !title || !domain) {
      return res.status(400).json({ error: 'agentType, title, and domain are required' });
    }
    if (!deps.status().swarmStatus.agents.some((a) => a.id === agentType)) {
      return res.status(400).json({ error: `unknown agentType: ${agentType}` });
    }
    try {
      const r = deps.dispatch(agentType, title, domain);
      res.json({
        success: true,
        swarmStatus: r.swarmStatus,
        newTask: r.newTask,
        note: 'Task is QUEUED. It is only completed when the configured provider produces code that passes the real sandbox verifier.',
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message ?? String(err) });
    }
  });

  router.post('/process', async (req, res) => {
    try {
      const limit = Math.max(1, Math.min(5, Number(req.body?.limit ?? 1)));
      const processed = await deps.process(limit);
      res.json({ success: true, processedCount: processed, swarmStatus: deps.status().swarmStatus });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message ?? String(err) });
    }
  });

  return router;
}
