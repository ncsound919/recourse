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
 * A run ends in exactly one of three terminal states:
 *
 *   'artifact'  — it produced something verifiable: a patch, a verified claim, or
 *                 a recorded decision. The artifact's hash is RECOMPUTED here, so
 *                 a run cannot claim an artifact it did not actually produce.
 *   'skipped'   — it deliberately did not do the work (autopilot off, service
 *                 unconfigured, guard closed). Not a failure; also not success.
 *   'unproductive' — it ran, threw nothing, and produced nothing verifiable.
 *                 THIS IS A FAILURE. It is the state the whole system was blind
 *                 to: a job that spins every cycle and accomplishes nothing was
 *                 indistinguishable from one doing real work.
 *
 * HONESTY CONTRACT
 *  - A run NEVER self-certifies. `classifyRun` recomputes the artifact hash; a
 *    mismatch downgrades the run to 'unproductive' rather than trusting the
 *    claim. This is what finally puts `verifyArtifactHash` on a live path.
 *  - "Produced something" means a real artifact, not a log line. Returning
 *    `{artifacts: 3}` from a job is not an artifact unless the artifacts are
 *    passed and they hash correctly.
 *  - An empty/undefined result with no skip marker is 'unproductive', which is
 *    the honest reading of a run that reported nothing.
 *  - A job may declare itself legitimately idle via `skipped:` and that is
 *    respected. The point is that it must SAY so.
 */

import { verifyArtifactHash, type ResearchArtifact } from './researchArtifact.js';

export type RunOutcome = 'artifact' | 'skipped' | 'unproductive';

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
export function classifyRun(jobId: string, result: unknown): RunReport {
  const skipped = skipReason(result);
  if (skipped) {
    return { outcome: 'skipped', detail: `skipped: ${skipped}` };
  }

  const artifacts = extractArtifacts(result);
  if (artifacts.length === 0) {
    return {
      outcome: 'unproductive',
      detail: `${jobId} ran to completion and produced no verifiable artifact`,
    };
  }

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

/**
 * Roll a run report up into the aggregate counters the scheduler shows.
 * Unproductive runs are counted separately from failures, because they are the
 * signal that was previously invisible: the job did not error, it just did
 * nothing, repeatedly.
 */
export interface RunTally {
  artifact: number;
  skipped: number;
  unproductive: number;
  failed: number;
}

export function tallyOutcome(t: RunTally, outcome: RunOutcome): RunTally {
  return { ...t, [outcome]: t[outcome] + 1 };
}