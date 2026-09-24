/**
 * policy.ts — promotion-policy + autonomy (safe-boot / auto-evolve / emergency
 * halt) routes extracted from the `server.ts` monolith.
 *
 * Host-owned state (status, autonomySettings, autopilot flags, dream/swarm)
 * and side-effecting closures (provenance, persistence) are injected.
 */
import { Router } from 'express';
import type { PromotionPolicy } from '../types.js';

export interface PolicyRouterDeps {
  autonomySnapshot(): {
    safeBoot: boolean;
    autoEvolving: boolean;
    dreamActive: boolean;
    swarmAutopilot: boolean;
    intakeAutopilot: boolean;
    forgeAutopilot: boolean;
    devAutopilot: boolean;
    serverTickAutopilot: boolean;
  };
  setSafeBoot(safeBoot: boolean): boolean;
  setAutoEvolving(enabled: boolean): boolean;
  applyPromotionPolicy(raw: unknown): { ok: true; policy: PromotionPolicy; note?: string } | { ok: false; error: string };
  appendProvenance(eventType: string, data: Record<string, unknown>): void;
  saveState(): void;
  generation(): number;
  haltAllAutonomousLoops(reason: string): Record<string, unknown>;
}

export function createPolicyRouter(deps: PolicyRouterDeps): Router {
  const router = Router();

  router.post('/policy', (req, res) => {
    const applied = deps.applyPromotionPolicy(req.body?.policy);
    if ('error' in applied) {
      return res.status(400).json({ error: applied.error, allowed: ['any_pass', 'non_regressing', 'strict_improve', 'human_approval'] });
    }
    deps.appendProvenance('system_tick', {
      action: 'policy_change',
      newPolicy: applied.policy,
      generation: deps.generation(),
    });
    deps.saveState();
    res.json({ success: true, policy: applied.policy, ...(applied.note ? { note: applied.note } : {}) });
  });

  router.post('/toggle-auto', (req, res) => {
    const enabled = deps.setAutoEvolving(Boolean(req.body?.enabled));
    res.json({ success: true, isAutoEvolving: enabled });
  });

  router.get('/autonomy', (_req, res) => {
    res.json({
      success: true,
      autonomy: deps.autonomySnapshot(),
    });
  });

  router.post('/autonomy/safe-boot', (req, res) => {
    const safeBoot = deps.setSafeBoot(Boolean(req.body?.safeBoot));
    res.json({ success: true, safeBoot });
  });

  router.post('/autonomy/halt', (req, res) => {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : 'operator_request';
    const snapshot = deps.haltAllAutonomousLoops(reason);
    res.json({ success: true, ...snapshot });
  });

  return router;
}
