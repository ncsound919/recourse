/**
 * Pipeline benchmark CLI.
 *
 * Run the selectable coding harnesses head-to-head on a real repo + task and
 * record the results in the hash-chained pipeline ledger.
 *
 *   npm run pipelines:bench -- --status
 *   npm run pipelines:bench -- --repo ./some-repo --task "fix the failing test"
 *   npm run pipelines:bench -- --repo . --task "..." --pipelines opencode,axiom
 *   npm run pipelines:bench -- --repo . --task "..." --contract .settlement/contracts/contract.pinned.json
 *
 * Flags:
 *   --status            list pipelines with availability + bare-harness provenance
 *   --repo <dir>        repo to copy into an ephemeral worktree (required)
 *   --task <text>       coding task handed to each pipeline (required)
 *   --pipelines <list>  comma-separated subset (default: all four)
 *   --test <cmd>        scorer test command (default: package.json test script)
 *   --contract <path>   required by the settlement pipeline
 *   --keep              keep worktrees for inspection
 *   --json              print raw JSON instead of a table
 */

import { installDefaultPipelines, runAllPipelineBenchmarks, runPipelineBenchmarks, recordBenchmarkResults, pipelineStandings, pipelineStatuses } from '../src/lib/codingPipelines/index.js';

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

  if (has('status')) {
    const statuses = await pipelineStatuses();
    if (has('json')) {
      console.log(JSON.stringify(statuses, null, 2));
      return;
    }
    console.log('\nCoding pipelines:');
    for (const s of statuses) {
      console.log(
        `  ${s.name.padEnd(28)} ` +
        `${s.available ? 'available  ' : 'unavailable'} ` +
        `${(s.version ?? '').padEnd(16)} ` +
        `${s.detail}`,
      );
    }
    return;
  }

  const repoDir = arg('repo');
  const task = arg('task');
  if (!repoDir || !task) {
    console.error('usage: npm run pipelines:bench -- [--status | --repo <dir> --task <text>] [--pipelines a,b] [--test <cmd>] [--contract <path>] [--keep] [--json]');
    process.exitCode = 1;
    return;
  }

  const pipelinesArg = arg('pipelines');
  const ids = pipelinesArg ? pipelinesArg.split(',').map((s) => s.trim()).filter(Boolean) : null;
  const contractPath = arg('contract');
  const testCommand = arg('test');
  const worktreeRoot = arg('worktree-root');

  const target = {
    repoDir,
    task,
    ...(contractPath ? { contractPath } : {}),
    ...(testCommand ? { testCommand } : {}),
    ...(worktreeRoot ? { worktreeRoot } : {}),
    ...(has('keep') ? { keepWorktree: true } : {}),
  };

  const results = ids
    ? await runPipelineBenchmarks(ids, target)
    : await runAllPipelineBenchmarks(target);

  recordBenchmarkResults(results, target);

  if (has('json')) {
    console.log(JSON.stringify({ results, standings: pipelineStandings() }, null, 2));
    return;
  }

  console.log(`\nPipeline benchmark — ${task}`);
  console.log(`repo: ${repoDir}\n`);
  for (const r of results) {
    const s = r.score;
    console.log(
      `${r.pipeline.name.padEnd(20)} ` +
      `ok=${String(r.run.ok).padEnd(5)} ` +
      `score=${String(s.score ?? '-').padEnd(4)} ` +
      `tests=${s.testsPassed === null ? 'n/a' : s.testsPassed ? 'pass' : 'FAIL'} ` +
      `files=${s.diff.changedFiles.length} ` +
      `+${s.diff.linesAdded}/-${s.diff.linesRemoved} ` +
      `risk=${s.regressionRisk} ` +
      `${r.run.error ? `error=${r.run.error}` : ''}`,
    );
  }
  console.log('\nstandings (avg score):');
  for (const st of pipelineStandings()) {
    console.log(`  ${st.pipeline.padEnd(12)} runs=${st.runs} passes=${st.passes} avg=${st.avgScore ?? '-'} best=${st.bestScore ?? '-'}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
