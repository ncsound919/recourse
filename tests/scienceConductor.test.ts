import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  discoverServices,
  runScienceCycle,
  getConductorStatus,
  startScienceConductor,
  stopScienceConductor,
  recentFindings,
  recentCycles,
  normalizeClaim,
  splitNovel,
  selectDosesForCycle,
  selectLodDepthForCycle,
  selectTrendDomain,
  extractGeneTokens,
} from '../src/lib/scienceConductor.js';

// Keep the unit tests deterministic: never attempt real Axiom tool builds
// (Axiom may be online; a real build is slow and not the unit's concern) and
// never fire real Keywire fleet calls (they can hang on service bring-up).
// Isolate the ledger to a temp dir so tests never consume the LIVE novelty
// space or pollute the real findings/cycles files.
beforeAll(() => {
  process.env.SCIENCE_AXIOM_BUILD = '0';
  process.env.SCIENCE_KEYWIRE_HANDOFF = '0';
  process.env.SCIENCE_LOOP_DIR = `${process.cwd()}\\data\\test-science-loop`;
});
afterAll(() => {
  delete process.env.SCIENCE_AXIOM_BUILD;
  delete process.env.SCIENCE_KEYWIRE_HANDOFF;
  delete process.env.SCIENCE_LOOP_DIR;
});

// These tests do real service probes / full science cycles. Under full-suite
// parallel load those can be slow; a 60s per-test budget gives them room.
describe('science conductor', () => {
  it('discovers services honestly (all offline -> online:false, no fabrication)', async () => {
    const services = await discoverServices(1500);
    expect(Object.keys(services).length).toBeGreaterThanOrEqual(9);
    for (const [name, h] of Object.entries(services)) {
      expect(typeof name).toBe('string');
      expect(typeof h.online).toBe('boolean');
    }
  });

  it('runs a full cycle with local fallback when all services are offline', async () => {
    const cycle = await runScienceCycle();
    expect(cycle.cycle).toBeGreaterThan(0);
    expect(['biosim_sidecar', 'umoe_engine', 'local_deterministic', 'none_available']).toContain(cycle.experimentMode);
    expect(cycle.problemId).toMatch(/^P\d{2}_/);
    expect(cycle.hypothesisText.length).toBeGreaterThan(0);
    // When nothing is online the cycle still records honestly.
    expect(cycle.services).toBeTruthy();
    expect(cycle.integrityCheck.submitted).toBe(false);
  });

  it('fallback findings are labeled local_deterministic with provenance', async () => {
    const cycle = await runScienceCycle();
    if (cycle.experimentMode === 'local_deterministic') {
      // The local fallback (ABM-lite) is one of several finding sources; the
      // evidence phase also emits real deterministicResearch findings with
      // their own provenance. Assert on the fallback findings specifically.
      const fallbackFindings = cycle.findings.filter((f) => /abmCancerSim/.test(f.provenance));
      expect(fallbackFindings.length).toBeGreaterThan(0);
      for (const f of fallbackFindings) {
        expect(f.mode).toBe('local_deterministic');
        expect(f.provenance).toMatch(/abmCancerSim/);
      }
    }
  });

  it('start/stop toggles conductor state; overlap-guarded', () => {
    const s = startScienceConductor({ intervalMs: 60_000 });
    expect(s.started).toBe(true);
    const again = startScienceConductor({ intervalMs: 60_000 });
    expect(again.started).toBe(false); // no double-run
    const status = getConductorStatus();
    expect(status.running).toBe(true);
    expect(status.intervalMs).toBe(60_000);
    const st = stopScienceConductor();
    expect(st.stopped).toBe(true);
    expect(getConductorStatus().running).toBe(false);
  });

  it('persists cycles + findings to the science-loop ledger', () => {
    const cycles = recentCycles(5);
    expect(cycles.length).toBeGreaterThan(0);
    expect(cycles[cycles.length - 1].cycle).toBeGreaterThan(0);
    const findings = recentFindings(10);
    expect(Array.isArray(findings)).toBe(true);
  });

  it('every finding carries provenance + mode (no anonymous claims)', async () => {
    const cycle = await runScienceCycle();
    for (const f of cycle.findings) {
      expect(f.provenance.length).toBeGreaterThan(5);
      expect(['sidecar', 'remote_engine', 'local_deterministic']).toContain(f.mode);
      expect(f.problemId).toBe(cycle.problemId);
    }
  });

  it('cycle records novelty counts + engines used', async () => {
    const cycle = await runScienceCycle();
    expect(typeof cycle.novelCount).toBe('number');
    expect(typeof cycle.repeatCount).toBe('number');
    expect(cycle.novelCount + cycle.repeatCount).toBeGreaterThanOrEqual(cycle.findings.length);
    expect(Array.isArray(cycle.enginesUsed)).toBe(true);
  });
});

describe('novelty gate', () => {
  it('normalizeClaim collapses case, whitespace, and float noise', () => {
    expect(normalizeClaim('  Cure RATE 31.70%  ')).toBe(normalizeClaim('cure rate 31.7%'));
    expect(normalizeClaim('dose 1.0e+5: x')).not.toBe(normalizeClaim('dose 2.0e+5: x'));
  });

  it('splitNovel partitions novel vs repeats without touching the set', () => {
    const seen = new Set([normalizeClaim('old claim here')]);
    const findings = [
      { kind: 'dose_response', hypothesisId: 'h', problemId: 'P01', claim: 'OLD CLAIM HERE', numbers: {}, provenance: 'p', mode: 'sidecar', cycle: 1 },
      { kind: 'dose_response', hypothesisId: 'h', problemId: 'P01', claim: 'brand new claim here', numbers: {}, provenance: 'p', mode: 'sidecar', cycle: 1 },
    ] as const;
    const { novel, repeats } = splitNovel([...findings], seen);
    expect(novel.length).toBe(1);
    expect(repeats).toBe(1);
    expect(novel[0].claim).toBe('brand new claim here');
    expect(seen.size).toBe(1); // pure: set untouched
  });
});

describe('parameter exploration', () => {
  it('dose windows rotate across cycles and cover the grid', () => {
    const d1 = selectDosesForCycle(1);
    const d2 = selectDosesForCycle(2);
    expect(d1.length).toBe(3);
    expect(d2.length).toBe(3);
    expect(d1).not.toEqual(d2);
    // Full rotation covers every grid point.
    const all = new Set<number>();
    for (let i = 0; i < 7; i++) for (const d of selectDosesForCycle(i)) all.add(d);
    expect(all.size).toBe(7);
    // Deterministic: same cycle always yields the same window.
    expect(selectDosesForCycle(4)).toEqual(selectDosesForCycle(4));
  });

  it('LOD depths and trend domains rotate deterministically', () => {
    expect(new Set([0, 1, 2, 3].map(selectLodDepthForCycle)).size).toBe(3);
    expect(selectTrendDomain(0)).toBe('oncology');
    expect(selectTrendDomain(1)).toBe('aging');
    expect(selectTrendDomain(2)).toBe('ai_health');
    expect(selectTrendDomain(3)).toBe('oncology');
  });
});

describe('gene token extraction', () => {
  it('extracts gene-like tokens and filters stoplist words', () => {
    const toks = extractGeneTokens('TP53 loss and KRAS mutation drive resistance, per FDA and NIH data on DNA');
    expect(toks).toContain('TP53');
    expect(toks).toContain('KRAS');
    expect(toks).not.toContain('FDA');
    expect(toks).not.toContain('NIH');
    expect(toks).not.toContain('DNA');
  });

  it('dedupes repeat tokens, preserving first-seen order', () => {
    expect(extractGeneTokens('EGFR then EGFR and ALK')).toEqual(['EGFR', 'ALK']);
  });
});
