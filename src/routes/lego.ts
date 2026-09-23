/**
 * lego.ts — composable-ML assembly/execute/route routes extracted from the
 * `server.ts` monolith. The LEGO engine is a process singleton; the live
 * readiness score remains host state and is injected.
 */
import { Router } from 'express';
import { globalLegoEngine } from '../lego/engine.js';

export interface LegoRouterDeps {
  readinessScore(): number;
}

export function createLegoRouter(deps: LegoRouterDeps): Router {
  const router = Router();

  router.get('/api/lego/state', (_req, res) => {
    try {
      res.json({ success: true, state: globalLegoEngine.getState() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/api/lego/assemble', (_req, res) => {
    try {
      // Apply the live readiness score so functional assemblies commit under the
      // running (stable) system, not just during the every-5th /tick.
      globalLegoEngine.setReadinessGate(deps.readinessScore());
      const result = globalLegoEngine.assembleNewCandidate();
      res.json({ success: true, result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/api/lego/execute', (req, res) => {
    try {
      const inputs = req.body?.inputs || [
        [0.2, 0.8, 0.1, 0.9, 0.3, 0.7, 0.4, 0.6],
        [0.5, 0.5, 0.2, 0.8, 0.1, 0.9, 0.0, 1.0],
      ];
      const result = globalLegoEngine.executePipeline(inputs);
      res.json({ success: true, result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/api/lego/route', (req, res) => {
    try {
      const inputVector = req.body?.inputVector || [0.4, 0.9, 0.1, 0.8, 0.2, 0.7, 0.3, 0.5];
      const result = globalLegoEngine.routeDynamicInput(inputVector);
      res.json({ success: true, result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
