/**
 * BioSim trial template plugin — closed-loop tumor/CAR-T + sequencing probe.
 *
 * This template is defined OUTSIDE the built-in library and registered with a
 * single `registerComponentTemplatePlugin(...)` call from componentTemplates.ts,
 * exactly the way any third-party add-on would be added. It also declares a
 * `selfHost` descriptor, so building it with self-hosting enabled writes a real
 * module that the running server imports and calls.
 *
 * The synthesized component mirrors `src/lib/biosimSidecarClient.ts`: it calls
 * the live BioSim sidecar (`python/biosim_service/main.py`, ported from
 * BioSimEngine v0.3 + SeqLayer) first, and drops to deterministic local math
 * (seeded RNG + normal-approximation detection) when the sidecar is down. The
 * fallback NEVER pretends to be the sidecar: results carry an explicit
 * `source: 'sidecar' | 'fallback'` field, and the fallback math is constructed
 * so cure rate is monotone non-decreasing in dose under a common seed.
 */

import type { ToolDomain, ComponentTemplateParam, ComponentTemplateCategory } from '../../types';
import type { TemplatePlugin } from '../templatePlugin';

const params: ComponentTemplateParam[] = [
  {
    id: 'n_trials',
    label: 'Monte Carlo Trials',
    type: 'number',
    default: 200,
    min: 1,
    max: 5000,
    step: 10,
    description: 'Number of simulated tumor/CAR-T trials per montecarlo call'
  },
  {
    id: 'car_t_dose',
    label: 'CAR-T Dose',
    type: 'number',
    default: 300000,
    min: 0,
    max: 1_000_000_000,
    step: 10000,
    description: 'Effector cell dose supplied at treatment start'
  },
  {
    id: 'depth',
    label: 'Sequencing Depth',
    type: 'number',
    default: 2000,
    min: 1,
    max: 10_000_000,
    step: 100,
    description: 'Read depth used for detection probability and lod95'
  },
  {
    id: 'platform',
    label: 'Sequencing Platform',
    type: 'select',
    default: 'illumina',
    options: ['illumina', 'ont'],
    description: 'Error-model platform (Illumina PE150 vs ONT)'
  }
];

export const biosimTrialPlugin: TemplatePlugin = {
  id: 'tpl_biosim_trial',
  name: 'BioSim Closed-Loop Tumor/CAR-T Trial Probe',
  domain: 'biotech' as ToolDomain,
  category: 'algorithmic' as ComponentTemplateCategory,
  description: 'Monte Carlo tumor/CAR-T trial runner with sequencing detection (SeqLayer P_ERR/detect_prob/lod95): live BioSim sidecar first, deterministic seeded fallback math when the sidecar is down.',
  benchmarkFlops: 5200,
  complexity: 'O(Trials)',
  defaultScore: 0.95,
  tags: ['biotech', 'car-t', 'monte-carlo', 'sequencing', 'sidecar'],
  params,
  synthesizer: (userParams, options) => {
    const nTrials = Math.max(1, Math.floor(Number(userParams.n_trials) || 200));
    const dose = Math.max(0, Number(userParams.car_t_dose ?? 300000));
    const depth = Math.max(1, Math.floor(Number(userParams.depth) || 2000));
    const platform = userParams.platform === 'ont' ? 'ont' : 'illumina';
    const withHealing = options?.withSelfHealing ?? true;
    const compName = options?.componentName || 'BioSimTrial';

    const sourceCode = `/**
 * Autonomously Synthesized Component: ${compName}
 * Blueprint: tpl_biosim_trial (nTrials: ${nTrials}, dose: ${dose}, depth: ${depth}, platform: ${platform})
 * Closed-loop BioSim probe: live sidecar first, deterministic fallback always.
 * Honesty: every result carries source 'sidecar' | 'fallback' — the fallback
 * NEVER claims to be a sidecar run.
 */
export class ${compName} {
  private nTrials: number;
  private carTDose: number;
  private depth: number;
  private platform: string;
  private sidecarUrl: string;
  public static P_ERR: Record<string, number> = { illumina: 1.33e-4, ont: 1.31e-2 };
  public static EC50: number = 100000;

  constructor(nTrials = ${nTrials}, carTDose = ${dose}, depth = ${depth}, platform = '${platform}', sidecarUrl = 'http://127.0.0.1:8503') {
    this.nTrials = Math.max(1, Math.floor(nTrials));
    this.carTDose = Math.max(0, carTDose);
    this.depth = Math.max(1, Math.floor(depth));
    this.platform = platform === 'ont' ? 'ont' : 'illumina';
    this.sidecarUrl = sidecarUrl;
  }

  private static mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Deterministic cure probability: monotone non-decreasing in dose. */
  public static cureProb(dose: number): number {
    const d = Math.max(0, dose);
    return d / (d + ${compName}.EC50);
  }

  /**
   * Deterministic Monte Carlo under a common seed: trial i draws u_i once and
   * cures when u_i < cureProb(dose), so a higher dose cures a superset of the
   * lower-dose cures (monotone cure rate, seed for seed).
   */
  public montecarlo(nTrials: number, dose: number, seed: number): { cures: number; n: number; cureRate: number; dose: number; seed: number } {
    const n = Math.max(1, Math.floor(nTrials));
    const p = ${compName}.cureProb(dose);
    const rand = ${compName}.mulberry32(seed >>> 0);
    let cures = 0;
    for (let i = 0; i < n; i++) {
      if (rand() < p) cures++;
    }
    return { cures, n, cureRate: cures / n, dose, seed };
  }

  private static phi(z: number): number {
    const s = z < 0 ? -1 : 1;
    const x = Math.abs(z) / Math.SQRT2;
    const t = 1 / (1 + 0.3275911 * x);
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const erf = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1 + s * erf);
  }

  /**
   * Detection probability via the SeqLayer binomial-tail rule
   * (thr = max(3, n*pErr + 4*sqrt(n*pErr))) with a normal approximation to
   * the binomial CDF — real math, fully deterministic, no network.
   */
  public detectProb(depth: number, vaf: number, platform: string): number {
    const pErr = ${compName}.P_ERR[platform] !== undefined ? ${compName}.P_ERR[platform] : ${compName}.P_ERR.illumina;
    const n = Math.max(1, Math.floor(depth));
    const q = Math.min(Math.max(vaf, 0) + pErr, 1);
    const thr = Math.max(3, n * pErr + 4 * Math.sqrt(n * pErr));
    const mean = n * q;
    const sd = Math.sqrt(Math.max(1e-12, n * q * (1 - q)));
    const z = (thr + 0.5 - mean) / sd;
    return 1 - ${compName}.phi(z);
  }

  /** Lowest VAF with >=95% detection (logspace scan mirroring SeqLayer.lod95). */
  public lod95(platform: string, depth: number): number {
    const lo = -4;
    const hi = -0.6;
    const steps = 200;
    for (let i = 0; i < steps; i++) {
      const v = Math.pow(10, lo + ((hi - lo) * i) / (steps - 1));
      if (this.detectProb(depth, v, platform) >= 0.95) return v;
    }
    return NaN;
  }

  /**
   * Closed-loop trial: live sidecar first (timeout-guarded), deterministic
   * fallback on any failure. The returned source field says which ran.
   */
  public async runTrial(dose?: number, seed?: number): Promise<{ ok: boolean; source: string; dose: number; seed: number; trial?: unknown; cureRate?: number; error?: string }> {
    const d = dose !== undefined ? dose : this.carTDose;
    const s = seed !== undefined ? seed : 0;
    ${withHealing ? `if (!(d >= 0)) {
      return { ok: false, source: 'fallback', dose: d, seed: s, error: 'dose must be >= 0' };
    }` : ''}
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(this.sidecarUrl.replace(/\\/$/, '') + '/biosim/trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ car_t_dose: d, seed: s }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error('biosim sidecar HTTP ' + res.status);
      const data = await res.json();
      return { ok: true, source: 'sidecar', dose: d, seed: s, trial: data.trial !== undefined ? data.trial : data };
    } catch (err: any) {
      const mc = this.montecarlo(1, d, s);
      return { ok: true, source: 'fallback', dose: d, seed: s, cureRate: mc.cureRate, error: err && err.message ? String(err.message) : 'biosim sidecar unreachable' };
    } finally {
      clearTimeout(timer);
    }
  }
}`;

    const testSuiteCode = `const t = new ${compName}(${nTrials}, ${dose}, ${depth}, '${platform}');
const lo = t.montecarlo(200, 100000, 42);
const hi = t.montecarlo(200, 600000, 42);
assert hi.cureRate >= lo.cureRate;
assert hi.cures >= lo.cures;
assert lo.n === 200;
const lodIll = t.lod95('illumina', 2000);
const lodOnt = t.lod95('ont', 2000);
assert lodIll > 0;
assert lodOnt > 0;
assert lodIll < lodOnt;
assert t.detectProb(2000, 0.05, 'illumina') > t.detectProb(2000, 0.0001, 'illumina');`;

    return {
      sourceCode,
      testSuiteCode,
      entrypointName: compName,
      summary: `Synthesized closed-loop BioSim trial probe (${nTrials} trials, dose ${dose}, ${platform}@${depth}x) with live-sidecar-first execution and monotone deterministic fallback`,
      selfHealingGuards: withHealing ? ['SidecarTimeoutGuard', 'DoseMonotonicityFallback', 'NonNegativeDoseBoundary'] : []
    };
  },
  selfHost: {
    stateful: true,
    ctorParamIds: ['n_trials', 'car_t_dose', 'depth', 'platform'],
    methods: [
      { method: 'runTrial', label: 'Run closed-loop trial (sidecar first, fallback honest)' },
      { method: 'montecarlo', label: 'Deterministic Monte Carlo cure-rate probe' },
      { method: 'lod95', label: 'Limit of detection at 95% for a platform/depth' }
    ]
  }
};
