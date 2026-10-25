/**
 * Durable compute-job handles.
 *
 * `submit` returns a platform handle whose `externalId` is the real remote id
 * (for Kaggle, `djoochie/<kernel-slug>`). Poll/result/cancel must use that id.
 * The map used to be in-memory only, so a gateway restart forgot every kernel
 * ref and later polls fell back to the caller's local job id — which no
 * platform knows.
 *
 * This store is file-backed and dependency-free, matching the pattern used by
 * `reporterStore`/`benchmarkLedger`:
 *   data/compute-handles.json   newest-first array of handles
 *
 * Rules:
 * * Writes are atomic (temp file + rename); a killed process cannot leave a
 *   half-written JSON that would poison the next boot.
 * * Corrupt, absent, or malformed files degrade to an empty store — never a
 *   fabricated handle.
 * * Only handles with non-empty ids are kept; the local platform deliberately
 *   uses the job id as its external id, and that is still a real handle.
 * `COMPUTE_HANDLES_FILE` overrides the path (tests, alternate checkouts).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ComputeJobHandle } from './computePlatforms.js';

/** Newest N remote jobs kept on disk; older refs are not useful for polling. */
export const COMPUTE_HANDLE_CAP = 500;

const STATUSES: ReadonlySet<string> = new Set([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

export function computeHandlesFile(): string {
  return process.env.COMPUTE_HANDLES_FILE || path.join(process.cwd(), 'data', 'compute-handles.json');
}

function isHandle(value: unknown): value is ComputeJobHandle {
  if (!value || typeof value !== 'object') return false;
  const h = value as Partial<ComputeJobHandle>;
  return (
    typeof h.id === 'string' &&
    h.id.length > 0 &&
    typeof h.externalId === 'string' &&
    h.externalId.length > 0 &&
    typeof h.platform === 'string' &&
    h.platform.length > 0 &&
    typeof h.submittedAt === 'number' &&
    Number.isFinite(h.submittedAt) &&
    typeof h.status === 'string' &&
    STATUSES.has(h.status)
  );
}

/**
 * Read and validate the handle file. Duplicate ids keep the newest record;
 * results are newest-first and capped. Never throws.
 */
export function readComputeHandles(file = computeHandlesFile()): ComputeJobHandle[] {
  try {
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, 'utf-8').trim();
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { handles?: unknown })?.handles)
        ? (parsed as { handles: unknown[] }).handles
        : [];
    const byId = new Map<string, ComputeJobHandle>();
    for (const entry of list) {
      if (!isHandle(entry)) continue;
      const prior = byId.get(entry.id);
      // Later entries in the file win at equal timestamps (the writer sorts
      // newest-first, so this only matters for hand-edited files).
      if (!prior || prior.submittedAt <= entry.submittedAt) byId.set(entry.id, entry);
    }
    return [...byId.values()]
      .sort((a, b) => b.submittedAt - a.submittedAt)
      .slice(0, COMPUTE_HANDLE_CAP);
  } catch {
    return [];
  }
}

/** Atomically replace the file with `handles`. Failures are logged, not thrown. */
export function writeComputeHandles(handles: ComputeJobHandle[], file = computeHandlesFile()): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const sorted = [...handles]
      .filter(isHandle)
      .sort((a, b) => b.submittedAt - a.submittedAt)
      .slice(0, COMPUTE_HANDLE_CAP);
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(sorted, null, 2), 'utf-8');
    fs.renameSync(tmp, file);
  } catch (err) {
    console.warn(
      '[computeHandles] persist failed:',
      err instanceof Error ? err.message : String(err),
    );
  }
}

export class ComputeHandleStore {
  private readonly handles = new Map<string, ComputeJobHandle>();
  private readonly byExternal = new Map<string, ComputeJobHandle>();

  constructor(readonly file: string = computeHandlesFile()) {
    for (const handle of readComputeHandles(file)) this.index(handle);
  }

  private index(handle: ComputeJobHandle): void {
    this.handles.set(handle.id, handle);
    this.byExternal.set(handle.externalId, handle);
  }

  /** Record a newly submitted handle (or a status update) and persist it. */
  remember(handle: ComputeJobHandle): void {
    if (!isHandle(handle)) return;
    this.index(handle);
    this.prune();
    this.persist();
  }

  /** Update a known handle in place; unknown ids are ignored. */
  update(id: string, patch: Partial<ComputeJobHandle>): ComputeJobHandle | null {
    const existing = this.lookup(id);
    if (!existing) return null;
    const next: ComputeJobHandle = { ...existing, ...patch, id: existing.id, externalId: existing.externalId };
    this.index(next);
    this.persist();
    return next;
  }

  has(id: string): boolean {
    return this.handles.has(id) || this.byExternal.has(id);
  }

  /** Lookup by local job id or by the platform's external id. */
  lookup(id: string): ComputeJobHandle | null {
    return this.handles.get(id) ?? this.byExternal.get(id) ?? null;
  }

  /** Newest-first snapshot (what would be written to disk). */
  all(): ComputeJobHandle[] {
    return [...this.handles.values()].sort((a, b) => b.submittedAt - a.submittedAt);
  }

  get size(): number {
    return this.handles.size;
  }

  private prune(): void {
    if (this.handles.size <= COMPUTE_HANDLE_CAP) return;
    const keep = new Set(
      this.all()
        .slice(0, COMPUTE_HANDLE_CAP)
        .map((h) => h.id),
    );
    // Collect first: deleting while iterating a Map can skip entries.
    const stale: Array<{ id: string; externalId: string }> = [];
    for (const [id, handle] of this.handles) {
      if (!keep.has(id)) stale.push({ id, externalId: handle.externalId });
    }
    for (const { id, externalId } of stale) {
      this.handles.delete(id);
      this.byExternal.delete(externalId);
    }
  }

  private persist(): void {
    writeComputeHandles(this.all(), this.file);
  }
}
