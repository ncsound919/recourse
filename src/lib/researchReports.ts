/**
 * Fleet research report generator — aggregates REAL Recourse fleet state into
 * dated, honest markdown reports under data/reports/.
 *
 * Honesty contract (mirrors the rest of Recourse):
 *   - Every number in a report comes from a real system API call or a real
 *     file-backed read (conductor counters, findings JSONL, trend ledger,
 *     scheduler state, goal ledger). Nothing is fabricated or interpolated.
 *   - Offline / empty / unavailable sources are reported as zero or as an
 *     explicit note — never dressed up, never estimated.
 *   - The issues section comes from src/lib/issueTracker.ts (computeIssueProgress).
 *     If the module is absent, the report never fabricates issues — it reports
 *     the section as empty and skips renderIssueDocs.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  getConductorStatus,
  recentCycles,
  recentFindings,
} from './scienceConductor.js';
import { recentInsights, verifyLedgerChain } from './trendLedger.js';
import { getSchedulerStatus } from './jobScheduler.js';
import { getGoalProgress } from './goalLedger.js';
import { axiomReachable } from './axiomBridge.js';
import { computeIssueProgress, renderIssueDocs, type IssueRecord } from './issueTracker.js';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export interface FleetReport {
  generatedAt: number;
  cycleCount: number;
  lastCycleAt: number | null;
  findingsCount: number;
  trendInsightsCount: number;
  ledgerValid: boolean;
  goalProgress: ReturnType<typeof getGoalProgress>;
  jobs: Array<{
    id: string;
    enabled: boolean;
    runCount: number;
    failCount: number;
    lastOk: boolean | null;
    cadenceMs: number | null;
  }>;
  issues: IssueRecord[];
  serviceNotes: string[];
}

// ----------------------------------------------------------------------------
// Assembly
// ----------------------------------------------------------------------------

const DEFAULT_REPORTS_DIR = path.join(process.cwd(), 'data', 'reports');
const HONESTY_LINE =
  'All figures from real Recourse state — offline/empty sources are reported as zero, never interpolated.';

/**
 * Assemble a FleetReport from real Recourse APIs. Every field is populated
 * from a real call; a missing source yields a zero/empty state, never an error.
 */
export async function generateFleetReport(): Promise<FleetReport> {
  const conductor = getConductorStatus();
  const cycles = recentCycles();
  const findings = recentFindings(1_000_000_000);
  const insights = recentInsights(1_000_000_000);
  const chain = verifyLedgerChain();
  const scheduler = getSchedulerStatus();
  const goalProgress = getGoalProgress();
  const notes: string[] = [];
  const issues: IssueRecord[] = [];

  if (cycles.length === 0) {
    notes.push('Science conductor has no recorded cycles on disk — cycle counts are 0.');
  }
  const latestCycle = cycles[cycles.length - 1];
  if (latestCycle && latestCycle.trendScan?.mode === 'seeded_simulated') {
    notes.push(
      `Latest science cycle ${latestCycle.cycle} used a SEEDED_SIMULATED trend phase — live pageview ` +
        `series were unavailable, so the scan is labeled simulated, not real.`,
    );
  }
  if (insights.length === 0) {
    notes.push('Trend ledger is empty — 0 insights on record.');
  }
  if (!chain.valid) {
    notes.push(
      `Trend ledger chain is INVALID (broken at record ${chain.brokenAt ?? '?'}) — tampering or corruption suspected.`,
    );
  }
  if (!conductor.running) {
    notes.push('Science conductor is not currently running — cycleCount reflects cycles already completed.');
  }
  if (!scheduler.running) {
    notes.push('Job scheduler is not currently running — job counters reflect the last persisted scheduler state.');
  }

  try {
    const computed = computeIssueProgress();
    if (Array.isArray(computed)) issues.push(...computed);
  } catch (err) {
    notes.push(
      `Issue tracker computeIssueProgress() threw (${err instanceof Error ? err.message : String(err)}) — ` +
        `issues section reported empty.`,
    );
  }

  let axiomOk = false;
  try {
    axiomOk = await axiomReachable();
  } catch {
    axiomOk = false;
  }
  notes.push(`Axiom bridge reachable: ${axiomOk ? 'yes' : 'no'}.`);

  return {
    generatedAt: Date.now(),
    cycleCount: conductor.cyclesRun,
    lastCycleAt: conductor.lastCycleAt,
    findingsCount: findings.length,
    trendInsightsCount: insights.length,
    ledgerValid: chain.valid,
    goalProgress,
    jobs: scheduler.jobs.map((j) => ({
      id: j.id,
      enabled: j.enabled,
      runCount: j.runCount,
      failCount: j.failCount,
      lastOk: j.lastOk,
      cadenceMs: j.cadenceMs ?? null,
    })),
    issues,
    serviceNotes: notes,
  };
}

// ----------------------------------------------------------------------------
// Markdown rendering
// ----------------------------------------------------------------------------

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isoDateTime(d: Date): string {
  return `${isoDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

/** Render a dated, honest markdown fleet report. */
export function renderFleetReportMarkdown(report: FleetReport): string {
  const L: string[] = [];
  const generated = new Date(report.generatedAt);
  L.push(`# Recourse Fleet Report — ${isoDate(generated)}`);
  L.push('');
  L.push(HONESTY_LINE);
  L.push('');

  L.push('## System Status');
  L.push('');
  L.push(`- Generated at: ${isoDateTime(generated)}`);
  L.push(`- Science cycles run: ${report.cycleCount}`);
  L.push(`- Last cycle at: ${report.lastCycleAt ? isoDateTime(new Date(report.lastCycleAt)) : 'never'}`);
  L.push(`- Findings recorded: ${report.findingsCount}`);
  L.push(`- Trend ledger insights: ${report.trendInsightsCount}`);
  L.push(`- Ledger chain valid: ${report.ledgerValid ? 'yes' : 'NO — chain broken'}`);
  L.push('');

  L.push('## Job Scheduler');
  L.push('');
  L.push('| job | enabled | runs | fails | last ok | cadence (ms) |');
  L.push('|---|---|---:|---:|---|---|');
  for (const j of report.jobs) {
    L.push(
      `| ${j.id} | ${j.enabled ? 'yes' : 'no'} | ${j.runCount} | ${j.failCount} | ` +
        `${j.lastOk === null ? 'n/a' : j.lastOk ? 'yes' : 'no'} | ${j.cadenceMs ?? 'cron'} |`,
    );
  }
  L.push('');

  L.push('## Goal Progress');
  L.push('');
  L.push(
    `Last updated: ${report.goalProgress.lastUpdatedAt ? isoDateTime(new Date(report.goalProgress.lastUpdatedAt)) : 'never'}`,
  );
  L.push('');
  const m = report.goalProgress.math;
  L.push('### Math');
  L.push(`Solved ${m.solved} / ${m.total} (${pct(m.rate)})`);
  L.push('');
  L.push('| tier | solved | total |');
  L.push('|---|---:|---:|');
  for (const [tier, v] of Object.entries(m.byTier)) L.push(`| ${tier} | ${v.solved} | ${v.total} |`);
  L.push('');
  const b = report.goalProgress.biotech;
  L.push('### Biotech');
  L.push(`Passed ${b.passed} / ${b.total} (${pct(b.rate)})`);
  L.push('');
  L.push('| leg | passed | total |');
  L.push('|---|---:|---:|');
  for (const [leg, v] of Object.entries(b.byLeg)) L.push(`| ${leg} | ${v.passed} | ${v.total} |`);
  L.push('');

  L.push('## Issues (top 5 by progress score)');
  L.push('');
  if (report.issues.length === 0) {
    L.push('No issues on record (issue tracker unavailable or empty).');
  } else {
    const top = [...report.issues].sort((a, b) => b.progressScore - a.progressScore).slice(0, 5);
    L.push('| issue | status | progress score | gaps | experiments | title |');
    L.push('|---|---|---:|---:|---:|---|');
    for (const i of top) {
      L.push(`| ${i.issueId} | ${i.status} | ${i.progressScore.toFixed(3)} | ${i.gapCount} | ${i.experimentsRun} | ${i.title} |`);
    }
  }
  L.push('');

  L.push('## Service Notes');
  L.push('');
  if (report.serviceNotes.length === 0) {
    L.push('All monitored services responded cleanly.');
  } else {
    for (const n of report.serviceNotes) L.push(`- ${n}`);
  }
  L.push('');
  return L.join('\n');
}

// ----------------------------------------------------------------------------
// Daily persistence
// ----------------------------------------------------------------------------

/**
 * Write a dated fleet report (fleet-<YYYY-MM-DD>.md) plus a latest.md content
 * copy. Also invokes issueTracker's renderIssueDocs (guarded — a failure never
 * aborts the report).
 */
export async function renderDailyReport(
  outDir?: string,
): Promise<{ report: FleetReport; files: string[] }> {
  const report = await generateFleetReport();
  const dir = outDir ?? DEFAULT_REPORTS_DIR;
  fs.mkdirSync(dir, { recursive: true });

  const reportFile = path.join(dir, `fleet-${isoDate(new Date(report.generatedAt))}.md`);
  const latestFile = path.join(dir, 'latest.md');
  const md = renderFleetReportMarkdown(report);

  fs.writeFileSync(reportFile, md, 'utf-8');
  fs.writeFileSync(latestFile, md, 'utf-8');
  const files = [reportFile, latestFile];

  try {
    renderIssueDocs();
  } catch {
    // renderIssueDocs is auxiliary; a failure must not abort the report.
  }
  return { report, files };
}

/** List fleet report filenames under data/reports/, newest first. */
export function recentReports(limit = 10): string[] {
  const dir = DEFAULT_REPORTS_DIR;
  try {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && /^fleet-\d{4}-\d{2}-\d{2}\.md$/.test(e.name))
      .map((e) => ({
        name: e.name,
        mtime: fs.statSync(path.join(dir, e.name)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit)
      .map((e) => e.name);
  } catch {
    return [];
  }
}