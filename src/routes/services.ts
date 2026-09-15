/**
 * Recourse services router — translation, keywire, trend.
 * Extracted from the server.ts monolith (2026-09). Stateless handlers over lib
 * modules: real results forwarded, honest offline status.
 */

import { Router } from 'express';
import {
  engineConfig,
  translationHealth,
  translationPythonBin,
  translationRunnerPath,
  type TranslationEngineId,
} from '../lib/translationBridge.js';
import {
  keywireHealth,
  keywireSummary,
  keywireCallService,
  keywireBrainTask,
  keywireAxiomTest,
  keywirePm2Status,
  keywireServers,
  keywireAuthStatus,
  KEYWIRE_DEFAULT_URL,
} from '../lib/keywireBridge.js';
import { recentInsights, verifyLedgerChain } from '../lib/trendLedger.js';
import { fetchDomainPageviews } from '../lib/trendSources.js';
import { runTrendScan } from '../lib/trendEngine.js';
import {
  trendHealth,
  trendScan,
  trendChangepoint,
  trendDecompose,
  TREND_SIDECAR_DEFAULT_URL,
} from '../lib/trendSidecarClient.js';

export function createServicesRouter(): Router {
  const router = Router();

  // --- translation engines ---
  router.get('/translation/status', async (_req, res) => {
    const ids: TranslationEngineId[] = ['bbtech', 'golf-surgery'];
    const engines = [];
    for (const id of ids) {
      const cfg = engineConfig(id);
      const h = await translationHealth(id, { timeoutMs: 8000 });
      engines.push({
        id,
        label: cfg.label,
        className: cfg.className,
        moduleFile: cfg.moduleFile,
        online: h.online,
        latencyMs: h.latencyMs ?? null,
        error: h.error ?? null,
        stats: h.stats ?? null,
      });
    }
    res.json({
      success: true,
      python: translationPythonBin(),
      runner: translationRunnerPath(),
      engines,
    });
  });

  // --- keywire ---
  router.get('/keywire/status', async (_req, res) => {
    const r = await keywireHealth();
    res.json({
      success: true,
      online: r.ok,
      keywireUrl: process.env.KEYWIRE_URL || KEYWIRE_DEFAULT_URL,
      auth: keywireAuthStatus(),
      summary: r.ok ? r.summary : null,
      error: r.error ?? null,
      latencyMs: r.latencyMs,
    });
  });

  router.get('/keywire/summary', async (_req, res) => {
    const r = await keywireSummary();
    res.json({ success: true, ...r });
  });

  router.post('/keywire/call', async (req, res) => {
    const { id } = (req.body ?? {}) as { id?: string };
    if (!id) return res.status(400).json({ success: false, error: 'id (string) required' });
    const r = await keywireCallService(id);
    res.json({ success: true, ...r });
  });

  router.post('/keywire/brain', async (req, res) => {
    const r = await keywireBrainTask((req.body ?? {}) as Record<string, unknown>);
    res.json({ success: true, ...r });
  });

  router.get('/keywire/axiom', async (_req, res) => {
    const r = await keywireAxiomTest();
    res.json({ success: true, ...r });
  });

  router.get('/keywire/pm2', async (_req, res) => {
    const r = await keywirePm2Status();
    res.json({ success: true, ...r });
  });

  router.get('/keywire/servers', async (_req, res) => {
    const r = await keywireServers();
    res.json({ success: true, ...r });
  });

  // --- trend ---
  router.get('/trend/ledger', (_req, res) => {
    const ledger = recentInsights(200);
    const verify = verifyLedgerChain();
    res.json({ success: true, count: ledger.length, chainValid: verify.valid, ledger });
  });

  router.get('/trend/ledger/verify', (_req, res) => {
    res.json({ success: true, ...verifyLedgerChain() });
  });

  router.post('/trend/scan', async (req, res) => {
    try {
      const from = Date.now() - 60 * 24 * 3600 * 1000;
      const results = await fetchDomainPageviews('oncology', from, Date.now());
      const live = results
        .filter((r) => r.ok && r.points.length >= 7)
        .map((r) => ({ id: `wiki_${r.article}`, name: r.article, domain: 'wikipedia', points: r.points }));
      if (live.length < 2) {
        return res.json({
          success: true,
          online: false,
          note: 'wikipedia pageviews unreachable or too few series — run returned no scan',
          raw: results.map((r) => ({ article: r.article, ok: r.ok, error: r.error })),
        });
      }
      const scan = runTrendScan(live);
      res.json({ success: true, online: true, series: live.length, ...scan });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'trend scan failed';
      res.status(500).json({ success: false, error: message });
    }
  });

  router.get('/trend/sidecar', async (_req, res) => {
    const health = await trendHealth();
    res.json({
      success: true,
      online: health.ok,
      service: health.service,
      statsmodels: health.statsmodels ?? false,
      ruptures: health.ruptures ?? false,
      sidecarUrl: process.env.TREND_SIDECAR_URL || TREND_SIDECAR_DEFAULT_URL,
      latencyMs: health.latencyMs,
      error: health.error ?? null,
    });
  });

  router.post('/trend/sidecar/scan', async (req, res) => {
    const body = (req.body ?? {}) as { series?: unknown[] };
    if (!Array.isArray(body.series) || body.series.length === 0) {
      return res.status(400).json({ success: false, error: 'series array required' });
    }
    const result = await trendScan(body.series as never[]);
    res.json({ success: true, ...result });
  });

  router.post('/trend/sidecar/changepoint', async (req, res) => {
    const body = (req.body ?? {}) as { series?: unknown; penalty?: number; min_segment?: number };
    if (!body.series || typeof body.series !== 'object') {
      return res.status(400).json({ success: false, error: 'series object required' });
    }
    const result = await trendChangepoint(
      body.series as never,
      body.penalty ?? 5.0,
      body.min_segment ?? 3,
    );
    res.json({ success: true, ...result });
  });

  router.post('/trend/sidecar/decompose', async (req, res) => {
    const body = (req.body ?? {}) as { series?: unknown; period?: number };
    if (!body.series || typeof body.series !== 'object') {
      return res.status(400).json({ success: false, error: 'series object required' });
    }
    const result = await trendDecompose(body.series as never, body.period ?? 7);
    res.json({ success: true, ...result });
  });

  return router;
}