/**
 * toolValueLedger.ts — the single place that decides whether a self-hosted tool
 * was ACTUALLY USED, and by whom.
 *
 * WHY THIS EXISTS
 * `server.ts` already has the right shape for a value signal: `noteRealInvocation`,
 * `noteRealConsumption`, `toolUsefulness`, and a VALUE GATE inside
 * `realToolRewardFor` that caps a verified-but-unused tool at 10% reward. That
 * gate is the fix for the calibration regression — it gives the learner a
 * gradient toward usefulness instead of toward "has a passing suite".
 *
 * BUT `noteRealConsumption` had ZERO call sites. Only `noteInvocation` was wired,
 * and only on two HTTP routes. So `usefulness` was structurally always 0, every
 * tool scored `base * 0.1`, and the gate was a no-op that silently flattened all
 * 1,273 tools to the same floor — the exact uniformity the gate was meant to
 * remove. Wiring consumption is what turns the gate from inert into real.
 *
 * THE DISTINCTION THIS MODULE ENFORCES
 *   invocation — someone asked for the tool.
 *   consumption — the RESULT was used downstream by a named consumer.
 *
 * A tool that is invoked and never consumed scores 0 usefulness no matter how
 * often it ran. That is the whole point: verification (loop heartbeats, the
 * self-use differential watchdog) is explicitly NOT use, and is never counted
 * as consumption here.
 *
 * HONESTY CONTRACT
 *  - A caller must NAME its consumer. An anonymous consumption is refused rather
 *    than counted, because "something used it" is not a fact — it is a guess
 *    that would inflate every tool equally.
 *  - Internal subsystems pass their own name (e.g. `scienceConductor`), so the
 *    readout shows WHICH part of Recourse relies on a tool.
 *  - Counters are bounded and monotonic within a process. They are a live signal
 *    for the reward gate, not a durable audit log; provenance events remain the
 *    durable record.
 *  - This module never decides a tool is good. It only counts. Judging is
 *    `realToolRewardFor`'s job, and it now has real inputs.
 */

export type ToolConsumerKind =
  /** An operator or UI calling an HTTP route by hand. */
  | 'http'
  /** A Recourse subsystem (capability serving, science loop, repair). */
  | 'internal'
  /** An LLM agent choosing the tool from the registry. */
  | 'agent'
  /** A federated peer invoking it over the federation protocol. */
  | 'federation';

export interface ToolValueEvent {
  at: number;
  tool: string;
  kind: 'invoked' | 'consumed';
  /** Required for `consumed`; absent for `invoked`. */
  consumer?: string;
  consumerKind?: ToolConsumerKind;
  /** False when the call had empty/synthetic arguments (a liveness probe). */
  realArguments?: boolean;
}

export interface ToolValueStats {
  tool: string;
  invoked: number;
  /** Invocations that carried real arguments. */
  invokedReal: number;
  consumed: number;
  /** Distinct named consumers. */
  consumers: string[];
  /** consumed/invokedReal in [0,1]; 0 when never really invoked. */
  usefulness: number;
}

const MAX_TRACKED_TOOLS = 5000;

export class ToolValueLedger {
  private invoked = new Map<string, number>();
  private invokedReal = new Map<string, number>();
  private consumed = new Map<string, number>();
  private consumers = new Map<string, Set<string>>();
  /** Recent events, for the operator readout. Bounded. */
  private recent: ToolValueEvent[] = [];
  private readonly recentCap: number;

  constructor(opts: { recentCap?: number } = {}) {
    this.recentCap = Math.max(0, opts.recentCap ?? 50);
  }

  private push(e: ToolValueEvent): void {
    if (this.recent.length >= this.recentCap) this.recent.shift();
    this.recent.push(e);
  }

  /**
   * Record that a caller asked for this tool.
   *
   * `realArguments: false` marks a liveness/heartbeat probe: it still counts as
   * an invocation for diagnostics, but NOT toward the usefulness denominator. A
   * heartbeat that ran a tool 475 times must not make it look useful.
   */
  noteInvocation(tool: string, opts: { realArguments?: boolean; consumerKind?: ToolConsumerKind } = {}): void {
    const name = String(tool || '').trim();
    if (!name) return;
    if (this.invoked.size < MAX_TRACKED_TOOLS || this.invoked.has(name)) {
      this.invoked.set(name, (this.invoked.get(name) ?? 0) + 1);
      if (opts.realArguments !== false) {
        this.invokedReal.set(name, (this.invokedReal.get(name) ?? 0) + 1);
      }
    }
    this.push({
      at: Date.now(),
      tool: name,
      kind: 'invoked',
      realArguments: opts.realArguments !== false,
      consumerKind: opts.consumerKind,
    });
  }

  /**
   * Record that a tool's OUTPUT was used downstream.
   *
   * `consumer` is REQUIRED. Refusing an anonymous consumption is deliberate: it
   * is the difference between "the science loop used this" and "something used
   * this", and only the first is a fact the reward gate can rest on.
   *
   * Returns whether the consumption was counted.
   */
  noteConsumption(
    tool: string,
    consumer: string,
    opts: { consumerKind?: ToolConsumerKind } = {},
  ): boolean {
    const name = String(tool || '').trim();
    const who = String(consumer || '').trim();
    if (!name || !who) return false;
    this.consumed.set(name, (this.consumed.get(name) ?? 0) + 1);
    const set = this.consumers.get(name) ?? new Set<string>();
    set.add(who);
    this.consumers.set(name, set);
    this.push({ at: Date.now(), tool: name, kind: 'consumed', consumer: who, consumerKind: opts.consumerKind });
    return true;
  }

  stats(tool: string): ToolValueStats {
    const invoked = this.invoked.get(tool) ?? 0;
    const invokedReal = this.invokedReal.get(tool) ?? 0;
    const consumed = this.consumed.get(tool) ?? 0;
    return {
      tool,
      invoked,
      invokedReal,
      consumed,
      consumers: [...(this.consumers.get(tool) ?? new Set<string>())].sort(),
      usefulness: invokedReal > 0 ? Math.min(1, consumed / invokedReal) : 0,
    };
  }

  /** Usefulness in [0,1] for a tool, or 0 when it was never really invoked. */
  usefulness(tool: string): number {
    return this.stats(tool).usefulness;
  }

  /** Every tracked tool, most useful first. */
  all(): ToolValueStats[] {
    return [...this.invoked.keys()].map((t) => this.stats(t)).sort((a, b) => b.usefulness - a.usefulness || a.tool.localeCompare(b.tool));
  }

  /**
   * Tools that ran but whose output nobody ever used. This is the list your
   * dead-code audit is actually looking for: not "never referenced", but
   * "referenced, executed, and pointless".
   */
  deadWeight(): ToolValueStats[] {
    return this.all().filter((s) => s.invokedReal > 0 && s.consumed === 0);
  }

  recentEvents(limit = this.recentCap): ToolValueEvent[] {
    return this.recent.slice(-Math.max(0, limit));
  }

  /** Process-wide totals, for the readout's signal-quality figure. */
  totals(): { invoked: number; invokedReal: number; consumed: number; tools: number } {
    let invoked = 0, invokedReal = 0, consumed = 0;
    for (const t of this.invoked.keys()) {
      invoked += this.invoked.get(t) ?? 0;
      invokedReal += this.invokedReal.get(t) ?? 0;
      consumed += this.consumed.get(t) ?? 0;
    }
    return { invoked, invokedReal, consumed, tools: this.invoked.size };
  }
}

let singleton: ToolValueLedger | null = null;

/** Process-wide value ledger. */
export function toolValueLedger(): ToolValueLedger {
  if (!singleton) singleton = new ToolValueLedger();
  return singleton;
}

/** Test seam: drop the singleton so a fresh ledger is created. */
export function resetToolValueLedger(): void {
  singleton = null;
}