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
import type { Directive } from '../dream/learner-types';
import type { ToolDomain } from '../dream/types';
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
 * Which ToolDomain each scorecard dimension belongs to.
 *
 * A gap produced from a scorecard dimension had NO domain before this. That
 * made cross-domain work impossible: the synergy engine speaks ToolDomains
 * (`coding`, `math`, `systemic`, ...) and the gap carried only dimension names
 * (`codeQuality`, `securityPosture`, ...), so no gap could ever be paired and a
 * resolver could only ever return zero pairs. These are judgement calls and are
 * labelled as such; a profile-declared gap additionally carries every domain its
 * own text mentions, which is the stronger signal when there is one.
 */
const DIMENSION_DOMAINS: Record<string, ToolDomain> = {
  codeQuality: 'coding',
  securityPosture: 'cyber_defense',
  testCoverage: 'coding',
  documentationCompleteness: 'systemic',
  marketSignals: 'systemic',
  complianceMaturity: 'cyber_defense',
  webPresence: 'systemic',
  profileGapCoverage: 'systemic',
};

const ALL_TOOL_DOMAINS: ToolDomain[] = [
  'coding', 'math', 'biotech', 'systemic', 'cyber_defense', 'neuro_symbolic', 'quantum_sim',
];

/** Every ToolDomain whose name (or stem) appears in `text`. */
function domainsMentionedIn(text: string): ToolDomain[] {
  const lower = text.toLowerCase();
  const out: ToolDomain[] = [];
  for (const d of ALL_TOOL_DOMAINS) {
    // `cyber_defense` reads naturally as "cyber defense"; accept both spellings.
    const spellings = [d, d.replace(/_/g, ' '), d.replace(/_/g, '')];
    if (spellings.some((s) => lower.includes(s.toLowerCase()))) out.push(d);
  }
  return out;
}

/** The domains a gap belongs to: its dimension's, plus any its text mentions. */
export function domainsForGap(gap: GapT): ToolDomain[] {
  const out = new Set<ToolDomain>();
  for (const dim of gap.affectedDimensions) {
    const d = DIMENSION_DOMAINS[dim];
    if (d) out.add(d);
  }
  for (const d of domainsMentionedIn(`${gap.id} ${gap.description}`)) out.add(d);
  return [...out];
}

/**
 * A cross-domain synergy pair: two gaps whose domains each have open work, where
 * closing one with the other's machinery is worth more than either alone.
 */
export interface SynergyPair {
  /** Gap id from the first domain. */
  a: string;
  /** Gap id from the second domain. */
  b: string;
  /** Human-readable domain labels for `a` and `b`. */
  domainA: string;
  domainB: string;
  /** The synergy engine's own 0..1 transfer score, already measured. */
  score: number;
  /** One line naming WHY these two, so a composite gap is never a black box. */
  rationale: string;
}

/** Domains a composite gap is attributed to. */
const COMPOSITE_DIMENSIONS = ['crossDomain'];

/**
 * scoreGap(gap, weights) — weighted multi-signal score. Pure: gap state in,
 * number out. Returns the raw score; callers clamp to [0, 1].
 *
 * `directives` come from the recursive learner (`deriveDirectives`). They are an
 * ADDITIVE nudge, not a veto: a directive naming a domain raises the gaps in it
 * so the learner can steer what the loop works on next. They used to be emitted
 * for the UI and two other consumers while the gap ranking — the only thing
 * that decides what gets built — never saw them.
 */
export function scoreGap(gap: GapT, weights: GapWeightT, directives: Directive[] = []): number {
  const base =
    weights.auditSignal * Math.min(1, gap.auditMentions / MAX_AUDIT_MENTIONS) +
    weights.profileSignal * (gap.profileDeclared ? 1 : 0) +
    weights.fixability * gap.fixability -
    weights.risk * gap.risk;
  return base + directiveBoost(gap, directives);
}

/**
 * How much a directive raises a gap in its target domain.
 *
 * Severity-ordered, mirroring the learner's own triage order (retire first,
 * amplify last): a gap in a domain the learner wants to retire is pushed DOWN,
 * and one in a domain it wants to amplify is pushed UP. `w` is small on
 * purpose — a directive must reorder gaps of comparable score, not manufacture a
 * gap out of nothing.
 */
function directiveBoost(gap: GapT, directives: Directive[]): number {
  if (directives.length === 0) return 0;
  const w = 0.05;
  const strongest = new Map<string, number>();
  for (const d of directives) {
    const domain = d.targetDomain;
    if (!domain) continue;
    const bump = d.kind === 'amplify' ? w : d.kind === 'retire' ? -w : 0;
    if (bump === 0) continue;
    const prior = strongest.get(domain) ?? 0;
    // The strongest signal for a domain wins; they do not stack, so a learner
    // that emits twenty directives cannot add up to a 1.0 boost.
    if (Math.abs(bump) > Math.abs(prior)) strongest.set(domain, bump);
  }
  let boost = 0;
  for (const d of gap.affectedDimensions) boost += strongest.get(d) ?? 0;
  return boost;
}

/** Which directives (if any) boosted this gap, for the run report. */
export function directivesFor(gap: GapT, directives: Directive[]): Directive[] {
  if (directives.length === 0) return [];
  const domains = new Set(gap.affectedDimensions);
  return directives.filter((d) => d.targetDomain && domains.has(d.targetDomain));
}

export interface AnalyzeGapsOptions {
  weights?: GapWeightT;
  /** The recursive learner's current directives. */
  directives?: Directive[];
  /**
   * Cross-domain synergy resolver.
   *
   * SYNCHRONOUS by necessity: `analyzeGaps` sits mid-pipeline and returns a
   * sealed zod object, so it cannot await. The resolver therefore reads state
   * that already exists (the persisted synergy map), not something it fetches.
   * A resolver that returns a promise is ignored and this warns — the composite
   * gaps would otherwise silently not exist.
   */
  synergy?: (gaps: GapT[]) => SynergyPair[];
  /** How many composite gaps to admit at most. */
  maxCompositeGaps?: number;
}

/**
 * Build the composite gaps for the pairs the synergy engine reported.
 *
 * Scored at `scoreGap(...) * 1.25` and clamped, on the evidence that a gap
 * which two domains can both close is worth more than either alone. The
 * rationale travels on the gap so the run report can name which directive or
 * pair produced it.
 */
export function buildCompositeGaps(
  gaps: GapT[],
  pairs: SynergyPair[],
  weights: GapWeightT,
  directives: Directive[],
): GapT[] {
  const byId = new Map(gaps.map((g) => [g.id, g]));
  const out: GapT[] = [];
  const seen = new Set<string>();
  for (const pair of pairs) {
    const a = byId.get(pair.a);
    const b = byId.get(pair.b);
    if (!a || !b) continue;
    if (!Number.isFinite(pair.score) || pair.score <= 0) continue;
    const id = `syn:${pair.a}+${pair.b}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const draft: GapT = {
      ...a,
      id,
      description:
        `Cross-domain: ${a.description} Combine with ${b.id} (${pair.domainB}) — ${pair.rationale}`,
      source: 'both',
      // The strongest of the two tiers decides; a composite is never a downgrade.
      tier: (a.tier === 'A' || b.tier === 'A') ? 'A' : (a.tier === 'B' || b.tier === 'B') ? 'B' : 'C',
      affectedDimensions: [...new Set([...a.affectedDimensions, ...b.affectedDimensions, ...COMPOSITE_DIMENSIONS])],
      estimatedScoreDelta: Math.round((a.estimatedScoreDelta + b.estimatedScoreDelta) * 1.25),
    };
    out.push({
      ...draft,
      priorityScore: clamp01(scoreGap(draft, weights, directives) * COMPOSITE_BONUS),
    });
  }
  return out;
}

/** A cross-domain gap is worth more than either half, but not unboundedly. */
export const COMPOSITE_BONUS = 1.25;

/**
 * analyzeGaps(scorecard, profile, weights?, opts?) — build, score, rank and seal
 * an UpgradeQueue. Deterministic: no LLM, no randomness, weights default to
 * DEFAULT_GAP_WEIGHTS. Sort: priorityScore desc, then fixability desc.
 *
 * `weights` stays a positional third argument because that is the existing
 * signature; `opts` is new and additive.
 */
export function analyzeGaps(
  scorecard: BusinessScorecardT,
  profile: BusinessProfileT,
  weights: GapWeightT = DEFAULT_GAP_WEIGHTS,
  opts: AnalyzeGapsOptions = {},
): UpgradeQueueT {
  const effectiveWeights = GapWeight.parse(opts.weights ?? weights);
  const directives = opts.directives ?? [];
  const scored = buildGaps(scorecard, profile).map((gap) => ({
    ...gap,
    priorityScore: clamp01(scoreGap(gap, effectiveWeights, directives)),
  }));
  // Composite gaps go to the planner with BOTH domains' repo context, so the
  // ranked slice below is computed against the composite drafts too.
  let pairs: SynergyPair[] = [];
  if (opts.synergy) {
    try {
      const out = opts.synergy(scored);
      if (Array.isArray(out)) {
        pairs = out;
      } else {
        console.warn('[gapAnalyzer] synergy resolver did not return an array; no composite gaps this run');
      }
    } catch (err) {
      // A resolver that throws must not cost the run its ordinary gaps, but it
      // must be visible: a silent fallback is how cross-domain work quietly
      // stops happening without anyone noticing.
      console.warn(`[gapAnalyzer] synergy resolver failed, continuing without composite gaps: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const composite = buildCompositeGaps(scored, pairs, effectiveWeights, directives);
  const keptComposite = composite
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, Math.max(0, opts.maxCompositeGaps ?? 3));

  const gaps = [...scored, ...keptComposite].sort(
    (a, b) => b.priorityScore - a.priorityScore || b.fixability - a.fixability,
  );
  return UpgradeQueue.parse({
    businessSlug: scorecard.businessSlug,
    generatedAt: new Date().toISOString(),
    scorecardSnapshot: scorecard,
    gaps,
    weights: effectiveWeights,
  });
}
