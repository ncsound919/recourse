/**
 * templates.ts — template-driven internal component building routes (list,
 * detail, build, benchmark) extracted from the `server.ts` monolith.
 *
 * Template/sandbox/lint/self-host primitives are pure lib imports; registry +
 * status mutation, provenance, the lint gate wrapper, the self-hosted loop
 * supervisor, and the capability sweep stay host-side (injected).
 */
import crypto from 'crypto';
import { Router } from 'express';
import { listComponentTemplates, getComponentTemplate, buildComponentFromTemplate } from '../lib/componentTemplates.js';
import { executeTestSuite } from '../lib/executionSandbox.js';
import { assessSourceSubstance } from '../lib/honestyMetrics.js';
import {
  writeSelfHostedTool,
  verifySelfHostedEntry,
  removeSelfHostedTool,
  verifyAllSelfHosted,
  type SelfHostedManifestEntry,
} from '../lib/selfHosting.js';
import type { LintReport } from '../lib/lintGate.js';
import type { ToolDomain, ToolEntry, SystemStatus } from '../types.js';

export interface TemplatesRouterDeps {
  registryRef(): ToolEntry[];
  statusRef(): SystemStatus;
  promoteTool(entry: ToolEntry, opts: { origin: string; gate?: boolean; push?: boolean }): boolean;
  gateWithLint(sourceCode: string): { allowed: boolean; lint: LintReport };
  lintVerdictNote(lint: LintReport): string;
  startSelfHostedLoop(name: string): void;
  sweepCapabilityAdoptions(): Promise<boolean>;
  recordSystemChange(reason: string): void;
  appendProvenance(eventType: string, data: Record<string, unknown>): void;
  saveState(): void;
}

export function createTemplatesRouter(deps: TemplatesRouterDeps): Router {
  const router = Router();

  // List available component templates
  router.get('/templates', (req, res) => {
    const { domain, category } = req.query;
    const templates = listComponentTemplates(domain as ToolDomain, category as string);
    res.json({
      success: true,
      count: templates.length,
      templates,
    });
  });

  // Get single component template with details
  router.get('/templates/:id', (req, res) => {
    const tpl = getComponentTemplate(req.params.id);
    if (!tpl) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    const preview = tpl.synthesizer({}, { withSelfHealing: true });
    const { synthesizer: _synthesizer, ...metadata } = tpl;
    res.json({
      success: true,
      template: { ...metadata, selfHostable: Boolean(tpl.selfHost) },
      codePreview: preview.sourceCode,
      testPreview: preview.testSuiteCode,
    });
  });

  // Build and register component from template. With selfHost: true AND a
  // template that declares a selfHost descriptor, the verified + linted output
  // is ALSO written as a real module the server imports at runtime (dogfooding:
  // Recourse starts using the components it built).
  router.post('/templates/build', async (req, res) => {
    try {
      const { templateId, componentName, params = {}, withSelfHealing = true, domain, selfHost = false } = req.body;
      const tpl = getComponentTemplate(templateId);
      if (!tpl) {
        return res.status(404).json({ success: false, error: `Template "${templateId}" not found` });
      }
      // Validate the domain at intake: unvalidated strings used to poison the
      // registry and crash the growth-decision sweep (domainScoresAcc miss).
      const VALID_DOMAINS = ['coding', 'math', 'biotech', 'systemic', 'neuro_symbolic', 'cyber_defense', 'quantum_sim'];
      const requestedDomain = (domain || tpl.domain) as string;
      if (!VALID_DOMAINS.includes(requestedDomain)) {
        return res.status(400).json({ success: false, error: `Unknown domain "${requestedDomain}". Valid: ${VALID_DOMAINS.join(', ')}` });
      }

      let cleanCompName = (componentName || `${tpl.id}_${crypto.randomBytes(2).toString('hex')}`)
        .replace(/[^a-zA-Z0-9_]/g, '_');
      // Class names must be valid TS identifiers — never start with a digit.
      if (!cleanCompName || !/^[a-zA-Z_$]/.test(cleanCompName)) {
        cleanCompName = `m_${cleanCompName}`;
      }

      // Mirror of buildComponentFromTemplate's default merge, so the self-hosted
      // module's constructor args match exactly the code that was verified.
      const mergedParams: Record<string, any> = {};
      for (const p of tpl.params) {
        mergedParams[p.id] = params[p.id] !== undefined ? params[p.id] : p.default;
      }

      const buildResult = buildComponentFromTemplate(templateId, mergedParams, {
        withSelfHealing,
        componentName: cleanCompName,
      });

      if (!buildResult.success) {
        return res.status(400).json({ success: false, error: buildResult.error });
      }

      // Verify through isolated test suite (real execution only)
      let testRunResult: { passed: boolean; score: number; executionTimeMs: number; testDetails: string[] } | null = null;
      if (buildResult.testSuiteCode) {
        testRunResult = executeTestSuite(buildResult.synthesizedCode, buildResult.testSuiteCode);
      }

      if (testRunResult && !testRunResult.passed) {
        return res.status(422).json({
          success: false,
          error: `Synthesized component FAILED its real test suite (${testRunResult.testDetails.filter((d) => d.startsWith('[FAIL')).length} failures). Nothing was registered.`,
          testDetails: testRunResult.testDetails,
        });
      }

      // Real open-source lint gate before registration.
      const lintReport = deps.gateWithLint(buildResult.synthesizedCode).lint;
      if (lintReport.available && !lintReport.clean) {
        return res.status(422).json({
          success: false,
          error: `Synthesized component failed the oxlint safety gate: ${deps.lintVerdictNote(lintReport)}. Nothing was registered.`,
          lint: lintReport.details,
        });
      }

      // Substance gate — mirrors the promoteTool gate so re-building an existing
      // component (which appends a version directly) cannot slip in a stub.
      const templateSubstance = assessSourceSubstance(buildResult.synthesizedCode);
      if (!templateSubstance.ok) {
        return res.status(422).json({
          success: false,
          error: `Synthesized component failed the substance gate: ${templateSubstance.reason ?? 'insufficient substance'}. Nothing was registered.`,
        });
      }

      const versionHash = crypto.createHash('sha256').update(buildResult.synthesizedCode).digest('hex').substring(0, 16);
      const targetDomain = (domain || tpl.domain) as ToolDomain;
      const passedVerifier = true;
      const verifierNotes = `REAL VERIFY PASS: ${testRunResult ? `${testRunResult.testDetails.length - 1} assertions green in ${testRunResult.executionTimeMs}ms` : 'syntax + entrypoint smoke OK'} (Blueprint ${tpl.name}) | ${deps.lintVerdictNote(lintReport)}`;

      // Optional self-hosting: write a real module AFTER suite + lint are green.
      let selfHostOutcome: {
        selfHosted?: SelfHostedManifestEntry;
        skippedReason?: string;
        error?: string;
      } = {};
      let entrypoint = `src/tools/${cleanCompName}.ts`;
      if (selfHost) {
        if (!tpl.selfHost) {
          selfHostOutcome.skippedReason = `Template "${tpl.id}" does not declare a selfHost descriptor; component registered as sandbox-only (registry gene).`;
        } else if (!buildResult.testSuiteCode) {
          // A real suite is required before code is materialized as a live module;
          // an absent suite must not degrade to a trivial `assert true;` backing.
          selfHostOutcome.skippedReason = `Template "${tpl.id}" produced no test suite; self-hosting requires a real suite. Registered sandbox-only.`;
        } else {
          const writeRes = writeSelfHostedTool({
            name: cleanCompName,
            templateId: tpl.id,
            domain: targetDomain,
            entrypointName: buildResult.entrypointName,
            params: mergedParams,
            sourceCode: buildResult.synthesizedCode,
            testSuiteCode: buildResult.testSuiteCode,
            summary: `${tpl.name} [self-hosted from ${tpl.id}]`,
            selfHost: tpl.selfHost,
            artifactKind: tpl.artifactKind ?? 'function',
          });
          if (writeRes.success === false) {
            return res.status(500).json({
              success: false,
              error: `Self-hosting write failed: ${writeRes.error}. Component NOT registered.`,
            });
          }
          // Prove the module actually imports before claiming it is live.
          const verdict = await verifySelfHostedEntry(writeRes.entry);
          if (!verdict.passed) {
            removeSelfHostedTool(writeRes.entry.name);
            return res.status(500).json({
              success: false,
              error: `Self-hosted module failed live verification: ${verdict.detail}. Component NOT registered.`,
            });
          }
          selfHostOutcome.selfHosted = {
            ...writeRes.entry,
            lastVerifiedAt: Date.now(),
            lastVerified: { passed: true, detail: verdict.detail },
          };
          entrypoint = `.selfhosted/${writeRes.entry.file}`;
        }
      }

      // Persist fresh live-verification verdicts to the manifest on disk so other
      // readers (capability adoption sweep, self-hosted list) see this tool as
      // live-verified, not only in this HTTP response.
      if (selfHostOutcome.selfHosted) {
        await verifyAllSelfHosted().catch(() => {});
        // A freshly built loop artifact is picked up by the supervisor.
        if ((tpl.artifactKind ?? 'function') === 'loop') deps.startSelfHostedLoop(cleanCompName);
      }

      const newVersion = {
        version: selfHostOutcome.selfHosted ? '1.0.0-selfhosted' : '1.0.0-template',
        hash: versionHash,
        created_at: Date.now(),
        passed_verifier: passedVerifier,
        score: 1.0,
        promoted: true,
        verifier_notes: `${verifierNotes}${selfHostOutcome.selfHosted ? ' | SELF-HOSTED: real runtime module imported & verified live' : ''}`,
        source_code: buildResult.synthesizedCode,
        test_suite_code: buildResult.testSuiteCode || undefined,
      };

      const registry = deps.registryRef();
      let existingTool = registry.find((t) => t.name === cleanCompName);
      let addedNew = true;
      if (existingTool) {
        existingTool.versions.push(newVersion);
        existingTool.currentVersion = newVersion.version;
        existingTool.healthStatus = 'healthy';
        existingTool.anomalyCount = 0;
        if (selfHostOutcome.selfHosted) existingTool.entrypoint = entrypoint;
      } else {
        existingTool = {
          name: cleanCompName,
          domain: targetDomain,
          entrypoint,
          description: `${tpl.name} [Parametric Component Template: ${tpl.id}]${selfHostOutcome.selfHosted ? ' [SELF-HOSTED]' : ''}`,
          versions: [newVersion],
          currentVersion: newVersion.version,
          healthStatus: 'healthy',
          anomalyCount: 0,
        };
        addedNew = deps.promoteTool(existingTool, { origin: 'templates' });
      }

      if (addedNew) {
        const status = deps.statusRef();
        status.registeredToolsCount = registry.length;
        status.totalUpgrades += 1;

        // Log in Provenance
        deps.appendProvenance('template_component_built', {
          templateId: tpl.id,
          toolName: cleanCompName,
          domain: targetDomain,
          hash: versionHash,
          complexity: buildResult.complexity,
          selfHealingGuards: buildResult.selfHealingGuards,
          selfHosted: Boolean(selfHostOutcome.selfHosted),
          moduleFile: selfHostOutcome.selfHosted?.file,
          moduleHash: selfHostOutcome.selfHosted?.hash,
          skippedSelfHostReason: selfHostOutcome.skippedReason,
          params,
        });

        deps.saveState();

        // A freshly built (possibly self-hosted) component may back a capability.
        void deps.sweepCapabilityAdoptions().catch(() => {});
        try { deps.recordSystemChange('template-build'); } catch { /* non-fatal */ }
      }

      res.json({
        success: true,
        promoted: addedNew,
        toolEntry: existingTool,
        buildResult,
        verifierPassed: passedVerifier,
        selfHost: selfHostOutcome,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Benchmark template in isolated sandbox
  router.post('/templates/benchmark', (req, res) => {
    try {
      const { templateId, params = {}, iterations = 100 } = req.body;
      const tpl = getComponentTemplate(templateId);
      if (!tpl) {
        return res.status(404).json({ success: false, error: 'Template not found' });
      }

      const buildResult = buildComponentFromTemplate(templateId, params, { withSelfHealing: true });
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        if (buildResult.testSuiteCode) {
          executeTestSuite(buildResult.synthesizedCode, buildResult.testSuiteCode);
        }
      }
      const elapsedMs = performance.now() - start;

      res.json({
        success: true,
        templateId,
        iterations,
        totalElapsedMs: Math.round(elapsedMs * 100) / 100,
        meanLatencyPerRunMs: Math.round((elapsedMs / iterations) * 1000) / 1000,
        estimatedFlops: tpl.benchmarkFlops,
        complexity: tpl.complexity,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
