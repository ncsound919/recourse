/**
 * deploy.ts — the deployment actuator (Wave 2). Turns Recourse from a system
 * that can only edit code into one that can ship and roll back a running
 * service — safely, because every command is injected and every plan has an
 * explicit rollback step.
 *
 * The command runner is injected, so the plan/rollback logic is unit-testable
 * without Docker. `defaultCommandRunner` executes an argv array directly (no
 * shell) with a hard timeout.
 */
import { execFile } from 'node:child_process';

export interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number;
}

export interface CommandRunOptions {
  cwd: string;
  timeoutMs?: number;
}

export type CommandRunner = (argv: string[], opts: CommandRunOptions) => Promise<CommandResult>;

export interface DeployStepResult {
  name: string;
  ok: boolean;
  detail: string;
  durationMs: number;
}

export interface DeployContext {
  service: string;
  cwd: string;
  run: CommandRunner;
  timeoutMs: number;
}

export interface DeployStep {
  name: string;
  run(ctx: DeployContext): Promise<void> | void;
}

export interface DeployPlan {
  service: string;
  cwd: string;
  steps: DeployStep[];
  rollback?: DeployStep[];
}

export interface DeployOptions {
  timeoutMs?: number;
  dryRun?: boolean;
  now?: () => number;
}

export interface DeployRunResult {
  ok: boolean;
  service: string;
  dryRun: boolean;
  steps: DeployStepResult[];
  rolledBack: boolean;
  error?: string;
  durationMs: number;
}

const DEFAULT_TIMEOUT_MS = 180_000;

/** Real runner: argv array, no shell, hard timeout, windowsHide. */
export const defaultCommandRunner: CommandRunner = (argv, opts) =>
  new Promise<CommandResult>((resolve) => {
    const [bin, ...args] = argv;
    execFile(
      bin,
      args,
      { cwd: opts.cwd, timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, windowsHide: true, encoding: 'utf8' },
      (err: any, stdout: string, stderr: string) => {
        if (err) {
          resolve({ ok: false, stdout: stdout ?? '', stderr: stderr || String(err.message ?? err), code: Number(err.code) || 1 });
        } else {
          resolve({ ok: true, stdout: stdout ?? '', stderr: stderr ?? '', code: 0 });
        }
      },
    );
  });

/** Poll a health URL until it returns 2xx or attempts are exhausted. */
export async function waitForHealthy(
  url: string,
  opts: { attempts?: number; intervalMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<{ ok: boolean; attempts: number; detail: string }> {
  const attempts = Math.max(1, opts.attempts ?? 15);
  const intervalMs = Math.max(0, opts.intervalMs ?? 1000);
  const doFetch = opts.fetchImpl ?? fetch;
  let last = '';
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await doFetch(url);
      if (res.ok) return { ok: true, attempts: i + 1, detail: `healthy after ${i + 1} attempt(s)` };
      last = `HTTP ${res.status}`;
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
    if (intervalMs > 0 && i < attempts - 1) await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { ok: false, attempts, detail: `unhealthy after ${attempts} attempts: ${last}` };
}

/**
 * Build a docker-compose deploy plan for one service: build, up, then health
 * gate. Rollback recreates the service to its previous image (down + up).
 */
export function buildDockerComposePlan(opts: {
  service: string;
  cwd: string;
  healthUrl?: string;
  composeFile?: string;
  fetchImpl?: typeof fetch;
}): DeployPlan {
  const composeArgs = opts.composeFile ? ['-f', opts.composeFile] : [];
  const step = (name: string, argv: string[]): DeployStep => ({
    name,
    async run(ctx) {
      const res = await ctx.run(argv, { cwd: ctx.cwd, timeoutMs: ctx.timeoutMs });
      if (!res.ok) throw new Error(`${name} failed (code ${res.code}): ${(res.stderr || res.stdout).slice(0, 400)}`);
    },
  });

  const steps: DeployStep[] = [
    step('compose build', ['docker', 'compose', ...composeArgs, 'build', opts.service]),
    step('compose up', ['docker', 'compose', ...composeArgs, 'up', '-d', opts.service]),
  ];

  if (opts.healthUrl) {
    const healthUrl = opts.healthUrl;
    steps.push({
      name: 'health gate',
      async run() {
        const health = await waitForHealthy(healthUrl, { fetchImpl: opts.fetchImpl });
        if (!health.ok) throw new Error(health.detail);
      },
    });
  }

  const rollback: DeployStep[] = [
    step('compose rollback (recreate)', ['docker', 'compose', ...composeArgs, 'up', '-d', '--no-deps', '--force-recreate', opts.service]),
  ];

  return { service: opts.service, cwd: opts.cwd, steps, rollback };
}

/** Execute a plan; on any step failure run the rollback steps. */
export async function runDeployPlan(
  plan: DeployPlan,
  runner: CommandRunner = defaultCommandRunner,
  opts: DeployOptions = {},
): Promise<DeployRunResult> {
  const now = opts.now ?? (() => Date.now());
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const started = now();
  const ctx: DeployContext = { service: plan.service, cwd: plan.cwd, run: runner, timeoutMs };
  const steps: DeployStepResult[] = [];

  if (opts.dryRun) {
    return {
      ok: true,
      service: plan.service,
      dryRun: true,
      steps: plan.steps.map((s) => ({ name: s.name, ok: true, detail: 'planned (dry run)', durationMs: 0 })),
      rolledBack: false,
      durationMs: 0,
    };
  }

  for (const s of plan.steps) {
    const t0 = now();
    try {
      await s.run(ctx);
      steps.push({ name: s.name, ok: true, detail: 'ok', durationMs: Math.max(0, now() - t0) });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      steps.push({ name: s.name, ok: false, detail, durationMs: Math.max(0, now() - t0) });
      let rolledBack = false;
      if (plan.rollback && plan.rollback.length > 0) {
        for (const rb of plan.rollback) {
          try {
            await rb.run(ctx);
            rolledBack = true;
          } catch {
            /* best-effort rollback */
          }
        }
      }
      return {
        ok: false,
        service: plan.service,
        dryRun: false,
        steps,
        rolledBack,
        error: `${s.name}: ${detail}`,
        durationMs: Math.max(0, now() - started),
      };
    }
  }

  return { ok: true, service: plan.service, dryRun: false, steps, rolledBack: false, durationMs: Math.max(0, now() - started) };
}
