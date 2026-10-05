/**
 * learn.ts — recursive learner routes (status/episode/run/replay/directives,
 * synthesize-directive) plus the registry-op helpers the docs group here
 * (crossover, human approve, verify, evolve) extracted from `server.ts`.
 *
 * Verifier/sandbox/template/model primitives are pure lib imports. The learner
 * instance, registry/status mutation, lint gate, fleet signal, and provenance
 * side effects stay host-side and are injected.
 */
import crypto from 'crypto';
import { Router } from 'express';
import {
  verifyCodingCode,
  verifySystemicCode,
  verifyMathCode,
  verifyBiotechClaim,
  verifyNeuroSymbolicCode,
  verifyCyberDefenseCode,
  verifyQuantumSimCode,
} from '../lib/verifiers.js';
import { executeTestSuite } from '../lib/executionSandbox.js';
import { biotechClaimExtra } from '../lib/contracts.js';
import { mergeFleetBeliefs } from '../lib/fleetSignal.js';
import { nextGenerationTarget } from '../lib/learnerGenerationPlan.js';
import { assessForgeCandidate } from '../lib/forgeQuality.js';
import {
  getComponentTemplate,
  buildComponentFromTemplate,
  selectTemplateForLearnerDirective,
  COMPONENT_TEMPLATES,
} from '../lib/componentTemplates.js';
import { checkOnline as modelCheckOnline, extractJsonBlock } from '../lib/modelProvider.js';
import { skillAwareChat } from '../lib/skillContext.js';
import type { RecursiveLearner } from '../dream/learner.js';
import type { LintReport } from '../lib/lintGate.js';
import type {
  ToolDomain,
  ToolEntry,
  SystemStatus,
  VerifierResult,
  BiotechClaim,
} from '../types.js';

export interface LearnRouterDeps {
  learner: RecursiveLearner;
  openhubFleetSignal(): Promise<{
    beliefs: unknown;
    degraded: boolean;
  }>;
  realSystemReward(): number;
  currentProviderStatus(): { model: string; baseUrl: string };
  gateWithLint(sourceCode: string): { allowed: boolean; lint: LintReport };
  lintVerdictNote(lint: LintReport): string;
  executeSelfRepair(
    toolName: string,
    brokenCode: string,
    faultHint?: string,
    testSuite?: string,
  ): { success: boolean; healedTool: ToolEntry; anomaly: unknown; version: string };
  registryRef(): ToolEntry[];
  statusRef(): SystemStatus;
  promoteTool(entry: ToolEntry, opts: { origin: string; gate?: boolean; push?: boolean }): boolean;
  appendProvenance(eventType: string, data: Record<string, unknown>): unknown;
  saveState(): void;
}

export function createLearnRouter(deps: LearnRouterDeps): Router {
  const router = Router();

  // Execute Self-Learning Directive to synthesize a template component
  router.post('/learn/synthesize-directive', async (req, res) => {
    try {
      const { directiveId } = req.body;
      const learnerState = await deps.learner.status();

      // Close the loop: fold OpenHub's latest self-report (fleet memory) into the
      // learner's beliefs, and — when OpenHub reports itself degraded — rank the
      // systemic domain first so generation targets the fleet's weak spot.
      const fleet = await deps.openhubFleetSignal();
      const planningState = mergeFleetBeliefs(learnerState, fleet.beliefs as any);
      const plan = nextGenerationTarget(planningState, {
        priorityDomains: fleet.degraded ? (['systemic'] as const) : [],
      });
      let targetDirective = directiveId
        ? planningState.directives.find((d) => d.id === directiveId)
        : plan ? planningState.directives.find((d) => d.targetDomain === plan.domain) : undefined;

      if (!targetDirective && plan) {
        // No directive exists for the target yet — synthesize one from the plan.
        // Action/reason come from the learner's own beliefs; nothing is invented.
        targetDirective = {
          id: `plan_${plan.domain}_${plan.action}`,
          kind: plan.action === 'amplify' ? 'amplify' : plan.action === 'refine' ? 'refine' : 'synthesize_template',
          geneName: `${plan.domain}_template_archetype`,
          reason: plan.reason,
          episode: learnerState.episode,
          targetDomain: plan.domain,
        } as any;
      }

      if (!targetDirective && learnerState.directives.length > 0) {
        targetDirective = learnerState.directives.find((d) => d.kind === 'synthesize_template' || d.kind === 'amplify') || learnerState.directives[0];
      }

      if (!targetDirective) {
        return res.json({ success: false, message: 'No active learner directives available for template synthesis' });
      }

      const targetDomain: ToolDomain = (targetDirective.targetDomain as ToolDomain) || plan?.domain || 'coding';
      // Prefer any template the directive names; otherwise let the synthesize-
      // aware selector choose for the action + domain (e.g. the WEAKEST template
      // when the learner flagged a domain deficit, rather than a fixed one that
      // may already be strong).
      const tpl = (targetDirective.templateId ? getComponentTemplate(targetDirective.templateId) : undefined)
        || selectTemplateForLearnerDirective(targetDirective.kind, targetDomain)
        || Object.values(COMPONENT_TEMPLATES)[0];

      const compName = `learner_${targetDomain}_${tpl.id.replace('tpl_', '')}_${Date.now().toString().slice(-4)}`;
      const buildResult = buildComponentFromTemplate(tpl.id, {}, {
        withSelfHealing: true,
        componentName: compName,
      });

      if (!buildResult.success) {
        return res.json({ success: false, message: `Template build failed: ${buildResult.error || 'unknown'}` });
      }

      // Real regression run before anything is registered.
      const testRun = executeTestSuite(buildResult.synthesizedCode, buildResult.testSuiteCode);
      if (!testRun.passed) {
        return res.json({
          success: false,
          message: `Directive synthesis produced code that FAILS its real test suite (${testRun.testDetails.filter((d) => d.startsWith('[FAIL')).length} failures). Nothing was registered.`,
        });
      }

      const versionHash = crypto.createHash('sha256').update(buildResult.synthesizedCode).digest('hex').substring(0, 16);
      const newToolEntry: ToolEntry = {
        name: compName,
        domain: targetDomain,
        entrypoint: `src/tools/${compName}.ts`,
        description: `Synthesized from Learner Directive: ${targetDirective.reason}`,
        versions: [
          {
            version: '1.0.0-learned',
            hash: versionHash,
            created_at: Date.now(),
            passed_verifier: true,
            score: 1.0,
            promoted: true,
            verifier_notes: `REAL VERIFY PASS (${testRun.testDetails.length - 1} assertions green) via Directive [${targetDirective.kind}]`,
            source_code: buildResult.synthesizedCode,
            test_suite_code: buildResult.testSuiteCode,
          },
        ],
        currentVersion: '1.0.0-learned',
        healthStatus: 'healthy',
        anomalyCount: 0,
      };

      const promotedLearn = deps.promoteTool(newToolEntry, { origin: 'learn' });
      if (promotedLearn) {
        deps.statusRef().registeredToolsCount = deps.registryRef().length;
        deps.statusRef().totalUpgrades += 1;

        // Log provenance
        deps.appendProvenance('self_learning_directive_applied', {
          directiveId: targetDirective.id,
          directiveKind: targetDirective.kind,
          reason: targetDirective.reason,
          templateId: tpl.id,
          toolName: compName,
          domain: targetDomain,
          hash: versionHash,
        });

        deps.saveState();
      }

      res.json({
        success: true,
        promoted: promotedLearn,
        directive: targetDirective,
        synthesizedTool: newToolEntry,
        buildResult,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Multi-Gene Genetic Crossover Synthesizer
  router.post('/crossover', (req, res) => {
    const { parentGeneA, parentGeneB, targetDomain = 'cyber_defense', hybridName } = req.body;

    const registry = deps.registryRef();
    const toolA = registry.find((t) => t.name === parentGeneA);
    const toolB = registry.find((t) => t.name === parentGeneB);

    const hybridToolName = hybridName || `crossover_${(toolA?.name || 'geneA').slice(0, 8)}_${(toolB?.name || 'geneB').slice(0, 8)}_${crypto.randomBytes(2).toString('hex')}`;
    const codeA = toolA?.versions[toolA.versions.length - 1]?.source_code || '';
    const codeB = toolB?.versions[toolB.versions.length - 1]?.source_code || '';

    const hybridSource = `// Genetic Recombination Crossover (${toolA?.domain || 'A'} x ${toolB?.domain || 'B'})\n// Parent A: ${toolA?.name || 'geneA'}\n// Parent B: ${toolB?.name || 'geneB'}\n\n${codeA}\n\n${codeB}\n\n// Recombined Hybrid Interface\nexport class RecombinedGenome {\n  executeHybrid() { return { parentA: '${toolA?.name || ''}', parentB: '${toolB?.name || ''}', status: 'functional' }; }\n}`;
    const hybridVersion = `1.0.0-hybrid`;
    const versionHash = crypto.createHash('sha256').update(hybridSource).digest('hex').substring(0, 16);

    // Honest structural verification: the combined source must compile and the
    // recombination shim must execute with the real parent names. This verifies
    // structure, not semantics - the notes say exactly that.
    const hybridSuite = `const g = new RecombinedGenome();\nassert typeof g.executeHybrid === 'function';\nconst h = g.executeHybrid();\nassert h.parentA === '${toolA?.name || ''}';\nassert h.parentB === '${toolB?.name || ''}';\nassert h.status === 'functional';`;
    const testRun = executeTestSuite(hybridSource, hybridSuite);
    const verified = testRun.passed;

    const hybridEntry: ToolEntry = {
      name: hybridToolName,
      domain: targetDomain as ToolDomain,
      entrypoint: `src/tools/${hybridToolName}.ts`,
      description: `Genetic crossover hybrid uniting ${toolA?.name || 'Gene A'} with ${toolB?.name || 'Gene B'}`,
      currentVersion: verified ? hybridVersion : undefined,
      healthStatus: verified ? 'healthy' : 'degraded',
      versions: [
        {
          version: hybridVersion,
          hash: versionHash,
          created_at: Date.now(),
          passed_verifier: verified,
          score: verified ? 1.0 : 0,
          promoted: verified,
          verifier_notes: verified
            ? `STRUCTURAL HYBRID VERIFIED (compiles; shim executes): ${testRun.testDetails.length - 1} assertions green. Parent semantics NOT re-verified.`
            : `HYBRID NOT VERIFIED: combined source failed its structural suite (${testRun.testDetails.filter((d) => d.startsWith('[FAIL')).length} failures).`,
          source_code: hybridSource,
          test_suite_code: hybridSuite,
        },
      ],
    };

    // A hybrid whose structural suite failed is recorded but NOT promoted.
    const promotedCrossover = verified ? deps.promoteTool(hybridEntry, { origin: 'crossover' }) : false;
    if (promotedCrossover) {
      const status = deps.statusRef();
      if (verified) {
        status.totalUpgrades += 1;
      }
      status.generation += 1;

      deps.appendProvenance('gene_crossover', {
        hybridTool: hybridToolName,
        parentA: toolA?.name,
        parentB: toolB?.name,
        domain: targetDomain,
        version: hybridVersion,
        hash: versionHash,
        verified,
      });

      deps.saveState();
    }

    res.json({
      success: true,
      promoted: promotedCrossover,
      hybridTool: hybridEntry,
      verified,
      generation: deps.statusRef().generation,
    });
  });

  router.post('/approve', (req, res) => {
    const { toolName, version, force } = req.body;
    const tool = deps.registryRef().find((t) => t.name === toolName);
    if (!tool) {
      return res.status(404).json({ error: 'Tool not found' });
    }

    const pendingIndex = (tool.pendingVersions || []).findIndex((v) => v.version === version);
    if (pendingIndex === -1) {
      return res.status(404).json({ error: 'Pending version not found' });
    }

    const [approvedVersion] = tool.pendingVersions!.splice(pendingIndex, 1);

    // Human approval is an override, not a bypass: the stored suite must actually
    // pass and the source must clear the quality gate. This is the shared
    // promotion terminus for GitHub imports (no suite) and evolve's
    // pending_approval, so an unguarded promote here promotes unverified code.
    let gateReason = '';
    if (approvedVersion.source_code && approvedVersion.test_suite_code) {
      const verify = executeTestSuite(approvedVersion.source_code, approvedVersion.test_suite_code);
      const safeName = String(toolName).replace(/[^A-Za-z0-9_$]/g, '_');
      const isClass = new RegExp(`class\\s+${safeName}\\b`).test(approvedVersion.source_code);
      const quality = assessForgeCandidate(
        { name: toolName, refSuite: approvedVersion.test_suite_code, kind: isClass ? 'class' : 'function' },
        approvedVersion.source_code,
      );
      if (!verify.passed) {
        gateReason = `stored suite failed (${verify.testDetails.filter((d) => d.startsWith('[FAIL')).length} failure(s))`;
      } else if (!quality.gate.ok) {
        gateReason = `quality gate: ${quality.gate.reasons.join('; ')}`;
      }
    } else {
      gateReason = 'no test suite stored on the pending version';
    }

    if (gateReason && force !== true) {
      // Put it back — a refused approval changes nothing.
      tool.pendingVersions!.splice(pendingIndex, 0, approvedVersion);
      return res.status(422).json({
        success: false,
        error: `refusing to promote ${toolName}@${version}: ${gateReason}. Re-send with force:true to override (recorded in provenance).`,
      });
    }

    approvedVersion.promoted = true;

    tool.versions.push(approvedVersion);
    tool.currentVersion = approvedVersion.version;

    const event = deps.appendProvenance('tool_human_approved', {
      tool: toolName,
      version: approvedVersion.version,
      hash: approvedVersion.hash,
      score: approvedVersion.score,
      verifier_notes: approvedVersion.verifier_notes,
      forced: gateReason ? true : false,
      ...(gateReason ? { gate_bypassed: gateReason } : {}),
    });

    deps.statusRef().totalUpgrades += 1;
    deps.saveState();
    res.json({ success: true, tool, approvedVersion, event, forced: !!gateReason });
  });

  router.post('/verify', (req, res) => {
    const { domain, sourceCode, testSuiteCode, extra } = req.body;

    let verifierResult: VerifierResult;

    if (domain === 'coding' || domain === 'systemic') {
      verifierResult = (domain === 'systemic' ? verifySystemicCode : verifyCodingCode)(sourceCode || '', testSuiteCode || '');
    } else if (domain === 'math') {
      const testCases = extra?.testCases || [
        { args: [1, -5, 6], expected: 5 },
        { args: [2, 8, -10], expected: -4 },
      ];
      verifierResult = verifyMathCode(sourceCode || '', extra?.funcName || 'sumOfRoots', testCases, extra?.symbolicExpr);
    } else if (domain === 'biotech') {
      const claimExtra = biotechClaimExtra.safeParse(extra ?? {});
      if (!claimExtra.success) {
        return res.status(400).json({
          success: false,
          error: 'invalid biotech claim payload',
          issues: claimExtra.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      }
      const e = claimExtra.data;
      const claim: BiotechClaim = {
        asset_name: e.asset_name || 'CandidateAsset',
        mechanism: e.mechanism || '',
        leg: (e.leg ?? '') as BiotechClaim['leg'],
        evidence_tier: e.evidence_tier ?? 0,
        source: e.source || '',
      };
      verifierResult = verifyBiotechClaim(claim);
    } else if (domain === 'neuro_symbolic') {
      verifierResult = verifyNeuroSymbolicCode(sourceCode || '', testSuiteCode || '');
    } else if (domain === 'cyber_defense') {
      verifierResult = verifyCyberDefenseCode(sourceCode || '', testSuiteCode || '');
    } else if (domain === 'quantum_sim') {
      verifierResult = verifyQuantumSimCode(sourceCode || '', testSuiteCode || '');
    } else {
      verifierResult = {
        passed: false,
        summary: 'FAILED (Unknown domain)',
        details: [`Domain "${domain}" is not a recognized ToolDomain.`],
        score: 0.0,
      };
    }

    res.json({ result: verifierResult });
  });

  // AI Self-Evolver via the configured open-source model provider
  // (OpenAI-compatible: local Spark model or remote API).
  // No canned fallbacks exist: if the model is offline the request reports
  // model_unavailable and NOTHING is added to the registry. A mutation only
  // reaches the registry after its source code passes the real sandbox verifier.
  router.post('/evolve', async (req, res) => {
    try {
      const { domain = 'coding', promptInstructions, targetToolName, policy = deps.statusRef().activePolicy } = req.body;
      if (!promptInstructions || typeof promptInstructions !== 'string' || promptInstructions.trim().length < 4) {
        return res.status(400).json({ error: 'promptInstructions is required' });
      }
      if (!['coding', 'math', 'biotech', 'systemic', 'neuro_symbolic', 'cyber_defense', 'quantum_sim'].includes(domain)) {
        return res.status(400).json({ error: 'unknown domain: ' + domain });
      }

      const online = await modelCheckOnline(false);
      if (!online) {
        return res.json({
          success: false,
          outcome: 'model_unavailable',
          message: 'No model provider reachable at ' + deps.currentProviderStatus().baseUrl + '. Configure API_MODEL_BASE_URL / API_MODEL_NAME.',
        });
      }

      const toolName = (targetToolName || `gene_${domain}_${Date.now().toString(36)}`).replace(/[^a-zA-Z0-9_$]/g, '_');
      const domainList = domain === 'biotech' ? 'biotech (return an asset JSON with asset_name/mechanism/leg/evidence_tier/source)' : domain;
      const systemPrompt = `You are Recourse's mutation engine. You write PLAIN JAVASCRIPT (no TypeScript, no imports) that is runnable in an isolated Node sandbox.
Return ONLY valid JSON with this exact shape:
{
  "description": "one sentence",
  "sourceCode": "plain javascript, pure and deterministic",
  "testSuiteCode": "a short test body using lines starting with assert that call the real functions you wrote"
}
You are producing a candidate for domain: ${domainList}. Tool name will be: ${toolName}.
Write honest tests that would fail if the function were wrong. Do not reference undeclared variables.`;

      const result = await skillAwareChat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: promptInstructions },
        ],
        { temperature: deps.statusRef().hyperParams?.mutationTemperature ?? 0.2, json: true },
      );

      if (!result.ok) {
        return res.json({ success: false, outcome: result.status === 'offline' ? 'model_unavailable' : 'model_error', message: result.error });
      }

      let parsed: any = null;
      const block = extractJsonBlock(result.content);
      if (block) {
        try {
          parsed = JSON.parse(block);
        } catch (err: any) {
          return res.json({ success: false, outcome: 'model_error', message: 'Model returned non-JSON output: ' + (err?.message || 'parse failed') });
        }
      } else {
        return res.json({ success: false, outcome: 'model_error', message: 'Model returned no usable JSON payload' });
      }

      if (!parsed || typeof parsed.sourceCode !== 'string' || parsed.sourceCode.trim().length < 20) {
        return res.json({ success: false, outcome: 'model_error', message: 'Model output missing usable sourceCode' });
      }

      const description = (parsed.description || 'Autonomous mutation').toString();
      const suite = typeof parsed.testSuiteCode === 'string' && parsed.testSuiteCode.trim() ? parsed.testSuiteCode : 'assert true;';

      // Real sandbox verification by domain
      let verifierResult: VerifierResult;
      if (domain === 'biotech') {
        try {
          const claim = typeof parsed.sourceCode === 'string' ? JSON.parse(parsed.sourceCode) : null;
          verifierResult = verifyBiotechClaim(claim);
        } catch {
          verifierResult = { passed: false, summary: 'FAILED (biotech payload is not valid JSON claim)', details: [], score: 0 };
        }
      } else if (domain === 'math') {
        const funcName = /sumOfRoots|solveQuadraticVieta/.test(parsed.sourceCode) ? 'sumOfRoots' : 'execute';
        verifierResult = verifyMathCode(parsed.sourceCode, funcName, [{ args: [1, -5, 6], expected: 5 }, { args: [2, 8, -10], expected: -4 }]);
      } else {
        verifierResult = (domain === 'systemic' ? verifySystemicCode : domain === 'coding' ? verifyCodingCode : domain === 'neuro_symbolic' ? verifyNeuroSymbolicCode : domain === 'cyber_defense' ? verifyCyberDefenseCode : verifyQuantumSimCode)(parsed.sourceCode, suite);
      }

      const status = deps.statusRef();
      status.generation += 1;
      status.lastTickTime = Date.now();

      // Real open-source lint gate on code domains once the sandbox passes.
      let lintReport: LintReport | null = null;
      if (domain !== 'biotech' && verifierResult.passed) {
        const gate = deps.gateWithLint(parsed.sourceCode);
        lintReport = gate.lint;
      }

      let outcome: 'promoted' | 'rejected' | 'held_back' | 'pending_approval' = 'promoted';

      // No independent oracle exists for a chat-evolved tool: run the same
      // quality checks the forge uses before anything can auto-promote. The
      // model authors both the code and its test suite, so a self-authored suite
      // ALONE must never promote code.
      const quality = verifierResult.passed && (!lintReport || lintReport.clean)
        ? assessForgeCandidate({ name: toolName, refSuite: suite }, parsed.sourceCode)
        : null;
      const qualityReasons = quality && !quality.gate.ok ? quality.gate.reasons : [];

      if (!verifierResult.passed) {
        outcome = 'rejected';
        if (status.selfRepair.isAutoHealingEnabled) {
          setTimeout(() => { deps.executeSelfRepair(toolName, parsed.sourceCode, verifierResult.detectedFault, suite); }, 100);
        }
      } else if (lintReport && !lintReport.clean) {
        outcome = 'rejected';
      } else if (qualityReasons.length) {
        outcome = 'rejected';
      } else if (policy === 'human_approval' || domain === 'biotech') {
        outcome = 'pending_approval';
      } else if (policy === 'strict_improve' || policy === 'non_regressing') {
        const registry = deps.registryRef();
        const existing = registry.find((r) => r.name === toolName);
        const currentScore = existing?.versions?.find((v) => v.promoted)?.score ?? 0;
        const regresses = policy === 'strict_improve' ? verifierResult.score <= currentScore : verifierResult.score < currentScore;
        if (existing && currentScore > 0 && regresses) outcome = 'held_back';
      }

      const versionHash = crypto.createHash('sha256').update(parsed.sourceCode).digest('hex').substring(0, 16);
      const version = '1.0.0';
      const versionObj = {
        version,
        hash: versionHash,
        created_at: Date.now(),
        passed_verifier: verifierResult.passed,
        score: verifierResult.score,
        promoted: outcome === 'promoted',
        verifier_notes: verifierResult.summary + (lintReport ? ' | ' + deps.lintVerdictNote(lintReport) : '') + (qualityReasons.length ? ' | quality: ' + qualityReasons.join('; ') : ''),
        source_code: parsed.sourceCode,
        test_suite_code: domain === 'biotech' ? undefined : suite,
      };

      const registry = deps.registryRef();
      let toolEntry = registry.find((r) => r.name === toolName);
      if (!toolEntry) {
        toolEntry = {
          name: toolName,
          domain: domain as ToolDomain,
          entrypoint: `src/tools/${toolName}.ts`,
          description: description.slice(0, 160),
          versions: [],
          pendingVersions: [],
          healthStatus: 'healthy',
          anomalyCount: 0,
        };
        registry.push(toolEntry);
      }

      if (outcome === 'promoted') {
        toolEntry.versions.push(versionObj);
        toolEntry.currentVersion = version;
        toolEntry.healthStatus = 'healthy';
        status.totalUpgrades += 1;
      } else if (outcome === 'pending_approval') {
        toolEntry.pendingVersions = toolEntry.pendingVersions || [];
        toolEntry.pendingVersions.push(versionObj);
      } else {
        toolEntry.versions.push(versionObj);
        toolEntry.healthStatus = toolEntry.versions.some((v) => v.promoted) ? 'healthy' : 'degraded';
      }

      deps.appendProvenance('tool_verification', {
        tool: toolName,
        domain,
        version,
        hash: versionHash,
        passed: verifierResult.passed,
        score: verifierResult.score,
        summary: verifierResult.summary,
        outcome,
      });

      deps.saveState();

      res.json({
        success: true,
        generation: deps.statusRef().generation,
        outcome,
        toolName,
        version,
        versionHash,
        verifierResult,
      });
    } catch (err: any) {
      console.error('Error in evolve route:', err);
      res.status(500).json({ error: err.message || 'Evolution failed' });
    }
  });

  // --------------------------------------------------------------------------
  // Recursive learner loop routes
  // --------------------------------------------------------------------------
  router.get('/learn/status', async (_req, res) => {
    try {
      const state = await deps.learner.status();
      const beliefs = Object.values(state.geneBeliefs).sort((a, b) => b.weight - a.weight);
      res.json({
        success: true,
        state: {
          episode: state.episode,
          meta: state.meta,
          selfScore: state.selfScore,
          meanAbsSurprise: state.meanAbsSurprise,
          brierScore: state.brierScore,
          ece: state.ece,
          selfEce: state.selfEce,
          ledgerHead: state.ledgerHead,
          updatedAt: state.updatedAt,
          geneCount: beliefs.length,
          topGenes: beliefs.slice(0, 10).map((b) => ({
            geneName: b.geneName,
            domain: b.domain,
            attempts: b.attempts,
            meanReward: b.meanReward,
            weight: b.weight,
            posteriorMean: Number((b.alpha / (b.alpha + b.beta)).toFixed(4)),
          })),
          directives: state.directives,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/learn/episode', async (req, res) => {
    try {
      const explicit = Number(req.query.externalScore ?? req.body?.externalScore);
      // Default to the real blended capability/outcome reward rather than the
      // learner's self-score, so an HTTP-triggered episode is driven by the same
      // measured signal as the server tick. Callers may override explicitly.
      const externalScore = Number.isFinite(explicit) ? explicit : deps.realSystemReward();
      const report = await deps.learner.runEpisode(externalScore);
      res.json({ success: true, externalScore, report });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/learn/run', async (req, res) => {
    try {
      const raw = Number(req.query.episodes ?? req.body?.episodes ?? 5);
      const episodes = Number.isFinite(raw) ? Math.max(1, Math.min(50, Math.floor(raw))) : 5;
      const explicit = Number(req.query.externalScore ?? req.body?.externalScore);
      const externalScore = Number.isFinite(explicit) ? explicit : deps.realSystemReward();
      const reports: Awaited<ReturnType<RecursiveLearner['runEpisode']>>[] = [];
      for (let i = 0; i < episodes; i++) reports.push(await deps.learner.runEpisode(externalScore));
      res.json({ success: true, episodesRun: reports.length, externalScore, reports });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/learn/replay', async (_req, res) => {
    try {
      const replay = await deps.learner.replayFromGenesis();
      res.json({ success: true, replay });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/learn/directives', async (_req, res) => {
    try {
      const state = await deps.learner.status();
      res.json({ success: true, directives: state.directives });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
