import { describe, it, expect, vi } from 'vitest';
import {
  BusinessScorecard,
  GapWeight,
  UpgradeQueue,
  DEFAULT_GAP_WEIGHTS,
  type BusinessScorecardT,
  type GapT,
  type GapWeightT,
  type UpgradeQueueT,
} from '../src/autopilot/loopTypes';
import { BusinessProfile, type BusinessProfileT } from '../src/autopilot/businessProfile';
import {
  analyzeGaps,
  buildGaps,
  directivesFor,
  domainsForGap,
  scoreGap,
  type SynergyPair,
} from '../src/autopilot/gapAnalyzer';
import type { Directive } from '../src/dream/learner-types';

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

describe('learner directives steer gap ranking', () => {
  function directive(over: Partial<Directive>): Directive {
    return {
      id: 'dir_test', kind: 'amplify', geneName: 'g', reason: 'r', episode: 1,
      targetDomain: 'codeQuality' as never, ...over,
    };
  }

  it('a high-priority directive reorders two otherwise equal gaps', () => {
    // Two gaps with IDENTICAL weight inputs, differing only in domain.
    const mk = (id: string, dim: string) => ({
      id, description: 'x', source: 'audit' as const, auditMentions: 2,
      profileDeclared: false, fixability: 0.5, risk: 0.3, tier: 'A' as const,
      affectedDimensions: [dim], estimatedScoreDelta: 0, priorityScore: 0,
    });
    const a = mk('a', 'codeQuality');
    const b = mk('b', 'securityPosture');
    // Equal on their own.
    expect(scoreGap(a, DEFAULT_GAP_WEIGHTS)).toBeCloseTo(scoreGap(b, DEFAULT_GAP_WEIGHTS));

    const boosted = [directive({ targetDomain: 'securityPosture' as never })];
    const aWith = scoreGap(a, DEFAULT_GAP_WEIGHTS, boosted);
    const bWith = scoreGap(b, DEFAULT_GAP_WEIGHTS, boosted);
    expect(bWith).toBeGreaterThan(aWith);
    // And the gap left alone is exactly where it started.
    expect(aWith).toBeCloseTo(scoreGap(a, DEFAULT_GAP_WEIGHTS));
  });

  it('a retire directive pushes its domain DOWN', () => {
    const gap = {
      id: 'g', description: 'x', source: 'audit' as const, auditMentions: 2,
      profileDeclared: false, fixability: 0.5, risk: 0.3, tier: 'A' as const,
      affectedDimensions: ['securityPosture'], estimatedScoreDelta: 0, priorityScore: 0,
    };
    const base = scoreGap(gap, DEFAULT_GAP_WEIGHTS);
    const withRetire = scoreGap(gap, DEFAULT_GAP_WEIGHTS, [
      directive({ kind: 'retire', targetDomain: 'securityPosture' as never }),
    ]);
    expect(withRetire).toBeLessThan(base);
  });

  it('a directive for another domain does not move this gap at all', () => {
    const gap = {
      id: 'g', description: 'x', source: 'audit' as const, auditMentions: 2,
      profileDeclared: false, fixability: 0.5, risk: 0.3, tier: 'A' as const,
      affectedDimensions: ['securityPosture'], estimatedScoreDelta: 0, priorityScore: 0,
    };
    const base = scoreGap(gap, DEFAULT_GAP_WEIGHTS);
    expect(scoreGap(gap, DEFAULT_GAP_WEIGHTS, [directive({ kind: 'retire' })])).toBeCloseTo(base);
  });

  it('many directives in one domain cannot stack into a manufactured score', () => {
    const gap = {
      id: 'g', description: 'x', source: 'audit' as const, auditMentions: 2,
      profileDeclared: false, fixability: 0.5, risk: 0.3, tier: 'A' as const,
      affectedDimensions: ['securityPosture'], estimatedScoreDelta: 0, priorityScore: 0,
    };
    const one = scoreGap(gap, DEFAULT_GAP_WEIGHTS, [directive({})]);
    const twenty = scoreGap(gap, DEFAULT_GAP_WEIGHTS, Array.from({ length: 20 }, (_, i) => directive({ id: `d${i}` })));
    expect(twenty).toBeCloseTo(one);
  });

  it('reaches the ranking through analyzeGaps', () => {
    const scorecard = makeScorecard(['grader', 'codegang'], { codeQuality: 35, securityPosture: 35 });
    const profile = makeProfile([]);
    const plain = analyzeGaps(scorecard, profile);
    const steered = analyzeGaps(scorecard, profile, undefined, {
      directives: [directive({ targetDomain: 'securityPosture' as never })],
    });
    const rank = (q: UpgradeQueueT, id: string) => q.gaps.findIndex((g) => g.id === id);
    expect(rank(steered, 'securityPosture')).toBeLessThan(rank(plain, 'securityPosture'));
  });

  it('reports which directives touched a gap', () => {
    const gap = {
      id: 'g', description: 'x', source: 'audit' as const, auditMentions: 2,
      profileDeclared: false, fixability: 0.5, risk: 0.3, tier: 'A' as const,
      affectedDimensions: ['securityPosture'], estimatedScoreDelta: 0, priorityScore: 0,
    };
    expect(directivesFor(gap, [directive({ targetDomain: 'securityPosture' as never })])).toHaveLength(1);
    expect(directivesFor(gap, [directive({ targetDomain: 'codeQuality' as never })])).toHaveLength(0);
  });
});

describe('domainsForGap', () => {
  const mk = (over: Partial<GapT>): GapT =>
    ({ id: 'g', description: '', source: 'audit', auditMentions: 0, profileDeclared: false,
       fixability: 0.5, risk: 0.3, tier: 'A', affectedDimensions: [], estimatedScoreDelta: 0,
       priorityScore: 0, ...over }) as GapT;

  it('maps scorecard dimensions onto ToolDomains so cross-domain work is possible', () => {
    // Before this, a gap carried only dimension names ('codeQuality') while the
    // synergy engine speaks ToolDomains ('coding'), so no pair could ever form.
    expect(domainsForGap(mk({ affectedDimensions: ['codeQuality'] }))).toContain('coding');
    expect(domainsForGap(mk({ affectedDimensions: ['securityPosture'] }))).toContain('cyber_defense');
    expect(domainsForGap(mk({ affectedDimensions: ['documentationCompleteness'] }))).toContain('systemic');
  });

  it('also picks up a domain named in the gap text, in either spelling', () => {
    expect(domainsForGap(mk({ description: 'Improve the quantum_sim solver' }))).toContain('quantum_sim');
    expect(domainsForGap(mk({ description: 'Improve cyber defense coverage' }))).toContain('cyber_defense');
    expect(domainsForGap(mk({ description: 'nothing domain-like here' }))).toEqual([]);
  });

  it('de-duplicates when the dimension and the text agree', () => {
    const d = domainsForGap(mk({ affectedDimensions: ['codeQuality'], description: 'coding helpers are messy' }));
    expect(d.filter((x) => x === 'coding')).toHaveLength(1);
  });
});

describe('cross-domain composite gaps', () => {
  function twoDomainQueue(): UpgradeQueueT {
    const scorecard = makeScorecard(['grader', 'codegang'], { codeQuality: 40, securityPosture: 40 });
    return analyzeGaps(scorecard, makeProfile([]));
  }

  it('lists a composite gap when two domains have open gaps', () => {
    const queue = analyzeGaps(makeScorecard(['grader', 'codegang'], { codeQuality: 40, securityPosture: 40 }), makeProfile([]), undefined, {
      synergy: (gaps) => {
        // Two domains whose gaps really do exist, matched the way the cron
        // resolver matches them: by ToolDomain, not by dimension name.
        const a = gaps.find((g) => domainsForGap(g).includes('coding'))!;
        const b = gaps.find((g) => domainsForGap(g).includes('cyber_defense'))!;
        return [{
          a: a.id, b: b.id, domainA: 'coding', domainB: 'cyber_defense',
          score: 0.8, rationale: 'engine scored this transfer at 0.80',
        }];
      },
    });
    const composite = queue.gaps.find((g) => g.id.startsWith('syn:'));
    expect(composite).toBeDefined();
    expect(composite!.description).toContain('Cross-domain');
    expect(composite!.description).toContain('0.80');
    // Both dimensions travel on the gap so the planner gets both domains'
    // repo context, plus the marker that says this is cross-domain.
    expect(composite!.affectedDimensions).toEqual(expect.arrayContaining(['codeQuality', 'securityPosture', 'crossDomain']));
  });

  it('does not pair gaps that share no domain with the transfer', () => {
    // The real map on disk pairs coding->quantum_sim and systemic->neuro_symbolic.
    // A queue whose gaps are only coding + cyber_defense must produce nothing,
    // which is the honest answer rather than a fabricated composite.
    const queue = analyzeGaps(makeScorecard(['grader', 'codegang'], { codeQuality: 40, securityPosture: 40 }), makeProfile([]), undefined, {
      synergy: (gaps) => {
        const a = gaps.find((g) => domainsForGap(g).includes('coding'))!;
        return [{ a: a.id, b: 'nonexistent', domainA: 'coding', domainB: 'quantum_sim', score: 1, rationale: 'r' }];
      },
    });
    expect(queue.gaps.some((g) => g.id.startsWith('syn:'))).toBe(false);
  });

  it('scores a composite above the weaker half it is built from', () => {
    const base = twoDomainQueue();
    const pairs = (gaps: typeof base.gaps) => {
      const a = gaps.find((g) => g.affectedDimensions.includes('codeQuality'))!;
      const b = gaps.find((g) => g.affectedDimensions.includes('securityPosture'))!;
      return [{ a: a.id, b: b.id, domainA: 'codeQuality', domainB: 'securityPosture', score: 0.8, rationale: 'r' }];
    };
    const withComposite = analyzeGaps(
      makeScorecard(['grader', 'codegang'], { codeQuality: 40, securityPosture: 40 }),
      makeProfile([]), undefined, { synergy: pairs },
    );
    const composite = withComposite.gaps.find((g) => g.id.startsWith('syn:'))!;
    const weaker = Math.min(
      base.gaps.find((g) => g.id === pairs(base.gaps)[0].a)!.priorityScore,
      base.gaps.find((g) => g.id === pairs(base.gaps)[0].b)!.priorityScore,
    );
    expect(composite.priorityScore).toBeGreaterThanOrEqual(weaker);
  });

  it('never admits more than maxCompositeGaps and ignores pairs naming unknown gaps', () => {
    const scorecard = makeScorecard(['grader', 'codegang'], { codeQuality: 40, securityPosture: 40, testCoverage: 40 });
    const queue = analyzeGaps(scorecard, makeProfile([]), undefined, {
      maxCompositeGaps: 1,
      synergy: (gaps) => {
        const out: SynergyPair[] = [
          { a: 'does-not-exist', b: 'also-missing', domainA: 'x', domainB: 'y', score: 0.9, rationale: 'ghost' },
          ...gaps.slice(0, 4).map((g, i) => ({
            a: g.id, b: gaps[(i + 1) % gaps.length].id,
            domainA: 'a', domainB: 'b', score: 0.9, rationale: `pair ${i}`,
          })),
        ];
        return out;
      },
    });
    expect(queue.gaps.filter((g) => g.id.startsWith('syn:'))).toHaveLength(1);
    expect(queue.gaps.some((g) => g.id === 'does-not-exist')).toBe(false);
  });

  it('a resolver that throws costs the ordinary gaps nothing, and says so', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const plain = twoDomainQueue();
      const thrown = analyzeGaps(makeScorecard(['grader', 'codegang'], { codeQuality: 40, securityPosture: 40 }), makeProfile([]), undefined, {
        synergy: () => { throw new Error('map corrupt'); },
      });
      expect(thrown.gaps.map((g) => g.id)).toEqual(plain.gaps.map((g) => g.id));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('map corrupt'));
    } finally {
      warn.mockRestore();
    }
  });

  it('no resolver means no composite gaps (the default is off)', () => {
    const queue = twoDomainQueue();
    expect(queue.gaps.some((g) => g.id.startsWith('syn:'))).toBe(false);
  });
});
