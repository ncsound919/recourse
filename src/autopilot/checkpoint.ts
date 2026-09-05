/**
 * checkpoint.ts — interactive-veto checkpoint persistence.
 *
 * Stores checkpoints as JSON files under `{checkpointsDir}/{slug}/{checkpointId}.json`.
 * A checkpoint represents a loop pause pending human review (approve / reject).
 * No external dependency; caller passes file paths or defaults.
 */

import fs from 'node:fs';
import path from 'node:path';
import { Checkpoint, type CheckpointT, type CheckpointStatusT } from './loopTypes';
import type { RepoBindingT } from './businessProfile';

export const DEFAULT_CHECKPOINTS_DIR = 'data/business-profiles';

export interface CheckpointStore {
  save(checkpoint: CheckpointT): Promise<void>;
  load(id: string): Promise<CheckpointT | undefined>;
  list(slug: string): Promise<CheckpointT[]>;
  resolve(id: string): Promise<CheckpointT | undefined>;
  remove(id: string): Promise<void>;
}

export class FileCheckpointStore implements CheckpointStore {
  private readonly baseDir: string;

  constructor(baseDir: string = DEFAULT_CHECKPOINTS_DIR) {
    this.baseDir = baseDir;
  }

  private filePath(slug: string, id: string): string {
    return path.join(this.baseDir, slug, 'checkpoints', `${id}.json`);
  }

  async save(checkpoint: CheckpointT): Promise<void> {
    const dir = path.dirname(this.filePath(checkpoint.profileSlug, checkpoint.id));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.filePath(checkpoint.profileSlug, checkpoint.id), JSON.stringify(checkpoint, null, 2), 'utf8');
  }

  async load(id: string): Promise<CheckpointT | undefined> {
    // Search all slug dirs for the checkpoint ID
    if (!fs.existsSync(this.baseDir)) return undefined;
    for (const slug of fs.readdirSync(this.baseDir)) {
      const fp = this.filePath(slug, id);
      if (fs.existsSync(fp)) {
        const raw = fs.readFileSync(fp, 'utf8');
        const parsed = JSON.parse(raw) as unknown;
        const result = Checkpoint.safeParse(parsed);
        if (result.success) return result.data;
      }
    }
    return undefined;
  }

  async list(slug: string): Promise<CheckpointT[]> {
    const dir = path.join(this.baseDir, slug, 'checkpoints');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const raw = fs.readFileSync(path.join(dir, f), 'utf8');
        const parsed = JSON.parse(raw) as unknown;
        const result = Checkpoint.safeParse(parsed);
        return result.success ? result.data : null;
      })
      .filter((c): c is CheckpointT => c !== null);
  }

  async resolve(id: string): Promise<CheckpointT | undefined> {
    return this.load(id);
  }

  async remove(id: string): Promise<void> {
    if (!fs.existsSync(this.baseDir)) return;
    for (const slug of fs.readdirSync(this.baseDir)) {
      const fp = this.filePath(slug, id);
      if (fs.existsSync(fp)) {
        fs.unlinkSync(fp);
      }
    }
  }
}

/** Validate that a checkpoint is required for the profile's repo binding. */
export function requireCheckpoint(profileRepo: RepoBindingT | null): RepoBindingT {
  if (!profileRepo) {
    throw new Error('checkpoint requires a repo binding (profile.repo must be set)');
  }
  return profileRepo;
}

/** Check whether a checkpoint has expired based on its expiresAt field. */
export function evaluateCheckpointTimeout(checkpoint: CheckpointT, now: Date = new Date()): boolean {
  if (!checkpoint.expiresAt) return false;
  return new Date(checkpoint.expiresAt) <= now;
}

/** Build a Checkpoint from input parameters, with validation. */
export function buildCheckpoint(
  input: Omit<CheckpointT, 'status' | 'createdAt'> & { status?: CheckpointStatusT },
  now: Date = new Date(),
): CheckpointT {
  const expiresAt = input.expiresAt ? new Date(input.expiresAt).toISOString() : undefined;
  return Checkpoint.parse({
    ...input,
    status: input.status ?? 'pending',
    createdAt: now.toISOString(),
    expiresAt,
  });
}

/** Resolve a checkpoint by approving or rejecting it. */
export async function resolveCheckpoint(
  options: {
    checkpointId: string;
    action: 'approve' | 'reject';
    store: CheckpointStore;
    now?: Date;
    reviewerNotes?: string;
  },
): Promise<CheckpointT | null> {
  const nowDate = options.now ?? new Date();
  const checkpoint = await options.store.load(options.checkpointId);
  if (!checkpoint) return null;

  // If already resolved, return as-is without modifying
  if (checkpoint.status !== 'pending') return checkpoint;

  const updated: CheckpointT = {
    ...checkpoint,
    status: options.action === 'approve' ? 'approved' : 'rejected',
    reviewerNotes: options.reviewerNotes,
    approvedAt: options.action === 'approve' ? nowDate.toISOString() : undefined,
    rejectedAt: options.action === 'reject' ? nowDate.toISOString() : undefined,
  };
  await options.store.save(updated);
  return updated;
}
