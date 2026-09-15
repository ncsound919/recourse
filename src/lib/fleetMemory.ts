import type { MemoryKind } from './vectorMemory.js';

/**
 * Fleet memory intake — pure normalization for the guarded
 * `POST /api/recourse/fleet/memory` route.
 *
 * External fleet agents (Axiom, OpenHub, Draymond) report real loop outcomes
 * here; Recourse folds them into its durable vector memory so it self-learns
 * across the fleet. This module only shapes the payload — it does no I/O and
 * never invents text: a body with no usable content is rejected, not padded.
 */

export const FLEET_MEMORY_MAX_TEXT = 10_000;

export const FLEET_MEMORY_KINDS: readonly MemoryKind[] = ['gene', 'lesson', 'hypothesis', 'signal', 'snapshot'];

export interface FleetMemoryBody {
  source?: unknown;
  kind?: unknown;
  id?: unknown;
  text?: unknown;
  goal?: unknown;
  status?: unknown;
  summary?: unknown;
  iteration?: unknown;
  slopScore?: unknown;
  repairCount?: unknown;
  findings?: unknown;
}

export interface FleetMemoryEntry {
  ok: boolean;
  error?: string;
  kind?: MemoryKind;
  id?: string;
  text?: string;
  meta?: Record<string, unknown>;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Build the memory entry for a fleet intake body. Deterministic; no clock. */
export function buildFleetMemoryEntry(body: FleetMemoryBody, now: number = Date.now()): FleetMemoryEntry {
  const source = asString(body.source).slice(0, 64) || 'fleet';
  const kind: MemoryKind = (FLEET_MEMORY_KINDS as readonly string[]).includes(body.kind as string)
    ? (body.kind as MemoryKind)
    : 'lesson';

  const explicit = asString(body.text);
  const composed = [
    body.goal !== undefined ? `goal: ${String(body.goal)}` : '',
    body.status !== undefined ? `status: ${String(body.status)}` : '',
    asString(body.summary),
    body.iteration !== undefined ? `iteration: ${String(body.iteration)}` : '',
    body.slopScore !== undefined ? `slopScore: ${String(body.slopScore)}` : '',
    body.repairCount !== undefined ? `repairs: ${String(body.repairCount)}` : '',
  ].filter(Boolean).join(' | ');
  const text = explicit || composed;

  if (!text) return { ok: false, error: 'text (or goal/status/summary) is required' };
  if (text.length > FLEET_MEMORY_MAX_TEXT) {
    return { ok: false, error: `text exceeds ${FLEET_MEMORY_MAX_TEXT} chars` };
  }

  const id = asString(body.id).slice(0, 200) || `fleet:${source}:${now.toString(36)}`;
  const goal = asString(body.goal);
  const status = asString(body.status);
  return {
    ok: true,
    kind,
    id,
    text,
    meta: {
      source,
      ...(goal ? { goal: goal.slice(0, 300) } : {}),
      ...(status ? { status } : {}),
      ...(Array.isArray(body.findings) ? { findings: body.findings.slice(0, 10) } : {}),
    },
  };
}
