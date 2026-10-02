/**
 * repair.ts — autonomous self-repair routes (status, scan-heal, single-tool
 * repair, knowledge base, auto-heal toggle) extracted from `server.ts`.
 *
 * `executeSelfRepair` and the mutable anomaly/status state stay host-side and
 * are injected; the knowledge-base reader is a pure lib import.
 */
import { Router } from 'express';
import { getSelfRepairKnowledge } from '../lib/componentTemplates.js';
import type { SystemStatus, AnomalyReport, ToolEntry } from '../types.js';

export interface RepairRouterDeps {
  selfRepairStatus(): SystemStatus['selfRepair'];
  anomalies(): AnomalyReport[];
  executeSelfRepair(
    toolName: string,
    brokenCode: string,
    faultHint?: string,
    testSuite?: string,
  ): {
    success: boolean;
    healedTool: ToolEntry;
    anomaly: AnomalyReport;
    version: string;
    outcome: 'healed' | 'smoke-only' | 'failed';
  };
  registry(): ToolEntry[];
  saveState(): void;
}

export function createRepairRouter(deps: RepairRouterDeps): Router {
  const router = Router();

  router.get('/repair/status', (_req, res) => {
    res.json({
      selfRepair: deps.selfRepairStatus(),
      anomalies: deps.anomalies(),
    });
  });

  // Scan & Heal: repair every detected anomaly, then re-check corrupted /
  // degraded tools in the live registry — ONE attempt per unique tool (the
  // old code double-attempted overlapping tools: 100 anomalies + 35 sick
  // registry entries = 135 calls per click). Heals are counted only when the
  // sandbox verifier accepts the patched source (or the current source
  // re-verifies); smoke-only attempts are reported separately, never as heals.
  router.post('/repair/scan-heal', (_req, res) => {
    const targets = new Map<
      string,
      { brokenCode: string; errorType?: string; suite?: string }
    >();

    for (const anom of deps.anomalies().filter((a) => a.status === 'detected')) {
      if (!targets.has(anom.toolName)) {
        targets.set(anom.toolName, {
          brokenCode: anom.brokenCode,
          errorType: anom.errorType,
          suite: anom.test_suite_code,
        });
      }
    }
    for (const tool of deps.registry()) {
      if (
        (tool.healthStatus === 'corrupted' || tool.healthStatus === 'degraded') &&
        !targets.has(tool.name)
      ) {
        targets.set(tool.name, {
          brokenCode: tool.versions[tool.versions.length - 1]?.source_code || '',
          errorType: 'logic_regression',
        });
      }
    }

    const results: Array<ReturnType<typeof deps.executeSelfRepair>> = [];
    for (const [toolName, target] of targets) {
      results.push(deps.executeSelfRepair(toolName, target.brokenCode, target.errorType, target.suite));
    }

    deps.saveState();

    const healedCount = results.filter((r) => r.outcome === 'healed').length;
    const unverifiedAttempts = results.filter((r) => r.outcome === 'smoke-only').length;
    const failedAttempts = results.filter((r) => r.outcome === 'failed').length;
    const openAnomalies = deps.anomalies().filter((a) => a.status === 'detected').length;

    res.json({
      success: true,
      healedCount,
      attempted: results.length,
      unverifiedAttempts,
      failedAttempts,
      openAnomalies,
      results,
      selfRepairStatus: deps.selfRepairStatus(),
    });
  });

  // Single Tool Gene Self-Repair
  router.post('/repair/single', (req, res) => {
    const { toolName, brokenCode, faultHint } = req.body;
    const tool = deps.registry().find((t) => t.name === toolName);
    const codeToFix = brokenCode || tool?.versions[tool.versions.length - 1]?.source_code || 'export function execute() {}';

    const healResult = deps.executeSelfRepair(toolName, codeToFix, faultHint);
    deps.saveState();

    res.json({
      success: true,
      healResult,
      selfRepairStatus: deps.selfRepairStatus(),
    });
  });

  // Self-Repair Knowledge Base & Telemetry
  router.get('/repair/knowledge', (_req, res) => {
    const knowledge = getSelfRepairKnowledge();
    res.json({
      success: true,
      knowledge,
      selfRepair: deps.selfRepairStatus(),
    });
  });

  // Toggle autonomous repair of failed candidates (isAutoHealingEnabled).
  router.post('/repair/auto-heal', (req, res) => {
    deps.selfRepairStatus().isAutoHealingEnabled = Boolean(req.body?.enabled);
    deps.saveState();
    res.json({ success: true, isAutoHealingEnabled: deps.selfRepairStatus().isAutoHealingEnabled });
  });

  return router;
}
