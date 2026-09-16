/**
 * Recourse coding-pipeline router — select and benchmark the alternative
 * coding harnesses (opencode, deepseek, axiom, settlement).
 *
 * Stateless handlers over src/lib/codingPipelines. Status comes from real
 * probes; benchmark runs spawn real processes on a copied worktree and are
 * mutation-auth gated. Benchmark Olympics discovers the list via
 * GET /api/recourse/coding-pipelines.
 */

import { Router } from 'express';

import {
  installDefaultPipelines,
  pipelineSpecs,
  pipelineStatuses,
  runPipelineBenchmarks,
  runAllPipelineBenchmarks,
  recordBenchmarkResults,
  readPipelineLedger,
  pipelineStandings,
  verifyPipelineRecords,
} from '../lib/codingPipelines/index.js';
import { zod400, pipelineBenchmarkReq } from '../lib/contracts.js';
import { requireMutationAuthIfConfigured } from '../lib/mutationAuth.js';

export function createPipelinesRouter(): Router {
  const router = Router();

  // Discovery: specs + live availability. Read-only, safe to poll from
  // Benchmark Olympics' ecosystem agents route.
  router.get('/coding-pipelines', async (_req, res) => {
    installDefaultPipelines();
    const [specs, statuses] = await Promise.all([
      Promise.resolve(pipelineSpecs()),
      pipelineStatuses(),
    ]);
    const standingByPipeline = new Map(pipelineStandings().map((s) => [s.pipeline, s]));
    res.json({
      success: true,
      count: specs.length,
      pipelines: specs.map((spec, idx) => ({
        ...spec,
        laneNumber: idx + 1,
        status: statuses.find((s) => s.id === spec.id) ?? null,
        standing: standingByPipeline.get(spec.id) ?? null,
      })),
    });
  });

  // Run one or more pipelines against a target repo worktree.
  router.post('/coding-pipelines/benchmark', async (req, res) => {
    if (!requireMutationAuthIfConfigured(req, res)) return;
    const body = zod400(pipelineBenchmarkReq, req, res);
    if (!body) return;

    const target = {
      repoDir: body.repoDir,
      task: body.task,
      ...(body.contractPath ? { contractPath: body.contractPath } : {}),
      ...(body.testCommand ? { testCommand: body.testCommand } : {}),
      ...(body.pipelineTimeoutMs ? { pipelineTimeoutMs: body.pipelineTimeoutMs } : {}),
      ...(body.scoreTimeoutMs ? { scoreTimeoutMs: body.scoreTimeoutMs } : {}),
      ...(body.keepWorktree ? { keepWorktree: true } : {}),
    };

    try {
      const results = body.pipelines
        ? await runPipelineBenchmarks(body.pipelines, target)
        : await runAllPipelineBenchmarks(target);
      const records = recordBenchmarkResults(results, target);
      res.json({
        success: true,
        task: body.task,
        repoDir: body.repoDir,
        results: results.map((r) => ({
          pipeline: r.pipeline,
          status: r.status,
          ok: r.run.ok,
          exitCode: r.run.exitCode ?? null,
          error: r.run.error ?? null,
          durationMs: r.run.durationMs,
          score: r.score,
        })),
        records,
        standings: pipelineStandings(),
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Ledger: hash-chained history + per-pipeline standings.
  router.get('/coding-pipelines/ledger', (_req, res) => {
    const records = readPipelineLedger();
    res.json({
      success: true,
      count: records.length,
      integrity: verifyPipelineRecords(records),
      standings: pipelineStandings(),
      records: records.slice(-50),
    });
  });

  return router;
}
