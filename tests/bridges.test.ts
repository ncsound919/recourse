import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  parsePrometheusHypotheses,
  toResearchSources,
  fetchExport,
  PROMETHEUS_DEFAULT_URL,
} from '../src/lib/prometheusBridge';
import { runAgingSweep, runSatSweep, runRiemannSlice } from '../src/lib/bfrBridge';
import {
  abmCancerSimPlugin,
  classifyImmuneNiche,
  runAbmLite,
  ABM_NICHES,
} from '../src/lib/templatePlugins/abmCancerSim';
import { getComponentTemplate, isTemplateRegistered } from '../src/lib/componentTemplates';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('prometheus bridge — parse guards (never fabricate)', () => {
  it('returns [] for garbage / non-object payloads', () => {
    expect(parsePrometheusHypotheses(null)).toEqual([]);
    expect(parsePrometheusHypotheses(undefined)).toEqual([]);
    expect(parsePrometheusHypotheses('nope')).toEqual([]);
    expect(parsePrometheusHypotheses(42)).toEqual([]);
    expect(parsePrometheusHypotheses({})).toEqual([]);
    expect(parsePrometheusHypotheses({ hypotheses: 'nope' })).toEqual([]);
  });

  it('skips rows without usable id+title instead of inventing them', () => {
    const rows = parsePrometheusHypotheses([
      { id: 'h1', title: 'Real one', novelty: 0.8 },
      { id: '', title: 'no id' },
      { id: 'x' },
      { title: 'no id at all' },
      'string row',
      42,
      null,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('h1');
  });

  it('normalizes a valid payload with envelope + coercion + clamping', () => {
    const rows = parsePrometheusHypotheses({
      hypotheses: [
        { id: ' h1 ', title: ' T ', summary: 's', domains: ['bio'], novelty: '0.9', impact: 2 },
        { id: 'h2', title: 'Second', description: 'desc fallback', domain: 'chem' },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe('h1');
    expect(rows[0].novelty).toBe(0.9);
    expect(rows[0].impact).toBe(1); // clamped
    expect(rows[1].summary).toBe('desc fallback');
    expect(rows[1].domains).toEqual(['chem']);
  });

  it('accepts data/rows envelopes', () => {
    expect(parsePrometheusHypotheses({ data: [{ id: 'a', title: 'A' }] })).toHaveLength(1);
    expect(parsePrometheusHypotheses({ rows: [{ id: 'b', title: 'B' }] })).toHaveLength(1);
  });

  it('maps hypotheses into RawSource-compatible rows with honest provenance', () => {
    const srcs = toResearchSources(parsePrometheusHypotheses([{ id: 'h1', title: 'T', summary: 's' }]));
    expect(srcs).toHaveLength(1);
    const s = srcs[0];
    expect(s.url.startsWith('prometheus:')).toBe(true);
    expect(s.domain).toBe('prometheus-engine');
    expect(s.metadata.accessibilityStatus).toBe('restricted');
    expect(typeof s.fetchedAt).toBe('number');
  });

  it('fetchExport returns ok:false (not invented rows) when the engine is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const res = await fetchExport('hypotheses', 'json', 'http://127.0.0.1:9');
    expect(res.ok).toBe(false);
    expect(res.rows).toBeUndefined();
    expect(res.error).toBeTruthy();
  });

  it('fetchExport returns ok:false on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad', { status: 500 })));
    const res = await fetchExport('signals', 'json', 'http://x.test');
    expect(res.ok).toBe(false);
    expect(res.error).toContain('500');
  });

  it('exports a default URL constant', () => {
    expect(PROMETHEUS_DEFAULT_URL.startsWith('http')).toBe(true);
  });
});

describe('bfr bridge — deterministic proxies, honestly labeled', () => {
  it('aging sweep is deterministic on seed and varies across seeds', () => {
    const a = runAgingSweep(['cellular_senescence'], ['mouse'], 7);
    const b = runAgingSweep(['cellular_senescence'], ['mouse'], 7);
    expect(a.rows).toEqual(b.rows);
    expect(a.provenance).toBe('SIMULATED');
    expect(typeof a.discovery).toBe('boolean');
    expect(a.threshold).toBe(0.1);
    const c = runAgingSweep(['cellular_senescence'], ['mouse'], 8);
    expect(c.rows).not.toEqual(a.rows);
  });

  it('sat sweep is deterministic and labeled SIMULATED with 5% threshold', () => {
    const a = runSatSweep(20, 8, 3);
    const b = runSatSweep(20, 8, 3);
    expect(a.rows).toEqual(b.rows);
    expect(a.rows).toHaveLength(8);
    expect(a.provenance).toBe('SIMULATED');
    expect(a.threshold).toBe(0.05);
    expect(a.note.toLowerCase()).toContain('never');
  });

  it('riemann slice is a closed-form ESTIMATE with 1% threshold', () => {
    const a = runRiemannSlice(14, 50, 8, 1);
    const b = runRiemannSlice(14, 50, 8, 1);
    expect(a.rows).toEqual(b.rows);
    expect(a.rows).toHaveLength(8);
    expect(a.provenance).toBe('ESTIMATE');
    expect(a.threshold).toBe(0.01);
    // N(T) estimate grows monotonically on this interval.
    for (let i = 1; i < a.rows.length; i++) {
      expect(a.rows[i].value).toBeGreaterThan(a.rows[i - 1].value);
    }
    // Spot-check closed form N(50) = 50/2π·(ln(50/2π)−1)+7/8 ≈ 9.42.
    const last = a.rows[a.rows.length - 1].value;
    expect(Math.abs(last - 9.42)).toBeLessThan(0.05);
  });
});

describe('abm cancer sim — determinism + niche enum', () => {
  it('is registered in the component template registry', () => {
    expect(isTemplateRegistered('tpl_abm_cancer_sim')).toBe(true);
    expect(getComponentTemplate('tpl_abm_cancer_sim')?.domain).toBe('biotech');
  });

  it('niche classifier returns only the valid enum', () => {
    expect(ABM_NICHES).toEqual(['HOT', 'EXHAUSTED', 'EXCLUDED', 'COLD']);
    // HOT: strong infiltration, fresh immune.
    expect(classifyImmuneNiche(100, 200, 5, 0.1)).toBe('HOT');
    // EXHAUSTED: infiltrated but spent.
    expect(classifyImmuneNiche(100, 200, 5, 0.9)).toBe('EXHAUSTED');
    // EXCLUDED: stromal wall, no infiltration.
    expect(classifyImmuneNiche(500, 5, 500, 0.1)).toBe('EXCLUDED');
    // COLD: desert.
    expect(classifyImmuneNiche(500, 2, 5, 0.1)).toBe('COLD');
  });

  it('reference runner is deterministic with seed and treats CAR-T', () => {
    const p = { nCells: 1000, generations: 60, carTDose: 200, killRate: 0.25, seed: 7 };
    const a = runAbmLite(p);
    const b = runAbmLite(p);
    expect(a).toEqual(b);
    const untreated = runAbmLite({ ...p, carTDose: 0 });
    const lastT = a[a.length - 1].tumor;
    const lastU = untreated[untreated.length - 1].tumor;
    expect(lastU).toBeGreaterThan(lastT);
    for (const s of a) expect(s.vaf).toBeGreaterThanOrEqual(0);
  });

  it('synthesizer emits a self-hostable class with step/run/classifyNiche + test suite', () => {
    const out = abmCancerSimPlugin.synthesizer(
      { nCells: 1000, generations: 60, carTDose: 200, killRate: 0.25 },
      { withSelfHealing: true, componentName: 'AbmCancerSim' },
    );
    expect(out.entrypointName).toBe('AbmCancerSim');
    expect(out.sourceCode).toContain('class AbmCancerSim');
    expect(out.sourceCode).toContain('step()');
    expect(out.sourceCode).toContain('run(');
    expect(out.sourceCode).toContain('classifyNiche()');
    expect(out.testSuiteCode).toContain('classifyNiche');
    expect(out.testSuiteCode).toContain('JSON.stringify(trajT) === JSON.stringify(trajR)');
    expect(abmCancerSimPlugin.selfHost?.methods.map((m) => m.method)).toEqual([
      'step',
      'run',
      'classifyNiche',
    ]);
  });
});
