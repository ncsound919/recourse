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
  ): { success: boolean; healedTool: ToolEntry; anomaly: AnomalyReport; version: string };
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
  // degraded tools in the live registry. Heals are counted only when the
  // sandbox verifier accepts the patched source.
  router.post('/repair/scan-heal', (_req, res) => {
    const detectedAnomalies = deps.anomalies().filter((a) => a.status === 'detected');
    const results = [];

    for (const anom of detectedAnomalies) {
      const healResult = deps.executeSelfRepair(anom.toolName, anom.brokenCode, anom.errorType, anom.test_suite_code);
      if (healResult.success) {
        anom.status = 'repaired';
        anom.fixedCode = healResult.anomaly.fixedCode;
        anom.repairLatencyMs = healResult.anomaly.repairLatencyMs;
      } else {
        anom.status = 'detected';
        anom.fixedCode = healResult.anomaly.fixedCode;
        anom.repairLatencyMs = healResult.anomaly.repairLatencyMs;
      }
      results.push(healResult);
    }

    for (const tool of deps.registry()) {
      if (tool.healthStatus === 'corrupted' || tool.healthStatus === 'degraded') {
        const healResult = deps.executeSelfRepair(tool.name, tool.versions[tool.versions.length - 1]?.source_code || '', 'logic_regression');
        results.push(healResult);
      }
    }

    deps.saveState();

    res.json({
      success: true,
      healedCount: results.filter((r) => r.success).length,
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
