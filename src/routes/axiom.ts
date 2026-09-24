/**
 * axiom.ts — Axiom bridge routes extracted from `server.ts`:
 * GET /axiom/status, POST /develop/axiom, POST /axiom/build-tool.
 *
 * The bridge functions (status, repair dispatch, tool integration) are pure
 * lib imports. Host-side health dossier computation and the dev-loop ledger
 * recorder are injected as closures.
 */
import { Router } from 'express';
import {
  axiomBridgeStatus,
  integrateAxiomTool,
  dispatchAxiomRepair,
} from '../lib/axiomBridge.js';
import type { AxiomWeakFinding } from '../lib/axiomBridge.js';

export interface AxiomRouterDeps {
  healthDossier(): { findings: AxiomWeakFinding[] };
  recordDev(action: string, ok: boolean, detail: string, extra?: Record<string, unknown>): unknown;
}

export function createAxiomRouter(deps: AxiomRouterDeps): Router {
  const router = Router();

  router.get('/axiom/status', async (_req, res) => {
    res.json(await axiomBridgeStatus());
  });

  /** Outbound: hand Recourse's weak findings to Axiom so it runs a real repair
   *  project loop against this repo. Axiom's patches still land only through
   *  Recourse's own verified patch-intake gate. */
  router.post('/develop/axiom', async (req, res) => {
    try {
      const body = req.body ?? {};
      const dossier = deps.healthDossier();
      const findings = Array.isArray(body.findings) && body.findings.length
        ? body.findings
        : dossier.findings;
      const result = await dispatchAxiomRepair({
        findings,
        targetDir: typeof body.targetDir === 'string' ? body.targetDir : undefined,
        goal: typeof body.goal === 'string' ? body.goal : undefined,
        maxIterations: Number(body.maxIterations) || undefined,
      });
      deps.recordDev('axiom', result.ok, result.ok ? `axiom repair loop ${result.id ?? ''}` : `axiom failed: ${result.error}`, { driver: 'axiom' });
      res.json({ success: result.ok, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/axiom/build-tool', async (req, res) => {
    const { name, domain, prompt, refSuite } = req.body || {};
    if (!name || !prompt) return res.status(400).json({ error: "missing params" });
    const result = await integrateAxiomTool(name, domain, prompt, refSuite);
    res.json(result);
  });

  return router;
}
