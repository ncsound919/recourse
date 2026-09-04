/**
 * Model ensemble bandit (Phase 2 #9).
 *
 * UCB1 over (model, profile) arms. Cheap local (Ollama) models get explored for
 * cost, a funded API model gets exploited when it earns it — the "explore local,
 * exploit best" strategy the roadmap calls for. Pure and deterministic (no
 * randomness): ties break to the lowest-index arm, so given the same history the
 * same arm is chosen — easy to reason about and test.
 *
 * Rewards are in [0,1]. Arms are created implicitly on first use with a prior
 * (optimistic) play count so untried arms get an early chance (UCB exploration
 * bonus).
 */

export interface BanditArm {
  id: string;
  plays: number;
  /** sum of observed rewards in [0,1] */
  rewardSum: number;
}

export interface ArmRecord {
  id: string;
  plays: number;
  /** mean reward in [0,1] */
  mean: number;
  ucb: number;
}

export class ModelBandit {
  private arms = new Map<string, { plays: number; rewardSum: number }>();
  private priorCount: number;
  private totalReward = 0;
  private totalPlays = 0;

  constructor(opts: { priorCount?: number; armIds?: string[] } = {}) {
    // Optimistic prior: each known arm is "played" priorCount times with full
    // reward, so untried arms are explored early.
    this.priorCount = Math.max(0, opts.priorCount ?? 1);
    for (const id of opts.armIds ?? []) this.arms.set(id, { plays: 0, rewardSum: 0 });
  }

  addArm(id: string): void {
    if (!this.arms.has(id)) this.arms.set(id, { plays: 0, rewardSum: 0 });
  }

  private ucb(id: string): number {
    const a = this.arms.get(id)!;
    const n = this.priorCount + a.plays;
    const mean = (this.priorCount + a.rewardSum) / n;
    if (this.totalPlays <= 0) return mean; // no history -> pure prior
    const bonus = Math.sqrt((2 * Math.log(this.totalPlays + 1)) / n);
    return mean + bonus;
  }

  /** Choose the arm with the highest UCB. Deterministic tie-break to lowest id
   *  (stable order). Returns the id (or null when no arms exist). */
  choose(): string | null {
    if (this.arms.size === 0) return null;
    let best: string | null = null;
    let bestUcb = -Infinity;
    for (const id of [...this.arms.keys()].sort()) {
      const u = this.ucb(id);
      if (u > bestUcb) { bestUcb = u; best = id; }
    }
    return best;
  }

  /** Record an observed reward (clamped to [0,1]) for an arm. */
  record(id: string, reward: number): void {
    const a = this.arms.get(id);
    if (!a) return;
    const r = Math.max(0, Math.min(1, Number.isFinite(reward) ? reward : 0));
    a.plays += 1;
    a.rewardSum += r;
    this.totalPlays += 1;
    this.totalReward += r;
  }

  snapshot(): ArmRecord[] {
    return [...this.arms.keys()]
      .sort()
      .map((id) => {
        const a = this.arms.get(id)!;
        const n = this.priorCount + a.plays;
        return { id, plays: a.plays, mean: Math.round((a.rewardSum / n) * 1000) / 1000, ucb: Math.round(this.ucb(id) * 1000) / 1000 };
      });
  }

  get totalPlayCount(): number { return this.totalPlays; }
}
