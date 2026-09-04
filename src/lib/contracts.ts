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
