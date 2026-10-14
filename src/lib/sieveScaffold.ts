/**
 * sieveScaffold.ts — the Recourse → SIEVE scaffold client.
 *
 * Recourse does NOT re-implement Cheetah confinement: SIEVE's scaffold.mjs owns
 * the single hardened door (resolved-project-root containment, generator-only
 * command allow-list). This client just calls it over HTTP. Fail-open with an
 * honest reason — the factory reports "engine offline", it never fabricates an
 * artifact.
 */
const DEFAULT_BASE = process.env.SIEVE_URL || 'http://127.0.0.1:3072';
const TIMEOUT_MS = Number(process.env.RECOURSE_SCAFFOLD_TIMEOUT_MS) || 180000;

function joinUrl(base: string, path: string): string {
  const b = String(base ?? '').replace(/\/+$/, '');
  return b + (path.startsWith('/') ? path : `/${path}`);
}

export interface ScaffoldEngineResult {
  available: boolean;
  ok: boolean;
  reason?: string;
  command?: string;
  cwd?: string;
  files?: string[];
  result?: unknown;
  stderr?: string | null;
}

/** Run one Cheetah generator command through SIEVE. Never throws. */
export async function runScaffoldOnSieve(
  request: { command: string; args: string[]; cwd?: string; dryRun?: boolean },
  opts: { base?: string; timeoutMs?: number } = {},
): Promise<ScaffoldEngineResult> {
  const url = joinUrl(opts.base || DEFAULT_BASE, '/scaffold');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        command: request.command,
        args: request.args,
        ...(request.cwd ? { cwd: request.cwd } : {}),
        ...(request.dryRun ? { dry_run: true } : {}),
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { available: true, ok: false, reason: `sieve /scaffold -> ${res.status}: ${String(body.error ?? body.reason ?? '')}` };
    }
    return {
      available: body.available !== false,
      ok: body.ok === true,
      ...(typeof body.reason === 'string' ? { reason: body.reason } : {}),
      ...(typeof body.command === 'string' ? { command: body.command } : {}),
      ...(typeof body.cwd === 'string' ? { cwd: body.cwd } : {}),
      files: Array.isArray(body.files) ? (body.files as unknown[]).map(String) : [],
      result: body.result ?? null,
      stderr: typeof body.stderr === 'string' ? body.stderr : null,
    };
  } catch (err) {
    return { available: false, ok: false, reason: `sieve unreachable: ${(err as Error)?.message || String(err)}` };
  }
}

/** Is the deterministic engine reachable and its CLI present? */
export async function scaffoldEngineStatus(opts: { base?: string } = {}): Promise<Record<string, unknown>> {
  const url = joinUrl(opts.base || DEFAULT_BASE, '/scaffold');
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { available: false, reason: `sieve /scaffold -> ${res.status}` };
    return { available: true, ...(await res.json().catch(() => ({}))) };
  } catch (err) {
    return { available: false, reason: `sieve unreachable: ${(err as Error)?.message || String(err)}` };
  }
}
