/**
 * Subprocess helper shared by the CLI-based coding pipelines.
 *
 * Deliberately small and dependency-free: resolve an executable + args, run it
 * with a hard timeout, and capture stdout/stderr. Never throws on a non-zero
 * exit — callers decide whether an exit code is fatal. A spawn failure (ENOENT
 * and friends) is reported as `ok:false` with the real message.
 */

import { spawn } from 'node:child_process';

export interface SpawnOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  /** Cap retained output so a runaway agent can't exhaust memory. */
  maxOutputBytes?: number;
}

export interface SpawnResult {
  ok: boolean;
  command: string;
  args: string[];
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  error?: string;
}

const DEFAULT_MAX_OUTPUT = 512 * 1024;

/** True when a CLI named `command` is on PATH (best-effort, no shell). */
export function commandExists(command: string): boolean {
  const { spawnSync } = require('node:child_process') as typeof import('node:child_process');
  const probe = process.platform === 'win32' ? 'where' : 'which';
  try {
    const res = spawnSync(probe, [command], { stdio: 'ignore' });
    return res.status === 0;
  } catch {
    return false;
  }
}

export function runProcess(command: string, args: string[], opts: SpawnOptions = {}): Promise<SpawnResult> {
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const maxOutputBytes = opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;
  const started = Date.now();

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, {
        cwd: opts.cwd,
        env: { ...process.env, ...(opts.env ?? {}) },
        stdio: ['ignore', 'pipe', 'pipe'],
        // Node/libuv resolves PATHEXT entries on Windows, so a bare `opencode`
        // finds opencode.cmd without a shell. No shell => no argument injection.
        shell: false,
      });
    } catch (err) {
      resolve({
        ok: false,
        command,
        args,
        code: null,
        signal: null,
        stdout: '',
        stderr: '',
        durationMs: Date.now() - started,
        timedOut: false,
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const append = (buf: Buffer, which: 'stdout' | 'stderr') => {
      const chunk = buf.toString('utf-8');
      if (which === 'stdout') {
        if (stdout.length < maxOutputBytes) stdout += chunk;
      } else if (stderr.length < maxOutputBytes) {
        stderr += chunk;
      }
    };

    child.stdout?.on('data', (b: Buffer) => append(b, 'stdout'));
    child.stderr?.on('data', (b: Buffer) => append(b, 'stderr'));

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        command,
        args,
        code: null,
        signal: null,
        stdout,
        stderr,
        durationMs: Date.now() - started,
        timedOut,
        error: err.message,
      });
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        ok: !timedOut && code === 0,
        command,
        args,
        code,
        signal,
        stdout,
        stderr,
        durationMs: Date.now() - started,
        timedOut,
        error: timedOut ? `Timed out after ${timeoutMs}ms` : undefined,
      });
    });
  });
}
