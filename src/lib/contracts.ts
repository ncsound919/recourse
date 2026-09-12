/**
 * Zod input contracts for Recourse's highest-risk HTTP + intake boundaries.
 *
 * Recourse ingests untrusted payloads from many directions (sidecar requests,
 * model output, GitHub, external signals, raw `extra.*` on verify/build
 * routes). Most were hand-parsed with `JSON.parse` + loose field reads. This
 * module centralizes enforceable schemas so a payload that does not conform is
 * rejected with a structured 400 BEFORE it reaches engines that execute code
 * or host tools.
 *
 * Honest scope: this is the contract layer for the boundaries wired so far
 * (sidecar routes + the biotech claim payload). It is not (yet) a retrofit of
 * every one of the ~22 JSON.parse call sites.
 */

import { z } from 'zod';
import type { Request, Response } from 'express';

// --- Shared leaf types -----------------------------------------------------
export const fuzzScorer = z.enum(['ratio', 'token_ratio', 'token_sort', 'partial_ratio']).optional();

// --- Sidecar request bodies ------------------------------------------------
export const kgNeighborhoodReq = z.object({ target: z.string().trim().min(1).max(200) });

export const kgBridgesReq = z.object({
  from: z.string().trim().min(1).max(200),
  to: z.string().trim().min(1).max(200).optional(),
});

export const pdfExtractUrlReq = z.object({
  url: z.string().url().max(2000),
  max_pages: z.coerce.number().int().min(1).max(400).optional(),
});

export const pdfExtractBytesReq = z.object({
  data_base64: z.string().min(1).max(100_000_000),
  filename: z.string().max(255).optional(),
  max_pages: z.coerce.number().int().min(1).max(400).optional(),
});

export const fuzzMatchReq = z.object({
  needle: z.string().trim().min(1).max(2000),
  candidates: z.array(z.string().min(1).max(2000)).min(1).max(1000),
  scorer: fuzzScorer,
  threshold: z.coerce.number().min(0).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const fuzzDedupReq = z.object({
  names: z.array(z.string().trim().min(1).max(2000)).min(1).max(10_000),
  scorer: fuzzScorer,
  threshold: z.coerce.number().min(0).max(100).optional(),
});

// --- BioSim sidecar request bodies -------------------------------------------
export const biosimTrialReq = z.object({
  gens: z.coerce.number().int().min(1).max(2000).optional(),
  growth: z.coerce.number().min(0.5).max(5).optional(),
  mu_driver: z.coerce.number().min(0).max(0.01).optional(),
  driver_boost: z.coerce.number().min(0).max(1).optional(),
  car_t_dose: z.coerce.number().min(0).max(1e9).optional(),
  kill_rate: z.coerce.number().min(0).max(2).optional(),
  t_start: z.coerce.number().int().min(0).max(2000).optional(),
  seed: z.coerce.number().int().optional(),
});

export const biosimMontecarloReq = z.object({
  n_trials: z.coerce.number().int().min(1).max(5000),
  dose: z.coerce.number().min(0).max(1e9),
  seed: z.coerce.number().int().optional(),
  gens: z.coerce.number().int().min(1).max(2000).optional(),
  growth: z.coerce.number().min(0.5).max(5).optional(),
  mu_driver: z.coerce.number().min(0).max(0.01).optional(),
  driver_boost: z.coerce.number().min(0).max(1).optional(),
  kill_rate: z.coerce.number().min(0).max(2).optional(),
  t_start: z.coerce.number().int().min(0).max(2000).optional(),
});

export const biosimSequenceReq = z.object({
  agneg: z.coerce.number().min(0).max(1),
  depth: z.coerce.number().int().min(1).max(10_000_000),
  platform: z.enum(['illumina', 'ont']),
  seed: z.coerce.number().int().optional(),
});

export const biosimLod95Req = z.object({
  platform: z.enum(['illumina', 'ont']),
  depth: z.coerce.number().int().min(1).max(10_000_000),
});

// --- Data Visualizer sidecar -------------------------------------------------
export const vizRenderReq = z.object({
  id: z.string().trim().min(1).max(64),
  width: z.coerce.number().int().min(320).max(1920).optional(),
  height: z.coerce.number().int().min(240).max(1440).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
});

// --- Grant engine (oncology) -------------------------------------------------
export const grantHypothesesReq = z.object({
  problemId: z.string().trim().min(1).max(120),
});

// --- Deterministic research --------------------------------------------------
export const researchQueryReq = z.object({
  id: z.string().trim().min(1).max(120),
  topic: z.string().trim().min(1).max(500),
  intent: z.enum(['literature_scan', 'fact_check', 'trend_detection', 'evidence_collection']).optional(),
  domains: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  minRelevance: z.coerce.number().min(0).max(1).optional(),
  threshold: z.coerce.number().min(0).max(1).optional(),
});

export const researchSourceReq = z.object({
  id: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(1000),
  url: z.string().trim().min(1).max(2000),
  domain: z.string().trim().min(1).max(200),
  contentPreview: z.string().max(20000).optional(),
  authors: z.array(z.string().max(200)).max(50).optional(),
  doi: z.string().max(300).optional(),
  publishedAt: z.coerce.number().optional(),
  openAccess: z.coerce.boolean().optional(),
});

export const researchExecuteReq = z.object({
  query: researchQueryReq,
  sources: z.array(researchSourceReq).min(1).max(500),
  claims: z
    .array(z.object({ id: z.string().trim().min(1).max(200), text: z.string().trim().min(1).max(2000) }))
    .max(100)
    .optional(),
});

// --- Prometheus bridge -------------------------------------------------------
export const prometheusExportReq = z.object({
  entity: z.enum(['hypotheses', 'breakthroughs', 'signals']),
  format: z.enum(['json', 'csv']).optional(),
});

// --- Overlay Oncology aggregate bridge (Decon/QLCCE/ATTEC/ctDNA/Oncograph/
//     HelixForge/daraxonrasib run THROUGH the oncology host) -------------------
export const oncologyPredictReq = z.object({
  source_ref: z.string().trim().min(1).max(500).optional(),
  features: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export const oncologyDiscoveryScreenReq = z.object({
  hypotheses: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(128),
        claim: z.string().trim().min(1).max(4000),
        targetGene: z.string().trim().max(128).optional(),
        mechanism: z.string().trim().max(2000).optional(),
      }),
    )
    .min(1)
    .max(200),
  seed: z.coerce.number().int().min(0).optional(),
  useQueue: z.coerce.boolean().optional(),
});

export const oncologyResearchPipelineReq = z
  .object({
    topic: z.string().trim().min(1).max(500),
    cancerType: z.string().trim().max(120).optional(),
    target: z.string().trim().max(120).optional(),
    mechanism: z.string().trim().max(500).optional(),
    seeds: z.array(z.coerce.number().int().min(0)).max(20).optional(),
    ticks: z.coerce.number().int().min(1).max(10_000).optional(),
    dose: z.coerce.number().min(0).max(1e6).optional(),
    runCycle: z.coerce.boolean().optional(),
    runSim: z.coerce.boolean().optional(),
    runBacktest: z.coerce.boolean().optional(),
    crossReference: z.coerce.boolean().optional(),
    publish: z.coerce.boolean().optional(),
  })
  .passthrough();

export const oncologyEvidenceReq = z.object({
  cohort: z.string().trim().min(1).max(12).optional(),
  gene: z.string().trim().min(1).max(64).optional(),
});

export const oncologyValidationMatrixReq = z.object({
  train: z.array(z.string().trim().min(2).max(12)).max(20).optional(),
  valid: z.array(z.string().trim().min(2).max(12)).max(20).optional(),
});

// --- BFR bridge (lightweight simulated sweeps) -------------------------------
export const bfrAgingReq = z.object({
  hallmarks: z.array(z.string().trim().min(1).max(120)).min(1).max(20).optional(),
  organisms: z.array(z.string().trim().min(1).max(120)).min(1).max(10).optional(),
  seed: z.coerce.number().int().optional(),
});

export const bfrSatReq = z.object({
  nVars: z.coerce.number().int().min(3).max(500).optional(),
  nInstances: z.coerce.number().int().min(1).max(5000).optional(),
  seed: z.coerce.number().int().optional(),
});

export const bfrRiemannReq = z.object({
  tStart: z.coerce.number().min(10).max(1e15).optional(),
  tEnd: z.coerce.number().min(10).max(1e15).optional(),
  points: z.coerce.number().int().min(2).max(200).optional(),
  seed: z.coerce.number().int().optional(),
});

// --- Overlay Oncology engine bridge ------------------------------------------
export const oncologySimulateReq = z.object({
  input: z.record(z.string(), z.unknown()),
});

// --- Biotech scientific API bridge -------------------------------------------
export const sequenceReq = z.object({
  sequence: z.string().trim().min(1).max(100_000),
});

export const geneLookupReq = z.object({
  symbol: z.string().trim().min(1).max(60),
});

export const ttestReq = z.object({
  a: z.array(z.coerce.number().finite()).min(2).max(10000),
  b: z.array(z.coerce.number().finite()).min(2).max(10000),
});

// --- Research integrity bridge (passthrough payloads, size-capped) -----------
export const integrityPayloadReq = z.record(z.string(), z.unknown());

// --- Study orchestrator bridge -----------------------------------------------
export const studySubmitReq = z.object({
  objective: z.string().trim().min(8).max(2000),
  hypothesis: z.string().trim().max(2000).optional(),
  questions: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  direction: z.string().trim().max(120).optional(),
});

// --- BioSim-Fusion protein folding bridge -------------------------------------
const AA_RE = /^[ACDEFGHIKLMNPQRSTVWYacdefghiklmnpqrstvwy]+$/;
export const foldSubmitReq = z.object({
  fastas: z.array(z.string().trim().min(3).max(5000).regex(AA_RE, 'invalid amino acid sequence')).min(1).max(100),
  mode: z.enum(['quantum', 'cpu', 'hybrid']).optional(),
  cores: z.coerce.number().int().min(1).max(128).optional(),
  quantum_shots: z.coerce.number().int().min(10).max(1000).optional(),
});

// --- Pathosphere off-chain adapter (no chain calls; validated JSON) ----------
export const pathosphereBountyReq = z.object({
  title: z.string().trim().min(8).max(300),
  organism: z.string().trim().max(120).optional(),
  dataHash: z.string().trim().max(128).optional(),
  rewardNote: z.string().trim().max(1000).optional(),
  deadlineMs: z.coerce.number().int().positive().optional(),
});

export const pathosphereVoteReq = z.object({
  artifactId: z.string().trim().min(1).max(200),
  decision: z.enum(['approve', 'reject', 'abstain']),
  rationale: z.string().trim().max(2000).optional(),
  weightBps: z.coerce.number().int().min(0).max(10000).optional(),
});

export const pathosphereSplitReq = z.object({
  recipients: z
    .array(z.object({ addressOrLabel: z.string().trim().min(1).max(200), bps: z.coerce.number().int().min(0).max(10000) }))
    .min(1)
    .max(50),
});

export const pathosphereBundleReq = z.object({
  kind: z.enum(['bounty', 'vote', 'split']),
  payload: z.record(z.string(), z.unknown()),
});

// --- UMOE mechanistic engine bridge ------------------------------------------
export const umoeRunReq = z.object({
  tumor_id: z.string().trim().min(1).max(200),
  workflow_id: z.string().trim().max(120).optional(),
  therapies: z.array(z.string().trim().max(200)).max(20).optional(),
  mode: z.string().trim().max(60).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  seed: z.coerce.number().int().optional(),
});

// --- Overlay-Chemlab bridge ---------------------------------------------------
export const chemlabSmilesReq = z.object({
  smiles: z.string().trim().min(1).max(2000),
});

export const chemlabSimilarityReq = z.object({
  smiles1: z.string().trim().min(1).max(2000),
  smiles2: z.string().trim().min(1).max(2000),
});

export const chemlabPassthroughReq = z.record(z.string(), z.unknown());

export const chemlabReactionReq = z.object({
  reaction: z.string().trim().min(1).max(4000),
});

// --- OncoForesight predictor bridge (schemas live upstream; passthrough) -----
export const foresightBodyReq = z.record(z.string(), z.unknown());

// --- Biotech claim payload (raw `extra.*` on verify/build) -----------------
export const LEGS = z.enum(['debulking', 'blocking', 'resistance', 'cleanup']).optional();
export const biotechClaimExtra = z
  .object({
    asset_name: z.string().trim().min(1).max(200).optional(),
    mechanism: z.string().trim().max(2000).optional(),
    leg: LEGS,
    evidence_tier: z.coerce.number().int().min(0).max(5).optional(),
    source: z.string().trim().min(1).max(2000).optional(),
  })
  // reject unknown top-level keys on the claim payload (no silent injection)
  .strict();

export type BiotechClaimExtra = z.infer<typeof biotechClaimExtra>;

// --- Express helper --------------------------------------------------------
/**
 * Validate `req.body` against `schema`. On success returns the parsed data; on
 * failure responds 400 with the structured issues and returns null so the route
 * can `return`. Centralizes the "reject bad input before it runs" contract.
 */
export function zod400<T>(schema: z.ZodType<T>, req: Request, res: Response): T | null {
  const parsed = schema.safeParse(req.body ?? {});
  if (parsed.success) return parsed.data;
  res.status(400).json({
    success: false,
    error: 'invalid payload',
    issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
  return null;
}
