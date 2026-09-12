/**
 * Recourse Data Visualizer router — curated matplotlib sidecar proxies.
 *
 * Extracted following the biosim sidecar pattern: all handlers are stateless
 * proxies to the Python viz_service (python/viz_service/main.py). They forward
 * real render results and report ok:false when the sidecar is down — never a
 * fabricated image.
 */

import { Router } from 'express';
import {
  vizHealth,
  vizCatalog,
  vizRender,
  VIZ_SIDECAR_DEFAULT_URL,
} from '../lib/vizSidecarClient.js';
import { zod400, vizRenderReq } from '../lib/contracts.js';

export function createVizRouter(): Router {
  const router = Router();

  router.get('/sidecar', async (_req, res) => {
    const health = await vizHealth();
    res.json({
      success: true,
      online: health.ok,
      service: health.service,
      matplotlib: health.matplotlib ?? null,
      numpy: health.numpy ?? null,
      sidecarUrl: process.env.VIZ_SIDECAR_URL || VIZ_SIDECAR_DEFAULT_URL,
      latencyMs: health.latencyMs,
      error: health.error ?? null,
    });
  });

  router.get('/catalog', async (_req, res) => {
    const catalog = await vizCatalog();
    if (!catalog.ok || !catalog.scenes) {
      res.json({ success: true, online: false, count: 0, scenes: [], error: catalog.error ?? null });
      return;
    }
    res.json({ success: true, online: true, count: catalog.count, scenes: catalog.scenes });
  });

  router.post('/render', async (req, res) => {
    const body = zod400(vizRenderReq, req, res);
    if (!body) return;
    const result = await vizRender(body.id, {
      width: body.width,
      height: body.height,
      params: body.params,
    });
    res.json({ success: true, ...result });
  });

  return router;
}