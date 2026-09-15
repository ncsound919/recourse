/**
 * hackingtool bridge — Z4nzu/hackingtool ("all-in-one toolkit for AUTHORIZED
 * security testing", MIT) as a stateless subprocess, mirroring translationBridge.
 *
 * Recourse spawns `python python/hackingtool_runner.py`, sends ONE JSON command,
 * and reads ONE JSON result. The catalog/recommend paths are READ-ONLY: they
 * index the toolkit's real catalog so Recourse's `cyber_defense` domain can
 * reason over curated security tooling. Nothing is installed, cloned, or run.
 *
 * Safety contract (mirrors hackingtool's own charter — authorized targets only):
 *  - `classifySecurityIntent` refuses abuse-shaped goals (flooding/DoS/jamming,
 *    malware/RAT/botnet, mass-targeting, credential stuffing, mass phishing)
 *    before any call, with a defensive alternative where one exists.
 *  - The only executing path, `hackingtoolEngagement`, is fail-closed: it needs
 *    the `HACKINGTOOL_ENGAGE_ENABLED=1` kill switch AND `authorized:true` AND a
 *    target that matches `HACKINGTOOL_SCOPE_ALLOWLIST` AND an allow-listed
 *    pipeline. It shells out in list form; the runner re-checks every guard.
 *  - Every failure (missing checkout, missing PyYAML, no CLI, refusal) is
 *    reported honestly as `{ ok:false, ... }` — never a fabricated finding.
 */

import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

export function hackingtoolPythonBin(): string {
  return process.env.HACKINGTOOL_PYTHON || 'python';
}

export function hackingtoolRunnerPath(): string {
  return process.env.HACKINGTOOL_RUNNER || path.join(process.cwd(), 'python', 'hackingtool_runner.py');
}

export function hackingtoolCheckoutDir(): string {
  return process.env.HACKINGTOOL_DIR || path.join(os.homedir(), 'Downloads', 'hackingtool');
}

/** Kill switch for the ONLY executing path. Off unless explicitly enabled. */
export function hackingtoolEngageEnabled(): boolean {
  return process.env.HACKINGTOOL_ENGAGE_ENABLED === '1';
}

/** Explicit scope allowlist (fnmatch patterns) for engagement targets. */
export function hackingtoolScopeAllowlist(): string[] {
  return (process.env.HACKINGTOOL_SCOPE_ALLOWLIST || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function hackingtoolAllowedPipelines(): string[] {
  return (process.env.HACKINGTOOL_ALLOWED_PIPELINES || 'recon')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Pure guards (unit-tested; no I/O)
// ---------------------------------------------------------------------------

/** Convert an fnmatch-style glob to an anchored, case-insensitive RegExp. */
export function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

/** True when `target` matches any allowlist pattern. Empty allowlist => false
 *  (never treat "no scope configured" as "anything goes"). */
export function isTargetInScope(target: string, allowlist: string[]): boolean {
  if (!target || allowlist.length === 0) return false;
  return allowlist.some((pattern) => globToRegExp(pattern).test(target));
}

export interface SecurityIntentVerdict {
  allowed: boolean;
  reason?: string;
  alternative?: string;
}

/** Abuse-shaped intents refused before any tool lookup, with an authorized
 *  alternative where one exists. Defensive/DFIR phrasing is never refused. */
const OUT_OF_SCOPE_INTENTS: Array<{ re: RegExp; reason: string; alternative?: string }> = [
  { re: /\b(ddos|denial[- ]of[- ]service|dos attack|packet flood|syn flood|udp flood|http flood|stress(?:er|ing)? (?:test|tool)|jamming|jam|deauth(?:entication)?)\b/i,
    reason: 'flooding / denial-of-service / radio jamming is out of scope',
    alternative: 'For availability concerns, run a load test against a system you own, or review DoS-resilience controls.' },
  { re: /\b(malware|ransomware|trojan|rootkit|botnet|keylogger|spyware|backdoor|remote access trojan|\brat\b)\b/i,
    reason: 'malware / remote-access-trojan intent is out of scope',
    alternative: 'For DFIR work, use the forensics tools (volatility, autopsy, binwalk) on an image you are authorized to examine.' },
  { re: /\b(credential stuffing|password spray(?:ing)?|brute[- ]?force (?:all|every|the internet))\b/i,
    reason: 'credential-stuffing / mass password-spraying is out of scope',
    alternative: 'For password policy, use hashcat against hashes you own to measure strength.' },
  { re: /\b(mass|bulk)[- ]?(scan|exploit|target|phish)|scan (?:the )?(?:whole )?internet|\b0\.0\.0\.0\/0\b/i,
    reason: 'mass/indiscriminate targeting is out of scope',
    alternative: 'Scan only hosts in your authorized scope; `/scope_check` validates targets against your allowlist.' },
  { re: /\b(send|launch|run|deliver)\b[^.]*\bphish(?:ing)?\b[^.]*\b(campaign|emails?|to (?:many|all|users))\b/i,
    reason: 'mass phishing delivery is out of scope',
    alternative: 'For awareness testing, use GoPhish against your own consenting org with written authorization.' },
];

/** Classify a plain-English security goal. Refuses abuse-shaped intents. */
export function classifySecurityIntent(goal: string): SecurityIntentVerdict {
  const text = (goal || '').trim();
  if (!text) return { allowed: false, reason: 'goal is required' };
  for (const rule of OUT_OF_SCOPE_INTENTS) {
    if (rule.re.test(text)) {
      return { allowed: false, reason: rule.reason, ...(rule.alternative ? { alternative: rule.alternative } : {}) };
    }
  }
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Runner transport
// ---------------------------------------------------------------------------

export interface HackingtoolEntry {
  id: string;
  title: string;
  category: string;
  category_key: string;
  kind: 'tool' | 'overlay' | string;
  tags: string[];
  description: string;
  usage: Array<{ description: string; command: string }>;
  project_url: string;
  install_hint: string;
  run: string[];
  lab_safe_notes: string;
  out_of_scope: boolean;
  sensitive: boolean;
}

export interface HackingtoolRunResult {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
  refused?: boolean;
}

export interface HackingtoolRunOptions {
  timeoutMs?: number;
  python?: string;
  runner?: string;
}

export interface HackingtoolCommand {
  op: 'health' | 'catalog' | 'categories' | 'recommend' | 'scope_check' | 'engagement';
  dir?: string;
  [key: string]: unknown;
}

/** Spawn the runner with one JSON command and parse its real JSON output. */
export function runHackingtool(cmd: HackingtoolCommand, opts: HackingtoolRunOptions = {}): Promise<HackingtoolRunResult> {
  const python = opts.python ?? hackingtoolPythonBin();
  const runner = opts.runner ?? hackingtoolRunnerPath();
  const timeoutMs = opts.timeoutMs ?? 20_000;

  return new Promise((resolve) => {
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(python, [runner], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      resolve({ ok: false, error: `hackingtool spawn failed: ${err instanceof Error ? err.message : String(err)}` });
      return;
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { proc.kill(); } catch { /* already dead */ }
      resolve({ ok: false, error: `hackingtool runner timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    let out = '';
    let errOut = '';
    proc.stdout.on('data', (d: Buffer) => { out += d.toString('utf-8'); });
    proc.stderr.on('data', (d: Buffer) => { errOut += d.toString('utf-8'); });
    proc.on('error', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, error: `hackingtool runner error: ${e.message}` });
    });
    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        const line = out.trim().split('\n').pop() || '{}';
        const parsed = JSON.parse(line) as { ok?: boolean; error?: string; refused?: boolean };
        if (parsed.ok === false) {
          resolve({ ok: false, error: parsed.error || 'hackingtool op failed', refused: parsed.refused === true });
          return;
        }
        resolve({ ok: true, data: parsed as Record<string, unknown> });
      } catch {
        resolve({
          ok: false,
          error: `hackingtool runner returned non-JSON (exit ${code ?? '?'}): ${(errOut || out).slice(0, 200)}`,
        });
      }
    });

    proc.stdin.write(JSON.stringify({ dir: hackingtoolCheckoutDir(), ...cmd }) + '\n');
    proc.stdin.end();
  });
}

// ---------------------------------------------------------------------------
// Public API — read-only awareness
// ---------------------------------------------------------------------------

/** Are the catalog and CLI present? Real probe; honest failure when absent. */
export async function hackingtoolHealth(opts: HackingtoolRunOptions = {}): Promise<Record<string, unknown> & { ok: boolean }> {
  const r = await runHackingtool({ op: 'health' }, opts);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, ...(r.data ?? {}) };
}

/** Browse the curated catalog (out-of-scope categories excluded by default). */
export async function hackingtoolCatalog(
  query: { category?: string; search?: string; includeOutOfScope?: boolean; limit?: number } = {},
  opts: HackingtoolRunOptions = {},
): Promise<{ ok: boolean; count?: number; total?: number; tools?: HackingtoolEntry[]; error?: string }> {
  const r = await runHackingtool({
    op: 'catalog',
    category: query.category,
    search: query.search,
    include_out_of_scope: query.includeOutOfScope === true,
    limit: query.limit,
  }, opts);
  if (!r.ok) return { ok: false, error: r.error };
  const d = (r.data ?? {}) as Record<string, unknown>;
  return { ok: true, count: Number(d.count) || 0, total: Number(d.total) || 0, tools: (d.tools as HackingtoolEntry[]) ?? [] };
}

/** Category rollup with out-of-scope/sensitive flags. */
export async function hackingtoolCategories(
  opts: { includeOutOfScope?: boolean } & HackingtoolRunOptions = {},
): Promise<{ ok: boolean; categories?: Array<{ key: string; title: string; count: number; out_of_scope: boolean; sensitive: boolean }>; error?: string }> {
  const r = await runHackingtool({ op: 'categories', include_out_of_scope: opts.includeOutOfScope === true }, opts);
  if (!r.ok) return { ok: false, error: r.error };
  const d = (r.data ?? {}) as Record<string, unknown>;
  return { ok: true, categories: (d.categories as Array<{ key: string; title: string; count: number; out_of_scope: boolean; sensitive: boolean }>) ?? [] };
}

/** Map a plain-English goal to curated tools. Refuses abuse-shaped goals. */
export async function hackingtoolRecommend(
  goal: string,
  opts: { limit?: number } & HackingtoolRunOptions = {},
): Promise<{ ok: boolean; goal?: string; recommendations?: HackingtoolEntry[]; refused?: boolean; reason?: string; alternative?: string; error?: string }> {
  const verdict = classifySecurityIntent(goal);
  if (!verdict.allowed) {
    return { ok: false, refused: true, reason: verdict.reason, ...(verdict.alternative ? { alternative: verdict.alternative } : {}) };
  }
  const r = await runHackingtool({ op: 'recommend', goal, limit: opts.limit ?? 10 }, opts);
  if (!r.ok) return { ok: false, error: r.error };
  const d = (r.data ?? {}) as Record<string, unknown>;
  return { ok: true, goal: String(d.goal ?? goal), recommendations: (d.recommendations as HackingtoolEntry[]) ?? [] };
}

/** Validate a target against the configured engagement allowlist. */
export async function hackingtoolScopeCheck(
  target: string,
  allowlist: string[] = hackingtoolScopeAllowlist(),
  opts: HackingtoolRunOptions = {},
): Promise<{ ok: boolean; target?: string; inScope?: boolean; allowlist?: string[]; error?: string }> {
  // Pure pre-check keeps the same semantics even if the runner is unavailable.
  const pureInScope = isTargetInScope(target, allowlist);
  if (!allowlist.length) return { ok: false, error: 'HACKINGTOOL_SCOPE_ALLOWLIST is empty — nothing is in scope' };
  const r = await runHackingtool({ op: 'scope_check', target, allowlist }, opts);
  if (!r.ok) return { ok: true, target, inScope: pureInScope, allowlist };
  const d = (r.data ?? {}) as Record<string, unknown>;
  return { ok: true, target: String(d.target ?? target), inScope: Boolean(d.in_scope ?? pureInScope), allowlist: (d.allowlist as string[]) ?? allowlist };
}

// ---------------------------------------------------------------------------
// Guarded engagement (the only executing path)
// ---------------------------------------------------------------------------

export interface EngagementRequest {
  /** Caller must assert authorized testing explicitly. */
  authorized?: boolean;
  name?: string;
  targets: string[];
  pipeline?: string;
  timeoutMs?: number;
}

export interface EngagementResult {
  ok: boolean;
  refused?: boolean;
  error?: string;
  engagement?: string;
  pipeline?: string;
  targets?: string[];
  exitCode?: number;
  findings?: unknown;
  stdoutTail?: string;
  stderrTail?: string;
}

/** Run a headless hackingtool engagement. Fail-closed on every guard. */
export async function hackingtoolEngagement(
  req: EngagementRequest,
  opts: HackingtoolRunOptions = {},
): Promise<EngagementResult> {
  if (!hackingtoolEngageEnabled()) {
    return { ok: false, refused: true, error: 'engagement disabled (set HACKINGTOOL_ENGAGE_ENABLED=1 to arm the guarded runner)' };
  }
  if (req.authorized !== true) {
    return { ok: false, refused: true, error: 'authorized:true is required (authorized security testing only)' };
  }
  const targets = (req.targets ?? []).map((t) => String(t).trim()).filter(Boolean);
  if (targets.length === 0) return { ok: false, refused: true, error: 'at least one target is required' };

  const allowlist = hackingtoolScopeAllowlist();
  if (allowlist.length === 0) {
    return { ok: false, refused: true, error: 'HACKINGTOOL_SCOPE_ALLOWLIST is empty — refusing to run unscoped' };
  }
  const offScope = targets.filter((t) => !isTargetInScope(t, allowlist));
  if (offScope.length > 0) {
    return { ok: false, refused: true, error: `target(s) outside the configured scope: ${offScope.join(', ')}` };
  }

  const allowedPipelines = hackingtoolAllowedPipelines();
  const pipeline = (req.pipeline || allowedPipelines[0] || 'recon').trim();
  if (!allowedPipelines.includes(pipeline)) {
    return { ok: false, refused: true, error: `pipeline '${pipeline}' is not allow-listed (${allowedPipelines.join(', ')})` };
  }

  const r = await runHackingtool({
    op: 'engagement',
    authorized: true,
    engagement: req.name || 'recourse',
    targets,
    pipeline,
    allowlist,
    allowed_pipelines: allowedPipelines,
    timeout_ms: req.timeoutMs ?? 600_000,
  }, { timeoutMs: (req.timeoutMs ?? 600_000) + 15_000, ...opts });

  if (!r.ok) return { ok: false, error: r.error, refused: r.refused };
  const d = (r.data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    engagement: typeof d.engagement === 'string' ? d.engagement : undefined,
    pipeline: typeof d.pipeline === 'string' ? d.pipeline : pipeline,
    targets,
    exitCode: typeof d.exit_code === 'number' ? d.exit_code : undefined,
    findings: d.findings,
    stdoutTail: typeof d.stdout_tail === 'string' ? d.stdout_tail : undefined,
    stderrTail: typeof d.stderr_tail === 'string' ? d.stderr_tail : undefined,
  };
}
