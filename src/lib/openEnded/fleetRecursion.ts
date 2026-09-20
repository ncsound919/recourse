/**
 * Dedup-aware fleet recursion ledger.
 *
 * The Axiom/OpenHub loops report an outcome per real iteration. Left raw, that
 * stream is dominated by re-reports of the same (source, goal) — the same
 * "learning" counted repeatedly, which is exactly how a counter can rise while
 * nothing improves. This module canonicalizes each outcome to
 * `source:canonical(goal)`, keeps only the latest/most-progressed report per
 * identity, and records the stream in a hash-chained JSONL ledger so a
 * regression (a later iteration worse than an earlier one) is visible and the
 * chain is tamper-evident.
 *
 * Honesty: `dedupeFleetOutcomes` never drops a genuinely distinct goal, and
 * `summarizeFleetRecursion` reports regressions and stalls explicitly rather
 * than averaging them away. `verifyChain` recomputes the chain and reports the
 * first divergence.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { canonicalToolKey } from './gates.js';

export interface FleetOutcome {
  source: string;
  goal: string;
  status?: string;
  iteration?: number;
  summary?: string;
  id?: string;
  at?: number;
  score?: number;
}

export interface CanonicalOutcome extends FleetOutcome {
  canonicalId: string;
  iteration: number;
  status: string;
}

export function canonicalOutcomeId(o: Pick<FleetOutcome, 'source' | 'goal' | 'id'>): string {
  const source = canonicalToolKey(o.source || 'fleet') || 'fleet';
  const goal = canonicalToolKey(o.goal || o.id || o.source || 'unknown') || 'unknown';
  return `${source}:${goal}`;
}

function normalize(o: FleetOutcome): CanonicalOutcome {
  return {
    ...o,
    source: String(o.source ?? 'fleet').slice(0, 64) || 'fleet',
    goal: String(o.goal ?? '').slice(0, 500),
    status: String(o.status ?? 'unknown').slice(0, 40),
    iteration: Number.isFinite(o.iteration) ? Number(o.iteration) : 0,
    canonicalId: canonicalOutcomeId(o),
  };
}

/**
 * Keep the most-progressed report per canonical identity. Order is preserved by
 * first appearance; the survivor is the one with the highest iteration (ties to
 * the later report). Dropped reports are returned with the survivor's id.
 */
export function dedupeFleetOutcomes(items: FleetOutcome[]): {
  kept: CanonicalOutcome[];
  dropped: Array<{ dropped: CanonicalOutcome; keptId: string }>;
} {
  const best = new Map<string, CanonicalOutcome>();
  const order: string[] = [];
  for (const raw of items) {
    const o = normalize(raw);
    const existing = best.get(o.canonicalId);
    if (!existing) {
      best.set(o.canonicalId, o);
      order.push(o.canonicalId);
    } else if (o.iteration > existing.iteration) {
      best.set(o.canonicalId, o);
    }
  }
  const kept = order.map((id) => best.get(id)!);
  const keptIds = new Set(order);
  const isWinner = (o: CanonicalOutcome): boolean => {
    const w = best.get(o.canonicalId)!;
    return (
      w.iteration === o.iteration &&
      w.status === o.status &&
      (w.summary ?? '') === (o.summary ?? '') &&
      (w.score ?? null) === (o.score ?? null)
    );
  };
  const dropped: Array<{ dropped: CanonicalOutcome; keptId: string }> = [];
  for (const raw of items) {
    const o = normalize(raw);
    if (!keptIds.has(o.canonicalId)) continue;
    if (!isWinner(o)) dropped.push({ dropped: o, keptId: o.canonicalId });
  }
  return { kept, dropped };
}

export interface FleetRecursionSummary {
  total: number;
  distinctGoals: number;
  bySource: Array<{ source: string; goals: number; bestIteration: number; failures: number; regressions: number }>;
  regressions: Array<{ canonicalId: string; from: number; to: number }>;
  stalled: string[];
}

/**
 * Summarize a deduped stream: per-source goal counts, best iteration reached,
 * failure counts, and explicit regressions (a later known iteration scored
 * lower than an earlier one for the same identity).
 */
export function summarizeFleetRecursion(items: FleetOutcome[]): FleetRecursionSummary {
  const { kept } = dedupeFleetOutcomes(items);
  const bySource = new Map<string, { goals: Set<string>; bestIteration: number; failures: number; regressions: number }>();
  const seenIter = new Map<string, number>();
  const regressions: Array<{ canonicalId: string; from: number; to: number }> = [];
  const stalled: string[] = [];

  for (const o of items.map(normalize)) {
    const s = bySource.get(o.source) ?? { goals: new Set<string>(), bestIteration: 0, failures: 0, regressions: 0 };
    s.goals.add(o.canonicalId);
    s.bestIteration = Math.max(s.bestIteration, o.iteration);
    if (/fail|error|regress/i.test(o.status)) s.failures += 1;
    bySource.set(o.source, s);
    const prev = seenIter.get(o.canonicalId);
    if (prev !== undefined && o.iteration > prev) {
      const prevOutcome = items
        .map(normalize)
        .filter((x) => x.canonicalId === o.canonicalId && x.iteration === prev)
        .pop();
      const prevScore = prevOutcome?.score;
      if (typeof prevScore === 'number' && typeof o.score === 'number' && o.score < prevScore) {
        regressions.push({ canonicalId: o.canonicalId, from: prev, to: o.iteration });
        s.regressions += 1;
      }
    }
    seenIter.set(o.canonicalId, Math.max(prev ?? 0, o.iteration));
  }

  for (const o of kept) {
    if (o.status !== 'success' && o.status !== 'ok' && o.status !== 'complete') {
      if (o.iteration <= 0) stalled.push(o.canonicalId);
    }
  }

  return {
    total: items.length,
    distinctGoals: kept.length,
    bySource: [...bySource.entries()].map(([source, v]) => ({
      source,
      goals: v.goals.size,
      bestIteration: v.bestIteration,
      failures: v.failures,
      regressions: v.regressions,
    })).sort((a, b) => a.source.localeCompare(b.source)),
    regressions,
    stalled,
  };
}

// ---------------------------------------------------------------------------
// Hash-chained ledger
// ---------------------------------------------------------------------------

export interface FleetRecursionEntry extends CanonicalOutcome {
  seq: number;
  prevHash: string;
  hash: string;
}

export function fleetRecursionFile(): string {
  return process.env.RECOURSE_FLEET_RECURSION_FILE || path.join(process.cwd(), 'data', 'open-ended', 'fleet-recursion.jsonl');
}

function hashEntry(e: Omit<FleetRecursionEntry, 'hash'>): string {
  const canonical = JSON.stringify({
    seq: e.seq,
    canonicalId: e.canonicalId,
    source: e.source,
    goal: e.goal,
    status: e.status,
    iteration: e.iteration,
    summary: e.summary ?? '',
    score: e.score ?? null,
    prevHash: e.prevHash,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

export class FleetRecursionLedger {
  constructor(private readonly file: string = fleetRecursionFile()) {}

  read(): FleetRecursionEntry[] {
    try {
      if (!fs.existsSync(this.file)) return [];
      return fs.readFileSync(this.file, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as FleetRecursionEntry);
    } catch {
      return [];
    }
  }

  /** Append a real outcome. Re-appending the same canonicalId at the same or
   *  lower iteration is a no-op (returns the existing entry) — no double count. */
  append(outcome: FleetOutcome, now: number = Date.now()): FleetRecursionEntry {
    const entries = this.read();
    const last = entries[entries.length - 1];
    const o = normalize(outcome);
    const existing = [...entries].reverse().find((e) => e.canonicalId === o.canonicalId);
    if (existing && o.iteration <= existing.iteration) return existing;

    const base: Omit<FleetRecursionEntry, 'hash'> = {
      ...o,
      seq: (last?.seq ?? 0) + 1,
      prevHash: last?.hash ?? 'genesis',
      at: now,
    };
    const entry: FleetRecursionEntry = { ...base, hash: hashEntry(base) };
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.appendFileSync(this.file, JSON.stringify(entry) + '\n', 'utf-8');
    } catch (err) {
      console.warn('[fleetRecursion] append failed:', err instanceof Error ? err.message : String(err));
    }
    return entry;
  }

  /** Recompute the hash chain; report the first divergence (or valid). */
  verifyChain(): { valid: boolean; checked: number; divergedAtSeq?: number } {
    const entries = this.read();
    let prevHash = 'genesis';
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.prevHash !== prevHash) return { valid: false, checked: i, divergedAtSeq: e.seq };
      const { hash, ...rest } = e;
      if (hashEntry(rest) !== hash) return { valid: false, checked: i, divergedAtSeq: e.seq };
      prevHash = hash;
    }
    return { valid: true, checked: entries.length };
  }
}
