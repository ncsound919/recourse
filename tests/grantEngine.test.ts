import { describe, it, expect } from 'vitest';
import {
  SEED_REGISTRY,
  listProblems,
  getProblem,
  findGaps,
  generateHypotheses,
  designExperiments,
  scoreProposal,
  packageGrant,
  validateClaimSources,
  modalityForTier,
} from '../src/lib/oncologyGrantEngine';

describe('oncology grant engine', () => {
  it('registry has all 10 seed problems', () => {
    expect(listProblems()).toHaveLength(10);
    expect(SEED_REGISTRY).toHaveLength(10);
    const ids = listProblems().map((p) => p.problem_id);
    for (const id of [
      'P01_persister_dormancy', 'P02_cart_solid_tumor', 'P03_mced_overdiagnosis',
      'P04_metastatic_dormancy', 'P05_pdac_stroma_paradox', 'P06_ici_resistance',
      'P07_bbb_drug_delivery', 'P08_gbm_resistance', 'P09_cancer_cachexia', 'P10_pediatric_rrx',
    ]) {
      expect(ids).toContain(id);
    }
  });

  it('every claim has ≥1 source_id resolving to the problem sources map', () => {
    for (const p of listProblems()) {
      expect(() => validateClaimSources(p)).not.toThrow();
      for (const sm of p.subMechanisms) {
        for (const r of sm.ladder) {
          for (const claim of r.claims) {
            expect(claim.sourceIds.length).toBeGreaterThan(0);
            for (const sid of claim.sourceIds) {
              expect(Object.keys(p.sources)).toContain(sid);
              expect(p.sources[sid].url).toMatch(/^https?:\/\//);
            }
          }
        }
      }
    }
  });

  it('finds gaps for P02 (two T4 empty rungs)', () => {
    const gaps = findGaps('P02_cart_solid_tumor');
    expect(gaps.length).toBe(2);
    expect(gaps.every((g) => g.tier === 4)).toBe(true);
    expect(getProblem('P02_cart_solid_tumor').title).toMatch(/CAR-T/);
  });

  it('every problem exposes ≥1 gap and hypotheses reference their gap', () => {
    for (const p of listProblems()) {
      const gaps = findGaps(p.problem_id);
      expect(gaps.length).toBeGreaterThan(0);
      const hyps = generateHypotheses(p.problem_id);
      expect(hyps).toHaveLength(gaps.length);
      for (const h of hyps) {
        expect(h.falsifiable).toBe(true);
        expect(h.text).toContain(h.gapRef.subMechanism);
        expect(h.text).toContain(h.gapRef.gapDescription);
        expect(h.endpoints.length).toBeGreaterThan(0);
      }
    }
  });

  it('modality maps from gap tier: T0-1→in_vitro, T2→in_vivo, T3-5→clinical', () => {
    expect(modalityForTier(0)).toBe('in_vitro');
    expect(modalityForTier(1)).toBe('in_vitro');
    expect(modalityForTier(2)).toBe('in_vivo');
    expect(modalityForTier(3)).toBe('clinical');
    expect(modalityForTier(4)).toBe('clinical');
    expect(modalityForTier(5)).toBe('clinical');
    const exps = designExperiments('P02_cart_solid_tumor');
    expect(exps).toHaveLength(2);
    expect(exps.every((e) => e.modality === 'clinical')).toBe(true);
  });

  it('package refuses orphan claims', () => {
    const p = getProblem('P01_persister_dormancy');
    const sm = p.subMechanisms[0];
    const orphan = { text: 'Unsubstantiated miracle claim.', sourceIds: [] as string[], tier: 2 as const };
    sm.ladder[0].claims.push(orphan);
    try {
      expect(() => validateClaimSources(p)).toThrow(/orphan/i);
      expect(() => packageGrant(p.problem_id)).toThrow(/orphan/i);
    } finally {
      sm.ladder[0].claims.pop();
    }
    // registry restored → packages fine
    const pkg = packageGrant(p.problem_id);
    expect(pkg.aims).toMatch(/Specific Aims/);
  });

  it('package renders aims + provenance for a problem', () => {
    const pkg = packageGrant('P02_cart_solid_tumor');
    expect(pkg.problemId).toBe('P02_cart_solid_tumor');
    expect(pkg.aims).toContain('Aim 1');
    expect(pkg.aims).toContain('Aim 2');
    expect(pkg.significance).toMatch(/Significance/);
    expect(pkg.innovation).toMatch(/Innovation/);
    expect(pkg.approach).toMatch(/Approach/);
    expect(pkg.budgetSkeleton).toMatch(/Budget skeleton/);
    expect(pkg.provenance.length).toBeGreaterThan(0);
  });

  it('scoring is deterministic (same input → same score) and in 1-9 range', () => {
    const [h] = generateHypotheses('P02_cart_solid_tumor');
    const [e] = designExperiments('P02_cart_solid_tumor');
    const a = scoreProposal(h, e);
    const b = scoreProposal(h, e);
    expect(a).toEqual(b);
    for (const k of ['significance', 'innovation', 'approach', 'investigator', 'environment', 'overall'] as const) {
      expect(a[k]).toBeGreaterThanOrEqual(1);
      expect(a[k]).toBeLessThanOrEqual(9);
    }
    expect(typeof a.fundable).toBe('boolean');
  });

  it('getProblem throws on unknown id', () => {
    expect(() => getProblem('P99_nope')).toThrow(/unknown problem_id/);
  });
});
