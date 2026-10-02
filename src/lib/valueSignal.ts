/**
 * valueSignal.ts — did anything actually get USED?
 *
 * The learner was ingesting three kinds of event that carry no information
 * about value:
 *   1. `capability_served` fired 1,016 times, always the same capability.
 *   2. `selfhosted_tool_called` fired 475 times across 5 tools, exactly 95
 *      each — a heartbeat walking a fixed list with empty arguments.
 *   3. `promotion_refused` taught only "don't duplicate".
 *
 * ~95% of the overnight signal was noise, which is why calibration drifted
 * from 0.073 to 0.127 while episodes grew 17%.
 *
 * A VALUE signal has one property the activity signal lacks: it is defined
 * by CONSUMPTION, not invocation. A tool that ran but whose output nobody
 * used is worth zero. This module makes that measurable, so the learner can
 * be gated on it.
 *
 * Purely additive: nothing here changes existing scoring. It exists so the
 * gate can be introduced and measured before it is trusted.
 */

export type ValueEventKind =
  | 'tool_invoked'   // a caller asked for this tool (real arguments)
  | 'tool_consumed'  // something downstream used the result
  | 'tool_discarded' // result produced but never consumed
  | 'capability_served'
  | 'loop_tick'      // liveness heartbeat — explicitly NOT value
  | 'loop_error';

export interface ValueEvent {
  kind: ValueEventKind;
  /** Tool / capability identity. */
  subject: string;
  /** What consumed the result, when consumed. */
  consumer?: string;
  /** Correlation id linking invocation to consumption. */
  traceId?: string;
  /** Wall clock. */
  at: number;
  /** True when this event should count toward usefulness. */
  countsAsValue: boolean;
}

export interface ValueLedger {
  events: ValueEvent[];
  nextTrace: number;
}

export function newValueLedger(): ValueLedger {
  return { events: [], nextTrace: 1 };
}

/**
 * Record an invocation. Returns the trace id that a later consumption
 * should reference. Empty-argument calls are still recorded but marked as
 * non-value, so they never inflate the score.
 */
export function recordInvocation(
  ledger: ValueLedger,
  subject: string,
  opts: { realArguments?: boolean; consumer?: string } = {}
): string {
  const traceId = `t${ledger.nextTrace++}`;
  const isReal = opts.realArguments !== false;
  ledger.events.push({
    kind: 'tool_invoked',
    subject,
    traceId,
    at: Date.now(),
    countsAsValue: isReal,
  });
  return traceId;
}

/**
 * Record that a result was actually used. This is the only event the value
 * score counts, and it requires someone to name a consumer.
 */
export function recordConsumption(
  ledger: ValueLedger,
  subject: string,
  consumer: string,
  traceId?: string
): void {
  ledger.events.push({
    kind: 'tool_consumed',
    subject,
    consumer,
    traceId,
    at: Date.now(),
    countsAsValue: true,
  });
}

/** Record that a result was produced and thrown away. */
export function recordDiscard(
  ledger: ValueLedger,
  subject: string,
  traceId?: string
): void {
  ledger.events.push({
    kind: 'tool_discarded',
    subject,
    traceId,
    at: Date.now(),
    countsAsValue: false,
  });
}

/** Liveness heartbeat. Explicitly zero value. */
export function recordLoopTick(ledger: ValueLedger, subject: string, ok: boolean): void {
  ledger.events.push({
    kind: ok ? 'loop_tick' : 'loop_error',
    subject,
    at: Date.now(),
    countsAsValue: false,
  });
}

// ==========================================
// Scoring
// ==========================================

export interface SubjectScore {
  subject: string;
  /** Times a real caller invoked it. */
  invoked: number;
  /** Times its output was consumed by something. */
  consumed: number;
  /** Times it ran but the result was discarded. */
  discarded: number;
  /** Liveness ticks — shown for transparency, never scored. */
  ticks: number;
  /** Distinct consumers. */
  consumers: string[];
  /**
   * Usefulness in [0,1]. A tool is useful only when its output is consumed.
   * `consumed / invoked` — an invoked-but-never-consumed tool scores 0 no
   * matter how often it ran.
   */
  usefulness: number;
}

export function scoreSubject(ledger: ValueLedger, subject: string): SubjectScore {
  let invoked = 0, consumed = 0, discarded = 0, ticks = 0;
  const consumers = new Set<string>();

  for (const e of ledger.events) {
    if (e.subject !== subject) continue;
    if (e.kind === 'tool_invoked' && e.countsAsValue) invoked++;
    else if (e.kind === 'tool_consumed') { consumed++; if (e.consumer) consumers.add(e.consumer); }
    else if (e.kind === 'tool_discarded') discarded++;
    else if (e.kind === 'loop_tick' || e.kind === 'loop_error') ticks++;
  }

  const usefulness = invoked > 0 ? Math.min(1, consumed / invoked) : 0;
  return {
    subject,
    invoked, consumed, discarded, ticks,
    consumers: [...consumers],
    usefulness,
  };
}

/** Score every subject that appears in the ledger. */
export function scoreAll(ledger: ValueLedger): SubjectScore[] {
  const subjects = [...new Set(ledger.events.map((e) => e.subject))];
  return subjects.map((s) => scoreSubject(ledger, s)).sort((a, b) => b.usefulness - a.usefulness);
}

export interface ValueSummary {
  totalEvents: number;
  countingEvents: number;
  noiseEvents: number;
  /** Share of the signal that carries information about value. */
  signalQuality: number;
  top: SubjectScore[];
  deadWeight: SubjectScore[];
}

export function summarize(ledger: ValueLedger): ValueSummary {
  const counting = ledger.events.filter((e) => e.countsAsValue).length;
  const total = ledger.events.length;
  const scores = scoreAll(ledger);
  return {
    totalEvents: total,
    countingEvents: counting,
    noiseEvents: total - counting,
    signalQuality: total > 0 ? counting / total : 0,
    top: scores.filter((s) => s.usefulness > 0).slice(0, 10),
    deadWeight: scores.filter((s) => s.invoked > 0 && s.consumed === 0),
  };
}
