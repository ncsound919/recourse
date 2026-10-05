/**
 * Self-repair bounds: the gate check, the attempt ceiling, version pruning, and
 * upgrade accounting.
 *
 * WHY THIS IS A SEPARATE MODULE
 * The bug these fix lived inside `executeSelfRepair` in `server.ts` — a 9000-line
 * file that cannot be imported by a test. The logic is extracted here so it can be
 * tested directly, and `server.ts` imports it. Logic that can only be verified by
 * running the whole server is logic that does not get verified.
 *
 * THE BUG (measured 2026-10-04)
 * `self-repair` judged a repair against the tool's STORED WEAK suite while
 * `promoted_quality_audit` judged the same tool with the ENHANCED gate. The two
 * disagreed and repair won every round: enhanced gate degrades -> repair passes
 * the weak suite -> "healed" -> new version promoted, currentVersion advances ->
 * enhanced gate fails again. Result: 32 tools with >=3 chained repairs, `powerMod`
 * at 78 repairs / 79 versions, 8,413 versions held in total, and `totalUpgrades`
 * inflated by the churn because it counted any `passed_verifier` version.
 */

/** A promoted version, narrowed to what these functions read. */
export interface RepairVersion {
  version: string;
  promoted: boolean;
  passed_verifier: boolean;
  isRepaired?: boolean;
  source_code?: string;
  test_suite_code?: string;
}

export interface RepairableTool {
  name: string;
  currentVersion?: string;
  versions: RepairVersion[];
  healthStatus?: string;
}

/** Result of judging a repair against the standard that flagged the tool. */
export interface RepairGateVerdict {
  gateOk: boolean;
  reasons: string[];
  score: number;
}

export interface RepairBoundsOptions {
  /** Per-tool ceiling on repair attempts. */
  maxAttempts?: number;
  /** Historical versions to retain (the live one is always kept). */
  keepVersions?: number;
}

export const DEFAULT_MAX_REPAIR_ATTEMPTS = 12;
export const DEFAULT_KEEP_VERSIONS = 5;

/**
 * How many repair attempts a tool has already had.
 *
 * Counted from the version chain itself rather than a side map, so the bound
 * survives a restart without needing its own persisted state. That matters: the
 * original loop had counters (`repairAttempts`) that were incremented and never
 * read, so they could not have bounded anything even if a restart had reset them.
 */
export function repairAttemptCount(tool: RepairableTool | undefined | null): number {
  if (!tool) return 0;
  return ((tool.currentVersion ?? '').match(/-repaired\./g) ?? []).length;
}

/**
 * Decide whether a repair counts as a heal.
 *
 * `suiteVerdict` is what the tool's own (possibly weak) suite said. `gateVerdict`
 * is what the ENHANCED gate said, or null when there is nothing to judge it with
 * (no suite, a biotech claim payload, a class-shaped tool).
 *
 * Three ways a heal is refused, each with a reason:
 *   1. the suite did not pass
 *   2. the enhanced gate REJECTED it — the loop-breaker
 *   3. the attempt ceiling is reached — the backstop
 *
 * A null `gateVerdict` does NOT block a heal. Inventing a gate verdict for a shape
 * the gate cannot judge would be the same class of lie this fixes.
 */
export function evaluateRepair(opts: {
  tool: RepairableTool | undefined | null;
  suitePassed: boolean;
  verificationDepth: 'suite' | 'claim' | 'smoke';
  gateVerdict?: RepairGateVerdict | null;
  bounds?: RepairBoundsOptions;
}): { healed: boolean; smokeOnly: boolean; blockReason?: string; attempts: number } {
  const { tool, suitePassed, verificationDepth, gateVerdict, bounds } = opts;
  const maxAttempts = bounds?.maxAttempts ?? DEFAULT_MAX_REPAIR_ATTEMPTS;
  const smokeOnly = verificationDepth === 'smoke' && suitePassed;

  if (!(suitePassed && verificationDepth !== 'smoke')) {
    return { healed: false, smokeOnly, attempts: repairAttemptCount(tool) };
  }
  if (gateVerdict && !gateVerdict.gateOk) {
    return {
      healed: false,
      smokeOnly: false,
      blockReason: `enhanced quality gate rejected the repair: ${gateVerdict.reasons.slice(0, 3).join('; ')}`,
      attempts: repairAttemptCount(tool),
    };
  }
  const attempts = repairAttemptCount(tool);
  if (attempts >= maxAttempts) {
    return {
      healed: false,
      smokeOnly: false,
      blockReason: `repair attempt ceiling reached (${attempts}/${maxAttempts}); tool quarantined from further autonomous repair`,
      attempts,
    };
  }
  return { healed: true, smokeOnly: false, attempts };
}

/**
 * Drop superseded historical versions, keeping the live one plus recent history.
 *
 * Promoted-but-superseded versions are retained as the rollback substrate; only
 * never-promoted failed attempts are dropped first. Returns how many were removed.
 */
export function pruneToolVersions(tool: RepairableTool, keepVersions = DEFAULT_KEEP_VERSIONS): number {
  const before = tool.versions.length;
  const keep = Math.max(2, keepVersions);
  if (before <= keep) return 0;

  const others = tool.versions.filter((v) => v.version !== tool.currentVersion);
  const promotedHistorical = others.filter((v) => v.promoted);
  const failed = others.filter((v) => !v.promoted);

  // Reserve slots for promoted history first (it is the rollback target), then
  // fill the remainder with the most recent failed attempts.
  const reserved = Math.max(0, keep - 1 - Math.min(promotedHistorical.length, 2));
  const keptFailed = failed.slice(-Math.max(0, reserved));
  const keptPromoted = promotedHistorical.slice(-2);

  const survivors = [...keptPromoted, ...keptFailed];
  if (tool.currentVersion) {
    const live = tool.versions.find((v) => v.version === tool.currentVersion);
    if (live) survivors.push(live);
  }
  if (survivors.length >= before) return 0;

  tool.versions = survivors;
  return before - survivors.length;
}

/**
 * Does this version count as a capability upgrade?
 *
 * NO for repaired versions. `totalUpgrades` means "capability improved"; a repair
 * is maintenance of something that already existed. Counting repair churn is how a
 * stuck repair loop read as steady progress on a dashboard.
 */
export function countsAsUpgrade(v: RepairVersion): boolean {
  return v.passed_verifier === true && v.isRepaired !== true;
}
