/**
 * gapAnalyzer.ts — deterministic gap analysis for the recursive audit loop.
 *
 * analyzeGaps(scorecard, profile) reads the normalized BusinessScorecard plus
 * the profile's human-authored `gaps` list and produces a priority-ranked
 * UpgradeQueue. Pure functions only; no LLM.
 *
 * Signal model (honest, deterministic):
 *   - profile signal: an operator declared the gap in data/business-profiles/
 *   - audit signal: a scorecard dimension below threshold (50) corroborates it
 *   - a dimension candidate is only trusted when signal exists: dimensions at
 *     0 with fewer than 2 auditors used are treated as phantom (no auditor ran)
 *     and are NOT surfaced as audit gaps.
 */

import { Gap, GapWeight, UpgradeQueue, DEFAULT_GAP_WEIGHTS } from './loopTypes';
import type {
  BusinessScorecardT,
  GapT,
  GapWeightT,
  UpgradeQueueT,
} from './loopTypes';
import type { BusinessProfileT } from './businessProfile';

// ============================================================================
// Dimension vocabulary & tier routing
// ============================================================================

type DimensionKey =
  | 'codeQuality'
  | 'securityPosture'
  | 'testCoverage'
  | 'documentationCompleteness'
  | 'marketSignals'
  | 'complianceMaturity'
  | 'webPresence'
  | 'profileGapCoverage';

type Tier = GapT['tier'];
type Kind = 'code' | 'content' | 'strategy';

interface DimensionDef {
  key: DimensionKey;
  describe: (value: number) => string;
  tier: Tier;
  fixability: number;
  keywords: readonly string[];
}

const THRESHOLD = 50;
const MAX_AUDIT_MENTIONS = 5;

const FIXABILITY_BY_TIER: Record<Tier, number> = { A: 0.8, B: 0.6, C: 0.3 };
const RISK_AUDIT = 0.3;
const RISK_PROFILE_DECLARED = 0.2;

const DIMENSION_DEFS: readonly DimensionDef[] = [
  {
    key: 'codeQuality',
    describe: (v) => `Code quality below threshold (${v}/100)`,
    tier: 'A',
    fixability: 0.8,
    keywords: [
      'code', 'quality', 'refactor', 'refactoring', 'lint', 'linting',
      'architecture', 'typescript', 'messy', 'untyped', 'legacy', 'deadcode',
      'duplication', 'technical', 'monolith', 'modules', 'bugs', 'functions',
    ],
  },
  {
    key: 'securityPosture',
    describe: (v) => `Security posture below threshold (${v}/100)`,
    tier: 'A',
    fixability: 0.8,
    keywords: [
      'security', 'secure', 'secrets', 'secret', 'vulnerabilities',
      'vulnerable', 'cve', 'passwords', 'authentication', 'tokens',
      'encryption', 'injection', 'csrf', 'xss', 'exploits', 'permissions',
      'oauth',
    ],
  },
  {
    key: 'testCoverage',
    describe: (v) => `Test coverage below threshold (${v}/100)`,
    tier: 'A',
    fixability: 0.8,
    keywords: [
      'test', 'tests', 'testing', 'coverage', 'suite', 'suites', 'jest',
      'vitest', 'unit', 'units', 'mock', 'e2e', 'specs', 'regression',
    ],
  },
  {
    key: 'documentationCompleteness',
    describe: (v) => `Documentation completeness below threshold (${v}/100)`,
    tier: 'B',
    fixability: 0.6,
    keywords: [
      'docs', 'documentation', 'readme', 'changelog', 'changelogs', 'guide',
      'guides', 'wiki', 'comments', 'tutorial', 'examples', 'doc',
    ],
  },
  {
    key: 'marketSignals',
    describe: (v) => `Market signals below threshold (${v}/100)`,
    tier: 'C',
    fixability: 0.3,
    keywords: [
      'market', 'marketing', 'traffic', 'signups', 'leads', 'demand',
      'growth', 'competitors', 'customers', 'conversion', 'distribution',
      'positioning',
    ],
  },
  {
    key: 'complianceMaturity',
    describe: (v) => `Compliance maturity below threshold (${v}/100)`,
    tier: 'C',
    fixability: 0.3,
    keywords: [
      'compliance', 'compliant', 'regulatory', 'regulations', 'gdpr', 'iso',
      'soc2', 'hipaa', 'licenses', 'licensing', 'alcoa', 'certifications',
      'records', 'audit-trail',
    ],
  },
  {
    key: 'webPresence',
    describe: (v) => `Web presence below threshold (${v}/100)`,
    tier: 'B',
    fixability: 0.6,
    keywords: [
      'website', 'web', 'site', 'sites', 'landing', 'online', 'domain',
      'homepage', 'presence', 'hosting', 'pages',
    ],
  },
  {
    key: 'profileGapCoverage',
    describe: (v) => `Profile gap coverage low (${v}/100)`,
    tier: 'C',
    fixability: 0.3,
    keywords: [],
  },
];

const CODE_KEYWORDS: string[] = [
  ...DIMENSION_DEFS.find((d) => d.key === 'codeQuality')!.keywords,
  ...DIMENSION_DEFS.find((d) => d.key === 'securityPosture')!.keywords,
  ...DIMENSION_DEFS.find((d) => d.key === 'testCoverage')!.keywords,
];

const CONTENT_KEYWORDS: string[] = [
  ...DIMENSION_DEFS.find((d) => d.key === 'documentationCompleteness')!.keywords,
  ...DIMENSION_DEFS.find((d) => d.key === 'webPresence')!.keywords,
  'content', 'copy', 'blog', 'newsletter', 'seo',
];

// ============================================================================
// Small text helpers
// ============================================================================

function tokenize(text: string): string[] {
  const unique = new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((t) => t.length > 3),
  );
  return [...unique];
}

function countOverlap(tokens: string[], vocabulary: readonly string[]): number {
  const vocab = new Set(vocabulary);
  return tokens.reduce((n, t) => n + (vocab.has(t) ? 1 : 0), 0);
}

function isPhantom(scorecard: BusinessScorecardT, key: DimensionKey): boolean {
  return scorecard[key] === 0 && scorecard.auditorsUsed.length < 2;
}

function guessKind(text: string): Kind {
  const tokens = tokenize(text);
  if (countOverlap(tokens, CODE_KEYWORDS) > 0) return 'code';
  if (countOverlap(tokens, CONTENT_KEYWORDS) > 0) return 'content';
  return 'strategy';
}

function kindTier(kind: Kind): Tier {
  return kind === 'code' ? 'A' : kind === 'content' ? 'B' : 'C';
}

// ============================================================================
// Gap builders (pre-scoring)
// ============================================================================

type GapSource = GapT['source'];

interface DraftGap {
  id: string;
  description: string;
  source: GapSource;
  auditMentions: number;
  profileDeclared: boolean;
  fixability: number;
  risk: number;
  tier: Tier;
  affectedDimensions: string[];
  estimatedScoreDelta: number;
  priorityScore: number;
}

function auditMentionCount(
  affectedDimensions: string[],
  scorecard: BusinessScorecardT,
): number {
  return affectedDimensions.filter((dim) => scorecard[dim as DimensionKey] < THRESHOLD).length;
}

function dimensionGap(
  def: DimensionDef,
  scorecard: BusinessScorecardT,
  source: Extract<GapSource, 'audit' | 'both'>,
): DraftGap {
  const value = scorecard[def.key];
  const profileDeclared = source === 'both';
  return {
    id: def.key,
    description: def.describe(value),
    source,
    auditMentions: Math.max(1, auditMentionCount([def.key], scorecard)),
    profileDeclared,
    fixability: def.fixability,
    risk: profileDeclared ? RISK_PROFILE_DECLARED : RISK_AUDIT,
    tier: def.tier,
    affectedDimensions: [def.key],
    estimatedScoreDelta: 0,
    priorityScore: 0,
  };
}

function profileGap(text: string, index: number): DraftGap {
  const kind = guessKind(text);
  const tier = kindTier(kind);
  return {
    id: `profile-gap-${index}`,
    description: text,
    source: 'profile',
    auditMentions: 0,
    profileDeclared: true,
    fixability: FIXABILITY_BY_TIER[tier],
    risk: RISK_PROFILE_DECLARED,
    tier,
    affectedDimensions: [],
    estimatedScoreDelta: 0,
    priorityScore: 0,
  };
}

/**
 * buildGaps(scorecard, profile) — synthesize candidates (priorityScore 0):
 *   1. profile.gaps[] as profile-declared candidates
 *   2. scorecard dimensions under threshold as audit candidates (phantom dims
 *      where no auditor produced signal are suppressed)
 * A profile gap that topically matches an under-threshold dimension merges
 * with it (source 'both'); a profile gap that textually shares >= 3 tokens
 * with an existing audit/both candidate description is also merged.
 */
export function buildGaps(
  scorecard: BusinessScorecardT,
  profile: BusinessProfileT,
): GapT[] {
  const lowDims = DIMENSION_DEFS.filter(
    (d) => scorecard[d.key] < THRESHOLD && !isPhantom(scorecard, d.key),
  );

  const claimed = new Set<DimensionKey>();
  const drafts: DraftGap[] = [];

  profile.gaps.forEach((text, index) => {
    const tokens = tokenize(text);
    let best: DimensionDef | null = null;
    let bestOverlap = 0;
    for (const def of lowDims) {
      if (claimed.has(def.key)) continue;
      const overlap = countOverlap(tokens, def.keywords);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        best = def;
      }
    }
    if (best && bestOverlap > 0) {
      claimed.add(best.key);
      drafts.push(dimensionGap(best, scorecard, 'both'));
    } else {
      drafts.push(profileGap(text, index));
    }
  });

  for (const def of lowDims) {
    if (!claimed.has(def.key)) {
      drafts.push(dimensionGap(def, scorecard, 'audit'));
    }
  }

  const merged: DraftGap[] = [];
  for (const draft of drafts) {
    if (draft.source === 'profile') {
      const hit = drafts.find(
        (other) =>
          other !== draft &&
          other.source !== 'profile' &&
          countOverlap(tokenize(draft.description), tokenize(other.description)) >= 3,
      );
      if (hit) {
        hit.source = 'both';
        hit.profileDeclared = true;
        continue;
      }
    }
    merged.push(draft);
  }

  for (const draft of merged) {
    draft.risk = draft.profileDeclared ? RISK_PROFILE_DECLARED : RISK_AUDIT;
    draft.auditMentions =
      draft.source === 'profile'
        ? 0
        : Math.max(1, auditMentionCount(draft.affectedDimensions, scorecard));
  }

  return merged.map((draft) => Gap.parse(draft));
}

// ============================================================================
// Scoring & queue assembly
// ============================================================================

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * scoreGap(gap, weights) — weighted multi-signal score. Pure: gap state in,
 * number out. Returns the raw score; callers clamp to [0, 1].
 */
export function scoreGap(gap: GapT, weights: GapWeightT): number {
  return (
    weights.auditSignal * Math.min(1, gap.auditMentions / MAX_AUDIT_MENTIONS) +
    weights.profileSignal * (gap.profileDeclared ? 1 : 0) +
    weights.fixability * gap.fixability -
    weights.risk * gap.risk
  );
}

/**
 * analyzeGaps(scorecard, profile, weights?) — build, score, rank and seal an
 * UpgradeQueue. Deterministic: no LLM, no randomness, weights default to
 * DEFAULT_GAP_WEIGHTS. Sort: priorityScore desc, then fixability desc.
 */
export function analyzeGaps(
  scorecard: BusinessScorecardT,
  profile: BusinessProfileT,
  weights: GapWeightT = DEFAULT_GAP_WEIGHTS,
): UpgradeQueueT {
  const effectiveWeights = GapWeight.parse(weights);
  const scored = buildGaps(scorecard, profile).map((gap) => ({
    ...gap,
    priorityScore: clamp01(scoreGap(gap, effectiveWeights)),
  }));
  scored.sort(
    (a, b) =>
      b.priorityScore - a.priorityScore || b.fixability - a.fixability,
  );
  return UpgradeQueue.parse({
    businessSlug: scorecard.businessSlug,
    generatedAt: new Date().toISOString(),
    scorecardSnapshot: scorecard,
    gaps: scored,
    weights: effectiveWeights,
  });
}
