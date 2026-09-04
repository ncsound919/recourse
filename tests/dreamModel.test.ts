import { describe, it, expect } from 'vitest';
import { DreamingEngine } from '../src/dream/engine';
import type { DreamGeneratorResult } from '../src/dream/engine';
import { InMemoryDreamStore } from '../src/dream/store';
import type { DreamState } from '../src/dream/types';

const GENESIS: DreamState = {
  isDreamingActive: true,
  currentPhase: 'rem_counterfactual_sim',
  dreamCyclesCompleted: 0,
  cognitiveCoherence: 0.5,
  totalCrystallizedGenes: 0,
  recentThoughts: [],
  registry: [],
  seed: 123,
  tick: 0,
  lastTickAt: null,
  prunedCount: 0,
};

function makeEngine(generator: (() => Promise<DreamGeneratorResult | null>) | undefined) {
  const store = new InMemoryDreamStore();
  return new DreamingEngine(store, 123, generator);
}

describe('Model-driven dreaming', () => {
  it('REM phase consults the model generator and tags the thought origin', async () => {
    const engine = makeEngine(async () => ({
      premise: 'doubling is linear',
      hypothesis: 'a double() micro-tool is trivially correct',
      sourceCode: 'export function double(x) { return x * 2; }',
      testSuiteCode: 'assert double(2) === 4;\nassert double(0) === 0;',
    }));

    // Prime the store with genesis state.
    const { dreamState, newThought, phaseReport } = await engine.tick();
    expect(phaseReport).toContain('model proposed');
    expect(newThought).not.toBeNull();
    expect(newThought!.origin).toBe('local_model');
    expect(newThought!.hypothesis).toContain('double()');
    expect(dreamState.recentThoughts.some((t) => t.origin === 'local_model')).toBe(true);
  });

  it('crystallizes a model thought only when its code passes the real sandbox', async () => {
    const store = new InMemoryDreamStore();
    await store.save({ ...GENESIS, currentPhase: 'rem_counterfactual_sim' });

    const engine = new DreamingEngine(store, 123, async () => ({
      premise: 'doubling is linear',
      hypothesis: 'a double() micro-tool that actually works',
      sourceCode: 'export function double(x) { return x * 2; }',
      testSuiteCode: 'assert double(2) === 4;',
    }));

    const ticked = await engine.tick();
    const thought = ticked.newThought;
    expect(thought).not.toBeNull();

    const ok = await engine.crystallize(thought!.id);
    expect(ok.success).toBe(true);
    expect(ok.crystallizedTool).toBeDefined();
    expect(ok.crystallizedTool!.verified).toBe(true);
  });

  it('refuses to crystallize a model thought whose code fails the sandbox', async () => {
    const store = new InMemoryDreamStore();
    await store.save({ ...GENESIS, currentPhase: 'rem_counterfactual_sim' });

    const engine = new DreamingEngine(store, 123, async () => ({
      premise: 'doubling is linear',
      hypothesis: 'a deliberately broken double() micro-tool',
      sourceCode: 'export function double(x) { return x * 2 + 1; }',
      testSuiteCode: 'assert double(2) === 4;',
    }));

    const ticked = await engine.tick();
    const thought = ticked.newThought;
    expect(thought).not.toBeNull();
    // A thought that fails its own tests still enters the stream, but its
    // simulatedOutcome must say so and it must NOT be promotable as-is.
    expect(thought!.simulatedOutcome).toContain('FAIL');

    const attempt = await engine.crystallize(thought!.id);
    expect(attempt.success).toBe(false);
    expect(attempt.crystallizedTool).toBeUndefined();
  });

  it('falls back to rule-based REM when no generator is configured', async () => {
    const engine = makeEngine(undefined);
    const { dreamState, phaseReport } = await engine.tick();
    expect(phaseReport).toContain('rule-based');
    const fresh = dreamState.recentThoughts.find((t) => t.origin === 'rule_based');
    expect(fresh).toBeDefined();
  });
});
