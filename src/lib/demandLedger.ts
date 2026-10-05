/**
 * demandLedger.ts — records what the running system ASKS FOR, so the forge can be
 * pointed at real needs instead of an ever-growing speculative agenda.
 *
 * WHY THIS EXISTS
 * The audit's central finding was that the forge invented work roughly 1,000x
 * faster than anything consumed it: `dynamicAgenda` reached 5,047 specs while the
 * forge drained about 5 tools/day, and 27 of 34 verified tools had no caller at
 * all. Supply was never the constraint. Adding more production capability made the
 * ratio worse, because every build with no caller is pure denominator.
 *
 * The supply-side cap (`admitAgendaSpec` in server.ts) treats that as back-pressure.
 * This module treats it as *signal*: code that would benefit from a tool says so,
 * and the forge ranks candidates by how often and how specifically they are wanted.
 *
 * This is the Function-Driven Development pattern: instrument the desire first,
 * then build what is actually asked for. Ranking is `frequency x specificity`,
 * because a tool wanted 50 times generically is worth less than one wanted twice
 * with a named caller and a concrete argument shape.
 *
 * HONESTY CONTRACT
 * `wantTool` is a *declaration of intent*, never a claim of capability. It is
 * recorded whether or not the tool exists, is verified, or is ever built. The
 * distinction between "wanted" and "adopted" is preserved end to end: nothing here
 * can make a consumption metric move. See `adoptionSites.ts` for that half.
 */
import fs from 'node:fs';
import path from 'node:path';

/** How specific a want is. Drives the ranking weight. */
export type WantSpecificity =
  /** "I would like a diff tool." — no caller, no argument shape. */
  | 'generic'
  /** "Something to normalise scores in." — a purpose, no caller. */
  | 'described'
  /** "webhooks.deliverWebhook needs this for (baseMs, attempt)." — callable. */
  | 'callable';

const SPECIFICITY_WEIGHT: Record<WantSpecificity, number> = {
  generic: 1,
  described: 3,
  callable: 10,
};

export interface WantRecord {
  tool: string;
  /** Who wants it — a module path or subsystem name. */
  caller: string;
  purpose: string;
  specificity: WantSpecificity;
  at: number;
  /** How many times this caller has asked. */
  count: number;
}

interface DemandDoc {
  version: 1;
  wants: Record<string, WantRecord>;
}

function demandPath(root = process.cwd()): string {
  return path.join(root, 'data', 'demand-ledger.json');
}

function readDemand(root?: string): DemandDoc {
  try {
    const parsed = JSON.parse(fs.readFileSync(demandPath(root), 'utf8')) as DemandDoc;
    if (parsed && typeof parsed === 'object' && parsed.wants) return parsed;
  } catch {
    // missing -> empty. Absence of demand is a valid, meaningful state.
  }
  return { version: 1, wants: {} };
}

function writeDemand(doc: DemandDoc, root?: string): void {
  try {
    fs.mkdirSync(path.dirname(demandPath(root)), { recursive: true });
    fs.writeFileSync(demandPath(root), JSON.stringify(doc, null, 2), 'utf8');
  } catch (err) {
    console.warn(`[demand] could not persist demand ledger: ${(err as Error)?.message}`);
  }
}

/** Cap distinct tracked tools so a pathological caller cannot grow the file without bound. */
const MAX_TRACKED = 500;

/**
 * In-memory counters, authoritative between writes.
 *
 * This exists because of a bug worth recording: the first implementation derived
 * the count from whatever was last PERSISTED, and the disk write was debounced to
 * power-of-two boundaries. The result was a NON-MONOTONIC counter —
 * `wantTool` returned 1,2,3,3,3 — because calls 4 and 5 re-read the count-2 value
 * from disk and recomputed 3. A counter that goes backwards silently corrupts
 * every ranking built on top of it.
 *
 * So: memory holds the truth, disk is a periodically-synced snapshot. The ledger
 * file is still the durable record (it survives a restart), it is just not the
 * thing consulted on the hot path.
 */
const liveCounts = new Map<string, number>();

/**
 * Declare that this code path would benefit from a tool.
 *
 * Cheap and safe to call from hot paths: an in-memory counter bump plus a
 * debounced write on first sight or a power-of-two boundary. A want called 10,000
 * times writes roughly 14 times, not 10,000.
 *
 * Returns the exact lifetime count for this caller/tool pair.
 */
export function wantTool(opts: {
  tool: string;
  caller: string;
  purpose: string;
  specificity?: WantSpecificity;
  root?: string;
}): number {
  const name = String(opts.tool || '').trim();
  const caller = String(opts.caller || '').trim();
  if (!name || !caller) return 0;

  const specificity = opts.specificity ?? 'described';
  const root = opts.root;
  const key = `${name}::${caller}`;
  const doc = readDemand(root);

  const count = (liveCounts.get(key) ?? doc.wants[key]?.count ?? 0) + 1;
  liveCounts.set(key, count);

  if (!doc.wants[key] && Object.keys(doc.wants).length >= MAX_TRACKED) {
    // Refuse to track rather than grow unbounded. Silently dropping is the bug
    // class this project keeps hitting, so say so once.
    console.warn(`[demand] want ledger full (${MAX_TRACKED}); not tracking "${name}" from ${caller}`);
    return count;
  }

  doc.wants[key] = {
    tool: name,
    caller,
    purpose: opts.purpose,
    specificity,
    at: Date.now(),
    count,
  };

  // Write on first sight or a power-of-two boundary; never on every hot call.
  if (count === 1 || (count & (count - 1)) === 0) writeDemand(doc, root);
  return count;
}

export interface DemandRank {
  tool: string;
  /** Distinct callers wanting it. */
  callers: number;
  /** Total asks across all callers. */
  frequency: number;
  /** Strongest specificity any caller declared. */
  specificity: WantSpecificity;
  /** `frequency x specificity weight`, summed across callers. */
  score: number;
  /** Concrete callers, most insistent first. */
  requestedBy: string[];
}

/**
 * Rank wanted tools by `frequency x specificity`.
 *
 * Specificity is taken as the MAX across callers, not the mean: one caller naming
 * an exact argument shape is a stronger signal than ten callers saying "a diff tool
 * would be nice", and averaging would let the vague majority bury it.
 */
export function rankDemand(opts: { root?: string; limit?: number } = {}): DemandRank[] {
  const doc = readDemand(opts.root);
  const byTool = new Map<string, { frequency: number; score: number; callers: string[]; best: WantSpecificity }>();

  // Fold the in-memory counters in, taking whichever is higher. Without this,
  // ranking would read the debounced snapshot and under-report any tool whose
  // count has not yet crossed a write boundary.
  const effective = new Map<string, WantRecord>();
  for (const w of Object.values(doc.wants)) effective.set(`${w.tool}::${w.caller}`, w);
  for (const [key, count] of liveCounts) {
    const base = effective.get(key);
    if (!base || count > base.count) {
      const [tool, caller] = key.split('::');
      effective.set(key, { ...(base ?? { tool, caller, purpose: '', specificity: 'described', at: 0 }), count });
    }
  }

  for (const w of effective.values()) {
    const weight = SPECIFICITY_WEIGHT[w.specificity] ?? 1;
    const cur = byTool.get(w.tool) ?? { frequency: 0, score: 0, callers: [], best: 'generic' };
    cur.frequency += w.count;
    cur.score += w.count * weight;
    cur.callers.push(w.caller);
    if (SPECIFICITY_WEIGHT[w.specificity] > SPECIFICITY_WEIGHT[cur.best]) cur.best = w.specificity;
    byTool.set(w.tool, cur);
  }

  const ranks: DemandRank[] = [...byTool.entries()]
    .map(([tool, v]) => ({
      tool,
      callers: v.callers.length,
      frequency: v.frequency,
      specificity: v.best,
      score: v.score,
      requestedBy: v.callers.sort((a, b) => a.localeCompare(b)).slice(0, 5),
    }))
    .sort((a, b) => b.score - a.score || b.callers - a.callers || a.tool.localeCompare(b.tool));

  return opts.limit ? ranks.slice(0, opts.limit) : ranks;
}

/** Test seam. */
export function resetDemandLedger(root = process.cwd()): void {
  liveCounts.clear();
  try {
    fs.rmSync(demandPath(root), { force: true });
  } catch {
    /* already absent */
  }
}