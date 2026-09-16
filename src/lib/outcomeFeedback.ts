/**
 * outcomeFeedback.ts — close the loop between real-world results and the
 * learner's reward signal.
 *
 * Until now the learner's external score came from internal capability health
 * (`realSystemReward`) and scorecard deltas were written to the fitness ledger
 * and then ignored. This module turns those deltas — plus revenue deltas from
 * the billing layer — into a normalized reward in [0,1] and records it durably,
 * so the learner is driven by actual business outcomes, not self-assessment.
 *
 * The maps are deliberately simple and monotone:
 *   - a scorecard overall-delta of +100 points (of 1000) is a perfect reward,
 *     -100 is zero, 0 is neutral (0.5);
 *   - a revenue delta equal to the tenant's target monthly revenue moves the
 *     reward from neutral to 1.0 (half-target => 0.75, etc.).
 * Everything is a pure function so the behaviour is unit-testable.
 */
import crypto from 'node:crypto';
import path from 'node:path';
import { readJsonFile, writeJsonFile } from './durableJson.js';

export type OutcomeSource = 'scorecard' | 'revenue' | 'usage' | 'manual' | 'merge';

export interface OutcomeSignal {
  id: string;
  at: number;
  source: OutcomeSource;
  /** Normalized reward in [0,1]. */
  reward: number;
  scorecardDelta?: number;
  revenueDeltaCents?: number;
  proposalId?: string;
  gapId?: string;
  tenantId?: string;
  notes?: string;
}

export interface OutcomeRewardComponents {
  reward: number;
  scorecard?: number;
  revenue?: number;
  blendedFrom: string[];
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Map an overall-score delta (0..1000 scale) to a reward. +scale => 1, -scale => 0. */
export function scorecardDeltaToReward(deltaPoints: number, scale = 200): number {
  if (!Number.isFinite(deltaPoints) || scale <= 0) return 0.5;
  return clamp01(0.5 + deltaPoints / (2 * scale));
}

/** Map a revenue delta to a reward relative to a target. +target => 1, -target => 0. */
export function revenueDeltaToReward(deltaCents: number, targetCents = 10_000): number {
  if (!Number.isFinite(deltaCents) || !Number.isFinite(targetCents) || targetCents <= 0) return 0.5;
  return clamp01(0.5 + deltaCents / (2 * targetCents));
}

/** Weighted mean of reward parts; empty input => neutral 0.5. */
export function blendOutcomeReward(parts: Array<{ reward: number; weight: number }>): number {
  const usable = parts.filter((p) => Number.isFinite(p.reward) && Number.isFinite(p.weight) && p.weight > 0);
  if (usable.length === 0) return 0.5;
  const totalW = usable.reduce((n, p) => n + p.weight, 0);
  return clamp01(usable.reduce((n, p) => n + p.reward * p.weight, 0) / totalW);
}

export function computeOutcomeReward(input: {
  scorecardDelta?: number;
  revenueDeltaCents?: number;
  targetRevenueCents?: number;
  scorecardScale?: number;
}): OutcomeRewardComponents {
  const parts: Array<{ reward: number; weight: number }> = [];
  const blendedFrom: string[] = [];
  const out: OutcomeRewardComponents = { reward: 0.5, blendedFrom };
  if (typeof input.scorecardDelta === 'number' && Number.isFinite(input.scorecardDelta)) {
    const r = scorecardDeltaToReward(input.scorecardDelta, input.scorecardScale ?? 200);
    out.scorecard = r;
    parts.push({ reward: r, weight: 1 });
    blendedFrom.push('scorecard');
  }
  if (typeof input.revenueDeltaCents === 'number' && Number.isFinite(input.revenueDeltaCents)) {
    const r = revenueDeltaToReward(input.revenueDeltaCents, input.targetRevenueCents ?? 10_000);
    out.revenue = r;
    parts.push({ reward: r, weight: 1 });
    blendedFrom.push('revenue');
  }
  out.reward = blendOutcomeReward(parts);
  return out;
}

export function outcomeLedgerFile(): string {
  return process.env.RECOURSE_OUTCOME_LEDGER_FILE || path.join(process.cwd(), 'data', 'outcome-feedback.json');
}

interface OutcomeDoc {
  version: 1;
  signals: OutcomeSignal[];
}

const MAX_SIGNALS = 1000;

export interface OutcomeLedger {
  file(): string;
  record(input: Omit<OutcomeSignal, 'id' | 'at'> & { id?: string; at?: number }): OutcomeSignal;
  history(limit?: number): OutcomeSignal[];
  latest(): OutcomeSignal | undefined;
  /** Mean reward over the newest `window` signals; undefined when empty. */
  reward(window?: number): number | undefined;
}

export function openOutcomeLedger(file = outcomeLedgerFile()): OutcomeLedger {
  const load = (): OutcomeDoc => {
    const doc = readJsonFile<OutcomeDoc>(file, { version: 1, signals: [] });
    if (!doc || !Array.isArray(doc.signals)) return { version: 1, signals: [] };
    return { version: 1, signals: doc.signals.filter((s) => s && typeof s.reward === 'number') };
  };

  return {
    file: () => file,
    record(input) {
      const signal: OutcomeSignal = {
        id: input.id ?? `o_${crypto.randomBytes(8).toString('hex')}`,
        at: input.at ?? Date.now(),
        source: input.source,
        reward: clamp01(input.reward),
        scorecardDelta: input.scorecardDelta,
        revenueDeltaCents: input.revenueDeltaCents,
        proposalId: input.proposalId,
        gapId: input.gapId,
        tenantId: input.tenantId,
        notes: input.notes,
      };
      const doc = load();
      doc.signals.push(signal);
      if (doc.signals.length > MAX_SIGNALS) doc.signals.splice(0, doc.signals.length - MAX_SIGNALS);
      writeJsonFile(file, doc);
      return signal;
    },
    history(limit = 20) {
      return load().signals.slice(-Math.max(1, limit));
    },
    latest() {
      const signals = load().signals;
      return signals.length ? signals[signals.length - 1] : undefined;
    },
    reward(window = 1) {
      const signals = load().signals.slice(-Math.max(1, window));
      if (!signals.length) return undefined;
      return clamp01(signals.reduce((n, s) => n + s.reward, 0) / signals.length);
    },
  };
}

export interface MergedOutcomeInput {
  ledgerRoot: string;
  proposalId?: string;
  gapId?: string;
  scorecardDelta?: number;
  revenueDeltaCents?: number;
  targetRevenueCents?: number;
  notes?: string;
  ledgerFile?: string;
}

/**
 * Record the outcome of a merged upgrade. Called post-merge by the autopilot
 * loop so the learner sees whether a change actually moved the business.
 */
export function recordMergedOutcome(input: MergedOutcomeInput): OutcomeSignal {
  const components = computeOutcomeReward({
    scorecardDelta: input.scorecardDelta,
    revenueDeltaCents: input.revenueDeltaCents,
    targetRevenueCents: input.targetRevenueCents,
  });
  const file = input.ledgerFile ?? (input.ledgerRoot ? path.join(input.ledgerRoot, 'data', 'outcome-feedback.json') : outcomeLedgerFile());
  return openOutcomeLedger(file).record({
    source: 'merge',
    reward: components.reward,
    scorecardDelta: input.scorecardDelta,
    revenueDeltaCents: input.revenueDeltaCents,
    proposalId: input.proposalId,
    gapId: input.gapId,
    notes: input.notes ?? `merged outcome (${components.blendedFrom.join('+') || 'neutral'})`,
  });
}
