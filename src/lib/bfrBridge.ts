/**
 * BF Resolver bridge — Node-side job runner for BF Resolver worker ideas
 * WITHOUT a parallel orchestrator.
 *
 * HONEST SCOPE (read before citing any number from this module):
 * - `runAgingSweep` and `runSatSweep` are lightweight deterministic
 *   SIMULATIONS driven by a seeded PRNG. They model the *shape* of the
 *   Python workers (`BF Resolver/aging_worker.py`, `pnp_worker.py`) —
 *   effect sizes, phase-transition hardness — but they do NOT run those
 *   workers, do NOT execute real solvers, and prove NOTHING about lower
 *   bounds, biomarkers, or P vs NP. Every result is tagged
 *   `provenance: 'SIMULATED'`.
 * - `runRiemannSlice` evaluates the closed-form Riemann–von Mangoldt
 *   N(T) estimate (main term T/2π·(ln(T/2π)−1) + 7/8). That is a textbook
 *   ESTIMATE of the zero-counting function, not a zero computation and not
 *   evidence about the Riemann hypothesis. Tagged `provenance: 'ESTIMATE'`.
 * - "Discovery" flags below are threshold crossings on these proxy metrics
 *   (riemann 1%, pnp 5%, aging 10%), not scientific discoveries.
 *
 * All three runners are pure + deterministic: same seed → same rows.
 */

export type BfrProblem = 'riemann' | 'pnp' | 'aging';

export interface BfrResult {
  problem: BfrProblem;
  metric: string;
  value: number;
  iterations: number;
  timestamp: number;
}

export type BfrProvenance = 'SIMULATED' | 'ESTIMATE';

export interface BfrSweep {
  problem: BfrProblem;
  seed: number;
  rows: BfrResult[];
  /** True when the proxy metric improved over baseline beyond threshold. */
  discovery: boolean;
  improvement: number;
  threshold: number;
  provenance: BfrProvenance;
  note: string;
}

/** Mulberry32 — small deterministic PRNG so sweeps are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sweepClock(seed: number): number {
  // Deterministic logical clock: same seed → same timestamps, so sweeps
  // are fully reproducible. NOT wall-clock time.
  return 1_700_000_000_000 + (seed >>> 0) * 1000;
}

export const BFR_THRESHOLDS: Record<BfrProblem, number> = {
  riemann: 0.01,
  pnp: 0.05,
  aging: 0.1,
};

function sweepShell(
  problem: BfrProblem,
  seed: number,
  rows: BfrResult[],
  improvement: number,
  provenance: BfrProvenance,
  note: string,
): BfrSweep {
  const threshold = BFR_THRESHOLDS[problem];
  return { problem, seed, rows, discovery: improvement > threshold, improvement, threshold, provenance, note };
}

/**
 * Deterministic aging-biology sweep (SIMULATED).
 * For each hallmark × organism pair, draws a pseudo effect size
 * (Cohen's d proxy) from a seeded PRNG around a per-hallmark prior mean.
 * Rows are emitted as a time series (iterations = pair index).
 * Discovery = max effect size exceeds the 10% improvement threshold
 * relative to a null baseline of 0 — i.e. maxD > 0.10 in absolute terms.
 */
export function runAgingSweep(hallmarks: string[], organisms: string[], seed = 1): BfrSweep {
  const rng = mulberry32(seed);
  const now = sweepClock(seed);
  const priorMean: Record<string, number> = {
    genomic_instability: 0.35,
    telomere_attrition: 0.3,
    epigenetic_alterations: 0.4,
    loss_of_proteostasis: 0.25,
    mitochondrial_dysfunction: 0.33,
    cellular_senescence: 0.45,
    stem_cell_exhaustion: 0.28,
    altered_intracellular_communication: 0.22,
  };
  const rows: BfrResult[] = [];
  let iter = 0;
  let max = 0;
  const halls = hallmarks.length > 0 ? hallmarks : ['cellular_senescence'];
  const orgs = organisms.length > 0 ? organisms : ['mouse'];
  for (const h of halls) {
    for (const o of orgs) {
      const mean = priorMean[h] ?? 0.25;
      // Seeded jitter ±0.15 around the prior mean; clamp to [0, 1].
      const d = Math.min(1, Math.max(0, mean + (rng() - 0.5) * 0.3));
      if (d > max) max = d;
      rows.push({
        problem: 'aging',
        metric: `effect_size:${h}:${o}`,
        value: Math.round(d * 10000) / 10000,
        iterations: iter++,
        timestamp: now + iter,
      });
    }
  }
  return sweepShell(
    'aging',
    seed,
    rows,
    max,
    'SIMULATED',
    'SIMULATED proxy: seeded effect-size draws around per-hallmark priors. Not a biomarker validation; see BF Resolver/aging_worker.py for the real worker.',
  );
}

/**
 * Deterministic 3-SAT hardness sweep (SIMULATED hardness proxy).
 * Models solver cost as a seeded function peaking near the
 * phase-transition clause/variable ratio α ≈ 4.26 for random 3-SAT:
 *   hardness(nVars, α) = nVars · exp(−((α − 4.26)²) / 2) · jitter
 * Discovery = peak hardness exceeds baseline (α far from transition)
 * by more than 5%. This is a STATISTICAL MODEL of solver behavior, not a
 * solver run — it never establishes satisfiability or lower bounds.
 */
export function runSatSweep(nVars: number, nInstances: number, seed = 1): BfrSweep {
  const n = Math.max(1, Math.floor(nVars));
  const m = Math.max(1, Math.floor(nInstances));
  const rng = mulberry32(seed);
  const now = sweepClock(seed);
  const hardness = (alpha: number, jitter: number) =>
    n * Math.exp(-((alpha - 4.26) ** 2) / 2) * jitter;
  const rows: BfrResult[] = [];
  let baseline = 0;
  let peak = 0;
  for (let i = 0; i < m; i++) {
    // Sweep α across [2.0, 6.5] deterministically, seeded jitter ±10%.
    const alpha = 2.0 + (4.5 * i) / Math.max(1, m - 1);
    const jitter = 0.9 + rng() * 0.2;
    const h = hardness(alpha, jitter);
    if (i === 0) baseline = h;
    if (h > peak) peak = h;
    rows.push({
      problem: 'pnp',
      metric: `sat_hardness_proxy:n${n}:alpha${Math.round(alpha * 100) / 100}`,
      value: Math.round(h * 10000) / 10000,
      iterations: i,
      timestamp: now + i,
    });
  }
  const improvement = baseline > 0 ? (peak - baseline) / baseline : 0;
  return sweepShell(
    'pnp',
    seed,
    rows,
    Math.round(improvement * 10000) / 10000,
    'SIMULATED',
    'SIMULATED proxy: seeded phase-transition hardness model. Never run through a SAT solver; makes no claim about P vs NP or lower bounds.',
  );
}

/**
 * Riemann zero-count slice (ESTIMATE via closed form).
 * Uses the Riemann–von Mangoldt main term
 *   N(T) ≈ T/(2π)·(ln(T/(2π)) − 1) + 7/8
 * sampled at `points` evenly spaced abscissae in [tStart, tEnd].
 * Discovery = relative growth (N(last)−N(first))/N(first) exceeds 1%.
 * That is a property of the smooth estimate curve, NOT a computed zero
 * and NOT evidence for/against RH.
 */
export function runRiemannSlice(tStart: number, tEnd: number, points = 16, seed = 1): BfrSweep {
  const lo = Math.max(2 * Math.PI + 0.5, Math.min(tStart, tEnd));
  const hi = Math.max(lo + 1, Math.max(tStart, tEnd));
  const p = Math.max(2, Math.min(1024, Math.floor(points)));
  const now = sweepClock(seed);
  const nOfT = (t: number) => (t / (2 * Math.PI)) * (Math.log(t / (2 * Math.PI)) - 1) + 7 / 8;
  const rows: BfrResult[] = [];
  for (let i = 0; i < p; i++) {
    const t = lo + ((hi - lo) * i) / (p - 1);
    rows.push({
      problem: 'riemann',
      metric: `N_estimate:T${Math.round(t * 100) / 100}`,
      value: Math.round(nOfT(t) * 10000) / 10000,
      iterations: i,
      timestamp: now + i,
    });
  }
  const first = rows[0].value;
  const last = rows[rows.length - 1].value;
  const improvement = first > 0 ? (last - first) / first : 0;
  return sweepShell(
    'riemann',
    seed,
    rows,
    Math.round(improvement * 10000) / 10000,
    'ESTIMATE',
    'ESTIMATE: closed-form Riemann–von Mangoldt main term. Not a zero computation; see BF Resolver bfr-orchestrator for the real worker harness.',
  );
}
