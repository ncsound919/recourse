/**
 * Issue Progression Tracker — turns "presented problems" into trackable,
 * documented progress.
 *
 * Aggregates REAL Recourse state per grant-engine problem:
 *   - gaps + hypotheses from the oncology grant engine registry
 *   - experiments + findings from the science conductor loop (data/science-loop)
 *   - trend insights from the hash-chained discovery ledger (data/trend-ledger.jsonl)
 *   - goal signals from the goal ledger (recourse_goals.json)
 *
 * Honesty contract (mirrors the rest of Recourse):
 *   - Every counter derives from real persisted data. Nothing is invented.
 *   - If no science cycle ever referenced a problem, experimentsRun=0 and
 *     findingsCount=0 — never interpolated, never padded.
 *   - status is 'stalled' ONLY when a problem has open gaps (gapCount>0) and
 *     zero experiments, zero findings, and zero trend insights.
 *
 * Persistence: data/issues/records.json is written atomically (tmp + rename),
 * so a crash mid-write never leaves a torn JSON file. Rendering is
 * deterministic for a given state of the underlying data files.
 */

import fs from 'fs';
import path from 'path';
import {
  listProblems,
  getProblem,
  findGaps,
  generateHypotheses,
  type GapRef,
  type Hypothesis,
} from './oncologyGrantEngine.js';
import { recentCycles, recentFindings } from './scienceConductor.js';
import { recentInsights, verifyLedgerChain, type LedgerInsight } from './trendLedger.js';
import {
  initGoalLedger,
  getGoalProgress,
  getMathAttempts,
  getBiotechClaims,
  type MathAttempt,
  type BiotechClaim,
} from './goalLedger.js';

export type IssueStatus = 'open' | 'in_progress' | 'stalled';

export interface IssueRecord {
  issueId: string;
  title: string;
  summary: string;
  status: IssueStatus;
  gapCount: number;
  hypothesisCount: number;
  experimentsRun: number;
  findingsCount: number;
  trendInsights: number;
  goalSignals: number;
  /** 0..1, derived deterministically from real counters (formula below). */
  progressScore: number;
  /** Max real epoch-ms across the registry snapshot, science cycles, and goal ledger. */
  lastUpdatedAt: number;
}

function issuesDir(outDir?: string): string {
  return outDir ? path.resolve(outDir) : path.join(process.cwd(), 'data', 'issues');
}

function recordsFile(dir: string): string {
  return path.join(dir, 'records.json');
}

// --- goal ledger lazy load ----------------------------------------------------
// getMathAttempts/getBiotechClaims read in-memory state. In a live server the
// state is populated at startup (server.ts calls initGoalLedger); when this
// module runs standalone we load the persisted ledger once so goal signals are
// real, not silently empty. Never clobbers in-memory entries already present.
function ensureGoalLedgerLoaded(): void {
  if (getMathAttempts(1).length === 0 && getBiotechClaims(1).length === 0) {
    try {
      initGoalLedger();
    } catch {
      // goal ledger is optional context; degrade to zero signals, never throw
    }
  }
}

// --- deterministic joins -------------------------------------------------------

function insightMatchesProblem(insight: LedgerInsight, problemId: string): boolean {
  const payload = insight.payload as Record<string, unknown> | undefined;
  if (typeof payload?.problemId === 'string' && payload.problemId === problemId) return true;
  if (typeof insight.provenanceRoot === 'string' && insight.provenanceRoot.includes(problemId)) return true;
  try {
    if (JSON.stringify(insight.payload).includes(problemId)) return true;
  } catch {
    // payload is not serializable; treat as non-matching
  }
  return false;
}

function mathEntryMentions(a: MathAttempt, problemId: string): boolean {
  const haystack = JSON.stringify({
    problemId: a.problemId,
    problemTier: a.problemTier,
    toolName: a.toolName,
    failureReason: a.failureReason,
    sourceCode: a.sourceCode,
    acceptanceTest: a.acceptanceTest,
  });
  return haystack.includes(problemId);
}

function biotechEntryMentions(c: BiotechClaim, problemId: string): boolean {
  const haystack = JSON.stringify({
    assetName: c.assetName,
    leg: c.leg,
    evidenceTier: c.evidenceTier,
    source: c.source,
    mechanism: c.mechanism,
    summary: c.summary,
    matchedEntity: c.matchedEntity,
  });
  return haystack.includes(problemId);
}

function countGoalSignals(problemId: string, math: MathAttempt[], biotech: BiotechClaim[]): number {
  let n = 0;
  for (const a of math) if (mathEntryMentions(a, problemId)) n++;
  for (const c of biotech) if (biotechEntryMentions(c, problemId)) n++;
  return n;
}

/**
 * Number of open gaps with at least one REAL experiment finding. A finding is
 * linked to a gap via its hypothesisId (hypothesis ids encode the gap they
 * target). This is the honest "gaps addressed" counter — it only moves when
 * the science loop actually ran against the gap.
 */
function addressedGapCount(hypotheses: Hypothesis[], matchingFindings: Array<{ hypothesisId: string }>): number {
  const byId = new Map(hypotheses.map((h) => [h.id, h]));
  const addressed = new Set<string>();
  for (const f of matchingFindings) {
    const h = byId.get(f.hypothesisId);
    if (h) addressed.add(`${h.gapRef.subMechanism}::${h.gapRef.tier}`);
  }
  return addressed.size;
}

/**
 * Progress score — deterministic weighted sum over real counters, clamped 0..1:
 *
 *   gapAddressRate     = gaps with experiment evidence / open gaps  (0 when no gaps)
 *   experimentCoverage = min(1, experimentsRun / (2 * gapCount))    (2 real experiments per open gap = full)
 *   progressScore      = clamp01( 0.6 * gapAddressRate + 0.4 * experimentCoverage )
 *
 * When a problem has no open gaps its score is 1 (nothing left to address).
 * Weights favor gap coverage over raw experiment volume so running many
 * experiments on one gap cannot mask untouched gaps.
 */
function computeProgressScore(args: { gapCount: number; addressedGaps: number; experimentsRun: number }): number {
  if (args.gapCount === 0) return 1;
  const gapAddressRate = args.addressedGaps / args.gapCount;
  const experimentCoverage = Math.min(1, args.experimentsRun / (2 * args.gapCount));
  const raw = 0.6 * gapAddressRate + 0.4 * experimentCoverage;
  return Math.round(Math.min(1, Math.max(0, raw)) * 1000) / 1000;
}

function deriveStatus(args: { gapCount: number; experimentsRun: number; findingsCount: number; trendInsights: number }): IssueStatus {
  const active = args.experimentsRun > 0 || args.findingsCount > 0 || args.trendInsights > 0;
  if (args.gapCount > 0 && !active) return 'stalled';
  if (active) return 'in_progress';
  return 'open';
}

/**
 * Aggregate real Recourse state into one IssueRecord per grant-engine problem.
 * The science conductor records exactly one finding per executed experiment,
 * so experimentsRun (real experiments executed) equals the count of matching
 * findings — documented here, not assumed: runBiosimExperiment,
 * runUmoeExperiment and runLocalFallbackExperiment each push one finding per
 * executed experiment and increment experimentsRun by the same amount.
 */
export function computeIssueProgress(): IssueRecord[] {
  ensureGoalLedgerLoaded();
  const cycles = recentCycles();
  const findings = recentFindings();
  const insights = recentInsights();
  const math = getMathAttempts();
  const biotech = getBiotechClaims();
  const goals = getGoalProgress();

  return listProblems().map((p) => {
    const problemId = p.problem_id;
    const gaps = findGaps(problemId);
    const hypotheses = generateHypotheses(problemId);
    const matchingFindings = findings.filter((f) => f.problemId === problemId);
    const matchingCycles = cycles.filter((c) => c.problemId === problemId);
    const matchingInsights = insights.filter((i) => insightMatchesProblem(i, problemId));

    const experimentsRun = matchingFindings.length;
    const findingsCount = matchingFindings.length;
    const trendInsights = matchingInsights.length;
    const goalSignals = countGoalSignals(problemId, math, biotech);
    const gapCount = gaps.length;
    const addressedGaps = addressedGapCount(hypotheses, matchingFindings);

    const registryTs = new Date(p.lastUpdated).getTime() || 0;
    const cycleTs = matchingCycles.length > 0 ? Math.max(...matchingCycles.map((c) => c.startedAt)) : 0;
    const goalTs = goals.lastUpdatedAt || 0;

    return {
      issueId: problemId,
      title: p.title,
      summary: p.summary,
      status: deriveStatus({ gapCount, experimentsRun, findingsCount, trendInsights }),
      gapCount,
      hypothesisCount: hypotheses.length,
      experimentsRun,
      findingsCount,
      trendInsights,
      goalSignals,
      progressScore: computeProgressScore({ gapCount, addressedGaps, experimentsRun }),
      lastUpdatedAt: Math.max(registryTs, cycleTs, goalTs),
    };
  });
}

// --- atomic persistence ---------------------------------------------------------

function writeRecordsAtomic(dir: string, records: IssueRecord[]): void {
  const file = recordsFile(dir);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(records, null, 2), 'utf-8');
  fs.renameSync(tmp, file);
}

// --- markdown rendering ----------------------------------------------------------

function slugify(id: string): string {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function gapLine(g: GapRef): string {
  return `- [T${g.tier} · ${g.subMechanism}] ${g.gapDescription}`;
}

function hypothesisLine(h: Hypothesis): string {
  return `- \`${h.id}\` [T${h.gapRef.tier} · ${h.gapRef.subMechanism}] ${h.text}`;
}

/** One markdown doc per issue. "Progress this cycle" is built ONLY from real
 *  findings/insights with their provenance strings; a zero-progress issue says
 *  so plainly instead of inventing activity. */
function renderIssueMarkdown(rec: IssueRecord): string {
  const problem = getProblem(rec.issueId);
  const gaps = findGaps(rec.issueId);
  const hypotheses = generateHypotheses(rec.issueId);
  const matchingFindings = recentFindings().filter((f) => f.problemId === rec.issueId);
  const matchingCycles = recentCycles().filter((c) => c.problemId === rec.issueId);
  const matchingInsights = recentInsights().filter((i) => insightMatchesProblem(i, rec.issueId));

  const lines: string[] = [];
  lines.push(`# ${problem.title}`);
  lines.push('');
  lines.push(
    `**Issue:** \`${rec.issueId}\` · **Status:** \`${rec.status}\` · **Progress score:** ${rec.progressScore.toFixed(3)}`,
  );
  lines.push('');
  lines.push(problem.summary);
  lines.push('');
  lines.push(`_Last updated: ${new Date(rec.lastUpdatedAt).toISOString()}._`);
  lines.push('');
  lines.push(`## Open gaps (${gaps.length})`);
  if (gaps.length === 0) {
    lines.push('_No open gaps — every ladder rung carries at least one sourced claim._');
  } else {
    lines.push(...gaps.map(gapLine));
  }
  lines.push('');
  lines.push(`## Hypotheses (${hypotheses.length})`);
  if (hypotheses.length === 0) {
    lines.push('_No falsifiable hypotheses generated — nothing to test._');
  } else {
    lines.push(...hypotheses.map(hypothesisLine));
  }
  lines.push('');
  lines.push('## Progress this cycle');
  lines.push('');
  lines.push(`- Cycles targeting this issue: ${matchingCycles.length}`);
  lines.push(`- Experiments run: ${rec.experimentsRun}`);
  lines.push(`- Findings: ${rec.findingsCount}`);
  lines.push(`- Trend insights: ${rec.trendInsights}`);
  lines.push(`- Goal signals: ${rec.goalSignals}`);
  lines.push('');
  if (matchingFindings.length === 0 && matchingInsights.length === 0) {
    lines.push(
      'No experiments, findings, or insights were recorded for this issue this cycle — progress here is genuinely zero.',
    );
  } else {
    if (matchingFindings.length > 0) {
      lines.push('### Real findings');
      for (const f of matchingFindings) {
        lines.push(`- _(kind=${f.kind}, mode=${f.mode}, cycle=${f.cycle})_ ${f.claim}`);
        lines.push(`  - provenance: \`${f.provenance}\``);
      }
    }
    if (matchingInsights.length > 0) {
      lines.push('### Real trend insights');
      for (const i of matchingInsights) {
        lines.push(`- _[${i.id}]_ ${i.statement}`);
        lines.push(`  - run: \`${i.createdRun}\` · provenanceRoot: \`${i.provenanceRoot}\``);
      }
    }
  }
  lines.push('');
  return lines.join('\n');
}

/** Write one markdown file per issue under data/issues/<slug>.md and persist
 *  records.json atomically. Returns the written file paths. */
export function renderIssueDocs(outDir?: string): { files: string[] } {
  const records = computeIssueProgress();
  const dir = issuesDir(outDir);
  fs.mkdirSync(dir, { recursive: true });
  const files: string[] = [];
  for (const rec of records) {
    const file = path.join(dir, `${slugify(rec.issueId)}.md`);
    fs.writeFileSync(file, renderIssueMarkdown(rec), 'utf-8');
    files.push(file);
  }
  writeRecordsAtomic(dir, records);
  return { files };
}

/** Write data/issues/README.md — a table of every issue with its score plus
 *  real discovery-ledger integrity status. */
export function renderIssueIndex(outDir?: string): { file: string } {
  const records = computeIssueProgress();
  const dir = issuesDir(outDir);
  fs.mkdirSync(dir, { recursive: true });
  const ledger = verifyLedgerChain();

  const lines: string[] = [];
  lines.push('# Recourse Issue Progression Index');
  lines.push('');
  lines.push(
    `_Generated deterministically from real persisted state (grant registry, science-loop, trend-ledger, goal ledger). ${records.length} issues._`,
  );
  lines.push('');
  lines.push('| issue | title | status | gaps | hypotheses | experiments | findings | insights | goals | score |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of records) {
    lines.push(
      `| ${r.issueId} | ${r.title} | ${r.status} | ${r.gapCount} | ${r.hypothesisCount} | ${r.experimentsRun} | ${r.findingsCount} | ${r.trendInsights} | ${r.goalSignals} | ${r.progressScore.toFixed(3)} |`,
    );
  }
  lines.push('');
  lines.push('## Ledger integrity');
  lines.push(
    `- Discovery ledger chain: ${ledger.valid ? 'valid' : 'BROKEN'} (${ledger.length} records${ledger.brokenAt !== undefined ? `, broken at ${ledger.brokenAt}` : ''})`,
  );
  lines.push('');

  const file = path.join(dir, 'README.md');
  fs.writeFileSync(file, lines.join('\n'), 'utf-8');
  return { file };
}

/** Re-read records from disk (data/issues/records.json) when present, else compute. */
export function readIssueRecords(): IssueRecord[] {
  const dir = issuesDir();
  try {
    const file = recordsFile(dir);
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (Array.isArray(parsed)) return parsed as IssueRecord[];
    }
  } catch {
    // corrupt or missing records.json — recompute from real state rather than guess
  }
  return computeIssueProgress();
}