/**
 * Recourse FieldBridge router — FieldBridge batch-artifact bridge.
 *
 * Mirrors `src/routes/oncology.ts`: every handler is stateless and calls the
 * lib bridge module, forwarding its real result (ok:false when the artifact is
 * missing/invalid — never a fabricated number). FieldBridge is a batch tool,
 * so these routes read the checked-in JSON snapshot (`public/` / `data/`),
 * not a live HTTP service.
 */

import { Router } from 'express';
import {
  fieldbridgeManifest,
  fieldbridgeMatrix,
  fieldbridgeHealth,
  fieldbridgeArtifactDir,
  FIELDBRIDGE_DEFAULT_ARTIFACT_DIR,
} from '../lib/fieldbridgeBridge.js';

export function createFieldbridgeRouter(): Router {
  const router = Router();

  router.get('/status', async (_req, res) => {
    const result = await fieldbridgeManifest();
    res.json({
      success: true,
      online: result.ok,
      artifactDir: fieldbridgeArtifactDir(),
      manifest: result.ok ? result.data : null,
      latencyMs: result.latencyMs,
      error: result.error ?? null,
    });
  });

  router.get('/matrix', async (_req, res) => {
    const result = await fieldbridgeMatrix();
    res.json({ success: result.ok, ...result });
  });

  router.get('/health', async (_req, res) => {
    const result = await fieldbridgeHealth();
    res.json({
      success: true,
      online: result.ok,
      artifactDir: process.env.FIELDBRIDGE_ARTIFACT_DIR || FIELDBRIDGE_DEFAULT_ARTIFACT_DIR,
      ...result,
    });
  });

  return router;
}