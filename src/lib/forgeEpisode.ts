/**
 * Forge episode outcome mapping.
 *
 * The episodic tier existed with a working writer (`recordEpisode`, whose own
 * comment says "callers append their own outcomes here") but nothing in the
 * server called it, so every stored episode came from the manual
 * `scripts/harness-lab.ts` run and the tier stopped growing on 2026-09-16.
 * That left `applyFailureBias` steering from four stale losses and
 * `memory_consolidation` reporting `created: 0` forever.
 *
 * Extracted from `server.ts` so the mapping is unit-testable. The part that
 * matters most is `offline`: a provider outage produced no evidence about the
 * domain, and scoring it as a loss would teach the failure-bias to avoid
 * domains that were merely unreachable.
 */

/** The forge ledger's terminal states. */
export type ForgeEpisodeStatus =
  | 'materialized'
  | 'exists'
  | 'offline'
  | 'failed'
  | 'materialize_failed';

export type EpisodeOutcome = 'win' | 'loss' | 'neutral';

/**
 * Map a forge ledger status onto an episode outcome.
 *
 * `offline` is deliberately NEUTRAL. No attempt was made, so there is nothing to
 * learn about the domain — recording a loss would poison the failure-bias with
 * infrastructure outages.
 */
export function forgeEpisodeOutcome(status: ForgeEpisodeStatus): EpisodeOutcome {
  if (status === 'materialized' || status === 'exists') return 'win';
  if (status === 'offline') return 'neutral';
  return 'loss';
}

/**
 * Pick a REAL score for the episode. An absent score is 0, never a passing mark:
 * inventing one would put a fabricated number into the durable tier.
 */
export function forgeEpisodeScore(input: {
  verifyScore?: number;
  qualityScore?: number;
}): number {
  if (typeof input.verifyScore === 'number') return input.verifyScore;
  if (typeof input.qualityScore === 'number') return input.qualityScore;
  return 0;
}

/** One-line, human-readable episode summary. */
export function forgeEpisodeSummary(input: {
  name: string;
  status: ForgeEpisodeStatus;
  attemptsUsed: number;
  maxTries: number;
  reason?: string;
}): string {
  const reason = input.reason ? `, reason=${input.reason}` : '';
  return `forge ${input.status}: ${input.name} (attempts ${input.attemptsUsed}/${input.maxTries}${reason})`;
}
