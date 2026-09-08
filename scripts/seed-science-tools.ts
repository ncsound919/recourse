/**
 * Seed the three science template plugins as live self-hosted tools.
 *
 * Builds each template with defaults, runs its real test suite + oxlint gate,
 * writes the module under .selfhosted/tools/, and live-verifies the import.
 * Idempotent: skips tools whose manifest entry already exists and verifies.
 *
 * Usage: npx tsx scripts/seed-science-tools.ts
 */
import { buildComponentFromTemplate, getComponentTemplate } from '../src/lib/componentTemplates.js';
import { executeTestSuite } from '../src/lib/executionSandbox.js';
import { lintSource } from '../src/lib/lintGate.js';
import {
  writeSelfHostedTool,
  verifySelfHostedEntry,
  getSelfHostedEntry,
} from '../src/lib/selfHosting.js';

const TARGETS: Array<{ templateId: string; toolName: string }> = [
  { templateId: 'tpl_biosim_trial', toolName: 'biosim_trial_tool' },
  { templateId: 'tpl_deterministic_researcher', toolName: 'deterministic_researcher_tool' },
  { templateId: 'tpl_abm_cancer_sim', toolName: 'abm_cancer_sim_tool' },
];

let failures = 0;

for (const { templateId, toolName } of TARGETS) {
  const existing = getSelfHostedEntry(toolName);
  if (existing) {
    const verdict = await verifySelfHostedEntry(existing);
    console.log(`[seed-science] ${toolName}: already registered — re-verify ${verdict.passed ? 'PASS' : 'FAIL'} (${verdict.detail})`);
    if (!verdict.passed) failures += 1;
    continue;
  }
  const tpl = getComponentTemplate(templateId);
  if (!tpl) {
    console.error(`[seed-science] template ${templateId} not found`);
    failures += 1;
    continue;
  }
  const mergedParams: Record<string, unknown> = {};
  for (const p of tpl.params) mergedParams[p.id] = p.default;
  const build = buildComponentFromTemplate(templateId, mergedParams, {
    withSelfHealing: true,
    componentName: toolName,
  });
  if (!build.success) {
    console.error(`[seed-science] ${toolName}: build failed — ${build.error}`);
    failures += 1;
    continue;
  }
  const testRun = executeTestSuite(build.synthesizedCode, build.testSuiteCode);
  if (!testRun.passed) {
    console.error(`[seed-science] ${toolName}: test suite FAILED\n${testRun.testDetails.join('\n')}`);
    failures += 1;
    continue;
  }
  const lint = lintSource(build.synthesizedCode, 'ts');
  if (lint.available && !lint.clean) {
    console.error(`[seed-science] ${toolName}: oxlint gate FAILED (${lint.errors} errors)`);
    failures += 1;
    continue;
  }
  if (!tpl.selfHost) {
    console.error(`[seed-science] ${toolName}: template declares no selfHost descriptor`);
    failures += 1;
    continue;
  }
  const writeRes = writeSelfHostedTool({
    name: toolName,
    templateId: tpl.id,
    domain: tpl.domain,
    entrypointName: build.entrypointName,
    params: mergedParams,
    sourceCode: build.synthesizedCode,
    testSuiteCode: build.testSuiteCode,
    summary: `${tpl.name} [self-hosted from ${tpl.id}]`,
    selfHost: tpl.selfHost,
    artifactKind: tpl.artifactKind ?? 'function',
  });
  if (writeRes.success === false) {
    console.error(`[seed-science] ${toolName}: write failed — ${writeRes.error}`);
    failures += 1;
    continue;
  }
  const verdict = await verifySelfHostedEntry(writeRes.entry);
  if (!verdict.passed) {
    console.error(`[seed-science] ${toolName}: live verification FAILED — ${verdict.detail}`);
    failures += 1;
    continue;
  }
  console.log(`[seed-science] ${toolName}: SELF-HOSTED + verified (${verdict.detail})`);
}

if (failures > 0) {
  console.error(`[seed-science] ${failures} failure(s)`);
  process.exit(1);
}

// Persist fresh verdicts to the manifest so list/readers see live-verified,
// mirroring POST /api/recourse/templates/build (verifyAllSelfHosted writeback).
import { verifyAllSelfHosted } from '../src/lib/selfHosting.js';
await verifyAllSelfHosted().catch(() => {});
console.log('[seed-science] all science tools live');
