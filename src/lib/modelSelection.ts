/**
 * modelSelection.ts — learn which generation profile actually performs.
 *
 * Wires the dormant `ModelBandit` (Phase 2 #9) into a durable, outcome-driven
 * selector. Every non-agentic generation call records a REAL reward derived from
 * what happened (success/offline + measured latency), and once enough evidence
 * accrues the bandit's UCB choice overrides the static local-first heuristic.
 *
 * Why this makes the system better 24/7: the reward stream is continuous and
 * persisted, so the routing policy keeps moving toward whichever profile is
 * actually answering successfully and quickly on this box — it explores local
 * cheaply and exploits the API when local is failing — without a human tuning
 * thresholds. That is exactly the "explore local, exploit best" strategy the
 * roadmap calls for.
 *
 * Honesty + safety:
 *  - Reward is a pure function of the observed result; nothing is invented.
 *  - A fresh/unwarmed bandit returns `null` so callers fall back to the existing
 *    heuristic (no behavior change until real evidence exists).
 *  - Persistence is atomic (`durableJson`) and best-effort; a write failure never
 *    affects generation. Persistence is disabled under VITEST unless a file is
 *    passed explicitly, so tests stay deterministic.
 */
import path from 'node:path';
import { ModelBandit, type ArmRecord, type BanditState } from './modelBandit.js';
import { readJsonFile, writeJsonFile } from './durableJson.js';

function envNum(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Latency at/after which the speed component of the reward bottoms out. */
export const REWARD_BUDGET_MS = envNum('RECOURSE_MODEL_REWARD_BUDGET_MS', 20_000);

/**
 * Reward in [0,1] for one observed outcome. A failed/offline call scores 0; a
 * success scores 0.5..1.0, higher when it answered faster (relative to the
 * latency budget). Cheap-fast local answers therefore out-rank slow API ones,
 * unless local starts failing — which is precisely when we want to switch.
 */
export function rewardForOutcome(input: {
  ok: boolean;
  status: 'online' | 'offline' | 'error' | string;
  latencyMs: number;
  budgetMs?: number;
}): number {
  if (!input.ok || input.status !== 'online') return 0;
  const budget = Math.max(1, input.budgetMs ?? REWARD_BUDGET_MS);
  const speed = 1 - Math.min(1, Math.max(0, Number(input.latencyMs) || 0) / budget);
  return Math.round((0.5 + 0.5 * speed) * 1000) / 1000;
}

/** Default durable location. Under VITEST we do not read a stale cross-run file
 *  (that would make routing tests order-dependent); an explicit `file` still
 *  works so the selection tests can exercise persistence. */
export function defaultSelectionFile(): string | null {
  if (process.env.RECOURSE_MODEL_SELECTION_FILE) return process.env.RECOURSE_MODEL_SELECTION_FILE;
  if (process.env.VITEST) return null;
  return path.join(process.cwd(), 'data', 'self-improvement', 'model-selection.json');
}

const SAVE_THROTTLE_MS = 10_000;

export class ModelSelection {
  private bandit: ModelBandit;
  private readonly file: string | null;
  private readonly warmup: number;
  private lastSavedAt = 0;
  private dirty = false;

  constructor(opts: { armIds?: string[]; file?: string | null; warmup?: number; priorCount?: number } = {}) {
    this.file = opts.file === undefined ? defaultSelectionFile() : opts.file;
    this.warmup = Math.max(1, opts.warmup ?? envNum('RECOURSE_MODEL_BANDIT_WARMUP', 4));
    const state = this.file ? readJsonFile<BanditState | null>(this.file, null) : null;
    this.bandit = state ? ModelBandit.fromState(state) : new ModelBandit({ priorCount: opts.priorCount });
    for (const id of opts.armIds ?? []) this.bandit.addArm(id);
  }

  /** True once enough real outcomes have been observed to trust the bandit over
   *  the static heuristic. */
  warmed(): boolean {
    return this.bandit.totalPlayCount >= this.warmup;
  }

  get playCount(): number {
    return this.bandit.totalPlayCount;
  }

  /** The learned profile among `available`, or null when not warmed / no arms.
   *  Callers treat null as "use the heuristic". */
  choose(available: Array<'local' | 'api'>): 'local' | 'api' | null {
    if (!available.length) return null;
    for (const id of available) this.bandit.addArm(id);
    if (!this.warmed()) return null;
    const pick = this.bandit.choose();
    return pick === 'local' || pick === 'api' ? (available.includes(pick) ? pick : null) : null;
  }

  /** Record a real outcome for a profile and (throttled) persist. */
  record(profileId: 'local' | 'api', reward: number, now = Date.now()): void {
    this.bandit.addArm(profileId);
    this.bandit.record(profileId, reward);
    this.dirty = true;
    if (this.file && now - this.lastSavedAt >= SAVE_THROTTLE_MS) this.persist(now);
  }

  /** Write learned state to disk now (best-effort; never throws). */
  persist(now = Date.now()): void {
    if (!this.file || !this.dirty) return;
    try {
      writeJsonFile(this.file, this.bandit.toState());
      this.dirty = false;
      this.lastSavedAt = now;
    } catch {
      /* learning continues in memory; persistence is best-effort */
    }
  }

  snapshot(): ArmRecord[] {
    return this.bandit.snapshot();
  }

  toState(): BanditState {
    return this.bandit.toState();
  }
}

let singleton: ModelSelection | null = null;

/** Process-wide selection state (durable across restarts in production). */
export function modelSelection(): ModelSelection {
  if (!singleton) singleton = new ModelSelection();
  return singleton;
}

/** Test seam: drop the singleton so a fresh file/env is re-read. */
export function resetModelSelection(): void {
  singleton = null;
}
