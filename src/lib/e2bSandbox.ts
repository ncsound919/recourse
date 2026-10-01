// src/lib/e2bSandbox.ts
//
// E2B sandbox integration for executing generated code in full Linux
// environments. Complements the QuickJS sandbox with OS-level isolation,
// package installation, and filesystem persistence. Honest: when E2B is not
// configured, all operations report `active:false` — never fabricated results.

export interface E2bConfig {
  apiKey?: string;
  domain?: string;
}

export interface E2bExecutionResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
  durationMs: number;
}

export interface E2bSandboxStatus {
  active: boolean;
  configured: boolean;
  reason?: string;
}

let status: E2bSandboxStatus = { active: false, configured: false };

export function initE2b(config: E2bConfig = {}): E2bSandboxStatus {
  const apiKey = config.apiKey ?? process.env.E2B_API_KEY;
  if (!apiKey) {
    status = { active: false, configured: false, reason: 'E2B_API_KEY not set' };
    return status;
  }
  status = { active: true, configured: true };
  return status;
}

export function getE2bStatus(): E2bSandboxStatus {
  return status;
}

export async function executeInSandbox(
  code: string,
  opts: { language?: string; timeoutMs?: number; packages?: string[] } = {},
): Promise<E2bExecutionResult> {
  const started = Date.now();
  if (!status.active) {
    return {
      ok: false,
      stdout: '',
      stderr: '',
      exitCode: -1,
      error: 'E2B sandbox not configured',
      durationMs: Date.now() - started,
    };
  }

  try {
    const { Sandbox } = await import('@e2b/code-interpreter');
    const sandbox = await Sandbox.create();

    if (opts.packages && opts.packages.length > 0) {
      await sandbox.commands.run(`pip install ${opts.packages.join(' ')}`, { timeoutMs: 60000 });
    }

    const result = await sandbox.runCode(code, { language: opts.language ?? 'python' });
    await sandbox.kill();

    return {
      ok: result.error ? false : true,
      stdout: result.logs?.stdout?.join('') ?? '',
      stderr: result.logs?.stderr?.join('') ?? '',
      exitCode: result.error ? 1 : 0,
      error: result.error ? String(result.error) : undefined,
      durationMs: Date.now() - started,
    };
  } catch (err: any) {
    return {
      ok: false,
      stdout: '',
      stderr: '',
      exitCode: -1,
      error: err?.message || 'E2B execution failed',
      durationMs: Date.now() - started,
    };
  }
}

export async function checkE2bHealth(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const started = Date.now();
  if (!status.active) {
    return { ok: false, latencyMs: Date.now() - started, error: 'E2B not configured' };
  }
  try {
    const { Sandbox } = await import('@e2b/code-interpreter');
    const sandbox = await Sandbox.create({ apiKey: process.env.E2B_API_KEY, timeoutMs: 5000 });
    await sandbox.commands.run('echo ok');
    await sandbox.kill();
    return { ok: true, latencyMs: Date.now() - started };
  } catch (err: any) {
    return { ok: false, latencyMs: Date.now() - started, error: err?.message };
  }
}
