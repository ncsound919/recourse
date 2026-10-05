/**
 * acceptance.ts — the one place that answers "is it actually working?".
 *
 * WHY THIS EXISTS
 * Recourse spent a long time looking healthy while doing nothing: 24/24
 * scheduler jobs "enabled", a promoted `powerMod` reading `passed_verifier: true`
 * on a 3-assertion suite, and a forge that had built dozens of tools that
 * nothing called. Every one of those reported ABSENCE as SUCCESS. Patching
 * component after component did not fix that; it just moved the gap.
 *
 * So the definition of "working" is made explicit, and it is deliberately
 * hard to satisfy by accident:
 *
 *   1. A stage passes only on a RECORDED EVENT — an artifact produced at a
 *      timestamp by the code that genuinely did the work. Never on "the module
 *      exists", never on a config flag, never on a code path being reachable.
 *   2. An event older than the freshness window is a FAILURE, not a pass. A
 *      system that worked once and has been dark since is dark.
 *   3. Absence of evidence is always a failure, and says what is missing.
 *   4. `recordStage` is called from the success path of the real work. A stage
 *      whose recording hook is missing simply cannot pass, which is the point:
 *      the gate can only be satisfied by the thing actually running.
 *
 * The end-to-end claim this encodes is:
 *   scheduled -> audited -> generated -> verified -> consumed -> learned
 * with `dream` and `evolving` required to be actively advancing.
 */

import fs from 'node:fs';
import path from 'node:path';

/** The stages, in the order the system is supposed to produce them. */
export const ACCEPTANCE_STAGES = [
  'scheduled',
  'audited',
  'generated',
  'verified',
  'consumed',
  'learned',
  'dream',
  'evolving',
  /** A forge-built tool is serving a real production call site, proven equal to
   *  an independent hand-written reference. Stricter than `consumed`, which only
   *  proves a tool was invoked somewhere. */
  'adopted',
] as const;

export type AcceptanceStage = (typeof ACCEPTANCE_STAGES)[number];

export interface StageEvent {
  stage: AcceptanceStage;
  /** When the work actually happened (epoch ms). */
  at: number;
  /** Human-readable proof: id, hash, counts. Empty detail is not accepted. */
  detail: string;
}

export interface StageVerdict {
  stage: AcceptanceStage;
  ok: boolean;
  /** Why it failed, or what proves it passed. */
  why: string;
  at: number | null;
  ageMs: number | null;
}

export interface AcceptanceReport {
  /** The single verdict. True only when EVERY stage passes. */
  pass: boolean;
  stages: StageVerdict[];
  /** Stage count, for the headline. */
  passed: number;
  total: number;
  /** How long an event may be old and still count. */
  freshnessMs: number;
  checkedAt: number;
  /** One line an operator can read without parsing JSON. */
  headline: string;
}

/**
 * Freshness windows, per stage.
 *
 * These are deliberately NOT uniform. A dream cycle runs on a long cadence, so a
 * day-old dream cycle is current; a forge cycle runs every few minutes, so an
 * hour-old one means the forge has stopped. Using one window for all stages
 * would either pass a dead dream engine or fail a busy forge.
 */
export const STAGE_FRESHNESS_MS: Record<AcceptanceStage, number> = {
  scheduled: 30 * 60_000, // 30 min — the scheduler's own cadence is minutes
  audited: 6 * 60 * 60_000, // 6 h — a full audit of a real repo takes minutes
  generated: 6 * 60 * 60_000, // 6 h — forge cycle cadence
  verified: 6 * 60 * 60_000,
  consumed: 24 * 60 * 60_000, // 24 h — consumption is per-cycle, not per-minute
  learned: 24 * 60 * 60_000,
  // Adoption is a boot-time proof, so it only needs to survive until the next
  // boot re-runs the pass. 24 h is generous but keeps the stage from flapping if
  // a boot is delayed.
  adopted: 24 * 60 * 60_000,
  dream: 24 * 60 * 60_000, // dream cycles are long by design
  evolving: 24 * 60 * 60_000,
};

// ---------------------------------------------------------------------------
// Durable event ledger
// ---------------------------------------------------------------------------

interface LedgerShape {
  version: 1;
  events: Partial<Record<AcceptanceStage, StageEvent>>;
}

function ledgerPath(root = process.cwd()): string {
  return path.join(root, 'data', 'acceptance-events.json');
}

function readLedger(root?: string): LedgerShape {
  try {
    const raw = fs.readFileSync(ledgerPath(root), 'utf8');
    const parsed = JSON.parse(raw) as LedgerShape;
    if (parsed && typeof parsed === 'object' && parsed.events) return parsed;
  } catch {
    // missing or unreadable -> start empty; every stage then fails, which is
    // the correct reading of "no evidence".
  }
  return { version: 1, events: {} };
}

/**
 * Record that a stage genuinely happened.
 *
 * `detail` is REQUIRED and must be non-empty: a stage with nothing to say about
 * what it produced is not evidence, and an empty string would let a bare
 * "it ran" satisfy the gate.
 */
export function recordStage(stage: AcceptanceStage, detail: string, at = Date.now(), root = process.cwd()): StageEvent {
  if (!detail || !detail.trim()) {
    throw new Error(`acceptance: stage "${stage}" cannot be recorded without detail`);
  }
  const ledger = readLedger(root);
  ledger.events[stage] = { stage, at, detail: detail.trim() };
  try {
    fs.mkdirSync(path.dirname(ledgerPath(root)), { recursive: true });
    fs.writeFileSync(ledgerPath(root), JSON.stringify(ledger, null, 2), 'utf8');
  } catch (err) {
    // A ledger that cannot be persisted must not break the work that recorded
    // it — but say so, loudly, or the gate would silently pass on stale data.
    console.warn(`[acceptance] failed to persist stage "${stage}": ${(err as Error)?.message}`);
  }
  return ledger.events[stage]!;
}

/** Read the recorded events without judging them. */
export function acceptanceEvents(root = process.cwd()): Partial<Record<AcceptanceStage, StageEvent>> {
  return readLedger(root).events;
}

/** Test seam: forget everything. */
export function resetAcceptance(root = process.cwd()): void {
  try {
    fs.rmSync(ledgerPath(root), { force: true });
  } catch {
    /* already absent */
  }
}

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

/**
 * Evaluate every stage against the recorded events.
 *
 * No stage can pass without an event, and no event older than its stage's
 * freshness window counts. `now` is injectable so this is testable without
 * sleeping.
 */
export function evaluateAcceptance(
  opts: { root?: string; now?: number; overrides?: Partial<Record<AcceptanceStage, StageVerdict>> } = {},
): AcceptanceReport {
  const now = opts.now ?? Date.now();
  const events = acceptanceEvents(opts.root);
  const stages: StageVerdict[] = [];

  for (const stage of ACCEPTANCE_STAGES) {
    const override = opts.overrides?.[stage];
    if (override) {
      stages.push(override);
      continue;
    }
    const ev = events[stage];
    if (!ev) {
      stages.push({
        stage,
        ok: false,
        why: `no evidence recorded — "${stage}" has never been observed doing work`,
        at: null,
        ageMs: null,
      });
      continue;
    }
    const ageMs = now - ev.at;
    const window = STAGE_FRESHNESS_MS[stage];
    if (ageMs > window) {
      stages.push({
        stage,
        ok: false,
        why: `last worked ${Math.round(ageMs / 60_000)} min ago, outside the ${Math.round(window / 60_000)} min window — worked once, dark since`,
        at: ev.at,
        ageMs,
      });
      continue;
    }
    stages.push({ stage, ok: true, why: ev.detail, at: ev.at, ageMs });
  }

  const passed = stages.filter((s) => s.ok).length;
  const failing = stages.filter((s) => !s.ok);
  return {
    pass: failing.length === 0,
    stages,
    passed,
    total: stages.length,
    freshnessMs: Math.max(...ACCEPTANCE_STAGES.map((s) => STAGE_FRESHNESS_MS[s])),
    checkedAt: now,
    headline:
      failing.length === 0
        ? `ACCEPTED: ${passed}/${stages.length} stages working`
        : `NOT ACCEPTED: ${passed}/${stages.length} — failing: ${failing.map((s) => s.stage).join(', ')}`,
  };
}