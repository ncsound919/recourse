import { describe, it, expect } from 'vitest';
import { musicTherapyFindings } from '../src/lib/musicTherapyFindings';
import { tuningContrastModel, benchmarkComparison, TUNING_CAVEATS } from '../src/lib/musicTherapyTuning';
import { findingsForDomain, PUBLISH_DOMAINS, runPublishPass } from '../src/lib/globalLensPublisher';
import type { GlobalLensPublishInput } from '../src/lib/globalLensBridge';

const musicDomain = PUBLISH_DOMAINS.find((d) => d.label === 'Music Therapy')!;

describe('music therapy → global lens publish path', () => {
  it('emits publishable findings every record carries a real artifact', () => {
    const { findings, evidenceSource } = musicTherapyFindings({ limit: 8 });
    expect(findings.length).toBeGreaterThan(5);
    expect(evidenceSource).toContain('Cochrane');
    for (const f of findings) {
      expect(f.artifact).toBeDefined();
      expect(f.artifact.claim.length).toBeGreaterThan(10);
      expect(f.artifact.artifactHash.length).toBeGreaterThan(10);
      expect(['E2', 'E3']).toContain(f.artifact.evidenceTier);
      expect(f.mode).toBe('local_deterministic');
    }
    // Trials are music_therapy_trial; benchmark is present.
    expect(findings.some((f) => f.kind === 'music_therapy_trial')).toBe(true);
    expect(findings.some((f) => f.kind === 'music_therapy_benchmark')).toBe(true);
  });

  it('tuning contrast: HR -2 @432 significant, PWV -0.5, 415 untested, others invariant', () => {
    const c432 = tuningContrastModel(432);
    const hr432 = c432.find((c) => c.metric === 'HR')!;
    const pwv432 = c432.find((c) => c.metric === 'PWV')!;
    expect(hr432.delta).toBe(-2);
    expect(hr432.significant).toBe(true);
    expect(hr432.p).toBe(0.04);
    expect(pwv432.delta).toBe(-0.5);
    expect(pwv432.significant).toBe(true);
    // psych distress is tuning-invariant (delta 0, not significant).
    const psy432 = c432.find((c) => c.metric === 'psych_distress')!;
    expect(psy432.delta).toBe(0);
    expect(psy432.significant).toBe(false);
    // 443: no significant contrast.
    const c443 = tuningContrastModel(443);
    expect(c443.every((c) => !c.significant)).toBe(true);
    // 415: UNTESTED — tested:false on every record.
    const c415 = tuningContrastModel(415);
    expect(c415.every((c) => c.tested === false)).toBe(true);
    expect(c415[0].p).toBeNull();
  });

  it('untested 415 Hz never becomes a finding claim', () => {
    const { findings } = musicTherapyFindings({ limit: 4 });
    const claims = findings.map((f) => f.claim).join(' ');
    expect(claims).not.toMatch(/415Hz.*significant/i);
    // Benchmark + caveats render.
    const b = benchmarkComparison();
    expect(b.anxietySai).toBe(-7.73);
    expect(b.hr).toBe(-3.4);
    expect(TUNING_CAVEATS.length).toBeGreaterThanOrEqual(6);
  });

  it('findingsForDomain isolates music findings into the Music Therapy domain', () => {
    const { findings } = musicTherapyFindings({ limit: 8 });
    const mt = findingsForDomain(musicDomain, findings);
    expect(mt.length).toBeGreaterThan(0);
    const text = mt.map((f) => `${f.claim} ${f.provenance} ${f.kind}`).join(' ').toLowerCase();
    expect(text).toMatch(/music|tuning|stimulus|benchmark/);
    // Every music finding is music-tagged.
    expect(mt.every((f) => ['music_therapy_trial', 'tuning_contrast', 'music_therapy_benchmark'].includes(f.kind))).toBe(true);
  });

  it('findingsForDomain never leaks music findings into other domains (no regression)', () => {
    const oncology = PUBLISH_DOMAINS.find((d) => d.label === 'Overlay Oncology')!;
    const { findings } = musicTherapyFindings({ limit: 4 });
    // Simulate the real publish pool: conductor findings + music findings.
    const generalFinding = {
      kind: 'dose_response',
      hypothesisId: 'H1',
      problemId: 'P04',
      claim: 'biosim sweep: dose-response is monotone for the on-target compound',
      numbers: { ic50: 2.4 },
      provenance: 'biosim sidecar sweep',
      mode: 'sidecar' as const,
      cycle: 9,
      artifact: { claim: 'biosim sweep: dose-response is monotone', evidenceTier: 'E2', artifactHash: 'abc123', id: 'art_1' } as any,
    };
    const pool = [...findings, generalFinding] as any;
    const res = findingsForDomain(oncology, pool);
    expect(res.some((f) => f.kind === 'dose_response')).toBe(true); // keeps the general finding
    expect(res.every((f) => !['music_therapy_trial', 'tuning_contrast', 'music_therapy_benchmark'].includes(f.kind))).toBe(true);
  });

  it('a full publish pass produces a Music Therapy article with a paper attachment', async () => {
    const { findings } = musicTherapyFindings({ limit: 8 });
    let captured: GlobalLensPublishInput | null = null;
    const result = await runPublishPass({
      artifacts: [],
      findings: findings as any,
      insights: [],
      domains: [musicDomain],
      publish: async (input) => {
        captured = input;
        return { ok: true, inserted: true };
      },
    });
    expect(result.total).toBe(1);
    expect(result.ok).toBe(1);
    expect(captured).not.toBeNull();
    expect(captured!.title).toContain('Music Therapy');
    expect(captured!.body).toContain('Music therapy stimulus');
    expect(captured!.body).toContain('Cochrane benchmark');
    expect(['caveat', 'tuning-invariant', 'untested'].some((s) => captured!.body.includes(s))).toBe(true);
    // Paper attachment: real evidence tier + artifact hash.
    expect(captured!.paper).toBeDefined();
    expect(captured!.paper!.evidence_tier).toBeDefined();
    expect(captured!.paper!.payload).toBeDefined();
  });
});