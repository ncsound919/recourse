import { describe, it, expect } from 'vitest';
import {
  ArtifactKind,
  type ArtifactKindT,
  type QualityTierT,
  tierFor,
  behaviorFor,
  classifyAndBehave,
  checkAutoDeploy,
  listByTier,
  isUnknown,
} from '../src/autopilot/qualityTier';

describe('Quality Tier Router', () => {
  describe('tier mapping', () => {
    it('maps code artifacts to tier A', () => {
      expect(tierFor('internal_tool')).toBe('A');
      expect(tierFor('roi_calculator')).toBe('A');
      expect(tierFor('scoring_tool')).toBe('A');
      expect(tierFor('self_hosted_module')).toBe('A');
    });

    it('maps customer-facing content to tier B', () => {
      expect(tierFor('landing_page')).toBe('B');
      expect(tierFor('faq_page')).toBe('B');
      expect(tierFor('comparison_page')).toBe('B');
      expect(tierFor('blog_draft')).toBe('B');
      expect(tierFor('seo_content')).toBe('B');
    });

    it('maps strategy artifacts to tier C', () => {
      expect(tierFor('strategy_memo')).toBe('C');
      expect(tierFor('positioning_options')).toBe('C');
      expect(tierFor('pricing_hypothesis')).toBe('C');
      expect(tierFor('gtm_plan')).toBe('C');
      expect(tierFor('content_calendar')).toBe('C');
    });

    it('falls back to tier C for unknown kinds (safest tier)', () => {
      expect(tierFor('unknown')).toBe('C');
    });

    it('is exhaustive over all declared artifact kinds', () => {
      const allKinds = ArtifactKind.options;
      const tiers: Set<QualityTierT> = new Set();
      for (const kind of allKinds) {
        tiers.add(tierFor(kind as ArtifactKindT));
      }
      // All three tiers are represented
      expect(tiers.has('A')).toBe(true);
      expect(tiers.has('B')).toBe(true);
      expect(tiers.has('C')).toBe(true);
    });
  });

  describe('tier behavior', () => {
    it('tier A: auto-deploy with sandbox verifier as authority', () => {
      const b = behaviorFor('A');
      expect(b.decisionAuthority).toBe('sandbox_verifier');
      expect(b.autoDeploy).toBe(true);
      expect(b.requiredMarkers).toContain('VERIFIED.md');
      expect(b.maxRetries).toBeGreaterThanOrEqual(1);
    });

    it('tier B: staged, human reviews, REVIEW_REQUIRED.md marker', () => {
      const b = behaviorFor('B');
      expect(b.decisionAuthority).toBe('human_review');
      expect(b.autoDeploy).toBe(false);
      expect(b.requiredMarkers).toContain('REVIEW_REQUIRED.md');
    });

    it('tier C: never auto-deployable, both DISCLAIMER + NO_AUTO_DEPLOY markers', () => {
      const b = behaviorFor('C');
      expect(b.decisionAuthority).toBe('human_only');
      expect(b.autoDeploy).toBe(false);
      expect(b.requiredMarkers).toContain('DISCLAIMER.md');
      expect(b.requiredMarkers).toContain('NO_AUTO_DEPLOY.md');
    });
  });

  describe('classifyAndBehave', () => {
    it('returns kind, tier, and behavior in one call', () => {
      const out = classifyAndBehave('landing_page');
      expect(out.kind).toBe('landing_page');
      expect(out.tier).toBe('B');
      expect(out.behavior.tier).toBe('B');
    });
  });

  describe('checkAutoDeploy (the safety gate)', () => {
    it('allows tier A artifacts to auto-deploy', () => {
      expect(checkAutoDeploy('internal_tool').allowed).toBe(true);
      expect(checkAutoDeploy('roi_calculator').allowed).toBe(true);
    });

    it('REFUSES to auto-deploy tier B artifacts even when called from a loop', () => {
      const check = checkAutoDeploy('landing_page');
      expect(check.allowed).toBe(false);
      expect(check.reason).toMatch(/NEVER auto-deployable/);
    });

    it('REFUSES to auto-deploy tier C strategy artifacts', () => {
      const check = checkAutoDeploy('strategy_memo');
      expect(check.allowed).toBe(false);
      expect(check.reason).toMatch(/NEVER auto-deployable/);
    });

    it('REFUSES to auto-deploy unknown artifact types', () => {
      const check = checkAutoDeploy('unknown');
      expect(check.allowed).toBe(false);
    });
  });

  describe('listByTier', () => {
    it('returns all kinds for tier A', () => {
      const a = listByTier('A');
      expect(a).toContain('internal_tool');
      expect(a).toContain('roi_calculator');
    });

    it('returns all kinds for tier B', () => {
      const b = listByTier('B');
      expect(b).toContain('landing_page');
      expect(b).toContain('faq_page');
    });

    it('returns all kinds for tier C', () => {
      const c = listByTier('C');
      expect(c).toContain('strategy_memo');
      expect(c).toContain('positioning_options');
    });

    it('A + B + C together equal the full artifact kind set', () => {
      const a = listByTier('A');
      const b = listByTier('B');
      const c = listByTier('C');
      const all = new Set([...a, ...b, ...c]);
      for (const kind of ArtifactKind.options) {
        expect(all.has(kind)).toBe(true);
      }
    });
  });

  describe('isUnknown', () => {
    it('returns true for unrecognized strings', () => {
      expect(isUnknown('definitely_not_a_real_kind')).toBe(true);
    });

    it('returns false for recognized kinds', () => {
      expect(isUnknown('landing_page')).toBe(false);
      expect(isUnknown('strategy_memo')).toBe(false);
    });
  });
});
