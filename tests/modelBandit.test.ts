import { describe, it, expect } from 'vitest';
import { ModelBandit } from '../src/lib/modelBandit';

describe('model ensemble bandit (phase 2 #9)', () => {
  it('explores untried arms first via the optimistic prior', () => {
    const b = new ModelBandit({ armIds: ['local-qwen', 'api-deepseek'] });
    // With no history both have equal UCB; tie-break -> lowest id chosen.
    expect(b.choose()).toBe('api-deepseek');
  });

  it('exploits the arm that earns high reward', () => {
    const b = new ModelBandit({ armIds: ['local-qwen', 'api-deepseek'] });
    // Burn several pulls on local-qwen that mostly fail, then exploit api.
    for (let i = 0; i < 5; i++) { b.record('local-qwen', 0.2); b.record('api-deepseek', 0.9); }
    const arms = b.snapshot();
    expect(arms.find((a) => a.id === 'api-deepseek')!.mean).toBeGreaterThan(
      arms.find((a) => a.id === 'local-qwen')!.mean,
    );
    // api-deepseek has a higher UCB -> chosen.
    const api = arms.find((a) => a.id === 'api-deepseek')!;
    const local = arms.find((a) => a.id === 'local-qwen')!;
    expect(api.ucb).toBeGreaterThan(local.ucb);
  });

  it('clamps rewards to [0,1] and ignores unknown arms', () => {
    const b = new ModelBandit({ armIds: ['a'] });
    b.record('a', 5);
    b.record('ghost', 1); // ignored
    const [a] = b.snapshot();
    expect(a.mean).toBeLessThanOrEqual(1);
    expect(b.totalPlayCount).toBe(1);
  });

  it('returns null when no arms exist', () => {
    expect(new ModelBandit().choose()).toBeNull();
  });
});
