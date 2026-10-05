/**
 * runOutcome.ts — a run must END in something, or it is recorded as a failure.
 *
 * WHY THIS EXISTS
 * Recourse's scheduler recorded only "did it throw". A job that returned
 * `{artifacts: 0, dispatched: 0}` and a job that produced a verified patch both
 * counted as `lastOk: true`. There was no way to distinguish a run that WORKED
 * from a run that merely completed, so the "runs are moving the needle" question
 * had no answer in the data.
 *
 * `researchArtifact.ts` already defines the artifact contract, and
 * `verifyArtifactHash()` — a real tamper check — was written and never called.
 * This module makes a run's terminal state explicit and re-checks the artifact
 * it claims to have produced.
 *
 * THE CONTRACT
 * A run ends in exactly one of four terminal states:
 *
 *   'artifact'  — it produced something verifiable: a patch, a verified claim, or
 *                 a recorded decision. The artifact's hash is RECOMPUTED here, so
 *                 a run cannot claim an artifact it did not actually produce.
 *   'skipped'   — it deliberately did not do the work (autopilot off, service
 *                 unconfigured, guard closed). Not a failure; also not success.
 *   'maintained'— the job's whole purpose is to keep a system in a good state,
 *                 and this pass found nothing to do. There was nothing to
 *                 produce, which is the CORRECT outcome for e.g. a telemetry
 *                 flush or a health poll. Reporting this as 'unproductive'
 *                 would make a healthy idle system look broken.
 *   'unproductive' — it ran, threw nothing, was not maintaining, and produced
 *                 nothing verifiable. THIS IS A FAILURE. It is the state the
 *                 whole system was blind to: a job that spins every cycle and
 *                 accomplishes nothing was indistinguishable from one doing real
 *                 work.
 *
 * WHY 'maintained' IS NOT A DISMISSAL
 * Maintenance is declared by the JOB, once, at registration — not per run — and
 * it is a property of what the job is for, not a way to avoid being measured.
 * A maintenance job's runs are counted and surfaced separately, and it is
 * excluded from the artifact-rate denominator precisely so it cannot inflate
 * that number. The distinction that matters: a maintenance job that suddenly
 * DOES have something to report should return an artifact and be classified
 * 'artifact', not fall back on its maintenance declaration.
 *
 * HONESTY CONTRACT
 *  - A run NEVER self-certifies. `classifyRun` recomputes the artifact hash; a
 *    mismatch downgrades the run to 'unproductive' rather than trusting the
 *    claim. This is what finally puts `verifyArtifactHash` on a live path.
 *  - "Produced something" means a real artifact, not a log line. Returning
 *    `{artifacts: 3}` from a job is not an artifact unless the artifacts are
 *    passed and they hash correctly.
 *  - An empty/undefined result with no skip marker is 'unproductive', unless the
 *    job is a declared maintenance job — which is the honest reading of a run
 *    that reported nothing from a job whose purpose is not to report.
 *  - A job may declare itself legitimately idle via `skipped:` and that is
 *    respected. The point is that it must SAY so.
 */

import { verifyArtifactHash, type ResearchArtifact } from './researchArtifact.js';

export type RunOutcome = 'artifact' | 'skipped' | 'maintained' | 'unproductive';

export interface RunReport {
  outcome: RunOutcome;
  /** Human-readable summary for the job ledger / operator. */
  detail: string;
  /** The artifact the run produced, when outcome === 'artifact'. */
  artifact?: ResearchArtifact;
  /** True when the claimed artifact failed hash re-verification. */
  tampered?: boolean;
}

/** Does this result object carry an explicit skip marker? */
export function skipReason(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const skipped = (result as { skipped?: unknown }).skipped;
  return typeof skipped === 'string' && skipped.length > 0 ? skipped : null;
}

/**
 * Pull artifacts out of a job result. Accepts the shapes jobs actually return:
 * a bare artifact, `{artifact}`, or `{artifacts: [...]}`.
 * Returns only entries that are artifact-shaped.
 */
function extractArtifacts(result: unknown): ResearchArtifact[] {
  if (!result || typeof result !== 'object') return [];
  const out: ResearchArtifact[] = [];
  const push = (v: unknown) => {
    if (v && typeof v === 'object' && typeof (v as ResearchArtifact).artifactHash === 'string') {
      out.push(v as ResearchArtifact);
    }
  };
  const r = result as { artifact?: unknown; artifacts?: unknown };
  push(r.artifact);
  if (Array.isArray(r.artifacts)) for (const a of r.artifacts) push(a);
  return out;
}

/**
 * Classify a job's result into a terminal run outcome.
 *
 * Re-verifies every claimed artifact's hash. A run whose artifact does not hash
 * to what it claims has produced nothing it can prove, and is recorded as
 * unproductive — the tamper check is enforced here rather than merely available.
 */
export function classifyRun(
  jobId: string,
  result: unknown,
  opts: { maintenance?: boolean; maintenanceNote?: string } = {},
): RunReport {
  const skipped = skipReason(result);
  if (skipped) {
    return { outcome: 'skipped', detail: `skipped: ${skipped}` };
  }

  // Artifacts are checked FIRST, and outrank the maintenance declaration. A
  // maintenance job that genuinely found something must be credited with it —
  // otherwise declaring a job 'maintenance' would become a way to hide work.
  const artifacts = extractArtifacts(result);
  if (artifacts.length > 0) {
    const bad = artifacts.filter((a) => !verifyArtifactHash(a));
    if (bad.length > 0) {
      return {
        outcome: 'unproductive',
        detail:
          `${jobId} claimed ${artifacts.length} artifact(s) but ${bad.length} failed hash re-verification ` +
          `(${bad.map((a) => a.id).join(', ')}) — the run did not produce what it claims`,
        artifact: artifacts[0],
        tampered: true,
      };
    }
    const first = artifacts[0];
    return {
      outcome: 'artifact',
      detail:
        artifacts.length === 1
          ? `${jobId} produced ${first.kind} artifact ${first.id} (hash verified, tier ${first.evidenceTier})`
          : `${jobId} produced ${artifacts.length} verified artifacts (first: ${first.id}, tier ${first.evidenceTier})`,
      artifact: first,
    };
  }

  // Nothing produced. For a job whose purpose is to maintain rather than to
  // produce, that is the correct outcome, not a failure.
  if (opts.maintenance) {
    return {
      outcome: 'maintained',
      detail: `${jobId} maintained (nothing to do this pass${opts.maintenanceNote ? `: ${opts.maintenanceNote}` : ''})`,
    };
  }

  return {
    outcome: 'unproductive',
    detail: `${jobId} ran to completion and produced no verifiable artifact`,
  };
}

/**
 * Roll a run report up into the aggregate counters the scheduler shows.
 * Unproductive runs are counted separately from failures, because they are the
 * signal that was previously invisible: the job did not error, it just did
 * nothing, repeatedly.
 */
export interface RunTally {
  artifact: number;
  skipped: number;
  maintained: number;
  unproductive: number;
  failed: number;
}

export function tallyOutcome(t: RunTally, outcome: RunOutcome): RunTally {
  return { ...t, [outcome]: t[outcome] + 1 };
}