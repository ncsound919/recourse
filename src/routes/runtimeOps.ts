/**
 * runtimeOps.ts — operational routes extracted from `server.ts`:
 * POST /hyperparameters, POST /chaos/inject, POST /tick,
 * POST /tick/autopilot/toggle.
 *
 * These act directly on host runtime state (status, anomalies, registry) and
 * drive the server tick loop, so all mutable state and side-effecting helpers
 * are injected. `crypto` is a node import; anomaly/tool types come from
 * `../types.js`.
 */
import { Router } from 'express';
import crypto from 'crypto';
import type { AnomalyReport, ToolEntry, ToolDomain, SystemStatus } from '../types.js';

export interface RuntimeOpsRouterDeps {
  statusRef(): SystemStatus;
  anomaliesRef(): AnomalyReport[];
  registryRef(): ToolEntry[];
  genesisSuites(): Record<string, string>;
  appendProvenance(eventType: string, data: Record<string, unknown>): void;
  saveState(): void;
  runServerTick(): Promise<unknown>;
  recordFailure(source: string, err: unknown): void;
  serverTickAutopilotRef(): boolean;
  setServerTickAutopilot(on: boolean): void;
  ensureServerTickAutopilot(): void;
  stopServerTickAutopilot(): void;
  tickAutopilotIntervalMs(): number;
}

export function createRuntimeOpsRouter(deps: RuntimeOpsRouterDeps): Router {
  const router = Router();

  router.post('/hyperparameters', (req, res) => {
    const { hyperParams } = req.body;
    const status = deps.statusRef();
    if (hyperParams) {
      status.hyperParams = { ...status.hyperParams, ...hyperParams };
      deps.appendProvenance('system_tick', {
        action: 'hyperparameters_tuned',
        hyperParams: status.hyperParams,
        generation: status.generation
      });
      deps.saveState();
    }
    res.json({ success: true, hyperParams: status.hyperParams });
  });

  // Chaos Injection Route
  router.post('/chaos/inject', (req, res) => {
    const { chaosType = 'vieta_sign_bug', targetToolName = 'quadratic_vieta_root_sum' } = req.body;

    let brokenCode = '';
    let errorDesc = '';
    let domain: ToolDomain = 'math';
    let testSuite: string | undefined;

    if (chaosType === 'vieta_sign_bug') {
      domain = 'math';
      brokenCode = `export function sumOfRoots(a, b, c) {\n  return b / a; // INJECTED CHAOS: Vieta sign reversal\n}`;
      errorDesc = 'Vieta formula sign defect injected';
      testSuite = deps.genesisSuites()['quadratic_vieta_root_sum'];
    } else if (chaosType === 'syntax_ast_error') {
      domain = 'coding';
      brokenCode = `export function execute() { \n  <<<SYNTAX_CORRUPT>>> invalid token fontFinally:\n}`;
      errorDesc = 'AST token sequence syntax corruption';
    } else if (chaosType === 'security_taint') {
      domain = 'cyber_defense';
      brokenCode = `export function processPayload(data) {\n  return eval(data); // INJECTED CHAOS: Dynamic eval vulnerability\n}`;
      errorDesc = 'Zero-day eval injection security taint';
    } else if (chaosType === 'quantum_decoherence') {
      domain = 'quantum_sim';
      brokenCode = `export function stateTransform() {\n  return { probabilities_sum: 1.45, state: 'decoherent' };\n}`;
      errorDesc = 'Quantum unitarity state norm violation';
    } else {
      domain = 'biotech';
      brokenCode = `{\n  "asset_name": "CHAOS_01",\n  "leg": "invalid",\n  "evidence_tier": 0\n}`;
      errorDesc = 'Biotech Knowledge Graph invalid leg conflict';
    }

    const status = deps.statusRef();
    const anomalies = deps.anomaliesRef();
    const registry = deps.registryRef();

    const anomId = `anom_chaos_${Date.now()}`;
    const anomaly: AnomalyReport = {
      id: anomId,
      timestamp: Date.now(),
      toolName: targetToolName,
      domain,
      severity: 'critical',
      errorType: chaosType as any,
      description: errorDesc,
      rootCause: `Synthetic Chaos Injection (${chaosType})`,
      brokenCode,
      test_suite_code: testSuite,
      status: 'detected',
      repairGen: status.generation
    };

    anomalies.unshift(anomaly);
    if (anomalies.length > 100) {
      anomalies.pop();
    }
    status.selfRepair.activeAnomaliesCount = anomalies.filter(a => a.status === 'detected').length;

    const tool = registry.find(t => t.name === targetToolName);
    if (tool) {
      tool.healthStatus = 'corrupted';
      tool.anomalyCount = (tool.anomalyCount || 0) + 1;
      // Make the corruption REAL, not representational: push the broken code as a
      // defective current version so self-repair / scan-heal operate on genuinely
      // defective code and a heal is only counted when the repaired source passes
      // its suite. (Previously chaos only flipped healthStatus, so the repair path
      // "fixed" the still-correct stored source and could never genuinely demo a
      // heal.)
      if (brokenCode && domain !== 'biotech') {
        const defHash = crypto.createHash('sha256').update(brokenCode).digest('hex').substring(0, 16);
        const defVer = `1.0.0-corrupt.${Date.now().toString().slice(-4)}`;
        const existingSuite = tool.versions.find((v) => v.test_suite_code)?.test_suite_code;
        tool.versions.unshift({
          version: defVer,
          hash: defHash,
          created_at: Date.now(),
          passed_verifier: false,
          score: 0,
          promoted: true,
          source_code: brokenCode,
          test_suite_code: testSuite ?? existingSuite,
          verifier_notes: `CHAOS: ${errorDesc} (synthetic corruption for repair test)`,
        } as ToolEntry['versions'][number]);
        tool.currentVersion = defVer;
      }
    }

    deps.appendProvenance('anomaly_injected', {
      anomalyId: anomId,
      tool: targetToolName,
      chaosType,
      errorDesc
    });

    deps.saveState();

    res.json({ success: true, anomaly });
  });

  router.post('/tick', async (_req, res) => {
    try {
      res.json(await deps.runServerTick());
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/tick/autopilot/toggle', (req, res) => {
    const next = !deps.serverTickAutopilotRef();
    deps.setServerTickAutopilot(next);
    if (next) {
      deps.ensureServerTickAutopilot();
      deps.runServerTick().catch(e => deps.recordFailure('server_tick_immediate', e));
    } else {
      deps.stopServerTickAutopilot();
    }
    deps.saveState();
    res.json({ success: true, serverTickAutopilot: next, intervalMs: deps.tickAutopilotIntervalMs() });
  });

  return router;
}
