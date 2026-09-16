import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ---------------------------------------------------------------------------
// All external science services are mocked so the conductor is exercised
// deterministically (no network, no real sidecars, no pm2).
// ---------------------------------------------------------------------------
const M = vi.hoisted(() => ({
  biosimHealth: vi.fn(),
  biosimMontecarlo: vi.fn(),
  biosimLod95: vi.fn(),
  oncologyManifest: vi.fn(),
  oncologyEvidence: vi.fn(),
  oncologyMechanismFusion: vi.fn(),
  oncologyCalibrationState: vi.fn(),
  oncologyDiscoveryLedger: vi.fn(),
  scientificHealth: vi.fn(),
  geneLookup: vi.fn(),
  integrityStatus: vi.fn(),
  verifyWork: vi.fn(),
  orchestratorHealth: vi.fn(),
  umoeHealth: vi.fn(),
  umoeRun: vi.fn(),
  chemlabHealth: vi.fn(),
  foldingHealth: vi.fn(),
  foresightStatus: vi.fn(),
  fuzzSidecarHealth: vi.fn(),
  fuzzDedup: vi.fn(),
  kgSidecarHealth: vi.fn(),
  kgBridges: vi.fn(),
  oncologyKgToGraph: vi.fn(),
  pdfSidecarHealth: vi.fn(),
  trendHealth: vi.fn(),
  trendScan: vi.fn(),
  axiomReachable: vi.fn(),
  integrateAxiomTool: vi.fn(),
  keywireHealth: vi.fn(),
  keywireCallService: vi.fn(),
  keywireBrainTask: vi.fn(),
  fetchExport: vi.fn(),
  fetchDomainPageviews: vi.fn(),
  appendInsight: vi.fn(),
  verifyLedgerChain: vi.fn(),
  readLedger: vi.fn(),
  translationHealth: vi.fn(),
  translateTerm: vi.fn(),
  translateMetric: vi.fn(),
  runAbmLite: vi.fn(),
  classifyImmuneNiche: vi.fn(),
}));

vi.mock('../src/lib/biosimSidecarClient.js', () => ({
  biosimHealth: M.biosimHealth,
  biosimMontecarlo: M.biosimMontecarlo,
  biosimLod95: M.biosimLod95,
}));
vi.mock('../src/lib/oncologyEngineBridge.js', () => ({
  oncologyManifest: M.oncologyManifest,
  oncologyEvidence: M.oncologyEvidence,
  oncologyMechanismFusion: M.oncologyMechanismFusion,
  oncologyCalibrationState: M.oncologyCalibrationState,
  oncologyDiscoveryLedger: M.oncologyDiscoveryLedger,
}));
vi.mock('../src/lib/scientificApiBridge.js', () => ({
  scientificHealth: M.scientificHealth,
  geneLookup: M.geneLookup,
}));
vi.mock('../src/lib/integrityBridge.js', () => ({
  integrityStatus: M.integrityStatus,
  verifyWork: M.verifyWork,
}));
vi.mock('../src/lib/studyOrchestratorBridge.js', () => ({ orchestratorHealth: M.orchestratorHealth }));
vi.mock('../src/lib/umoeBridge.js', () => ({ umoeHealth: M.umoeHealth, umoeRun: M.umoeRun }));
vi.mock('../src/lib/chemlabBridge.js', () => ({ chemlabHealth: M.chemlabHealth }));
vi.mock('../src/lib/proteinFoldingBridge.js', () => ({ foldingHealth: M.foldingHealth }));
vi.mock('../src/lib/oncoforesightBridge.js', () => ({ foresightStatus: M.foresightStatus }));
vi.mock('../src/lib/fuzzSidecarClient.js', () => ({
  fuzzSidecarHealth: M.fuzzSidecarHealth,
  fuzzDedup: M.fuzzDedup,
}));
vi.mock('../src/lib/kgSidecarClient.js', () => ({
  kgSidecarHealth: M.kgSidecarHealth,
  kgBridges: M.kgBridges,
  oncologyKgToGraph: M.oncologyKgToGraph,
}));
vi.mock('../src/lib/pdfSidecarClient.js', () => ({ pdfSidecarHealth: M.pdfSidecarHealth }));
vi.mock('../src/lib/trendSidecarClient.js', () => ({ trendHealth: M.trendHealth, trendScan: M.trendScan }));
vi.mock('../src/lib/trendSources.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, fetchDomainPageviews: M.fetchDomainPageviews };
});
vi.mock('../src/lib/trendLedger.js', () => ({
  appendInsight: M.appendInsight,
  verifyLedgerChain: M.verifyLedgerChain,
  readLedger: M.readLedger,
}));
vi.mock('../src/lib/axiomBridge.js', () => ({
  axiomReachable: M.axiomReachable,
  integrateAxiomTool: M.integrateAxiomTool,
}));
vi.mock('../src/lib/keywireBridge.js', () => ({
  keywireHealth: M.keywireHealth,
  keywireCallService: M.keywireCallService,
  keywireBrainTask: M.keywireBrainTask,
}));
vi.mock('../src/lib/prometheusBridge.js', () => ({ fetchExport: M.fetchExport }));
vi.mock('../src/lib/translationBridge.js', () => ({
  translationHealth: M.translationHealth,
  translateTerm: M.translateTerm,
  translateMetric: M.translateMetric,
  engineConfig: () => ({ className: 'MockTranslationEngine' }),
}));
vi.mock('../src/lib/templatePlugins/abmCancerSim.js', () => ({
  runAbmLite: M.runAbmLite,
  classifyImmuneNiche: M.classifyImmuneNiche,
}));

let TMP = '';
let sci: typeof import('../src/lib/scienceConductor.js');

const liveResult = (article: string) => ({
  ok: true,
  article,
  points: Array.from({ length: 8 }, (_, i) => ({ t: i + 1, value: 10 + i })),
  latencyMs: 1,
});

const finding = (over: Record<string, unknown> = {}) => ({
  kind: 'dose_response',
  hypothesisId: 'H1',
  problemId: 'P01',
  claim: 'a claim',
  numbers: {},
  provenance: 'test',
  mode: 'sidecar',
  cycle: 1,
  ...over,
});

beforeAll(() => {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sci-cond-test-'));
  // Hermetic: `discoverServices` probes the deterministic brain DIRECTLY with
  // fetch (not through a mocked bridge). Disable all real network so a locally
  // running brain (e.g. :3210) cannot flip the "all offline" assertion.
  vi.stubGlobal('fetch', vi.fn(async () => {
    throw new Error('network disabled in tests');
  }));
});

beforeEach(async () => {
  fs.rmSync(path.join(TMP, 'findings.jsonl'), { force: true });
  fs.rmSync(path.join(TMP, 'cycles.jsonl'), { force: true });
  fs.rmSync(path.join(TMP, 'bounty_drafts.json'), { force: true });
  fs.rmSync(path.join(TMP, 'conductor-state.json'), { force: true });

  vi.unstubAllEnvs();
  vi.stubEnv('SCIENCE_LOOP_DIR', TMP);
  vi.stubEnv('TREND_LEDGER_FILE', path.join(TMP, 'trend-ledger.jsonl'));
  vi.stubEnv('RECOURSE_ORCHESTRATE', '0');
  vi.stubEnv('SCIENCE_AXIOM_BUILD', '0');
  vi.stubEnv('SCIENCE_KEYWIRE_HANDOFF', '0');

  for (const fn of Object.values(M)) (fn as any).mockReset();
  M.biosimHealth.mockResolvedValue({ ok: false, latencyMs: 1 });
  M.biosimMontecarlo.mockResolvedValue({ ok: false });
  M.biosimLod95.mockResolvedValue({ ok: false });
  M.oncologyManifest.mockResolvedValue({ ok: false, latencyMs: 1 });
  M.oncologyEvidence.mockResolvedValue({ ok: false, latencyMs: 1 });
  M.oncologyMechanismFusion.mockResolvedValue({ ok: false, latencyMs: 1 });
  M.oncologyCalibrationState.mockResolvedValue({ ok: false, latencyMs: 1 });
  M.oncologyDiscoveryLedger.mockResolvedValue({ ok: false, latencyMs: 1 });
  M.scientificHealth.mockResolvedValue({ ok: false, latencyMs: 1 });
  M.geneLookup.mockResolvedValue({ ok: false, error: 'offline' });
  M.integrityStatus.mockResolvedValue({ ok: false, latencyMs: 1 });
  M.verifyWork.mockResolvedValue({ ok: false, error: 'offline' });
  M.orchestratorHealth.mockResolvedValue({ ok: false, latencyMs: 1 });
  M.umoeHealth.mockResolvedValue({ ok: false, latencyMs: 1 });
  M.umoeRun.mockResolvedValue({ ok: false, error: 'offline' });
  M.chemlabHealth.mockResolvedValue({ ok: false, latencyMs: 1 });
  M.foldingHealth.mockResolvedValue({ ok: false, latencyMs: 1 });
  M.foresightStatus.mockResolvedValue({ ok: false, latencyMs: 1 });
  M.fuzzSidecarHealth.mockResolvedValue({ ok: false, latencyMs: 1 });
  M.fuzzDedup.mockResolvedValue({ ok: false, error: 'offline' });
  M.kgSidecarHealth.mockResolvedValue({ ok: false, latencyMs: 1 });
  M.kgBridges.mockResolvedValue({ ok: false, error: 'offline' });
  M.oncologyKgToGraph.mockReturnValue({ nodes: [], edges: [] });
  M.pdfSidecarHealth.mockResolvedValue({ ok: false, latencyMs: 1 });
  M.trendHealth.mockResolvedValue({ ok: false, latencyMs: 1 });
  M.trendScan.mockResolvedValue({ ok: false, error: 'offline' });
  M.axiomReachable.mockResolvedValue(false);
  M.integrateAxiomTool.mockResolvedValue({ ok: false, error: 'offline' });
  M.keywireHealth.mockResolvedValue({ ok: false });
  M.keywireCallService.mockResolvedValue({ ok: false });
  M.keywireBrainTask.mockResolvedValue({ ok: false, error: 'offline' });
  M.fetchExport.mockResolvedValue({ ok: false });
  M.fetchDomainPageviews.mockResolvedValue([]);
  M.appendInsight.mockReturnValue(true);
  M.verifyLedgerChain.mockReturnValue({ valid: true, length: 0 });
  M.readLedger.mockReturnValue([]);
  M.translationHealth.mockResolvedValue({ ok: false, latencyMs: 1 });
  M.translateTerm.mockResolvedValue({ ok: false, error: 'offline' });
  M.translateMetric.mockResolvedValue({ ok: false, error: 'offline' });
  M.runAbmLite.mockImplementation((p: any) => [{ tumor: p?.carTDose ? 500 : 1000, immune: 10, stromal: 10, exhaustion: 0 }]);
  M.classifyImmuneNiche.mockReturnValue('inflamed');

  vi.resetModules();
  sci = await import('../src/lib/scienceConductor.js');
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fs.rmSync(TMP, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
describe('path helpers', () => {
  it('honours SCIENCE_LOOP_DIR and derives all ledger paths', () => {
    expect(sci.scienceLoopDir()).toBe(TMP);
    expect(sci.findingsFilePath()).toBe(path.join(TMP, 'findings.jsonl'));
    expect(sci.cyclesFilePath()).toBe(path.join(TMP, 'cycles.jsonl'));
    expect(sci.bountyDraftsFilePath()).toBe(path.join(TMP, 'bounty_drafts.json'));
  });

  it('falls back to data/science-loop when the env override is absent', () => {
    vi.stubEnv('SCIENCE_LOOP_DIR', '');
    expect(sci.scienceLoopDir()).toContain(path.join('data', 'science-loop'));
  });
});

describe('novelty gate', () => {
  it('normalizeClaim collapses case, whitespace, and float noise', () => {
    expect(sci.normalizeClaim('  Cure RATE 31.70%  ')).toBe(sci.normalizeClaim('cure rate 31.7%'));
    expect(sci.normalizeClaim('dose 1.0e+5: x')).not.toBe(sci.normalizeClaim('dose 2.0e+5: x'));
  });

  it('splitNovel partitions novel vs repeats without mutating the set', () => {
    const seen = new Set([sci.normalizeClaim('old claim here')]);
    const findings = [finding({ claim: 'OLD CLAIM HERE' }), finding({ claim: 'brand new claim here' })] as any[];
    const { novel, repeats } = sci.splitNovel(findings, seen);
    expect(novel).toHaveLength(1);
    expect(repeats).toBe(1);
    expect(novel[0].claim).toBe('brand new claim here');
    expect(seen.size).toBe(1);
  });

  it('isNovelClaim / markClaimSeen round-trip', () => {
    expect(sci.isNovelClaim('a brand new unique claim')).toBe(true);
    sci.markClaimSeen('a brand new unique claim');
    expect(sci.isNovelClaim('a brand new unique claim')).toBe(false);
    expect(sci.isNovelClaim('A BRAND NEW UNIQUE CLAIM')).toBe(false);
  });
});

describe('parameter exploration', () => {
  it('dose windows rotate across cycles and cover the grid', () => {
    const d1 = sci.selectDosesForCycle(1);
    const d2 = sci.selectDosesForCycle(2);
    expect(d1).toHaveLength(3);
    expect(d2).toHaveLength(3);
    expect(d1).not.toEqual(d2);
    const all = new Set<number>();
    for (let i = 0; i < 7; i++) for (const d of sci.selectDosesForCycle(i)) all.add(d);
    expect(all.size).toBe(7);
    expect(sci.selectDosesForCycle(4)).toEqual(sci.selectDosesForCycle(4));
  });

  it('LOD depths and trend domains rotate deterministically', () => {
    expect(new Set([0, 1, 2, 3].map(sci.selectLodDepthForCycle)).size).toBe(3);
    expect(sci.selectTrendDomain(0)).toBe('oncology');
    expect(sci.selectTrendDomain(1)).toBe('aging');
    expect(sci.selectTrendDomain(2)).toBe('ai_health');
    expect(sci.selectTrendDomain(3)).toBe('oncology');
  });
});

describe('extractGeneTokens', () => {
  it('extracts gene-like tokens and filters the stoplist', () => {
    const toks = sci.extractGeneTokens('TP53 loss and KRAS mutation drive resistance, per FDA and NIH data on DNA');
    expect(toks).toContain('TP53');
    expect(toks).toContain('KRAS');
    for (const banned of ['FDA', 'NIH', 'DNA']) expect(toks).not.toContain(banned);
  });

  it('dedupes while preserving first-seen order and ignores short/low tokens', () => {
    expect(sci.extractGeneTokens('EGFR then EGFR and ALK')).toEqual(['EGFR', 'ALK']);
    expect(sci.extractGeneTokens('ABC then DEF and ABC')).toEqual(['ABC', 'DEF']);
  });
});

describe('getConductorStatus', () => {
  it('reports stopped state with absolute ledger paths', () => {
    const st = sci.getConductorStatus();
    expect(st.running).toBe(false);
    expect(st.uptimeSeconds).toBe(0);
    expect(st.intervalMs).toBeNull();
    expect(st.findingsFile).toBe(path.join(TMP, 'findings.jsonl'));
    expect(st.cyclesFile).toBe(path.join(TMP, 'cycles.jsonl'));
    expect(typeof st.cyclesRun).toBe('number');
  });
});

// ---------------------------------------------------------------------------
describe('discoverServices', () => {
  it('marks every service offline when the probes fail', async () => {
    const services = await sci.discoverServices(200);
    expect(Object.keys(services).length).toBeGreaterThanOrEqual(9);
    for (const h of Object.values(services)) {
      expect(h.online).toBe(false);
      expect(h.latencyMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('marks reachable services online and captures errors/thrown probes honestly', async () => {
    M.biosimHealth.mockResolvedValue({ ok: true, latencyMs: 5 });
    M.scientificHealth.mockRejectedValue(new Error('kaboom'));
    const services = await sci.discoverServices(200);
    expect(services.biosim).toEqual({ service: 'biosim', online: true, latencyMs: 5, error: undefined });
    expect(services.scientific_api.online).toBe(false);
    expect(services.scientific_api.error).toContain('kaboom');
  });

  it('treats an ok probe with no latency as latency 0', async () => {
    M.umoeHealth.mockResolvedValue({ ok: true });
    const services = await sci.discoverServices(200);
    expect(services.umoe.online).toBe(true);
    expect(services.umoe.latencyMs).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('buildOncologyEvidenceSources', () => {
  it('builds real RawSource rows from the full aggregate surface', async () => {
    M.oncologyEvidence.mockResolvedValue({ ok: true, data: { cohorts: ['TCGA', 'METABRIC'] } });
    M.oncologyMechanismFusion.mockResolvedValue({
      ok: true,
      data: {
        registered_mechanisms: Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, name: `mech${i}`, node_count: i, edge_count: i + 1, domain: 'd' })),
      },
    });
    M.oncologyCalibrationState.mockResolvedValue({
      ok: true,
      data: { potency: { medianIc50: 1.23, n: 5, provenance: { dataHash: 'abcdef0123456789zzz' } } },
    });
    M.oncologyDiscoveryLedger.mockResolvedValue({ ok: true, data: { count: 7 } });

    const { sources, skipped } = await sci.buildOncologyEvidenceSources(500);
    expect(skipped).toEqual([]);
    // 2 cohorts + 5 (sliced) mechanisms + calibration + ledger
    expect(sources).toHaveLength(9);
    expect(sources.map((s) => s.id)).toContain('onc_cohort_TCGA');
    expect(sources.filter((s) => s.id.startsWith('onc_mech_'))).toHaveLength(5);
    expect(sources.find((s) => s.id === 'onc_calibration')!.contentPreview).toContain('abcdef0123456789');
    expect(sources.find((s) => s.id === 'onc_discovery_ledger')!.contentPreview).toContain('7 wet-lab');
    for (const s of sources) expect(s.domain).toBe('oncology.local');
  });

  it('skips each surface route honestly when it is unavailable', async () => {
    M.oncologyEvidence.mockResolvedValue({ ok: true, data: {} });
    M.oncologyMechanismFusion.mockResolvedValue({ ok: true, data: {} });
    M.oncologyCalibrationState.mockResolvedValue({ ok: true, data: {} });
    M.oncologyDiscoveryLedger.mockResolvedValue({ ok: false, error: 'ledger down' });
    const { sources, skipped } = await sci.buildOncologyEvidenceSources(500);
    expect(sources).toEqual([]);
    expect(skipped).toHaveLength(4);
    expect(skipped.join(' ')).toContain('unavailable');
    expect(skipped.join(' ')).toContain('no calibration cached');
    expect(skipped.join(' ')).toContain('ledger down');
  });

  it('records thrown route calls as skipped rather than failing', async () => {
    M.oncologyEvidence.mockRejectedValue(new Error('boom'));
    M.oncologyMechanismFusion.mockRejectedValue(new Error('boom'));
    M.oncologyCalibrationState.mockRejectedValue(new Error('boom'));
    M.oncologyDiscoveryLedger.mockRejectedValue(new Error('boom'));
    const { sources, skipped } = await sci.buildOncologyEvidenceSources(500);
    expect(sources).toEqual([]);
    expect(skipped).toHaveLength(4);
    expect(skipped.every((s) => s.includes('threw'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('runScienceCycle — all services offline', () => {
  it('records an honest local-deterministic cycle', async () => {
    const cycle = await sci.runScienceCycle();
    expect(cycle.problemId).toMatch(/^P\d{2}_/);
    expect(cycle.hypothesisText.length).toBeGreaterThan(0);
    expect(cycle.experimentMode).toBe('local_deterministic');
    expect(cycle.experimentsRun).toBe(2);
    expect(cycle.integrityCheck).toEqual({ submitted: false });
    expect(cycle.axiomBuild).toEqual({ attempted: false, reachable: false, built: false, reason: 'axiom build disabled (SCIENCE_AXIOM_BUILD=0)' });
    expect(cycle.keywireHandoff?.reachable).toBe(false);
    expect(cycle.trendScan?.mode).toBe('seeded_simulated');
    expect(cycle.trendScan?.engine).toBe('ts');
    expect(cycle.skipped.join('|')).toContain('biosim (offline)');
    expect(cycle.skipped.join('|')).toContain('umoe (offline or unused)');
    expect(cycle.skipped.join('|')).toContain('integrity (offline)');
    expect(cycle.enginesUsed).toContain('local_deterministic');
    expect(cycle.enginesUsed).toContain('trend:seeded_simulated');
    expect(cycle.enginesUsed).toContain('researcher');
  });

  it('labels the ABM-lite fallback with local_deterministic provenance', async () => {
    const cycle = await sci.runScienceCycle();
    const fallback = cycle.findings.filter((f) => /abmCancerSim/.test(f.provenance));
    expect(fallback.length).toBeGreaterThanOrEqual(2);
    for (const f of fallback) {
      expect(f.mode).toBe('local_deterministic');
      expect(f.problemId).toBe(cycle.problemId);
    }
    expect(fallback.some((f) => f.kind === 'niche_classification')).toBe(true);
    const dose = fallback.find((f) => f.kind === 'dose_response')!;
    expect(dose.numbers.suppression).toBeGreaterThan(0);
  });

  it('carries provenance + mode on every finding and partitions novelty', async () => {
    const cycle = await sci.runScienceCycle();
    for (const f of cycle.findings) {
      expect(f.provenance.length).toBeGreaterThan(5);
      expect(['sidecar', 'remote_engine', 'local_deterministic']).toContain(f.mode);
      expect(f.problemId).toBe(cycle.problemId);
    }
    expect(cycle.novelCount + cycle.repeatCount).toBe(cycle.findings.length);
    expect(cycle.novelCount).toBeGreaterThan(0);
  });

  it('records a bounty draft for an untouched gap at most once', async () => {
    const first = await sci.runScienceCycle();
    expect(first.enginesUsed).toContain('pathosphere');
    const drafts = first.findings.filter((f) => f.kind === 'bounty_draft');
    expect(drafts.length).toBeGreaterThan(0);
    expect(drafts.every((f) => f.provenance.includes('buildBounty'))).toBe(true);

    const persisted = JSON.parse(fs.readFileSync(sci.bountyDraftsFilePath(), 'utf-8'));
    expect(Array.isArray(persisted)).toBe(true);
    expect(persisted.length).toBeGreaterThanOrEqual(drafts.length);
    // Draft keys are unique: a gap is never drafted twice in one state.
    expect(new Set(persisted).size).toBe(persisted.length);
  });

  it('appends cycles + findings to the ledger and reads them back', async () => {
    const cycle = await sci.runScienceCycle();
    const cycles = sci.recentCycles(5);
    expect(cycles.length).toBeGreaterThan(0);
    expect(cycles[cycles.length - 1].cycle).toBe(cycle.cycle);
    const findings = sci.recentFindings(50);
    expect(findings.length).toBe(cycle.novelCount);
    expect(findingHasArtifact(findings[0])).toBe(true);
  });

  it('returns empty arrays when the ledgers do not exist', () => {
    fs.rmSync(path.join(TMP, 'findings.jsonl'), { force: true });
    fs.rmSync(path.join(TMP, 'cycles.jsonl'), { force: true });
    expect(sci.recentFindings()).toEqual([]);
    expect(sci.recentCycles()).toEqual([]);
  });
});

function findingHasArtifact(f: any): boolean {
  return !!f && typeof f === 'object' && !!f.artifact;
}

// ---------------------------------------------------------------------------
describe('runScienceCycle — biosim sidecar path', () => {
  beforeEach(() => {
    M.biosimHealth.mockResolvedValue({ ok: true, latencyMs: 2 });
    M.biosimMontecarlo.mockResolvedValue({ ok: true, cure_rate: 0.5, recurrence_rate: 0.1, mean_final_burden: 100, n_trials: 120 });
    M.biosimLod95.mockResolvedValue({ ok: true, lod95_vaf: 0.01 });
  });

  it('uses the sidecar, emits dose-response + LOD + monotonicity findings', async () => {
    const cycle = await sci.runScienceCycle();
    expect(cycle.experimentMode).toBe('biosim_sidecar');
    expect(cycle.experimentsRun).toBe(5);
    expect(cycle.enginesUsed).toContain('biosim_sidecar');
    const dose = cycle.findings.filter((f) => f.kind === 'dose_response');
    expect(dose.length).toBeGreaterThanOrEqual(3);
    expect(dose.some((f) => f.claim.includes('cure rate'))).toBe(true);
    expect(cycle.findings.some((f) => f.kind === 'lod_comparison')).toBe(true);
    expect(cycle.findings.some((f) => f.claim.includes('monotone non-decreasing'))).toBe(true);
    expect(M.biosimMontecarlo).toHaveBeenCalledTimes(3);
    expect(M.biosimLod95).toHaveBeenCalledTimes(2);
  });

  it('reports a real non-monotone result as a negative finding', async () => {
    let i = 0;
    M.biosimMontecarlo.mockImplementation(async () => ({ ok: true, cure_rate: 0.9 - i++ * 0.4, n_trials: 120 }));
    const cycle = await sci.runScienceCycle();
    expect(cycle.findings.some((f) => f.claim.includes('NOT monotone'))).toBe(true);
  });

  it('records failed montecarlo arms honestly and still counts experiments', async () => {
    M.biosimMontecarlo.mockResolvedValue({ ok: false });
    M.biosimLod95.mockResolvedValue({ ok: false });
    const cycle = await sci.runScienceCycle();
    expect(cycle.experimentMode).toBe('biosim_sidecar');
    expect(cycle.experimentsRun).toBe(5);
    expect(cycle.findings.some((f) => f.claim.includes('FAILED to produce a cure rate'))).toBe(true);
    expect(cycle.findings.some((f) => f.kind === 'lod_comparison')).toBe(false);
    expect(cycle.findings.some((f) => f.claim.includes('monotone'))).toBe(false);
  });

  it('omits monotonicity when only some arms succeed', async () => {
    let i = 0;
    M.biosimMontecarlo.mockImplementation(async () => (i++ === 0 ? { ok: true, cure_rate: 0.5, n_trials: 120 } : { ok: false }));
    const cycle = await sci.runScienceCycle();
    expect(cycle.findings.some((f) => f.claim.includes('monotone'))).toBe(false);
    expect(cycle.findings.some((f) => f.claim.includes('FAILED'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('runScienceCycle — UMOE path', () => {
  it('uses UMOE when biosim is offline and reports predictions', async () => {
    M.umoeHealth.mockResolvedValue({ ok: true, latencyMs: 2 });
    M.umoeRun.mockResolvedValue({ ok: true, data: { predictions: [{}, {}, {}], errors: [] } });
    const cycle = await sci.runScienceCycle();
    expect(cycle.experimentMode).toBe('umoe_engine');
    expect(cycle.experimentsRun).toBe(1);
    const mech = cycle.findings.find((f) => f.kind === 'mechanistic_run')!;
    expect(mech.mode).toBe('remote_engine');
    expect(mech.numbers.predictions).toBe(3);
    expect(mech.numbers.engine_errors).toBe(0);
  });

  it('reports a UMOE failure without claiming a result', async () => {
    M.umoeHealth.mockResolvedValue({ ok: true, latencyMs: 2 });
    M.umoeRun.mockResolvedValue({ ok: false, error: 'engine down' });
    const cycle = await sci.runScienceCycle();
    expect(cycle.experimentMode).toBe('umoe_engine');
    const mech = cycle.findings.find((f) => f.kind === 'mechanistic_run')!;
    expect(mech.claim).toContain('failed');
    expect(mech.claim).toContain('engine down');
    expect(mech.numbers).toEqual({});
  });

  it('counts engine errors when UMOE returns them', async () => {
    M.umoeHealth.mockResolvedValue({ ok: true, latencyMs: 2 });
    M.umoeRun.mockResolvedValue({ ok: true, data: { predictions: [{}], errors: [{}, {}] } });
    const cycle = await sci.runScienceCycle();
    const mech = cycle.findings.find((f) => f.kind === 'mechanistic_run')!;
    expect(mech.numbers.engine_errors).toBe(2);
    expect(mech.claim).toContain('engine errors');
  });
});

// ---------------------------------------------------------------------------
describe('runScienceCycle — capability phase (fuzz + kg)', () => {
  beforeEach(() => {
    M.biosimHealth.mockResolvedValue({ ok: true, latencyMs: 2 });
    M.biosimMontecarlo.mockResolvedValue({ ok: true, cure_rate: 0.5, n_trials: 120 });
    M.biosimLod95.mockResolvedValue({ ok: true, lod95_vaf: 0.01 });
  });

  it('runs fuzz dedup + kg bridges over the real cycle findings', async () => {
    M.fuzzSidecarHealth.mockResolvedValue({ ok: true, latencyMs: 1 });
    M.fuzzDedup.mockResolvedValue({ ok: true, input_names: 6, cluster_count: 3, dedup_savings: 3 });
    M.kgSidecarHealth.mockResolvedValue({ ok: true, latencyMs: 1 });
    M.oncologyKgToGraph.mockReturnValue({ nodes: [{ id: 'drug:EGFR', attrs: { kind: 'drug' } }], edges: [] });
    M.kgBridges.mockResolvedValue({ ok: true, paths: [{}, {}], to_proven_hub: 'proven_hub', reached_proven: true });

    const cycle = await sci.runScienceCycle();
    const dedup = cycle.findings.find((f) => f.kind === 'dedup')!;
    expect(dedup.numbers).toEqual({ input_claims: 6, clusters: 3, savings: 3 });
    const bridge = cycle.findings.find((f) => f.kind === 'kg_bridge')!;
    expect(bridge.numbers).toEqual({ paths: 2, reached_proven: 1 });
    expect(cycle.enginesUsed).toContain('fuzz');
    expect(cycle.enginesUsed).toContain('kg');
  });

  it('records capability failures/skips honestly', async () => {
    M.fuzzSidecarHealth.mockResolvedValue({ ok: true, latencyMs: 1 });
    M.fuzzDedup.mockResolvedValue({ ok: false, error: 'fuzz down' });
    M.kgSidecarHealth.mockResolvedValue({ ok: true, latencyMs: 1 });
    M.oncologyKgToGraph.mockReturnValue({ nodes: [], edges: [] });

    const cycle = await sci.runScienceCycle();
    const skipped = cycle.skipped.join('|');
    expect(skipped).toContain('fuzz dedup failed: fuzz down');
    expect(skipped).toContain('empty graph payload');
    expect(cycle.findings.some((f) => f.kind === 'dedup')).toBe(false);
    expect(cycle.findings.some((f) => f.kind === 'kg_bridge')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('runScienceCycle — evidence + translation phases', () => {
  beforeEach(() => {
    M.biosimHealth.mockResolvedValue({ ok: true, latencyMs: 2 });
    M.biosimMontecarlo.mockResolvedValue({ ok: true, cure_rate: 0.5, n_trials: 120 });
    M.biosimLod95.mockResolvedValue({ ok: true, lod95_vaf: 0.01 });
  });

  it('emits gene lookups and BB-Tech translation findings when online', async () => {
    M.scientificHealth.mockResolvedValue({ ok: true, latencyMs: 1 });
    M.geneLookup.mockResolvedValue({ ok: true, data: { symbol: 'TP53', name: 'p53' } });
    M.translationHealth.mockResolvedValue({ ok: true, latencyMs: 1 });
    M.translateTerm.mockResolvedValue({
      ok: true,
      result: { bidirectional_possible: true, domain: 'basketball', target_term: 'pick_and_roll', confidence: 0.81, description: 'engine output' },
    });
    M.translateMetric.mockResolvedValue({ ok: true, result: { translated: 1.234, translated_unit: 'x', description: 'converted' } });

    const cycle = await sci.runScienceCycle();
    expect(cycle.findings.some((f) => f.kind === 'gene_lookup')).toBe(true);
    expect(cycle.findings.some((f) => f.kind === 'translation_mapping')).toBe(true);
    const metric = cycle.findings.find((f) => f.kind === 'translation_metric')!;
    expect(metric.numbers.source_value).toBe(50);
    expect(metric.numbers.translated).toBeCloseTo(1.234, 3);
    expect(cycle.enginesUsed).toContain('scientific_api');
    expect(cycle.enginesUsed).toContain('translation:bbtech');
  });

  it('reports a no-analog translation honestly', async () => {
    M.translationHealth.mockResolvedValue({ ok: true, latencyMs: 1 });
    M.translateTerm.mockResolvedValue({
      ok: true,
      result: { bidirectional_possible: false, domain: 'basketball', target_term: '', confidence: 0, description: '' },
    });
    const cycle = await sci.runScienceCycle();
    const mapping = cycle.findings.find((f) => f.kind === 'translation_mapping')!;
    expect(mapping.claim).toContain('no basketball analog');
    expect(mapping.numbers.bidirectional).toBe(0);
  });

  it('skips gene + translation work when the services fail', async () => {
    M.scientificHealth.mockResolvedValue({ ok: true, latencyMs: 1 });
    M.geneLookup.mockResolvedValue({ ok: false, error: 'no gene' });
    M.translationHealth.mockResolvedValue({ ok: true, latencyMs: 1 });
    M.translateTerm.mockResolvedValue({ ok: false, error: 'no term' });
    M.biosimMontecarlo.mockResolvedValue({ ok: false });
    M.biosimLod95.mockResolvedValue({ ok: false });

    const cycle = await sci.runScienceCycle();
    const skipped = cycle.skipped.join('|');
    expect(skipped).toContain('scientific_api gene');
    expect(skipped).toContain('no gene');
    expect(skipped).toContain('translation metric: no dose_response cure rate');
    expect(cycle.findings.some((f) => f.kind === 'gene_lookup')).toBe(false);
    expect(cycle.findings.some((f) => f.kind === 'translation_mapping')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('runScienceCycle — trend phase', () => {
  it('prefers the Python sidecar when it is online with statsmodels', async () => {
    M.fetchDomainPageviews.mockResolvedValue([liveResult('a'), liveResult('b')]);
    M.trendHealth.mockResolvedValue({ ok: true, statsmodels: true, latencyMs: 1 });
    M.trendScan.mockResolvedValue({
      ok: true,
      anomalies: [{ series_id: 'wiki_a', type: 'spike', t: 3, score: 3.2, value: 12 }],
      bursts: [{ series_id: 'wiki_a', start: 1, end: 4, strength: 2.5 }],
      momentum: [{ series_id: 'wiki_b', z_acceleration: 1.1 }],
      cross_domain: [{ a: 'wiki_a', b: 'wiki_b', best_lag: 1, correlation: 0.8, significant: true }],
    });
    const cycle = await sci.runScienceCycle();
    expect(cycle.trendScan?.mode).toBe('wikipedia_live');
    expect(cycle.trendScan?.engine).toBe('python_sidecar');
    expect(cycle.trendScan?.anomalyCount).toBe(1);
    expect(cycle.trendScan?.hypothesisCount).toBeGreaterThan(0);
    expect(cycle.trendScan?.insightsAppended).toBeGreaterThan(0);
  });

  it('falls back to the pure-TS engine when the sidecar is offline', async () => {
    M.fetchDomainPageviews.mockResolvedValue([liveResult('a'), liveResult('b')]);
    M.trendHealth.mockResolvedValue({ ok: false, latencyMs: 1 });
    const cycle = await sci.runScienceCycle();
    expect(cycle.trendScan?.mode).toBe('wikipedia_live');
    expect(cycle.trendScan?.engine).toBe('ts');
  });

  it('returns null when the trend phase throws', async () => {
    M.fetchDomainPageviews.mockRejectedValue(new Error('wikipedia down'));
    const cycle = await sci.runScienceCycle();
    expect(cycle.trendScan).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('runScienceCycle — axiom + keywire + integrity', () => {
  beforeEach(() => {
    M.biosimHealth.mockResolvedValue({ ok: true, latencyMs: 2 });
    M.biosimMontecarlo.mockResolvedValue({ ok: true, cure_rate: 0.5, n_trials: 120 });
    M.biosimLod95.mockResolvedValue({ ok: true, lod95_vaf: 0.01 });
  });

  it('reports axiom unreachable when enabled but down', async () => {
    vi.stubEnv('SCIENCE_AXIOM_BUILD', '1');
    M.axiomReachable.mockResolvedValue(false);
    const cycle = await sci.runScienceCycle();
    expect(cycle.axiomBuild).toEqual({ attempted: true, reachable: false, built: false, reason: 'axiom unreachable (:3198)' });
  });

  it('records a built tool when Axiom accepts it', async () => {
    vi.stubEnv('SCIENCE_AXIOM_BUILD', '1');
    M.axiomReachable.mockResolvedValue(true);
    M.integrateAxiomTool.mockResolvedValue({ ok: true, selfHosted: { name: 'axdose_built' } });
    const cycle = await sci.runScienceCycle();
    expect(cycle.axiomBuild?.built).toBe(true);
    expect(cycle.axiomBuild?.archetype).toBeDefined();
    expect(cycle.enginesUsed.some((e) => e.startsWith('axiom:'))).toBe(true);
    expect(M.integrateAxiomTool).toHaveBeenCalledTimes(1);
  });

  it('reports an axiom build failure honestly', async () => {
    vi.stubEnv('SCIENCE_AXIOM_BUILD', '1');
    M.axiomReachable.mockResolvedValue(true);
    M.integrateAxiomTool.mockResolvedValue({ ok: false, error: 'sandbox refused' });
    const cycle = await sci.runScienceCycle();
    expect(cycle.axiomBuild?.built).toBe(false);
    expect(cycle.axiomBuild?.reason).toBe('sandbox refused');
  });

  it('walks the keywire fleet handoff and submits a brain task', async () => {
    vi.stubEnv('SCIENCE_KEYWIRE_HANDOFF', '1');
    M.keywireHealth.mockResolvedValue({ ok: true, summary: { health: 'healthy', servers: { taken: 2, total: 3 } } });
    M.keywireCallService.mockImplementation(async (id: string) => ({ ok: true, service: { id } }));
    M.keywireBrainTask.mockResolvedValue({ ok: true });
    const cycle = await sci.runScienceCycle();
    expect(cycle.keywireHandoff?.reachable).toBe(true);
    expect(cycle.keywireHandoff?.fleetHealth).toBe('healthy');
    expect(cycle.keywireHandoff?.servicesTaken).toBe(2);
    expect(cycle.keywireHandoff?.servicesTotal).toBe(3);
    expect(cycle.keywireHandoff?.servicesEnsured).toEqual(['draymond', 'brain']);
    expect(cycle.keywireHandoff?.brainTaskSubmitted).toBe(true);
    expect(cycle.keywireHandoff?.brainOk).toBe(true);
    expect(cycle.enginesUsed).toContain('keywire-brain');
  });

  it('reports a failed brain task without fabricating success', async () => {
    vi.stubEnv('SCIENCE_KEYWIRE_HANDOFF', '1');
    M.keywireHealth.mockResolvedValue({ ok: true, summary: { health: 'degraded' } });
    M.keywireCallService.mockResolvedValue({ ok: false });
    M.keywireBrainTask.mockResolvedValue({ ok: false, error: 'brain down' });
    const cycle = await sci.runScienceCycle();
    expect(cycle.keywireHandoff?.brainOk).toBe(false);
    expect(cycle.keywireHandoff?.brainError).toBe('brain down');
    expect(cycle.enginesUsed).not.toContain('keywire-brain');
  });

  it('captures the integrity verification document when online', async () => {
    M.integrityStatus.mockResolvedValue({ ok: true, latencyMs: 1 });
    M.verifyWork.mockResolvedValue({
      ok: true,
      data: { document: { verification_document: { document_id: 'doc-1', compliance_score: 0.92 } } },
    });
    const cycle = await sci.runScienceCycle();
    expect(cycle.integrityCheck).toEqual({ submitted: true, passed: true, documentId: 'doc-1', complianceScore: 0.92 });
  });

  it('records a submitted-but-unverified integrity check when no document returns', async () => {
    M.integrityStatus.mockResolvedValue({ ok: true, latencyMs: 1 });
    M.verifyWork.mockResolvedValue({ ok: true, data: {} });
    const cycle = await sci.runScienceCycle();
    expect(cycle.integrityCheck.submitted).toBe(true);
    expect(cycle.integrityCheck.passed).toBe(false);
  });

  it('records an integrity failure when verifyWork errors', async () => {
    M.integrityStatus.mockResolvedValue({ ok: true, latencyMs: 1 });
    M.verifyWork.mockResolvedValue({ ok: false, error: 'integrity rejected' });
    const cycle = await sci.runScienceCycle();
    expect(cycle.integrityCheck).toEqual({ submitted: true, passed: false, error: 'integrity rejected' });
  });
});

// ---------------------------------------------------------------------------
describe('runScienceCycle — prometheus evidence + oncology aggregate', () => {
  it('joins prometheus hypotheses into the evidence corpus', async () => {
    M.fetchExport.mockResolvedValue({ ok: true, rows: [{ id: 'p1', title: 'prom hypothesis', summary: 'summary text' }] });
    const cycle = await sci.runScienceCycle();
    // The researcher always contributes when a problem has sources.
    expect(cycle.enginesUsed).toContain('researcher');
  });

  it('joins oncology aggregate evidence when the host is online', async () => {
    M.oncologyManifest.mockResolvedValue({ ok: true, latencyMs: 1, manifest: {} });
    M.oncologyEvidence.mockResolvedValue({ ok: true, data: { cohorts: ['TCGA'] } });
    M.oncologyMechanismFusion.mockResolvedValue({ ok: true, data: { registered_mechanisms: [] } });
    M.oncologyCalibrationState.mockResolvedValue({ ok: false, latencyMs: 1, error: 'none' });
    M.oncologyDiscoveryLedger.mockResolvedValue({ ok: true, data: { count: 0 } });
    const cycle = await sci.runScienceCycle();
    expect(cycle.enginesUsed).toContain('oncology-evidence');
    expect(cycle.skipped.some((s) => s.startsWith('oncology-evidence:'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('conductor lifecycle', () => {
  it('start/stop toggles state with an overlap guard', async () => {
    const before = sci.getConductorStatus().cyclesRun;
    const s = sci.startScienceConductor({ intervalMs: 60_000 });
    expect(s.started).toBe(true);
    expect(sci.startScienceConductor({ intervalMs: 60_000 })).toEqual({ started: false, reason: 'already running' });
    const status = sci.getConductorStatus();
    expect(status.running).toBe(true);
    expect(status.intervalMs).toBe(60_000);
    expect(status.uptimeSeconds).toBeGreaterThanOrEqual(0);
    // Let the immediately-triggered first cycle finish before stopping.
    await vi.waitFor(() => expect(sci.getConductorStatus().cyclesRun).toBeGreaterThan(before));
    expect(sci.stopScienceConductor()).toEqual({ stopped: true });
    expect(sci.getConductorStatus().running).toBe(false);
    expect(sci.stopScienceConductor()).toEqual({ stopped: false, reason: 'not running' });
  });

  it('clamps the interval to at least 60s', async () => {
    const before = sci.getConductorStatus().cyclesRun;
    sci.startScienceConductor({ intervalMs: 1 });
    expect(sci.getConductorStatus().intervalMs).toBe(60_000);
    await vi.waitFor(() => expect(sci.getConductorStatus().cyclesRun).toBeGreaterThan(before));
    sci.stopScienceConductor();
  });
});
