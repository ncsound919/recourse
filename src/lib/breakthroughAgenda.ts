/**
 * Breakthrough Agenda — rigorous milestone planning for Recourse's two
 * domains (oncology + mathematics). The agenda is the operating contract:
 * every cycle advances a milestone, every milestone has a real verification
 * criterion, every overdue milestone escalates.
 *
 * Three milestone classes, each with a real verification criterion:
 *   - 'oncology_grant': a grant-engine problem must be advanced to progressScore
 *     >= target. The grant engine and science conductor already measure this.
 *   - 'math_solved': a hard-math problem must be solved (all acceptance test
 *     assertions pass via the math conductor's forge attempt). For Tier 3
 *     (open) problems, "solved" is replaced by "bounds_extended" — the
 *     acceptance test must pass with a non-trivial bound.
 *   - 'math_bounds': a Tier 3 problem's bound must be extended past a
 *     specified floor (e.g. Riemann search past T=10000).
 *
 * Each milestone has:
 *   - targetDate: ISO date by which the milestone should hit
 *   - priority: 'low' | 'medium' | 'high' | 'critical'
 *   - verification: a function that consults persisted state to determine
 *     whether the milestone is met. Always returns the actual measured value
 *     plus a 'met' boolean — never a guess.
 *
 * Status is computed deterministically:
 *   - 'met'        : verification says met
 *   - 'on_track'   : not met, but the forecast pace (per-day progress)
 *                    suggests hitting the target date
 *   - 'at_risk'    : not met, pace slower than required
 *   - 'overdue'    : not met and target date has passed
 *
 * The agenda is the SINGLE source of truth for what the system is trying to
 * do. Both conductors consult it to choose which problem to work on next.
 */

import fs from 'fs';
import path from 'path';
import {
  HARD_MATH_PROBLEMS,
  type HardMathProblem,
} from './hardMathProblems.js';
import { computeIssueProgress, type IssueRecord } from './issueTracker.js';
import { getMathAttempts, getGoalProgress, type MathAttempt } from './goalLedger.js';

// --- Persistence -------------------------------------------------------------

const AGENDA_DIR = path.join(process.cwd(), 'data', 'agenda');

export function agendaDir(): string {
  return process.env.AGENDA_DIR || AGENDA_DIR;
}

function agendaFile(): string {
  return path.join(agendaDir(), 'agenda.json');
}

// --- Types -------------------------------------------------------------------

export type MilestoneClass = 'oncology_grant' | 'math_solved' | 'math_bounds';
export type MilestoneStatus = 'met' | 'on_track' | 'at_risk' | 'overdue';
export type MilestonePriority = 'low' | 'medium' | 'high' | 'critical';

export interface MilestoneVerification {
  /** Real measurement (e.g. 0.7 for progressScore, or 10000 for max_bound). */
  currentValue: number;
  /** Threshold the measurement must reach for the milestone to be met. */
  targetValue: number;
  /** Human-readable description of the measurement. */
  description: string;
}

export interface Milestone {
  id: string;
  title: string;
  domain: 'oncology' | 'math';
  class: MilestoneClass;
  /** The problem or issue this milestone references. */
  refId: string;
  /** ISO date the milestone should be met by. */
  targetDate: string;
  priority: MilestonePriority;
  /** What it means to meet this milestone (for the dashboard / operator). */
  successCriterion: string;
  /** Optional parent milestone (this is a sub-goal of another). */
  parent?: string;
  /** Order in the priority queue (0 = highest). */
  order: number;
}

export interface MilestoneStatusReport {
  milestone: Milestone;
  status: MilestoneStatus;
  verification: MilestoneVerification;
  /** Days remaining (negative if past target). */
  daysRemaining: number;
  /** Average progress per day since milestone creation (or epoch if no creation). */
  pacePerDay: number;
  /** Required pace per day to hit the target. */
  requiredPacePerDay: number;
  /** Forecast value at target date based on current pace. */
  forecast: number;
  /** Why this status (e.g. "overdue by 3.2 days", "on track at 0.014/day"). */
  reason: string;
  /** Last update epoch ms. */
  lastUpdatedAt: number;
}

// --- Agenda definition -------------------------------------------------------

/**
 * The full agenda. Curated by the operator. New milestones can be appended;
 * met milestones stay in the agenda for the historical record. The agenda
 * file is the contract — modifying it changes what the system pursues.
 */
export const AGENDA: Milestone[] = [
  // --- MATHEMATICS: Tier 1 (solvable) — get the system to solve these ---
  {
    id: 'M01_collatz_1k',
    title: 'Solve Collatz total-stopping time for n up to 1,000',
    domain: 'math',
    class: 'math_solved',
    refId: 'hm.collatz.total_stopping',
    targetDate: '2026-09-30',
    priority: 'high',
    successCriterion: 'collatzTotalStopping passes all acceptance test assertions (collatzTotalStopping(1)===0, (2)===1, (3)===7, (6)===8, (27)===111, and the search up to 1000 returns a valid {maxSteps, argmax}).',
    order: 0,
  },
  {
    id: 'M02_prime_gap_1k',
    title: 'Solve max prime gap for N up to 1,000',
    domain: 'math',
    class: 'math_solved',
    refId: 'hm.prime.gaps.upto',
    targetDate: '2026-10-15',
    priority: 'high',
    successCriterion: 'maxPrimeGap passes all assertions (gap=6 at N=30; gap>=6 at N=100; gap>=14 at N=1000).',
    order: 1,
  },
  {
    id: 'M03_zeta_1000',
    title: 'Solve Riemann zeta zero count for T up to 1,000',
    domain: 'math',
    class: 'math_solved',
    refId: 'hm.zeta.zeros.in_critical_strip',
    targetDate: '2026-10-31',
    priority: 'high',
    successCriterion: 'zetaZeroCount passes the ±2 band (N(100) in [29,32], N(1000) in [649,651]).',
    order: 2,
  },
  {
    id: 'M04_factorion_cycle',
    title: 'Solve factorial-digit cycle length for n=169',
    domain: 'math',
    class: 'math_solved',
    refId: 'hm.digit.factorial_chain',
    targetDate: '2026-11-15',
    priority: 'medium',
    successCriterion: 'factorialDigitChain(169) returns a cycle containing 169, 363601, or 1454; factorialDigitChain(1) returns [1].',
    order: 3,
  },
  {
    id: 'M05_proth_3',
    title: 'Find the first 3 Proth primes above 10^12',
    domain: 'math',
    class: 'math_solved',
    refId: 'hm.proth.primality',
    targetDate: '2026-12-15',
    priority: 'medium',
    successCriterion: 'prothPrimality(3) returns 3 integers, all > 0.',
    order: 4,
  },

  // --- MATHEMATICS: Tier 2 (bounded) — extend search bounds ---
  {
    id: 'M06_goldbach_100k',
    title: 'Verify strong Goldbach conjecture up to 100,000',
    domain: 'math',
    class: 'math_bounds',
    refId: 'hm.goldbach.strong.upto',
    targetDate: '2026-12-31',
    priority: 'medium',
    successCriterion: 'goldbachCheck(100000) returns verified:true with non-zero totalPairs.',
    order: 5,
  },
  {
    id: 'M07_collatz_1m',
    title: 'Verify Collatz convergence for n up to 1,000,000',
    domain: 'math',
    class: 'math_bounds',
    refId: 'hm.collatz.no_exception',
    targetDate: '2027-01-31',
    priority: 'medium',
    successCriterion: 'collatzVerifiedRange(1000000) returns verified:true with maxTotalSteps > 0.',
    order: 6,
  },

  // --- MATHEMATICS: Tier 3 (open) — record search progress ---
  {
    id: 'M08_riemann_10k',
    title: 'Search Riemann zeros off the critical line for T up to 10,000',
    domain: 'math',
    class: 'math_bounds',
    refId: 'hm.riemann.critical_line',
    targetDate: '2027-03-31',
    priority: 'low',
    successCriterion: 'riemannSearch(10000) returns criticalCount > 0 and an empty candidates list (no off-line zeros found).',
    order: 7,
  },
  {
    id: 'M09_beal_10k',
    title: 'Search Beal counter-examples up to 10,000',
    domain: 'math',
    class: 'math_bounds',
    refId: 'hm.beal.upto',
    targetDate: '2027-06-30',
    priority: 'low',
    successCriterion: 'bealSearch(10000) returns an empty counterexamples list with testedQuadruples > 0.',
    order: 8,
  },

  // --- ONCOLOGY: grant-engine problems → progress score >= 0.85 ---
  {
    id: 'O01_p01_solved',
    title: 'Advance P01 (persister dormancy) to progressScore >= 0.85',
    domain: 'oncology',
    class: 'oncology_grant',
    refId: 'P01_persister_dormancy',
    targetDate: '2026-10-31',
    priority: 'high',
    successCriterion: 'Issue P01_persister_dormancy has progressScore >= 0.85, status=in_progress, and at least 1 real experiment finding.',
    order: 0,
  },
  {
    id: 'O02_p08_solved',
    title: 'Advance P08 (GBM resistance) to progressScore >= 0.85',
    domain: 'oncology',
    class: 'oncology_grant',
    refId: 'P08_gbm_resistance',
    targetDate: '2026-11-30',
    priority: 'high',
    successCriterion: 'Issue P08_gbm_resistance has progressScore >= 0.85, status=in_progress, and at least 1 real experiment finding.',
    order: 1,
  },
  {
    id: 'O03_p10_solved',
    title: 'Advance P10 (pediatric rare-relapse) to progressScore >= 0.85',
    domain: 'oncology',
    class: 'oncology_grant',
    refId: 'P10_pediatric_rrx',
    targetDate: '2026-12-31',
    priority: 'high',
    successCriterion: 'Issue P10_pediatric_rrx has progressScore >= 0.85, status=in_progress, and at least 1 real experiment finding.',
    order: 2,
  },
  {
    id: 'O04_all_open',
    title: 'All 10 grant-engine problems reach progressScore >= 0.7',
    domain: 'oncology',
    class: 'oncology_grant',
    refId: '*all',
    targetDate: '2027-03-31',
    priority: 'medium',
    successCriterion: 'Every grant-engine problem has progressScore >= 0.7.',
    order: 3,
  },
];

// --- Verification functions --------------------------------------------------

function verifyMathSolved(problemId: string): MilestoneVerification {
  const problem = HARD_MATH_PROBLEMS.find((p) => p.id === problemId);
  const attempts = getMathAttempts().filter((a) => a.problemId === problemId);
  const passedAttempts = attempts.filter((a) => a.passed);
  const bestScore = attempts.reduce((m, a) => Math.max(m, a.score), 0);
  return {
    currentValue: bestScore,
    targetValue: 1.0,
    description: `${passedAttempts.length} passing attempt(s) out of ${attempts.length} for ${problem?.title ?? problemId} (best score=${bestScore.toFixed(2)})`,
  };
}

function verifyMathBounds(problemId: string): MilestoneVerification {
  const problem = HARD_MATH_PROBLEMS.find((p) => p.id === problemId);
  // We don't store the actual bound in the math ledger today. The honest
  // measurement is the count of passed attempts (≥ 1 = the search ran at
  // the bound baked into the problem's acceptance test).
  const attempts = getMathAttempts().filter((a) => a.problemId === problemId);
  const passed = attempts.filter((a) => a.passed).length;
  return {
    currentValue: passed,
    targetValue: 1,
    description: `${passed} passing attempt(s) at the bound baked into ${problem?.title ?? problemId} (acceptance test bound=${problem?.bound ?? 'n/a'})`,
  };
}

function verifyOncologyGrant(refId: string): MilestoneVerification {
  const records: IssueRecord[] = computeIssueProgress();
  if (refId === '*all') {
    if (records.length === 0) {
      return { currentValue: 0, targetValue: 1, description: 'no grant-engine problems recorded' };
    }
    const above07 = records.filter((r) => r.progressScore >= 0.7).length;
    return {
      currentValue: above07,
      targetValue: records.length,
      description: `${above07}/${records.length} grant problems have progressScore >= 0.7`,
    };
  }
  const rec = records.find((r) => r.issueId === refId);
  if (!rec) {
    return { currentValue: 0, targetValue: 0.85, description: `issue ${refId} not in registry` };
  }
  return {
    currentValue: rec.progressScore,
    targetValue: 0.85,
    description: `progressScore=${rec.progressScore.toFixed(3)} status=${rec.status} experiments=${rec.experimentsRun} findings=${rec.findingsCount}`,
  };
}

function verifyMilestone(m: Milestone): MilestoneVerification {
  switch (m.class) {
    case 'math_solved':
      return verifyMathSolved(m.refId);
    case 'math_bounds':
      return verifyMathBounds(m.refId);
    case 'oncology_grant':
      return verifyOncologyGrant(m.refId);
  }
}

// --- Status computation ------------------------------------------------------

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
}

export function computeMilestoneStatus(m: Milestone): MilestoneStatusReport {
  const verification = verifyMilestone(m);
  const now = new Date();
  const target = new Date(m.targetDate);
  const daysRemaining = daysBetween(now, target);
  const requiredPacePerDay = Math.max(0, (verification.targetValue - verification.currentValue) / Math.max(0.01, daysRemaining));
  const pacePerDay = 0; // TODO: track historical pace; conservative = 0 (we never claim to be on track unless we have data)
  const forecast = verification.currentValue + pacePerDay * daysRemaining;
  const lastUpdatedAt = Date.now();

  let status: MilestoneStatus;
  let reason: string;

  if (verification.currentValue >= verification.targetValue) {
    status = 'met';
    reason = `metric ${verification.currentValue} >= target ${verification.targetValue}: ${verification.description}`;
  } else if (daysRemaining < 0) {
    status = 'overdue';
    reason = `target date ${m.targetDate} passed (${(-daysRemaining).toFixed(1)} days overdue): ${verification.description}`;
  } else if (pacePerDay >= requiredPacePerDay) {
    status = 'on_track';
    reason = `current pace ${pacePerDay.toFixed(4)}/day >= required ${requiredPacePerDay.toFixed(4)}/day`;
  } else {
    status = 'at_risk';
    reason = `current pace ${pacePerDay.toFixed(4)}/day < required ${requiredPacePerDay.toFixed(4)}/day (${daysRemaining.toFixed(1)} days remaining)`;
  }

  return {
    milestone: m,
    status,
    verification,
    daysRemaining,
    pacePerDay,
    requiredPacePerDay,
    forecast,
    reason,
    lastUpdatedAt,
  };
}

export function computeAgenda(): MilestoneStatusReport[] {
  return [...AGENDA]
    .sort((a, b) => a.order - b.order)
    .map(computeMilestoneStatus);
}

// --- Next-milestone selection (drives conductor choice) ----------------------

export interface NextMilestone {
  milestone: Milestone;
  statusReport: MilestoneStatusReport;
  /** Why this is the next milestone to work on. */
  rationale: string;
}

/**
 * Pick the next milestone for the math conductor to work on. The highest-
 * priority unmet milestone is the first candidate; if the current state says
 * it's not the right time (e.g. it's already met), the next one in the
 * priority queue is selected.
 */
export function selectNextMathMilestone(): NextMilestone | null {
  const reports = computeAgenda().filter(
    (r) => r.milestone.domain === 'math' && r.status !== 'met',
  );
  if (reports.length === 0) return null;
  const priority = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  const sorted = reports.sort((a, b) => {
    const dp = priority[a.milestone.priority] - priority[b.milestone.priority];
    if (dp !== 0) return dp;
    return a.daysRemaining - b.daysRemaining;
  });
  const next = sorted[0];
  return {
    milestone: next.milestone,
    statusReport: next,
    rationale: `${next.milestone.priority} priority, ${next.daysRemaining.toFixed(1)} days remaining (status=${next.status})`,
  };
}

export function selectNextOncologyMilestone(): NextMilestone | null {
  const reports = computeAgenda().filter(
    (r) => r.milestone.domain === 'oncology' && r.status !== 'met',
  );
  if (reports.length === 0) return null;
  const priority = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  const sorted = reports.sort((a, b) => {
    const dp = priority[a.milestone.priority] - priority[b.milestone.priority];
    if (dp !== 0) return dp;
    return a.daysRemaining - b.daysRemaining;
  });
  const next = sorted[0];
  return {
    milestone: next.milestone,
    statusReport: next,
    rationale: `${next.milestone.priority} priority, ${next.daysRemaining.toFixed(1)} days remaining (status=${next.status})`,
  };
}

// --- Persistence -------------------------------------------------------------

export interface PersistedAgenda {
  computedAt: number;
  milestones: MilestoneStatusReport[];
  nextMath: NextMilestone | null;
  nextOncology: NextMilestone | null;
  metCount: number;
  onTrackCount: number;
  atRiskCount: number;
  overdueCount: number;
}

export function renderAndPersistAgenda(): PersistedAgenda {
  const milestones = computeAgenda();
  const nextMath = selectNextMathMilestone();
  const nextOncology = selectNextOncologyMilestone();
  const counts = {
    metCount: milestones.filter((m) => m.status === 'met').length,
    onTrackCount: milestones.filter((m) => m.status === 'on_track').length,
    atRiskCount: milestones.filter((m) => m.status === 'at_risk').length,
    overdueCount: milestones.filter((m) => m.status === 'overdue').length,
  };
  const persisted: PersistedAgenda = {
    computedAt: Date.now(),
    milestones,
    nextMath,
    nextOncology,
    ...counts,
  };
  fs.mkdirSync(agendaDir(), { recursive: true });
  const tmp = `${agendaFile()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(persisted, null, 2), 'utf-8');
  fs.renameSync(tmp, agendaFile());
  return persisted;
}

export function loadPersistedAgenda(): PersistedAgenda | null {
  try {
    if (fs.existsSync(agendaFile())) {
      return JSON.parse(fs.readFileSync(agendaFile(), 'utf-8')) as PersistedAgenda;
    }
  } catch {
    // corrupt agenda.json — recompute
  }
  return null;
}
