/**
 * Quality Tier Router — maps an artifact type to a quality tier (A, B, or C)
 * and produces the gate behavior for each tier.
 *
 * Tier A (auto): code, tools, calculators. Decision authority is the Recourse
 *   sandbox verifier. Pass = deployable. Fail = retry or quarantine.
 * Tier B (staged): landing pages, FAQ, comparison, blog drafts. Decision
 *   authority is a human reviewing the rendered HTML before publish.
 *   Generator must always include a REVIEW_REQUIRED.md marker.
 * Tier C (human): strategy memos, positioning options, pricing hypotheses,
 *   GTM plans. Decision authority is always a human. No auto-deploy path
 *   exists. Generator includes a DISCLAIMER.md marker.
 */

import { z } from 'zod';

export const ArtifactKind = z.enum([
  // Tier A
  'internal_tool',
  'roi_calculator',
  'scoring_tool',
  'self_hosted_module',
  // Tier B
  'landing_page',
  'faq_page',
  'comparison_page',
  'blog_draft',
  'seo_content',
  // Tier C
  'strategy_memo',
  'positioning_options',
  'pricing_hypothesis',
  'gtm_plan',
  'content_calendar',
  // Unknown — explicit for guardrails
  'unknown',
]);
export type ArtifactKindT = z.infer<typeof ArtifactKind>;

export const QualityTier = z.enum(['A', 'B', 'C']);
export type QualityTierT = z.infer<typeof QualityTier>;

export interface TierBehavior {
  tier: QualityTierT;
  decisionAuthority: string;
  autoDeploy: boolean;
  requiredMarkers: string[];
  maxRetries: number;
  notes: string;
}

const TIER_A_BEHAVIOR: TierBehavior = {
  tier: 'A',
  decisionAuthority: 'sandbox_verifier',
  autoDeploy: true,
  requiredMarkers: ['VERIFIED.md'],
  maxRetries: 3,
  notes: 'Passes the Recourse sandbox + property-based tests. Result is deployable as-is to output/.',
};

const TIER_B_BEHAVIOR: TierBehavior = {
  tier: 'B',
  decisionAuthority: 'human_review',
  autoDeploy: false,
  requiredMarkers: ['REVIEW_REQUIRED.md'],
  maxRetries: 2,
  notes: 'Human reviews the rendered HTML before any deploy. Generator must include explicit REVIEW_REQUIRED.md marker so the operator cannot miss it.',
};

const TIER_C_BEHAVIOR: TierBehavior = {
  tier: 'C',
  decisionAuthority: 'human_only',
  autoDeploy: false,
  requiredMarkers: ['DISCLAIMER.md', 'NO_AUTO_DEPLOY.md'],
  maxRetries: 1,
  notes: 'Strategy artifacts are never auto-deployable. The router refuses to surface any auto-deploy path for tier C, even if called by an internal loop.',
};

// Static mapping: artifact kind -> tier
const ARTIFACT_TIER_MAP: Record<ArtifactKindT, QualityTierT> = {
  // Tier A
  internal_tool: 'A',
  roi_calculator: 'A',
  scoring_tool: 'A',
  self_hosted_module: 'A',
  // Tier B
  landing_page: 'B',
  faq_page: 'B',
  comparison_page: 'B',
  blog_draft: 'B',
  seo_content: 'B',
  // Tier C
  strategy_memo: 'C',
  positioning_options: 'C',
  pricing_hypothesis: 'C',
  gtm_plan: 'C',
  content_calendar: 'C',
  // Unknown — falls into C (safest tier)
  unknown: 'C',
};

export function tierFor(kind: ArtifactKindT): QualityTierT {
  return ARTIFACT_TIER_MAP[kind];
}

export function behaviorFor(tier: QualityTierT): TierBehavior {
  switch (tier) {
    case 'A':
      return TIER_A_BEHAVIOR;
    case 'B':
      return TIER_B_BEHAVIOR;
    case 'C':
      return TIER_C_BEHAVIOR;
  }
}

export function classifyAndBehave(kind: ArtifactKindT): {
  kind: ArtifactKindT;
  tier: QualityTierT;
  behavior: TierBehavior;
} {
  const tier = tierFor(kind);
  return { kind, tier, behavior: behaviorFor(tier) };
}

export interface AutoDeployCheck {
  allowed: boolean;
  reason: string;
}

export function checkAutoDeploy(kind: ArtifactKindT): AutoDeployCheck {
  const { tier, behavior } = classifyAndBehave(kind);
  if (behavior.autoDeploy) {
    return { allowed: true, reason: `Tier ${tier} artifacts are auto-deployable. ${behavior.notes}` };
  }
  return {
    allowed: false,
    reason: `Tier ${tier} artifacts (${kind}) are NEVER auto-deployable. ${behavior.notes}`,
  };
}

export function listByTier(tier: QualityTierT): ArtifactKindT[] {
  return (Object.entries(ARTIFACT_TIER_MAP) as [ArtifactKindT, QualityTierT][])
    .filter(([, t]) => t === tier)
    .map(([k]) => k);
}

export function isUnknown(kind: string): boolean {
  return !ArtifactKind.safeParse(kind).success;
}
