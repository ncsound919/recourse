import { describe, it, expect } from 'vitest';
import { RecursiveLearner, InMemoryLearnerStore } from '../src/dream/learner';

describe('learner per-real-tool learning (was: single flat ~0 reward)', () => {
  async function fresh() {
    // Fresh singleton-backed in-memory store per test.
    (globalThis as unknown as Record<string, unknown>).__learnerState = undefined;
    (globalThis as unknown as Record<string, unknown>).__learnerLedger = undefined;
    return new RecursiveLearner(new InMemoryLearnerStore());
  }

  it('discriminates healthy vs defective real tools over many observations', async () => {
    const learner = await fresh();
    let okMean = 0.5;
    let badMean = 0.5;
    for (let i = 0; i < 20; i++) {
      const m = await learner.learnRealTools([
        { name: 'healthy_tool', domain: 'coding', reward: 1 }, // passes verifier + suite
        { name: 'broken_tool', domain: 'coding', reward: 0 },  // defective
      ]);
      okMean = m.healthy_tool;
      badMean = m.broken_tool;
    }
    expect(okMean).toBeGreaterThan(0.85);
    expect(badMean).toBeLessThan(0.15);
    expect(okMean).toBeGreaterThan(badMean); // discriminative, not a shared flat signal
  });

  it('keeps healthy/unknown-no-suite tools at a mid belief, not zero', async () => {
    const learner = await fresh();
    for (let i = 0; i < 5; i++) {
      await learner.learnRealTools([{ name: 'no_suite_tool', domain: 'math', reward: 0.5 }]);
    }
    const s = await learner.status();
    expect((s.geneBeliefs['real:no_suite_tool'] as any).meanReward).toBeGreaterThan(0.4);
  });
});
