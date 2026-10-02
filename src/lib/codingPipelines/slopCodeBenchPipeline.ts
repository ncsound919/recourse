/**
 * SlopCodeBench pipeline — iterative specification refinement benchmark.
 *
 * Wraps the SlopCodeBench (SCBench) Python CLI to evaluate coding agents
 * under iterative spec refinement. The agent implements a spec, then extends
 * its own code as the spec changes — exposing path dependence, non-convergence,
 * and structural erosion that single-shot benchmarks miss.
 *
 * SCBench is `mode: 'standalone'`: it drives its own Docker-based problems and
 * never writes to the benchmark worktree, so it is excluded from the worktree
 * head-to-head runner (see `types.ts`). It is driven through its own
 * `/api/recourse/slopbench/*` surface instead.
 *
 * Requirements: Python 3.12+ with uv, a running Docker daemon, and an API key
 * for the chosen agent (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.).
 *
 * Per-run configuration is threaded through `PipelineRunRequest.env` using the
 * `SLOP_CODE_*` keys below; `process.env` is the fallback. This is what makes
 * the `problems`/`agent`/`model`/`environment`/`prompt` arguments on the HTTP
 * route real rather than decorative.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { CodingPipeline, PipelineRunRequest, PipelineRunResult, PipelineStatus } from './types.js';
import { commandExists, lastLine, runProcess } from './subprocess.js';

/** Environment keys a caller may set (via `req.env` or the process) per run. */
export const SLOP_CODE_ENV_KEYS = {
  dir: 'SLOP_CODE_DIR',
  bin: 'SLOP_CODE_BIN',
  agent: 'SLOP_CODE_AGENT',
  model: 'SLOP_CODE_MODEL',
  environment: 'SLOP_CODE_ENVIRONMENT',
  prompt: 'SLOP_CODE_PROMPT',
  problems: 'SLOP_CODE_PROBLEMS',
  timeoutMs: 'SLOP_CODE_TIMEOUT_MS',
} as const;

type EnvOverrides = Record<string, string> | undefined;

/** Resolve one config value: request override → process env → fallback. */
function pick(env: EnvOverrides, key: string, fallback: string): string {
  const fromReq = env?.[key];
  if (typeof fromReq === 'string' && fromReq.trim()) return fromReq.trim();
  const fromProc = process.env[key];
  if (typeof fromProc === 'string' && fromProc.trim()) return fromProc.trim();
  return fallback;
}

export function slopCodeBin(env?: EnvOverrides): string {
  return pick(env, SLOP_CODE_ENV_KEYS.bin, 'slop-code');
}

/** True when a directory looks like a SlopCodeBench checkout. */
function looksLikeCheckout(dir: string): boolean {
  return (
    fs.existsSync(path.join(dir, 'pyproject.toml')) &&
    fs.existsSync(path.join(dir, 'src', 'slop_code'))
  );
}

/**
 * Resolve the SlopCodeBench checkout directory.
 *
 * Env override first, then a small candidate list (the sibling checkout used in
 * this workspace, and the documented home location). Never uses `__dirname` /
 * `import.meta.url`: recourse runs as ESM in dev (tsx) and as a CJS bundle in
 * prod, so neither is safe across both.
 */
export function slopCodeDir(env?: EnvOverrides): string {
  const explicit = env?.[SLOP_CODE_ENV_KEYS.dir]?.trim() || process.env[SLOP_CODE_ENV_KEYS.dir]?.trim();
  if (explicit) return explicit;
  const candidates = [
    path.resolve(process.cwd(), '..', 'slop-code-bench'),
    path.join(os.homedir(), 'Downloads', 'BUSINESS', 'INFRASTRUCTURE', 'slop-code-bench'),
    path.resolve(process.cwd(), 'slop-code-bench'),
  ];
  for (const candidate of candidates) {
    if (looksLikeCheckout(candidate)) return candidate;
  }
  // Nothing matched: name the primary candidate so the error is actionable.
  return candidates[0];
}

export function slopCodeAgent(env?: EnvOverrides): string {
  return pick(env, SLOP_CODE_ENV_KEYS.agent, 'claude_code');
}

export function slopCodeModel(env?: EnvOverrides): string {
  return pick(env, SLOP_CODE_ENV_KEYS.model, 'anthropic/opus-4.5');
}

export function slopCodeEnvironment(env?: EnvOverrides): string {
  return pick(env, SLOP_CODE_ENV_KEYS.environment, 'configs/environments/docker-python3.12-uv.yaml');
}

export function slopCodePrompt(env?: EnvOverrides): string {
  return pick(env, SLOP_CODE_ENV_KEYS.prompt, 'configs/prompts/just-solve.jinja');
}

export function slopCodeProblems(env?: EnvOverrides): string[] {
  const raw = pick(env, SLOP_CODE_ENV_KEYS.problems, 'file_backup,execution_server');
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function slopCodeTimeoutMs(env?: EnvOverrides): number {
  const raw = pick(env, SLOP_CODE_ENV_KEYS.timeoutMs, '1800000');
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1_800_000;
}

/** Check if the slop-code CLI is available. */
export function slopCodeAvailable(env?: EnvOverrides): boolean {
  return commandExists(slopCodeBin(env));
}

/** Check if Docker is running (required for SCBench environments). */
export async function dockerAvailable(): Promise<boolean> {
  try {
    const res = await runProcess('docker', ['ps'], { timeoutMs: 5000 });
    return res.ok;
  } catch {
    return false;
  }
}

/** Check if uv is available (required for SCBench Python env). */
export function uvAvailable(): boolean {
  return commandExists('uv');
}

/** Sorted run-directory names under `<dir>/outputs`, newest last. */
function listRunDirs(dir: string): string[] {
  const outputsDir = path.join(dir, 'outputs');
  if (!fs.existsSync(outputsDir)) return [];
  try {
    return fs.readdirSync(outputsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

export const slopCodeBenchPipeline: CodingPipeline = {
  spec: {
    id: 'slopcodebench',
    name: 'SlopCodeBench',
    transport: 'subprocess',
    mode: 'standalone',
    description: 'Iterative specification refinement benchmark measuring code erosion under spec changes.',
    capabilities: ['benchmark', 'iterative', 'code-erosion', 'docker', 'metrics'],
  },
  async status(): Promise<PipelineStatus> {
    const bin = slopCodeBin();
    const cliOk = slopCodeAvailable();
    const uvOk = uvAvailable();
    const dockerOk = await dockerAvailable();
    const dir = slopCodeDir();
    const dirOk = looksLikeCheckout(dir);

    const blockers: string[] = [];
    if (!cliOk) blockers.push(`'${bin}' not on PATH`);
    if (!uvOk) blockers.push('uv not on PATH');
    if (!dockerOk) blockers.push('Docker daemon not running');
    if (!dirOk) blockers.push(`checkout not found at ${dir}`);

    const available = cliOk && uvOk && dockerOk && dirOk;
    return {
      id: this.spec.id,
      name: this.spec.name,
      transport: this.spec.transport,
      available,
      detail: available
        ? `CLI ready (agent: ${slopCodeAgent()}, model: ${slopCodeModel()})`
        : blockers.join('; '),
      command: bin,
    };
  },
  async run(req: PipelineRunRequest): Promise<PipelineRunResult> {
    const started = Date.now();
    const env = req.env;
    const bin = slopCodeBin(env);
    const dir = slopCodeDir(env);
    const agent = slopCodeAgent(env);
    const model = slopCodeModel(env);
    const envFile = slopCodeEnvironment(env);
    const promptFile = slopCodePrompt(env);
    const problems = slopCodeProblems(env);
    const timeoutMs = req.timeoutMs ?? slopCodeTimeoutMs(env);

    if (!looksLikeCheckout(dir)) {
      return {
        ok: false,
        id: 'slopcodebench',
        command: bin,
        stdout: '',
        stderr: `SlopCodeBench checkout not found at ${dir}`,
        durationMs: Date.now() - started,
        error: `SlopCodeBench not found at ${dir}. Clone it and set SLOP_CODE_DIR.`,
      };
    }

    const before = listRunDirs(dir);
    const args = [
      'run',
      '--agent', agent,
      '--model', model,
      '--environment', envFile,
      '--prompt', promptFile,
      ...problems.flatMap((p) => ['--problem', p]),
    ];

    const res = await runProcess(bin, args, {
      cwd: dir,
      env: {
        ...env,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',
      },
      timeoutMs,
    });

    // The run directory is whatever appeared under outputs/ during this run;
    // fall back to the newest if the CLI reused an existing dir.
    const after = listRunDirs(dir);
    const created = after.filter((name) => !before.includes(name));
    const newest = created.length > 0 ? created[created.length - 1] : after[after.length - 1];
    const runDir = newest ? path.join(dir, 'outputs', newest) : undefined;

    return {
      ok: res.ok,
      id: 'slopcodebench',
      command: [bin, ...args].join(' '),
      exitCode: res.code,
      stdout: res.stdout,
      stderr: res.stderr,
      durationMs: res.durationMs,
      ...(runDir ? { runDir } : {}),
      error: res.error ?? (!res.ok ? lastLine(res.stderr) || `exit ${res.code ?? 'null'}` : undefined),
    };
  },
};
