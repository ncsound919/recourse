/**
 * Business Profile Store — single source of truth for each business Recourse
 * produces artifacts for. Profiles live as YAML in data/business-profiles/
 * and are the load-bearing input for every artifact generation pipeline.
 *
 * Honest limits: a profile is a human-authored grounding document. The model
 * is allowed to READ it; it is never allowed to MUTATE it. Profile changes
 * happen in the editor and are committed by a human.
 */

import { z } from 'zod';

// --- Zod schemas (enforced at load time) -----------------------------------

export const BusinessStage = z.enum(['live_product', 'beta', 'concept', 'idea']);
export type BusinessStageT = z.infer<typeof BusinessStage>;

export const PricingModel = z.enum([
  'subscription',
  'prepaid_rental',
  'transaction',
  'hybrid',
  'free',
  'unlisted',
]);
export type PricingModelT = z.infer<typeof PricingModel>;

export const BusinessIdentity = z.object({
  name: z.string().min(1).max(80),
  tagline: z.string().min(1).max(160),
  industry: z.string().min(1).max(80),
  website: z.string().url().or(z.literal('')),
  stage: BusinessStage,
});

export const CustomerSegment = z.object({
  name: z.string().min(1).max(80),
  pain: z.string().min(1).max(400),
});

export const Customer = z.object({
  icp: z.string().min(1).max(500),
  segments: z.array(CustomerSegment).min(1).max(10),
  buyingTrigger: z.string().min(1).max(300),
  topObjections: z.array(z.string().min(1).max(300)).min(1).max(8),
});

export const Offering = z.object({
  summary: z.string().min(1).max(500),
  pricing: z.string().min(1).max(300),
  model: PricingModel,
  differentiators: z.array(z.string().min(1).max(200)).min(1).max(8),
});

export const VoiceAndBrand = z.object({
  tone: z.enum(['professional', 'casual', 'technical', 'playful']).default('professional'),
  prohibitedPhrases: z.array(z.string().min(1).max(200)).default([]),
  exampleCopy: z.array(z.string().min(1).max(500)).default([]),
});

export const RepoBinding = z.object({
  localPath: z.string().min(1).max(500),
  githubUrl: z.string().url().or(z.literal('')).default(''),
  defaultBranch: z.string().min(1).max(100).default('main'),
  protectedPaths: z.array(z.string().min(1).max(300)).default([
    '.env',
    'gh token.txt',
    '*.env*',
    '*secret*',
    '*token*',
    '*key*',
  ]),
  auditScheduleCron: z.string().default('0 6 * * *'),
  /**
   * May the loop MERGE on its own once a proposal's veto window expires?
   *
   * This used to gate the entire loop: with it false, runLoop returned `idle`
   * before the audit stage, so a profile could not even analyse its own repo or
   * open a draft PR. Analysis and merging are different permissions, so they
   * are now separate: a bound repo is always auditable, and this flag only
   * controls the irreversible step.
   */
  autoMergeEnabled: z.boolean().default(false),
  autoMergeVetoHours: z.number().int().min(1).max(168).default(24),
  minSandboxScore: z.number().min(0).max(1).default(0.7),
  /**
   * Pause for a human checkpoint after opening a PR, instead of letting the
   * veto window carry it to merge on its own.
   *
   * This field did not exist, and `recourseActivator` read
   * `profile.repo.requireCheckpoint` anyway — so it was permanently `undefined`
   * and checkpoint.ts never ran outside tests. Declared here so the flag is a
   * real, validated profile setting. Defaults to false (veto window only).
   */
  requireCheckpoint: z.boolean().default(false),
  /**
   * May the loop push branches / open PRs at all?
   *
   * Defaults to true: once a profile is bound to a real repo, reading it and
   * drafting a proposed change is the point. Set false for a repo the loop may
   * only READ (audit + scorecard + gap analysis, no writes). Pausing a real run
   * is done with `requireCheckpoint`, and blocking the irreversible step is
   * done with `autoMergeEnabled`.
   */
  proposeEnabled: z.boolean().default(true),
});
export type RepoBindingT = z.infer<typeof RepoBinding>;

export const BusinessProfile = z.object({
  business: BusinessIdentity,
  customer: Customer,
  offering: Offering,
  gaps: z.array(z.string().min(1).max(300)).min(0).max(20),
  voiceAndBrand: VoiceAndBrand.optional(),
  lastReviewedAt: z.string().datetime().optional(),
  repo: RepoBinding.optional(),
});
export type BusinessProfileT = z.infer<typeof BusinessProfile>;

// --- Repo binding helpers ---------------------------------------------------

export function repoBinding(profile: BusinessProfileT): RepoBindingT | null {
  return profile.repo ?? null;
}

export function isAutoMergeEnabled(profile: BusinessProfileT): boolean {
  return profile.repo?.autoMergeEnabled ?? false;
}

/**
 * May the loop push branches and open PRs for this profile?
 *
 * Distinct from `isAutoMergeEnabled`: that one gates the irreversible merge,
 * this one gates writing to the remote at all. A read-only binding
 * (`proposeEnabled: false`) still audits and scores, and still finds gaps — it
 * just never opens a PR.
 */
export function isProposeEnabled(profile: BusinessProfileT): boolean {
  return profile.repo?.proposeEnabled ?? true;
}

export function isKillSwitchActive(): boolean {
  const val = String(process.env.RECOURSE_AUTOPILOT_DISABLED ?? '').trim().toLowerCase();
  return val === '1' || val === 'true' || val === 'yes';
}

// --- File I/O ---------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';

export const BUSINESS_PROFILES_DIR = 'data/business-profiles';
export const DEFAULT_CHECKPOINTS_DIR = 'data/business-profiles';

export class BusinessProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BusinessProfileError';
  }
}

export function listBusinessSlugs(profilesDir: string = BUSINESS_PROFILES_DIR): string[] {
  if (!fs.existsSync(profilesDir)) return [];
  return fs
    .readdirSync(profilesDir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map((f) => f.replace(/\.ya?ml$/, ''))
    .sort();
}

export function loadBusinessProfile(
  slug: string,
  profilesDir: string = BUSINESS_PROFILES_DIR,
): BusinessProfileT {
  const filename = slug.endsWith('.yaml') || slug.endsWith('.yml') ? slug : `${slug}.yaml`;
  const filePath = path.join(profilesDir, filename);

  if (!fs.existsSync(filePath)) {
    throw new BusinessProfileError(
      `Business profile not found: ${filePath}. Author data/business-profiles/<name>.yaml first.`,
    );
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  let parsed: unknown;
  try {
    parsed = yaml.parse(raw);
  } catch (err) {
    throw new BusinessProfileError(
      `Failed to parse ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const result = BusinessProfile.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new BusinessProfileError(`Invalid business profile ${filePath}:\n${issues}`);
  }
  return result.data;
}

export function profileIsStale(
  profile: BusinessProfileT,
  maxAgeDays: number = 30,
  now: Date = new Date(),
): boolean {
  if (!profile.lastReviewedAt) return true;
  const reviewed = new Date(profile.lastReviewedAt);
  const ageMs = now.getTime() - reviewed.getTime();
  return ageMs > maxAgeDays * 24 * 60 * 60 * 1000;
}
