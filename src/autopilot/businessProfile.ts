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

export const BusinessProfile = z.object({
  business: BusinessIdentity,
  customer: Customer,
  offering: Offering,
  gaps: z.array(z.string().min(1).max(300)).min(0).max(20),
  voiceAndBrand: VoiceAndBrand.optional(),
  lastReviewedAt: z.string().datetime().optional(),
});
export type BusinessProfileT = z.infer<typeof BusinessProfile>;

// --- File I/O ---------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';

export const BUSINESS_PROFILES_DIR = 'data/business-profiles';

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
