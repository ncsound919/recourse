/**
 * runReport.ts — the per-run record that says whether a run was WORTH anything.
 *
 * The autopilot could report that it ran. It could not report that it changed
 * anything, which is why a run whose planner was offline looked identical to one
 * that merged verified code. Every number here is measured, and the headline is
 * `significant`: `filesChanged >= 2 && gatesPassed >= 1 && fitnessDelta > 0`.
 *
 * Three of those are deliberately conservative:
 *   - `filesChanged >= 2` — a one-file change is almost always a micro-step;
 *     the audit found those dominated the historical output.
 *   - `gatesPassed >= 1` — a proposal that never passed a gate changed nothing
 *     verified, whatever it wrote.
 *   - `fitnessDelta > 0` — a change that measurably did not improve the thing
 *     it targeted is not an upgrade, however many files it touched.
 *
 * Reports are written to `docs/audits/runs/<runId>.json` and never merged into
 * each other, so a run's record survives the next one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export const RunReport = z.object({
  runId: z.string(),
  /** ISO timestamp; excluded from nothing here, but never hashed into the ledger. */
  generatedAt: z.string().datetime(),
  profileSlug: z.string(),

  /** Gaps the analyzer produced, including the composite ones. */
  gapsConsidered: z.number().int().min(0),
  /** Composite (cross-domain) gaps in the queue. */
  compositeGaps: z.number().int().min(0),
  /** Proposals that reached the gate. */
  proposals: z.number().int().min(0),
  /** Why proposals produced nothing, counted by reason. Empty means none skipped. */
  skipped: z.record(z.string(), z.number().int().min(0)),

  /** Files the selected proposal would change, and how many lines it adds. */
  filesChanged: z.number().int().min(0),
  locAdded: z.number().int().min(0),

  gatesPassed: z.number().int().min(0),
  gatesFailed: z.number().int().min(0),
  /** Which verification lane the proposal needed, if it was gated. */
  laneA: z.boolean(),
  laneB: z.boolean(),

  /** Post-merge scorecard movement. Null when the run never merged. */
  fitnessDelta: z.number().nullable(),
  /** Learner calibration at the end of the run. Null when no episode ran. */
  forecastBrier: z.number().nullable(),
  forecastEce: z.number().nullable(),
  selfEce: z.number().nullable(),

  /** Directives that steered gap ranking, so the influence is attributable. */
  directiveInfluence: z.array(z.object({
    directiveId: z.string(),
    gapId: z.string(),
  })).default([]),
  /** Composite pairs that became gaps, with the engine's own rationale. */
  compositePairs: z.array(z.object({
    gapId: z.string(),
    domains: z.array(z.string()),
    rationale: z.string(),
    score: z.number(),
  })).default([]),

  /** Loop status, verbatim, so a failure is readable from the report alone. */
  outcome: z.string(),
  outcomeReason: z.string().optional(),

  /** The headline. See the doc comment for the thresholds. */
  significant: z.boolean(),
  /** Why `significant` is what it is, in one line. Never a bare boolean. */
  significanceNote: z.string(),
});
export type RunReportT = z.infer<typeof RunReport>;

export const RUN_REPORT_DIR = 'docs/audits/runs';

/** Thresholds for `significant`. Exported so a test and the nightly script agree. */
export const SIGNIFICANCE = {
  minFilesChanged: 2,
  minGatesPassed: 1,
  minFitnessDelta: 0,
} as const;

export interface SignificanceInput {
  filesChanged: number;
  gatesPassed: number;
  fitnessDelta: number | null;
}

/**
 * The headline verdict plus the reason for it. A boolean with no reason is the
 * failure mode this module exists to remove, so the reason is always produced —
 * including the near-misses, which are the useful part.
 */
export function assessSignificance(input: SignificanceInput): {
  significant: boolean;
  note: string;
} {
  const { filesChanged, gatesPassed, fitnessDelta } = input;
  const reasons: string[] = [];

  if (filesChanged < SIGNIFICANCE.minFilesChanged) {
    reasons.push(`filesChanged ${filesChanged} < ${SIGNIFICANCE.minFilesChanged}`);
  }
  if (gatesPassed < SIGNIFICANCE.minGatesPassed) {
    reasons.push(`gatesPassed ${gatesPassed} < ${SIGNIFICANCE.minGatesPassed}`);
  }
  if (fitnessDelta === null) {
    reasons.push('nothing merged, so no fitnessDelta exists');
  } else if (fitnessDelta <= SIGNIFICANCE.minFitnessDelta) {
    reasons.push(`fitnessDelta ${fitnessDelta} <= ${SIGNIFICANCE.minFitnessDelta}`);
  }

  return reasons.length === 0
    ? {
        significant: true,
        note:
          `significant: ${filesChanged} file(s) changed, ${gatesPassed} gate(s) passed, ` +
          `fitnessDelta ${fitnessDelta}`,
      }
    : { significant: false, note: `not significant: ${reasons.join('; ')}` };
}

/** Lines added by a set of proposal files. Blank lines and comments do not count. */
export function countLocAdded(files: Array<{ content: string }>): number {
  let total = 0;
  for (const f of files) {
    for (const line of f.content.split(/\r?\n/)) {
      const t = line.trim();
      if (t === '' || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
      total += 1;
    }
  }
  return total;
}

export function newRunId(now: Date = new Date()): string {
  return `run-${now.toISOString().replace(/[:.]/g, '-')}`;
}

/**
 * Write the report under `docs/audits/runs/<runId>.json`.
 *
 * Returns the absolute path written, or null with a warning when the report
 * could not be persisted. A run report that fails to write must not fail the
 * run it describes, but the failure is logged: a silently missing report is how
 * "we always write reports" becomes true without evidence.
 */
export function writeRunReport(
  report: RunReportT,
  dir: string = RUN_REPORT_DIR,
): string | null {
  try {
    const absDir = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
    fs.mkdirSync(absDir, { recursive: true });
    const file = path.join(absDir, `${report.runId}.json`);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(report, null, 2), 'utf8');
    fs.renameSync(tmp, file);
    return file;
  } catch (err) {
    console.warn(
      `[runReport] could not persist ${report.runId}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/** Read a persisted report, or null when it is missing or unreadable. */
export function readRunReport(runId: string, dir: string = RUN_REPORT_DIR): RunReportT | null {
  try {
    const absDir = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
    return RunReport.parse(JSON.parse(fs.readFileSync(path.join(absDir, `${runId}.json`), 'utf8')));
  } catch {
    return null;
  }
}

/**
 * Every persisted run id, newest first. A file that does not parse as a report
 * is skipped rather than listed: a half-written write or a stray file in the
 * directory must not show up as a run, and must not dilute `significantRunRate`.
 */
export function listRunIds(dir: string = RUN_REPORT_DIR): string[] {
  let files: string[];
  try {
    const absDir = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
    files = fs.readdirSync(absDir).filter((f) => f.endsWith('.json'));
    const ids: string[] = [];
    for (const f of files) {
      const id = f.replace(/\.json$/, '');
      if (readRunReport(id, dir) !== null) ids.push(id);
    }
    return ids.sort().reverse();
  } catch {
    return [];
  }
}

/** How many of the last `n` runs were significant. -1 when there are none. */
export function significantRunRate(n: number, dir: string = RUN_REPORT_DIR): number {
  const ids = listRunIds(dir).slice(0, Math.max(0, n));
  if (ids.length === 0) return -1;
  const significant = ids.filter((id) => readRunReport(id, dir)?.significant === true).length;
  return Math.round((significant / ids.length) * 1000) / 1000;
}

/** One markdown line per report, for a human skimming the run history. */
export function renderRunReportSummary(report: RunReportT): string {
  const skipped = Object.entries(report.skipped).map(([k, v]) => `${k}=${v}`).join(' ') || 'none';
  const lanes = [report.laneA ? 'A' : null, report.laneB ? 'B' : null].filter(Boolean).join('+') || 'none';
  return [
    `- \`${report.runId}\` **${report.significant ? 'SIGNIFICANT' : 'not significant'}**`,
    `  gaps=${report.gapsConsidered} (composite ${report.compositeGaps}) proposals=${report.proposals} skipped=${skipped}`,
    `  files=${report.filesChanged} loc=${report.locAdded} gates=${report.gatesPassed}/${report.gatesPassed + report.gatesFailed} lane=${lanes}`,
    `  fitness=${report.fitnessDelta ?? 'n/a'} brier=${report.forecastBrier ?? 'n/a'} ece=${report.forecastEce ?? 'n/a'} selfEce=${report.selfEce ?? 'n/a'}`,
    `  ${report.significanceNote}`,
  ].join('\n');
}
