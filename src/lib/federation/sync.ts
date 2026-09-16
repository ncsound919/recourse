/**
 * sync.ts — pure planning/merge logic for federated registry, memory and skill
 * replication. No IO: callers read their stores, call `planSync` to decide what
 * to exchange, then `applyBundle` to merge received items. That keeps the
 * conflict rules unit-testable and identical on both sides of a peer link.
 *
 * Conflict rule: content-addressed by `contentHash`; when ids collide with
 * different content, the newer `updatedAt` wins. A true tie (same id, different
 * hash, same timestamp) is reported as a conflict and neither side overwrites —
 * it is surfaced, never silently resolved.
 */
import { canonicalize, sha256Hex } from './canonical.js';

export type SyncKind = 'skill' | 'registry' | 'memory';

export const SYNC_KINDS: readonly SyncKind[] = ['skill', 'registry', 'memory'];

export interface SyncItem {
  id: string;
  kind: SyncKind;
  contentHash: string;
  updatedAt: number;
  payload: unknown;
}

export interface SyncBundle {
  source: string;
  kind: SyncKind;
  generatedAt: number;
  items: SyncItem[];
}

export const MAX_SYNC_ITEMS = 500;
export const MAX_SYNC_BYTES = 2_000_000;

/** Content hash of an arbitrary JSON-safe payload (canonical + SHA-256). */
export function contentHashOf(payload: unknown): string {
  return sha256Hex(canonicalize(payload));
}

export function makeSyncItem(kind: SyncKind, id: string, payload: unknown, updatedAt = Date.now()): SyncItem {
  return { id, kind, contentHash: contentHashOf(payload), updatedAt, payload };
}

export function buildBundle(
  kind: SyncKind,
  items: SyncItem[],
  source: string,
  now: number = Date.now(),
): SyncBundle {
  return { source, kind, generatedAt: now, items: items.slice(0, MAX_SYNC_ITEMS) };
}

export interface BundleValidation {
  ok: boolean;
  reason?: string;
  bytes: number;
  itemCount: number;
}

/** Shape + size validation for an inbound bundle. Oversized/overspecified
 *  bundles are rejected outright — never partially trusted. */
export function validateBundle(bundle: unknown): BundleValidation {
  if (!bundle || typeof bundle !== 'object') return { ok: false, reason: 'not an object', bytes: 0, itemCount: 0 };
  const b = bundle as Record<string, unknown>;
  if (typeof b.source !== 'string' || !b.source) return { ok: false, reason: 'missing source', bytes: 0, itemCount: 0 };
  if (typeof b.kind !== 'string' || !SYNC_KINDS.includes(b.kind as SyncKind)) {
    return { ok: false, reason: 'unknown kind', bytes: 0, itemCount: 0 };
  }
  if (!Array.isArray(b.items)) return { ok: false, reason: 'items must be an array', bytes: 0, itemCount: 0 };
  if (b.items.length > MAX_SYNC_ITEMS) {
    return { ok: false, reason: `too many items (${b.items.length} > ${MAX_SYNC_ITEMS})`, bytes: 0, itemCount: b.items.length };
  }
  let bytes = 0;
  for (const raw of b.items) {
    if (!raw || typeof raw !== 'object') return { ok: false, reason: 'malformed item', bytes, itemCount: b.items.length };
    const it = raw as Record<string, unknown>;
    if (typeof it.id !== 'string' || typeof it.contentHash !== 'string' || typeof it.updatedAt !== 'number') {
      return { ok: false, reason: 'malformed item fields', bytes, itemCount: b.items.length };
    }
    if (it.kind !== b.kind) return { ok: false, reason: `item kind mismatch for ${it.id}`, bytes, itemCount: b.items.length };
    if (contentHashOf(it.payload) !== it.contentHash) {
      return { ok: false, reason: `content hash mismatch for ${it.id}`, bytes, itemCount: b.items.length };
    }
    bytes += canonicalize(it).length;
  }
  if (bytes > MAX_SYNC_BYTES) {
    return { ok: false, reason: `bundle too large (${bytes} > ${MAX_SYNC_BYTES})`, bytes, itemCount: b.items.length };
  }
  return { ok: true, bytes, itemCount: b.items.length };
}

export interface SyncPlan {
  toPull: string[];
  toPush: string[];
  unchanged: string[];
  conflicts: string[];
}

/** Decide which items to pull (remote newer/absent locally) vs push (local
 *  newer/absent remotely). */
export function planSync(local: readonly SyncItem[], remote: readonly SyncItem[]): SyncPlan {
  const localById = new Map(local.map((i) => [i.id, i]));
  const remoteById = new Map(remote.map((i) => [i.id, i]));
  const toPull: string[] = [];
  const toPush: string[] = [];
  const unchanged: string[] = [];
  const conflicts: string[] = [];

  const ids = new Set<string>([...localById.keys(), ...remoteById.keys()]);
  for (const id of [...ids].sort()) {
    const l = localById.get(id);
    const r = remoteById.get(id);
    if (!l && r) { toPull.push(id); continue; }
    if (l && !r) { toPush.push(id); continue; }
    if (!l || !r) continue;
    if (l.contentHash === r.contentHash) { unchanged.push(id); continue; }
    if (r.updatedAt > l.updatedAt) toPull.push(id);
    else if (l.updatedAt > r.updatedAt) toPush.push(id);
    else conflicts.push(id);
  }
  return { toPull, toPush, unchanged, conflicts };
}

export function selectItems(bundle: SyncBundle, ids: readonly string[]): SyncItem[] {
  const wanted = new Set(ids);
  return bundle.items.filter((i) => wanted.has(i.id));
}

export interface ApplyResult {
  merged: SyncItem[];
  applied: number;
  skipped: number;
}

/** Merge a validated bundle into local items by id, newer-wins per id. */
export function applyBundle(local: readonly SyncItem[], bundle: SyncBundle): ApplyResult {
  const merged = new Map(local.map((i) => [i.id, i]));
  let applied = 0;
  let skipped = 0;
  for (const item of bundle.items) {
    const existing = merged.get(item.id);
    if (!existing || item.updatedAt > existing.updatedAt) {
      merged.set(item.id, { ...item, kind: bundle.kind });
      applied += 1;
    } else {
      skipped += 1;
    }
  }
  return { merged: [...merged.values()], applied, skipped };
}
