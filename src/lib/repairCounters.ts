// src/lib/repairCounters.ts
//
// Repair-attempt bookkeeping, kept pure and in one place so the numbers cannot
// drift from what the repair loop actually did.
//
// Honesty: `repairAttempts` counts EVERY attempt — verified, verifier-failed,
// or smoke-only — because "we healed N tools" only means something next to "we
// tried N times". `unverifiedRepairAttempts` is the subset that never earned a
// heal claim (the verifier rejected the patch, or it only passed a smoke check
// with no regression suite on file). Both live on `status`, which is persisted,
// so a restart does not silently reset the denominator and leave the implied
// success rate looking better than it was.

export type RepairOutcome = 'healed' | 'smoke-only' | 'failed';

export interface RepairAttemptCounters {
  /** Every repair attempt, whatever the outcome. */
  repairAttempts: number;
  /** Attempts that did not produce a verified heal. */
  unverifiedRepairAttempts: number;
}

/** Counters for a run that has not recorded an attempt yet. */
export function emptyRepairCounters(): RepairAttemptCounters {
  return { repairAttempts: 0, unverifiedRepairAttempts: 0 };
}

/** Non-negative integer, treating absent/garbage persisted values as 0 so a
 *  hand-edited or truncated state file cannot poison the totals. */
function toCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** The counters after one more attempt with the given outcome. Pure. */
export function nextRepairCounters(
  prev: Partial<RepairAttemptCounters> | null | undefined,
  outcome: RepairOutcome,
): RepairAttemptCounters {
  return {
    repairAttempts: toCount(prev?.repairAttempts) + 1,
    unverifiedRepairAttempts: toCount(prev?.unverifiedRepairAttempts) + (outcome === 'healed' ? 0 : 1),
  };
}

/**
 * Verified heals per attempt over the recorded lifetime, or null when there is
 * no denominator yet. Null (not 0) so callers cannot render a confident "0%
 * of repairs verified" before a single repair has been attempted.
 */
export function verifiedHealRatio(prev: Partial<RepairAttemptCounters> | null | undefined): number | null {
  const attempts = toCount(prev?.repairAttempts);
  if (attempts === 0) return null;
  const unverified = toCount(prev?.unverifiedRepairAttempts);
  const verified = Math.max(0, attempts - unverified);
  return Math.round((verified / attempts) * 100) / 100;
}
