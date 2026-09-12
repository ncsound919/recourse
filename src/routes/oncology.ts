/**
 * Recourse oncology router — Overlay Oncology aggregate bridge + systems health.
 *
 * Extracted from the server.ts monolith (2026-09). Every handler is stateless:
 * it calls the oncology/umoe/foresight/chemlab bridge lib modules and forwards
 * their real results (ok:false when a downstream host is down — never a
 * fabricated number).
 */

import { Router } from 'express';
import {
  oncologyManifest,
  oncologySimulate,
  oncologySynthesis,
  oncologyHealth,
  oncologyCalibrationState,
  oncologyCalibrationDatasets,
  oncologyValidationScorecard,
  oncologyValidationMatrix,
  oncologyDiscoveryScreen,
  oncologyDiscoveryLedger,
  oncologyEvidence,
  oncologyResearchUnified,
  oncologyResearchPipeline,
  oncologyMechanismFusion,
  oncologyPredict,
  ONCOLOGY_DEFAULT_URL,
  type OncologyPipelineStudy,
} from '../lib/oncologyEngineBridge.js';
import { umoeHealth } from '../lib/umoeBridge.js';
import { foresightStatus } from '../lib/oncoforesightBridge.js';
import { chemlabHealth } from '../lib/chemlabBridge.js';
import { foldingHealth } from '../lib/proteinFoldingBridge.js';
import { scientificHealth } from '../lib/scientificApiBridge.js';
import { integrityStatus } from '../lib/integrityBridge.js';
import { orchestratorHealth } from '../lib/studyOrchestratorBridge.js';
import { biosimHealth } from '../lib/biosimSidecarClient.js';
import { kgSidecarHealth } from '../lib/kgSidecarClient.js';
import { otHealth as openTargetsHealth } from '../lib/openTargetsClient.js';
import { ptHealth as pubTatorHealth } from '../lib/pubTatorClient.js';
import {
  zod400,
  oncologySimulateReq,
  oncologyDiscoveryScreenReq,
  oncologyEvidenceReq,
  oncologyResearchPipelineReq,
  oncologyPredictReq,
  oncologyValidationMatrixReq,
} from '../lib/contracts.js';

export function createOncologyRouter(): Router {
  const router = Router();

  router.get('/status', async (_req, res) => {
    const manifest = await oncologyManifest();
    res.json({
      success: true,
      online: manifest.ok,
      sidecarUrl: process.env.ONCOLOGY_URL || ONCOLOGY_DEFAULT_URL,
      manifest: manifest.ok ? manifest.manifest : null,
      latencyMs: manifest.latencyMs,
      error: manifest.error ?? null,
    });
  });

  router.post('/simulate', async (req, res) => {
    const body = zod400(oncologySimulateReq, req, res);
    if (!body) return;
    const result = await oncologySimulate(body.input);
    res.json({ success: true, ...result });
  });

  router.get('/synthesis', async (_req, res) => {
    const result = await oncologySynthesis();
    res.json({ success: true, ...result });
  });

  router.get('/health', async (_req, res) => {
    const result = await oncologyHealth();
    res.json({ success: true, online: result.ok, ...result });
  });

  router.get('/calibration/state', async (_req, res) => {
    const result = await oncologyCalibrationState();
    res.json({ success: true, ...result });
  });

  router.get('/calibration/datasets', async (_req, res) => {
    const result = await oncologyCalibrationDatasets();
    res.json({ success: true, ...result });
  });

  router.get('/validation/scorecard', async (_req, res) => {
    const result = await oncologyValidationScorecard();
    res.json({ success: result.ok, ...result });
  });

  router.get('/validation/matrix', async (req, res) => {
    const parsed = oncologyValidationMatrixReq.safeParse({
      ...(typeof req.query.train === 'string' ? { train: req.query.train.split(',').map((s) => s.trim()).filter(Boolean) } : {}),
      ...(typeof req.query.valid === 'string' ? { valid: req.query.valid.split(',').map((s) => s.trim()).filter(Boolean) } : {}),
    });
    if (!parsed.success) return res.status(400).json({ success: false, error: 'invalid train/valid cohorts' });
    const result = await oncologyValidationMatrix({ train: parsed.data.train, valid: parsed.data.valid });
    res.json({ success: result.ok, ...result });
  });

  router.post('/discovery/screen', async (req, res) => {
    const body = zod400(oncologyDiscoveryScreenReq, req, res);
    if (!body) return;
    const result = await oncologyDiscoveryScreen(body.hypotheses, { seed: body.seed, useQueue: body.useQueue });
    res.json({ success: result.ok, ...result });
  });

  router.get('/discovery/ledger', async (_req, res) => {
    const result = await oncologyDiscoveryLedger();
    res.json({ success: true, ...result });
  });

  router.get('/evidence', async (req, res) => {
    const cohort = typeof req.query.cohort === 'string' ? req.query.cohort : undefined;
    const gene = typeof req.query.gene === 'string' ? req.query.gene : undefined;
    const parsed = oncologyEvidenceReq.safeParse({ cohort, gene });
    if (!parsed.success) return res.status(400).json({ success: false, error: 'invalid cohort/gene' });
    const result = await oncologyEvidence({ cohort: parsed.data.cohort, gene: parsed.data.gene });
    res.json({ success: result.ok, ...result });
  });

  router.get('/research/unified', async (_req, res) => {
    const result = await oncologyResearchUnified();
    res.json({ success: result.ok, ...result });
  });

  router.post('/research/pipeline', async (req, res) => {
    const body = zod400(oncologyResearchPipelineReq, req, res);
    if (!body) return;
    const result = await oncologyResearchPipeline(body as OncologyPipelineStudy);
    res.json({ success: result.ok, ...result });
  });

  router.get('/mechanism-fusion', async (_req, res) => {
    const result = await oncologyMechanismFusion();
    res.json({ success: result.ok, ...result });
  });

  router.post('/predict', async (req, res) => {
    const body = zod400(oncologyPredictReq, req, res);
    if (!body) return;
    const result = await oncologyPredict(body);
    res.json({ success: result.ok, ...result });
  });

  router.get('/systems', async (_req, res) => {
    const probes: Array<{ id: string; name: string; run: () => Promise<{ ok: boolean; latencyMs?: number; error?: string }> }> = [
      { id: 'oncology', name: 'Overlay Oncology (aggregate host)', run: () => oncologyHealth(undefined, 4000) },
      { id: 'umoe', name: 'UMOE (mechanistic engine)', run: () => umoeHealth(undefined, 4000) },
      { id: 'foresight', name: 'OncoForesight', run: () => foresightStatus(undefined, 4000) },
      { id: 'chemlab', name: 'Overlay-Chemlab', run: () => chemlabHealth(undefined, 4000) },
      { id: 'folding', name: 'Protein folding', run: () => foldingHealth(undefined, 4000) },
      { id: 'scientific_api', name: 'Scientific API', run: () => scientificHealth(undefined, 4000) },
      { id: 'integrity', name: 'Research integrity', run: () => integrityStatus(undefined, 4000) },
      { id: 'orchestrator', name: 'Study orchestrator', run: () => orchestratorHealth(undefined, 4000) },
      { id: 'biosim', name: 'BioSim sidecar', run: () => biosimHealth(undefined, 4000) },
      { id: 'kg', name: 'Knowledge-graph sidecar', run: () => kgSidecarHealth(undefined, 4000) },
      { id: 'open_targets', name: 'Open Targets Platform (live)', run: () => openTargetsHealth(4000) },
      { id: 'pubtator', name: 'PubTator 3.0 (live)', run: () => pubTatorHealth(4000) },
    ];
    const rows = await Promise.all(
      probes.map(async (p) => {
        const r = await p.run().catch((err) => ({ ok: false, latencyMs: 0, error: err instanceof Error ? err.message : String(err) }));
        return { id: p.id, name: p.name, online: r.ok === true, latencyMs: r.latencyMs ?? 0, error: r.error ?? null };
      }),
    );
    res.json({
      success: true,
      generatedAt: new Date().toISOString(),
      online: rows.filter((r) => r.online).length,
      total: rows.length,
      systems: rows,
    });
  });

  return router;
}