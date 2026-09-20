/**
 * Repo-quality scoring client — RepoRank's LOCAL scan API.
 *
 * RepoRank scores a repo from an uploaded file set (`POST /api/v1/scans/local`)
 * and returns a health report with `overallScore`, `gradeCategory`, dimension
 * scores and a vibe index. This wraps that end to end:
 *   - auth: HS256 JWT minted from the service's JWT_SECRET (apps/api/.env)
 *   - submit: local file set -> scanId
 *   - poll: until the scan leaves the in-progress states
 *
 * Why a JWT and a gateway: RepoRank gates /api behind JWT auth and needs a
 * daily plan tier (enterprise = unlimited), and both RepoRank and Grader expect
 * an OpenAI-compatible gateway on :4100 (see Uplift/_gateway/server.cjs).
 *
 * Env:
 *   REPORANK_URL         default http://127.0.0.1:3200
 *   REPORANK_JWT_SECRET  explicit secret (else read from REPORANK_ENV_FILE)
 *   REPORANK_ENV_FILE    RepoRank apps/api/.env (default under UPLIFT_ROOT)
 *   REPORANK_JWT_USER    synthetic userId (default "harness-lab")
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const IN_PROGRESS = /queued|process|running|grading|scanning|analyzing/i;

export function reporankUrl(): string {
  return (process.env.REPORANK_URL || 'http://127.0.0.1:3200').replace(/\/+$/, '');
}

function defaultReporankEnvFile(): string | undefined {
  const root = process.env.UPLIFT_ROOT?.trim() || path.join(os.homedir(), 'Downloads', 'Uplift');
  const p = path.join(root, 'Draymond-Orchestrator', 'agents', 'reporank', 'apps', 'api', '.env');
  return fs.existsSync(p) ? p : undefined;
}

export function reporankJwtSecret(): string {
  if (process.env.REPORANK_JWT_SECRET?.trim()) return process.env.REPORANK_JWT_SECRET.trim();
  const envFile = process.env.REPORANK_ENV_FILE?.trim() || defaultReporankEnvFile();
  if (envFile && fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf-8').split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?JWT_SECRET\s*=\s*(.*)$/.exec(line);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  return '';
}

function b64url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

export function mintReporankToken(secret = reporankJwtSecret(), userId = process.env.REPORANK_JWT_USER || 'harness-lab'): string {
  if (!secret) throw new Error('RepoRank JWT secret unavailable (set REPORANK_JWT_SECRET or REPORANK_ENV_FILE)');
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ userId, iat: now, exp: now + 3600 }));
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

export interface RepoFile {
  path: string;
  content: string;
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.turbo', '.cache', '.settlement']);
const SKIP_EXT = /\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|eot|mp[34]|zip|gz|exe|dll|so|dylib|lock)$/i;

/** Collect text source files under `dir` for upload (bounded). */
export function readDirFiles(dir: string, opts: { maxFiles?: number; maxBytes?: number } = {}): RepoFile[] {
  const maxFiles = opts.maxFiles ?? 200;
  const maxBytes = opts.maxBytes ?? 400_000;
  const out: RepoFile[] = [];
  const walk = (d: string, rel: string): void => {
    if (out.length >= maxFiles) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (out.length >= maxFiles) return;
      if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      const full = path.join(d, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { walk(full, r); continue; }
      if (!e.isFile() || SKIP_EXT.test(e.name)) continue;
      try {
        const buf = fs.readFileSync(full);
        if (buf.length > maxBytes || buf.subarray(0, 8192).includes(0)) continue;
        out.push({ path: r, content: buf.toString('utf-8') });
      } catch { /* skip unreadable */ }
    }
  };
  walk(dir, '');
  return out;
}

export interface RepoQualityResult {
  ok: boolean;
  status?: string;
  scanId?: string;
  overallScore?: number | null;
  vibeScore?: number | null;
  gradeCategory?: string | null;
  dimensionScores?: Record<string, number> | null;
  report?: Record<string, unknown> | null;
  error?: string;
}

export interface RepoQualityOptions {
  url?: string;
  token?: string;
  repoName?: string;
  pollMs?: number;
  timeoutMs?: number;
  /** Score just the named paths. */
  files?: RepoFile[];
}

export async function reporankScoreDir(dir: string, opts: RepoQualityOptions = {}): Promise<RepoQualityResult> {
  const files = opts.files ?? readDirFiles(dir);
  if (!files.length) return { ok: false, error: `no scorable files under ${dir}` };
  return reporankScoreFiles(files, { ...opts, repoName: opts.repoName || path.basename(dir) });
}

export async function reporankScoreFiles(files: RepoFile[], opts: RepoQualityOptions = {}): Promise<RepoQualityResult> {
  let token = opts.token;
  try { token = token || mintReporankToken(); } catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) }; }
  const url = (opts.url || reporankUrl()).replace(/\/+$/, '');

  let scanId: string;
  try {
    const res = await fetch(`${url}/api/v1/scans/local`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ files, repoName: opts.repoName || 'harness-lab' }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.json().catch(() => ({})) as { data?: { scanId?: string }; error?: string };
    if (!res.ok) return { ok: false, status: String(res.status), error: body?.error || `RepoRank HTTP ${res.status}` };
    if (!body?.data?.scanId) return { ok: false, error: 'RepoRank returned no scanId' };
    scanId = body.data.scanId;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const deadline = Date.now() + (opts.timeoutMs ?? 180_000);
  const pollMs = opts.pollMs ?? 5_000;
  for (;;) {
    try {
      const res = await fetch(`${url}/api/v1/scans/${encodeURIComponent(scanId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      });
      const body = await res.json().catch(() => ({})) as { data?: Record<string, unknown>; error?: string };
      const d = body?.data ?? {};
      const status = typeof d.status === 'string' ? d.status : undefined;
      if (!res.ok) return { ok: false, scanId, status, error: body?.error || `RepoRank HTTP ${res.status}` };
      if (status && !IN_PROGRESS.test(status)) {
        const report = (d.result as Record<string, unknown>) ?? null;
        return {
          ok: status.toLowerCase() === 'complete',
          status,
          scanId,
          overallScore: typeof d.overallScore === 'number' ? d.overallScore : (typeof report?.overallScore === 'number' ? report.overallScore : null),
          vibeScore: typeof d.vibeScore === 'number' ? d.vibeScore : (typeof report?.vibeScore === 'number' ? report.vibeScore : null),
          gradeCategory: typeof report?.gradeCategory === 'string' ? report.gradeCategory : null,
          dimensionScores: (report?.dimensionScores as Record<string, number>) ?? null,
          report,
          ...(typeof d.error === 'string' ? { error: d.error } : {}),
        };
      }
    } catch (err) {
      return { ok: false, scanId, error: err instanceof Error ? err.message : String(err) };
    }
    if (Date.now() >= deadline) return { ok: false, scanId, status: 'timeout', error: `RepoRank scan ${scanId} timed out` };
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

/** Poll a scan to completion and normalize the report. */
async function pollReporankScan(url: string, token: string, scanId: string, opts: RepoQualityOptions): Promise<RepoQualityResult> {
  const deadline = Date.now() + (opts.timeoutMs ?? 240_000);
  const pollMs = opts.pollMs ?? 5_000;
  for (;;) {
    try {
      const res = await fetch(`${url}/api/v1/scans/${encodeURIComponent(scanId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      });
      const body = await res.json().catch(() => ({})) as { data?: Record<string, unknown>; error?: string };
      const d = body?.data ?? {};
      const status = typeof d.status === 'string' ? d.status : undefined;
      if (!res.ok) return { ok: false, scanId, status, error: body?.error || `RepoRank HTTP ${res.status}` };
      if (status && !IN_PROGRESS.test(status)) {
        const report = (d.result as Record<string, unknown>) ?? null;
        return {
          ok: status.toLowerCase() === 'complete',
          status,
          scanId,
          overallScore: typeof d.overallScore === 'number' ? d.overallScore : (typeof report?.overallScore === 'number' ? report.overallScore : null),
          vibeScore: typeof d.vibeScore === 'number' ? d.vibeScore : (typeof report?.vibeScore === 'number' ? report.vibeScore : null),
          gradeCategory: typeof report?.gradeCategory === 'string' ? report.gradeCategory : null,
          dimensionScores: (report?.dimensionScores as Record<string, number>) ?? null,
          report,
          ...(typeof d.error === 'string' ? { error: d.error } : {}),
        };
      }
    } catch (err) {
      return { ok: false, scanId, error: err instanceof Error ? err.message : String(err) };
    }
    if (Date.now() >= deadline) return { ok: false, scanId, status: 'timeout', error: `RepoRank scan ${scanId} timed out` };
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

/**
 * Score a real GitHub repository via RepoRank's standard scan route. Used to
 * anchor the grade scale on known repos ("calibration against real tools").
 * Accepts `owner/repo` or a github.com URL.
 */
export async function reporankScoreRepo(repoUrl: string, opts: RepoQualityOptions = {}): Promise<RepoQualityResult> {
  const url = (opts.url || reporankUrl()).replace(/\/+$/, '');
  const cleaned = repoUrl.trim()
    .replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '')
    .replace(/\.git\/?$/i, '')
    .replace(/\/+$/, '');
  let token = opts.token;
  try { token = token || mintReporankToken(); } catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) }; }

  let scanId: string;
  try {
    const res = await fetch(`${url}/api/v1/scans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ repoUrl: `https://github.com/${cleaned}`, buildSource: 'github' }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.json().catch(() => ({})) as { data?: { scanId?: string }; error?: string };
    if (!res.ok) return { ok: false, status: String(res.status), error: body?.error || `RepoRank HTTP ${res.status}` };
    if (!body?.data?.scanId) return { ok: false, error: 'RepoRank returned no scanId' };
    scanId = body.data.scanId;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  return pollReporankScan(url, token, scanId, opts);
}

