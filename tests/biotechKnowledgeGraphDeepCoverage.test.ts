import { describe, it, expect } from 'vitest';
import { CANONICAL_ONCOLOGY_KG, validateBiotechClaimAgainstKG } from '../src/lib/biotechKnowledgeGraph.js';

describe('biotechKnowledgeGraph — canonical graph integrity', () => {
  it('every canonical entity is self-consistent with its key', () => {
    for (const [key, e] of Object.entries(CANONICAL_ONCOLOGY_KG)) {
      expect(e.id).toBe(key);
      expect(['debulking', 'blocking', 'resistance', 'cleanup']).toContain(e.leg);
      expect(Number.isInteger(e.evidenceTier)).toBe(true);
      expect(e.evidenceTier).toBeGreaterThanOrEqual(0);
      expect(e.evidenceTier).toBeLessThanOrEqual(5);
      expect(typeof e.targetProtein).toBe('string');
      expect(typeof e.clinicalIndication).toBe('string');
      expect(Array.isArray(e.biomarkers)).toBe(true);
      expect(e.literatureCitation.length).toBeGreaterThan(0);
    }
  });
});

describe('biotechKnowledgeGraph — validation guards', () => {
  it('rejects an explicitly invalid leg', () => {
    const r = validateBiotechClaimAgainstKG({ asset_name: 'X', leg: 'weird', evidence_tier: 3, source: 'ref 123' });
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
    expect(r.summary).toContain('Invalid biological leg');
    expect(r.details[0]).toContain('4-leg framework');
  });

  it('rejects a missing leg (undefined)', () => {
    const r = validateBiotechClaimAgainstKG({ asset_name: 'X', evidence_tier: 3, source: 'ref 123' });
    expect(r.passed).toBe(false);
    expect(r.summary).toContain("Invalid biological leg 'undefined'");
  });

  it('rejects a non-numeric tier', () => {
    const r = validateBiotechClaimAgainstKG({ asset_name: 'X', leg: 'blocking', evidence_tier: 'high' as unknown as number, source: 'ref 123' });
    expect(r.passed).toBe(false);
    expect(r.summary).toContain('Invalid evidence tier high');
    expect(r.details[0]).toContain('integer between 0');
  });

  it('rejects a negative tier', () => {
    const r = validateBiotechClaimAgainstKG({ asset_name: 'X', leg: 'blocking', evidence_tier: -3, source: 'ref 123' });
    expect(r.passed).toBe(false);
    expect(r.summary).toContain('Invalid evidence tier -3');
  });

  it('rejects a tier above the clinical spectrum', () => {
    const r = validateBiotechClaimAgainstKG({ asset_name: 'X', leg: 'blocking', evidence_tier: 9, source: 'ref 123' });
    expect(r.passed).toBe(false);
    expect(r.summary).toContain('Invalid evidence tier 9');
  });

  it('rejects an unsourced assertion', () => {
    const r = validateBiotechClaimAgainstKG({ asset_name: 'X', leg: 'blocking', evidence_tier: 3 });
    expect(r.passed).toBe(false);
    expect(r.summary).toBe('REJECTED: Unsourced biomedical assertion');
  });

  it('rejects a source shorter than five characters', () => {
    const r = validateBiotechClaimAgainstKG({ asset_name: 'X', leg: 'blocking', evidence_tier: 3, source: 'ab' });
    expect(r.passed).toBe(false);
    expect(r.summary).toBe('REJECTED: Unsourced biomedical assertion');
  });

  it('accepts a source at exactly five characters', () => {
    const r = validateBiotechClaimAgainstKG({ asset_name: 'X', leg: 'blocking', evidence_tier: 3, source: 'abcde' });
    expect(r.passed).toBe(true);
  });
});

describe('biotechKnowledgeGraph — knowledge-graph cross-validation', () => {
  it('rejects a leg conflict with a canonical entity and exposes it', () => {
    const r = validateBiotechClaimAgainstKG({
      asset_name: 'sotorasib',
      leg: 'cleanup', // canonical leg is debulking
      evidence_tier: 5,
      source: 'Skoulidis F, et al. NEJM 2021.',
    });
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
    expect(r.summary).toContain('Leg Conflict with Clinical Knowledge Graph');
    expect(r.entity).toBe(CANONICAL_ONCOLOGY_KG.sotorasib);
    expect(r.details[0]).toContain("proven in 'debulking'");
  });

  it('passes a known entity in its canonical leg and reports the match', () => {
    const r = validateBiotechClaimAgainstKG({
      asset_name: 'adagrasib',
      leg: 'debulking',
      evidence_tier: 5,
      source: 'Jänne PA, et al. NEJM 2022.',
    });
    expect(r.passed).toBe(true);
    expect(r.score).toBe(1);
    expect(r.entity).toBe(CANONICAL_ONCOLOGY_KG.adagrasib);
    expect(r.details.some((d) => d.includes('Knowledge graph match confirmed'))).toBe(true);
    expect(r.details.some((d) => d.includes('KRAS G12C'))).toBe(true);
  });

  it('provisions a novel frontier candidate without a canonical entity', () => {
    const r = validateBiotechClaimAgainstKG({
      asset_name: 'ACME-777',
      leg: 'resistance',
      evidence_tier: 2,
      source: 'Preclinical AACR 2025.',
    });
    expect(r.passed).toBe(true);
    expect(r.score).toBe(0.4);
    expect(r.entity).toBeUndefined();
    expect(r.details.some((d) => d.includes('Frontier candidate'))).toBe(true);
  });
});

describe('biotechKnowledgeGraph — scoring and promotion floor', () => {
  it('clamps a tier-0 frontier score to the 0.1 floor and holds promotion', () => {
    const r = validateBiotechClaimAgainstKG({
      asset_name: 'ACME-0',
      leg: 'debulking',
      evidence_tier: 0,
      source: 'hypothesis, unpublished',
    });
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0.1);
    expect(r.summary).toContain('HELD');
    expect(r.summary).toContain('tier >= 2');
  });

  it('holds a tier-1 claim below the Phase 1 floor', () => {
    const r = validateBiotechClaimAgainstKG({
      asset_name: 'ACME-1',
      leg: 'blocking',
      evidence_tier: 1,
      source: 'in vitro screen 2024',
    });
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0.2);
    expect(r.summary).toContain('HELD');
  });

  it('passes a tier-2 claim with a score of exactly 0.4', () => {
    const r = validateBiotechClaimAgainstKG({
      asset_name: 'MRTX1133',
      leg: 'debulking',
      evidence_tier: 2,
      source: 'Wang X, et al. J Med Chem 2022; 65(4):3123-3133.',
    });
    expect(r.passed).toBe(true);
    expect(r.score).toBe(0.4);
    expect(r.summary).toContain('PASSED');
    expect(r.summary).toContain('internal consistency only');
  });

  it('passes a canonical tier-5 entity with a full score', () => {
    const r = validateBiotechClaimAgainstKG({
      asset_name: 'tebentafusp',
      leg: 'cleanup',
      evidence_tier: 5,
      source: 'Nathan P, et al. N Engl J Med 2021; 385:1196-1206.',
    });
    expect(r.passed).toBe(true);
    expect(r.score).toBe(1);
    expect(r.summary).toContain('PASSED');
    expect(r.details.some((d) => d.includes('✓ Empirical source cited:'))).toBe(true);
  });
});