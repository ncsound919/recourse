/**
 * Repair verification — a heal claim is not a verified success.
 *
 * `executeSelfRepair` decides "healed" from a single check at repair time. That
 * makes `repairSuccessRate` a self-report: a patch that passes once and regresses
 * later still counts as healed forever. This module opens a verification window
 * per heal and only counts a repair as a success once a LATER re-verify confirms
 * it; a heal that later fails becomes `regressed` and counts as a failure.
 *
 * Honesty contract:
 *  - A heal with no regression suite on file is `unverifiable`, never `verified`
 *    (a smoke check is not proof) and is excluded from the success rate.
 *  - The success rate is `verified / (verified + regressed)`; pending windows are
 *    reported separately and never inflate it. No resolved repairs => rate 0.
 *  - Pure and deterministic: no clock or randomness inside these functions.
 */

export type RepairVerificationStatus = 'pending' | 'verified' | 'regressed' | 'unverifiable';

export interface RepairVerification {
  id: string;
  tool: string;
  version: string;
  healedAt: number;
  /** True when a real regression suite was on file at heal time. */
  suitePresent: boolean;
  status: RepairVerificationStatus;
  resolvedAt?: number;
  detail?: string;
}

/** Open a verification window for a heal claim. */
export function openRepairVerification(input: {
  id: string;
  tool: string;
  version: string;
  healedAt: number;
  suitePresent: boolean;
}): RepairVerification {
  return {
    id: input.id,
    tool: input.tool,
    version: input.version,
    healedAt: input.healedAt,
    suitePresent: input.suitePresent,
    status: input.suitePresent ? 'pending' : 'unverifiable',
    ...(input.suitePresent ? {} : { detail: 'no regression suite on file — smoke-only, cannot be verified' }),
  };
}

/**
 * Resolve one pending window by id with the result of a later re-verify. Returns
 * the resolved entry, or null when it is missing / already resolved.
 */
export function resolveRepairVerification(
  entries: RepairVerification[],
  id: string,
  passed: boolean,
  now: number,
  detail?: string,
): RepairVerification | null {
  const entry = entries.find((e) => e.id === id);
  if (!entry || entry.status !== 'pending') return null;
  entry.status = passed ? 'verified' : 'regressed';
  entry.resolvedAt = now;
  if (detail) entry.detail = detail;
  return entry;
}

export interface RepairVerificationStats {
  pending: number;
  verified: number;
  regressed: number;
  unverifiable: number;
  /** verified / (verified + regressed); 0 when nothing is resolved yet. */
  successRate: number;
}

export function repairVerificationStats(entries: RepairVerification[]): RepairVerificationStats {
  let pending = 0;
  let verified = 0;
  let regressed = 0;
  let unverifiable = 0;
  for (const e of entries) {
    if (e.status === 'pending') pending++;
    else if (e.status === 'verified') verified++;
    else if (e.status === 'regressed') regressed++;
    else unverifiable++;
  }
  const resolved = verified + regressed;
  return {
    pending,
    verified,
    regressed,
    unverifiable,
    successRate: resolved > 0 ? Math.round((verified / resolved) * 100) / 100 : 0,
  };
}
