/**
 * ReporterMonteCarlo — seeded uncertainty for the SelfReporter.
 *
 * The reporter's core is deterministic: the same state yields the same article.
 * Monte Carlo would normally break that, so every draw here comes from a PRNG
 * seeded by the article's fact-seed (see reporterVoice.mulberry32). The same
 * state therefore produces the same distribution every time — reproducible
 * uncertainty, not randomness.
 *
 * Two uses:
 *   1. **Codex confidence** — perturb the normalized codex inputs and measure
 *      how stable the GO/NO-GO verdict is, where each dimension lands, and which
 *      single lever would most raise the odds of passing.
 *   2. **Protocol stability** — perturb the observed counts and measure how
 *      robust the selected comic arc is; a fragile arc next to its condition is
 *      reported honestly rather than hidden.
 *
 * The inputs are modeled as readings with measurement noise, not as forecasts of
 * the future. The output says how much the verdict depends on the exact numbers,
 * never what will happen.
 */

import {
  CODEX_THRESHOLDS,
  computeCodex,
  dominantCondition,
  type CodexBag,
  type CodexScores,
  type MetaphorInput,
  type ReporterCondition,
} from './reporterMetaphor.js';
import { hash32, mulberry32 } from './reporterVoice.js';

export const DEFAULT_MC_TRIALS = Math.max(64, Number(process.env.REPORTER_MC_TRIALS) || 512);

export interface McQuantiles {
  mean: number;
  p10: number;
  p50: number;
  p90: number;
  /** Share of trials where this dimension clears its codex gate. */
  passProbability: number;
}

export interface CodexMonteCarlo {
  trials: number;
  /** Share of trials where every gate passes (a GO verdict). */
  goProbability: number;
  /** Share of trials whose verdict matches the deterministic base verdict. */
  agreement: number;
  baseVerdict: 'GO' | 'NO-GO';
  metrics: Record<keyof CodexScores, McQuantiles>;
  /** The dimension that most often fails its gate. */
  binding: keyof CodexScores;
  /** Raising each lever by +0.10: the change in GO probability. */
  leverImpact: Array<{ driver: string; goDelta: number }>;
}

export interface ProtocolMonteCarlo {
  trials: number;
  baseCondition: ReporterCondition;
  /** Share of trials that keep the base condition. */
  stability: number;
  probabilities: Array<{ condition: ReporterCondition; p: number }>;
}

function triangular(rng: () => number): number {
  return rng() + rng() - 1; // mean 0, range [-1, 1]
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[idx];
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;
const round4 = (n: number): number => Math.round(n * 10000) / 10000;

const METRIC_KEYS: Array<keyof CodexScores> = ['trueness', 'flow', 'coherence', 'risk', 'capacity'];

function verdictOf(scores: CodexScores): 'GO' | 'NO-GO' {
  return METRIC_KEYS.every((k) => scores[k] >= CODEX_THRESHOLDS[k]) ? 'GO' : 'NO-GO';
}

/**
 * Monte Carlo over the codex inputs. `sigma` is the measurement noise on each
 * normalized 0..1 input (default 10%). Deterministic given `seed`.
 */
export function monteCarloCodex(bag: CodexBag, seed: number, trials = DEFAULT_MC_TRIALS, sigma = 0.1): CodexMonteCarlo {
  const fields = Object.keys(bag) as Array<keyof CodexBag>;
  const rng = mulberry32((seed ^ hash32('mc:codex')) >>> 0);

  // One shared perturbation matrix, reused for the base run and every lever.
  const noise: number[][] = [];
  for (let t = 0; t < trials; t++) {
    const row: number[] = [];
    for (let f = 0; f < fields.length; f++) row.push(triangular(rng) * sigma);
    noise.push(row);
  }

  const perturbed = (row: number[], offsets?: Partial<Record<keyof CodexBag, number>>): CodexBag => {
    const out = {} as CodexBag;
    for (let f = 0; f < fields.length; f++) {
      const key = fields[f];
      const offset = offsets?.[key] ?? 0;
      out[key] = clamp01(bag[key] + offset + row[f]);
    }
    return out;
  };

  const values: Record<string, number[]> = {};
  for (const k of METRIC_KEYS) values[k] = [];
  const passCounts: Record<string, number> = {};
  for (const k of METRIC_KEYS) passCounts[k] = 0;
  let goCount = 0;
  let agreeCount = 0;
  const baseVerdict = verdictOf(computeCodex(bag));

  for (const row of noise) {
    const scores = computeCodex(perturbed(row));
    for (const k of METRIC_KEYS) {
      values[k].push(scores[k]);
      if (scores[k] >= CODEX_THRESHOLDS[k]) passCounts[k]++;
    }
    const verdict = verdictOf(scores);
    if (verdict === 'GO') goCount++;
    if (verdict === baseVerdict) agreeCount++;
  }

  const metrics = {} as Record<keyof CodexScores, McQuantiles>;
  let binding: keyof CodexScores = 'trueness';
  let lowestPass = 2;
  for (const k of METRIC_KEYS) {
    const sorted = [...values[k]].sort((a, b) => a - b);
    const passProbability = passCounts[k] / trials;
    metrics[k] = {
      mean: round4(sorted.reduce((a, b) => a + b, 0) / sorted.length),
      p10: round4(quantile(sorted, 0.1)),
      p50: round4(quantile(sorted, 0.5)),
      p90: round4(quantile(sorted, 0.9)),
      passProbability: round4(passProbability),
    };
    if (passProbability < lowestPass) { lowestPass = passProbability; binding = k; }
  }

  const baseGo = goCount / trials;
  const leverImpact: Array<{ driver: string; goDelta: number }> = [];
  for (const driver of fields) {
    let go = 0;
    for (const row of noise) {
      if (verdictOf(computeCodex(perturbed(row, { [driver]: 0.1 }))) === 'GO') go++;
    }
    leverImpact.push({ driver, goDelta: round3(go / trials - baseGo) });
  }
  leverImpact.sort((a, b) => b.goDelta - a.goDelta || a.driver.localeCompare(b.driver));

  return {
    trials,
    goProbability: round4(baseGo),
    agreement: round4(agreeCount / trials),
    baseVerdict,
    metrics,
    binding,
    leverImpact: leverImpact.slice(0, 3),
  };
}

function perturbCount(n: number, rng: () => number): number {
  const spread = Math.sqrt(Math.max(n, 1));
  return Math.max(0, Math.round(n + triangular(rng) * spread));
}

/**
 * Monte Carlo over the observed counts, measuring how stable the dominant comic
 * condition (and therefore the selected arc) is under measurement noise.
 */
export function monteCarloProtocol(input: MetaphorInput, seed: number, trials = DEFAULT_MC_TRIALS): ProtocolMonteCarlo {
  const rng = mulberry32((seed ^ hash32('mc:protocol')) >>> 0);
  const baseCondition = dominantCondition(input);
  const counts: Partial<Record<ReporterCondition, number>> = {};
  let stabilityCount = 0;

  for (let t = 0; t < trials; t++) {
    const jobsTotal = input.jobsTotal;
    const connTotal = input.connectionsTotal;
    const sampled: MetaphorInput = {
      ...input,
      promotions: perturbCount(input.promotions, rng),
      repairs: perturbCount(input.repairs, rng),
      rejected: perturbCount(input.rejected, rng),
      heldBack: perturbCount(input.heldBack, rng),
      pending: perturbCount(input.pending, rng),
      learnerEpisodes: perturbCount(input.learnerEpisodes, rng),
      crystallizedGenes: perturbCount(input.crystallizedGenes, rng),
      jobsEnabled: Math.min(jobsTotal, perturbCount(input.jobsEnabled, rng)),
      connectionsUp: Math.min(connTotal, perturbCount(input.connectionsUp, rng)),
      registryHealthy: perturbCount(input.registryHealthy, rng),
    };
    const condition = dominantCondition(sampled);
    counts[condition] = (counts[condition] ?? 0) + 1;
    if (condition === baseCondition) stabilityCount++;
  }

  const probabilities = (Object.keys(counts) as ReporterCondition[])
    .map((condition) => ({ condition, p: round4((counts[condition] ?? 0) / trials) }))
    .sort((a, b) => b.p - a.p || a.condition.localeCompare(b.condition));

  return {
    trials,
    baseCondition,
    stability: round4(stabilityCount / trials),
    probabilities,
  };
}
