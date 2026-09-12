/**
 * Recourse KG router — knowledge-graph + live-evidence + closed-loop pipeline.
 *
 * Extracted from the server.ts monolith (2026-09). Every handler here is
 * stateless: it calls lib modules and returns their real output. No server
 * module-state access, so this file can be tested in isolation and stays
 * decoupled from the rest of the boot.
 */

import { Router } from 'express';
import { createHash } from 'node:crypto';
import { kgSidecarHealth, kgCentrality, kgNeighborhood, kgBridges, oncologyKgToGraph, KG_SIDECAR_DEFAULT_URL } from '../lib/kgSidecarClient.js';
import { buildLiveOncologyGraph, liveEvidenceHealth } from '../lib/liveOncologyGraph.js';
import { synthesizeOdeKinetics } from '../lib/odeKineticSynthesizer.js';
import { runDosingSweep } from '../lib/dosingOptimizer.js';
import { exportOdeToSbml } from '../lib/sbmlExporter.js';
import { exportOdeToPhysicell } from '../lib/physicellExporter.js';
import { buildEvidenceDossier } from '../lib/evidenceDossier.js';
import { otSearch } from '../lib/openTargetsClient.js';
import { ptSearch, parsePubTatorAnnotations } from '../lib/pubTatorClient.js';
import { zod400, kgNeighborhoodReq, kgBridgesReq } from '../lib/contracts.js';

export function createKgRouter(): Router {
  const router = Router();

  // --- NetworkX sidecar proxy (stateless compute; honest offline status) ---
  router.get('/sidecar', async (_req, res) => {
    const health = await kgSidecarHealth();
    res.json({
      success: true,
      online: health.ok,
      service: health.service,
      networkx: health.networkx,
      sidecarUrl: process.env.KG_SIDECAR_URL || KG_SIDECAR_DEFAULT_URL,
      graphNodes: oncologyKgToGraph().nodes.length,
      graphEdges: oncologyKgToGraph().edges.length,
      latencyMs: health.latencyMs,
      error: health.error ?? null,
    });
  });

  router.post('/sidecar/centrality', async (_req, res) => {
    const payload = oncologyKgToGraph();
    const result = await kgCentrality(payload);
    res.json({ success: true, ...result });
  });

  router.post('/sidecar/neighborhood', async (req, res) => {
    const body = zod400(kgNeighborhoodReq, req, res);
    if (!body) return;
    const result = await kgNeighborhood(oncologyKgToGraph(), body.target);
    res.json({ success: true, ...result });
  });

  router.post('/sidecar/bridges', async (req, res) => {
    const body = zod400(kgBridgesReq, req, res);
    if (!body) return;
    const result = await kgBridges(oncologyKgToGraph(), body.from, body.to);
    res.json({ success: true, ...result });
  });

  // --- Live evidence layer (Open Targets + PubTator -> grounded graph) ---
  router.get('/live/status', async (_req, res) => {
    const health = await liveEvidenceHealth();
    res.json({
      success: true,
      providers: health,
      note: 'Status of the Open Targets + PubTator 3.0 live evidence providers.',
    });
  });

  router.post('/live/graph', async (_req, res) => {
    const result = await buildLiveOncologyGraph();
    res.json({ success: true, ...result });
  });

  router.post('/live/search', async (req, res) => {
    const q = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
    if (!q || q.length > 300) {
      res.status(400).json({ success: false, error: 'query must be a non-empty string (max 300 chars)' });
      return;
    }
    const [ot, pt] = await Promise.all([
      otSearch(q, ['disease', 'target'], 5),
      ptSearch(q, { pageSize: 3 }),
    ]);
    res.json({
      success: true,
      query: q,
      openTargets: ot,
      pubTator: {
        ok: pt.ok,
        error: pt.error,
        cached: pt.cached,
        latencyMs: pt.latencyMs,
        articles: pt.data?.articles.map((a) => ({ pmid: a.pmid, title: a.title, journal: a.journal, doi: a.doi, entities: a.entities })) ?? [],
      },
    });
  });

  router.post('/live/annotate', async (req, res) => {
    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    if (!text || text.length > 20000) {
      res.status(400).json({ success: false, error: 'text must be a non-empty string (max 20000 chars)' });
      return;
    }
    const entities = parsePubTatorAnnotations(text);
    res.json({ success: true, entities });
  });

  // --- Phase 2: evidence -> ODE params ---
  router.post('/live/ode-params', async (req, res) => {
    const diseaseId = typeof req.body?.diseaseId === 'string' && req.body.diseaseId ? req.body.diseaseId : undefined;
    const graphResult = await buildLiveOncologyGraph();
    if (!graphResult.ok) {
      res.status(502).json({ success: false, error: graphResult.error ?? 'live graph build failed' });
      return;
    }
    const bundle = await synthesizeOdeKinetics({ graph: graphResult, diseaseId });
    res.json({ success: true, ...bundle });
  });

  // --- Phase 3: combinatorial adaptive dosing optimizer ---
  router.post('/live/optimize', async (req, res) => {
    const diseaseId = typeof req.body?.diseaseId === 'string' && req.body.diseaseId ? req.body.diseaseId : undefined;
    const doses = Array.isArray(req.body?.doses)
      ? req.body.doses.filter((d: unknown) => typeof d === 'number' && Number.isFinite(d) && d > 0 && d <= 100).slice(0, 8)
      : undefined;
    const modes = Array.isArray(req.body?.modes)
      ? req.body.modes.filter((m: unknown) => typeof m === 'string')
      : undefined;
    const graphResult = await buildLiveOncologyGraph();
    if (!graphResult.ok) {
      res.status(502).json({ success: false, error: graphResult.error ?? 'live graph build failed' });
      return;
    }
    const bundle = await synthesizeOdeKinetics({ graph: graphResult, diseaseId });
    if (!bundle.ok) {
      res.status(502).json({ success: false, error: bundle.error ?? 'synthesis failed' });
      return;
    }
    const result = await runDosingSweep(bundle.params, { doses, modes });
    res.json({
      success: true,
      diseaseId: diseaseId ?? null,
      params: bundle.params,
      provenance: bundle.provenance,
      ...result,
    });
  });

  // --- Phase 4: standards interop + cryptographic evidence dossier ---
  router.post('/live/pipeline', async (req, res) => {
    const diseaseId = typeof req.body?.diseaseId === 'string' && req.body.diseaseId ? req.body.diseaseId : undefined;
    const doses = Array.isArray(req.body?.doses)
      ? req.body.doses.filter((d: unknown) => typeof d === 'number' && d > 0).slice(0, 8)
      : undefined;
    const modes = Array.isArray(req.body?.modes)
      ? req.body.modes.filter((m: unknown) => typeof m === 'string')
      : undefined;

    const graphResult = await buildLiveOncologyGraph();
    if (!graphResult.ok) {
      res.status(502).json({ success: false, error: graphResult.error ?? 'live graph build failed' });
      return;
    }
    const bundle = await synthesizeOdeKinetics({ graph: graphResult, diseaseId });
    if (!bundle.ok) {
      res.status(502).json({ success: false, error: bundle.error ?? 'synthesis failed' });
      return;
    }
    const opt = await runDosingSweep(bundle.params, { doses, modes });
    const sbml = exportOdeToSbml(bundle.params);
    const physicell = exportOdeToPhysicell(bundle.params);
    const dossier = buildEvidenceDossier({
      graph: graphResult,
      params: bundle.params,
      paramProvenance: bundle.provenance.map((p) => ({ key: p.key, origin: p.origin, evidence: p.evidence, confidence: p.confidence })),
      arms: opt.arms.map((a) => ({ arm: `${a.therapyMode}@${a.drugDose}`, finalVolume: a.finalVolume_mm3, reachable: a.reachability.isReachable })),
      extinction: { extinctionProbability: opt.extinction.extinctionProbability, nRuns: opt.extinction.nRuns },
      sbml: { hash: createHash('sha256').update(sbml.sbml).digest('hex'), ok: sbml.ok },
      physicell: { hash: createHash('sha256').update(physicell.xml).digest('hex'), ok: physicell.ok },
    });

    res.json({
      success: true,
      diseaseId: diseaseId ?? null,
      dossier,
      provenance: bundle.provenance.map((p) => ({ key: p.key, value: p.value, origin: p.origin, confidence: p.confidence, evidence: p.evidence })),
      arms: opt.arms.map((a) => ({ therapyMode: a.therapyMode, drugDose: a.drugDose, finalVolume_mm3: a.finalVolume_mm3, finalResistantFraction: a.finalResistantFraction, minHealthy: a.minHealthy, reachable: a.reachability.isReachable, failureReason: a.reachability.failureReason })),
      sbml: { ok: sbml.ok, level: sbml.level, version: sbml.version, speciesCount: sbml.speciesCount, parameterCount: sbml.parameterCount, reactionCount: sbml.reactionCount, note: sbml.modelNotes },
      physicell: { ok: physicell.ok, cellCount: physicell.cellCount, parameterCount: physicell.parameterCount, note: physicell.note },
      optimization: { bestArmKey: opt.bestArmKey, rankedArms: opt.rankedArms, extinction: opt.extinction },
      params: bundle.params,
    });
  });

  return router;
}