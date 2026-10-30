/**
 * Tool health telemetry — tracks per-tool call counts, successes, failures and
 * latency so the discovery layer and the learner can rank tools by real usage
 * rather than by description alone. In-memory (per process); persisted via the
 * Sieve spine in production.
 */

export interface ToolHealth {
  name: string;
  calls: number;
  successes: number;
  failures: number;
  totalLatencyMs: number;
  lastCalledAt: number | null;
}

const HEALTH: Map<string, ToolHealth> = new Map();

export function recordToolCall(name: string, ok: boolean, latencyMs: number): void {
  let h = HEALTH.get(name);
  if (!h) {
    h = { name, calls: 0, successes: 0, failures: 0, totalLatencyMs: 0, lastCalledAt: null };
    HEALTH.set(name, h);
  }
  h.calls += 1;
  if (ok) h.successes += 1;
  else h.failures += 1;
  h.totalLatencyMs += Math.max(0, latencyMs);
  h.lastCalledAt = Date.now();
}

export function getToolHealth(name: string): ToolHealth | undefined {
  return HEALTH.get(name);
}

export function listToolHealth(): ToolHealth[] {
  return Array.from(HEALTH.values());
}

export function clearToolHealth(): void {
  HEALTH.clear();
}

/** Success rate in [0,1], or null if never called. */
export function successRate(name: string): number | null {
  const h = HEALTH.get(name);
  if (!h || h.calls === 0) return null;
  return h.successes / h.calls;
}

/** Average latency in ms, or null if never called. */
export function avgLatency(name: string): number | null {
  const h = HEALTH.get(name);
  if (!h || h.calls === 0) return null;
  return h.totalLatencyMs / h.calls;
}

/**
 * Health-adjusted score for discovery ranking: combines base cosine similarity
 * with a success-rate bonus and a latency penalty. Never lets health fully
 * override relevance (max 30% influence).
 */
export function healthBoost(name: string): number {
  const h = HEALTH.get(name);
  if (!h || h.calls === 0) return 0;
  const rate = h.successes / h.calls;
  const latencyPenalty = Math.min(0.1, (h.totalLatencyMs / h.calls) / 10000);
  return (rate - 0.5) * 0.3 - latencyPenalty;
}
