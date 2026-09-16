/**
 * Settlement pipeline — the settlement-harness supervisor.
 *
 * Drives OpenCode through admission gate -> shadow worktree -> probes ->
 * settlement receipt. This is the alternative harness: instead of letting the
 * agent write directly, every write is settled in an ephemeral worktree first.
 *
 * Integration shape:
 *   - The harness speaks newline-delimited JSON tool calls. The real OpenCode
 *     CLI does not, so we point the supervisor at the harness's own
 *     `opencode-adapter.js`, which runs OpenCode as a pure proposer (deny-all
 *     permissions) and translates its output into harness tool calls.
 *   - The adapter drives a real `opencode run`; we point its OPENCODE_BIN at
 *     the bare checkout (or a global CLI) and reuse the same provider config as
 *     the opencode pipeline.
 *   - `settlementLoop.ts` runs the supervisor with a live-appropriate
 *     tool-call timeout (the upstream CLI hard-codes 30s).
 *
 * The harness lives outside this repo (settlement-harness dir). A contract
 * path is required — without one the run fails honestly.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CodingPipeline, PipelineRunRequest, PipelineRunResult, PipelineStatus } from './types.js';
import { commandExists, lastLine, runProcess } from './subprocess.js';
import { opencodeBin, opencodeBareDir, opencodeBareEntry, opencodeModel, opencodeProvider, opencodeRunEnv } from './opencodePipeline.js';

export function settlementHarnessDir(): string {
  return (
    process.env.SETTLEMENT_HARNESS_DIR?.trim() ||
    path.join(os.homedir(), 'Downloads', 'settlement-harness')
  );
}

export function settlementSupervisorPath(): string {
  return path.join(settlementHarnessDir(), 'settlement-supervisor.ts');
}

export function settlementAdapterPath(): string {
  return path.join(settlementHarnessDir(), 'opencode-adapter.js');
}

function settlementLoopWrapperPath(): string {
  return fileURLToPath(new URL('./settlementLoop.ts', import.meta.url));
}

/** This repo's tsx CLI, invoked through node (Windows `npx` is a .cmd and
 *  cannot be spawned shell-free). Null on failure — caller falls back to npx. */
export function settlementTsxCli(): string | null {
  if (process.env.SETTLEMENT_TSX_CLI?.trim()) return process.env.SETTLEMENT_TSX_CLI.trim();
  const wrapper = settlementLoopWrapperPath();
  const root = path.resolve(path.dirname(wrapper), '..', '..', '..');
  const cli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  return fs.existsSync(cli) ? cli : null;
}

export function settlementHarnessAvailable(): { ok: boolean; detail: string } {
  const dir = settlementHarnessDir();
  if (!fs.existsSync(dir)) return { ok: false, detail: `harness dir not found: ${dir}` };
  if (!fs.existsSync(settlementSupervisorPath())) {
    return { ok: false, detail: `supervisor not found: ${settlementSupervisorPath()}` };
  }
  if (!fs.existsSync(settlementAdapterPath())) {
    return { ok: false, detail: `adapter not found: ${settlementAdapterPath()}` };
  }
  if (!settlementTsxCli() && !commandExists('npx')) {
    return { ok: false, detail: 'no tsx CLI found (set SETTLEMENT_TSX_CLI or install tsx)' };
  }
  return { ok: true, detail: 'supervisor + adapter + tsx present' };
}

/**
 * The supervisor spawns the agent executable by splitting it on spaces, so the
 * adapter is launched as `node <adapter> --repo <worktree>`. OPENCODE_BIN tells
 * the adapter which real CLI to drive.
 */
export function settlementAgentExecutable(workdir: string): string {
  const adapter = settlementAdapterPath();
  const model = opencodeProvider()
    ? `${opencodeProvider()!.providerId}/${opencodeProvider()!.modelId}`
    : opencodeModel();
  const modelArg = model && model.includes('/') ? ` --model ${model}` : '';
  return `node ${adapter} --repo ${workdir}${modelArg}`;
}

/**
 * OPENCODE_BIN for the adapter: the bare checkout's bun launcher when present,
 * else a globally installed CLI. When bare, we also need the provider config so
 * the child opencode finds the model.
 */
export function settlementOpencodeEnv(reqEnv?: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = { ...opencodeRunEnv(reqEnv), ...reqEnv };
  const bare = opencodeBareEntry();
  if (bare) {
    const pkgDir = path.join(opencodeBareDir(), 'packages', 'opencode');
    env.OPENCODE_BIN = `bun run --cwd ${pkgDir} src/index.ts`;
  } else {
    env.OPENCODE_BIN = opencodeBin();
  }
  const model = opencodeProvider()
    ? `${opencodeProvider()!.providerId}/${opencodeProvider()!.modelId}`
    : opencodeModel();
  if (model) env.OPENCODE_MODEL = model;
  env.SETTLEMENT_HARNESS_DIR = settlementHarnessDir();
  return env;
}

export const settlementPipeline: CodingPipeline = {
  spec: {
    id: 'settlement',
    name: 'Settlement Harness',
    transport: 'subprocess',
    description: 'Admission + shadow-worktree + probe settlement loop over OpenCode.',
    capabilities: ['codegen', 'settlement', 'admission-gate', 'shadow-execution', 'cli'],
  },
  async status(): Promise<PipelineStatus> {
    const av = settlementHarnessAvailable();
    return {
      id: this.spec.id,
      name: this.spec.name,
      transport: this.spec.transport,
      available: av.ok,
      detail: av.detail,
      command: `tsx ${settlementLoopWrapperPath()} <contract> <worktree> "<adapter>"`,
    };
  },
  async run(req: PipelineRunRequest): Promise<PipelineRunResult> {
    const av = settlementHarnessAvailable();
    if (!av.ok) {
      return { ok: false, id: 'settlement', stdout: '', stderr: '', durationMs: 0, error: av.detail };
    }
    if (!req.contractPath) {
      return {
        ok: false,
        id: 'settlement',
        stdout: '',
        stderr: '',
        durationMs: 0,
        error: 'settlement pipeline requires contractPath (a stage-gated settlement contract)',
      };
    }
    if (!fs.existsSync(req.contractPath)) {
      return {
        ok: false,
        id: 'settlement',
        stdout: '',
        stderr: '',
        durationMs: 0,
        error: `contract not found: ${req.contractPath}`,
      };
    }

    const wrapper = settlementLoopWrapperPath();
    const agentExecutable = settlementAgentExecutable(req.workdir);
    const tsxCli = settlementTsxCli();
    const args = tsxCli
      ? [tsxCli, wrapper, req.contractPath, req.workdir, agentExecutable]
      : [wrapper, req.contractPath, req.workdir, agentExecutable];
    const command = tsxCli ? 'node' : 'npx';
    const commandArgs = tsxCli ? args : ['tsx', ...args];
    const res = await runProcess(command, commandArgs, {
      cwd: settlementHarnessDir(),
      env: settlementOpencodeEnv(req.env),
      timeoutMs: req.timeoutMs ?? Number(process.env.SETTLEMENT_TIMEOUT_MS || 900_000),
    });
    return {
      ok: res.ok,
      id: 'settlement',
      command: `${command} ${commandArgs.join(' ')}`,
      exitCode: res.code,
      stdout: res.stdout,
      stderr: res.stderr,
      durationMs: res.durationMs,
      error: res.error ?? (!res.ok ? lastLine(res.stderr) || `exit ${res.code ?? 'null'}` : undefined),
    };
  },
};
