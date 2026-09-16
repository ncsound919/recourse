/**
 * Axiom pipeline — Axiom OS deterministic agent loop (HTTP, :3198).
 *
 * "Axiom original": the deterministic-spec agentic loop server Recourse already
 * talks to through src/lib/axiomBridge.ts. A coding task is launched as a
 * project loop against the worktree; Axiom writes patches directly into that
 * directory (it is itself a shadow/gated loop), so the benchmark waits for the
 * loop to leave "running" before snapshotting the diff.
 *
 * Operational notes:
 *   - Axiom gates /api/* with a Keywire HS256 JWT; set KEYWIRE_KEYS_FILE or
 *     UPLIFT_ROOT (recourse's axiomBridge mints the token) or AXIOM_API_TOKEN.
 *   - Axiom's workspace boundary is UPLIFT_ROOT: targetDir must live under it,
 *     so benchmark worktrees for Axiom need PIPELINE_WORKTREE_ROOT under
 *     UPLIFT_ROOT.
 */

import type { CodingPipeline, PipelineRunRequest, PipelineRunResult, PipelineStatus } from './types.js';
import { axiomBridgeStatus, launchAxiomLoop, waitForAxiomLoop } from '../axiomBridge.js';

export const axiomPipeline: CodingPipeline = {
  spec: {
    id: 'axiom',
    name: 'Axiom Original',
    transport: 'http',
    description: 'Axiom OS deterministic project loop; launches a repair loop against the worktree.',
    capabilities: ['codegen', 'repair', 'deterministic', 'axiom', 'http'],
  },
  async status(): Promise<PipelineStatus> {
    const s = await axiomBridgeStatus();
    return {
      id: this.spec.id,
      name: this.spec.name,
      transport: this.spec.transport,
      available: s.online,
      detail: s.online
        ? `reachable (auth: ${s.auth}); targetDir must be under UPLIFT_ROOT`
        : 'Axiom OS unreachable',
      endpoint: s.url,
    };
  },
  async run(req: PipelineRunRequest): Promise<PipelineRunResult> {
    const started = Date.now();
    const status = await axiomBridgeStatus().catch(() => ({ online: false, url: '', auth: 'none' as const }));
    const maxIterations = Number(process.env.PIPELINE_AXIOM_ITERATIONS || 4);

    const launched = await launchAxiomLoop({
      goal: req.task,
      targetDir: req.workdir,
      mode: 'existing',
      maxIterations,
      timeoutMs: 30_000,
    });
    if (!launched.ok || !launched.id) {
      return {
        ok: false,
        id: 'axiom',
        command: `POST ${status.url}/api/project/run`,
        stdout: JSON.stringify(launched, null, 2),
        stderr: '',
        durationMs: Date.now() - started,
        error: launched.error ?? 'Axiom loop launch failed',
      };
    }

    const finished = await waitForAxiomLoop(launched.id, {
      timeoutMs: req.timeoutMs ?? Number(process.env.PIPELINE_AXIOM_TIMEOUT_MS || 900_000),
      pollMs: 5_000,
    });

    return {
      ok: finished.ok,
      id: 'axiom',
      command: `POST ${status.url}/api/project/run`,
      stdout: JSON.stringify({ id: launched.id, maxIterations: launched.maxIterations, ...finished }, null, 2),
      stderr: '',
      durationMs: Date.now() - started,
      error: finished.ok ? undefined : finished.error ?? `Axiom loop ${launched.id} ${finished.status ?? 'failed'}`,
    };
  },
};
