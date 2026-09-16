/**
 * Deterministic replay — reconstruct a subsystem's state from its ledger and
 * check it against the live state. "Only believes what it can verify", applied
 * to Recourse's own history: a ledger that replays to the same hash is
 * self-attested; a mismatch is reported, never hidden.
 *
 * Replay is pure where it matters (the `replay*Records` / `recompute*`
 * functions take data, not the filesystem), so it is unit-testable.
 */
import crypto from 'crypto';
import { readLedger, hashInsightRecord, type LedgerInsight } from './trendLedger';
import { goalLedgerSnapshot, getGoalProgress, type MathAttempt, type BiotechClaim } from './goalLedger';

/** Stable JSON stringify (sorted object keys) so hashes are order-independent. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

export function deterministicHash(value: unknown): string {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

// ---------------------------------------------------------------------------
// Trend discovery ledger
// ---------------------------------------------------------------------------

export interface TrendReplayReport {
  stream: 'trend';
  records: number;
  chainValid: boolean;
  brokenAt?: number;
  replayHash: string;
  matches: boolean;
  details: string[];
}

const GENESIS = '0'.repeat(64);

/** Recompute the trend hash chain from raw records (pure, no filesystem). */
function verifyChain(records: LedgerInsight[]): { valid: boolean; brokenAt?: number } {
  let prev = GENESIS;
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    if (rec.prevInsightHash !== prev) return { valid: false, brokenAt: i };
    const { hash: _h, ...content } = rec;
    if (hashInsightRecord(content) !== rec.hash) return { valid: false, brokenAt: i };
    prev = rec.hash;
  }
  return { valid: true };
}

export function replayTrendRecords(records: LedgerInsight[]): TrendReplayReport {
  const chain = verifyChain(records);
  const replayHash = deterministicHash(records);
  const details: string[] = [];
  if (records.length === 0) details.push('ledger empty');
  if (!chain.valid) details.push(`hash chain broken at record ${chain.brokenAt}`);
  if (chain.valid && records.length > 0) details.push(`chain intact across ${records.length} records`);
  return {
    stream: 'trend',
    records: records.length,
    chainValid: chain.valid,
    brokenAt: chain.brokenAt,
    replayHash,
    matches: chain.valid,
    details,
  };
}

export function replayTrendLedger(): TrendReplayReport {
  return replayTrendRecords(readLedger());
}

// ---------------------------------------------------------------------------
// Goal ledger (math attempts + biotech claims)
// ---------------------------------------------------------------------------

export interface GoalProgressDerived {
  math: { solved: number; total: number; rate: number; byTier: Record<string, { solved: number; total: number }> };
  biotech: { passed: number; total: number; rate: number; byLeg: Record<string, { passed: number; total: number }> };
}

/** Recompute goal progress from raw attempt/claim records (no hidden state). */
export function recomputeGoalProgress(snapshot: {
  mathAttempts: MathAttempt[];
  biotechClaims: BiotechClaim[];
}): GoalProgressDerived {
  const byTier: Record<string, { solved: number; total: number }> = {};
  let mathSolved = 0;
  for (const a of snapshot.mathAttempts) {
    const tier = a.problemTier;
    if (!byTier[tier]) byTier[tier] = { solved: 0, total: 0 };
    byTier[tier].total += 1;
    if (a.passed) {
      byTier[tier].solved += 1;
      mathSolved += 1;
    }
  }
  const byLeg: Record<string, { passed: number; total: number }> = {};
  let biotechPassed = 0;
  for (const c of snapshot.biotechClaims) {
    const leg = c.leg;
    if (!byLeg[leg]) byLeg[leg] = { passed: 0, total: 0 };
    byLeg[leg].total += 1;
    if (c.passed) {
      byLeg[leg].passed += 1;
      biotechPassed += 1;
    }
  }
  const mathTotal = snapshot.mathAttempts.length;
  const biotechTotal = snapshot.biotechClaims.length;
  return {
    math: { solved: mathSolved, total: mathTotal, rate: mathTotal > 0 ? mathSolved / mathTotal : 0, byTier },
    biotech: { passed: biotechPassed, total: biotechTotal, rate: biotechTotal > 0 ? biotechPassed / biotechTotal : 0, byLeg },
  };
}

export interface GoalReplayReport {
  stream: 'goals';
  records: { math: number; biotech: number };
  derived: GoalProgressDerived;
  live: GoalProgressDerived;
  replayHash: string;
  liveHash: string;
  matches: boolean;
  details: string[];
}

/**
 * Replay the goal ledger from raw records and compare to the live counters.
 * `live` is the values reported by the running ledger; a mismatch means the
 * live counters drifted from what the records actually imply.
 */
export function replayGoalSnapshot(
  snapshot: { mathAttempts: MathAttempt[]; biotechClaims: BiotechClaim[] },
  live: GoalProgressDerived,
): GoalReplayReport {
  const derived = recomputeGoalProgress(snapshot);
  const replayHash = deterministicHash(derived);
  const liveHash = deterministicHash(live);
  const matches = replayHash === liveHash;
  const details = matches
    ? [`re-derived ${snapshot.mathAttempts.length} math + ${snapshot.biotechClaims.length} biotech records; live counters agree`]
    : ['live counters disagree with the records (drift or tampering)'];
  return {
    stream: 'goals',
    records: { math: snapshot.mathAttempts.length, biotech: snapshot.biotechClaims.length },
    derived,
    live,
    replayHash,
    liveHash,
    matches,
    details,
  };
}

export function replayGoalLedger(): GoalReplayReport {
  return replayGoalSnapshot(goalLedgerSnapshot(), getGoalProgress() as GoalProgressDerived);
}
