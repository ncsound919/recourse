// src/routes/fleetDogfood.ts
/**
 * Bidirectional Recourse <-> Draymond dogfood routes. Stateless handlers over
 * `fleetDogfood.ts`; the cycle is fail-soft and returns exactly what it did.
 * Mutating routes require the shared mutation secret.
 */
import { Router } from 'express';
import { requireMutationAuth } from '../lib/mutationAuth.js';
import { draymondConfig, draymondHealth } from '../lib/draymondBridge.js';
import { runFleetDogfoodCycle, readFleetDogfood } from '../lib/fleetDogfood.js';

export function createFleetDogfoodRouter(): Router {
  const router = Router();

  // Bridge status: config, live reachability, and the last cycle snapshot.
  router.get('/fleet/draymond', async (_req, res) => {
    const cfg = draymondConfig();
    const health = await draymondHealth().catch((e) => ({ ok: false, status: 0, latencyMs: 0, error: String(e) }));
    res.json({
      success: true,
      config: { baseUrl: cfg.baseUrl, secretConfigured: Boolean(cfg.secret), timeoutMs: cfg.timeoutMs },
      health,
      last: readFleetDogfood(),
    });
  });

  // The unified cross-domain graph from the last cycle (temporal + structural).
  router.get('/cross-domain/graph', (_req, res) => {
    const snap = readFleetDogfood();
    res.json({
      success: true,
      graph: snap ? { ...snap.graph, at: snap.at } : null,
      links: snap?.links ?? [],
      steps: snap?.steps ?? [],
    });
  });

  // Run one bidirectional dogfood cycle on demand.
  router.post('/fleet/dogfood', async (req, res) => {
    if (!requireMutationAuth(req, res)) return;
    try {
      const body = (req.body ?? {}) as { exportLimit?: unknown; signalLimit?: unknown; localOnly?: unknown };
      const report = await runFleetDogfoodCycle({
        ...(typeof body.exportLimit === 'number' ? { exportLimit: body.exportLimit } : {}),
        ...(typeof body.signalLimit === 'number' ? { signalLimit: body.signalLimit } : {}),
        ...(body.localOnly === true ? { localOnly: true } : {}),
      });
      res.json({ success: true, report });
    } catch (err) {
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'dogfood cycle failed' });
    }
  });

  return router;
}
