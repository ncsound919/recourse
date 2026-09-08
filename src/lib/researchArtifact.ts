/**
 * Research Artifact — the publishable-grade reproducibility contract for every
 * finding Recourse produces.
 *
 * A scientist must be able to take any artifact and answer:
 *   - What was computed? (claim, engine)
 *   - On what inputs? (dataVersion, params, seed — all pinned)
 *   - With what code? (codeVersion / engineVersion)
 *   - Is it statistically defensible? (stats: test, n, effect, CI, p, corrected)
 *   - Is it verified? (verification method + result)
 *   - Can I reproduce it? (artifactHash = SHA-256 of the reproducible core;
 *     identical inputs+code+seed -> identical hash -> identical output)
 *
 * Honesty contract:
 *  - `stats` is present ONLY when a real statistical test ran. Absence is
 *    honest ("not measured") — never a fabricated p-value.
 *  - `seed` is pinned when the engine is seeded (deterministic re-run); null
 *    when the engine is unseeded.
 *  - `artifactHash` covers the reproducible core (claim, engine, dataVersion,
 *    params, seed, codeVersion, stats) — NOT timestamps or ids, so identical
 *    runs hash identically.
 */

import { createHash } from 'node:crypto';
import { twoProportionZTest } from './statistics';

export type EvidenceTier = 'E1' | 'E2' | 'E3' | 'E4';

export interface ArtifactStats {
  test: string;                 // e.g. 'log_rank', 'cox_ph', 'welch_t', 'hypergeometric'
  n: number;                    // sample size
  effect?: number;              // effect size (hazard ratio, mean diff, ...)
  ci?: { lower: number; upper: number; level: number }; // confidence interval
  p?: number;                   // uncorrected p-value
  correctedP?: number;          // multiple-comparison corrected p-value
  correction?: string;          // e.g. 'benjamini_hochberg'
  method?: string;              // e.g. 'survival', 'regression'
}

export interface ArtifactCitation {
  refs: string[];               // PMID / DOI / dataset identifiers
  note?: string;
}

export interface ResearchArtifact {
  id: string;
  kind: string;                 // finding kind: 'dose_response', 'kg_bridge', ...
  claim: string;
  engine: string;               // which subsystem / engine produced it
  dataVersion: string | null;   // SHA of input data (cohort version, corpus hash)
  params: Record<string, unknown>; // canonical engine parameters
  seed: number | null;          // engine seed (null = unseeded)
  codeVersion: string;          // Recourse code git hash / version
  evidenceTier: EvidenceTier;
  stats: ArtifactStats | null;  // null = not statistically measured
  citation: ArtifactCitation | null;
  verification: {
    method: string;             // 'isolated_vm_suite', 'independent_crosscheck', 'lean'
    passed: boolean;
    detail?: string;
  } | null;
  provenance: string;           // human-readable provenance line
  /** SHA-256 over the reproducible core — identical runs -> identical hash. */
  artifactHash: string;
  createdAt: number;            // wall-clock (NOT part of the hash)
}

/** Canonical JSON: stable key order so the same object hashes identically. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Compute the reproducible artifact hash (excludes ids/timestamps). */
export function computeArtifactHash(core: Omit<ResearchArtifact, 'id' | 'createdAt' | 'artifactHash'>): string {
  const blob = canonicalJson({
    kind: core.kind,
    claim: core.claim,
    engine: core.engine,
    dataVersion: core.dataVersion,
    params: core.params,
    seed: core.seed,
    codeVersion: core.codeVersion,
    evidenceTier: core.evidenceTier,
    stats: core.stats,
    citation: core.citation,
    verification: core.verification,
    provenance: core.provenance,
  });
  return sha256(blob);
}

export interface BuildArtifactInput {
  kind: string;
  claim: string;
  engine: string;
  dataVersion?: string | null;
  params?: Record<string, unknown>;
  seed?: number | null;
  codeVersion?: string;
  evidenceTier?: EvidenceTier;
  stats?: ArtifactStats | null;
  citation?: ArtifactCitation | null;
  verification?: ResearchArtifact['verification'];
  provenance?: string;
}

/** Build a ResearchArtifact from engine output + reproducibility inputs. */
export function buildArtifact(input: BuildArtifactInput, now = Date.now()): ResearchArtifact {
  const codeVersion =
    input.codeVersion ||
    process.env.RECOURSE_CODE_VERSION ||
    (process.env.NODE_ENV === 'test' ? 'test' : 'dev');
  const core: Omit<ResearchArtifact, 'id' | 'createdAt' | 'artifactHash'> = {
    kind: input.kind,
    claim: input.claim,
    engine: input.engine,
    dataVersion: input.dataVersion ?? null,
    params: input.params ?? {},
    seed: input.seed ?? null,
    codeVersion,
    evidenceTier: input.evidenceTier ?? 'E4',
    stats: input.stats ?? null,
    citation: input.citation ?? null,
    verification: input.verification ?? null,
    provenance: input.provenance || '',
  };
  const artifactHash = computeArtifactHash(core);
  return {
    ...core,
    id: `art_${artifactHash.slice(0, 12)}`,
    artifactHash,
    createdAt: now,
  };
}

/** Recompute the hash of a stored artifact — returns true iff it matches
 *  (detects any tampering of the reproducible core). */
export function verifyArtifactHash(a: ResearchArtifact): boolean {
  const core: Omit<ResearchArtifact, 'id' | 'createdAt' | 'artifactHash'> = {
    kind: a.kind,
    claim: a.claim,
    engine: a.engine,
    dataVersion: a.dataVersion,
    params: a.params,
    seed: a.seed,
    codeVersion: a.codeVersion,
    evidenceTier: a.evidenceTier,
    stats: a.stats,
    citation: a.citation,
    verification: a.verification,
    provenance: a.provenance,
  };
  return computeArtifactHash(core) === a.artifactHash;
}

/** Evidence-tier label for a claim given how it was produced. Honest mapping:
 *  E1 = verified against real external data + statistical test + independent
 *       verification; E2 = verified against real data (no independent proof);
 *  E3 = real computation, uncalibrated model; E4 = exploratory / not measured. */
export function tierForEvidence(args: {
  hasExternalData: boolean;
  hasStats: boolean;
  independentlyVerified: boolean;
}): EvidenceTier {
  if (args.hasExternalData && args.hasStats && args.independentlyVerified) return 'E1';
  if (args.hasExternalData && args.hasStats) return 'E2';
  if (args.hasExternalData) return 'E3';
  return 'E4';
}

/** Build an ArtifactStats for a dose-response claim from its sweep numbers.
 *  Real: compares the lowest and highest dose arms with a two-proportion z-test
 *  (valid when each arm is a cure rate over n trials). Returns null when the
 *  numbers don't support a test (honest).
 *  Supports encodings produced by the science loop:
 *    - {dose_0,rate_0,n_0,dose_1,rate_1,n_1,...} — per-arm pairs with trial n
 *    - {low,mid,high} — 3-arm summary (no n -> no test -> null) */
export function statsForDoseResponse(numbers: Record<string, number | null>): ArtifactStats | null {
  const arms: Array<{ dose: number; rate: number; n: number }> = [];

  // Encoding A: {dose_0,rate_0,n_0,dose_1,rate_1,n_1,...}
  for (let i = 0; i < 20; i++) {
    const d = numbers[`dose_${i}`];
    const r = numbers[`rate_${i}`];
    const n = numbers[`n_${i}`];
    if (typeof d === 'number' && typeof r === 'number' && typeof n === 'number' &&
        Number.isFinite(d) && Number.isFinite(r) && Number.isFinite(n)) {
      arms.push({ dose: d, rate: r, n });
    }
  }

  // Encoding B: {low, mid, high} without per-arm n — insufficient for a test.
  if (arms.length < 2) return null;

  const sorted = arms.sort((a, b) => a.dose - b.dose);
  const low = sorted[0];
  const high = sorted[sorted.length - 1];
  if (low.dose === high.dose || low.n < 30 || high.n < 30) return null;

  const z = twoProportionZTest(high.rate, high.n, low.rate, low.n);
  if (!z) return null;
  return {
    test: 'two_proportion_z',
    n: z.n1 + z.n2,
    effect: z.effect,
    ci: z.ci,
    p: z.p,
    method: `dose_response lowest-vs-highest arm (${low.n}+${high.n} trials each)`,
  };
}