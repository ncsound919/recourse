/**
 * Recourse tools router — pdf, fuzz, grant, research, prometheus, bfr.
 * Extracted from the server.ts monolith (2026-09). Stateless handlers over lib
 * modules: real results forwarded, honest offline status.
 */

import { Router } from 'express';
import {
  pdfSidecarHealth,
  pdfExtractUrl,
  pdfExtractBytes,
  PDF_SIDECAR_DEFAULT_URL,
} from '../lib/pdfSidecarClient.js';
import {
  fuzzSidecarHealth,
  fuzzMatch,
  fuzzDedup,
  FUZZ_SIDECAR_DEFAULT_URL,
} from '../lib/fuzzSidecarClient.js';
import {
  listProblems,
  getProblem,
  findGaps,
  generateHypotheses,
  designExperiments,
  scoreProposal,
  packageGrant,
} from '../lib/oncologyGrantEngine.js';
import { executeResearch, bindToClaims, DEFAULT_RESEARCH_CONFIG } from '../lib/deterministicResearch.js';
import { fetchExport, parsePrometheusHypotheses, toResearchSources, PROMETHEUS_DEFAULT_URL } from '../lib/prometheusBridge.js';
import { runAgingSweep, runSatSweep, runRiemannSlice } from '../lib/bfrBridge.js';
import {
  zod400,
  pdfExtractUrlReq,
  pdfExtractBytesReq,
  fuzzMatchReq,
  fuzzDedupReq,
  grantHypothesesReq,
  researchExecuteReq,
  prometheusExportReq,
  bfrAgingReq,
  bfrSatReq,
  bfrRiemannReq,
} from '../lib/contracts.js';

export function createToolsRouter(): Router {
  const router = Router();

  // --- pdf sidecar ---
  router.get('/pdf/sidecar', async (_req, res) => {
    const health = await pdfSidecarHealth();
    res.json({
      success: true,
      online: health.ok,
      service: health.service,
      pymupdf: health.pymupdf,
      sidecarUrl: process.env.PDF_SIDECAR_URL || PDF_SIDECAR_DEFAULT_URL,
      latencyMs: health.latencyMs,
      error: health.error ?? null,
    });
  });

  router.post('/pdf/extract-url', async (req, res) => {
    const body = zod400(pdfExtractUrlReq, req, res);
    if (!body) return;
    const result = await pdfExtractUrl(body.url, body.max_pages ? { maxPages: body.max_pages } : {});
    res.json({ success: true, ...result });
  });

  router.post('/pdf/extract-bytes', async (req, res) => {
    const body = zod400(pdfExtractBytesReq, req, res);
    if (!body) return;
    const result = await pdfExtractBytes(body.data_base64, {
      ...(body.filename ? { filename: body.filename } : {}),
      ...(body.max_pages ? { maxPages: body.max_pages } : {}),
    });
    res.json({ success: true, ...result });
  });

  // --- fuzz sidecar ---
  router.get('/fuzz/sidecar', async (_req, res) => {
    const health = await fuzzSidecarHealth();
    res.json({
      success: true,
      online: health.ok,
      service: health.service,
      rapidfuzz: health.rapidfuzz,
      sidecarUrl: process.env.FUZZ_SIDECAR_URL || FUZZ_SIDECAR_DEFAULT_URL,
      latencyMs: health.latencyMs,
      error: health.error ?? null,
    });
  });

  router.post('/fuzz/match', async (req, res) => {
    const body = zod400(fuzzMatchReq, req, res);
    if (!body) return;
    const result = await fuzzMatch(body.needle, body.candidates, {
      ...(body.scorer ? { scorer: body.scorer } : {}),
      ...(body.threshold !== undefined ? { threshold: body.threshold } : {}),
      ...(body.limit !== undefined ? { limit: body.limit } : {}),
    });
    res.json({ success: true, ...result });
  });

  router.post('/fuzz/dedup', async (req, res) => {
    const body = zod400(fuzzDedupReq, req, res);
    if (!body) return;
    const result = await fuzzDedup(body.names, {
      ...(body.scorer ? { scorer: body.scorer } : {}),
      ...(body.threshold !== undefined ? { threshold: body.threshold } : {}),
    });
    res.json({ success: true, ...result });
  });

  // --- oncology grant engine ---
  router.get('/grant/problems', (_req, res) => {
    const problems = listProblems().map((p) => ({
      problem_id: p.problem_id,
      title: p.title,
      summary: p.summary,
      subMechanisms: p.subMechanisms.length,
      sources: Object.keys(p.sources).length,
      lastUpdated: p.lastUpdated,
    }));
    res.json({ success: true, count: problems.length, problems });
  });

  router.get('/grant/problems/:id', (req, res) => {
    try {
      res.json({ success: true, problem: getProblem(req.params.id) });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown problem';
      res.status(404).json({ success: false, error: message });
    }
  });

  router.post('/grant/hypotheses', (req, res) => {
    const body = zod400(grantHypothesesReq, req, res);
    if (!body) return;
    try {
      const gaps = findGaps(body.problemId);
      const hypotheses = generateHypotheses(body.problemId);
      const experiments = designExperiments(body.problemId);
      const scored = hypotheses.map((h, i) => ({ hypothesis: h, experiment: experiments[i] ?? null, review: experiments[i] ? scoreProposal(h, experiments[i]) : null }));
      res.json({ success: true, problemId: body.problemId, gaps, hypotheses, experiments, scored });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'grant pipeline failed';
      res.status(404).json({ success: false, error: message });
    }
  });

  router.post('/grant/package', (req, res) => {
    const body = zod400(grantHypothesesReq, req, res);
    if (!body) return;
    try {
      res.json({ success: true, package: packageGrant(body.problemId) });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'packaging failed';
      res.status(400).json({ success: false, error: message });
    }
  });

  // --- deterministic research ---
  router.post('/research/execute', (req, res) => {
    const body = zod400(researchExecuteReq, req, res);
    if (!body) return;
    const query = {
      id: body.query.id,
      timestamp: Date.now(),
      topic: body.query.topic,
      intent: (body.query.intent ?? 'literature_scan') as 'literature_scan' | 'fact_check' | 'trend_detection' | 'evidence_collection',
      scope: { domains: body.query.domains },
      constraints: { minRelevanceScore: body.query.minRelevance },
    };
    const sources = body.sources.map((s) => ({
      id: s.id,
      title: s.title,
      url: s.url,
      domain: s.domain,
      contentPreview: s.contentPreview ?? `${s.title} — ${s.domain}`,
      metadata: {
        publishedAt: s.publishedAt,
        authors: s.authors,
        doi: s.doi,
        accessibilityStatus: (s.openAccess === false ? 'paywalled' : 'open') as 'open' | 'paywalled' | 'restricted',
      },
      fetchedAt: Date.now(),
    }));
    const result = executeResearch(query, sources, {
      ...DEFAULT_RESEARCH_CONFIG,
      ...(body.query.minRelevance !== undefined ? { minRelevance: body.query.minRelevance } : {}),
      ...(body.query.threshold !== undefined ? { dedupThreshold: body.query.threshold } : {}),
    });
    const bindings = body.claims ? bindToClaims(result, body.claims) : [];
    res.json({ success: true, ...result, bindings });
  });

  // --- prometheus bridge ---
  router.post('/prometheus/export', async (req, res) => {
    const body = zod400(prometheusExportReq, req, res);
    if (!body) return;
    const result = await fetchExport(body.entity, body.format ?? 'json');
    if (!result.ok) return res.json({ success: true, ...result });
    if (body.entity === 'hypotheses' && (body.format ?? 'json') === 'json') {
      const rows = parsePrometheusHypotheses(result.data);
      return res.json({ success: true, ...result, rows, researchSources: toResearchSources(rows) });
    }
    res.json({ success: true, ...result });
  });

  router.get('/prometheus/status', (_req, res) => {
    res.json({ success: true, url: process.env.PROMETHEUS_URL || PROMETHEUS_DEFAULT_URL, note: 'external engine; use POST /api/recourse/prometheus/export to pull rows' });
  });

  // --- BFR lightweight sweeps ---
  router.post('/bfr/aging', (req, res) => {
    const body = zod400(bfrAgingReq, req, res);
    if (!body) return;
    res.json({
      success: true,
      sweep: runAgingSweep(body.hallmarks ?? ['genomic_instability', 'cellular_senescence'], body.organisms ?? ['mouse'], body.seed ?? 1),
    });
  });

  router.post('/bfr/sat', (req, res) => {
    const body = zod400(bfrSatReq, req, res);
    if (!body) return;
    res.json({ success: true, sweep: runSatSweep(body.nVars ?? 50, body.nInstances ?? 100, body.seed ?? 1) });
  });

  router.post('/bfr/riemann', (req, res) => {
    const body = zod400(bfrRiemannReq, req, res);
    if (!body) return;
    res.json({ success: true, sweep: runRiemannSlice(body.tStart ?? 14, body.tEnd ?? 100, body.points ?? 16, body.seed ?? 1) });
  });

  return router;
}