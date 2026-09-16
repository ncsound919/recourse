/**
 * Recourse Ghidra router — stateless reverse-engineering sidecar proxies plus a
 * single gated learning hook.
 *
 * All analysis handlers proxy the Python Ghidra sidecar
 * (python/ghidra_service/main.py); they forward the real Ghidra headless result
 * and report `ok:false` honestly when Ghidra is absent or the sidecar is down —
 * never a fabricated disassembly.
 *
 * `/learn` is the only mutating route (it folds a real analysis into the
 * recursive learner + self-repair loop). It is config-gated via
 * `requireMutationAuthIfConfigured` because the mission-control UI also drives
 * it; the actual durable writes happen in the injected sink (server.ts).
 */

import { Router } from 'express';
import {
  ghidraHealth,
  ghidraFormats,
  ghidraAnalyze,
  ghidraEntropy,
  GHIDRA_SIDECAR_DEFAULT_URL,
  type GhidraFindings,
} from '../lib/ghidraSidecarClient.js';
import { zod400, ghidraAnalyzeReq, ghidraEntropyReq, ghidraLearnReq } from '../lib/contracts.js';
import { requireMutationAuthIfConfigured } from '../lib/mutationAuth.js';
import type { GhidraLearnInput, GhidraLearnResult } from '../lib/ghidraLearning.js';

export interface GhidraRouterDeps {
  /** Fold a real analysis into learner + repair loop. Wired in server.ts. */
  learnFromAnalysis?: (input: GhidraLearnInput) => Promise<GhidraLearnResult>;
}

export function createGhidraRouter(deps: GhidraRouterDeps = {}): Router {
  const router = Router();

  router.get('/sidecar', async (_req, res) => {
    const health = await ghidraHealth();
    res.json({
      success: true,
      // `online` = sidecar HTTP reachable; `available` = Ghidra/JRE present.
      online: health.ok,
      available: health.available,
      service: health.service ?? 'ghidra',
      ghidraHome: health.ghidra_home ?? null,
      analyzeHeadless: health.analyze_headless ?? null,
      java: health.java ?? null,
      javaVersion: health.java_version ?? null,
      supportedFormats: health.supported_formats ?? [],
      sidecarUrl: process.env.GHIDRA_SIDECAR_URL || GHIDRA_SIDECAR_DEFAULT_URL,
      reason: health.reason ?? null,
      latencyMs: health.latencyMs,
      error: health.error ?? null,
    });
  });

  router.get('/formats', async (_req, res) => {
    const formats = await ghidraFormats();
    if (!formats.ok || !formats.formats) {
      res.json({ success: true, online: false, formats: [], error: formats.error ?? null });
      return;
    }
    res.json({ success: true, online: true, formats: formats.formats });
  });

  router.post('/analyze', async (req, res) => {
    const body = zod400(ghidraAnalyzeReq, req, res);
    if (!body) return;
    const result = await ghidraAnalyze(body.data_base64, {
      filename: body.filename,
      analysisTimeoutSec: body.analysis_timeout_sec,
    });
    res.json({ success: true, ...result });
  });

  router.post('/entropy', async (req, res) => {
    const body = zod400(ghidraEntropyReq, req, res);
    if (!body) return;
    const result = await ghidraEntropy(body.data_base64);
    res.json({ success: true, ...result });
  });

  router.post('/learn', async (req, res) => {
    if (!requireMutationAuthIfConfigured(req, res)) return;
    const body = zod400(ghidraLearnReq, req, res);
    if (!body) return;
    if (!deps.learnFromAnalysis) {
      res.json({ success: true, ok: false, error: 'ghidra learning sink is not wired on this server' });
      return;
    }
    const input: GhidraLearnInput = {
      binaryName: body.binaryName,
      ...(body.domain ? { domain: body.domain } : {}),
      findings: body.findings as unknown as GhidraFindings,
      ...(body.analysis ? { analysis: body.analysis as GhidraLearnInput['analysis'] } : {}),
    };
    const result = await deps.learnFromAnalysis(input);
    res.json({ success: true, ok: true, ...result });
  });

  return router;
}
