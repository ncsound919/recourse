import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Episode } from '../src/lib/memory/types';
import type { DreamState, DreamThought, SubAgentType, ToolDomain } from '../src/types';
import { BENCHMARK_PROBLEMS } from '../src/benchmark/benchmark';

const h = vi.hoisted(() => ({
  listBusinessSlugs: vi.fn(),
  loadBusinessProfile: vi.fn(),
  runLoop: vi.fn(),
}));

vi.mock('../src/autopilot/businessProfile.js', () => ({
  listBusinessSlugs: h.listBusinessSlugs,
  loadBusinessProfile: h.loadBusinessProfile,
}));
vi.mock('../src/autopilot/loopStateMachine.js', () => ({
  runLoop: h.runLoop,
}));

import {
  applyFailureBias,
  autoDispatchSwarmTasks,
  maybeRefreshBenchmark,
  probeAutopilotOnce,
  recordEpisode,
  episodicStore,
} from '../src/lib/recourseActivator';
import type { SwarmAutoDispatchInput } from '../src/lib/recourseActivator';

const ENV_KEYS = ['RECOURSE_AUTOPILOT_DISABLED', 'RECOURSE_REQUIRE_CHECKPOINT'] as const;

function ep(id: string, fp: string, outcome: Episode['outcome'], summary: string): Episode {
  return {
    id,
    timestamp: Number(id.replace(/[^0-9]/g, '')),
    problemFingerprint: fp,
    outcome,
    score: outcome === 'win' ? 0.9 : 0.1,
    geneIds: [],
    summary,
  };
}

function thought(
  id: string,
  domain: ToolDomain,
  readiness: number,
  createdAt: string,
  hypothesis = 'refine the parser for faster convergence',
): DreamThought {
  return {
    id,
    phase: 'rem_counterfactual_sim',
    domain,
    premise: 'p',
    hypothesis,
    simulatedOutcome: 'o',
    intensity: 0.5,
    crystallizationReadiness: readiness,
    createdAt,
  };
}

function swarm(
  opts: { active?: boolean; tasks?: SwarmAutoDispatchInput['swarmStatus']['activeTaskQueue']; thoughts?: DreamThought[]; maxPerCycle?: number } = {},
): SwarmAutoDispatchInput {
  const { active = true, tasks = [], thoughts = [], maxPerCycle } = opts;
  return {
    swarmStatus: {
      isSwarmAutopilotActive: active,
      agents: [],
      activeTaskQueue: tasks,
    },
    dreamState: { recentThoughts: thoughts } as unknown as DreamState,
    maxPerCycle,
  } as unknown as SwarmAutoDispatchInput;
}

function task(agentType: SubAgentType, status: 'queued' | 'running'): SwarmAutoDispatchInput['swarmStatus']['activeTaskQueue'][number] {
  return { id: `t-${agentType}`, agentType, title: 'x', domain: 'math', status };
}

describe('applyFailureBias', () => {
  it('penalizes matched losses, zeroes unmatched and missing fingerprints, exactly', () => {
    const eps = [
      ep('e1', 'mutate/math/alpha', 'loss', 'alpha failure'),
      ep('e2', 'mutate/math/beta', 'loss', 'beta failure'),
      ep('e3', 'mutate/math/gamma', 'loss', 'gamma failure'),
      ep('e4', 'mutate/math/alpha', 'win', 'alpha win'),
    ];
    const r = applyFailureBias(['x', 'y', 'z'], {
      x: 'mutate/math/alpha',
      y: 'mutate/math/beta',
      z: 'mutate/math/zzz-no-match',
    }, eps);
    expect(r.penalties).toEqual({ x: 0.15, y: 0.15, z: 0 });
    expect(r.selectedPenalty).toBe(0);
    expect(r.lossEpisodes).toBe(3);
    expect(r.distinctFingerprints).toBe(2);
  });

  it('caps the penalty at 0.4 when more than two losses match', () => {
    const eps = [
      ep('a1', 'mutate/math/alpha', 'loss', 'alpha one'),
      ep('a2', 'mutate/math/alpha', 'loss', 'alpha two'),
      ep('a3', 'mutate/math/alpha', 'loss', 'alpha three'),
    ];
    const r = applyFailureBias(['a'], { a: 'mutate/math/alpha' }, eps);
    expect(r.penalties.a).toBe(0.4);
    expect(r.distinctFingerprints).toBe(3);
  });

  it('zeroes a candidate with no fingerprint entry', () => {
    const eps = [ep('a1', 'mutate/math/alpha', 'loss', 'alpha one')];
    const r = applyFailureBias(['m'], {}, eps);
    expect(r.penalties.m).toBe(0);
    expect(r.lossEpisodes).toBe(1);
    expect(r.distinctFingerprints).toBe(0);
  });

  it('zeroes everything when no loss episodes exist', () => {
    const eps = [
      ep('w1', 'mutate/math/alpha', 'win', 'alpha win'),
      ep('n1', 'mutate/math/alpha', 'neutral', 'alpha neutral'),
    ];
    const r = applyFailureBias(['a'], { a: 'mutate/math/alpha' }, eps);
    expect(r.penalties.a).toBe(0);
    expect(r.lossEpisodes).toBe(0);
    expect(r.distinctFingerprints).toBe(0);
  });

  it('recordEpisode persists deterministic episodes and the default store feeds applyFailureBias', () => {
    const e1 = recordEpisode({
      domain: 'math',
      instructions: 'compute matrix inverse',
      toolName: 'mat_inv',
      outcome: 'loss',
      score: 0.2,
      summary: 'mat_inv singular matrix',
      geneIds: ['g1'],
    });
    expect(e1.id).toBe('ep-1');
    expect(e1.timestamp).toBe(1);
    expect(e1.problemFingerprint).toBe('mutate/math/mat_inv');
    expect(e1.outcome).toBe('loss');
    expect(e1.score).toBe(0.2);
    expect(e1.geneIds).toEqual(['g1']);
    expect(e1.summary).toBe('mat_inv singular matrix');

    const e2 = recordEpisode({
      domain: 'math',
      instructions: 'compute matrix inverse',
      toolName: 'mat_inv',
      outcome: 'win',
      score: 0.9,
      summary: 'mat_inv works',
      geneIds: ['g1'],
    });
    expect(e2.id).toBe('ep-2');

    expect(episodicStore.all()).toHaveLength(2);
    const r = applyFailureBias(['a'], { a: 'mutate/math/mat_inv' });
    expect(r.penalties.a).toBe(0.15);
    expect(r.lossEpisodes).toBe(1);
    expect(r.distinctFingerprints).toBe(1);
  });
});

describe('autoDispatchSwarmTasks', () => {
  it('returns empty when swarm autopilot is off', () => {
    const input = swarm({ active: false, thoughts: [thought('t1', 'math', 0.9, '2026-01-01T00:00:00.000Z')] });
    expect(autoDispatchSwarmTasks(input)).toEqual([]);
  });

  it('dispatches one task with the exact derived title and agent mapping', () => {
    const input = swarm({ thoughts: [thought('abc123', 'math', 0.9, '2026-01-01T00:00:00.000Z')] });
    expect(autoDispatchSwarmTasks(input)).toEqual([
      { agentType: 'formal_prover', title: 'Refine hypothesis (abc123): refine the parser for faster convergence', domain: 'math' },
    ]);
  });

  it('maps every subagent domain (quantum_sim via cyber route) and honors the per-cycle cap', () => {
    const domains: ToolDomain[] = ['math', 'coding', 'biotech', 'systemic', 'neuro_symbolic', 'cyber_defense'];
    const input = swarm({
      thoughts: domains.map((d, i) => thought(`d${i}`, d, 1 - i * 0.1, `2026-01-0${i + 1}T00:00:00.000Z`)),
      maxPerCycle: 6,
    });
    const out = autoDispatchSwarmTasks(input);
    expect(out.map((t) => t.agentType)).toEqual([
      'formal_prover',
      'algorithmic_synthesizer',
      'biochem_ontologist',
      'algorithmic_synthesizer',
      'biochem_ontologist',
      'cyber_sentinel',
    ]);
    const q = swarm({ thoughts: [thought('q1', 'quantum_sim', 0.9, '2026-01-01T00:00:00.000Z')] });
    expect(autoDispatchSwarmTasks(q)[0].agentType).toBe('quantum_compiler');
  });

  it('breaks at maxPerCycle and ties break by createdAt ascending', () => {
    const input = swarm({
      thoughts: [
        thought('late', 'math', 0.8, '2026-01-02T00:00:00.000Z'),
        thought('early', 'coding', 0.8, '2026-01-01T00:00:00.000Z'),
      ],
      maxPerCycle: 2,
    });
    const out = autoDispatchSwarmTasks(input);
    expect(out.map((t) => t.domain)).toEqual(['coding', 'math']);
    expect(out[0].title).toBe('Refine hypothesis (early): refine the parser for faster convergence');
  });

  it('skips thoughts whose agent is already busy', () => {
    const input = swarm({
      tasks: [task('formal_prover', 'running')],
      thoughts: [
        thought('t1', 'math', 0.9, '2026-01-01T00:00:00.000Z'),
        thought('t2', 'coding', 0.8, '2026-01-01T00:00:00.000Z', 'write a streaming validator'),
      ],
    });
    expect(autoDispatchSwarmTasks(input)).toEqual([
      { agentType: 'algorithmic_synthesizer', title: 'Refine hypothesis (t2): write a streaming validator', domain: 'coding' },
    ]);
  });

  it('returns empty when all 6 subagents already carry a queued or running task', () => {
    const types: SubAgentType[] = [
      'algorithmic_synthesizer',
      'biochem_ontologist',
      'formal_prover',
      'cyber_sentinel',
      'quantum_compiler',
      'dream_consolidator',
    ];
    const input = swarm({ tasks: types.map((t) => task(t, 'queued')), thoughts: [thought('t1', 'math', 0.9, '2026-01-01T00:00:00.000Z')] });
    expect(autoDispatchSwarmTasks(input)).toEqual([]);
  });

  it('dedupes a domain already used earlier in the cycle', () => {
    const input = swarm({
      thoughts: [
        thought('t1', 'math', 0.9, '2026-01-01T00:00:00.000Z'),
        thought('t2', 'math', 0.5, '2026-01-01T00:00:00.000Z'),
        thought('t3', 'coding', 0.3, '2026-01-01T00:00:00.000Z'),
      ],
      maxPerCycle: 2,
    });
    const out = autoDispatchSwarmTasks(input);
    expect(out.map((t) => t.domain)).toEqual(['math', 'coding']);
  });

  it('falls back to dream_consolidator when the only thought is not dispatchable', () => {
    const input = swarm({
      tasks: [task('formal_prover', 'queued')],
      thoughts: [thought('t1', 'math', 0.9, '2026-01-01T00:00:00.000Z')],
    });
    expect(autoDispatchSwarmTasks(input)).toEqual([
      { agentType: 'dream_consolidator', title: 'Consolidate 1 dream thought(s) into crystallizable set', domain: 'systemic' },
    ]);
  });

  it('does not stack a consolidation on top of a queued dream_consolidator task', () => {
    const input = swarm({
      tasks: [task('formal_prover', 'queued'), task('dream_consolidator', 'running')],
      thoughts: [thought('t1', 'math', 0.9, '2026-01-01T00:00:00.000Z')],
    });
    expect(autoDispatchSwarmTasks(input)).toEqual([]);
  });

  it('returns empty with no recent thoughts', () => {
    expect(autoDispatchSwarmTasks(swarm({ thoughts: [] }))).toEqual([]);
  });

  it('considers at most 6 thoughts for the cycle', () => {
    const domains: ToolDomain[] = ['math', 'coding', 'biotech', 'systemic', 'neuro_symbolic', 'cyber_defense', 'quantum_sim'];
    const input = swarm({
      thoughts: domains.map((d, i) => thought(`s${i}`, d, 1 - i * 0.1, `2026-01-0${i + 1}T00:00:00.000Z`)),
      maxPerCycle: 7,
    });
    const out = autoDispatchSwarmTasks(input);
    expect(out).toHaveLength(6);
    expect(out.every((t) => t.domain !== 'quantum_sim')).toBe(true);
    expect(out.map((t) => t.domain)).toEqual(domains.slice(0, 6));
  });
});

describe('maybeRefreshBenchmark', () => {
  let refresh: typeof import('../src/lib/recourseActivator').maybeRefreshBenchmark;
  let total: () => number;
  beforeEach(async () => {
    vi.resetModules();
    const act = await import('../src/lib/recourseActivator');
    const bench = await import('../src/benchmark/benchmark');
    refresh = act.maybeRefreshBenchmark;
    total = () => bench.allBenchmarkProblems().length;
  });

  it('returns not-refreshed with no history, using the real scored-set count', () => {
    const r = refresh({ history: [] });
    expect(r).toEqual({ refreshed: false, currentTotal: total(), currentSolved: 0 });
  });

  it('holds while the scored set is not fully solved', () => {
    const r = refresh({ history: [{ solved: 10, total: total() }] });
    expect(r).toEqual({ refreshed: false, currentTotal: total(), currentSolved: 10 });
  });

  it('holds when the cap is already reached', () => {
    const t = total();
    const r = refresh({ history: [{ solved: t, total: t }], maxProblems: t });
    expect(r).toEqual({ refreshed: false, currentTotal: t, currentSolved: t });
  });

  it('appends a real generated problem when the whole scored set is solved', () => {
    const before = total();
    const r = refresh({ history: [{ solved: before, total: before, solvedIds: [] }] });
    expect(r.refreshed).toBe(true);
    expect(r.currentTotal).toBe(before + 1);
    expect(r.added?.tier).toBe('generated');
    expect(r.added?.id).toMatch(/^gen_/);
    // The appended problem must be executable, not a pseudo-code "test vector".
    expect(r.added?.hiddenSuite).toMatch(/assert /);
  });

  it('holds when a previously-appended problem is not solved yet', () => {
    const before = total();
    refresh({ history: [{ solved: before, total: before, solvedIds: [] }] });
    const r = refresh({ history: [{ solved: before, total: before, solvedIds: [] }] });
    expect(r).toEqual({ refreshed: false, currentTotal: before + 1, currentSolved: before });
  });

  it('appends the next problem once the appended one is solved', () => {
    const before = total();
    const first = refresh({ history: [{ solved: before, total: before, solvedIds: [] }] });
    const id = first.added!.id;
    const r = refresh({ history: [{ solved: before + 1, total: before + 1, solvedIds: [id] }] });
    expect(r.refreshed).toBe(true);
    expect(r.currentTotal).toBe(before + 2);
  });

  it('continues the sequence after a restart, from the persisted appended set', async () => {
    vi.resetModules();
    const bench = await import('../src/benchmark/benchmark');
    const act = await import('../src/lib/recourseActivator');
    const gen = await import('../src/benchmark/generatedProblems');
    // A prior run appended one problem and persisted it.
    const restored = gen.makeGeneratedProblem(gen.GENERATED_PROBLEMS.length);
    bench.restoreBenchmarkProblems([restored]);
    const before = bench.allBenchmarkProblems().length;
    // The restored problem is solved, so the next one is appended — a NEW id.
    const r = act.maybeRefreshBenchmark({ history: [{ solved: before, total: before, solvedIds: [restored.id] }] });
    expect(r.refreshed).toBe(true);
    expect(r.added!.id).not.toBe(restored.id);
    expect(r.currentTotal).toBe(before + 1);
  });
});

describe('probeAutopilotOnce', () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
    vi.clearAllMocks();
  });

  afterEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
  });

  it('short-circuits on the kill switch without touching profiles', async () => {
    process.env.RECOURSE_AUTOPILOT_DISABLED = '1';
    const out = await probeAutopilotOnce();
    expect(out).toEqual([{ ran: false, reason: 'kill_switch' }]);
    expect(h.listBusinessSlugs).not.toHaveBeenCalled();
  });

  it('reports no_profiles when the registry is empty', async () => {
    h.listBusinessSlugs.mockReturnValue([]);
    const out = await probeAutopilotOnce();
    expect(out).toEqual([{ ran: false, reason: 'no_profiles' }]);
  });

  it('skips profiles without an auto-merge repo binding', async () => {
    h.listBusinessSlugs.mockReturnValue(['alpha']);
    h.loadBusinessProfile.mockReturnValue({ repo: { autoMergeEnabled: false }, business: { name: 'Alpha' } });
    const out = await probeAutopilotOnce();
    expect(out).toMatchObject([{ ran: false, reason: 'autoMerge_disabled', business: 'alpha' }]);
    expect(h.runLoop).not.toHaveBeenCalled();
  });

  it('skips profiles with no repo at all', async () => {
    h.listBusinessSlugs.mockReturnValue(['alpha']);
    h.loadBusinessProfile.mockReturnValue({ business: { name: 'Alpha' } });
    const out = await probeAutopilotOnce();
    expect(out).toMatchObject([{ ran: false, reason: 'autoMerge_disabled', business: 'alpha' }]);
  });

  it('runs the dry-run audit with requireCheckpoint from the env', async () => {
    process.env.RECOURSE_REQUIRE_CHECKPOINT = '1';
    const profile = { repo: { autoMergeEnabled: true }, business: { name: 'Alpha' } };
    h.listBusinessSlugs.mockReturnValue(['alpha']);
    h.loadBusinessProfile.mockReturnValue(profile);
    h.runLoop.mockResolvedValue({ state: { status: 'audited' }, context: {} });
    const out = await probeAutopilotOnce();
    expect(out).toMatchObject([{ ran: true, business: 'alpha', reason: 'dry_run_audit', status: 'audited' }]);
    expect(h.runLoop).toHaveBeenCalledWith(expect.objectContaining({ profile, dryRun: true, requireCheckpoint: true }));
  });

  it('runs the dry-run audit with requireCheckpoint from the profile', async () => {
    const profile = { repo: { autoMergeEnabled: true, requireCheckpoint: true }, business: { name: 'Alpha' } };
    h.listBusinessSlugs.mockReturnValue(['alpha']);
    h.loadBusinessProfile.mockReturnValue(profile);
    h.runLoop.mockResolvedValue({ state: { status: 'audited' }, context: {} });
    const out = await probeAutopilotOnce();
    expect(out).toMatchObject([{ ran: true, business: 'alpha', reason: 'dry_run_audit', status: 'audited' }]);
    expect(h.runLoop).toHaveBeenCalledWith(expect.objectContaining({ profile, dryRun: true, requireCheckpoint: true }));
  });

  it('runs the dry-run audit with requireCheckpoint false when neither source sets it', async () => {
    const profile = { repo: { autoMergeEnabled: true }, business: { name: 'Alpha' } };
    h.listBusinessSlugs.mockReturnValue(['alpha']);
    h.loadBusinessProfile.mockReturnValue(profile);
    h.runLoop.mockResolvedValue({ state: { status: 'idle' }, context: {} });
    const out = await probeAutopilotOnce();
    expect(out).toMatchObject([{ ran: true, business: 'alpha', reason: 'dry_run_audit', status: 'idle' }]);
    expect(h.runLoop).toHaveBeenCalledWith(expect.objectContaining({ profile, dryRun: true, requireCheckpoint: false }));
  });

  it('reports per-business errors with Error.message and string fallback', async () => {
    h.listBusinessSlugs.mockReturnValue(['alpha', 'beta', 'gamma']);
    h.loadBusinessProfile.mockImplementation((slug: string) => {
      if (slug === 'alpha') return { repo: { autoMergeEnabled: false }, business: { name: 'Alpha' } };
      if (slug === 'beta') throw new Error('boom');
      throw 'stringerr';
    });
    const out = await probeAutopilotOnce();
    expect(out).toMatchObject([
      { ran: false, reason: 'autoMerge_disabled', business: 'alpha' },
      { ran: false, reason: 'error:boom', business: 'beta' },
      { ran: false, reason: 'error:stringerr', business: 'gamma' },
    ]);
  });
});
