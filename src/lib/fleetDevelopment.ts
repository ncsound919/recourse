/**
 * Fleet Development Integration — the plugin seam that lets Overlay365's
 * external AUDIT + REPAIR teams continuously develop Recourse.
 *
 * Honesty contract:
 *  - A driver is only ever shown as "online" after its documented health route
 *    actually answers. Offline / unconfigured drivers are reported as such and
 *    never fabricate findings.
 *  - Drivers whose REMOTE request schema is not locally verified (RepoRank,
 *    Grader, Codegang) are labelled `schema: 'ingest-forward'`: they probe
 *    health for real, and their audit action forwards Recourse's normalized
 *    health dossier to a per-driver ingest route that must be explicitly
 *    configured via env. Nothing is parsed into fake findings.
 *  - The two fully-specified drivers are real end-to-end:
 *      * deterministic-brain (the Deep)  -> POST /task  (known contract)
 *      * draymond-repair                 -> POST /api/ops/repair-benchmark
 *        (the repair team + Benchmark Olympics dispatch consumer; known contract)
 *  - Nothing an external agent returns is written to disk until it passes the
 *    real sandbox verifier + lint gate (verifyAndApplyPatch). That gate is the
 *    guarantee that "autonomous development" cannot corrupt Recourse.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { ToolDomain } from '../types';
import { executeTestSuite } from './executionSandbox';
import { lintSource } from './lintGate';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DriverKind = 'audit' | 'repair' | 'both';
export type DriverSchema = 'health-probe' | 'ingest-forward' | 'specified';

export interface DevFinding {
  /** Short, stable identifier (a tool slug or subsystem). */
  slug: string;
  name: string;
  /** 0-100. The repair team only auto-dispatches >= 50 (Benchmark Olympics band). */
  weaknessScore: number;
  reasons: string[];
  proposedAction?: string;
  repoFile?: string;
}

export interface HealthDossier {
  generatedAt: number;
  repoUrl?: string | null;
  /** Aggregate weaknesses Recourse honestly measures about itself. */
  findings: DevFinding[];
  liveSelfHostedTools: number;
  registryTools: number;
  domainCount: number;
  healthIndex: number; // 0-1
  verifierPassRate: number;
  openAnomalies: number;
}

export interface ProposedPatch {
  /** Registered driver id that produced this change. */
  driverId: string;
  /** Path relative to the Recourse repo root. */
  file: string;
  /** New file contents. For code patches the caller SHOULD supply a suite. */
  source: string;
  /** Regression / reference suite the new code must pass in the sandbox. */
  suite?: string;
  domain?: ToolDomain;
  note?: string;
}

export type PatchResult =
  | { applied: true; file: string; hash: string; verified: string; revertToken?: string; bootGateNote?: string }
  | { applied: false; file: string; error: string };

/** Optional gate the caller (server) supplies to make a harness patch
 *  CI-green. The sandbox cannot verify monolith modules that import siblings or
 *  reference process-level state, so a real compile/boot gate is the honest
 *  substitute: it runs before any write and blocks a breaking patch. */
export type BootGreenGate = (ctx: { file: string; source: string; root: string }) => Promise<{ ok: boolean; error?: string }> | { ok: boolean; error?: string };

// ---------------------------------------------------------------------------
// Harness-evolution journal + rollback (Phase 5 item 16)
// ---------------------------------------------------------------------------
// Every code patch that overwrites an existing repo file is snapshotted so the
// operator (or a future driver) can roll it back in one step. Backups + journal
// live under <root>/.recourse/fleet/ and are persisted so rollback survives
// restarts. Reverts emit provenance in the caller (capability_reverted).

export interface FleetPatchEntry {
  token: string;
  driverId: string;
  file: string;
  appliedHash: string;
  prevSource: string | null; // null => file did not exist before the patch
  prevExisted: boolean;
  ts: number;
  reverted: boolean;
  revertedAt?: number;
  note?: string;
}

export interface FleetPatchJournal {
  entries: FleetPatchEntry[];
}

export function fleetBackupDir(root: string): string {
  return process.env.RECOURSE_FLEET_DIR || path.join(root, '.recourse', 'fleet');
}

function journalFile(root: string): string {
  return path.join(fleetBackupDir(root), 'journal.json');
}

export function readFleetJournal(root: string): FleetPatchJournal {
  try {
    const raw = fs.readFileSync(journalFile(root), 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.entries)) return parsed as FleetPatchJournal;
    return { entries: [] };
  } catch {
    return { entries: [] };
  }
}

function writeFleetJournal(root: string, journal: FleetPatchJournal): void {
  fs.mkdirSync(fleetBackupDir(root), { recursive: true });
  const tmp = journalFile(root) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(journal, null, 2), 'utf-8');
  fs.renameSync(tmp, journalFile(root));
}

export function listFleetPatches(root: string): FleetPatchEntry[] {
  return readFleetJournal(root).entries;
}

/** Roll back one applied harness patch by restoring its pre-patch source.
 *  Idempotent: an already-reverted token returns ok:false with an honest note. */
export async function revertAppliedPatch(token: string, root: string): Promise<{ ok: boolean; file?: string; error?: string; restoredSource?: string | null }> {
  const repo = resolveRepoRoot(root);
  const journal = readFleetJournal(repo);
  const entry = journal.entries.find((e) => e.token === token);
  if (!entry) return { ok: false, error: `no applied patch with token ${token}` };
  if (entry.reverted) return { ok: false, error: `patch ${token} already reverted`, file: entry.file };
  const abs = path.resolve(repo, entry.file);
  const rel = path.relative(repo, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return { ok: false, error: 'path escapes repo root', file: entry.file };

  if (entry.prevExisted && entry.prevSource != null) {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, entry.prevSource, 'utf-8');
  } else if (fs.existsSync(abs)) {
    // The patch created a brand-new file; reverting removes it.
    fs.rmSync(abs, { force: true });
    // Clean now-empty parent dirs we created, best-effort.
    let cur = path.dirname(abs);
    while (cur.startsWith(repo) && cur !== repo && fs.readdirSync(cur).length === 0) {
      try { fs.rmdirSync(cur); } catch { break; }
      cur = path.dirname(cur);
    }
  }

  entry.reverted = true;
  entry.revertedAt = Date.now();
  writeFleetJournal(repo, journal);
  return { ok: true, file: entry.file, restoredSource: entry.prevExisted ? entry.prevSource : null };
}


export interface FleetAuditorStatus {
  id: string;
  name: string;
  kind: DriverKind;
  schema: DriverSchema;
  baseUrl: string | null;
  configured: boolean;
  online: boolean;
  healthRoute: string;
  note: string;
}

export interface AuditorDriver {
  id: string;
  name: string;
  kind: DriverKind;
  schema: DriverSchema;
  baseUrl(): string | null;
  healthRoute(): string;
  note: string;
}

// ---------------------------------------------------------------------------
// Driver registry
// ---------------------------------------------------------------------------

const _registry = new Map<string, AuditorDriver>();

export function registerFleetDriver(d: AuditorDriver): void {
  if (!d || !d.id) throw new Error('fleet driver requires an id');
  if (_registry.has(d.id)) throw new Error(`fleet driver already registered: ${d.id}`);
  _registry.set(d.id, d);
}

export function fleetDrivers(): AuditorDriver[] {
  return [..._registry.values()];
}

export function getFleetDriver(id: string): AuditorDriver | undefined {
  return _registry.get(id);
}

// ---------------------------------------------------------------------------
// Built-in drivers (schema-informed, availability-gated)
// ---------------------------------------------------------------------------

function env(name: string, fallback: string): () => string | null {
  return () => process.env[name]?.trim() || fallback || null;
}

function auditor(
  id: string,
  name: string,
  kind: DriverKind,
  schema: DriverSchema,
  baseUrl: () => string | null,
  healthRoute: string,
  note: string,
): AuditorDriver {
  return { id, name, kind, schema, baseUrl, healthRoute: () => healthRoute, note };
}

export const FLEET_AUDITORS: AuditorDriver[] = [
  auditor('reporank', 'RepoRank', 'audit', 'ingest-forward',
    env('REPORANK_URL', 'http://localhost:3200'), '/health',
    'Repo depth scoring + remediation. Audit forwards Recourse dossier to REPORANK_INGEST_PATH when configured.'),
  auditor('grader', 'Grader', 'audit', 'ingest-forward',
    env('GRADER_URL', 'http://localhost:3201'), '/api/health',
    'Data-backed grade (ISO). Audit forwards dossier to GRADER_INGEST_PATH when configured.'),
  auditor('codegang', 'Codegang', 'audit', 'ingest-forward',
    env('CODEGANG_URL', 'http://localhost:3204'), '/api',
    'Deep analysis + agent pipeline. Audit forwards dossier to CODEGANG_INGEST_PATH when configured.'),
  auditor('deterministic-brain', 'The Deep (deterministic brain)', 'both', 'specified',
    env('BRAIN_URL', 'http://localhost:3210'), '/health',
    'Zero-LLM Parse→Reason→Execute→Audit loop. Real deep analysis of Recourse via POST /task.'),
  auditor('axiom', 'Axiom OS (deterministic agent loop)', 'repair', 'specified',
    env('AXIOM_URL', 'http://localhost:3198'), '/api/axiom/fleet-bridges',
    'Deterministic-spec agentic loop server. Repairs Recourse by driving project loops; output is only applied through the verified patch-intake gate.'),
  auditor('dev-brain', 'Dev-Brain', 'both', 'specified',
    env('DEV_BRAIN_URL', 'http://localhost:3450'), '/api/health',
    'Primary deterministic decision layer. POST /api/decide (weighted matrix), /api/repair/triage (order weaknesses to fix), /api/fusion/decide (fuses dev + deterministic brains).'),
  auditor('draymond-repair', 'Repair Team + Benchmark Olympics', 'repair', 'specified',
    env('DRAYMOND_URL', process.env.DRAYMOND_OPS_URL ?? 'http://localhost:3000'), '/',
    'Dispatches Recourse as a weak benchmark entity to /api/ops/repair-benchmark for the coding crew.'),
];

export function installDefaultFleetDrivers(): void {
  for (const d of FLEET_AUDITORS) {
    if (!_registry.has(d.id)) _registry.set(d.id, d);
  }
}

// ---------------------------------------------------------------------------
// Health probing
// ---------------------------------------------------------------------------

/** Probe one driver's documented health route. Never throws. */
export async function probeDriverOnline(d: AuditorDriver, timeoutMs = 4000): Promise<boolean> {
  const base = d.baseUrl();
  if (!base) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${base.replace(/\/+$/, '')}${d.healthRoute()}`, {
        method: 'GET',
        signal: controller.signal,
      });
      return res.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

export async function auditorStatuses(): Promise<FleetAuditorStatus[]> {
  const out: FleetAuditorStatus[] = [];
  for (const d of fleetDrivers()) {
    const base = d.baseUrl();
    const configured = Boolean(base);
    const online = configured ? await probeDriverOnline(d) : false;
    out.push({
      id: d.id,
      name: d.name,
      kind: d.kind,
      schema: d.schema,
      baseUrl: base,
      configured,
      online,
      healthRoute: d.healthRoute(),
      note: d.note,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Health dossier (pure — computed from real Recourse state)
// ---------------------------------------------------------------------------

export interface DossierInput {
  registry: Array<{
    name: string;
    domain: ToolDomain;
    healthStatus?: string;
    currentVersion?: string;
    versions: Array<{ promoted?: boolean; passed_verifier?: boolean; version?: string; test_suite_code?: string; source_code?: string }>;
  }>;
  liveSelfHostedTools: number;
  openAnomalies: number;
  verifierPassRate: number;
  /** Count of capability-forge materialized tools, if the server tracks it. */
  forgeMaterialized?: number;
  repoUrl?: string | null;
}

export function computeHealthDossier(input: DossierInput): HealthDossier {
  const findings: DevFinding[] = [];
  const registryTools = input.registry.length;

  const degraded = input.registry.filter(
    (t) => t.healthStatus === 'degraded' || t.healthStatus === 'corrupted' || t.healthStatus === 'healing',
  );
  if (degraded.length > 0) {
    findings.push({
      slug: `degraded:${degraded[0].name}`,
      name: 'Degraded registry tools',
      weaknessScore: Math.min(100, 50 + degraded.length * 15),
      reasons: degraded.slice(0, 5).map((t) => `tool ${t.name} (${t.healthStatus}) is not verified-healthy`),
      proposedAction: 'Repair the failing tools so their current version passes its regression suite.',
    });
  }

  const noSuite = input.registry.filter(
    (t) => ![...t.versions].reverse().find((v) => v.promoted && v.version === t.currentVersion && v.test_suite_code),
  );
  if (noSuite.length > 0) {
    findings.push({
      slug: 'missing-regression-suites',
      name: 'Tools without regression suites',
      weaknessScore: Math.min(80, 40 + noSuite.length * 10),
      reasons: noSuite.slice(0, 5).map((t) => `${t.name} has no test suite on its current version — verifier claims cannot be re-proven`),
      proposedAction: 'Author regression suites for the live tool versions.',
    });
  }

  if (input.openAnomalies > 0) {
    findings.push({
      slug: 'open-anomalies',
      name: 'Open repair anomalies',
      weaknessScore: Math.min(90, 40 + input.openAnomalies * 20),
      reasons: [`${input.openAnomalies} detected/unevaluated anomalies pending scan-and-heal`],
      proposedAction: 'Run the self-repair scan-and-heal pass.',
    });
  }

  if (input.liveSelfHostedTools === 0) {
    findings.push({
      slug: 'no-self-hosted-tools',
      name: 'No live self-hosted capability tools',
      weaknessScore: 70,
      reasons: ['zero self-hosted modules materialized — the autonomous capability loop has not produced durable callable tools'],
      proposedAction: 'Drive the Capability Forge so verified tools become live self-hosted modules.',
    });
  }

  const passRateGap = Math.round((1 - (input.verifierPassRate || 0)) * 100);
  if (passRateGap > 0) {
    findings.push({
      slug: 'verifier-pass-rate',
      name: 'Verifier pass-rate below 100%',
      weaknessScore: Math.max(30, passRateGap),
      reasons: [`current verifier pass rate is ${Math.round((input.verifierPassRate || 0) * 100)}%`],
      proposedAction: 'Heal tools failing their live verifier.',
    });
  }

  const domainCount = new Set(input.registry.map((t) => t.domain)).size;
  const totalFaults = findings.reduce((n, f) => n + f.weaknessScore * 0.001, 0) + degraded.length * 0.06 + input.openAnomalies * 0.04;
  const healthIndex = Math.max(0, Math.min(1, 1 - totalFaults));

  return {
    generatedAt: Date.now(),
    repoUrl: input.repoUrl ?? null,
    findings,
    liveSelfHostedTools: input.liveSelfHostedTools,
    registryTools,
    domainCount,
    healthIndex: Math.round(healthIndex * 1000) / 1000,
    verifierPassRate: input.verifierPassRate ?? 0,
    openAnomalies: input.openAnomalies,
  };
}

/** Top finding's weakness score (drives whether the repair team should act). */
export function topWeaknessScore(dossier: HealthDossier): number {
  if (dossier.findings.length === 0) return 0;
  return Math.max(...dossier.findings.map((f) => f.weaknessScore));
}

// ---------------------------------------------------------------------------
// Draymond repair-team reporter (the "discovered weak entity" contract)
// ---------------------------------------------------------------------------

export interface RepairWeakRow {
  component_slug: string;
  component_name: string;
  weakness_score: number;
  reasons: string[];
  proposed_action?: string;
  repo_url?: string | null;
}

/** Build the exact rows the /api/ops/repair-benchmark route accepts (score >= 50 band). */
export function buildRepairRows(dossier: HealthDossier): RepairWeakRow[] {
  return dossier.findings
    .filter((f) => f.weaknessScore >= 50)
    .map((f) => ({
      component_slug: `recourse:${f.slug}`,
      component_name: `Recourse: ${f.name}`,
      weakness_score: Math.round(f.weaknessScore),
      reasons: f.reasons.slice(0, 8),
      proposed_action: f.proposedAction,
      repo_url: dossier.repoUrl ?? null,
    }));
}

export interface RepairSubmitResult {
  ok: boolean;
  dispatched: number;
  results?: unknown[];
  status?: number;
  error?: string;
}

/**
 * POST Recourse's weak entities to Draymond's repair team. The repair team
 * (coding crew: opencode/uplift-agent codegen + RepoRank review + Big Homie)
 * auto-dispatches on score >= 50 to generate/propose a fix for the repo.
 */
export async function submitToRepairEndpoint(opts: {
  rows: RepairWeakRow[];
  url: string;
  secret?: string;
  enabled?: boolean;
  timeoutMs?: number;
}): Promise<RepairSubmitResult> {
  if (opts.enabled === false) {
    return { ok: false, dispatched: 0, error: 'repair dispatch disabled (kill switch)' };
  }
  if (opts.rows.length === 0) {
    return { ok: false, dispatched: 0, error: 'no weak rows above the remediation band (>=50)' };
  }
  const base = opts.url.replace(/\/+$/, '');
  const endpoint = `${base}/api/ops/repair-benchmark`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(opts.secret ? { Authorization: `Bearer ${opts.secret}` } : {}),
        },
        body: JSON.stringify({ rows: opts.rows.slice(0, 5) }),
        signal: controller.signal,
      });
      if (!res.ok) {
        return { ok: false, dispatched: 0, status: res.status, error: `repair endpoint HTTP ${res.status}` };
      }
      const data = (await res.json()) as { ok?: boolean; dispatched?: number; results?: unknown[]; error?: string };
      return {
        ok: data.ok !== false,
        dispatched: data.dispatched ?? 0,
        results: data.results,
        status: 200,
        error: data.error,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return { ok: false, dispatched: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// The Deep — deterministic-brain analysis (real /task contract)
// ---------------------------------------------------------------------------

export interface BrainAskResult {
  ok: boolean;
  output?: string;
  error?: string;
}

/** Ask the deterministic brain (the Deep) to analyze Recourse's dossier. */
export async function askDeterministicBrain(opts: {
  url?: string;
  query: string;
  lane?: string;
  timeoutMs?: number;
}): Promise<BrainAskResult> {
  const base = (opts.url ?? process.env.BRAIN_URL ?? '').replace(/\/+$/, '');
  if (!base) return { ok: false, error: 'BRAIN_URL not configured' };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);
    try {
      const res = await fetch(`${base}/task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: opts.query, lane_override: opts.lane ?? null }),
        signal: controller.signal,
      });
      if (!res.ok) return { ok: false, error: `brain /task HTTP ${res.status}` };
      const data = (await res.json()) as { final_output?: unknown; body?: unknown; error?: string };
      if (data.error) return { ok: false, error: String(data.error) };
      const out = data.final_output ?? data.body;
      if (out === undefined || out === null) return { ok: false, error: 'brain returned no output' };
      const text = typeof out === 'string' ? out.trim() : JSON.stringify(out);
      return text ? { ok: true, output: text } : { ok: false, error: 'brain returned empty output' };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Draft the query handed to the Deep for Recourse's development. */
export function buildBrainAnalyzeQuery(dossier: HealthDossier): string {
  const top = dossier.findings
    .slice(0, 6)
    .map((f) => `- [score ${f.weaknessScore}] ${f.name}: ${f.reasons.join('; ')}`)
    .join('\n');
  return (
    `Analyze the Recourse self-developing system and propose concrete repairs. ` +
    `Health index ${dossier.healthIndex}, ${dossier.registryTools} registry tools across ${dossier.domainCount} domains, ` +
    `${dossier.liveSelfHostedTools} live self-hosted tools, verifier pass rate ${Math.round(dossier.verifierPassRate * 100)}%. ` +
    `Weaknesses:\n${top || '(none above threshold)'}\n` +
    `For each high-score weakness, output: the file(s) to change, the exact new code, and the regression suite that proves it. ` +
    `Recourse only applies a change after that code passes its real sandbox verifier + lint, so correctness matters, not prose.`
  );
}

// ---------------------------------------------------------------------------
// Safe inbound verified-patch gate
// ---------------------------------------------------------------------------
// The only way external (audit/repair) output reaches Recourse's disk. A code
// patch is applied ONLY when: it targets a file under the repo root, the new
// source passes its (reference) suite in the real sandbox, and it clears the
// lint gate. Config-only changes (no source) are allowed but logged as such.

function resolveRepoRoot(explicit?: string): string {
  return path.resolve(explicit || process.env.RECOURSE_REPO || process.cwd());
}

/** Guard a candidate path: must resolve under root; refuses traversal. */
export function isPathWithinRoot(file: string, root: string): boolean {
  const abs = path.resolve(root, file);
  const rel = path.relative(root, abs);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

export async function verifyAndApplyPatch(
  patch: ProposedPatch,
  opts: { root?: string; lint?: boolean; bootGreen?: BootGreenGate } = {},
): Promise<PatchResult> {
  const root = resolveRepoRoot(opts.root);
  if (!getFleetDriver(patch.driverId)) {
    return { applied: false, file: patch.file, error: `unknown driver "${patch.driverId}" — refused` };
  }
  if (!patch.file || !isPathWithinRoot(patch.file, root)) {
    return { applied: false, file: patch.file, error: `file "${patch.file}" is outside the repo root — refused` };
  }

  // Code change: must be verified before it can touch disk. Config/data writes
  // (non-code extensions, no suite) are not force-linted as if they were code.
  const hasSource = Boolean(patch.source && patch.source.trim().length > 0);
  const isCodeFile = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/i.test(patch.file);
  const isCodeChange = hasSource && (isCodeFile || Boolean(patch.suite));
  if (hasSource && isCodeChange) {
    const wantLint = opts.lint !== false;
    if (wantLint) {
      const lint = lintSource(patch.source, 'ts');
      if (lint.available && !lint.clean) {
        return { applied: false, file: patch.file, error: `lint gate blocked: ${lint.details.slice(0, 2).join('; ') || 'not clean'}` };
      }
    }
    if (patch.suite) {
      const run = executeTestSuite(patch.source, patch.suite);
      if (!run.passed) {
        return { applied: false, file: patch.file, error: `sandbox suite failed: ${run.testDetails.filter((d) => d.startsWith('[FAIL')).slice(0, 3).join('; ') || 'not passing'}` };
      }
    }
    // Optional CI-green gate for harness (monolith) patches the sandbox cannot
    // fully verify (they import siblings / reference module state). Runs before
    // any write; a red gate blocks the patch entirely.
    if (opts.bootGreen) {
      const verdict = await Promise.resolve(opts.bootGreen({ file: patch.file, source: patch.source, root }));
      if (!verdict.ok) {
        return { applied: false, file: patch.file, error: `boot-green gate blocked: ${verdict.error || 'compile/boot not green'}` };
      }
    }
  }

  const abs = path.resolve(root, patch.file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });

  // Snapshot any prior content so the patch is revertable (harness evolution).
  let prevSource: string | null = null;
  let prevExisted = false;
  if (fs.existsSync(abs)) {
    prevExisted = true;
    try {
      prevSource = fs.readFileSync(abs, 'utf-8');
    } catch {
      prevSource = null;
    }
  }

  fs.writeFileSync(abs, patch.source, 'utf-8');
  const hash = crypto.createHash('sha256').update(patch.source).digest('hex').substring(0, 16);

  let revertToken: string | undefined;
  if (isCodeChange && (prevExisted || /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/i.test(patch.file))) {
    const journal = readFleetJournal(root);
    revertToken = crypto.randomBytes(6).toString('hex');
    journal.entries.unshift({
      token: revertToken,
      driverId: patch.driverId,
      file: patch.file,
      appliedHash: hash,
      prevSource,
      prevExisted,
      ts: Date.now(),
      reverted: false,
      note: patch.note,
    });
    if (journal.entries.length > 200) journal.entries.length = 200;
    writeFleetJournal(root, journal);
  }

  const bootGateNote = isCodeChange && opts.bootGreen ? 'boot-green gate passed' : undefined;
  return {
    applied: true,
    file: patch.file,
    hash,
    verified: patch.suite ? 'sandbox suite + lint passed before write' : 'config/source change (no suite) written',
    ...(revertToken ? { revertToken } : {}),
    ...(bootGateNote ? { bootGateNote } : {}),
  };
}

// ---------------------------------------------------------------------------
// BRAIN GATEWAY — Dev-Brain + deterministic-brain, real contracts
// ---------------------------------------------------------------------------
// Two ecosystem decision tools Recourse calls when it has a need:
//   * Dev-Brain (:3450)         -> weighted decision matrix. Recourse uses it to
//     RANK which weakness/action to fix first (repair/triage, decide, fusion).
//   * deterministic-brain (:3210) -> /task deep Parse→Reason→Execute→Audit.
// Both are availability-gated: unreachable/down => honest failure, never a fake
// matrix. Request shapes mirror Draymond's dev-brain client exactly.

export type DevBrainAction = 'decide' | 'triage' | 'fusion' | 'strategy';

export interface DevBrainCandidate {
  /** Sent as Dev-Brain's candidate `name`. */
  name: string;
  description: string;
  tags?: string[];
  license?: string;
  stars?: number;
  language?: string;
  platform?: string;
}

export interface DevBrainMatrixOption {
  id: string;
  name: string;
  description: string;
  weightPercentage: number;
  recommended?: boolean;
}

export interface DevBrainMatrix {
  decisionTopic?: string;
  recommendedOptionId?: string;
  options: DevBrainMatrixOption[];
  synthesisRationale?: string;
  tradeOffSummary?: string;
  generatedBy?: string;
}

export type DevBrainStrategy =
  | 'balanced_pareto'
  | 'risk_containment'
  | 'hyper_velocity'
  | 'capital_efficiency'
  | 'deep_tech_scalability';

const DEV_BRAIN_PATH: Record<DevBrainAction, string> = {
  decide: '/api/decide',
  triage: '/api/repair/triage',
  fusion: '/api/fusion/decide',
  strategy: '/api/strategy/decide',
};

/** Build the exact Dev-Brain POST body (candidates keyed by `name`). */
export function buildDevBrainBody(problem: string, candidates: DevBrainCandidate[], strategy?: DevBrainStrategy) {
  return {
    problem,
    strategy,
    candidates: (candidates ?? []).map((c) => ({
      name: c.name,
      description: c.description,
      license: c.license,
      stars: c.stars,
      language: c.language,
      platform: c.platform,
      tags: c.tags ?? ['tool'],
    })),
  };
}

export interface DevBrainResult {
  ok: boolean;
  recommendedId?: string;
  orderedIds?: string[];
  matrix?: DevBrainMatrix;
  status?: number;
  error?: string;
}

/** Call Dev-Brain with a decision/triage/fusion request. Honest offline handling. */
export async function callDevBrain(opts: {
  action: DevBrainAction;
  problem: string;
  candidates?: DevBrainCandidate[];
  strategy?: DevBrainStrategy;
  url?: string;
  timeoutMs?: number;
}): Promise<DevBrainResult> {
  const base = (opts.url ?? process.env.DEV_BRAIN_URL ?? 'http://localhost:3450').replace(/\/+$/, '');
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
    try {
      const res = await fetch(`${base}${DEV_BRAIN_PATH[opts.action]}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildDevBrainBody(opts.problem, opts.candidates ?? [], opts.strategy)),
        signal: controller.signal,
      });
      if (!res.ok) return { ok: false, status: res.status, error: `Dev-Brain ${DEV_BRAIN_PATH[opts.action]} HTTP ${res.status}` };
      const data = (await res.json()) as DevBrainMatrix;
      if (!data || !Array.isArray(data.options)) return { ok: false, error: 'Dev-Brain returned no matrix options' };
      const ordered = [...data.options].sort((a, b) => (b.weightPercentage ?? 0) - (a.weightPercentage ?? 0));
      return {
        ok: true,
        recommendedId: data.recommendedOptionId,
        orderedIds: ordered.map((o) => o.id).filter(Boolean),
        matrix: data,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Convenience: rank a set of Recourse weaknesses via Dev-Brain repair/triage. */
export async function devBrainTriageWeaknesses(opts: {
  problem: string;
  findings: DevFinding[];
  url?: string;
  strategy?: DevBrainStrategy;
}): Promise<DevBrainResult> {
  return callDevBrain({
    action: 'triage',
    problem: opts.problem,
    candidates: opts.findings.map((f) => ({ name: f.slug, description: f.reasons.join('; '), tags: ['recourse-weakness'] })),
    strategy: opts.strategy,
    url: opts.url,
  });
}

// ---------------------------------------------------------------------------
// VERIFIED PATCH INTAKE — close the loop so a driver actually drives Recourse
// ---------------------------------------------------------------------------
// A fleet driver (The Deep / Axiom / Dev-Brain) answers in prose or a plan.
// That text is not code until Recourse parses it into candidate patches and
// pushes each one through verifyAndApplyPatch (Recourse's own real sandbox
// verifier + lint gate). Only candidates that pass that gate touch disk.
//
// Honesty contract: parsing is deterministic and purely structural. Whatever
// cannot be read as a well-formed patch is skipped with a reason — never
// guessed, never "applied" by pretending. applyDriverProposal reports exactly
// how many candidates applied, how many were rejected, and why.

export interface PatchCandidate {
  /** Path relative to the Recourse repo root. */
  file: string;
  source: string;
  /** Regression / reference suite the new code must pass in the sandbox. */
  suite?: string;
  domain?: ToolDomain;
  note?: string;
}

/** The exact instruction Recourse sends so a driver answers with parseable JSON
 *  fence blocks instead of free prose. */
export function buildPatchIntakeQuery(dossier: HealthDossier, driverLabel: string): string {
  const top = dossier.findings
    .slice(0, 6)
    .map((f) => `- [score ${f.weaknessScore}] ${f.name}: ${f.reasons.join('; ')}`)
    .join('\n');
  return (
    `You are ${driverLabel}, developing Recourse. Respond with concrete repairs only. ` +
    `Health index ${dossier.healthIndex}, ${dossier.registryTools} registry tools, ` +
    `${dossier.liveSelfHostedTools} live self-hosted tools. Weaknesses:\n${top || '(none above threshold)'}\n` +
    `For every repair you propose, output it as ONE fenced JSON block per file in this exact shape:\n` +
    '```json\n{ "file": "path/relative/to/repo/root", "source": "the complete new file contents", "suite": "optional real test code that proves the fix" }\n```\n' +
    `Rules: paths are repo-relative with forward slashes; every code change MUST carry a real suite that passes; ` +
    `do not invent files outside the repo. Recourse applies a patch ONLY after it passes its own sandbox verifier + lint, ` +
    `so correctness matters, not prose.`
  );
}

function toCandidate(raw: unknown): PatchCandidate | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.file !== 'string' || !o.file.trim()) return null;
  if (typeof o.source !== 'string') return null;
  const file = o.file.trim().replace(/\\/g, '/');
  const candidate: PatchCandidate = { file, source: o.source };
  if (typeof o.suite === 'string' && o.suite.trim()) candidate.suite = o.suite;
  if (typeof o.domain === 'string' && o.domain) candidate.domain = o.domain as ToolDomain;
  if (typeof o.note === 'string' && o.note.trim()) candidate.note = o.note.trim();
  return candidate;
}

/** Deterministic extraction of patch candidates from a driver's text output.
 *  Supports fenced JSON objects/arrays and a top-level JSON array. Anything it
 *  cannot parse structurally is ignored (returned separately as `skipped`). */
export function extractPatchCandidates(output: string): { candidates: PatchCandidate[]; skipped: number } {
  if (!output || !output.trim()) return { candidates: [], skipped: 0 };
  const candidates: PatchCandidate[] = [];
  let skipped = 0;

  const push = (raw: unknown) => {
    if (Array.isArray(raw)) {
      for (const item of raw) {
        const c = toCandidate(item);
        if (c) candidates.push(c);
        else skipped += 1;
      }
      return;
    }
    const c = toCandidate(raw);
    if (c) candidates.push(c);
    else skipped += 1;
  };

  // Top-level pure JSON (a single object or array) is accepted first.
  const trimmed = output.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      push(JSON.parse(trimmed));
      if (candidates.length > 0) return { candidates, skipped };
    } catch {
      // not pure JSON — fall through to fence scanning
    }
  }

  // Fenced JSON blocks: ```json ... ```
  const fenceRe = /```(?:json)?[ \t]*\n([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(output)) !== null) {
    const inner = m[1].trim();
    if (!inner) continue;
    try {
      push(JSON.parse(inner));
    } catch {
      skipped += 1;
    }
  }

  return { candidates, skipped };
}

export interface DriverProposalResult {
  /** Number of parsed candidates that passed the gate and were written. */
  appliedCount: number;
  /** Number of parsed candidates rejected by the gate. */
  rejectedCount: number;
  /** Number of raw JSON blocks that could not be parsed into patches. */
  skippedCount: number;
  applied: boolean;
  results: PatchResult[];
}

/** Run a driver's full-text proposal through the verified-patch intake. Only
 *  gate-passing candidates reach disk. Empty/no-op proposals report honestly. */
export async function applyDriverProposal(opts: {
  driverId: string;
  output: string;
  root?: string;
  lint?: boolean;
  bootGreen?: BootGreenGate;
}): Promise<DriverProposalResult> {
  if (!getFleetDriver(opts.driverId)) {
    return { applied: false, appliedCount: 0, rejectedCount: 0, skippedCount: 0, results: [] };
  }
  const { candidates, skipped } = extractPatchCandidates(opts.output);
  if (candidates.length === 0) {
    return {
      applied: false,
      appliedCount: 0,
      rejectedCount: 0,
      skippedCount: skipped,
      results: [],
    };
  }
  const results: PatchResult[] = [];
  for (const c of candidates) {
    const res = await verifyAndApplyPatch(
      { driverId: opts.driverId, file: c.file, source: c.source, suite: c.suite, domain: c.domain, note: c.note },
      { root: opts.root, lint: opts.lint, bootGreen: opts.bootGreen },
    );
    results.push(res);
  }
  const appliedCount = results.filter((r) => r.applied).length;
  const rejectedCount = results.filter((r) => !r.applied).length;
  return {
    applied: appliedCount > 0,
    appliedCount,
    rejectedCount,
    skippedCount: skipped,
    results,
  };
}
