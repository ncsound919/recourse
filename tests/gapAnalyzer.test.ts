import { describe, it, expect } from 'vitest';
import {
  BusinessScorecard,
  GapWeight,
  UpgradeQueue,
  DEFAULT_GAP_WEIGHTS,
  type BusinessScorecardT,
  type GapWeightT,
  type UpgradeQueueT,
} from '../src/autopilot/loopTypes';
import { BusinessProfile, type BusinessProfileT } from '../src/autopilot/businessProfile';
import { analyzeGaps, buildGaps, scoreGap } from '../src/autopilot/gapAnalyzer';

const DIMENSIONS: (keyof BusinessScorecardT)[] = [
  'codeQuality',
  'securityPosture',
  'testCoverage',
  'documentationCompleteness',
  'marketSignals',
  'complianceMaturity',
  'webPresence',
  'profileGapCoverage',
];

function makeScorecard(
  auditorsUsed: string[],
  dims: Partial<Record<(typeof DIMENSIONS)[number], number>>,
  businessSlug = 'test-biz',
): BusinessScorecardT {
  const base: Record<string, number> = {};
  for (const dim of DIMENSIONS) {
    base[dim] = 80;
  }
  for (const [dim, value] of Object.entries(dims)) {
    base[dim] = value!;
  }
  return BusinessScorecard.parse({
    businessSlug,
    auditedAt: '2026-09-04T00:00:00.000Z',
    auditorsUsed,
    auditorsExcluded: [],
    ...base,
    valuationEstimate: 0,
    overallScore: 700,
    gradeCategory: 'B',
    findingsCount: 0,
    criticalFindings: 0,
    highFindings: 0,
  });
}

function makeProfile(gaps: string[]): BusinessProfileT {
  return BusinessProfile.parse({
    business: {
      name: 'TestBiz',
      tagline: 'Tagline',
      industry: 'Test',
      website: '',
      stage: 'idea',
    },
    customer: {
      icp: 'Test ICP',
      segments: [{ name: 'Seg', pain: 'Pain' }],
      buyingTrigger: 'Trigger',
      topObjections: ['Obj'],
    },
    offering: {
      summary: 'Summary',
      pricing: '$0',
      model: 'free',
      differentiators: ['Diff'],
    },
    gaps,
  });
}

describe('gap analyzer — candidate building', () => {
  it('profile-declared gaps become candidates with profileDeclared true and source profile', () => {
    const scorecard = makeScorecard(['grader', 'codegang'], {});
    const declared = [
      'No changelog or release notes',
      'No landing page explaining what we do',
    ];
    const profile = makeProfile(declared);
    const queue = analyzeGaps(scorecard, profile);

    expect(queue.gaps).toHaveLength(declared.length);
    queue.gaps.forEach((gap, i) => {
      expect(gap.source).toBe('profile');
      expect(gap.profileDeclared).toBe(true);
      expect(gap.description).toBe(declared[i]);
      expect(gap.auditMentions).toBe(0);
      expect(gap.affectedDimensions).toEqual([]);
    });
    expect(queue.weights).toEqual(DEFAULT_GAP_WEIGHTS);
  });

  it('a codeQuality below threshold with signal yields an audit gap in tier A', () => {
    const scorecard = makeScorecard(['grader', 'codegang'], { codeQuality: 35 });
    const profile = makeProfile([]);
    const queue = analyzeGaps(scorecard, profile);

    expect(queue.gaps).toHaveLength(1);
    const gap = queue.gaps[0];
    expect(gap.source).toBe('audit');
    expect(gap.profileDeclared).toBe(false);
    expect(gap.tier).toBe('A');
    expect(gap.fixability).toBeCloseTo(0.8);
    expect(gap.description).toBe('Code quality below threshold (35/100)');
    expect(gap.affectedDimensions).toContain('codeQuality');
    expect(gap.auditMentions).toBe(1);
  });

  it('suppresses phantom dimension gaps when auditors barely ran', () => {
    const scorecard = makeScorecard(['grader'], {
      codeQuality: 0,
      securityPosture: 0,
      testCoverage: 0,
      documentationCompleteness: 0,
      marketSignals: 0,
      complianceMaturity: 0,
      webPresence: 0,
      profileGapCoverage: 0,
    });
    const profile = makeProfile([]);
    const queue = analyzeGaps(scorecard, profile);

    expect(queue.gaps).toHaveLength(0);
  });

  it('dedupes a profile gap that matches an audit gap into a single both gap', () => {
    const scorecard = makeScorecard(['grader', 'codegang'], { webPresence: 20 });
    const profile = makeProfile(['No public website']);
    const queue = analyzeGaps(scorecard, profile);

    expect(queue.gaps).toHaveLength(1);
    const gap = queue.gaps[0];
    expect(gap.source).toBe('both');
    expect(gap.profileDeclared).toBe(true);
    expect(gap.auditMentions).toBeGreaterThanOrEqual(1);
    expect(gap.affectedDimensions).toContain('webPresence');
    expect(gap.description).toContain('Web presence');
  });
});

describe('gap analyzer — scoring & ordering', () => {
  it('ranks a profile-declared, high-fixability gap above a low-signal audit gap', () => {
    const scorecard = makeScorecard(['grader', 'codegang'], {
      securityPosture: 20,
      codeQuality: 90,
    });
    const profile = makeProfile(['Refactor the messy untyped code in the core modules']);
    const queue = analyzeGaps(scorecard, profile);

    expect(queue.gaps).toHaveLength(2);
    const [profileGap, auditGap] = queue.gaps;

    expect(profileGap.source).toBe('profile');
    expect(profileGap.profileDeclared).toBe(true);
    expect(profileGap.fixability).toBeCloseTo(0.8);
    expect(auditGap.source).toBe('audit');
    expect(auditGap.auditMentions).toBe(1);

    expect(profileGap.priorityScore).toBeGreaterThan(auditGap.priorityScore);
    expect(profileGap.priorityScore).toBeGreaterThan(0.3);
  });

  it('honors a custom weight set: auditSignal 1.0 lets the audit gap outrank the profile gap', () => {
    const scorecard = makeScorecard(['grader', 'codegang'], {
      securityPosture: 20,
      codeQuality: 90,
    });
    const profile = makeProfile(['Refactor the messy untyped code in the core modules']);
    const weights: GapWeightT = {
      auditSignal: 1,
      profileSignal: 0,
      fixability: 0,
      risk: 0,
    };
    const queue = analyzeGaps(scorecard, profile, weights);

    expect(queue.gaps).toHaveLength(2);
    expect(queue.gaps[0].source).toBe('audit');
    expect(queue.gaps[0].priorityScore).toBeGreaterThan(queue.gaps[1].priorityScore);
    expect(queue.gaps[1].priorityScore).toBe(0);
    expect(queue.weights).toEqual(GapWeight.parse(weights));
  });
});

describe('gap analyzer — output integrity', () => {
  it('parses as a valid UpgradeQueue and snapshots the scorecard', () => {
    const scorecard = makeScorecard(['grader', 'codegang', 'deep'], {
      codeQuality: 40,
      webPresence: 45,
    });
    const profile = makeProfile(['No changelog or release notes']);
    const queue = analyzeGaps(scorecard, profile);

    expect(UpgradeQueue.safeParse(queue).success).toBe(true);
    expect(queue.businessSlug).toBe(scorecard.businessSlug);
    expect(queue.scorecardSnapshot).toEqual(scorecard);
    expect(queue.gaps.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps every priorityScore within [0, 1] even under adversarial weights', () => {
    const scorecard = makeScorecard(['grader', 'codegang'], {
      codeQuality: 30,
      securityPosture: 25,
      webPresence: 40,
    });
    const profile = makeProfile([
      'Refactor the messy untyped code in the core modules',
      'No changelog or release notes',
    ]);
    const queues: UpgradeQueueT[] = [
      analyzeGaps(scorecard, profile),
      analyzeGaps(scorecard, profile, {
        auditSignal: 0,
        profileSignal: 0,
        fixability: 0,
        risk: 1,
      }),
      analyzeGaps(scorecard, profile, {
        auditSignal: 1,
        profileSignal: 1,
        fixability: 1,
        risk: 1,
      }),
    ];

    for (const queue of queues) {
      expect(queue.gaps.length).toBeGreaterThan(0);
      for (const gap of queue.gaps) {
        expect(gap.priorityScore).toBeGreaterThanOrEqual(0);
        expect(gap.priorityScore).toBeLessThanOrEqual(1);
      }
    }
  });

  it('exports pure helpers that agree with the analyzer (scoreGap / buildGaps)', () => {
    const scorecard = makeScorecard(['grader', 'codegang'], { codeQuality: 35 });
    const profile = makeProfile(['No landing page explaining what we do']);
    const built = buildGaps(scorecard, profile);

    expect(built.every((gap) => gap.priorityScore === 0)).toBe(true);
    expect(built.some((gap) => gap.source === 'audit')).toBe(true);
    expect(built.some((gap) => gap.source === 'profile')).toBe(true);

    const auditGap = built.find((gap) => gap.source === 'audit')!;
    const manual = scoreGap(auditGap, DEFAULT_GAP_WEIGHTS);
    const queue = analyzeGaps(scorecard, profile);
    const scoredAudit = queue.gaps.find((gap) => gap.id === auditGap.id)!;
    expect(Math.max(0, Math.min(1, manual))).toBeCloseTo(scoredAudit.priorityScore);
  });
});
