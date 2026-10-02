/**
 * SlopCodeBench bridge routes.
 *
 * Exposes the SlopCodeBench pipeline through the Recourse API:
 *   GET  /slopbench/status   — availability probe
 *   POST /slopbench/run      — run a benchmark
 *   POST /slopbench/eval     — evaluate a run directory (runs the real CLI)
 *   POST /slopbench/metrics  — compute quality metrics (runs the real CLI)
 *   GET  /slopbench/runs     — list completed runs
 *
 * Honesty contract: every response reflects what actually happened. `run` only
 * reports the run directory the CLI created; `eval`/`metrics` shell out to
 * `slop-code` and return its real stdout/exit/error rather than describing a
 * command the caller should run themselves.
 *
 * Every path is confined to the SlopCodeBench checkout so a caller cannot point
 * the CLI at an arbitrary directory on the host.
 */

import { Router } from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  slopCodeBenchPipeline,
  slopCodeAvailable,
  dockerAvailable,
  uvAvailable,
  slopCodeAgent,
  slopCodeModel,
  slopCodeDir,
  slopCodeBin,
  slopCodeTimeoutMs,
  SLOP_CODE_ENV_KEYS,
  runProcess,
} from '../lib/codingPipelines/index.js';
import { requireMutationAuthIfConfigured } from '../lib/mutationAuth.js';

/** True when `target` resolves to a path inside `root` (never the root itself). */
function within(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

export function createSlopBenchRouter(): Router {
  const router = Router();

  router.get('/status', async (_req, res) => {
    const status = await slopCodeBenchPipeline.status();
    res.json({
      success: true,
      available: status.available,
      detail: status.detail,
      command: status.command,
      agent: slopCodeAgent(),
      model: slopCodeModel(),
      cliOnPath: slopCodeAvailable(),
      dockerRunning: await dockerAvailable(),
      uvOnPath: uvAvailable(),
    });
  });

  router.post('/run', async (req, res) => {
    if (!requireMutationAuthIfConfigured(req, res)) return;
    const body = req.body ?? {};

    // Thread per-run configuration into the pipeline via SLOP_CODE_* env keys.
    // Anything the caller omits falls back to the process env / defaults, which
    // is exactly what the pipeline reports it will use.
    const env: Record<string, string> = { ...(body.env ?? {}) };
    if (Array.isArray(body.problems) && body.problems.length) {
      env[SLOP_CODE_ENV_KEYS.problems] = body.problems.map(String).join(',');
    }
    if (typeof body.agent === 'string' && body.agent.trim()) env[SLOP_CODE_ENV_KEYS.agent] = body.agent.trim();
    if (typeof body.model === 'string' && body.model.trim()) env[SLOP_CODE_ENV_KEYS.model] = body.model.trim();
    if (typeof body.environment === 'string' && body.environment.trim()) env[SLOP_CODE_ENV_KEYS.environment] = body.environment.trim();
    if (typeof body.prompt === 'string' && body.prompt.trim()) env[SLOP_CODE_ENV_KEYS.prompt] = body.prompt.trim();

    const result = await slopCodeBenchPipeline.run({
      task: 'slopcodebench iterative refinement benchmark',
      workdir: slopCodeDir(env),
      timeoutMs: Number(body.timeoutMs) || undefined,
      env,
    });

    res.json({
      success: result.ok,
      runDir: result.runDir ?? null,
      problems: (env[SLOP_CODE_ENV_KEYS.problems] ?? '').split(',').filter(Boolean),
      agent: slopCodeAgent(env),
      model: slopCodeModel(env),
      durationMs: result.durationMs,
      error: result.error,
      stdout: result.stdout.slice(-2000),
      stderr: result.stderr.slice(-2000),
    });
  });

  // Evaluate a run directory. Runs `slop-code eval <runDir>` for real.
  router.post('/eval', async (req, res) => {
    if (!requireMutationAuthIfConfigured(req, res)) return;
    const body = req.body ?? {};
    const runDir = typeof body.runDir === 'string' ? body.runDir.trim() : '';
    if (!runDir) {
      res.status(400).json({ success: false, error: 'runDir is required' });
      return;
    }
    const dir = slopCodeDir();
    const resolved = path.resolve(runDir);
    if (!fs.existsSync(resolved)) {
      res.status(404).json({ success: false, error: `Run directory not found: ${resolved}` });
      return;
    }
    if (!within(dir, resolved)) {
      res.status(403).json({ success: false, error: `runDir must be inside the SlopCodeBench checkout (${dir})` });
      return;
    }
    const result = await runProcess(slopCodeBin(), ['eval', resolved], {
      cwd: dir,
      timeoutMs: slopCodeTimeoutMs(),
    });
    res.json({
      success: result.ok,
      runDir: resolved,
      exitCode: result.code,
      durationMs: result.durationMs,
      stdout: result.stdout.slice(-4000),
      stderr: result.stderr.slice(-2000),
      error: result.error ?? (!result.ok ? `slop-code eval exited ${result.code ?? 'null'}` : undefined),
    });
  });

  // Compute static quality metrics. Runs `slop-code metrics static <target>`.
  router.post('/metrics', async (req, res) => {
    if (!requireMutationAuthIfConfigured(req, res)) return;
    const body = req.body ?? {};
    const dir = slopCodeDir();
    const target = typeof body.target === 'string' && body.target.trim()
      ? body.target.trim()
      : path.join(dir, 'outputs');
    const resolved = path.resolve(target);
    if (!fs.existsSync(resolved)) {
      res.status(404).json({ success: false, error: `Target not found: ${resolved}` });
      return;
    }
    if (!within(dir, resolved)) {
      res.status(403).json({ success: false, error: `target must be inside the SlopCodeBench checkout (${dir})` });
      return;
    }
    const result = await runProcess(slopCodeBin(), ['metrics', 'static', resolved], {
      cwd: dir,
      timeoutMs: slopCodeTimeoutMs(),
    });
    res.json({
      success: result.ok,
      target: resolved,
      exitCode: result.code,
      durationMs: result.durationMs,
      stdout: result.stdout.slice(-4000),
      stderr: result.stderr.slice(-2000),
      error: result.error ?? (!result.ok ? `slop-code metrics exited ${result.code ?? 'null'}` : undefined),
    });
  });

  router.get('/runs', (_req, res) => {
    const outputsDir = path.join(slopCodeDir(), 'outputs');
    if (!fs.existsSync(outputsDir)) {
      res.json({ success: true, count: 0, runs: [] });
      return;
    }
    const runs = fs.readdirSync(outputsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => {
        const full = path.join(outputsDir, e.name);
        const stat = fs.statSync(full);
        return {
          name: e.name,
          path: full,
          modified: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => b.modified.localeCompare(a.modified));
    res.json({ success: true, count: runs.length, runs });
  });

  return router;
}
