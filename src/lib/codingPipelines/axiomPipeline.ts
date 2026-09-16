/**
 * Axiom pipeline — Axiom OS deterministic agent loop (HTTP, :3198).
 *
 * "Axiom original": the deterministic-spec agentic loop server Recourse already
 * talks to through src/lib/axiomBridge.ts. A coding task is dispatched as a
 * project-loop goal against the worktree; Axiom only writes patches that clear
 * its own QA/verify/test gates. Honest offline handling comes from the bridge.
 */

import type { CodingPipeline, PipelineRunRequest, PipelineRunResult, PipelineStatus } from './types.js';
import { axiomBridgeStatus, dispatchAxiomRepair } from '../axiomBridge.js';

export const axiomPipeline: CodingPipeline = {
  spec: {
    id: 'axiom',
    name: 'Axiom Original',
    transport: 'http',
    description: 'Axiom OS deterministic agent loop; dispatches a project repair loop.',
    capabilities: ['codegen', 'repair', 'deterministic', 'axiom', 'http'],
  },
  async status(): Promise<PipelineStatus> {
    const s = await axiomBridgeStatus();
    return {
      id: this.spec.id,
      name: this.spec.name,
      transport: this.spec.transport,
      available: s.online,
      detail: s.online ? `reachable (auth: ${s.auth})` : 'Axiom OS unreachable',
      endpoint: s.url,
    };
  },
  async run(req: PipelineRunRequest): Promise<PipelineRunResult> {
    const started = Date.now();
    const status = await axiomBridgeStatus().catch(() => ({ online: false, url: '', auth: 'none' as const }));
    const result = await dispatchAxiomRepair({
      findings: [],
      targetDir: req.workdir,
      goal: req.task,
      maxIterations: Number(process.env.PIPELINE_AXIOM_ITERATIONS || 6),
      timeoutMs: req.timeoutMs,
    });
    return {
      ok: result.ok,
      id: 'axiom',
      command: `POST ${status.url}/api/recourse/bridge/repair`,
      stdout: JSON.stringify(result, null, 2),
      stderr: result.ok ? '' : result.error ?? '',
      durationMs: Date.now() - started,
      error: result.ok ? undefined : result.error,
    };
  },
};
