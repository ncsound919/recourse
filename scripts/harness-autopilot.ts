/**
 * Harness Autopilot — CLI for the full GitHub/Git integration loop.
 *
 *   tsx scripts/harness-autopilot.ts --repo <path> --task "<task>" [--merge] [--json]
 *
 * Runs the DeepSeek harness against a target repo, scores the diff, commits
 * results to the results repo, pushes to remote, opens a GitHub PR, and
 * optionally merges it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { runAllPipelineBenchmarks, recordBenchmarkResults } from '../src/lib/codingPipelines/runner.js';
import { runAutopilot, collectProvenance, gitConfig } from '../src/lib/codingPipelines/harnessGit.js';
import { installDefaultPipelines, listPipelines } from '../src/lib/codingPipelines/index.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : '';
}
function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  installDefaultPipelines();

  const repo = arg('repo') || process.env.HARNESS_TARGET_REPO?.trim();
  const task = arg('task') || process.env.HARNESS_TASK?.trim();
  const merge = has('merge') || process.env.HARNESS_AUTOPILOT_MERGE === 'true';
  const json = has('json');

  if (!repo || !task) {
    console.error('usage: harness-autopilot.ts --repo <path> --task "<task>" [--merge] [--json]');
    process.exitCode = 1;
    return;
  }

  const config = gitConfig();
  if (!config.repoPath) {
    console.error('HARNESS_RESULTS_REPO must be set to commit results');
    process.exitCode = 1;
    return;
  }

  const resolvedRepo = path.resolve(repo);
  if (!fs.existsSync(resolvedRepo)) {
    console.error(`target repo not found: ${resolvedRepo}`);
    process.exitCode = 1;
    return;
  }

  const target = {
    repoDir: resolvedRepo,
    task,
    ...(process.env.HARNESS_TEST_CMD?.trim() ? { testCommand: process.env.HARNESS_TEST_CMD.trim() } : {}),
    ...(process.env.HARNESS_TIMEOUT_MS?.trim() ? { pipelineTimeoutMs: Number(process.env.HARNESS_TIMEOUT_MS) } : {}),
  };

  console.log(`\nHarness Autopilot`);
  console.log(`  target: ${target.repoDir}`);
  console.log(`  task: ${task}`);
  console.log(`  results repo: ${config.repoPath}`);
  console.log(`  pipelines: ${listPipelines().map((p) => p.spec.id).join(', ')}`);
  console.log(`  merge: ${merge}\n`);

  const provenance = collectProvenance(target.repoDir);
  console.log(`provenance: harness=${provenance.harnessSha ?? '?'} (${provenance.harnessBranch ?? '?'}) target=${provenance.targetSha ?? '?'} (${provenance.targetBranch ?? '?'})\n`);

  const results = await runAllPipelineBenchmarks(target);
  recordBenchmarkResults(results, target);

  console.log('\n=== results ===');
  for (const r of results) {
    const tag = r.run.ok ? 'PASS' : 'FAIL';
    console.log(`  ${r.pipeline.id.padEnd(12)} ${tag.padEnd(5)} score=${String(r.score.score ?? '-').padStart(4)} risk=${r.score.regressionRisk.padEnd(8)} ${(r.run.durationMs / 1000).toFixed(1)}s`);
  }

  console.log('\n=== autopilot ===');
  const autopilot = await runAutopilot(results, target, { merge });

  for (const step of autopilot.steps) {
    const tag = step.ok ? 'OK  ' : 'FAIL';
    console.log(`  ${tag} ${step.name.padEnd(12)} ${step.detail} (${step.durationMs}ms)`);
  }

  if (autopilot.pr?.prUrl) {
    console.log(`\n  PR: ${autopilot.pr.prUrl}`);
  }
  if (autopilot.merged) {
    console.log(`  MERGED`);
  }

  if (json) {
    console.log(JSON.stringify({ provenance, results: results.map((r) => ({ pipeline: r.pipeline.id, ok: r.run.ok, score: r.score.score, risk: r.score.regressionRisk })), autopilot }, null, 2));
  }

  if (!autopilot.ok) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
