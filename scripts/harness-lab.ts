/**
 * Harness Lab runner.
 *
 * Runs a task suite across pipelines with repeats, classifies failures, and
 * feeds the results into Recourse's self-learning / healing / trend systems:
 *   - episodic + semantic memory (recordEpisode, consolidateSemanticMemory)
 *   - vector memory recall (openVectorMemory)
 *   - trend engine + hash-chained trend ledger (runTrendScan, appendInsight)
 *   - healing triage (selfRepairLoop.updateStuckIssues / buildStuckRepairQuery)
 * and writes a rigorous Benchmark Olympics report (pass rate + Wilson CI,
 * harness×task matrix, failure taxonomy, complementarity/pairwise map).
 *
 *   tsx scripts/harness-lab.ts --tasks collections,all --pipelines opencode,deepseek,axiom,settlement --repeats 1
 *
 * Flags: --tasks a,b  --pipelines a,b  --repeats N  --ledger <file>  --out <file>  --json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { installDefaultPipelines, listPipelines } from '../src/lib/codingPipelines/index.js';
import {
  appendLabRun,
  labLedgerFile,
  labTasks,
  readLabRuns,
  runLabCell,
  summarizeLab,
  toTrendSeries,
  type LabRun,
  type LabSummary,
} from '../src/lib/codingPipelines/lab.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : '';
}
function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

interface Integrations {
  episodes: number;
  semanticFacts: number;
  trendInsights: number;
  trendManifestHash?: string;
  vectorRemembered: number;
  healingRecommendations: string[];
  errors: string[];
}

function complementarity(runs: LabRun[]) {
  const taskIds = [...new Set(runs.map((r) => r.taskId))];
  const rows = taskIds.map((taskId) => {
    const ok = new Set(runs.filter((r) => r.taskId === taskId && r.ok).map((r) => r.pipeline));
    return { taskId, passing: [...ok].sort(), anyPass: ok.size > 0, allPass: ok.size >= new Set(runs.filter((r) => r.taskId === taskId).map((r) => r.pipeline)).size };
  });
  return {
    specialists: rows.filter((r) => r.passing.length > 0 && !r.allPass && r.passing.length === 1),
    universal: rows.filter((r) => r.allPass),
    unsolved: rows.filter((r) => !r.anyPass),
  };
}

function pairwise(runs: LabRun[]) {
  const pipelines = [...new Set(runs.map((r) => r.pipeline))].sort();
  const cells = new Map<string, Map<string, boolean>>();
  for (const r of runs) {
    const key = `${r.taskId}:r${r.repeat}`;
    const m = cells.get(key) ?? new Map<string, boolean>();
    m.set(r.pipeline, m.get(r.pipeline) || r.ok);
    cells.set(key, m);
  }
  const out: Array<{ a: string; b: string; agree: number; aOnly: number; bOnly: number; n: number }> = [];
  for (let i = 0; i < pipelines.length; i++) {
    for (let j = i + 1; j < pipelines.length; j++) {
      const a = pipelines[i], b = pipelines[j];
      let agree = 0, aOnly = 0, bOnly = 0, n = 0;
      for (const m of cells.values()) {
        if (!m.has(a) || !m.has(b)) continue;
        n++;
        const pa = !!m.get(a), pb = !!m.get(b);
        if (pa === pb) agree++; else if (pa) aOnly++; else bOnly++;
      }
      out.push({ a, b, agree, aOnly, bOnly, n });
    }
  }
  return out;
}

async function feedRecourse(runs: LabRun[], summary: LabSummary): Promise<Integrations> {
  const integrations: Integrations = { episodes: 0, semanticFacts: 0, trendInsights: 0, vectorRemembered: 0, healingRecommendations: [], errors: [] };
  const hasRuns = new Set(runs.map((r) => r.pipeline));

  // 1. Episodic + semantic memory (self-learning).
  try {
    const { recordEpisode, consolidateSemanticMemory } = await import('../src/lib/recourseActivator.js');
    for (const r of runs) {
      recordEpisode({
        domain: 'coding',
        instructions: `${r.taskId} (${r.category})`,
        toolName: r.pipeline,
        outcome: r.ok ? 'win' : 'loss',
        score: (r.score ?? 0) / 100,
        summary: `${r.pipeline} ${r.taskId} ok=${r.ok} score=${r.score} fail=${r.failureClass}`,
        geneIds: [`pipeline:${r.pipeline}`, `category:${r.category}`],
      });
      integrations.episodes++;
    }
    const facts = consolidateSemanticMemory({ minClusterSize: 2 });
    integrations.semanticFacts = Array.isArray(facts) ? facts.length : 0;
  } catch (err) {
    integrations.errors.push(`memory: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2. Trend engine + hash-chained trend ledger.
  try {
    const { runTrendScan } = await import('../src/lib/trendEngine.js');
    const { appendInsight } = await import('../src/lib/trendLedger.js');
    const series = toTrendSeries(runs);
    if (series.some((s) => s.points.length >= 2)) {
      const scan = runTrendScan(series as never);
      integrations.trendManifestHash = scan.manifestHash;
      const best = summary.standings[0];
      const insight = appendInsight({
        createdRun: `lab-${Date.now().toString(36)}`,
        hypothesisId: 'harness_benchmark',
        templateId: 'benchmark_scan',
        statement: `Harness lab: ${summary.total} runs across ${summary.tasks} tasks. Leader by pass rate: ${best?.pipelineName} (${best?.passRate}% [${best?.ciLow}-${best?.ciHigh}]).`,
        confidence: 0.5,
        provenanceRoot: scan.manifestHash,
        payload: { standings: summary.standings.map((s) => ({ pipeline: s.pipeline, passRate: s.passRate, medianScore: s.medianScore })), failureTaxonomy: summary.failureTaxonomy },
      });
      if (insight) integrations.trendInsights++;
    }
  } catch (err) {
    integrations.errors.push(`trend: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. Vector memory (semantic recall).
  try {
    const { openVectorMemory } = await import('../src/lib/vectorMemory.js');
    const mem = await openVectorMemory();
    for (const r of runs) {
      await mem.remember('lesson', `bench:${r.id}`, `${r.pipeline} on ${r.taskId} (${r.category}): ok=${r.ok} score=${r.score} failure=${r.failureClass} risk=${r.regressionRisk}`, {
        pipeline: r.pipeline, taskId: r.taskId, category: r.category, ok: r.ok, score: r.score, failureClass: r.failureClass,
      });
      integrations.vectorRemembered++;
    }
    await mem.close();
  } catch (err) {
    integrations.errors.push(`vector: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 4. Healing triage: pipelines failing on a category become stuck issues with
  //    a deterministic repair query (the recourse self-repair loop's input).
  try {
    const { updateStuckIssues, buildStuckRepairQuery } = await import('../src/lib/selfRepairLoop.js');
    const now = Date.now();
    let issues: unknown[] = [];
    const signals = summary.standings
      .filter((s) => s.passRate < 100)
      .map((s) => ({
        id: `pipeline:${s.pipeline}`,
        name: s.pipelineName,
        kind: 'job' as const,
        failing: true,
        detail: `pass rate ${s.passRate}% (${s.passes}/${s.runs}); failures: ${Object.keys(s.failureClasses).join(', ') || 'none'}`,
        threshold: 1,
      }));
    if (signals.length) {
      issues = updateStuckIssues(issues as never, signals as never, now) as unknown[];
      for (const issue of issues as Array<Record<string, unknown>>) {
        const q = buildStuckRepairQuery(issue as never);
        if (q) integrations.healingRecommendations.push(q.slice(0, 300));
      }
    }
    void hasRuns;
  } catch (err) {
    integrations.errors.push(`healing: ${err instanceof Error ? err.message : String(err)}`);
  }

  return integrations;
}

async function main(): Promise<void> {
  installDefaultPipelines();

  const tasksFilter = arg('tasks');
  const tasks = tasksFilter
    ? labTasks().filter((t) => tasksFilter.split(',').map((s) => s.trim()).includes(t.id))
    : labTasks();
  const pipelinesArg = arg('pipelines');
  const pipelines = pipelinesArg
    ? pipelinesArg.split(',').map((s) => s.trim()).filter(Boolean)
    : listPipelines().map((p) => p.spec.id);
  const repeats = Math.max(1, Number(arg('repeats') || 1));
  const ledger = arg('ledger') || labLedgerFile();
  const outPath = arg('out') || process.env.HARNESS_LAB_OUT || path.join(process.cwd(), 'data', 'harness-lab.json');

  console.log(`\nHarness Lab — tasks=[${tasks.map((t) => t.id).join(',')}] pipelines=[${pipelines.join(',')}] repeats=${repeats}`);
  console.log(`ledger: ${ledger}\n`);

  // Refresh the report from the ledger without running anything (used to point
  // Benchmark Olympics at accumulated results, including during a long run).
  if (has('report-only')) {
    const runs = readLabRuns(ledger);
    const summary = summarizeLab(runs);
    const integrations = await feedRecourse(runs, summary);
    const report = {
      generatedAt: new Date().toISOString(),
      source: { ledger, tasks: tasks.map((t) => t.id), pipelines, repeats: 0, newRuns: 0 },
      summary,
      complementarity: complementarity(runs),
      pairwise: pairwise(runs),
      integrations,
      reportOnly: true,
    };
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');
    console.log(`report-only written: ${outPath} (runs=${runs.length}, pipelines=${summary.pipelines}, tasks=${summary.tasks})`);
    for (const s of summary.standings) console.log(`  ${s.pipelineName.padEnd(26)} ${s.passes}/${s.runs} = ${s.passRate}% [${s.ciLow}-${s.ciHigh}] med=${s.medianScore}`);
    return;
  }

  const newRuns: LabRun[] = [];
  const force = has('force');

  // Write the report after every cell so Benchmark Olympics reflects progress
  // live during a long (repeats=N) run. Integrations are filled in at the end.
  const writeReport = (integrations: Integrations | null): void => {
    const runsNow = readLabRuns(ledger);
    if (!runsNow.length) return;
    const report = {
      generatedAt: new Date().toISOString(),
      source: { ledger, tasks: tasks.map((t) => t.id), pipelines, repeats, newRuns: newRuns.length },
      summary: summarizeLab(runsNow),
      complementarity: complementarity(runsNow),
      pairwise: pairwise(runsNow),
      integrations: integrations ?? { episodes: 0, semanticFacts: 0, trendInsights: 0, vectorRemembered: 0, healingRecommendations: [], errors: [] },
      running: true,
    };
    try {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');
    } catch { /* best-effort progress write */ }
  };

  const done = new Set(readLabRuns(ledger).map((r) => `${r.taskId}|${r.pipeline}|r${r.repeat}`));
  for (const task of tasks) {
    for (const pipeline of pipelines) {
      for (let rep = 1; rep <= repeats; rep++) {
        const key = `${task.id}|${pipeline}|r${rep}`;
        if (!force && done.has(key)) {
          console.log(`  ${task.id.padEnd(12)} ${pipeline.padEnd(11)} r${rep} … skip (already recorded)`);
          continue;
        }
        process.stdout.write(`  ${task.id.padEnd(12)} ${pipeline.padEnd(11)} r${rep} … `);
        const run = await runLabCell(pipeline, task, { repeat: rep });
        appendLabRun(run, ledger);
        newRuns.push(run);
        const tag = run.ok ? 'PASS' : `FAIL(${run.failureClass})`;
        console.log(`${tag.padEnd(18)} score=${String(run.score ?? '-').padStart(4)} ${(run.durationMs / 1000).toFixed(1)}s`);
        writeReport(null); // live progress
      }
    }
  }

  const allRuns = readLabRuns(ledger);
  const summary = summarizeLab(allRuns);
  const integrations = await feedRecourse(newRuns.length ? newRuns : allRuns, summary);

  const report = {
    generatedAt: new Date().toISOString(),
    source: { ledger, tasks: tasks.map((t) => t.id), pipelines, repeats, newRuns: newRuns.length },
    summary,
    complementarity: complementarity(allRuns),
    pairwise: pairwise(allRuns),
    integrations,
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');

  if (has('json')) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('\n=== standings (pass rate + Wilson 95% CI | median score) ===');
  for (const s of summary.standings) {
    console.log(`  ${s.pipelineName.padEnd(26)} ${String(s.passes).padStart(2)}/${String(s.runs).padEnd(2)} = ${String(s.passRate).padStart(5)}% [${s.ciLow}-${s.ciHigh}]  med=${String(s.medianScore ?? '-').padStart(3)}  ${(s.medianDurationMs / 1000).toFixed(0)}s  fails:${JSON.stringify(s.failureClasses)}`);
  }
  console.log('\n=== harness × task matrix ===');
  for (const row of summary.matrix) console.log(`  ${row.taskId.padEnd(12)} ${row.category.padEnd(11)} ${row.cells.map((c) => `${c.pipeline}:${c.passes}/${c.runs}`).join('  ')}`);
  console.log('\n=== recourse integrations ===');
  console.log(`  episodes=${integrations.episodes} semanticFacts=${integrations.semanticFacts} trendInsights=${integrations.trendInsights} vector=${integrations.vectorRemembered} healing=${integrations.healingRecommendations.length}`);
  if (integrations.healingRecommendations.length) console.log(`  healing[0]: ${integrations.healingRecommendations[0]}`);
  if (integrations.errors.length) console.log(`  integration errors: ${integrations.errors.join(' | ')}`);
  console.log(`\nreport: ${outPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
