import { describe, it, expect } from 'vitest';
import {
  buildArtifact,
  computeArtifactHash,
  verifyArtifactHash,
  canonicalJson,
  tierForEvidence,
  sha256,
  statsForDoseResponse,
  type ResearchArtifact,
} from '../src/lib/researchArtifact';

describe('research artifact — publishable-grade reproducibility', () => {
  it('builds an artifact with a reproducible hash (identical inputs -> identical hash)', () => {
    const a = buildArtifact({
      kind: 'dose_response',
      claim: 'CAR-T dose 3e5: cure rate 31.7%',
      engine: 'biosim',
      dataVersion: 'sha-cohort-v2',
      params: { dose: 300000, n_trials: 120 },
      seed: 42,
      codeVersion: 'v1.2.3',
      evidenceTier: 'E2',
      stats: { test: 'welch_t', n: 120, effect: 0.316, p: 0.01 },
    });
    const b = buildArtifact({
      kind: 'dose_response',
      claim: 'CAR-T dose 3e5: cure rate 31.7%',
      engine: 'biosim',
      dataVersion: 'sha-cohort-v2',
      params: { dose: 300000, n_trials: 120 },
      seed: 42,
      codeVersion: 'v1.2.3',
      evidenceTier: 'E2',
      stats: { test: 'welch_t', n: 120, effect: 0.316, p: 0.01 },
    }, a.createdAt + 999); // different wall-clock time
    expect(a.artifactHash).toBe(b.artifactHash); // time does NOT affect hash
    expect(a.id).toBe(b.id);
    expect(a.artifactHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hash changes when the reproducible core changes (drift detection)', () => {
    const base = buildArtifact({
      kind: 'kg_bridge', claim: 'AKT->KRAS 6 paths', engine: 'kg', params: { from: 'AKT' }, seed: 7,
    });
    const tampered = { ...base, params: { from: 'KRAS' } };
    expect(computeArtifactHash(tampered)).not.toBe(base.artifactHash);
    expect(verifyArtifactHash(tampered)).toBe(false); // detects the tamper
    expect(verifyArtifactHash(base)).toBe(true);
  });

  it('stats is null when not measured (honest, never fabricated)', () => {
    const a = buildArtifact({
      kind: 'bounty_draft',
      claim: 'drafted bounty for gap X',
      engine: 'pathosphere',
      params: {},
      seed: null,
      evidenceTier: 'E4',
    });
    expect(a.stats).toBeNull();
    expect(a.evidenceTier).toBe('E4');
  });

  it('pins seed when provided, null when unseeded', () => {
    const seeded = buildArtifact({ kind: 'x', claim: 'c', engine: 'e', seed: 42 });
    const unseeded = buildArtifact({ kind: 'x', claim: 'c', engine: 'e' });
    expect(seeded.seed).toBe(42);
    expect(unseeded.seed).toBeNull();
  });

  it('canonicalJson is stable across key order', () => {
    expect(canonicalJson({ b: 1, a: [2, 3], c: { y: 1, x: 2 } }))
      .toBe(canonicalJson({ c: { x: 2, y: 1 }, a: [2, 3], b: 1 }));
  });

  it('tierForEvidence maps honestly', () => {
    expect(tierForEvidence({ hasExternalData: true, hasStats: true, independentlyVerified: true })).toBe('E1');
    expect(tierForEvidence({ hasExternalData: true, hasStats: true, independentlyVerified: false })).toBe('E2');
    expect(tierForEvidence({ hasExternalData: true, hasStats: false, independentlyVerified: false })).toBe('E3');
    expect(tierForEvidence({ hasExternalData: false, hasStats: false, independentlyVerified: false })).toBe('E4');
  });

  it('sha256 is real crypto', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('verification carries method + pass state', () => {
    const a = buildArtifact({
      kind: 'math',
      claim: 'collatz verified to 1e6',
      engine: 'math_conductor',
      verification: { method: 'independent_crosscheck', passed: true, detail: 'second impl matched' },
    });
    expect(a.verification?.passed).toBe(true);
    expect(a.verification?.method).toBe('independent_crosscheck');
  });

  it('provenance is preserved and part of the hash', () => {
    const a = buildArtifact({ kind: 'x', claim: 'c', engine: 'e', provenance: 'real run @ gen 5' });
    const b = buildArtifact({ kind: 'x', claim: 'c', engine: 'e', provenance: 'different' });
    expect(a.provenance).toContain('gen 5');
    expect(a.artifactHash).not.toBe(b.artifactHash);
  });

  it('is a valid artifact type (structural check)', () => {
    const a = buildArtifact({ kind: 'dose_response', claim: 'c', engine: 'biosim' });
    const asArtifact: ResearchArtifact = a;
    expect(asArtifact.id.startsWith('art_')).toBe(true);
    expect(typeof asArtifact.createdAt).toBe('number');
    expect(asArtifact.codeVersion.length).toBeGreaterThan(0);
  });
});

describe('statsForDoseResponse', () => {
  it('computes real stats from a dose sweep with a clear dose-response', () => {
    // Low doses: ~0.04-0.05. High doses: ~0.31-0.32, 120 trials each.
    const numbers = {
      dose_0: 1e5, rate_0: 0.041, n_0: 120,
      dose_1: 1.5e5, rate_1: 0.045, n_1: 120,
      dose_2: 2e5, rate_2: 0.048, n_2: 120,
      dose_3: 3e5, rate_3: 0.31, n_3: 120,
      dose_4: 4e5, rate_4: 0.315, n_4: 120,
      dose_5: 5e5, rate_5: 0.32, n_5: 120,
    };
    const s = statsForDoseResponse(numbers);
    expect(s).not.toBeNull();
    expect(s!.test).toBe('two_proportion_z');
    expect(s!.p).toBeLessThan(0.01);
    expect(s!.effect).toBeGreaterThan(0.2);
    expect(s!.ci!.lower).toBeGreaterThan(0);
  });

  it('returns null when fewer than 2 arms (honest no-stats)', () => {
    expect(statsForDoseResponse({ dose_0: 1e5, rate_0: 0.04, n_0: 120 })).toBeNull();
  });

  it('returns null when arms lack per-arm trial n', () => {
    expect(statsForDoseResponse({ dose: 300000, cure_rate: 0.317 })).toBeNull();
    expect(statsForDoseResponse({ low: 0.04, mid: 0.045, high: 0.05, monotone: 1 })).toBeNull();
  });

  it('honestly returns null for small trial counts (n<30 per arm)', () => {
    expect(statsForDoseResponse({
      dose_0: 1e5, rate_0: 0.04, n_0: 10, dose_1: 5e5, rate_1: 0.30, n_1: 10,
    })).toBeNull();
  });
});