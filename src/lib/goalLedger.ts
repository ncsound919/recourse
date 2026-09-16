/**
 * Goal Ledger — durable record of math attempts and biotech claim verifications.
 *
 * Two long-running goals feed the system:
 *   1. **Math** — attempt hard problems (Collatz, prime gaps, Riemann, Beal).
 *      Each attempt records {problemId, passed, score, suite, sourceCode, lat}.
 *   2. **Oncology** — verify drug-target claims against the canonical KG.
 *      Each claim records {assetName, passed, score, evidenceTier, leg, source}.
 *
 * The ledger is in-memory + persisted to disk as JSONL. Every entry is a real
 * outcome — never a stub. The recurrence semantics:
 *   - math attempts: append on each call
 *   - biotech claims: append on each verify
 *   - both feed the learner's reward signal so the calibration error is
 *     driven by real goal progress, not synthetic self-consistency.
 */

import fs from 'node:fs';
import path from 'node:path';

export interface MathAttempt {
  id: string;
  problemId: string;
  problemTier: 'solvable' | 'bounded' | 'open';
  toolName: string;
  passed: boolean;
  score: number;
  failureReason?: string;
  timestamp: number;
  generation: number;
  sourceCode?: string;
  acceptanceTest?: string;
  latMs: number;
}

export interface BiotechClaim {
  id: string;
  assetName: string;
  leg: string;
  evidenceTier: number;
  passed: boolean;
  score: number;
  source?: string;
  mechanism?: string;
  summary: string;
  matchedEntity?: {
    id: string;
    targetProtein: string;
    drugClass: string;
    clinicalIndication: string;
  };
  timestamp: number;
  generation: number;
}

interface LedgerState {
  mathAttempts: MathAttempt[];
  biotechClaims: BiotechClaim[];
  mathSolved: number;
  mathTotal: number;
  biotechPassed: number;
  biotechTotal: number;
  lastUpdatedAt: number;
}

let state: LedgerState = {
  mathAttempts: [],
  biotechClaims: [],
  mathSolved: 0,
  mathTotal: 0,
  biotechPassed: 0,
  biotechTotal: 0,
  lastUpdatedAt: 0,
};

const MAX_HISTORY = 500;

// Deterministic, sequence-based ids. Seeded from the largest existing numeric
// suffix (so restarts never reuse an id) and persisted implicitly via the ids
// themselves — no wall-clock or Math.random in the id, so a replay is stable.
let mathSeq = 0;
let biotechSeq = 0;

function maxSeq(ids: Array<{ id: string }>, prefix: string): number {
  let max = 0;
  for (const e of ids) {
    const m = new RegExp(`^${prefix}_(\\d+)$`).exec(e.id || '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

function ledgerFilePath(): string {
  return path.resolve(process.cwd(), 'recourse_goals.json');
}

export function initGoalLedger(): void {
  try {
    const fp = ledgerFilePath();
    if (fs.existsSync(fp)) {
      const raw = fs.readFileSync(fp, 'utf8');
      const parsed = JSON.parse(raw);
      state = {
        mathAttempts: Array.isArray(parsed.mathAttempts) ? parsed.mathAttempts.slice(-MAX_HISTORY) : [],
        biotechClaims: Array.isArray(parsed.biotechClaims) ? parsed.biotechClaims.slice(-MAX_HISTORY) : [],
        mathSolved: Number(parsed.mathSolved) || 0,
        mathTotal: Number(parsed.mathTotal) || 0,
        biotechPassed: Number(parsed.biotechPassed) || 0,
        biotechTotal: Number(parsed.biotechTotal) || 0,
        lastUpdatedAt: Number(parsed.lastUpdatedAt) || 0,
      };
    }
    mathSeq = Math.max(mathSeq, maxSeq(state.mathAttempts, 'math'));
    biotechSeq = Math.max(biotechSeq, maxSeq(state.biotechClaims, 'biotech'));
  } catch (err) {
    console.warn('[goalLedger] init failed, starting empty:', (err as Error).message);
  }
}

export function saveGoalLedger(): void {
  try {
    fs.writeFileSync(ledgerFilePath(), JSON.stringify(state, null, 2));
  } catch (err) {
    console.warn('[goalLedger] save failed:', (err as Error).message);
  }
}

export function recordMathAttempt(attempt: Omit<MathAttempt, 'id' | 'timestamp'>): MathAttempt {
  mathSeq += 1;
  const entry: MathAttempt = {
    id: `math_${mathSeq}`,
    timestamp: Date.now(),
    ...attempt,
  };
  state.mathAttempts.push(entry);
  state.mathTotal += 1;
  if (entry.passed) state.mathSolved += 1;
  state.lastUpdatedAt = entry.timestamp;
  if (state.mathAttempts.length > MAX_HISTORY) {
    state.mathAttempts = state.mathAttempts.slice(-MAX_HISTORY);
  }
  return entry;
}

export function recordBiotechClaim(claim: Omit<BiotechClaim, 'id' | 'timestamp'>): BiotechClaim {
  biotechSeq += 1;
  const entry: BiotechClaim = {
    id: `biotech_${biotechSeq}`,
    timestamp: Date.now(),
    ...claim,
  };
  state.biotechClaims.push(entry);
  state.biotechTotal += 1;
  if (entry.passed) state.biotechPassed += 1;
  state.lastUpdatedAt = entry.timestamp;
  if (state.biotechClaims.length > MAX_HISTORY) {
    state.biotechClaims = state.biotechClaims.slice(-MAX_HISTORY);
  }
  return entry;
}

export function getMathAttempts(limit = 50): MathAttempt[] {
  return state.mathAttempts.slice(-limit);
}

export function getBiotechClaims(limit = 50): BiotechClaim[] {
  return state.biotechClaims.slice(-limit);
}

export function getGoalProgress(): {
  math: { solved: number; total: number; rate: number; byTier: Record<string, { solved: number; total: number }> };
  biotech: { passed: number; total: number; rate: number; byLeg: Record<string, { passed: number; total: number }> };
  lastUpdatedAt: number;
} {
  const byTier: Record<string, { solved: number; total: number }> = {};
  for (const a of state.mathAttempts) {
    const tier = a.problemTier;
    if (!byTier[tier]) byTier[tier] = { solved: 0, total: 0 };
    byTier[tier].total += 1;
    if (a.passed) byTier[tier].solved += 1;
  }
  const byLeg: Record<string, { passed: number; total: number }> = {};
  for (const c of state.biotechClaims) {
    const leg = c.leg;
    if (!byLeg[leg]) byLeg[leg] = { passed: 0, total: 0 };
    byLeg[leg].total += 1;
    if (c.passed) byLeg[leg].passed += 1;
  }
  return {
    math: {
      solved: state.mathSolved,
      total: state.mathTotal,
      rate: state.mathTotal > 0 ? state.mathSolved / state.mathTotal : 0,
      byTier,
    },
    biotech: {
      passed: state.biotechPassed,
      total: state.biotechTotal,
      rate: state.biotechTotal > 0 ? state.biotechPassed / state.biotechTotal : 0,
      byLeg,
    },
    lastUpdatedAt: state.lastUpdatedAt,
  };
}

export function clearGoalLedger(): void {
  state = {
    mathAttempts: [],
    biotechClaims: [],
    mathSolved: 0,
    mathTotal: 0,
    biotechPassed: 0,
    biotechTotal: 0,
    lastUpdatedAt: Date.now(),
  };
  mathSeq = 0;
  biotechSeq = 0;
  saveGoalLedger();
}

/** Raw ledger snapshot for deterministic replay verification. */
export function goalLedgerSnapshot(): { mathAttempts: MathAttempt[]; biotechClaims: BiotechClaim[] } {
  return { mathAttempts: [...state.mathAttempts], biotechClaims: [...state.biotechClaims] };
}
