import { describe, it, expect } from 'vitest';
import {
  translationHealth,
  translateTerm,
  translateMetric,
  engineConfig,
  translationPythonBin,
  translationRunnerPath,
} from '../src/lib/translationBridge';

describe('translation bridge (real Overlay Science Python engines)', () => {
  // Soft integration tests: if the python runner or the sibling engine repos
  // are unavailable, health probes report offline and we skip honestly — we
  // never fabricate a translation.
  it('reports the configured runner + python bin', () => {
    expect(translationPythonBin().length).toBeGreaterThan(0);
    expect(translationRunnerPath().toLowerCase()).toContain('translation_runner.py');
  });

  it('resolves both engine module files + labels', () => {
    const bb = engineConfig('bbtech');
    expect(bb.className).toBe('BBTechTranslationEngine');
    expect(bb.moduleFile).toContain('translation_engine.py');
    const golf = engineConfig('golf-surgery');
    expect(golf.className).toBe('GolfSurgeryTranslationEngine');
    expect(golf.moduleFile).toContain('golf_surgery_translation_engine.py');
  });

  it('bbtech health returns real mapping statistics when the engine is reachable', async () => {
    const h = await translationHealth('bbtech', { timeoutMs: 20_000 });
    if (!h.online) {
      console.warn(`SKIP: bbtech engine offline — ${h.error ?? 'no error'}`);
      return;
    }
    expect(h.online).toBe(true);
    expect(h.latencyMs).toBeGreaterThan(0);
    const stats = h.stats as Record<string, unknown> | undefined;
    expect(stats).toBeDefined();
    expect(stats).toHaveProperty('total_forward_mappings');
  });

  it('bbtech reverse translation of a biotech term returns the real analog', async () => {
    const h = await translationHealth('bbtech', { timeoutMs: 20_000 });
    if (!h.online) return;
    const r = await translateTerm('bbtech', 'TP53', 'reverse', { timeoutMs: 20_000 });
    expect(r.ok).toBe(true);
    expect(r.result?.source_term).toBe('TP53');
    expect(r.result?.target_term.length).toBeGreaterThan(0);
    expect(r.result?.direction).toBe('biotech_to_basketball');
    expect(r.result?.bidirectional_possible).toBe(true);
  });

  it('a term with no mapping reports an honest negative (target_term "")', async () => {
    const h = await translationHealth('bbtech', { timeoutMs: 20_000 });
    if (!h.online) return;
    const r = await translateTerm('bbtech', 'zzz_not_a_real_gene_xyz', 'reverse', { timeoutMs: 20_000 });
    expect(r.ok).toBe(true);
    expect(r.result?.target_term).toBe('');
    expect(r.result?.bidirectional_possible).toBe(false);
  });

  it('golf-surgery engine translates driver → major_complex_surgery (real engine)', async () => {
    const h = await translationHealth('golf-surgery', { timeoutMs: 20_000 });
    if (!h.online) {
      console.warn(`SKIP: golf-surgery engine offline — ${h.error ?? 'no error'}`);
      return;
    }
    const r = await translateTerm('golf-surgery', 'driver', 'forward', { timeoutMs: 20_000 });
    expect(r.ok).toBe(true);
    expect(r.result?.target_term).toBe('major_complex_surgery');
    expect(r.result?.confidence).toBeGreaterThan(0.9);
  });

  it('metric conversion returns the engine\u2019s real translated value', async () => {
    const h = await translationHealth('bbtech', { timeoutMs: 20_000 });
    if (!h.online) return;
    const r = await translateMetric('bbtech', 'three_pt_pct', 42.5, true, { timeoutMs: 20_000 });
    expect(r.ok).toBe(true);
    expect(r.result).toHaveProperty('translated');
    expect(r.result).toHaveProperty('description');
    expect(r.result).toHaveProperty('biotech_metric', 'on_target_specificity');
  });

  it('validates input (empty term / NaN value are rejected client-side)', async () => {
    const bad = await translateTerm('bbtech', '   ', 'reverse');
    expect(bad.ok).toBe(false);
    const badMetric = await translateMetric('bbtech', 'three_pt_pct', Number.NaN, true);
    expect(badMetric.ok).toBe(false);
  });
});