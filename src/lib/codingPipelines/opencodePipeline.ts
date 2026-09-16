/**
 * OpenCode pipeline — bare upstream checkout.
 *
 * Runs the unmodified opencode from GitHub (default
 * ~/Downloads/bare-harnesses/opencode, override OPENCODE_BARE_DIR) via bun:
 *   bun run --cwd <bare>/packages/opencode src/index.ts run --dir <worktree> <task>
 *
 * `--dir` makes opencode operate on the benchmark's ephemeral worktree while
 * bun resolves the checkout's own workspace. If no bare checkout is present the
 * pipeline falls back to a globally installed `opencode` CLI (OPENCODE_BIN) so
 * the harness still works.
 *
 * Model: set OPENCODE_MODEL (`provider/model`) to pin one; otherwise the bare
 * checkout's own config decides. OPENCODE_EXTRA_ARGS adds flags.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { CodingPipeline, PipelineRunRequest, PipelineRunResult, PipelineStatus } from './types.js';
import { commandExists, lastLine, runProcess } from './subprocess.js';
import { harnessProvenance } from './provenance.js';

export function opencodeBin(): string {
  return process.env.OPENCODE_BIN?.trim() || 'opencode';
}

export function opencodeBareDir(): string {
  return (
    process.env.OPENCODE_BARE_DIR?.trim() ||
    path.join(os.homedir(), 'Downloads', 'bare-harnesses', 'opencode')
  );
}

export function opencodeBareEntry(): string | null {
  const entry = path.join(opencodeBareDir(), 'packages', 'opencode', 'src', 'index.ts');
  return fs.existsSync(entry) ? entry : null;
}

export function opencodeModel(): string | undefined {
  return (
    process.env.OPENCODE_MODEL?.trim() ||
    process.env.PIPELINE_MODEL?.trim() ||
    undefined
  );
}

interface OpenAiCompatibleProvider {
  providerId: string;
  modelId: string;
  baseUrl: string;
  apiKey: string;
}

/**
 * Resolve an OpenAI-compatible provider from the environment. Defaults to the
 * repo's own Phoenix Grove endpoint (API_MODEL_*) so the bare checkout can run
 * without any local config; OPENCODE_* vars take precedence.
 */
export function opencodeProvider(): OpenAiCompatibleProvider | null {
  const baseUrl = (process.env.OPENCODE_BASE_URL || process.env.API_MODEL_BASE_URL || '').trim();
  const apiKey = (process.env.OPENCODE_API_KEY || process.env.API_MODEL_API_KEY || process.env.PHOENIX_API_KEY || '').trim();
  if (!baseUrl || !apiKey) return null;

  const explicit = opencodeModel();
  let providerId = process.env.OPENCODE_PROVIDER_ID?.trim() || 'pgsgrove';
  let modelId = (process.env.API_MODEL_NAME || '').trim() || 'deepseek-v4-flash-0731';
  if (explicit?.includes('/')) {
    providerId = explicit.split('/')[0];
    modelId = explicit.split('/').slice(1).join('/');
  } else if (explicit) {
    modelId = explicit;
  }
  return { providerId, modelId, baseUrl: baseUrl.replace(/\/+$/, ''), apiKey };
}

/**
 * Build the child environment for a bare run, injecting an
 * OPENCODE_CONFIG_CONTENT provider block when no config is already supplied.
 */
export function opencodeRunEnv(extra?: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = { ...extra };
  if (!process.env.OPENCODE_CONFIG_CONTENT && !process.env.OPENCODE_CONFIG) {
    const p = opencodeProvider();
    if (p) {
      env.OPENCODE_CONFIG_CONTENT = JSON.stringify({
        $schema: 'https://opencode.ai/config.json',
        provider: {
          [p.providerId]: {
            npm: '@ai-sdk/openai-compatible',
            name: 'Phoenix Grove',
            options: { baseURL: p.baseUrl, apiKey: p.apiKey },
            models: { [p.modelId]: { name: p.modelId } },
          },
        },
        model: `${p.providerId}/${p.modelId}`,
      });
    }
  }
  return env;
}

export function extraArgs(): string[] {
  const raw = process.env.OPENCODE_EXTRA_ARGS?.trim();
  return raw ? raw.split(/\s+/).filter(Boolean) : [];
}

/** Fallback path: a globally installed opencode CLI. */
export async function runOpencodeLike(
  id: 'opencode' | 'deepseek',
  req: PipelineRunRequest,
  model?: string
): Promise<PipelineRunResult> {
  const command = opencodeBin();
  const args = ['run'];
  if (model) args.push('--model', model);
  args.push(...extraArgs(), req.task);
  const res = await runProcess(command, args, {
    cwd: req.workdir,
    env: opencodeRunEnv(req.env),
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
    error: res.error ?? (!res.ok ? lastLine(res.stderr) || `exit ${res.code ?? 'null'}` : undefined),
  };
}

/** Bare path: run the fresh upstream checkout through bun. */
export async function runBareOpencode(req: PipelineRunRequest): Promise<PipelineRunResult> {
  const bareDir = opencodeBareDir();
  const pkgDir = path.join(bareDir, 'packages', 'opencode');
  const provider = opencodeProvider();
  const explicit = opencodeModel();
  const model = provider ? `${provider.providerId}/${provider.modelId}` : explicit?.includes('/') ? explicit : undefined;
  const args = [
    'run',
    '--cwd',
    pkgDir,
    'src/index.ts',
    'run',
    '--dir',
    req.workdir,
    ...(model ? ['--model', model] : []),
    ...extraArgs(),
    req.task,
  ];
  const res = await runProcess('bun', args, {
    cwd: bareDir,
    env: opencodeRunEnv(req.env),
    timeoutMs: req.timeoutMs,
  });
  return {
    ok: res.ok,
    id: 'opencode',
    command: `bun ${args.join(' ')}`,
    exitCode: res.code,
    stdout: res.stdout,
    stderr: res.stderr,
    durationMs: res.durationMs,
    error: res.error ?? (!res.ok ? lastLine(res.stderr) || `exit ${res.code ?? 'null'}` : undefined),
  };
}

export const opencodePipeline: CodingPipeline = {
  spec: {
    id: 'opencode',
    name: 'OpenCode (bare)',
    transport: 'subprocess',
    description: 'Unmodified upstream opencode checkout, run through bun.',
    capabilities: ['codegen', 'cli', 'opencode', 'bare'],
  },
  async status(): Promise<PipelineStatus> {
    const bareDir = opencodeBareDir();
    const bare = opencodeBareEntry();
    if (bare) {
      const rev = harnessProvenance(bareDir);
      const bunOk = commandExists('bun');
      return {
        id: this.spec.id,
        name: this.spec.name,
        transport: this.spec.transport,
        available: bunOk,
        detail: bunOk ? `bare checkout${rev ? ` ${rev}` : ''}` : 'bare checkout present but bun not on PATH',
        command: `bun run --cwd ${path.join(bareDir, 'packages', 'opencode')} src/index.ts run`,
        ...(rev ? { version: rev } : {}),
      };
    }
    const command = opencodeBin();
    const available = commandExists(command);
    return {
      id: this.spec.id,
      name: this.spec.name,
      transport: this.spec.transport,
      available,
      detail: available ? `CLI on PATH (${command})` : `no bare checkout and '${command}' not on PATH`,
      command,
    };
  },
  run(req): Promise<PipelineRunResult> {
    return opencodeBareEntry() ? runBareOpencode(req) : runOpencodeLike('opencode', req, opencodeModel());
  },
};
