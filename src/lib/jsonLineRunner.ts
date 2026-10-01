/**
 * Shared "spawn a runner, send one JSON line, parse the last JSON line back"
 * helper used by the Python sidecar bridges (translation, hackingtool).
 *
 * Hardening over the previous per-bridge copies:
 *  - stdin/stdout/stderr 'error' events are handled, so an EPIPE from a runner
 *    that died on startup can no longer surface as an unhandled stream error
 *    and take the whole server down;
 *  - stdout/stderr are capped (a chatty or runaway child can't grow the
 *    parent's heap without bound);
 *  - streams are decoded with setEncoding('utf8') so multi-byte characters
 *    split across chunk boundaries aren't corrupted;
 *  - the child is SIGKILLed on timeout if SIGTERM doesn't take.
 */
import { spawn } from 'child_process';

export interface JsonLineResult {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
  refused?: boolean;
}

export interface JsonLineRunOptions {
  python: string;
  runner: string;
  payload: unknown;
  timeoutMs: number;
  /** Prefix for error messages, e.g. "translation engine". */
  label: string;
  /** Max bytes buffered from stdout / stderr each. Default 4 MiB. */
  maxOutputBytes?: number;
}

const DEFAULT_MAX_OUTPUT = 4 * 1024 * 1024;

export function runJsonLine(opts: JsonLineRunOptions): Promise<JsonLineResult> {
  const { python, runner, payload, timeoutMs, label } = opts;
  const maxOut = opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;

  return new Promise((resolve) => {
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(python, [runner], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      resolve({ ok: false, error: `${label} spawn failed: ${err instanceof Error ? err.message : String(err)}` });
      return;
    }

    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;
    const finish = (r: JsonLineResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };

    const timer = setTimeout(() => {
      try { proc.kill(); } catch { /* already dead */ }
      killTimer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* gone */ } }, 2000);
      killTimer.unref?.();
      finish({ ok: false, error: `${label} timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    let out = '';
    let errOut = '';
    let truncated = false;
    proc.stdout!.setEncoding('utf8');
    proc.stderr!.setEncoding('utf8');
    proc.stdout!.on('data', (d: string) => {
      if (out.length + d.length > maxOut) { truncated = true; out = (out + d).slice(-maxOut); }
      else out += d;
    });
    proc.stderr!.on('data', (d: string) => {
      if (errOut.length < maxOut) errOut += d.slice(0, maxOut - errOut.length);
    });
    // Stream errors (EPIPE when the child exits before reading stdin) must be
    // swallowed here — the 'error'/'close' handlers below report the outcome.
    const ignore = () => { /* reported via proc 'error'/'close' */ };
    proc.stdin!.on('error', ignore);
    proc.stdout!.on('error', ignore);
    proc.stderr!.on('error', ignore);

    proc.on('error', (e) => finish({ ok: false, error: `${label} error: ${e.message}` }));
    proc.on('close', (code) => {
      if (killTimer) clearTimeout(killTimer);
      const line = out.trim().split('\n').pop();
      if (!line) {
        // Previously an empty stdout parsed as '{}' and was reported ok:true —
        // a runner that crashed before printing anything looked like success.
        finish({ ok: false, error: `${label} produced no output (exit ${code ?? '?'}): ${errOut.slice(0, 200)}` });
        return;
      }
      try {
        const parsed = JSON.parse(line) as { ok?: boolean; error?: string; refused?: boolean };
        if (parsed.ok === false) {
          finish({ ok: false, error: parsed.error || `${label} op failed`, ...(parsed.refused === true ? { refused: true } : {}) });
          return;
        }
        finish({ ok: true, data: parsed as Record<string, unknown> });
      } catch {
        finish({
          ok: false,
          error: `${label} returned non-JSON (exit ${code ?? '?'}${truncated ? ', output truncated' : ''}): ${(errOut || out).slice(0, 200)}`,
        });
      }
    });

    proc.stdin!.end(JSON.stringify(payload) + '\n');
  });
}
