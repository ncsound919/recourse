/**
 * kaggleClient.ts — the parts of the Kaggle integration that can be wrong
 * without anybody noticing, isolated so they can be tested without Kaggle.
 *
 * What the previous inline implementation in computePlatforms.ts got wrong
 * (found by reading it against the CLI's documented behaviour; it had never run
 * — data/remote-compute.json held zero tasks):
 *   - credentials were looked up under $HOME, which Windows does not set, and
 *     KAGGLE_USERNAME/KAGGLE_KEY (documented in .env.example) were ignored;
 *   - the kernel `id` was a bare job id; Kaggle requires `username/slug` and the
 *     title must slugify to that slug, so every push was rejected or mis-addressed;
 *   - status was inferred by scraping the last line of `kernels output`, which
 *     also DOWNLOADS the output into the server's cwd;
 *   - the "stdout" handed to the result parser was the CLI's own chatter, never
 *     the notebook's printed log, so the __RECOURSE_RESULT__ envelope could not
 *     be found and every task would have failed;
 *   - every call was `execSync` with interpolated ids: blocks the event loop for
 *     up to two minutes and is a shell-injection surface;
 *   - quota was charged for the REQUESTED budget and never settled.
 *
 * Nothing here talks to Kaggle by itself: every CLI call goes through a
 * replaceable runner. Live behaviour is UNVERIFIED until a real kernel has run.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Runner (replaceable in tests)
// ---------------------------------------------------------------------------

export interface KaggleRunResult { stdout: string; stderr: string }
export type KaggleRunner = (args: string[], opts?: { timeoutMs?: number; cwd?: string }) => Promise<KaggleRunResult>;

const defaultRunner: KaggleRunner = (args, opts = {}) =>
  new Promise((resolve, reject) => {
    // execFile, not exec: no shell, so a hostile id cannot become a command, and
    // the event loop keeps turning while the CLI works.
    execFile(
      process.platform === 'win32' ? 'kaggle.exe' : 'kaggle',
      args,
      { timeout: opts.timeoutMs ?? 60_000, cwd: opts.cwd, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          const e = err as Error & { stdout?: string; stderr?: string };
          e.stdout = String(stdout ?? '');
          e.stderr = String(stderr ?? '');
          reject(new Error(`kaggle ${args[0] ?? ''} ${args[1] ?? ''} failed: ${(stderr || err.message).toString().trim().slice(0, 500)}`));
          return;
        }
        resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
      },
    );
  });

let runner: KaggleRunner = defaultRunner;
export function setKaggleRunner(r: KaggleRunner | null): void { runner = r ?? defaultRunner; }
export function kaggleRun(args: string[], opts?: { timeoutMs?: number; cwd?: string }): Promise<KaggleRunResult> {
  return runner(args, opts);
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

export interface KaggleCredentials {
  username: string;
  key: string;
  source: 'env' | 'file';
}

/** env (KAGGLE_USERNAME + KAGGLE_KEY) wins; else kaggle.json from an explicit path, KAGGLE_CONFIG_DIR, or the OS home. */
export function resolveKaggleCredentials(
  opts: { credentialsPath?: string; env?: NodeJS.ProcessEnv; home?: string } = {},
): KaggleCredentials | null {
  const env = opts.env ?? process.env;
  const u = (env.KAGGLE_USERNAME ?? '').trim();
  const k = (env.KAGGLE_KEY ?? '').trim();
  if (u && k) return { username: u, key: k, source: 'env' };
  const home = opts.home ?? os.homedir();
  const candidates = [
    opts.credentialsPath,
    env.KAGGLE_CONFIG_DIR ? path.join(env.KAGGLE_CONFIG_DIR, 'kaggle.json') : undefined,
    home ? path.join(home, '.kaggle', 'kaggle.json') : undefined,
  ].filter((p): p is string => Boolean(p));
  for (const p of candidates) {
    try {
      const j = JSON.parse(fs.readFileSync(p, 'utf-8').replace(/^﻿/, ''));
      if (typeof j?.username === 'string' && j.username && typeof j?.key === 'string' && j.key) {
        return { username: j.username, key: j.key, source: 'file' };
      }
    } catch { /* try next */ }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Kernel addressing + metadata
// ---------------------------------------------------------------------------

/** Kaggle slug: lowercase [a-z0-9-], 3..50 chars, no leading/trailing hyphen. */
export function kaggleSlug(hint: string): string {
  const s = String(hint).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/g, '');
  return s.length >= 3 ? s : `recourse-${s || 'job'}`.slice(0, 50);
}

export function kernelRef(username: string, slug: string): string { return `${username}/${slug}`; }

/** The kernel title MUST slugify back to `slug` or Kaggle rejects the push. */
export function kernelMetadata(p: {
  username: string; slug: string; codeFile: string; gpu: boolean; tpu: boolean; internet?: boolean;
  /** Kaggle dataset refs ("owner/slug") to mount read-only at /kaggle/input/<slug>. */
  datasetSources?: string[];
}): Record<string, unknown> {
  return {
    id: kernelRef(p.username, p.slug),
    title: p.slug.replace(/-/g, ' '),
    code_file: p.codeFile,
    language: 'python',
    kernel_type: 'notebook',
    is_private: true,
    enable_gpu: p.gpu,
    enable_tpu: p.tpu,
    // Remote LLM calls (forge/dream candidates) need outbound network.
    enable_internet: p.internet ?? true,
    // Attached datasets (mounted at /kaggle/input/<slug>) — empty means the
    // notebook must fetch data at runtime instead.
    dataset_sources: p.datasetSources ?? [],
    competition_sources: [],
    kernel_sources: [],
  };
}

// ---------------------------------------------------------------------------
// Output parsing
// ---------------------------------------------------------------------------

export type KaggleKernelState = 'queued' | 'running' | 'complete' | 'error' | 'cancelled' | 'unknown';

/** `... has status "KernelWorkerStatus.COMPLETE"` (older CLI) or `"complete"` (newer). */
export function parseKernelStatus(stdout: string): { state: KaggleKernelState; raw: string; failure?: string } {
  const m = /status\s+"([^"]+)"/i.exec(stdout);
  const raw = m ? m[1] : '';
  const tail = raw.split('.').pop()!.toLowerCase().replace(/[^a-z]/g, '');
  const failure = /failure message:\s*(.+)/i.exec(stdout)?.[1]?.trim();
  let state: KaggleKernelState = 'unknown';
  if (tail === 'complete' || tail === 'completed') state = 'complete';
  else if (tail === 'error' || tail === 'failed') state = 'error';
  else if (tail === 'running') state = 'running';
  else if (tail === 'queued' || tail === 'new' || tail === 'pending') state = 'queued';
  else if (tail.startsWith('cancel')) state = 'cancelled';
  return { state, raw, ...(failure ? { failure } : {}) };
}

/**
 * Kaggle saves a kernel's console as `<slug>.log`: a JSON array of
 * `{stream_name, time, data}` events. Join the stdout/stderr streams; if the
 * file is not that shape, return it verbatim rather than inventing structure.
 */
export function parseKernelLog(text: string): { stdout: string; stderr: string } {
  const body = String(text ?? '').replace(/^﻿/, '').trim();
  if (!body) return { stdout: '', stderr: '' };
  try {
    let events: unknown = JSON.parse(body);
    if (!Array.isArray(events) && body.startsWith('[') === false) throw new Error('not array');
    if (Array.isArray(events)) {
      let out = '';
      let err = '';
      for (const ev of events as Array<{ stream_name?: string; data?: string }>) {
        if (typeof ev?.data !== 'string') continue;
        if (ev.stream_name === 'stderr') err += ev.data; else out += ev.data;
      }
      return { stdout: out, stderr: err };
    }
  } catch {
    // Some CLI versions leave a trailing comma / unclosed array: salvage the events.
    const salvaged = [...body.matchAll(/"data"\s*:\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => {
      try { return JSON.parse(`"${m[1]}"`) as string; } catch { return ''; }
    });
    if (salvaged.length) return { stdout: salvaged.join(''), stderr: '' };
  }
  return { stdout: body, stderr: '' };
}

// ---------------------------------------------------------------------------
// Quota ledger (actual usage, settled)
// ---------------------------------------------------------------------------

export interface KaggleQuotaDoc {
  weekStart: number;
  gpuHours: number;
  tpuHours: number;
  cpuHours: number;
  /** jobId -> reservation not yet settled. */
  reserved: Record<string, { type: 'gpu' | 'tpu' | 'cpu'; hours: number; at?: number }>;
}

/** Extra time past a reservation's own window before it is considered abandoned. */
export const RESERVATION_GRACE_MS = 60 * 60 * 1000;

/** When a reservation was made: its `at`, else a 13-digit ms timestamp inside the job id, else null. */
function reservationStart(jobId: string, r: { at?: number }): number | null {
  if (typeof r.at === 'number') return r.at;
  const m = jobId.match(/(\d{13})/);
  return m ? Number(m[1]) : null;
}

/**
 * Reservations are settled only when a job's result is fetched. One that was never fetched
 * (polled elsewhere, crashed process, a client that only submits) would otherwise hold quota
 * until the weekly reset. Past its own window + grace it is charged at the FULL reserved hours
 * (worst case, so GPU/TPU limits are never under-counted) and removed. Mutates and returns
 * the number expired.
 */
export function expireAbandonedReservations(doc: KaggleQuotaDoc, now = Date.now()): number {
  let n = 0;
  for (const [id, r] of Object.entries(doc.reserved)) {
    const start = reservationStart(id, r);
    // No timestamp at all: legacy entry of unknown age; treat as abandoned.
    if (start !== null && start + r.hours * 3_600_000 + RESERVATION_GRACE_MS > now) continue;
    if (r.type === 'gpu') doc.gpuHours += r.hours; else if (r.type === 'tpu') doc.tpuHours += r.hours; else doc.cpuHours += r.hours;
    delete doc.reserved[id];
    n += 1;
  }
  return n;
}

export const KAGGLE_WEEKLY_LIMITS = { gpu: 30, tpu: 20 } as const;

export function weekStartUtc(now = Date.now()): number {
  const d = new Date(now);
  const sunday = now - d.getUTCDay() * 86_400_000;
  return new Date(sunday).setUTCHours(0, 0, 0, 0);
}

export function quotaFilePath(env: NodeJS.ProcessEnv = process.env): string {
  return env.KAGGLE_QUOTA_FILE || path.join(process.cwd(), 'data', 'kaggle-quota.json');
}

export function readQuota(file = quotaFilePath(), now = Date.now()): KaggleQuotaDoc {
  const fresh: KaggleQuotaDoc = { weekStart: weekStartUtc(now), gpuHours: 0, tpuHours: 0, cpuHours: 0, reserved: {} };
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<KaggleQuotaDoc>;
    if (d.weekStart !== fresh.weekStart) return fresh; // new week: used hours reset, stale reservations dropped
    const doc = { ...fresh, ...d, reserved: d.reserved ?? {} } as KaggleQuotaDoc;
    expireAbandonedReservations(doc, now);
    return doc;
  } catch { return fresh; }
}

function writeQuota(doc: KaggleQuotaDoc, file = quotaFilePath()): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2));
  fs.renameSync(tmp, file);
}

/** Used + still-reserved hours for a hardware type. */
export function committedHours(doc: KaggleQuotaDoc, type: 'gpu' | 'tpu' | 'cpu'): number {
  const used = type === 'gpu' ? doc.gpuHours : type === 'tpu' ? doc.tpuHours : doc.cpuHours;
  const held = Object.values(doc.reserved).filter((r) => r.type === type).reduce((a, r) => a + r.hours, 0);
  return used + held;
}

/** Reserve the budget up front (so concurrent jobs cannot overshoot); throws if it would exceed the weekly limit. */
export function reserveQuota(jobId: string, type: 'gpu' | 'tpu' | 'cpu', hours: number, file = quotaFilePath(), now = Date.now()): KaggleQuotaDoc {
  const doc = readQuota(file, now);
  const limit = type === 'gpu' ? KAGGLE_WEEKLY_LIMITS.gpu : type === 'tpu' ? KAGGLE_WEEKLY_LIMITS.tpu : Infinity;
  if (committedHours(doc, type) + hours > limit) {
    throw new Error(`Kaggle weekly ${type.toUpperCase()} quota would be exceeded (${committedHours(doc, type).toFixed(2)}h committed + ${hours.toFixed(2)}h requested > ${limit}h)`);
  }
  doc.reserved[jobId] = { type, hours, at: now };
  writeQuota(doc, file);
  return doc;
}

/** Replace a reservation with what the job actually ran for (never more than reserved). Idempotent. */
export function settleQuota(jobId: string, actualMs: number, file = quotaFilePath(), now = Date.now()): KaggleQuotaDoc {
  const doc = readQuota(file, now);
  const r = doc.reserved[jobId];
  if (!r) return doc;
  const used = Math.min(r.hours, Math.max(0, actualMs) / 3_600_000);
  if (r.type === 'gpu') doc.gpuHours += used; else if (r.type === 'tpu') doc.tpuHours += used; else doc.cpuHours += used;
  delete doc.reserved[jobId];
  writeQuota(doc, file);
  return doc;
}
