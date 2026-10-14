/**
 * factoryStream.ts — the real-time spine of the factory dashboard.
 *
 * An in-process ring of factory events plus subscribers, so the dashboard sees
 * the pipeline AS IT HAPPENS (idea consumed -> scaffold built -> artifact
 * verified -> paper logged) rather than polling a snapshot. Deliberately tiny
 * and dependency-free: SSE is a text protocol, not a framework.
 *
 * Honesty: the ring is process-local. A restart loses history — the snapshot on
 * connect carries the durable state (artifacts/ideas from the state file), and
 * the stream carries only what has happened since boot.
 */
export interface FactoryEvent {
  seq: number;
  at: number;
  type: string;
  detail: Record<string, unknown>;
}

const RING = 300;
const ring: FactoryEvent[] = [];
const subscribers = new Set<(e: FactoryEvent) => void>();
let seq = 0;

export function emitFactoryEvent(type: string, detail: Record<string, unknown> = {}): FactoryEvent {
  const e: FactoryEvent = { seq: ++seq, at: Date.now(), type, detail };
  ring.push(e);
  if (ring.length > RING) ring.shift();
  for (const fn of subscribers) {
    try { fn(e); } catch { /* a slow subscriber must never break the emitter */ }
  }
  return e;
}

export function recentFactoryEvents(n = 100): FactoryEvent[] {
  return ring.slice(-n);
}

export function subscribeFactory(fn: (e: FactoryEvent) => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function factoryStreamStats(): { emitted: number; subscribers: number; buffered: number } {
  return { emitted: seq, subscribers: subscribers.size, buffered: ring.length };
}
