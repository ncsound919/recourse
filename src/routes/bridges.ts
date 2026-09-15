/**
 * Recourse bridges router — integrity, studies, folding, pathosphere, umoe,
 * chemlab, foresight. Extracted from the server.ts monolith (2026-09). All
 * handlers are stateless proxies over lib modules: real results forwarded,
 * ok:false when a downstream host is down.
 */

import { Router } from 'express';
import {
  integrityStatus,
  trackReproducibility,
  crossValidate,
  logAccountability,
  verifyWork,
  INTEGRITY_DEFAULT_URL,
} from '../lib/integrityBridge.js';
import {
  orchestratorHealth,
  listSystems,
  submitStudy,
  listRuns,
  getRun,
  listClaims,
  getValidity,
  ORCHESTRATOR_DEFAULT_URL,
} from '../lib/studyOrchestratorBridge.js';
import {
  foldingHealth,
  submitFold,
  getFoldRun,
  listFoldRuns,
  FOLDING_DEFAULT_URL,
} from '../lib/proteinFoldingBridge.js';
import {
  PATHOSPHERE_CONTRACTS,
  buildBounty,
  buildCurationVote,
  buildFeeSplit,
  chainBundle,
} from '../lib/pathosphereBridge.js';
import {
  umoeHealth,
  umoeWorkflows,
  umoePredictions,
  umoeFields,
  umoeNetwork,
  umoeRun,
  UMOE_DEFAULT_URL,
} from '../lib/umoeBridge.js';
import {
  chemlabHealth,
  moleculeProperties,
  moleculeSimilarity,
  moleculeDruglikeness,
  moleculeRisk,
  simulateKinetics,
  parseReaction,
  CHEMLAB_DEFAULT_URL,
} from '../lib/chemlabBridge.js';
import {
  foresightStatus,
  foresightSimulate,
  foresightResistance,
  foresightToxicity,
  foresightRemission,
  foresightBacktest,
  ONCOFORESIGHT_DEFAULT_URL,
} from '../lib/oncoforesightBridge.js';
import {
  zod400,
  integrityPayloadReq,
  studySubmitReq,
  foldSubmitReq,
  pathosphereBountyReq,
  pathosphereVoteReq,
  pathosphereSplitReq,
  pathosphereBundleReq,
  umoeRunReq,
  chemlabSmilesReq,
  chemlabSimilarityReq,
  chemlabPassthroughReq,
  chemlabReactionReq,
  foresightBodyReq,
} from '../lib/contracts.js';

export function createBridgesRouter(): Router {
  const router = Router();

  // --- integrity ---
  router.get('/integrity/status', async (_req, res) => {
    const status = await integrityStatus();
    res.json({
      success: true,
      online: status.ok,
      sidecarUrl: process.env.INTEGRITY_URL || INTEGRITY_DEFAULT_URL,
      status: status.ok ? status.status : null,
      latencyMs: status.latencyMs,
      error: status.error ?? null,
    });
  });

  router.post('/integrity/reproducibility', async (req, res) => {
    const body = zod400(integrityPayloadReq, req, res);
    if (!body) return;
    res.json({ success: true, ...(await trackReproducibility(body)) });
  });

  router.post('/integrity/cross-validation', async (req, res) => {
    const body = zod400(integrityPayloadReq, req, res);
    if (!body) return;
    res.json({ success: true, ...(await crossValidate(body)) });
  });

  router.post('/integrity/accountability', async (req, res) => {
    const body = zod400(integrityPayloadReq, req, res);
    if (!body) return;
    res.json({ success: true, ...(await logAccountability(body)) });
  });

  router.post('/integrity/verification', async (req, res) => {
    const body = zod400(integrityPayloadReq, req, res);
    if (!body) return;
    res.json({ success: true, ...(await verifyWork(body)) });
  });

  // --- study orchestrator ---
  router.get('/studies/health', async (_req, res) => {
    const health = await orchestratorHealth();
    res.json({
      success: true,
      online: health.ok,
      sidecarUrl: process.env.ORCHESTRATOR_URL || ORCHESTRATOR_DEFAULT_URL,
      latencyMs: health.latencyMs,
      error: health.error ?? null,
    });
  });

  router.get('/studies/systems', async (_req, res) => {
    res.json({ success: true, ...(await listSystems()) });
  });

  router.post('/studies', async (req, res) => {
    const body = zod400(studySubmitReq, req, res);
    if (!body) return;
    res.json({ success: true, ...(await submitStudy(body)) });
  });

  router.get('/studies/runs', async (_req, res) => {
    res.json({ success: true, ...(await listRuns()) });
  });

  router.get('/studies/runs/:runId', async (req, res) => {
    res.json({ success: true, ...(await getRun(req.params.runId)) });
  });

  router.get('/studies/claims', async (_req, res) => {
    res.json({ success: true, ...(await listClaims()) });
  });

  router.get('/studies/validity', async (_req, res) => {
    res.json({ success: true, ...(await getValidity()) });
  });

  // --- folding ---
  router.get('/folding/status', async (_req, res) => {
    const health = await foldingHealth();
    res.json({
      success: true,
      online: health.ok,
      sidecarUrl: process.env.FOLDING_URL || FOLDING_DEFAULT_URL,
      latencyMs: health.latencyMs,
      error: health.error ?? null,
    });
  });

  router.post('/folding/fold', async (req, res) => {
    const body = zod400(foldSubmitReq, req, res);
    if (!body) return;
    res.json({ success: true, ...(await submitFold(body)) });
  });

  router.get('/folding/run/:runId', async (req, res) => {
    res.json({ success: true, ...(await getFoldRun(req.params.runId)) });
  });

  router.get('/folding/runs', async (_req, res) => {
    res.json({ success: true, ...(await listFoldRuns()) });
  });

  // --- pathosphere ---
  router.get('/pathosphere/contracts', (_req, res) => {
    res.json({ success: true, count: PATHOSPHERE_CONTRACTS.length, contracts: PATHOSPHERE_CONTRACTS });
  });

  router.post('/pathosphere/bounty', (req, res) => {
    const body = zod400(pathosphereBountyReq, req, res);
    if (!body) return;
    const result = buildBounty(body);
    if (result.ok === false) return res.status(400).json({ success: false, error: result.error });
    res.json({ success: true, bounty: result.bounty });
  });

  router.post('/pathosphere/vote', (req, res) => {
    const body = zod400(pathosphereVoteReq, req, res);
    if (!body) return;
    const result = buildCurationVote(body);
    if (result.ok === false) return res.status(400).json({ success: false, error: result.error });
    res.json({ success: true, vote: result.vote });
  });

  router.post('/pathosphere/split', (req, res) => {
    const body = zod400(pathosphereSplitReq, req, res);
    if (!body) return;
    const result = buildFeeSplit(body);
    if (result.ok === false) return res.status(400).json({ success: false, error: result.error });
    res.json({ success: true, split: result.split });
  });

  router.post('/pathosphere/bundle', (req, res) => {
    const body = zod400(pathosphereBundleReq, req, res);
    if (!body) return;
    res.json({ success: true, bundle: chainBundle(body.kind, body.payload) });
  });

  // --- umoe ---
  router.get('/umoe/status', async (_req, res) => {
    const health = await umoeHealth();
    res.json({
      success: true,
      online: health.ok,
      sidecarUrl: process.env.UMOE_URL || UMOE_DEFAULT_URL,
      data: health.ok ? health.data : null,
      latencyMs: health.latencyMs,
      error: health.error ?? null,
    });
  });

  router.get('/umoe/workflows', async (_req, res) => {
    res.json({ success: true, ...(await umoeWorkflows()) });
  });

  router.get('/umoe/predictions/:tumorId', async (req, res) => {
    res.json({ success: true, ...(await umoePredictions(req.params.tumorId)) });
  });

  router.get('/umoe/fields/:tumorId', async (req, res) => {
    res.json({ success: true, ...(await umoeFields(req.params.tumorId)) });
  });

  router.get('/umoe/network/:tumorId', async (req, res) => {
    res.json({ success: true, ...(await umoeNetwork(req.params.tumorId)) });
  });

  router.post('/umoe/run', async (req, res) => {
    const body = zod400(umoeRunReq, req, res);
    if (!body) return;
    res.json({ success: true, ...(await umoeRun(body)) });
  });

  // --- chemlab ---
  router.get('/chemlab/status', async (_req, res) => {
    const health = await chemlabHealth();
    res.json({
      success: true,
      online: health.ok,
      sidecarUrl: process.env.CHEMLAB_URL || CHEMLAB_DEFAULT_URL,
      latencyMs: health.latencyMs,
      error: health.error ?? null,
    });
  });

  router.get('/chemlab/molecule/properties', async (req, res) => {
    const parsed = chemlabSmilesReq.safeParse({ smiles: req.query.smiles });
    if (!parsed.success) return res.status(400).json({ success: false, error: 'smiles query parameter is required' });
    res.json({ success: true, ...(await moleculeProperties(parsed.data.smiles)) });
  });

  router.get('/chemlab/molecule/similarity', async (req, res) => {
    const parsed = chemlabSimilarityReq.safeParse({ smiles1: req.query.smiles1, smiles2: req.query.smiles2 });
    if (!parsed.success) return res.status(400).json({ success: false, error: 'smiles1 and smiles2 query parameters are required' });
    res.json({ success: true, ...(await moleculeSimilarity(parsed.data.smiles1, parsed.data.smiles2)) });
  });

  router.get('/chemlab/molecule/druglikeness', async (req, res) => {
    const parsed = chemlabSmilesReq.safeParse({ smiles: req.query.smiles });
    if (!parsed.success) return res.status(400).json({ success: false, error: 'smiles query parameter is required' });
    res.json({ success: true, ...(await moleculeDruglikeness(parsed.data.smiles)) });
  });

  router.post('/chemlab/molecule/risk', async (req, res) => {
    const body = zod400(chemlabPassthroughReq, req, res);
    if (!body) return;
    res.json({ success: true, ...(await moleculeRisk(body)) });
  });

  router.post('/chemlab/simulate/kinetics', async (req, res) => {
    const body = zod400(chemlabPassthroughReq, req, res);
    if (!body) return;
    res.json({ success: true, ...(await simulateKinetics(body)) });
  });

  router.post('/chemlab/reaction/parse', async (req, res) => {
    const body = zod400(chemlabReactionReq, req, res);
    if (!body) return;
    res.json({ success: true, ...(await parseReaction(body.reaction)) });
  });

  // --- foresight ---
  router.get('/foresight/status', async (_req, res) => {
    const status = await foresightStatus();
    res.json({
      success: true,
      online: status.ok,
      sidecarUrl: process.env.ONCOFORESIGHT_URL || ONCOFORESIGHT_DEFAULT_URL,
      latencyMs: status.latencyMs,
      error: status.error ?? null,
    });
  });

  router.post('/foresight/simulate', async (req, res) => {
    const body = zod400(foresightBodyReq, req, res);
    if (!body) return;
    res.json({ success: true, ...(await foresightSimulate(body)) });
  });

  router.post('/foresight/resistance', async (req, res) => {
    const body = zod400(foresightBodyReq, req, res);
    if (!body) return;
    res.json({ success: true, ...(await foresightResistance(body)) });
  });

  router.post('/foresight/toxicity', async (req, res) => {
    const body = zod400(foresightBodyReq, req, res);
    if (!body) return;
    res.json({ success: true, ...(await foresightToxicity(body)) });
  });

  router.post('/foresight/remission', async (req, res) => {
    const body = zod400(foresightBodyReq, req, res);
    if (!body) return;
    res.json({ success: true, ...(await foresightRemission(body)) });
  });

  router.get('/foresight/backtest', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json({ success: true, ...(await foresightBacktest(q)) });
  });

  return router;
}