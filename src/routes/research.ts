/**
 * research.ts — the research/agenda surface extracted from the `server.ts`
 * monolith: science conductor, Overlay Global Lens, math conductor, breakthrough
 * agenda, gamification, and the fleet dashboard.
 *
 * Pure lib logic is imported directly (the routers in this repo are thin,
 * stateful-boundary-only). Host-owned mutable state (the global-lens autopilot
 * flag, last-publish record, and the compose+publish pass) is injected so that
 * the monolith keeps single ownership of persisted state.
 */
import { Router } from 'express';
import {
  getConductorStatus,
  recentFindings,
  recentCycles,
  runScienceCycle,
  startScienceConductor,
  stopScienceConductor,
} from '../lib/scienceConductor.js';
import {
  globalLensHealth,
  globalLensConfigured,
  globalLensBaseUrl,
} from '../lib/globalLensBridge.js';
import { PUBLISH_DOMAINS } from '../lib/globalLensPublisher.js';
import {
  startMathConductor,
  stopMathConductor,
  runMathCycle,
  mathConductorStatus,
  recentMathCycles,
  recentMathFindings,
} from '../lib/mathConductor.js';
import {
  computeAgenda,
  selectNextMathMilestone,
  selectNextOncologyMilestone,
  renderAndPersistAgenda,
} from '../lib/breakthroughAgenda.js';
import { computeGameProfile, leaderboard } from '../lib/gamification.js';
import { renderDashboard } from '../lib/fleetDashboard.js';
import { requireMutationAuthIfConfigured } from '../lib/mutationAuth.js';

export interface ResearchRouterDeps {
  appendProvenance(eventType: string, data: Record<string, unknown>): void;
  globalLens: {
    getAutopilot(): boolean;
    setAutopilot(on: boolean): void;
    intervalMs(): number;
    getLastPublish(): unknown;
    publishPass(): Promise<{ result: unknown; domains: number }>;
  };
}

export function createResearchRouter(deps: ResearchRouterDeps): Router {
  const router = Router();

  // --- Science conductor ---------------------------------------------------
  router.get('/science/status', (_req, res) => {
    res.json({ success: true, ...getConductorStatus() });
  });

  router.get('/science/findings', (req, res) => {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 50));
    const findings = recentFindings(limit);
    res.json({ success: true, count: findings.length, findings });
  });

  router.get('/science/cycles', (req, res) => {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const cycles = recentCycles(limit);
    res.json({ success: true, count: cycles.length, cycles });
  });

  router.post('/science/cycle', async (_req, res) => {
    try {
      const cycle = await runScienceCycle();
      deps.appendProvenance('system_tick', {
        driverId: 'science_conductor_manual',
        cycle: cycle.cycle,
        mode: cycle.experimentMode,
        findings: cycle.findings.length,
      });
      res.json({ success: true, cycle });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'science cycle failed';
      res.status(500).json({ success: false, error: message });
    }
  });

  router.post('/science/toggle', (req, res) => {
    const action = (req.body ?? {}).action;
    if (action === 'start') {
      const intervalMs = Number((req.body ?? {}).intervalMs) || 15 * 60 * 1000;
      const r = startScienceConductor({ intervalMs });
      if (r.started) deps.appendProvenance('loop_started', { driverId: 'science_conductor', intervalMs });
      res.json({ success: r.started, ...r, status: getConductorStatus() });
      return;
    }
    if (action === 'stop') {
      const r = stopScienceConductor();
      if (r.stopped) deps.appendProvenance('loop_stopped', { driverId: 'science_conductor' });
      res.json({ success: r.stopped, ...r, status: getConductorStatus() });
      return;
    }
    res.status(400).json({ success: false, error: "action must be 'start' or 'stop'" });
  });

  // --- Overlay Global Lens -------------------------------------------------
  router.get('/global-lens/status', async (_req, res) => {
    const health = await globalLensHealth();
    res.json({
      success: true,
      online: health.ok,
      latencyMs: health.latencyMs,
      error: health.error ?? null,
      configured: globalLensConfigured(),
      url: globalLensBaseUrl(),
      autopilot: deps.globalLens.getAutopilot(),
      publishIntervalMs: deps.globalLens.intervalMs(),
      lastPublish: deps.globalLens.getLastPublish(),
      domains: PUBLISH_DOMAINS.map((d) => ({ label: d.label, category: d.category, pillar: d.pillar, projects: d.projects })),
    });
  });

  router.post('/global-lens/publish', async (req, res) => {
    if (!requireMutationAuthIfConfigured(req, res)) return;
    try {
      const { result } = await deps.globalLens.publishPass();
      res.json({ success: true, ...(result as Record<string, unknown>) });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/global-lens/toggle', async (req, res) => {
    const action = (req.body ?? {}).action;
    if (action === 'start') {
      deps.globalLens.setAutopilot(true);
      try {
        const { result } = await deps.globalLens.publishPass();
        deps.appendProvenance('loop_started', { driverId: 'global_lens_publisher' });
        res.json({ success: true, autopilot: true, result });
        return;
      } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
        return;
      }
    }
    if (action === 'stop') {
      deps.globalLens.setAutopilot(false);
      deps.appendProvenance('loop_stopped', { driverId: 'global_lens_publisher' });
      res.json({ success: true, autopilot: false });
      return;
    }
    res.status(400).json({ success: false, error: "action must be 'start' or 'stop'" });
  });

  // --- Math conductor ------------------------------------------------------
  router.post('/math/toggle', (req, res) => {
    const action = (req.body ?? {}).action;
    if (action === 'start') {
      const intervalMs = Number((req.body ?? {}).intervalMs) || 20 * 60 * 1000;
      const r = startMathConductor({ intervalMs });
      if (r.started) deps.appendProvenance('loop_started', { driverId: 'math_conductor', intervalMs });
      res.json({ success: r.started, ...r, status: mathConductorStatus() });
      return;
    }
    if (action === 'stop') {
      const r = stopMathConductor();
      if (r.stopped) deps.appendProvenance('loop_stopped', { driverId: 'math_conductor' });
      res.json({ success: r.stopped, ...r, status: mathConductorStatus() });
      return;
    }
    res.status(400).json({ success: false, error: "action must be 'start' or 'stop'" });
  });

  router.get('/math/status', (_req, res) => {
    res.json({ success: true, ...mathConductorStatus() });
  });

  router.get('/math/cycles', (req, res) => {
    const limit = Number(req.query.limit || 20);
    res.json({ success: true, cycles: recentMathCycles(limit) });
  });

  router.get('/math/findings', (req, res) => {
    const limit = Number(req.query.limit || 50);
    res.json({ success: true, findings: recentMathFindings(limit) });
  });

  router.post('/math/cycle', async (_req, res) => {
    try {
      const cycle = await runMathCycle();
      deps.appendProvenance('system_tick', {
        driverId: 'math_conductor_manual',
        cycle: cycle.cycle,
        problemId: cycle.problemId,
        passed: cycle.attemptPassed,
        score: cycle.attemptScore,
      });
      res.json({ success: true, cycle });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'math cycle failed';
      res.status(500).json({ success: false, error: message });
    }
  });

  // --- Breakthrough agenda -------------------------------------------------
  router.get('/agenda', (_req, res) => {
    const agenda = computeAgenda();
    res.json({ success: true, milestones: agenda });
  });

  router.get('/agenda/next', (_req, res) => {
    const mathNext = selectNextMathMilestone();
    const oncoNext = selectNextOncologyMilestone();
    res.json({ success: true, nextMath: mathNext, nextOncology: oncoNext });
  });

  router.post('/agenda/refresh', (_req, res) => {
    try {
      const result = renderAndPersistAgenda();
      res.json({ success: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'agenda refresh failed';
      res.status(500).json({ success: false, error: message });
    }
  });

  // --- Gamification --------------------------------------------------------
  router.get('/game', (_req, res) => {
    res.json({ success: true, ...computeGameProfile() });
  });

  router.get('/game/leaderboard', (_req, res) => {
    res.json({ success: true, leaderboard: leaderboard() });
  });

  // --- Fleet dashboard -----------------------------------------------------
  router.get('/fleet-dashboard', async (_req, res) => {
    try {
      const { file, sections } = await renderDashboard();
      res.json({ success: true, file, sections });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'dashboard render failed';
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}
