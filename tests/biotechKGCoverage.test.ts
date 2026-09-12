import { describe, it, expect } from 'vitest';
import {
  CANONICAL_ONCOLOGY_KG,
  validateBiotechClaimAgainstKG,
} from '../src/lib/biotechKnowledgeGraph.js';

describe('biotechKnowledgeGraph — canonical oncology KG', () => {
  it('ships a non-empty canonical graph with consistent ids', () => {
    const entries = Object.values(CANONICAL_ONCOLOGY_KG);
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(e.id).toBeDefined();
      expect(['debulking', 'blocking', 'resistance', 'cleanup']).toContain(e.leg);
      expect(e.evidenceTier).toBeGreaterThanOrEqual(0);
      expect(e.evidenceTier).toBeLessThanOrEqual(5);
    }
  });

  it('rejects a claim with an invalid leg', () => {
    const r = validateBiotechClaimAgainstKG({
      asset_name: 'novel-asset',
      leg: 'not-a-leg',
      evidence_tier: 3,
      source: 'Clin Trials NCT0123',
    });
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
    expect(r.summary).toContain('Invalid biological leg');
    expect(r.details[0]).toContain('4-leg framework');
  });

  it('rejects a claim with a missing leg', () => {
    const r = validateBiotechClaimAgainstKG({
      asset_name: 'novel-asset',
      evidence_tier: 3,
      source: 'Clin Trials NCT0123',
    });
    expect(r.passed).toBe(false);
    expect(r.summary).toContain("Invalid biological leg 'undefined'");
  });

  it('rejects a non-numeric evidence tier', () => {
    const r = validateBiotechClaimAgainstKG({
      asset_name: 'novel-asset',
      leg: 'debulking',
      evidence_tier: undefined,
      source: 'Clin Trials NCT0123',
    });
    expect(r.passed).toBe(false);
    expect(r.summary).toContain('Invalid evidence tier undefined');
    expect(r.details[0]).toContain('integer between 0');
  });

  it('rejects a tier above the clinical spectrum', () => {
    const r = validateBiotechClaimAgainstKG({
      asset_name: 'novel-asset',
      leg: 'debulking',
      evidence_tier: 6,
      source: 'Clin Trials NCT0123',
    });
    expect(r.passed).toBe(false);
    expect(r.summary).toContain('Invalid evidence tier 6');
  });

  it('rejects a negative tier', () => {
    const r = validateBiotechClaimAgainstKG({
      asset_name: 'novel-asset',
      leg: 'debulking',
      evidence_tier: -1,
      source: 'Clin Trials NCT0123',
    });
    expect(r.passed).toBe(false);
    expect(r.summary).toContain('Invalid evidence tier -1');
  });

  it('rejects an unsourced assertion', () => {
    const r = validateBiotechClaimAgainstKG({
      asset_name: 'novel-asset',
      leg: 'debulking',
      evidence_tier: 3,
    });
    expect(r.passed).toBe(false);
    expect(r.summary).toContain('Unsourced biomedical assertion');
  });

  it('rejects a too-short source reference', () => {
    const r = validateBiotechClaimAgainstKG({
      asset_name: 'novel-asset',
      leg: 'debulking',
      evidence_tier: 3,
      source: 'abc',
    });
    expect(r.passed).toBe(false);
    expect(r.summary).toContain('Unsourced biomedical assertion');
  });

  it('rejects a leg conflict with a known knowledge-graph entity', () => {
    // tebentafusp is canonically 'cleanup'; asserting it as 'debulking' conflicts.
    const r = validateBiotechClaimAgainstKG({
      asset_name: 'tebentafusp',
      leg: 'debulking',
      evidence_tier: 5,
      source: 'Nathan P, et al. N Engl J Med 2021; 385:1196-1206.',
    });
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
    expect(r.summary).toContain('Leg Conflict with Clinical Knowledge Graph');
    expect(r.entity).toBe(CANONICAL_ONCOLOGY_KG.tebentafusp);
    expect(r.details[0]).toContain("proven in 'cleanup'");
  });

  it('passes a known entity in its canonical leg', () => {
    const r = validateBiotechClaimAgainstKG({
      asset_name: 'sotorasib',
      leg: 'debulking',
      evidence_tier: 5,
      source: 'Skoulidis F, et al. Sotorasib for Lung Cancers with KRAS p.G12C Mutation. N Engl J Med 2021; 384:2371-2381.',
    });
    expect(r.passed).toBe(true);
    expect(r.score).toBe(1);
    expect(r.summary).toContain('PASSED');
    expect(r.entity).toBe(CANONICAL_ONCOLOGY_KG.sotorasib);
    expect(r.details.some((d) => d.includes('Knowledge graph match confirmed'))).toBe(true);
  });

  it('treats an unknown asset as a frontier candidate (novel, tier >= 2 passes)', () => {
    const r = validateBiotechClaimAgainstKG({
      asset_name: 'NOVEL-001',
      leg: 'blocking',
      evidence_tier: 2,
      source: 'Preclinical evaluation, AACR 2024.',
    });
    expect(r.passed).toBe(true);
    expect(r.score).toBe(0.4); // 2/5
    expect(r.entity).toBeUndefined();
    expect(r.details.some((d) => d.includes('Frontier candidate'))).toBe(true);
  });

  it('holds a frontier candidate below the Phase 1 floor', () => {
    const r = validateBiotechClaimAgainstKG({
      asset_name: 'NOVEL-002',
      leg: 'resistance',
      evidence_tier: 1,
      source: 'In vitro screen, 2024.',
    });
    expect(r.passed).toBe(false);
    expect(r.summary).toContain('HELD');
    expect(r.score).toBe(0.2);
  });

  it('clamps a tier-0 score to the 0.1 floor', () => {
    const r = validateBiotechClaimAgainstKG({
      asset_name: 'NOVEL-003',
      leg: 'cleanup',
      evidence_tier: 0,
      source: 'Hypothesis, unpublished 2024.',
    });
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0.1);
    expect(r.summary).toContain('HELD');
  });

  it('passes a full valid claim and quotes the citation prefix', () => {
    const r = validateBiotechClaimAgainstKG({
      asset_name: 'MRTX1133',
      leg: 'debulking',
      evidence_tier: 2,
      source: 'Wang X, et al. Identification of MRTX1133, a Noncovalent, Selective KRAS G12D Inhibitor.',
    });
    expect(r.passed).toBe(true);
    expect(r.details.some((d) => d.startsWith('✓ Empirical source cited:'))).toBe(true);
    expect(r.details.some((d) => d.includes('Knowledge graph match confirmed'))).toBe(true);
  });
});