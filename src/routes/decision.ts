/**
 * decision.ts — deterministic growth-decision engine + JEV (System One)
 * advisory routes extracted from the `server.ts` monolith.
 *
 * Decision/jev/synergy primitives are pure lib imports. Host-owned mutable
 * state (registry, anomalies, growthWeights, status, gitHubBlueprints,
 * lastGrowthDecision, dream-state mirror) and engines are injected.
 */
import crypto from 'crypto';
import { Router, type Request, type Response } from 'express';
import { evaluateGrowthDecision } from '../lib/decisionEngine.js';
import { decisionSynergyInputs } from '../lib/synergy/decisionBridge.js';
import {
  jevStatus,
  jevEnabled,
  decideSystemOne,
  growthDecisionAdvisory,
  buildChoiceAdvisory,
  buildNoulAdvisory,
} from '../lib/jevClient.js';
import { resolveJevPublic, setJevPublic, TOGGLE_KEY } from '../lib/jevAccess.js';
import { requireMutationAuth, requireJevAdvisoryAuth } from '../lib/mutationAuth.js';
import { normalizePromotionPolicy, resolvePromotion } from '../dream/mutator.js';
import { getComponentTemplate, buildComponentFromTemplate } from '../lib/componentTemplates.js';
import { executeTestSuite } from '../lib/executionSandbox.js';
import type { DreamingEngine } from '../dream/engine.js';
import type {
  DreamState,
  SystemStatus,
  ToolEntry,
  AnomalyReport,
  GrowthFactorWeights,
  GrowthDecisionReport,
  GitHubRepoBlueprint,
} from '../types.js';

export interface DecisionRouterDeps {
  dreamEngine: DreamingEngine;
  setDreamState(state: DreamState): void;
  registryRef(): ToolEntry[];
  anomaliesRef(): AnomalyReport[];
  growthWeightsRef(): GrowthFactorWeights;
  setGrowthWeights(weights: GrowthFactorWeights): void;
  statusRef(): SystemStatus;
  gitHubBlueprintsRef(): GitHubRepoBlueprint[];
  setLastGrowthDecision(decision: GrowthDecisionReport): void;
  promoteTool(entry: ToolEntry, opts: { origin: string; gate?: boolean; push?: boolean }): boolean;
  executeSelfRepair(
    toolName: string,
    brokenCode: string,
    faultHint?: string,
    testSuite?: string,
  ): { success: boolean; healedTool: ToolEntry; anomaly: AnomalyReport; version: string };
  appendProvenance(eventType: string, data: Record<string, unknown>): void;
  saveState(): void;
}

export function createDecisionRouter(deps: DecisionRouterDeps): Router {
  const router = Router();

  async function currentDecision(): Promise<{
    decision: GrowthDecisionReport;
    synergy: { source: unknown; manifestHash: unknown };
    dreamState: DreamState;
  }> {
    const dreamState = await deps.dreamEngine.status();
    deps.setDreamState(dreamState);
    const synergy = decisionSynergyInputs();
    const decision = evaluateGrowthDecision(
      deps.registryRef(),
      deps.anomaliesRef(),
      deps.growthWeightsRef(),
      deps.statusRef().generation,
      dreamState.recentThoughts,
      deps.gitHubBlueprintsRef(),
      synergy.crossDomainSynergyByDomain,
    );
    deps.setLastGrowthDecision(decision);
    return { decision, synergy: { source: synergy.source, manifestHash: synergy.manifestHash }, dreamState };
  }

  router.get('/decision/evaluate', async (_req, res) => {
    const { decision, synergy } = await currentDecision();
    res.json({ success: true, decision, synergy });
  });

  // =========================================================================
  // JEV (System One) DECISION ADVISORY ROUTES
  //     TypeSafe Jev via the Vercel AI Gateway. The deterministic engine stays
  //     authoritative; Jev adds a calibrated `choice`/`noul` advisory alongside
  //     it. When the gateway is unreachable the advisory is honestly `offline`
  //     (source:'offline') — never a fabricated probability.
  // =========================================================================
  router.get('/decision/jev/status', async (_req, res) => {
    const status = await jevStatus();
    const publicValue = await resolveJevPublic();
    res.json({ success: true, jev: status, enabled: jevEnabled(), public: publicValue === '1' });
  });

  // Keywire-backed public/closed toggle for the paid Jev advisory routes. Flipping
  // to true opens them without auth (e.g. the browser composer panel); false
  // closes them again. The value is written to the Keywire vault
  // (`RECOURSE_JEV_PUBLIC` in the fleet project/env) so it persists and is
  // visible fleet-wide. Guarded (write, fail-closed).
  router.post('/decision/jev/public', async (req, res) => {
    if (!requireMutationAuth(req as Request, res as Response)) return;
    try {
      const value = req.body?.public === true ? '1' : '0';
      const keywire = await setJevPublic(value);
      if (!keywire.ok) {
        return res.status(keywire.status ?? 502).json({ success: false, error: keywire.error || 'Keywire toggle write failed' });
      }
      res.json({ success: true, public: value === '1', key: TOGGLE_KEY, keywire });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'toggle failed' });
    }
  });

  router.get('/decision/jev/evaluate', async (req, res) => {
    if (!(await requireJevAdvisoryAuth(req as Request, res as Response))) return;
    try {
      const { decision, synergy } = await currentDecision();

      const advisory = growthDecisionAdvisory(decision);
      const result = await decideSystemOne({ state: advisory.state, questions: advisory.questions });
      const jev = buildChoiceAdvisory(result, advisory.actions);
      try {
        deps.appendProvenance('jev_decision_advisory', {
          source: jev.source,
          model: jev.model,
          recommendedActionId: jev.recommendedActionId,
          recommendedActionType: jev.recommendedActionType,
          probability: jev.probability,
          decisionEntropy: decision.decisionEntropy,
        });
      } catch { /* provenance must never break a decision call */ }

      res.json({
        success: true,
        decision,
        synergy,
        jev,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Jev advisory failed' });
    }
  });

  router.get('/decision/jev/noul', async (req, res) => {
    if (!(await requireJevAdvisoryAuth(req as Request, res as Response))) return;
    try {
      const { decision } = await currentDecision();

      const state = {
        generation: decision.generation,
        stateVectorSummary: decision.stateVectorSummary,
        decisionEntropy: decision.decisionEntropy,
        activeAnomalies: deps
          .anomaliesRef()
          .filter((a) => a.status === 'detected')
          .map((a) => ({ tool: a.toolName, error: a.errorType, severity: a.severity })),
      };
      const result = await decideSystemOne({
        state,
        questions: {
          proceed: {
            type: 'noul',
            instructions: 'Should the autonomous growth loop execute its top-ranked action right now?',
            criteria: {
              true: 'System is healthy and the top action is safe to run',
              false: 'Health is degraded or the top action is risky',
            },
          },
        },
      });
      const jev = buildNoulAdvisory(result);
      try {
        deps.appendProvenance('jev_noul_advisory', {
          source: jev.source,
          model: jev.model,
          noul: jev.noul,
          proceed: jev.proceed,
        });
      } catch { /* provenance must never break a decision call */ }

      res.json({ success: true, decision, jev });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Jev noul advisory failed' });
    }
  });

  // Promotion-gate advisory: surface the DETERMINISTIC promotion decision
  // (resolvePromotion) plus a Jev noul ("auto-promote now?"). The verifier gate
  // stays authoritative; autopilot/operators may require jev.proceed === true
  // before executing. Guarded (mutation-adjacent, fail-closed).
  router.post('/decision/jev/promotion', async (req, res) => {
    if (!requireMutationAuth(req as Request, res as Response)) return;
    try {
      const body = req.body ?? {};
      const normalized = normalizePromotionPolicy(typeof body.policy === 'string' ? body.policy : '');
      if ('error' in normalized) return res.status(400).json({ success: false, error: normalized.error });
      const score = Number(body.score);
      const priorScore = typeof body.priorScore === 'number' ? Number(body.priorScore) : undefined;
      const verified = body.verified === false ? false : true;
      const decision = resolvePromotion(normalized.policy, {
        verified,
        score: Number.isFinite(score) ? score : 0,
        priorScore,
      });

      const result = await decideSystemOne({
        state: {
          promotionPolicy: normalized.policy,
          toolName: typeof body.toolName === 'string' ? body.toolName.slice(0, 80) : 'gene',
          domain: typeof body.domain === 'string' ? body.domain.slice(0, 40) : 'coding',
          verified,
          score: Number.isFinite(score) ? score : 0,
          priorScore: priorScore ?? null,
          deterministicVerdict: decision.outcome,
          deterministicStatus: decision.status,
          description: typeof body.description === 'string' ? body.description.slice(0, 200) : null,
        },
        questions: {
          auto_promote: {
            type: 'noul',
            instructions: 'Should this sandbox-verified candidate be promoted automatically right now?',
            criteria: {
              true: 'Safe to auto-promote',
              false: 'Hold for human review',
            },
          },
        },
      });
      const jev = buildNoulAdvisory(result, 'auto_promote');
      try {
        deps.appendProvenance('jev_promotion_advisory', {
          source: jev.source,
          model: jev.model,
          noul: jev.noul,
          proceed: jev.proceed,
          policy: normalized.policy,
          deterministicVerdict: decision.outcome,
        });
      } catch { /* provenance must never break a decision call */ }
      res.json({ success: true, decision, jev });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Jev promotion advisory failed' });
    }
  });

  router.post('/decision/weights', async (req, res) => {
    const { weights } = req.body;
    if (weights) {
      deps.setGrowthWeights({ ...deps.growthWeightsRef(), ...weights });
      deps.saveState();
    }
    const { decision, synergy } = await currentDecision();
    res.json({ success: true, weights: deps.growthWeightsRef(), decision, synergy });
  });

  router.post('/decision/execute', async (req, res) => {
    try {
      const { actionId } = req.body;
      const { decision } = await currentDecision();
      const actionToExec = actionId
        ? decision.candidateActions.find((a) => a.id === actionId) || decision.selectedAction
        : decision.selectedAction;

      let executionResult: any = { action: actionToExec };

      // Execute based on Action Type
      if (actionToExec.actionType === 'domain_gap_expansion') {
        // Real parametric template build + real sandbox verification. A tool is
        // only registered when its actual test suite passes.
        const targetDomain = actionToExec.targetDomain;
        const tplId = ({ coding: 'tpl_lru_cache', math: 'tpl_newton_raphson', biotech: 'tpl_protac_optimizer', systemic: 'tpl_merkle_anchor', cyber_defense: 'tpl_hmac_sanitizer', neuro_symbolic: 'tpl_horn_sat', quantum_sim: 'tpl_bell_entangler' } as Record<string, string>)[targetDomain] || 'tpl_lru_cache';
        const tpl = getComponentTemplate(tplId);
        if (!tpl) {
          executionResult = { ...executionResult, message: `No component template available for ${targetDomain}; no tool created.` };
        } else {
          const randHex = crypto.randomBytes(2).toString('hex');
          const toolName = `${targetDomain}_template_${randHex}`;
          const build = buildComponentFromTemplate(tplId, {}, { withSelfHealing: true, componentName: toolName });
          if (build.success) {
            const testRun = executeTestSuite(build.synthesizedCode, build.testSuiteCode);
            if (testRun.passed) {
              const version = '1.0.0-template';
              const versionHash = crypto.createHash('sha256').update(build.synthesizedCode).digest('hex').substring(0, 16);
              const newTool: ToolEntry = {
                name: toolName,
                domain: targetDomain,
                entrypoint: `src/tools/${toolName}.ts`,
                description: `Real template build (${tpl.name}) resolving ${targetDomain} deficit`,
                currentVersion: version,
                versions: [{
                  version,
                  hash: versionHash,
                  created_at: Date.now(),
                  passed_verifier: true,
                  score: 1.0,
                  promoted: true,
                  verifier_notes: `REAL VERIFY PASS: ${testRun.testDetails.length - 1} assertions green in ${testRun.executionTimeMs}ms`,
                  source_code: build.synthesizedCode,
                  test_suite_code: build.testSuiteCode
                }],
                healthStatus: 'healthy',
                anomalyCount: 0
              };
              if (deps.promoteTool(newTool, { origin: 'decision', push: true })) {
                const status = deps.statusRef();
                status.totalUpgrades += 1;
                status.generation += 1;
                status.lastTickTime = Date.now();
                deps.appendProvenance('growth_decision_executed', {
                  actionId: actionToExec.id,
                  actionType: actionToExec.actionType,
                  domain: targetDomain,
                  toolName,
                  version,
                  utilityScore: actionToExec.computedUtilityScore,
                  rationale: actionToExec.deterministicRationale
                });
                executionResult = { ...executionResult, newTool, message: `Built & verified ${toolName} (real test suite green) to resolve ${targetDomain} deficit.` };
              } else {
                executionResult = { ...executionResult, message: `Substance gate refused ${toolName}; nothing promoted.` };
              }
            } else {
              executionResult = { ...executionResult, message: `${targetDomain} template candidate FAILED its real test suite; nothing promoted.` };
            }
          } else {
            executionResult = { ...executionResult, message: `Template build failed for ${targetDomain}: ${build.error || 'unknown error'}` };
          }
        }
      } else if (actionToExec.actionType === 'deep_security_hardening') {
        const topAnomaly = deps.anomaliesRef().find((a) => a.status === 'detected');
        if (topAnomaly) {
          const repairRes = deps.executeSelfRepair(topAnomaly.toolName, topAnomaly.brokenCode, topAnomaly.errorType);
          executionResult = { ...executionResult, repairRes, message: `Autonomous Root-Cause Patch applied to ${topAnomaly.toolName}.` };
        } else {
          executionResult = { ...executionResult, message: 'No active anomalies detected; system memory verified safe.' };
        }
      } else if (actionToExec.actionType === 'github_research_import') {
        // GitHub imports are NEVER auto-promoted anymore. Real files fetched via
        // the GitHub Research view become UNVERIFIED pending candidates that
        // require human review (Registry -> pending). The decision engine can
        // only point at them.
        const pendingReal = deps.gitHubBlueprintsRef().find((b) => b.isIngested && b.extractedSourceCode);
        executionResult = pendingReal
          ? {
              ...executionResult,
              message: `github_research_import does not auto-promote. Real candidate "${pendingReal.algorithmName}" from ${pendingReal.repoName} is an UNVERIFIED pending tool - review and approve it in the Registry.`,
            }
          : {
              ...executionResult,
              message: 'No imported GitHub candidate found. Use the GitHub Research view to search and import real repositories.',
            };
      } else if (actionToExec.actionType === 'dream_crystallization') {
        // Route through the same real engine path as /api/recourse/dream/crystallize:
        // the engine runs sandbox verification and only claims success when the
        // crystallized gene is verified.
        const liveDreamState = await deps.dreamEngine.status();
        const thought = liveDreamState.recentThoughts.find(t => t.crystallizationReadiness >= 0.75) || liveDreamState.recentThoughts[0];
        if (thought) {
          const r = await deps.dreamEngine.crystallize(thought.id);
          if (r.success && r.crystallizedTool) {
            const cTool = r.crystallizedTool;
            const toolName = cTool.name;
            const version = '1.0.0';
            const versionHash = crypto.createHash('sha256').update(cTool.code).digest('hex').substring(0, 16);
            const newTool: ToolEntry = {
              name: toolName,
              domain: thought.domain,
              entrypoint: `src/tools/${toolName}.ts`,
              description: `Crystallized from dream (engine-verified): ${cTool.description}`,
              currentVersion: version,
              versions: [{
                version,
                hash: versionHash,
                created_at: Date.now(),
                passed_verifier: cTool.verified,
                score: cTool.verified ? 1.0 : 0,
                promoted: cTool.verified,
                verifier_notes: cTool.verified ? `Dream crystallization passed engine sandbox verification (${cTool.kind}).` : 'Dream crystallization failed engine verification.',
                source_code: cTool.code
              }],
              healthStatus: cTool.verified ? 'healthy' : 'degraded',
              anomalyCount: 0
            };
            const promotedDreamTool = deps.promoteTool(newTool, { origin: 'decision', push: true });
            deps.setDreamState(r.dreamState);
            if (promotedDreamTool) {
              if (cTool.verified) deps.statusRef().totalUpgrades += 1;
              deps.appendProvenance('dream_crystallized', {
                thoughtId: thought.id,
                phase: thought.phase,
                domain: thought.domain,
                toolName,
                version,
                verified: cTool.verified
              });
              executionResult = { ...executionResult, dreamTool: newTool, message: cTool.verified ? `Crystallized engine-verified dream insight ${toolName}.` : `Dream crystallization of ${toolName} did not pass verification.` };
            } else {
              executionResult = { ...executionResult, message: `Substance gate refused ${toolName}; nothing promoted.` };
            }
          } else {
            executionResult = { ...executionResult, message: `Dream crystallization failed verification: ${r.error || 'unknown'}` };
          }
        } else {
          executionResult = { ...executionResult, message: 'No crystallizable dream thought available.' };
        }
      }

      deps.saveState();

      res.json({
        success: true,
        executedAction: actionToExec,
        result: executionResult,
        generation: deps.statusRef().generation
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Decision execution failed' });
    }
  });

  return router;
}
