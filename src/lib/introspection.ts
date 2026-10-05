/**
 * introspection.ts — telemetry about whether Recourse is actually working.
 *
 * WHY THIS EXISTS
 * Recourse had 5 Prometheus series, all of them model calls and HTTP requests.
 * Nothing measured the questions that actually decide whether the system is
 * healthy:
 *
 *   1. Is the VALUE SIGNAL real? The reward gate multiplies a tool's score by
 *      usefulness = consumed/invoked. If nothing consumes anything, every tool
 *      sits at the floor and the gate is inert — which is exactly what was
 *      happening. `signalQuality` makes that visible as one number.
 *   2. Do runs END in artifacts? `runOutcome` classifies every job run, but the
 *      verdicts were never aggregated, so "are the runs moving the needle" had
 *      no answer in the data.
 *   3. What does verification COST? A 60-105s Semgrep scan running every 5
 *      minutes is ~20% of a core, forever, to produce the same 4 findings. Cost
 *      that is not measured is cost nobody reduces.
 *
 * WHAT THIS IS NOT
 * Not a self-report. Every number here is derived from a real observation made
 * by another component (the value ledger, the scheduler's own classification,
 * the analyzer's own exit status). Nothing is estimated, and nothing is filled
 * in with a plausible default — a dimension with no data reports `null` and
 * says why, because a confident zero is worse than an absent reading.
 */

import { toolValueLedger } from './toolValueLedger.js';
import type { ScheduledJobState } from './jobScheduler.js';

export interface ValueSignalHealth {
  /** Tools with at least one real invocation. */
  toolsInvoked: number;
  /** Tools whose output someone consumed. */
  toolsConsumed: number;
  /** Real invocations total. */
  invocations: number;
  consumptions: number;
  /** consumptions/invocations in [0,1]; null when nothing has been invoked. */
  consumptionRate: number | null;
  /**
   * THE number that matters. Share of invoked tools that produced consumed
   * output. 0 means the reward gate is multiplying everything by 0.1 and is
   * therefore not discriminating between tools at all.
   */
  toolUsefulnessRate: number | null;
  /** How many tools are referenced but have never been invoked. */
  neverInvoked: number;
}

export function valueSignalHealth(): ValueSignalHealth {
  const ledger = toolValueLedger();
  const all = ledger.all();
  const totals = ledger.totals();
  const invoked = all.filter((s) => s.invoked > 0);
  const consumed = invoked.filter((s) => s.consumed > 0);
  return {
    toolsInvoked: invoked.length,
    toolsConsumed: consumed.length,
    invocations: totals.invoked,
    consumptions: totals.consumed,
    consumptionRate: totals.invokedReal > 0
      ? Math.round((totals.consumed / totals.invokedReal) * 1000) / 1000
      : null,
    toolUsefulnessRate: invoked.length > 0
      ? Math.round((consumed.length / invoked.length) * 1000) / 1000
      : null,
    neverInvoked: all.filter((s) => s.invoked === 0).length,
  };
}

export interface RunOutcomeHealth {
  jobs: number;
  /** Runs that ended in a hash-verified artifact. */
  artifact: number;
  /** Runs that deliberately did nothing. */
  skipped: number;
  /**
   * Runs of jobs declared `maintenance` that found nothing to do. Excluded from
   * the denominator below: a health poll correctly produces no artifact, so
   * counting it would drag the rate toward zero for no reason.
   */
  maintained: number;
  /** Runs that completed and produced nothing verifiable — counted as failures. */
  unproductive: number;
  /** Runs that threw, or claimed an artifact that failed hash re-verification. */
  failed: number;
  /**
   * Share of PRODUCTIVE runs that ended in an artifact: artifact / (artifact +
   * unproductive + failed). Maintenance and skip runs are excluded from both
   * numerator and denominator.
   *
   * This is the system's honest answer to "are the runs moving the needle" —
   * now measured rather than inferred. Null when nothing has run yet.
   */
  artifactRate: number | null;
  /** Jobs that ran at least once and never once produced an artifact. */
  jobsNeverUseful: string[];
  /** Maintenance jobs, listed so the exclusion above is auditable. */
  jobsDeclaredMaintenance: string[];
}

/**
 * Aggregate the per-job outcome counters the scheduler already maintains.
 * Read-only: it inspects state, it does not run anything.
 */
export function runOutcomeHealth(jobs: ScheduledJobState[]): RunOutcomeHealth {
  const agg = jobs.reduce(
    (acc, j) => {
      acc.artifact += countOutcome(j, 'artifact');
      acc.skipped += j.skipCount ?? 0;
      acc.maintained += j.maintainedCount ?? 0;
      acc.unproductive += j.unproductiveCount ?? 0;
      // failCount covers throws; a tampered artifact also lands there.
      acc.failed += j.failCount ?? 0;
      if (j.maintenance === true) acc.maintenanceJobs.push(j.id);
      const ran = j.runCount ?? 0;
      if (ran > 0 && countOutcome(j, 'artifact') === 0) acc.neverUseful.push(j.id);
      return acc;
    },
    {
      artifact: 0, skipped: 0, maintained: 0, unproductive: 0, failed: 0,
      neverUseful: [] as string[], maintenanceJobs: [] as string[],
    },
  );
  // Denominator is PRODUCTIVE runs only. Maintenance/skip are neither wins nor
  // losses and must not dilute the rate.
  const productiveRuns = agg.artifact + agg.unproductive + agg.failed;
  return {
    jobs: jobs.length,
    artifact: agg.artifact,
    skipped: agg.skipped,
    maintained: agg.maintained,
    unproductive: agg.unproductive,
    failed: agg.failed,
    artifactRate: productiveRuns > 0 ? Math.round((agg.artifact / productiveRuns) * 1000) / 1000 : null,
    jobsNeverUseful: agg.neverUseful,
    jobsDeclaredMaintenance: agg.maintenanceJobs,
  };
}

/** Runs of a job whose last recorded outcome was `kind`. */
function countOutcome(job: ScheduledJobState, kind: 'artifact' | 'skipped' | 'unproductive'): number {
  // Only the last outcome is retained per job, so this is a lower bound, not a
  // total. Reported as such rather than inflated into a false precision.
  return job.lastOutcome === kind ? 1 : 0;
}

export interface AuditCost {
  /** True when a scan has run at least once this process. */
  observed: boolean;
  lastDurationMs: number | null;
  lastFilesScanned: number | null;
  lastRules: number | null;
  lastOccurrences: number | null;
  lastErrorCount: number | null;
  /** Age of the cached scan, or null if never scanned. */
  cacheAgeMs: number | null;
  /**
   * True when the analyzer is spending more wall-clock than its refresh
   * interval allows, i.e. each scan is likely running long enough to overlap
   * the next one. The single most expensive misconfiguration available here.
   */
  overBudget: boolean;
  /** TTL the cache is configured against, for comparing against durationMs. */
  ttlMs: number;
}

export function auditCost(
  audit: {
    available: boolean;
    durationMs: number;
    filesScanned?: number;
    findings: ReadonlyArray<{ count?: number }>;
    errors: ReadonlyArray<unknown>;
  } | null,
  cachedAt: number | null,
  now = Date.now(),
): AuditCost {
  const ttl = Number(process.env.RECOURSE_STATIC_AUDIT_TTL_MS) || 30 * 60 * 1000;
  if (!audit || !audit.available) {
    return {
      observed: false,
      lastDurationMs: null,
      lastFilesScanned: null,
      lastRules: null,
      lastOccurrences: null,
      lastErrorCount: null,
      cacheAgeMs: null,
      overBudget: false,
      ttlMs: ttl,
    };
  }
  return {
    observed: true,
    lastDurationMs: audit.durationMs,
    lastFilesScanned: audit.filesScanned ?? null,
    lastRules: audit.findings.length,
    lastOccurrences: audit.findings.reduce(
      (n, f) => n + (typeof f.count === 'number' ? f.count : 0),
      0,
    ),
    lastErrorCount: audit.errors.length,
    cacheAgeMs: cachedAt ? now - cachedAt : null,
    // A scan longer than its own cache TTL guarantees the cache can never hold,
    // because the next request arrives while this one is still running.
    overBudget: audit.durationMs >= ttl,
    ttlMs: ttl,
  };
}

export interface IntrospectionReport {
  generatedAt: number;
  valueSignal: ValueSignalHealth;
  runs: RunOutcomeHealth;
  audit: AuditCost;
  /**
   * Flat, ordered findings an operator can act on. Each names the observation
   * and the consequence, so this is a diagnosis rather than a score.
   */
  concerns: Array<{ severity: 'info' | 'warn' | 'critical'; code: string; detail: string }>;
}

/**
 * Assemble the full report and derive the concerns.
 *
 * The concern list is the point. A dashboard of numbers nobody acts on is the
 * same failure mode as a log nobody reads, and this system has a lot of both.
 */
export function introspectionReport(input: {
  jobs: ScheduledJobState[];
  audit: Parameters<typeof auditCost>[0];
  auditCachedAt: number | null;
  now?: number;
}): IntrospectionReport {
  const now = input.now ?? Date.now();
  const valueSignal = valueSignalHealth();
  const runs = runOutcomeHealth(input.jobs);
  const audit = auditCost(input.audit, input.auditCachedAt, now);
  const concerns: IntrospectionReport['concerns'] = [];

  if (valueSignal.invocations > 0 && (valueSignal.consumptionRate ?? 0) === 0) {
    concerns.push({
      severity: 'critical',
      code: 'value_gate_inert',
      detail:
        `${valueSignal.invocations} real invocations but ZERO consumptions. ` +
        `The reward gate multiplies every tool's score by usefulness, so with no consumption ` +
        `it scales every tool by the same factor and cannot rank them. Wire noteConsumption ` +
        `at the real use sites, or the learner has no usefulness gradient.`,
    });
  }

  if (valueSignal.toolUsefulnessRate !== null && valueSignal.toolUsefulnessRate < 0.2) {
    concerns.push({
      severity: 'warn',
      code: 'low_tool_usefulness',
      detail:
        `only ${Math.round((valueSignal.toolUsefulnessRate ?? 0) * 100)}% of invoked tools produced ` +
        `consumed output. Most referenced tools are being called and their results thrown away.`,
    });
  }

  const productiveRuns = runs.artifact + runs.unproductive + runs.failed;
  if (runs.artifactRate !== null && runs.artifactRate < 0.25 && productiveRuns >= 5) {
    // Only jobs NOT declared maintenance are named: a maintenance job finding
    // nothing is correct behaviour, so listing it here would be a false alarm.
    const offenders = runs.jobsNeverUseful.filter((id) => !runs.jobsDeclaredMaintenance.includes(id));
    concerns.push({
      severity: 'warn',
      code: 'runs_not_producing_artifacts',
      detail:
        `only ${Math.round((runs.artifactRate ?? 0) * 100)}% of productive runs ended in a verifiable artifact ` +
        `(${runs.artifact} of ${productiveRuns}; ${runs.maintained} maintenance and ${runs.skipped} skipped run(s) excluded). ` +
        `Productive jobs that have never produced an artifact: ${offenders.join(', ') || 'none'}. ` +
        `These jobs run but return no verifiable output — wire their results into the run so the outcome can be graded.`,
    });
  }

  // The specific failure mode of the previous definition: a maintenance job
  // that would otherwise be unproductive has declared itself maintenance. That
  // is legitimate for a health poll and NOT legitimate for real work.
  const suspicious = runs.jobsNeverUseful.filter((id) => runs.jobsDeclaredMaintenance.includes(id));
  if (suspicious.length > 0) {
    concerns.push({
      severity: 'info',
      code: 'maintenance_jobs_idle',
      detail:
        `${suspicious.length} job(s) declared maintenance have run without producing anything: ` +
        `${suspicious.join(', ')}. Expected for a health poll, but worth confirming each is genuinely ` +
        `a keep-the-system-alive loop rather than work relabelled to avoid being measured.`,
    });
  }

  if (audit.overBudget) {
    concerns.push({
      severity: 'critical',
      code: 'audit_over_budget',
      detail:
        `the last static scan took ${Math.round((audit.lastDurationMs ?? 0) / 1000)}s, which is at or over ` +
        `its own cache TTL, so the cache can never engage and every pass re-scans. ` +
        `Raise RECOURSE_STATIC_AUDIT_TTL_MS above the scan duration, or narrow the scanned targets.`,
    });
  }

  if (audit.observed && (audit.lastErrorCount ?? 0) > 0) {
    concerns.push({
      severity: 'info',
      code: 'audit_partial_parse',
      detail:
        `${audit.lastErrorCount} file(s) failed to parse and were NOT analyzed. ` +
        `That is a coverage gap, not a clean result — the missing files are unchecked, not clean.`,
    });
  }

  if (valueSignal.invocations === 0) {
    concerns.push({
      severity: 'info',
      code: 'no_invocations_yet',
      detail: 'no tool has been invoked since boot, so usefulness cannot be measured yet.',
    });
  }

  return { generatedAt: now, valueSignal, runs, audit, concerns };
}