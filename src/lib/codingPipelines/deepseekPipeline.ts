/**
 * DeepSeek Harness pipeline — bare upstream checkout.
 *
 * Runs DeepSeek's own agent harness (`dsh`) from the unmodified GitHub
 * checkout (default ~/Downloads/bare-harnesses/deepseek-harness, override
 * DEEPSEEK_BARE_DIR). The headless profile is a one-shot runner:
 *   node <bare>/apps/cli/lib/bin.js --profile headless "<task>"
 * It answers one task, prints the final answer to stdout, and exits — exactly
 * the shape a benchmark wants. Run from the worktree so the agent's working
 * directory is the worktree.
 *
 * The bare checkout must be built once (`pnpm install && pnpm run build`);
 * `apps/cli/lib/bin.js` is the built entry. If it is missing the pipeline
 * reports unavailable with that instruction rather than failing opaquely.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { CodingPipeline, PipelineRunRequest, PipelineRunResult, PipelineStatus } from './types.js';
import { commandExists, lastLine, runProcess } from './subprocess.js';
import { harnessProvenance } from './provenance.js';

export function deepseekBareDir(): string {
  return (
    process.env.DEEPSEEK_BARE_DIR?.trim() ||
    path.join(os.homedir(), 'Downloads', 'bare-harnesses', 'deepseek-harness')
  );
}

export function dshBin(): string {
  return path.join(deepseekBareDir(), 'apps', 'cli', 'lib', 'bin.js');
}

export function deepseekProfile(): string {
  return process.env.DEEPSEEK_PROFILE?.trim() || 'headless';
}

interface DeepseekLlmConfig {
  baseUrl: string;
  protocol: 'chat-completions' | 'messages';
  model: string;
  apiKey: string;
}

/**
 * Resolve the DeepSeek route from the environment. Defaults to the repo's
 * OpenAI-compatible Phoenix Grove endpoint when its API_MODEL_* vars are set,
 * so the bare harness runs without editing its profile. DEEPSEEK_* overrides.
 */
export function deepseekLlmConfig(): DeepseekLlmConfig | null {
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || process.env.API_MODEL_BASE_URL || '').trim();
  const apiKey = (process.env.DEEPSEEK_API_KEY || process.env.API_MODEL_API_KEY || process.env.PHOENIX_API_KEY || '').trim();
  const model = (process.env.DEEPSEEK_MODEL || process.env.API_MODEL_NAME || '').trim();
  if (!baseUrl || !apiKey || !model) return null;
  const protocol = process.env.DEEPSEEK_PROTOCOL?.trim() === 'messages' ? 'messages' : 'chat-completions';
  return { baseUrl: baseUrl.replace(/\/+$/, ''), protocol, model, apiKey };
}

/**
 * The harness composes its sandbox from `$DSH_HOME` profiles and pins the
 * filesystem workspace to the process cwd at boot; booting from an external
 * worktree fails with `FileSystem.access`. A `--patch` overlay pins the
 * workspace explicitly, so we boot from the checkout and point fs/sandbox at
 * the benchmark worktree. When a provider endpoint is configured it is pinned
 * here too, so the same overlay carries workspace + model route. YAML strings
 * are quoted so Windows drive letters and spaces survive.
 */
export function writeWorkspaceOverlay(workdir: string): string {
  const file = path.join(os.tmpdir(), `dsh-workspace-${process.pid}-${Date.now()}.yml`);
  const wd = workdir.split(path.sep).join('/');
  const mode = process.env.DSH_PERMISSION_MODE?.trim() || 'workspace-write';
  const lines = [
    '- id: sandbox-policy',
    '  config:',
    `    mode: ${mode}`,
    `    workspaceRoot: "${wd}"`,
    '- id: fs-sandbox',
    '  config:',
    `    cwd: "${wd}"`,
  ];
  const llm = deepseekLlmConfig();
  if (llm) {
    lines.push(
      '- id: llm-deepseek',
      '  config:',
      `    protocol: ${llm.protocol}`,
      `    baseURL: "${llm.baseUrl}"`,
      '- id: agent-default-model',
      '  config:',
      '    provider: deepseek-official',
      `    model: "${llm.model}"`,
    );
  }
  lines.push('');
  fs.writeFileSync(file, lines.join('\n'), 'utf-8');
  return file;
}

export const deepseekPipeline: CodingPipeline = {
  spec: {
    id: 'deepseek',
    name: 'DeepSeek Harness (bare)',
    transport: 'subprocess',
    description: "Unmodified upstream DeepSeek Harness (dsh) headless one-shot runner.",
    capabilities: ['codegen', 'cli', 'deepseek', 'dsh', 'bare'],
  },
  async status(): Promise<PipelineStatus> {
    const dir = deepseekBareDir();
    const bin = dshBin();
    const nodeOk = commandExists('node');
    const rev = harnessProvenance(dir);
    if (!fs.existsSync(bin)) {
      return {
        id: this.spec.id,
        name: this.spec.name,
        transport: this.spec.transport,
        available: false,
        detail: `built entry missing: ${bin} (run 'pnpm install && pnpm run build' in the bare checkout)`,
        command: `node ${bin}`,
        ...(rev ? { version: rev } : {}),
      };
    }
    return {
      id: this.spec.id,
      name: this.spec.name,
      transport: this.spec.transport,
      available: nodeOk,
      detail: nodeOk ? `bare checkout${rev ? ` ${rev}` : ''}` : 'node not on PATH',
      command: `node ${bin} --profile ${deepseekProfile()}`,
      ...(rev ? { version: rev } : {}),
    };
  },
  async run(req: PipelineRunRequest): Promise<PipelineRunResult> {
    const bin = dshBin();
    if (!fs.existsSync(bin)) {
      return {
        ok: false,
        id: 'deepseek',
        stdout: '',
        stderr: '',
        durationMs: 0,
        error: `dsh built entry missing: ${bin} (run 'pnpm install && pnpm run build')`,
      };
    }
    const overlay = writeWorkspaceOverlay(req.workdir);
    const args = [bin, '--profile', deepseekProfile(), '--patch', overlay, req.task];
    const llm = deepseekLlmConfig();
    const env: Record<string, string> = { ...req.env };
    if (llm && !env.DEEPSEEK_API_KEY) env.DEEPSEEK_API_KEY = llm.apiKey;
    try {
      const res = await runProcess('node', args, {
        cwd: deepseekBareDir(),
        env,
        timeoutMs: req.timeoutMs,
      });
      return {
        ok: res.ok,
        id: 'deepseek',
        command: `node ${args.join(' ')}`,
        exitCode: res.code,
        stdout: res.stdout,
        stderr: res.stderr,
        durationMs: res.durationMs,
        error: res.error ?? (!res.ok ? lastLine(res.stderr) || `exit ${res.code ?? 'null'}` : undefined),
      };
    } finally {
      fs.rmSync(overlay, { force: true });
    }
  },
};
