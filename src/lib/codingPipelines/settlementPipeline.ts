/**
 * Settlement pipeline — the settlement-harness supervisor.
 *
 * Drives OpenCode through admission gate -> shadow worktree -> probes ->
 * settlement receipt. This is the alternative harness: instead of letting the
 * agent write directly, every write is settled in an ephemeral worktree first.
 *
 * The harness lives outside this repo (default ~/Downloads/settlement-harness,
 * override with SETTLEMENT_HARNESS_DIR) and is launched with tsx. A contract
 * path is required — without one the run fails honestly rather than guessing.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { CodingPipeline, PipelineRunRequest, PipelineRunResult, PipelineStatus } from './types.js';
import { commandExists, lastLine, runProcess } from './subprocess.js';
import { opencodeBin } from './opencodePipeline.js';

export function settlementHarnessDir(): string {
  return (
    process.env.SETTLEMENT_HARNESS_DIR?.trim() ||
    path.join(os.homedir(), 'Downloads', 'settlement-harness')
  );
}

export function settlementSupervisorPath(): string {
  return path.join(settlementHarnessDir(), 'settlement-supervisor.ts');
}

export async function settlementHarnessAvailable(): Promise<{ ok: boolean; detail: string }> {
  const dir = settlementHarnessDir();
  if (!fs.existsSync(dir)) return { ok: false, detail: `harness dir not found: ${dir}` };
  if (!fs.existsSync(settlementSupervisorPath())) {
    return { ok: false, detail: `supervisor not found: ${settlementSupervisorPath()}` };
  }
  if (!commandExists('npx')) return { ok: false, detail: "npx not found on PATH (needed to run tsx)" };
  return { ok: true, detail: 'supervisor present' };
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
    const av = await settlementHarnessAvailable();
    return {
      id: this.spec.id,
      name: this.spec.name,
      transport: this.spec.transport,
      available: av.ok,
      detail: av.detail,
      command: `npx tsx ${settlementSupervisorPath()}`,
    };
  },
  async run(req: PipelineRunRequest): Promise<PipelineRunResult> {
    const av = await settlementHarnessAvailable();
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

    const args = [
      'tsx',
      settlementSupervisorPath(),
      req.contractPath,
      req.workdir,
      opencodeBin(),
    ];
    const res = await runProcess('npx', args, {
      cwd: settlementHarnessDir(),
      env: req.env,
      timeoutMs: req.timeoutMs,
    });
    return {
      ok: res.ok,
      id: 'settlement',
      command: `npx ${args.join(' ')}`,
      exitCode: res.code,
      stdout: res.stdout,
      stderr: res.stderr,
      durationMs: res.durationMs,
      error: res.error ?? (!res.ok ? lastLine(res.stderr) || `exit ${res.code ?? 'null'}` : undefined),
    };
  },
};
