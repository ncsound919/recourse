/**
 * Synchronous advisory file lock for read-modify-write of JSONL ledgers.
 *
 * The single-instance lock protects the server, but separate processes (cron
 * scripts, the CLI, `npm run audit`) still share these files. Two processes that
 * both read the tail hash and append will fork a hash chain, and a check-then-
 * append wallet debit can over-spend. This offers a coarse cross-process lock
 * around a short synchronous critical section.
 *
 * It is advisory and best-effort: a crashed holder leaves a lock that is
 * reclaimed once it is older than `staleMs`. `Atomics.wait` sleeps the thread
 * without a busy loop.
 */
import fs from 'node:fs';
import path from 'node:path';

const SLEEP = new Int32Array(new SharedArrayBuffer(4));

function sleepSync(ms: number): void {
  Atomics.wait(SLEEP, 0, 0, ms);
}

export interface FileLockOptions {
  /** Give up (throw) after waiting this long for a held lock. */
  timeoutMs?: number;
  /** Reclaim a lock whose mtime is older than this (crashed holder). */
  staleMs?: number;
}

export function withSyncFileLock<T>(lockFile: string, fn: () => T, opts: FileLockOptions = {}): T {
  const timeoutMs = opts.timeoutMs ?? 2000;
  const staleMs = opts.staleMs ?? 10000;
  const started = Date.now();
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });

  for (;;) {
    let fd: number | null = null;
    try {
      fd = fs.openSync(lockFile, 'wx');
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      break;
    } catch (err: any) {
      if (fd !== null) { try { fs.closeSync(fd); } catch { /* noop */ } }
      if (err?.code !== 'EEXIST') throw err;
      try {
        const st = fs.statSync(lockFile);
        if (Date.now() - st.mtimeMs > staleMs) {
          fs.unlinkSync(lockFile);
          continue;
        }
      } catch {
        // Holder vanished between open and stat — retry immediately.
        continue;
      }
      if (Date.now() - started > timeoutMs) {
        throw new Error(`file lock timeout after ${timeoutMs}ms: ${lockFile}`);
      }
      sleepSync(25);
    }
  }

  try {
    return fn();
  } finally {
    try { fs.unlinkSync(lockFile); } catch { /* already released */ }
  }
}
