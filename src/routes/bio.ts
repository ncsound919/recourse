/**
 * Recourse bio router — biosim sidecar + biotech scientific API bridges.
 *
 * Extracted from the server.ts monolith (2026-09). All handlers are stateless
 * proxies: they call lib modules and forward real results (ok:false when a
 * downstream host is down — never fabricated).
 */

import { Router } from 'express';
import {
  biosimHealth,
  biosimTrial,
  biosimMontecarlo,
  biosimSequence,
  biosimLod95,
  BIOSIM_SIDECAR_DEFAULT_URL,
} from '../lib/biosimSidecarClient.js';
import {
  scientificHealth,
  dnaAnalyze,
  proteinAnalyze,
  geneLookup,
  statsTTest,
  SCIENTIFIC_API_DEFAULT_URL,
} from '../lib/scientificApiBridge.js';
import {
  zod400,
  biosimTrialReq,
  biosimMontecarloReq,
  biosimSequenceReq,
  biosimLod95Req,
  sequenceReq,
  geneLookupReq,
  ttestReq,
} from '../lib/contracts.js';

export function createBioRouter(): Router {
  const router = Router();

  // --- biosim sidecar ---
  router.get('/biosim/sidecar', async (_req, res) => {
    const health = await biosimHealth();
    res.json({
      success: true,
      online: health.ok,
      service: health.service,
      numpy: (health as { numpy?: string }).numpy ?? null,
      sidecarUrl: process.env.BIOSIM_SIDECAR_URL || BIOSIM_SIDECAR_DEFAULT_URL,
      latencyMs: health.latencyMs,
      error: health.error ?? null,
    });
  });

  router.post('/biosim/trial', async (req, res) => {
    const body = zod400(biosimTrialReq, req, res);
    if (!body) return;
    const result = await biosimTrial(body);
    res.json({ success: true, ...result });
  });

  router.post('/biosim/montecarlo', async (req, res) => {
    const body = zod400(biosimMontecarloReq, req, res);
    if (!body) return;
    const result = await biosimMontecarlo(body);
    res.json({ success: true, ...result });
  });

  router.post('/biosim/sequence', async (req, res) => {
    const body = zod400(biosimSequenceReq, req, res);
    if (!body) return;
    const result = await biosimSequence(body);
    res.json({ success: true, ...result });
  });

  router.post('/biosim/lod95', async (req, res) => {
    const body = zod400(biosimLod95Req, req, res);
    if (!body) return;
    const result = await biosimLod95(body);
    res.json({ success: true, ...result });
  });

  // --- biotech scientific API bridge ---
  router.get('/bio/status', async (_req, res) => {
    const health = await scientificHealth();
    res.json({
      success: true,
      online: health.ok,
      sidecarUrl: process.env.SCIENTIFIC_API_URL || SCIENTIFIC_API_DEFAULT_URL,
      latencyMs: health.latencyMs,
      error: health.error ?? null,
    });
  });

  router.post('/bio/dna/analyze', async (req, res) => {
    const body = zod400(sequenceReq, req, res);
    if (!body) return;
    res.json({ success: true, ...(await dnaAnalyze(body.sequence)) });
  });

  router.post('/bio/protein/analyze', async (req, res) => {
    const body = zod400(sequenceReq, req, res);
    if (!body) return;
    res.json({ success: true, ...(await proteinAnalyze(body.sequence)) });
  });

  router.get('/bio/gene/:symbol', async (req, res) => {
    const parsed = geneLookupReq.safeParse({ symbol: req.params.symbol });
    if (!parsed.success) return res.status(400).json({ success: false, error: 'invalid symbol' });
    res.json({ success: true, ...(await geneLookup(parsed.data.symbol)) });
  });

  router.post('/bio/stats/ttest', async (req, res) => {
    const body = zod400(ttestReq, req, res);
    if (!body) return;
    res.json({ success: true, ...(await statsTTest(body.a, body.b)) });
  });

  return router;
}