/**
 * OpenCode pipeline — plain OpenCode CLI subprocess.
 *
 * Resolves the executable from OPENCODE_BIN (default "opencode") and invokes
 * `opencode run <task>`. OPENCODE_EXTRA_ARGS may carry additional flags
 * (space-separated). The model is left to OpenCode's own config here; the
 * deepseek pipeline is the pinned-model variant.
 */

import type { CodingPipeline, PipelineRunRequest, PipelineRunResult, PipelineStatus } from './types.js';
import { commandExists, runProcess } from './subprocess.js';

export function opencodeBin(): string {
  return process.env.OPENCODE_BIN?.trim() || 'opencode';
}

export function extraArgs(): string[] {
  const raw = process.env.OPENCODE_EXTRA_ARGS?.trim();
  return raw ? raw.split(/\s+/).filter(Boolean) : [];
}

export function buildRunArgs(task: string, model?: string): string[] {
  const args = ['run'];
  if (model) args.push('--model', model);
  args.push(...extraArgs(), task);
  return args;
}

export async function runOpencodeLike(
  id: 'opencode' | 'deepseek',
  req: PipelineRunRequest,
  model?: string
): Promise<PipelineRunResult> {
  const command = opencodeBin();
  const args = buildRunArgs(req.task, model);
  const res = await runProcess(command, args, {
    cwd: req.workdir,
    env: req.env,
    timeoutMs: req.timeoutMs,
  });
  return {
    ok: res.ok,
    id,
    command: [command, ...args].join(' '),
    exitCode: res.code,
    stdout: res.stdout,
    stderr: res.stderr,
    durationMs: res.durationMs,
    error: res.error ?? (!res.ok ? `exit ${res.code ?? 'null'}` : undefined),
  };
}

export const opencodePipeline: CodingPipeline = {
  spec: {
    id: 'opencode',
    name: 'OpenCode',
    transport: 'subprocess',
    description: 'Plain OpenCode CLI driving the task in the worktree.',
    capabilities: ['codegen', 'cli', 'opencode'],
  },
  async status(): Promise<PipelineStatus> {
    const command = opencodeBin();
    const available = commandExists(command);
    return {
      id: this.spec.id,
      name: this.spec.name,
      transport: this.spec.transport,
      available,
      detail: available ? 'CLI on PATH' : `CLI '${command}' not found on PATH`,
      command,
    };
  },
  run(req) {
    return runOpencodeLike('opencode', req);
  },
};
