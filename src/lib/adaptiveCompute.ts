/**
 * adaptiveCompute.ts — compute-optimal allocation for the self-improvement
 * loops (Phase P0.1 / P0.2).
 *
 * Research basis:
 *  - Snell et al. 2024, "Scaling LLM Test-Time Compute Optimally can be More
 *    Effective than Scaling Model Parameters" (arXiv:2408.03314): allocating
 *    test-time compute *adaptively per prompt* beats a fixed best-of-N budget by
 *    >4x. Easy prompts should get the minimum; only genuinely hard/uncertain
 *    ones earn extra samples.
 *  - Acikgoz et al. 2025, "Self-Improving LLM Agents at Test-Time"
 *    (arXiv:2510.07841): spend on the cases the model is *uncertain* about and
 *    that are *novel*; redundant/easy cases are waste (they report +5.48% at 68x
 *    fewer samples).
 *
 * This module is the pure, deterministic policy that both observations imply:
 * given a capability's real learner belief (attempts, meanReward, uncertainty)
 * and its structural difficulty, decide how many independent samples to buy and
 * whether it is worth spending a model call at all. No clock, no RNG, no model.
 * Nothing here invents a signal — a missing input is simply not weighted.
 */

const clamp01 = (n: number): number => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

export interface BudgetInput {
  /** Prior verified attempts against this capability. */
  attempts?: number;
  /** Learner EMA reward in [0,1]; lower = harder so far. */
  meanReward?: number;
  /** Learner failure-rate posterior in [0,1]; higher = less certain. */
  uncertainty?: number;
  /** Contract/prompt size in chars — a cheap, honest difficulty proxy. */
  promptChars?: number;
  /** Optional explicit structural difficulty in [0,1] (e.g. from hints). */
  difficulty?: number;
}

/**
 * Difficulty index in [0,1], the mean of the signals that are actually present.
 * With no signals it returns 0.5 (neutral) rather than guessing. `uncertainty`
 * and `1 - meanReward` dominate because they are learned from real outcomes;
 * prompt size is a weak structural proxy capped at 4000 chars.
 */
export function difficultyIndex(input: BudgetInput): number {
  const parts: number[] = [];
  if (typeof input.uncertainty === 'number' && Number.isFinite(input.uncertainty)) {
    parts.push(clamp01(input.uncertainty));
  }
  if (typeof input.meanReward === 'number' && Number.isFinite(input.meanReward)) {
    parts.push(clamp01(1 - input.meanReward));
  }
  if (typeof input.difficulty === 'number' && Number.isFinite(input.difficulty)) {
    parts.push(clamp01(input.difficulty));
  }
  if (typeof input.promptChars === 'number' && Number.isFinite(input.promptChars)) {
    parts.push(clamp01(input.promptChars / 4000));
  }
  if (parts.length === 0) return 0.5;
  return round3(parts.reduce((a, b) => a + b, 0) / parts.length);
}

export interface BudgetOptions {
  /** Samples at difficulty 0. Default 1. */
  min?: number;
  /** Samples at difficulty 1. Default 3. */
  max?: number;
}

/**
 * Compute-optimal sample budget: linearly interpolate [min,max] by difficulty.
 * Easy/well-understood capabilities get `min` (usually 1); only the hardest get
 * `max`. Integer result, clamped so a malformed option can never request <1.
 */
export function adaptiveBudget(difficulty: number, opts: BudgetOptions = {}): number {
  const min = Math.max(1, Math.floor(opts.min ?? 1));
  const max = Math.max(min, Math.floor(opts.max ?? 3));
  const d = clamp01(difficulty);
  return Math.max(min, Math.min(max, Math.round(min + d * (max - min))));
}

/** Convenience: budget straight from a belief/difficulty input. */
export function budgetForInput(input: BudgetInput, opts: BudgetOptions = {}): number {
  return adaptiveBudget(difficultyIndex(input), opts);
}

export interface SpendInput {
  /** Novelty against the known pool in [0,1] (1 = brand new). */
  novelty: number;
  /** Learner uncertainty in [0,1]. */
  uncertainty: number;
  /** Structural difficulty in [0,1]. */
  difficulty?: number;
}

/**
 * Should this candidate earn a model call at all? Spend when it is either novel
 * or uncertain; never spend on a redundant, well-understood candidate. `floor`
 * is the combined-score threshold (default 0.3). A hard candidate (difficulty
 * >= 0.8) always earns a call — the difficulty signal is independent evidence.
 */
export function shouldSpend(input: SpendInput, floor = 0.3): boolean {
  if (typeof input.difficulty === 'number' && clamp01(input.difficulty) >= 0.8) return true;
  const score = 0.5 * clamp01(input.novelty) + 0.5 * clamp01(input.uncertainty);
  return score >= floor;
}

export interface SpendReport {
  spend: boolean;
  novelty: number;
  uncertainty: number;
  score: number;
  reason: string;
}

/** Explainable spend decision for logs/provenance (pure). */
export function spendDecision(input: SpendInput, floor = 0.3): SpendReport {
  const novelty = clamp01(input.novelty);
  const uncertainty = clamp01(input.uncertainty);
  const score = round3(0.5 * novelty + 0.5 * uncertainty);
  const difficulty = typeof input.difficulty === 'number' ? clamp01(input.difficulty) : undefined;
  const spend = shouldSpend(input, floor);
  const reason = spend
    ? difficulty !== undefined && difficulty >= 0.8
      ? `hard capability (difficulty ${difficulty.toFixed(2)})`
      : `novel+uncertain above floor (${score} >= ${floor})`
    : `redundant and well-understood (${score} < ${floor})`;
  return { spend, novelty, uncertainty, score, reason };
}
