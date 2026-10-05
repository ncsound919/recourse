import { describe, it, expect } from 'vitest';
import {
  AUDIT_DEPTH_TIERS,
  auditorsForDepth,
  deepestAudit,
  depthFromSignals,
  openHubPresetForDepth,
  planAuditDepth,
} from '../src/autopilot/auditDepth';
import type { GeneBelief } from '../src/dream/learner-types';

function belief(domain: string, alpha: number, beta: number, meanReward: number): GeneBelief {
  return {
    geneId: `g_${domain}`, geneName: `gene_${domain}`, domain: domain as GeneBelief['domain'],
    alpha, beta, attempts: alpha + beta, meanReward, weight: meanReward, lastEpisode: 1,
  };
}

describe('depthFromSignals', () => {
  it('sends unevaluated domains to maximum depth', () => {
    expect(depthFromSignals({ uncertainty: 0.1, meanReward: 0.95, attempts: 0 })).toBe(4);
    expect(depthFromSignals({ uncertainty: 0.1, meanReward: 0.95, attempts: 1 })).toBe(4);
  });

  it('maps high uncertainty / low reward to deeper audits', () => {
    expect(depthFromSignals({ uncertainty: 0.6, meanReward: 0.9, attempts: 20 })).toBe(4);
    expect(depthFromSignals({ uncertainty: 0.1, meanReward: 0.4, attempts: 20 })).toBe(4);
    expect(depthFromSignals({ uncertainty: 0.35, meanReward: 0.9, attempts: 20 })).toBe(3);
    expect(depthFromSignals({ uncertainty: 0.1, meanReward: 0.6, attempts: 20 })).toBe(3);
    expect(depthFromSignals({ uncertainty: 0.2, meanReward: 0.9, attempts: 20 })).toBe(2);
    expect(depthFromSignals({ uncertainty: 0.05, meanReward: 0.8, attempts: 20 })).toBe(2);
  });

  it('triages a well-evidenced, high-reward domain', () => {
    expect(depthFromSignals({ uncertainty: 0.05, meanReward: 0.95, attempts: 40 })).toBe(1);
  });
});

describe('auditorsForDepth', () => {
  it('returns the tier in stable auditor order', () => {
    // `olympics` is in EVERY tier: it is OpenHub's aggregator suite, so it is the
    // one auditor with a reachable backend at any depth. Depth picks how hard it
    // looks (see openHubPresetForDepth), not whether it looks at all.
    expect(auditorsForDepth(1)).toEqual(['grader', 'olympics']);
    expect(auditorsForDepth(2)).toEqual(['grader', 'reporank', 'olympics']);
    expect(auditorsForDepth(3)).toEqual(['grader', 'reporank', 'deep', 'olympics']);
    // Depth 4 is the full team.
    expect(auditorsForDepth(4)).toEqual(['grader', 'reporank', 'codegang', 'deep', 'olympics']);
  });

  it('never returns an empty team, so a shallow audit is still an audit', () => {
    // The regression this guards: olympics used to be depth-4-only, and the other
    // four slots had no reachable backend, so a depth-1..3 run ended with zero
    // auditors and threw.
    for (const d of [1, 2, 3, 4] as const) {
      expect(auditorsForDepth(d).length, `depth ${d} has no auditors`).toBeGreaterThan(0);
      expect(auditorsForDepth(d, ['olympics'])).toEqual(['olympics']);
    }
  });

  it('intersects with the auditors the caller can actually run', () => {
    expect(auditorsForDepth(3, ['grader', 'deep'])).toEqual(['grader', 'deep']);
    expect(auditorsForDepth(4, ['olympics'])).toEqual(['olympics']);
  });

  it('maps depth onto how hard OpenHub looks, not onto whether', () => {
    expect(openHubPresetForDepth(1)).toBe('quick');
    expect(openHubPresetForDepth(2)).toBe('standard');
    expect(openHubPresetForDepth(3)).toBe('deep');
    expect(openHubPresetForDepth(4)).toBe('release');
    // An unconstrained caller still gets the full sweep.
    expect(openHubPresetForDepth(undefined)).toBe('release');
  });

  it('tiers are additive (each contains the previous)', () => {
    for (const d of [2, 3, 4] as const) {
      for (const id of AUDIT_DEPTH_TIERS[(d - 1) as 1 | 2 | 3]) {
        expect(AUDIT_DEPTH_TIERS[d]).toContain(id);
      }
    }
  });
});

describe('planAuditDepth — recursive learning sets audit depth', () => {
  it('audits the unknown domain deepest and the proven domain shallowest', () => {
    const plan = planAuditDepth({
      geneBeliefs: {
        a: belief('coding', 30, 1, 0.95),   // proven -> depth 1
        b: belief('math', 2, 8, 0.3),       // weak -> depth 4
      },
      directives: [],
    });
    const coding = plan.find((p) => p.domain === 'coding')!;
    const biotech = plan.find((p) => p.domain === 'biotech')!; // no beliefs -> depth 4
    expect(coding.depth).toBe(1);
    expect(biotech.depth).toBe(4);
    // Deepest first.
    expect(plan[0].depth).toBe(4);
    expect(plan[plan.length - 1].depth).toBe(1);
    expect(deepestAudit({ geneBeliefs: {}, directives: [] })!.depth).toBe(4);
  });

  it('carries the tier auditors and a reason on each plan entry', () => {
    const plan = planAuditDepth({ geneBeliefs: { a: belief('coding', 30, 1, 0.95) }, directives: [] });
    for (const p of plan) {
      expect(p.auditors).toEqual(auditorsForDepth(p.depth));
      expect(p.reason).toMatch(/depth \d/);
    }
  });
});
