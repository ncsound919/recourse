import { describe, expect, it } from 'vitest';
import { DreamingEngine, mulberry32, hashString } from '../src/dream/engine';
import { InMemoryDreamStore } from '../src/dream/store';
import { generateGenome, mutateGenome } from '../src/dream/genomes';
import type { DreamState, DreamThought, GenomeSpec, TickResult } from '../src/dream/types';
import type { DreamGeneratorResult } from '../src/dream/engine';

const PARENT_GENOME = generateGenome('math', mulberry32(999));

function baseState(seed: number): DreamState {
  return {
    isDreamingActive: true,
    currentPhase: 'rem_counterfactual_sim',
    dreamCyclesCompleted: 0,
    cognitiveCoherence: 0.5,
    totalCrystallizedGenes: 0,
    recentThoughts: [],
    registry: [],
    seed,
    tick: 0,
    lastTickAt: null,
    prunedCount: 0,
  };
}

function thought(
  id: string,
  domain: DreamThought['domain'],
  genome: GenomeSpec | undefined,
  extra: Partial<DreamThought> = {},
): DreamThought {
  return {
    id,
    phase: 'rem_counterfactual_sim',
    domain,
    premise: 'p',
    hypothesis: 'h',
    simulatedOutcome: 's',
    intensity: 0.9,
    crystallizationReadiness: 0.5,
    genome,
    createdAt: new Date().toISOString(),
    tick: 0,
    ...extra,
  };
}

function expectedThoughtId(seed: number, tick: number, domain: string, kind: string, provenance: string[]): string {
  const joined = provenance.join('>');
  return `dt_${hashString(`${seed}:${tick}:${domain}:${kind}:${joined}`).toString(16).padStart(8, '0').slice(0, 10)}`;
}

const signals = {
  readinessScore: () => 0.85,
  legoAssemblyCount: () => 3,
  learnerEpisode: () => 12,
  learnerCalibration: () => 0.5,
};

describe('mulberry32 / hashString primitives', () => {
  it('hashString is FNV-1a: empty input yields the offset basis and "abc" is reproducible by hand', () => {
    expect(hashString('')).toBe(0x811c9dc5);
    let h = 0x811c9dc5;
    for (const ch of 'abc') {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 0x01000193);
    }
    expect(hashString('abc')).toBe(h >>> 0);
    expect(hashString('abc')).toBe(440920331);
  });

  it('mulberry32 emits identical sequences for identical seeds and differs across seeds', () => {
    const a = mulberry32(1337);
    const b = mulberry32(1337);
    const c = mulberry32(1338);
    const seqA = [a(), a(), a()];
    expect(seqA).toEqual([b(), b(), b()]);
    expect([c(), c(), c()]).not.toEqual(seqA);
  });
});

describe('status / toggle / genesis defaults', () => {
  it('fresh store reports a default inactive state seeded with three genesis thoughts', async () => {
    const store = new InMemoryDreamStore();
    const engine = new DreamingEngine(store, 7777);
    const s = await engine.status();
    expect(s.isDreamingActive).toBe(false);
    expect(s.tick).toBe(0);
    expect(s.currentPhase).toBe('rem_counterfactual_sim');
    expect(s.recentThoughts).toHaveLength(3);
    for (const t of s.recentThoughts) {
      expect(t.origin).toBe('rule_based');
      expect(t.provenance).toEqual(['genesis_seed']);
      expect(t.simulatedOutcome).toContain('invariants hold');
      expect(t.invariantChecks?.length).toBeGreaterThan(0);
    }
  });

  it('toggle flips the persisted active flag and writes it to the store', async () => {
    const store = new InMemoryDreamStore();
    const engine = new DreamingEngine(store, 500);
    expect(await engine.toggle()).toBe(true);
    expect((await store.load())?.isDreamingActive).toBe(true);
    expect(await engine.toggle()).toBe(false);
    expect((await store.load())?.isDreamingActive).toBe(false);
  });

  it('tick from an invalid phase resets to the first REM phase before processing', async () => {
    const store = new InMemoryDreamStore();
    const st = baseState(501);
    st.currentPhase = 'idle';
    await store.save(st);
    const engine = new DreamingEngine(store, 501);
    const r = await engine.tick();
    expect(r.dreamState.currentPhase).toBe('synaptic_pruning');
    expect(r.phaseReport).toContain('REM simulated');
  });
});

describe('REM phase (rule-based, model offline)', () => {
  it('with an empty stream it creates a genesis-seeded thought with hand-computed id and stats', async () => {
    const store = new InMemoryDreamStore();
    const st = baseState(12345);
    st.recentThoughts = [];
    await store.save(st);
    const engine = new DreamingEngine(store, 12345);
    const r = await engine.tick();

    expect(r.phaseReport).toBe('REM simulated 1 counterfactual mutation (model offline or declined; rule-based)');
    expect(r.newThought).not.toBeNull();
    const t = r.newThought!;
    expect(t.domain).toBe('coding');
    expect(t.origin).toBe('rule_based');
    expect(t.provenance).toEqual(['parameter_mutation', 'genesis_seed']);
    expect(t.parentId).toBeUndefined();
    expect(t.genome?.kind).toBe('cyclomatic_pressure_scorer');
    expect(t.intensity).toBe(0.89);
    expect(t.crystallizationReadiness).toBe(0.62);
    expect(t.id).toBe('dt_734ab6bd');
    expect(t.id).toBe(expectedThoughtId(12345, 1, 'coding', 'cyclomatic_pressure_scorer', ['parameter_mutation', 'genesis_seed']));
    expect(r.dreamState.recentThoughts[0].id).toBe(t.id);
  });

  it('mutates the parent genome when the picked domain matches and the roll is below 0.6 (seed 8)', async () => {
    const store = new InMemoryDreamStore();
    const st = baseState(8);
    st.recentThoughts = [thought('parent1', 'math', PARENT_GENOME)];
    await store.save(st);
    const engine = new DreamingEngine(store, 8);
    const r = await engine.tick();

    const created = r.dreamState.recentThoughts.find((t) => t.id !== 'parent1')!;
    expect(created.domain).toBe('math');
    expect(created.parentId).toBe('parent1');
    expect(created.provenance).toEqual(['edge_case_stress', 'mutated:parent1']);
    expect(created.genome?.kind).toBe('lagrange_extrapolator');
    expect(created.genome?.params).toEqual({ epsilon: 9.598614e-7, clamp: 3092.8504, decimals: 3.9707367 });
    expect(created.intensity).toBe(0.59);
    expect(created.crystallizationReadiness).toBe(0.57);
    expect(created.id).toBe('dt_3dc28b19');
    expect(created.id).toBe(expectedThoughtId(8, 1, 'math', 'lagrange_extrapolator', ['edge_case_stress', 'mutated:parent1']));
  });

  it('keeps a fresh genome when the picked domain differs from the parent domain (seed 3)', async () => {
    const store = new InMemoryDreamStore();
    const st = baseState(3);
    st.recentThoughts = [thought('parent1', 'math', PARENT_GENOME)];
    await store.save(st);
    const engine = new DreamingEngine(store, 3);
    const r = await engine.tick();

    const created = r.dreamState.recentThoughts.find((t) => t.id !== 'parent1')!;
    expect(created.domain).toBe('neuro_symbolic');
    expect(created.parentId).toBe('parent1');
    expect(created.genome?.kind).toBe('token_entropy_scorer');
    expect(created.genome?.kind).not.toBe(PARENT_GENOME.kind);
  });

  it('keeps a fresh genome when the roll is >= 0.6 even on a matching domain (seed 12)', async () => {
    const store = new InMemoryDreamStore();
    const st = baseState(12);
    st.recentThoughts = [thought('parent1', 'math', PARENT_GENOME)];
    await store.save(st);
    const engine = new DreamingEngine(store, 12);
    const r = await engine.tick();

    const created = r.dreamState.recentThoughts.find((t) => t.id !== 'parent1')!;
    expect(created.domain).toBe('math');
    expect(created.provenance).toEqual(['edge_case_stress', 'mutated:parent1']);
    expect(created.genome?.params).toEqual({ epsilon: 4.7897822e-7, clamp: 1446.4826, decimals: 4.0800249 });
    expect(created.genome?.params).not.toEqual(PARENT_GENOME.params);
    expect(created.id).toBe('dt_5cf33970');
  });
});

describe('cross-pollination phase', () => {
  it('returns no offspring when the stream holds fewer than two thoughts', async () => {
    const store = new InMemoryDreamStore();
    const st = baseState(123);
    st.currentPhase = 'cross_pollination';
    st.recentThoughts = [thought('solo', 'math', PARENT_GENOME)];
    await store.save(st);
    const engine = new DreamingEngine(store, 123);
    const r = await engine.tick();
    expect(r.newThought).toBeNull();
    expect(r.phaseReport).toBe('No viable cross-domain pair found this cycle');
    expect(r.dreamState.recentThoughts).toHaveLength(1);
  });

  it('aborts when the two picked thoughts share a domain', async () => {
    const store = new InMemoryDreamStore();
    const st = baseState(0);
    st.currentPhase = 'cross_pollination';
    st.recentThoughts = [
      thought('m1', 'math', PARENT_GENOME),
      thought('m2', 'math', PARENT_GENOME),
    ];
    await store.save(st);
    const engine = new DreamingEngine(store, 0);
    const r = await engine.tick();
    expect(r.newThought).toBeNull();
    expect(r.phaseReport).toBe('No viable cross-domain pair found this cycle');
  });

  it('crosses two different-domain genomes into a hybrid offspring (seed 0)', async () => {
    const mathGenome = generateGenome('math', mulberry32(43));
    const codingGenome = generateGenome('coding', mulberry32(42));
    const store = new InMemoryDreamStore();
    const st = baseState(0);
    st.currentPhase = 'cross_pollination';
    st.recentThoughts = [
      thought('a_math', 'math', mathGenome),
      thought('b_coding', 'coding', codingGenome),
    ];
    await store.save(st);
    const engine = new DreamingEngine(store, 0);
    const r = await engine.tick();

    expect(r.newThought).not.toBeNull();
    const t = r.newThought!;
    expect(t.id).toBe('dt_e94bafa6');
    expect(t.id).toBe(expectedThoughtId(0, 1, 'coding', 'cyclomatic_pressure_scorer', ['cross_pollination', 'base:b_coding', 'transplant:a_math']));
    expect(t.domain).toBe('coding');
    expect(t.genome?.kind).toBe('cyclomatic_pressure_scorer');
    expect(t.provenance).toEqual(['cross_pollination', 'base:b_coding', 'transplant:a_math']);
    expect(t.parentId).toBe('b_coding');
    expect(t.secondParentId).toBe('a_math');
    expect(t.intensity).toBe(0.74);
    expect(t.crystallizationReadiness).toBe(0.59);
    expect(r.phaseReport).toBe('Cross-pollinated a coding gene with transplanted parameters');
  });

  it('builds an offspring from an unverifiable hybrid genome at lowered readiness (seed 3)', async () => {
    const failingLagrange: GenomeSpec = { kind: 'lagrange_extrapolator', domain: 'math', params: { epsilon: 1e-9, clamp: 1, decimals: 3 } };
    const codingGenome = generateGenome('coding', mulberry32(42));
    const store = new InMemoryDreamStore();
    const st = baseState(3);
    st.currentPhase = 'cross_pollination';
    st.recentThoughts = [
      thought('xa', 'math', failingLagrange),
      thought('xb', 'coding', codingGenome),
    ];
    await store.save(st);
    const engine = new DreamingEngine(store, 3);
    const r = await engine.tick();

    expect(r.newThought).not.toBeNull();
    const t = r.newThought!;
    expect(t.domain).toBe('math');
    expect(t.genome?.kind).toBe('lagrange_extrapolator');
    expect(t.provenance).toEqual(['cross_pollination', 'base:xa', 'transplant:xb']);
    expect(t.parentId).toBe('xa');
    expect(t.secondParentId).toBe('xb');
    expect(t.crystallizationReadiness).toBe(0.34);
    expect(t.intensity).toBe(0.64);
    expect(t.id).toBe('dt_ebd3f405');
    expect(t.id).toBe(expectedThoughtId(3, 1, 'math', 'lagrange_extrapolator', ['cross_pollination', 'base:xa', 'transplant:xb']));
    expect(r.phaseReport).toBe('Cross-pollinated a math gene with transplanted parameters');
  });
});

describe('theorem induction phase', () => {
  it('skips thoughts below the intensity threshold without touching them', async () => {
    const store = new InMemoryDreamStore();
    const st = baseState(100);
    st.currentPhase = 'theorem_induction';
    st.recentThoughts = [thought('low', 'math', undefined, { intensity: 0.3, crystallizationReadiness: 0.6 })];
    await store.save(st);
    const engine = new DreamingEngine(store, 100);
    const r = await engine.tick();
    expect(r.phaseReport).toBe('Theorem induction verified 0 thoughts');
    expect(st.recentThoughts[0].crystallizationReadiness).toBe(0.6);
    expect(st.recentThoughts[0].invariantChecks).toBeUndefined();
  });

  it('marks a thought with neither code nor genome as unverifiable and lowers readiness', async () => {
    const store = new InMemoryDreamStore();
    const st = baseState(101);
    st.currentPhase = 'theorem_induction';
    st.recentThoughts = [thought('unv', 'math', undefined, { intensity: 0.8, crystallizationReadiness: 0.6 })];
    await store.save(st);
    const engine = new DreamingEngine(store, 101);
    const r = await engine.tick();
    expect(r.phaseReport).toBe('Theorem induction verified 0 thoughts');
    expect(st.recentThoughts[0].crystallizationReadiness).toBe(0.5);
    expect(st.recentThoughts[0].simulatedOutcome).toBe('unverifiable thought (no code and no genome)');
    expect(st.recentThoughts[0].invariantChecks).toEqual([]);
  });

  it('lowers readiness when model code fails the real sandbox', async () => {
    const store = new InMemoryDreamStore();
    const st = baseState(102);
    st.currentPhase = 'theorem_induction';
    st.recentThoughts = [thought('failcode', 'math', undefined, {
      intensity: 0.8,
      crystallizationReadiness: 0.6,
      code: 'export function double(x) { return x * 2 + 1; }',
      codeTests: 'assert double(2) === 4;',
      origin: 'api_model',
    })];
    await store.save(st);
    const engine = new DreamingEngine(store, 102);
    const r = await engine.tick();
    expect(r.phaseReport).toBe('Theorem induction verified 0 thoughts');
    expect(st.recentThoughts[0].crystallizationReadiness).toBe(0.5);
    expect(st.recentThoughts[0].simulatedOutcome).toContain('model code FAILED real sandbox');
    expect(st.recentThoughts[0].invariantChecks?.[0]).toMatchObject({ name: expect.stringContaining('[FAIL]'), passed: false });
  });

  it('reports unknown failure detail when a suite fails without a [FAIL] line', async () => {
    const store = new InMemoryDreamStore();
    const st = baseState(104);
    st.currentPhase = 'theorem_induction';
    st.recentThoughts = [thought('syntax', 'math', undefined, {
      intensity: 0.8,
      crystallizationReadiness: 0.6,
      code: 'export function double(x { return x * 2; }',
      codeTests: 'assert double(2) === 4;',
      origin: 'api_model',
    })];
    await store.save(st);
    const engine = new DreamingEngine(store, 104);
    await engine.tick();
    expect(st.recentThoughts[0].simulatedOutcome).toBe('model code FAILED real sandbox: unknown');
    expect(st.recentThoughts[0].invariantChecks?.[0]).toMatchObject({ name: expect.stringContaining('[COMPILATION ERROR]'), passed: false });
    expect(st.recentThoughts[0].crystallizationReadiness).toBe(0.5);
  });

  it('raises readiness for a passing genome thought', async () => {
    const store = new InMemoryDreamStore();
    const st = baseState(103);
    st.currentPhase = 'theorem_induction';
    st.recentThoughts = [thought('pass', 'math', PARENT_GENOME, { intensity: 0.8, crystallizationReadiness: 0.6 })];
    await store.save(st);
    const engine = new DreamingEngine(store, 103);
    const r = await engine.tick();
    expect(r.phaseReport).toBe('Theorem induction verified 1 thought');
    expect(st.recentThoughts[0].crystallizationReadiness).toBe(0.72);
    expect(st.recentThoughts[0].simulatedOutcome).toContain('invariants hold');
  });
});

describe('lucid crystallization phase (auto-promotion)', () => {
  it('auto-promotes a verified genome thought at >=90% readiness into the registry', async () => {
    const store = new InMemoryDreamStore();
    const st = baseState(555);
    st.currentPhase = 'lucid_crystallization';
    st.recentThoughts = [thought('promo1', 'math', PARENT_GENOME, { crystallizationReadiness: 0.95 })];
    await store.save(st);
    const engine = new DreamingEngine(store, 555);
    const r = await engine.tick();

    expect(r.phaseReport).toBe('Auto-promoted 1 verified gene: MATH_LAGRANGE_omo1');
    expect(st.registry).toHaveLength(1);
    const tool = st.registry[0];
    expect(tool.name).toBe('MATH_LAGRANGE_omo1');
    expect(tool.kind).toBe('lagrange_extrapolator');
    expect(tool.domain).toBe('math');
    expect(tool.verified).toBe(true);
    expect(tool.fromThoughtId).toBe('promo1');
    expect(tool.id).toBe('tool_promo1');
    expect(tool.code).toContain('function lagrangeExtrapolator');
    expect(st.totalCrystallizedGenes).toBe(1);
    expect(st.recentThoughts).toHaveLength(0);
  });

  it('never promotes a thought whose genome fails verification and lowers its readiness', async () => {
    const store = new InMemoryDreamStore();
    const st = baseState(556);
    st.currentPhase = 'lucid_crystallization';
    st.recentThoughts = [thought('promo2', 'math', { kind: 'bogus_kind', domain: 'math', params: {} }, { crystallizationReadiness: 0.95 })];
    await store.save(st);
    const engine = new DreamingEngine(store, 556);
    const r = await engine.tick();

    expect(r.phaseReport).toBe('No thoughts at >=90% readiness for auto-promotion');
    expect(st.registry).toHaveLength(0);
    expect(st.recentThoughts[0].crystallizationReadiness).toBe(0.75);
    expect(st.recentThoughts[0].simulatedOutcome).toBe('unknown gene kind');
  });

  it('skips a high-readiness thought that carries no genome', async () => {
    const store = new InMemoryDreamStore();
    const st = baseState(557);
    st.currentPhase = 'lucid_crystallization';
    st.recentThoughts = [thought('promo3', 'math', undefined, { crystallizationReadiness: 0.95 })];
    await store.save(st);
    const engine = new DreamingEngine(store, 557);
    const r = await engine.tick();
    expect(r.phaseReport).toBe('No thoughts at >=90% readiness for auto-promotion');
    expect(st.registry).toHaveLength(0);
    expect(st.recentThoughts[0].crystallizationReadiness).toBe(0.95);
  });

  it('auto-promotes multiple verified genes at once and reports their names', async () => {
    const store = new InMemoryDreamStore();
    const st = baseState(558);
    st.currentPhase = 'lucid_crystallization';
    st.recentThoughts = [
      thought('pA', 'math', { kind: 'lagrange_extrapolator', domain: 'math', params: { epsilon: 1e-7, clamp: 100, decimals: 4 } }, { crystallizationReadiness: 0.95 }),
      thought('pB', 'coding', { kind: 'cyclomatic_pressure_scorer', domain: 'coding', params: { branchWeight: 1, loopWeight: 1, pressureCap: 100 } }, { crystallizationReadiness: 0.95 }),
    ];
    await store.save(st);
    const engine = new DreamingEngine(store, 558);
    const r = await engine.tick();
    expect(r.phaseReport).toBe('Auto-promoted 2 verified genes: MATH_LAGRANGE_pA, CODI_CYCLOMATIC_pB');
    expect(st.registry).toHaveLength(2);
    expect(st.totalCrystallizedGenes).toBe(2);
    expect(st.recentThoughts).toHaveLength(0);
  });
});

describe('manual crystallize', () => {
  it('rejects an unknown thought id', async () => {
    const store = new InMemoryDreamStore();
    const st = baseState(778);
    await store.save(st);
    const engine = new DreamingEngine(store, 778);
    const res = await engine.crystallize('nope');
    expect(res.success).toBe(false);
    expect(res.error).toBe('Thought not found in stream');
  });

  it('crystallizes a verified genome thought into a named tool', async () => {
    const store = new InMemoryDreamStore();
    const st = baseState(777);
    st.recentThoughts = [thought('cry1', 'math', PARENT_GENOME, { hypothesis: '' })];
    await store.save(st);
    const engine = new DreamingEngine(store, 777);
    const res = await engine.crystallize('cry1');

    expect(res.success).toBe(true);
    expect(res.crystallizedTool?.name).toBe('MATH_LAGRANGE_cry1');
    expect(res.crystallizedTool?.kind).toBe('lagrange_extrapolator');
    expect(res.crystallizedTool?.code).toContain('function lagrangeExtrapolator');
    expect(st.registry).toHaveLength(1);
    expect(st.totalCrystallizedGenes).toBe(1);
    expect(st.recentThoughts).toHaveLength(0);
  });

  it('refuses to crystallize a thought whose genome fails verification', async () => {
    const store = new InMemoryDreamStore();
    const st = baseState(779);
    st.recentThoughts = [thought('cry2', 'math', { kind: 'bogus_kind', domain: 'math', params: {} })];
    await store.save(st);
    const engine = new DreamingEngine(store, 779);
    const res = await engine.crystallize('cry2');
    expect(res.success).toBe(false);
    expect(res.error).toBe('Sandbox verification failed — gene not promoted');
    expect(st.recentThoughts[0].crystallizationReadiness).toBe(0.3);
  });
});

describe('memory consolidation phase', () => {
  it('writes a real signal snapshot and applies the signal bonus to coherence (hand-computed 0.9)', async () => {
    const store = new InMemoryDreamStore();
    const st = baseState(600);
    st.currentPhase = 'memory_consolidation';
    st.recentThoughts = [thought('m1', 'math', undefined, {
      invariantChecks: [{ name: 'x', passed: true }],
      crystallizationReadiness: 0.5,
    })];
    await store.save(st);
    const engine = new DreamingEngine(store, 600, undefined, {
      readinessScore: () => 0.5,
      legoAssemblyCount: () => null,
      learnerEpisode: () => null,
      learnerCalibration: () => null,
    });
    const r = await engine.tick();

    expect(r.phaseReport).toBe('Consolidated real signals: readiness 50.0%');
    expect(r.dreamState.lastSignalSnapshot).toEqual({
      readinessScore: 0.5,
      legoAssemblyCount: null,
      learnerEpisode: null,
      learnerCalibration: null,
      sampledAtTick: 1,
    });
    expect(r.dreamState.consolidationCount).toBe(1);
    expect(r.dreamState.cognitiveCoherence).toBe(0.9);
  });

  it('reports a no-signals summary and keeps coherence on the neutral baseline when nothing is wired', async () => {
    const store = new InMemoryDreamStore();
    const st = baseState(601);
    st.currentPhase = 'memory_consolidation';
    st.recentThoughts = [thought('m2', 'math', undefined, { crystallizationReadiness: 0.5 })];
    await store.save(st);
    const engine = new DreamingEngine(store, 601);
    const r = await engine.tick();
    expect(r.phaseReport).toBe('Consolidated (no live signals wired this cycle)');
    expect(r.dreamState.lastSignalSnapshot).toEqual({
      readinessScore: null,
      legoAssemblyCount: null,
      learnerEpisode: null,
      learnerCalibration: null,
      sampledAtTick: 1,
    });
    expect(r.dreamState.cognitiveCoherence).toBe(0.73);
  });

  it('advances all six phases, wraps the cycle, and records consolidated signals exactly once', async () => {
    const store = new InMemoryDreamStore();
    const engine = new DreamingEngine(store, 12345, undefined, signals);
    let last: TickResult | undefined;
    for (let i = 0; i < 6; i++) {
      last = await engine.tick();
    }
    const s = last.dreamState;
    expect(s.tick).toBe(6);
    expect(s.currentPhase).toBe('rem_counterfactual_sim');
    expect(s.dreamCyclesCompleted).toBe(1);
    expect(s.consolidationCount).toBe(1);
    expect(s.lastSignalSnapshot).toEqual({
      readinessScore: 0.85,
      legoAssemblyCount: 3,
      learnerEpisode: 12,
      learnerCalibration: 0.5,
      sampledAtTick: 6,
    });
    expect(last.phaseReport).toBe('Consolidated real signals: readiness 85.0% | lego assemblies: 3 | learner ep 12 | calibration 0.500');
    expect(s.cognitiveCoherence).toBe(1);
  });
});

describe('catch-up ticks', () => {
  it('skips entirely when dreaming is inactive', async () => {
    const store = new InMemoryDreamStore();
    const st = baseState(300);
    st.isDreamingActive = false;
    st.tick = 4;
    await store.save(st);
    const engine = new DreamingEngine(store, 300);
    const r = await engine.runCatchUpTicks(10);
    expect(r.ticks).toBe(0);
    expect(r.reports).toEqual(['dreaming inactive — skipped']);
    expect(r.dreamState.tick).toBe(4);
  });

  it('runs one tick when active with no recorded last tick', async () => {
    const store = new InMemoryDreamStore();
    const st = baseState(301);
    st.isDreamingActive = true;
    await store.save(st);
    const engine = new DreamingEngine(store, 301);
    const r = await engine.runCatchUpTicks(10);
    expect(r.ticks).toBe(1);
    expect(r.reports[0]).toBe('tick 1: REM simulated 2 counterfactual mutations (model offline or declined; rule-based)');
    expect(r.dreamState.tick).toBe(1);
  });

  it('catches up to the max tick cap using the elapsed interval', async () => {
    const store = new InMemoryDreamStore();
    const st = baseState(302);
    st.isDreamingActive = true;
    st.tick = 10;
    st.lastTickAt = new Date(Date.now() - 7 * 60 * 1000).toISOString();
    await store.save(st);
    const engine = new DreamingEngine(store, 302);
    const r = await engine.runCatchUpTicks(5);
    expect(r.ticks).toBe(5);
    expect(r.reports).toHaveLength(5);
    expect(r.reports[0]).toBe('tick 11: REM simulated 2 counterfactual mutations (model offline or declined; rule-based)');
    expect(r.reports[4]).toContain('tick 15:');
    expect(r.dreamState.tick).toBe(15);
  });
});

describe('model generator integration', () => {
  it('falls back to rule-based REM when the generator returns null', async () => {
    const store = new InMemoryDreamStore();
    const engine = new DreamingEngine(store, 404, async () => null);
    const r = await engine.tick();
    expect(r.phaseReport).toContain('rule-based');
    expect(r.newThought?.origin).toBe('rule_based');
  });

  it('falls back to rule-based REM when the generator throws', async () => {
    const store = new InMemoryDreamStore();
    const engine = new DreamingEngine(store, 405, async () => {
      throw new Error('boom');
    });
    const r = await engine.tick();
    expect(r.phaseReport).toContain('rule-based');
    expect(r.newThought?.origin).toBe('rule_based');
  });

  it('rejects a generator response with no code or tests as unverifiable', async () => {
    const store = new InMemoryDreamStore();
    const engine = new DreamingEngine(store, 406, async () => ({
      premise: 'p',
      hypothesis: 'h',
      sourceCode: '   ',
      testSuiteCode: '',
    }));
    const r = await engine.tick();
    expect(r.phaseReport).toContain('rule-based');
    expect(r.newThought?.origin).toBe('rule_based');
  });

  it('applies default premise/hypothesis text when the generator omits them', async () => {
    const store = new InMemoryDreamStore();
    const engine = new DreamingEngine(store, 407, async () => ({
      premise: '',
      hypothesis: '',
      sourceCode: 'export function double(x) { return x * 2; }',
      testSuiteCode: 'assert double(2) === 4;',
    }));
    const r = await engine.tick();
    expect(r.phaseReport).toBe('REM: model proposed "Untitled model hypothesis." (API model)');
    expect(r.newThought?.premise).toBe('Hypothesis under test.');
    expect(r.newThought?.hypothesis).toBe('Untitled model hypothesis.');
    expect(r.newThought?.origin).toBe('api_model');
    expect(r.newThought?.crystallizationReadiness).toBe(0.55);
    expect(r.newThought?.id).toBe('dt_e3285c16');
    expect(r.newThought?.id).toBe(expectedThoughtId(407, 1, 'neuro_symbolic', 'model', []));
  });

  it('accepts a passing model candidate, storing its real sandbox verdict', async () => {
    const result: DreamGeneratorResult = {
      premise: 'doubling is linear',
      hypothesis: 'a double() micro-tool',
      sourceCode: 'export function double(x) { return x * 2; }',
      testSuiteCode: 'assert double(2) === 4;',
    };
    const store = new InMemoryDreamStore();
    const engine = new DreamingEngine(store, 408, async () => result);
    const r = await engine.tick();
    expect(r.newThought?.origin).toBe('api_model');
    expect(r.newThought?.simulatedOutcome).toContain('passed real sandbox');
    expect(r.newThought?.crystallizationReadiness).toBe(0.55);
  });

  it('labels a failing candidate with no [FAIL] line as having no tests supplied', async () => {
    const store = new InMemoryDreamStore();
    const engine = new DreamingEngine(store, 409, async () => ({
      premise: 'p',
      hypothesis: 'h',
      sourceCode: 'export function double(x { return x * 2; }',
      testSuiteCode: 'assert double(2) === 4;',
    }));
    const r = await engine.tick();
    expect(r.newThought?.simulatedOutcome).toBe('model hypothesis code did not pass yet: no tests supplied');
    expect(r.newThought?.crystallizationReadiness).toBe(0.2);
    expect(r.newThought?.origin).toBe('api_model');
  });
});

describe('stream trimming and pruning', () => {
  it('prunes low-intensity thoughts below the survival threshold', async () => {
    const store = new InMemoryDreamStore();
    const st = baseState(700);
    st.currentPhase = 'synaptic_pruning';
    st.recentThoughts = [thought('weak', 'math', undefined, { intensity: 0.1, crystallizationReadiness: 0.1 })];
    await store.save(st);
    const engine = new DreamingEngine(store, 700);
    const r = await engine.tick();
    expect(r.phaseReport).toBe('Pruning eliminated 1 low-intensity thought path');
    expect(r.dreamState.prunedCount).toBe(1);
    expect(r.dreamState.recentThoughts).toHaveLength(0);
  });

  it('keeps a low-intensity thought whose crystallization readiness is high', async () => {
    const store = new InMemoryDreamStore();
    const st = baseState(701);
    st.currentPhase = 'synaptic_pruning';
    st.recentThoughts = [thought('steady', 'math', undefined, { intensity: 0.1, crystallizationReadiness: 0.6 })];
    await store.save(st);
    const engine = new DreamingEngine(store, 701);
    const r = await engine.tick();
    expect(r.phaseReport).toBe('Pruning eliminated 0 low-intensity thought paths');
    expect(r.dreamState.recentThoughts).toHaveLength(1);
    expect(r.dreamState.recentThoughts[0].id).toBe('steady');
  });

  it('trims a 40-thought stream down to the pool limit keeping the highest-scored thoughts', async () => {
    const store = new InMemoryDreamStore();
    const st = baseState(200);
    st.currentPhase = 'theorem_induction';
    st.recentThoughts = Array.from({ length: 40 }, (_, i) =>
      thought(`t${i}`, 'math', undefined, {
        intensity: (40 - i) / 40,
        crystallizationReadiness: i / 40,
        tick: i,
      }),
    );
    await store.save(st);
    const engine = new DreamingEngine(store, 200);
    const r = await engine.tick();

    expect(r.dreamState.recentThoughts).toHaveLength(32);
    const kept = r.dreamState.recentThoughts;
    expect(kept.some((t) => t.id === 't0')).toBe(true);
    expect(kept.some((t) => t.id === 't31')).toBe(true);
    expect(kept.some((t) => t.id === 't32')).toBe(false);
    expect(kept.some((t) => t.id === 't39')).toBe(false);
    for (let i = 1; i < kept.length; i++) {
      expect(kept[i - 1].tick).toBeGreaterThanOrEqual(kept[i].tick!);
    }
    expect(kept[0].id).toBe('t31');
  });

  it('applyGenome helpers expose deterministic mutation math', () => {
    const rng = mulberry32(42);
    const gene = generateGenome('math', rng);
    const mutated = mutateGenome(gene, rng);
    expect(mutated.kind).toBe(gene.kind);
    expect(mutated.domain).toBe(gene.domain);
    expect(Object.keys(mutated.params)).toEqual(Object.keys(gene.params));
  });
});