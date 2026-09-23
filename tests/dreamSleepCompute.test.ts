import { describe, it, expect } from 'vitest';
import { DreamingEngine } from '../src/dream/engine';
import { InMemoryDreamStore } from '../src/dream/store';
import type { DreamState } from '../src/dream/types';

function genesis(): DreamState {
  return {
    isDreamingActive: true,
    currentPhase: 'memory_consolidation',
    dreamCyclesCompleted: 0,
    cognitiveCoherence: 0.5,
    totalCrystallizedGenes: 0,
    recentThoughts: [],
    registry: [],
    seed: 42,
    tick: 0,
    lastTickAt: null,
    prunedCount: 0,
  };
}

const baseSignals = {
  readinessScore: () => 0.5,
  legoAssemblyCount: () => 1,
  learnerEpisode: () => 0,
  learnerCalibration: () => 0,
};

describe('dream sleep-time compute (P1, arXiv:2504.13171)', () => {
  it('runs the injected sleep-compute unit during consolidation and records counters', async () => {
    const store = new InMemoryDreamStore();
    await store.save(genesis());
    const engine = new DreamingEngine(store, 42, undefined, {
      ...baseSignals,
      sleepCompute: async () => ({ attempted: 2, ready: 1, note: 'precomputed 1/2 verified artifact(s)' }),
    });
    const r = await engine.tick();
    expect(r.dreamState.sleepComputeRuns).toBe(1);
    expect(r.dreamState.sleepReadyArtifacts).toBe(1);
    expect(r.phaseReport).toContain('sleep precomputed 1/2');
  });

  it('leaves consolidation byte-identical when no hook is configured', async () => {
    const store = new InMemoryDreamStore();
    await store.save(genesis());
    const engine = new DreamingEngine(store, 42, undefined, { ...baseSignals });
    const r = await engine.tick();
    expect(r.phaseReport).not.toContain('sleep');
    expect(r.dreamState.sleepComputeRuns).toBeUndefined();
  });
});
